# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent management routes for dynamic agent creation and registration.

Provides REST API endpoints for:
- Creating new agents
- Listing agents
- Getting agent details
- Deleting agents
"""

import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from pydantic_ai import Agent as PydanticAgent
from pydantic_ai import DeferredToolRequests

from ..adapters.pydantic_ai_adapter import PydanticAIAdapter
from ..mcp import get_mcp_manager, initialize_config_mcp_servers
from ..mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from ..mcp.lifecycle import get_mcp_lifecycle_manager
from ..services import (
    create_codemode_toolset,
    create_shared_sandbox,
    create_skills_toolset,
    initialize_codemode_toolset,
    register_agent_tools,
    tools_require_approval,
    tools_requiring_approval_ids,
    wire_skills_into_codemode,
)
from ..specs.agents import AGENT_SPECS
from ..specs.agents import get_agent_spec as get_library_agent_spec
from ..specs.agents import list_agent_specs as list_library_agents
from ..specs.models import DEFAULT_MODEL
from ..transports import AGUITransport, MCPUITransport, VercelAITransport
from ..types import AgentSpec
from .a2a import A2AAgentCard, register_a2a_agent, unregister_a2a_agent
from .acp import AgentCapabilities, AgentInfo, _agents, register_agent, unregister_agent
from .agui import get_agui_app, register_agui_agent, unregister_agui_agent
from .mcp_ui import register_mcp_ui_agent, unregister_mcp_ui_agent
from .vercel_ai import register_vercel_agent, unregister_vercel_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

# Store the API prefix for dynamic mount paths
_api_prefix = "/api/v1"

# Store the original creation request (spec) for each agent, keyed by agent_id.
# This preserves the separated system_prompt and system_prompt_codemode_addons
# which are merged at agent creation time and lost in the running agent.
_agent_specs: dict[str, dict[str, Any]] = {}


def _resolve_writable_generated_path(path: str) -> str:
    """Return a writable generated folder for codemode bindings."""
    candidate = Path(path).resolve()
    fallbacks = [
        candidate,
        Path("/mnt/shared-agent/generated"),
        Path(tempfile.gettempdir()) / "agent-runtimes-generated",
    ]

    for folder in fallbacks:
        try:
            folder.mkdir(parents=True, exist_ok=True)
            probe = folder / ".write_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            if folder != candidate:
                logger.warning(
                    "Codemode generated path '%s' is not writable; using '%s'",
                    str(candidate),
                    str(folder),
                )
            return str(folder)
        except Exception:
            pass

    raise PermissionError(
        f"No writable codemode generated path found (tried: {[str(f) for f in fallbacks]})"
    )


def get_stored_agent_spec(agent_id: str) -> dict[str, Any] | None:
    """Get the original creation spec for an agent."""
    return _agent_specs.get(agent_id)


def set_api_prefix(prefix: str) -> None:
    """Set the API prefix for dynamic mount paths."""
    global _api_prefix
    _api_prefix = prefix


# ============================================================================
# Agent Spec Library Routes
# ============================================================================


@router.get("/library", response_model=list[AgentSpec])
async def get_agent_spec_library() -> list[dict[str, Any]]:
    """
    Get all available agent specifications from the library.

    Returns predefined agent templates that can be used to create new agents.
    """
    try:
        agents = list_library_agents()
        return [agent.model_dump(by_alias=True) for agent in agents]

    except Exception as e:
        logger.error(f"Error getting agent library: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/library/{agent_id:path}", response_model=AgentSpec)
async def get_agent_spec(agent_id: str) -> dict[str, Any]:
    """
    Get a specific agent specification from the library.

    Args:
        agent_id: The ID of the agent spec (e.g., 'data-acquisition', 'crawler')
    """
    try:
        agent = get_library_agent_spec(agent_id)
        if not agent:
            available = list(AGENT_SPECS.keys())
            raise HTTPException(
                status_code=404,
                detail=f"Agent '{agent_id}' not found in library. Available: {available}",
            )
        return agent.model_dump(by_alias=True)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting agent spec: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Agent Creation and Management
# ============================================================================


def _test_jupyter_sandbox(jupyter_sandbox_url: str) -> tuple[bool, str | None]:
    """
    Test connection to a Jupyter sandbox by pinging the server.

    Args:
        jupyter_sandbox_url: The Jupyter server URL with optional token

    Returns:
        Tuple of (connected: bool, error_message: str | None)
    """
    from urllib.parse import parse_qs, urlparse

    import httpx

    try:
        # Parse URL to extract base URL and token
        parsed = urlparse(jupyter_sandbox_url)
        query_params = parse_qs(parsed.query)
        token = query_params.get("token", [None])[0]

        # Reconstruct base URL without query params
        path = parsed.path
        if path.endswith("/"):
            path = path[:-1]

        base_url = f"{parsed.scheme}://{parsed.netloc}{path}"

        # Build headers with token
        headers = {}
        if token:
            headers["Authorization"] = f"token {token}"

        # Test connection by hitting the Jupyter server extension API endpoint
        # For jupyter-server extension at /api/jupyter-server, the API is at /api/jupyter-server/api
        status_url = f"{base_url}/api"
        logger.info(f"Testing Jupyter connection at: {status_url}")

        with httpx.Client(timeout=10.0) as client:
            response = client.get(status_url, headers=headers, follow_redirects=True)

            if response.status_code == 200:
                logger.info(f"Jupyter sandbox ping successful: {base_url}")
                return True, None
            elif response.status_code == 401 or response.status_code == 403:
                return (
                    False,
                    f"Authentication failed (HTTP {response.status_code}) - check your token",
                )
            else:
                return False, f"Jupyter server returned HTTP {response.status_code}"

    except httpx.ConnectError:
        return False, f"Connection refused - is Jupyter running at {base_url}?"
    except httpx.TimeoutException:
        return False, "Connection timeout - Jupyter server not responding"
    except Exception as e:
        return False, f"Connection error: {str(e)}"


def _build_codemode_toolset(
    request: "CreateAgentRequest",
    http_request: Request,
    agent_id: str,
    sandbox: Any | None = None,
    disable_mcp_servers: bool = False,
) -> Any:
    """
    Create a CodemodeToolset based on request flags and app configuration.

    Follows the pattern from agent-codemode/examples/agent/agent_cli.py:
    - Configures workspace, generated, and skills paths
    - Disables discovery tools by default to reduce LLM calls
    - Sets up proper CodeModeConfig with all required paths

    Args:
        request: The CreateAgentRequest with configuration options.
        http_request: The FastAPI request object for accessing app state.
        sandbox: Optional pre-configured sandbox to share with other toolsets.
    """
    if not request.enable_codemode:
        return None

    # Configure paths for codemode environment
    repo_root = Path(__file__).resolve().parents[2]
    workspace_path = getattr(
        http_request.app.state,
        "codemode_workspace_path",
        str((repo_root / "workspace").resolve()),
    )
    generated_path = getattr(
        http_request.app.state,
        "codemode_generated_path",
        str((repo_root / "generated").resolve()),
    )
    generated_path = _resolve_writable_generated_path(generated_path)
    skills_path = getattr(
        http_request.app.state,
        "codemode_skills_path",
        str((repo_root / "skills").resolve()),
    )

    # Get MCP proxy URL from environment or sandbox manager
    mcp_proxy_url = os.getenv("AGENT_RUNTIMES_MCP_PROXY_URL")
    if not mcp_proxy_url:
        try:
            from ..services.code_sandbox_manager import get_code_sandbox_manager

            manager_status = get_code_sandbox_manager().get_status()
            mcp_proxy_url = manager_status.get("mcp_proxy_url")
            logger.info(
                f"Got mcp_proxy_url from sandbox manager: {mcp_proxy_url} (status={manager_status})"
            )
        except Exception as e:
            logger.warning(f"Could not get mcp_proxy_url from sandbox manager: {e}")

    if mcp_proxy_url:
        logger.info(f"Using MCP proxy URL for codemode: {mcp_proxy_url}")
    else:
        logger.warning("No MCP proxy URL configured - HTTP proxy mode disabled")

    allow_direct = (
        request.allow_direct_tool_calls
        if request.allow_direct_tool_calls is not None
        else False
    )

    # Get MCP servers from manager
    if disable_mcp_servers:
        servers = []
        logger.info("Building codemode registry with MCP disabled (0 servers)")
    else:
        mcp_manager = get_mcp_manager()
        servers = mcp_manager.get_servers()
        logger.info(f"Building codemode registry from {len(servers)} available servers")

    if request.selected_mcp_servers:
        # Extract server IDs from McpServerSelection objects
        selected_ids = {
            s.id if hasattr(s, "id") else s for s in request.selected_mcp_servers
        }
        servers = [server for server in servers if server.id in selected_ids]
        logger.info(f"Filtered to {len(servers)} selected servers: {selected_ids}")

    # Use factory to create codemode toolset
    async def _notify_status_change(_is_executing: bool) -> None:
        try:
            from .configure import notify_sandbox_status_change

            await notify_sandbox_status_change(agent_id=agent_id)
        except Exception as exc:
            logger.debug(
                "Failed to notify sandbox status change for agent %s: %s",
                agent_id,
                exc,
            )

    return create_codemode_toolset(
        mcp_servers=servers,
        workspace_path=workspace_path,
        generated_path=generated_path,
        skills_path=skills_path,
        allow_direct_tool_calls=allow_direct,
        shared_sandbox=sandbox,
        mcp_proxy_url=mcp_proxy_url,
        enable_discovery_tools=True,
        status_change_callback=_notify_status_change,
    )


# Type alias for MCP server identifier
McpId = str

# Type alias for MCP server origin
McpOrigin = Literal["config", "catalog"]


class McpServerSelection(BaseModel):
    """
    Selection of an MCP server with its origin.

    Attributes:
        id: Unique identifier of the MCP server (McpId)
        origin: Origin of the server - 'config' (from mcp.json) or 'catalog' (built-in)
    """

    id: McpId = Field(..., description="The server identifier", alias="id")
    origin: McpOrigin = Field(
        default="config",
        description="Origin of the server (config from mcp.json, catalog from built-in)",
    )

    model_config = {"populate_by_name": True}


class CreateAgentRequest(BaseModel):
    """Request body for creating a new agent."""

    name: str = Field(..., description="Agent name")
    description: str = Field(default="", description="Agent description")
    goal: str | None = Field(
        default=None,
        description="User-facing objective for the agent. Used as system prompt if system_prompt is not provided.",
    )
    agent_library: Literal["pydantic-ai", "langchain", "openai"] = Field(
        default="pydantic-ai", description="Agent library to use"
    )
    transport: Literal["ag-ui", "vercel-ai", "acp", "a2a"] = Field(
        default="vercel-ai", description="Transport protocol to use"
    )
    model: str = Field(
        default=DEFAULT_MODEL.value,
        description="Model to use",
    )
    system_prompt: str = Field(
        default="You are a helpful AI assistant.",
        description="System prompt for the agent",
    )
    system_prompt_codemode_addons: str | None = Field(
        default=None,
        description="Additional system prompt for codemode (appended when enable_codemode=True)",
    )
    enable_skills: bool = Field(
        default=False,
        description="Enable agent-skills toolset for reusable skill compositions",
    )
    skills: list[str] = Field(
        default_factory=list,
        description="Selected skill names to enable for this agent",
    )
    tools: list[str] = Field(
        default_factory=list,
        description="Selected runtime tool IDs to enable for this agent",
    )
    enable_codemode: bool = Field(
        default=False,
        description="Enable agent-codemode toolset for code-based tool composition",
    )
    allow_direct_tool_calls: bool | None = Field(
        default=None,
        description="Override direct tool call policy for codemode (None uses defaults)",
    )
    enable_tool_reranker: bool = Field(
        default=False,
        description="Enable optional tool reranker hook for codemode discovery",
    )
    selected_mcp_servers: list[McpServerSelection] = Field(
        default_factory=list, description="List of MCP server selections to include."
    )
    jupyter_sandbox: str | None = Field(
        default=None,
        description="Jupyter server URL with token for code sandbox (e.g., http://localhost:8888?token=xxx). If provided, codemode will use Jupyter kernel instead of local-eval sandbox.",
    )
    sandbox_variant: str | None = Field(
        default=None,
        description=(
            "Sandbox variant to use for this agent.  "
            "Accepted values: 'local-eval' (in-process Python exec, default), "
            "'jupyter' (starts a Jupyter server per agent via code_sandboxes), "
            "'local-jupyter' (connects to an existing Jupyter server — requires jupyter_sandbox URL)."
        ),
    )
    agent_spec_id: str | None = Field(
        default=None,
        description="ID of a library agent spec to use as base configuration. When provided, the spec's system_prompt, system_prompt_codemode_addons, skills, and MCP servers are used as defaults (request fields can override).",
    )
    agent_spec: dict[str, Any] | None = Field(
        default=None,
        description="Optional complete agent spec payload forwarded by the UI. Used to prefill fields when creating from a library spec.",
    )


class CreateAgentResponse(BaseModel):
    """Response after creating an agent."""

    id: str
    name: str
    description: str
    transport: str
    status: str = "running"


class AgentListResponse(BaseModel):
    """Response for listing agents."""

    agents: list[dict[str, Any]]


@router.post("", response_model=CreateAgentResponse)
async def create_agent(
    request: CreateAgentRequest, http_request: Request
) -> CreateAgentResponse:
    """
    Create and register a new agent.

    This endpoint dynamically creates an agent based on the specified
    configuration and registers it with the appropriate transport protocols.

    Args:
        request: Agent creation parameters.
        http_request: The HTTP request object (to access the FastAPI app).

    Returns:
        Information about the created agent.

    Raises:
        HTTPException: If agent creation fails.
    """
    # Generate agent ID from name (lowercase, replace spaces with hyphens)
    agent_id = request.name.lower().replace(" ", "-")

    # Check if agent already exists
    if agent_id in _agents:
        raise HTTPException(
            status_code=409, detail=f"Agent with ID '{agent_id}' already exists"
        )

    try:
        selected_mcp_servers_explicit = (
            "selected_mcp_servers" in request.model_fields_set
        )
        # Detect when the caller explicitly passed enable_skills=false so spec
        # skills are not auto-applied (e.g. sandbox demo that wants codemode only).
        caller_disabled_skills = (
            "enable_skills" in request.model_fields_set and not request.enable_skills
        )
        # Detect when the caller explicitly passed tools=[] so spec tools are
        # not auto-applied (e.g. sandbox demo that wants no pre-built tools).
        caller_disabled_tools = (
            "tools" in request.model_fields_set and len(request.tools) == 0
        )

        # Normalize optional UI-forwarded spec payload to make applying defaults easier.
        # This accepts both camelCase and snake_case keys.
        forwarded_spec = request.agent_spec or {}

        def _spec_value(*keys: str) -> Any:
            for key in keys:
                if key in forwarded_spec and forwarded_spec[key] is not None:
                    return forwarded_spec[key]
            return None

        # If an agent_spec_id is provided, load the library spec and apply
        # its fields as defaults (request fields take precedence for overrides).
        if request.agent_spec_id:
            spec = get_library_agent_spec(request.agent_spec_id)
            if not spec:
                raise HTTPException(
                    status_code=404,
                    detail=f"Agent spec '{request.agent_spec_id}' not found in library.",
                )
            logger.info(
                f"Using library spec '{request.agent_spec_id}' for agent '{agent_id}'"
            )
            # Apply spec defaults — only override fields the caller did not set.
            if (
                request.system_prompt == "You are a helpful AI assistant."
                and spec.system_prompt
            ):
                request.system_prompt = spec.system_prompt
            # Goal/system_prompt consolidation: if no explicit system_prompt
            # was set and the spec has a goal, use goal as system_prompt.
            if (
                request.system_prompt == "You are a helpful AI assistant."
                and not spec.system_prompt
                and spec.goal
            ):
                request.system_prompt = spec.goal
            if request.goal is None and spec.goal:
                request.goal = spec.goal
            if (
                request.system_prompt_codemode_addons is None
                and spec.system_prompt_codemode_addons
            ):
                request.system_prompt_codemode_addons = (
                    spec.system_prompt_codemode_addons
                )
            if not request.skills and spec.skills and not caller_disabled_skills:
                request.skills = spec.skills
            if not request.tools and spec.tools and not caller_disabled_tools:
                request.tools = spec.tools
            if spec.system_prompt_codemode_addons and not request.enable_codemode:
                request.enable_codemode = True
            if spec.skills and not request.enable_skills and not caller_disabled_skills:
                request.enable_skills = True
            if not request.description and spec.description:
                request.description = spec.description
            # Use the model from the spec if the request still has the default
            if request.model == DEFAULT_MODEL.value and spec.model:
                request.model = spec.model
            # Use the sandbox_variant from the spec if not set in the request
            if not request.sandbox_variant and spec.sandbox_variant:
                request.sandbox_variant = spec.sandbox_variant
            # Apply protocol/transport from spec when request keeps default
            if request.transport == "vercel-ai" and spec.protocol in {
                "ag-ui",
                "vercel-ai",
                "acp",
                "a2a",
            }:
                request.transport = spec.protocol  # type: ignore[assignment]
            # Apply MCP servers from spec when not explicitly selected
            if (
                not selected_mcp_servers_explicit
                and not request.selected_mcp_servers
                and spec.mcp_servers
            ):
                request.selected_mcp_servers = [
                    McpServerSelection(id=server.id, origin="config")
                    for server in spec.mcp_servers
                ]
            # Apply codemode defaults from spec codemode block
            if isinstance(spec.codemode, dict):
                codemode_cfg = spec.codemode
                if not request.enable_codemode and bool(codemode_cfg.get("enabled")):
                    request.enable_codemode = True
                if request.allow_direct_tool_calls is None:
                    direct_calls = codemode_cfg.get(
                        "allow_direct_tool_calls",
                        codemode_cfg.get("allowDirectToolCalls"),
                    )
                    if isinstance(direct_calls, bool):
                        request.allow_direct_tool_calls = direct_calls
                if not request.enable_tool_reranker:
                    reranker = codemode_cfg.get(
                        "enable_tool_reranker",
                        codemode_cfg.get("enableToolReranker"),
                    )
                    if isinstance(reranker, bool):
                        request.enable_tool_reranker = reranker

        # Apply defaults from forwarded full spec payload when request fields
        # are still unset/defaulted.
        if forwarded_spec:
            if not request.description:
                request.description = _spec_value("description") or request.description
            if request.goal is None:
                request.goal = _spec_value("goal")
            if request.model == DEFAULT_MODEL.value:
                request.model = _spec_value("model") or request.model
            if request.system_prompt == "You are a helpful AI assistant.":
                request.system_prompt = (
                    _spec_value("systemPrompt", "system_prompt")
                    or request.system_prompt
                )
            if request.system_prompt_codemode_addons is None:
                request.system_prompt_codemode_addons = _spec_value(
                    "systemPromptCodemodeAddons", "system_prompt_codemode_addons"
                )
            if not request.skills:
                raw_skills = _spec_value("skills")
                if isinstance(raw_skills, list):
                    request.skills = [str(s) for s in raw_skills]
            if not request.tools:
                raw_tools = _spec_value("tools")
                if isinstance(raw_tools, list):
                    request.tools = [str(t) for t in raw_tools]
            if not request.sandbox_variant:
                request.sandbox_variant = _spec_value(
                    "sandboxVariant", "sandbox_variant"
                )
            if request.transport == "ag-ui":
                protocol = _spec_value("protocol")
                if protocol in {"ag-ui", "vercel-ai", "acp", "a2a"}:
                    request.transport = protocol
            if not selected_mcp_servers_explicit and not request.selected_mcp_servers:
                raw_servers = _spec_value("mcpServers", "mcp_servers")
                if isinstance(raw_servers, list):
                    selected_servers: list[McpServerSelection] = []
                    for server in raw_servers:
                        if isinstance(server, dict) and server.get("id"):
                            raw_origin = str(server.get("origin", "config"))
                            origin: McpOrigin = (
                                "catalog" if raw_origin == "catalog" else "config"
                            )
                            selected_servers.append(
                                McpServerSelection(
                                    id=str(server.get("id")),
                                    origin=origin,
                                )
                            )
                    request.selected_mcp_servers = selected_servers
            codemode_cfg = _spec_value("codemode")
            if isinstance(codemode_cfg, dict):
                if not request.enable_codemode and bool(codemode_cfg.get("enabled")):
                    request.enable_codemode = True
                if request.allow_direct_tool_calls is None:
                    direct_calls = codemode_cfg.get(
                        "allow_direct_tool_calls",
                        codemode_cfg.get("allowDirectToolCalls"),
                    )
                    if isinstance(direct_calls, bool):
                        request.allow_direct_tool_calls = direct_calls
                if not request.enable_tool_reranker:
                    reranker = codemode_cfg.get(
                        "enable_tool_reranker",
                        codemode_cfg.get("enableToolReranker"),
                    )
                    if isinstance(reranker, bool):
                        request.enable_tool_reranker = reranker

        # Build list of non-MCP toolsets (skills, codemode, etc.)
        # MCP toolsets will be dynamically fetched at run time by the adapter
        non_mcp_toolsets = []

        # Determine which MCP servers to use and ensure they are running
        # These will be dynamically fetched at run time, not stored at creation time
        selected_mcp_servers = request.selected_mcp_servers or []

        # When codemode is NOT enabled, we start the servers explicitly here
        # When codemode IS enabled, the servers are started via _build_codemode_toolset
        if not request.enable_codemode and selected_mcp_servers:
            logger.info(
                f"Agent {agent_id} will use MCP servers: {selected_mcp_servers}"
            )

            # Start any MCP servers that aren't already running
            lifecycle_manager = get_mcp_lifecycle_manager()

            for item in selected_mcp_servers:
                server_id = item.id
                is_config = item.origin == "config"
                if not server_id:
                    continue

                if not lifecycle_manager.is_server_running(
                    server_id, is_config=is_config
                ):
                    # Start matching server type
                    started = False

                    # 1. Try Config Server (mcp.json)
                    if (is_config is None or is_config is True) and not started:
                        config_server = lifecycle_manager.get_server_config_from_file(
                            server_id
                        )
                        if config_server:
                            logger.info(
                                f"Starting Config MCP server '{server_id}' for agent {agent_id}"
                            )
                            instance = await lifecycle_manager.start_server(
                                server_id, config_server
                            )
                            if instance:
                                started = True
                                logger.info(f"Started Config MCP server '{server_id}'")

                    # 2. Try Catalog Server
                    if (is_config is None or is_config is False) and not started:
                        catalog_server = MCP_SERVER_CATALOG.get(server_id)
                        if catalog_server:
                            logger.info(
                                f"Starting Catalog MCP server '{server_id}' for agent {agent_id}"
                            )
                            instance = await lifecycle_manager.start_server(
                                server_id, catalog_server
                            )
                            if instance:
                                started = True
                                logger.info(f"Started Catalog MCP server '{server_id}'")

                    if not started:
                        failed = lifecycle_manager.get_failed_servers()
                        error = failed.get(server_id, "Unknown error")
                        logger.warning(f"Failed to start MCP server '{item}': {error}")
                else:
                    logger.info(f"MCP server '{server_id}' already running")

        # Configure sandbox manager if jupyter_sandbox is provided
        # This must happen BEFORE creating any sandboxes
        if request.jupyter_sandbox:
            try:
                from ..services.code_sandbox_manager import get_code_sandbox_manager

                sandbox_manager = get_code_sandbox_manager()
                # Env vars from the request body are not available here;
                # they are injected later by the companion via /mcp-servers/start
                sandbox_manager.configure_from_url(request.jupyter_sandbox)
                logger.info(
                    f"Configured sandbox manager for Jupyter: {request.jupyter_sandbox.split('?')[0]}"
                )

                # Validate the Jupyter connection by running a ping execution
                jupyter_connected, jupyter_error = _test_jupyter_sandbox(
                    request.jupyter_sandbox
                )
                if not jupyter_connected:
                    logger.error(
                        f"JUPYTER SANDBOX CONNECTION FAILED for agent '{agent_id}': {jupyter_error}. "
                        f"URL: {request.jupyter_sandbox.split('?')[0]}. "
                        f"Please ensure Jupyter server is running and accessible."
                    )
                    raise HTTPException(
                        status_code=503,
                        detail=f"Failed to connect to Jupyter sandbox: {jupyter_error}. Please ensure Jupyter server is running.",
                    )
                else:
                    logger.info(
                        f"Successfully validated Jupyter sandbox connection for agent '{agent_id}'"
                    )

            except HTTPException:
                raise  # Re-raise HTTP exceptions
            except ImportError as e:
                logger.warning(
                    f"code_sandboxes not installed, cannot configure Jupyter sandbox: {e}"
                )
            except Exception as e:
                logger.error(f"Failed to configure Jupyter sandbox: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to configure Jupyter sandbox: {str(e)}",
                )

        # Determine the effective sandbox variant
        effective_variant = request.sandbox_variant or (
            "local-jupyter" if request.jupyter_sandbox else "local-eval"
        )

        # When a sandbox variant is explicitly requested, eagerly ensure a sandbox
        # is configured and started for that variant even if no MCP servers are
        # selected. This guarantees that sandbox status/WS reflects availability.
        if request.sandbox_variant:
            try:
                from ..services.code_sandbox_manager import get_code_sandbox_manager

                sandbox_manager = get_code_sandbox_manager()

                if effective_variant == "jupyter":
                    sandbox_manager.create_agent_sandbox(
                        agent_id=agent_id,
                        variant="jupyter",
                    )
                    logger.info(
                        "Eager-started per-agent jupyter sandbox for '%s'",
                        agent_id,
                    )
                elif effective_variant == "local-jupyter":
                    if not request.jupyter_sandbox:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "jupyter_sandbox is required when sandbox_variant is 'local-jupyter'"
                            ),
                        )
                    # jupyter_sandbox URL is already applied above via configure_from_url.
                    sandbox_manager.get_sandbox()
                    logger.info("Eager-started local-jupyter sandbox")
                else:
                    # local-eval
                    sandbox_manager.configure(variant="local-eval")
                    sandbox_manager.get_sandbox()
                    logger.info("Eager-started local-eval sandbox")
            except HTTPException:
                raise
            except ImportError as e:
                logger.warning(
                    "code_sandboxes not installed, cannot eager-start sandbox: %s",
                    e,
                )
            except Exception as e:
                if "already has a sandbox" in str(e):
                    logger.info(
                        "Sandbox already exists for '%s', reusing it", agent_id
                    )
                else:
                    logger.error("Failed to eager-start sandbox for '%s': %s", agent_id, e)
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to initialize sandbox variant '{effective_variant}': {str(e)}",
                    )

        # Create shared sandbox for codemode and/or skills toolsets
        # This ensures state persistence between execute_code and skill script executions
        shared_sandbox = None
        skills_enabled = request.enable_skills or len(request.skills) > 0
        need_shared_sandbox = (
            (request.enable_codemode and skills_enabled)  # Both codemode and skills
            or (
                request.enable_codemode and request.jupyter_sandbox
            )  # Codemode with Jupyter
            or (
                request.enable_codemode and effective_variant == "jupyter"
            )  # Codemode with jupyter variant
            or (
                request.enable_codemode and bool(request.sandbox_variant)
            )  # Codemode with any explicit sandbox variant
        )
        if need_shared_sandbox:
            if effective_variant == "jupyter":
                # Delegate to code_sandboxes: create a per-agent sandbox
                # that starts its own Jupyter server on a random free port.
                try:
                    from ..services.code_sandbox_manager import get_code_sandbox_manager

                    sandbox_manager = get_code_sandbox_manager()
                    agent_sandbox = sandbox_manager.create_agent_sandbox(
                        agent_id=agent_id,
                        variant="jupyter",
                    )
                    # Wrap in ManagedSandbox-like interface for compatibility
                    shared_sandbox = agent_sandbox
                    logger.info(f"Created per-agent Jupyter sandbox for '{agent_id}'")
                except ImportError as e:
                    logger.warning(
                        f"code_sandboxes not installed, falling back to local-eval: {e}"
                    )
                    shared_sandbox = create_shared_sandbox(None)
                except Exception as e:
                    if "already has a sandbox" in str(e):
                        # Reuse existing sandbox from eager-start
                        sandbox_manager = get_code_sandbox_manager()
                        shared_sandbox = sandbox_manager.get_agent_sandbox(agent_id)
                        logger.info(
                            f"Reusing existing Jupyter sandbox for '{agent_id}'"
                        )
                    else:
                        logger.error(
                            f"Failed to create Jupyter sandbox for agent '{agent_id}': {e}"
                        )
                        raise HTTPException(
                            status_code=500,
                            detail=f"Failed to create Jupyter sandbox: {str(e)}",
                        )
            else:
                shared_sandbox = create_shared_sandbox(request.jupyter_sandbox)

        # Add skills toolset if enabled
        if skills_enabled:
            repo_root = Path(__file__).resolve().parents[2]
            skills_path = getattr(
                http_request.app.state,
                "codemode_skills_path",
                str((repo_root / "skills").resolve()),
            )

            skills_toolset = create_skills_toolset(
                skills=request.skills,
                skills_path=skills_path,
                shared_sandbox=shared_sandbox,
            )
            if skills_toolset:
                non_mcp_toolsets.append(skills_toolset)
                logger.info(f"Added AgentSkillsToolset for agent {agent_id}")

        # Add codemode toolset if enabled
        if request.enable_codemode:
            disable_mcp_for_codemode = (
                selected_mcp_servers_explicit
                and len(request.selected_mcp_servers) == 0
            )
            # Ensure MCP servers are loaded before building codemode toolset
            mcp_manager = get_mcp_manager()
            if not disable_mcp_for_codemode and not mcp_manager.get_servers():
                mcp_servers = await initialize_config_mcp_servers(discover_tools=True)
                mcp_manager.load_servers(mcp_servers)
                logger.info(
                    f"Loaded {len(mcp_servers)} MCP servers for codemode agent {agent_id}"
                )
            codemode_toolset = _build_codemode_toolset(
                request,
                http_request,
                agent_id=agent_id,
                sandbox=shared_sandbox,
                disable_mcp_servers=disable_mcp_for_codemode,
            )
            if codemode_toolset is not None:
                await initialize_codemode_toolset(codemode_toolset)

                try:
                    generated_root = Path(codemode_toolset.config.generated_path)
                    mcp_dir = generated_root / "mcp"
                    if mcp_dir.exists():
                        server_modules = sorted(
                            p.name
                            for p in mcp_dir.iterdir()
                            if p.is_dir() and not p.name.startswith("__")
                        )
                        logger.info(
                            "Codemode bindings generated for MCP servers: %s",
                            server_modules or "(none)",
                        )
                    else:
                        logger.warning(
                            "Codemode generated MCP directory not found: %s",
                            mcp_dir,
                        )
                except Exception as exc:
                    logger.warning(
                        "Failed to list generated codemode bindings: %s",
                        exc,
                    )
                non_mcp_toolsets.append(codemode_toolset)
                logger.info(
                    f"Added and initialized CodemodeToolset for agent {agent_id}"
                )

        # Wire skill bindings into codemode so execute_code can import
        # from generated.skills and compose skills programmatically
        skills_prompt_section = ""
        if request.enable_codemode and skills_enabled:
            _skills_ts = next(
                (
                    t
                    for t in non_mcp_toolsets
                    if type(t).__name__ == "AgentSkillsToolset"
                ),
                None,
            )
            _codemode_ts = next(
                (t for t in non_mcp_toolsets if type(t).__name__ == "CodemodeToolset"),
                None,
            )
            if _skills_ts and _codemode_ts:
                skills_prompt_section = wire_skills_into_codemode(
                    _codemode_ts, _skills_ts
                )

        logger.info(
            f"Creating agent '{agent_id}' with selected_mcp_servers={selected_mcp_servers}"
        )

        # Build the system prompt
        # If codemode is enabled, append codemode instructions to the base prompt
        final_system_prompt = request.system_prompt
        if request.enable_codemode and request.system_prompt_codemode_addons:
            final_system_prompt = (
                request.system_prompt + "\n\n" + request.system_prompt_codemode_addons
            )
        # Append dynamic skills section so the LLM has visibility into
        # installed skills, their scripts, parameters, and usage.
        if skills_prompt_section:
            final_system_prompt = final_system_prompt + "\n\n" + skills_prompt_section

        # Create the agent based on the library
        if request.agent_library == "pydantic-ai":
            # First create the underlying Pydantic AI Agent
            # NOTE: We don't pass MCP toolsets here. They will be dynamically
            # fetched at run time by the adapter to reflect current server state.
            # Only non-MCP toolsets (codemode, skills) are passed at construction.
            tool_ids = list(request.tools or [])
            agent_kwargs: dict[str, Any] = {
                "system_prompt": final_system_prompt,
                # Explicitly disable Pydantic AI built-in tools (e.g. CodeExecutionTool)
                "builtin_tools": (),
                # Don't pass toolsets here - they'll be dynamically provided at run time
            }
            approval_tool_ids = tools_requiring_approval_ids(tool_ids)
            if tools_require_approval(tool_ids):
                agent_kwargs["output_type"] = [str, DeferredToolRequests]
                # Increase retries: the union output_type [str, DeferredToolRequests]
                # can intermittently fail pydantic-ai's output validator on the final
                # text response, causing "Exceeded maximum retries (1)" with the default.
                agent_kwargs["output_retries"] = 3
                logger.info(
                    "Auto-enabled DeferredToolRequests for agent '%s'; tools requiring approval: %s",
                    agent_id,
                    approval_tool_ids,
                )

            pydantic_agent = PydanticAgent(request.model, **agent_kwargs)

            # Register runtime tools declared in the request/spec.
            register_agent_tools(
                pydantic_agent,
                tool_ids,
                agent_id=agent_id,
            )

            # Wrap with DBOS durable execution if enabled
            durable_lifecycle = getattr(
                http_request.app.state, "durable_lifecycle", None
            )
            if durable_lifecycle and durable_lifecycle.is_healthy():
                try:
                    from ..durable import DurableConfig, wrap_agent_durable

                    # Check if the agent spec requests durable execution
                    spec = (
                        get_library_agent_spec(request.agent_spec_id)
                        if request.agent_spec_id
                        else None
                    )
                    spec_advanced = getattr(spec, "advanced", None) if spec else None
                    durable_cfg = DurableConfig.from_agent_spec(spec_advanced)
                    if durable_cfg.enabled:
                        pydantic_agent = wrap_agent_durable(
                            pydantic_agent, agent_id=agent_id
                        )
                        logger.info(
                            f"Agent '{agent_id}' wrapped with DBOS durable execution"
                        )
                except Exception as exc:
                    logger.warning(
                        f"Failed to wrap agent '{agent_id}' with DBOS — continuing without durability: {exc}"
                    )

            # Then wrap it with our adapter (pass agent_id for usage tracking)
            # The adapter will dynamically fetch MCP toolsets at run time
            logger.info(
                f"Creating PydanticAIAdapter for '{agent_id}' with MCP servers: {selected_mcp_servers}"
            )

            # Create a codemode builder function if codemode is enabled
            # This allows rebuilding the codemode toolset when MCP servers change
            codemode_builder = None
            if request.enable_codemode:
                disable_mcp_for_codemode = (
                    selected_mcp_servers_explicit
                    and len(request.selected_mcp_servers) == 0
                )

                def rebuild_codemode(new_servers: list[str | dict[str, str]]) -> Any:
                    """Rebuild codemode toolset with new MCP server selection.

                    Uses a ManagedSandbox proxy so the rebuilt toolset
                    automatically tracks any sandbox reconfiguration.
                    """
                    # Create a temporary request object with new servers
                    import copy

                    temp_request = copy.copy(request)
                    temp_request.selected_mcp_servers = new_servers  # type: ignore[assignment]

                    # Use a managed sandbox proxy so the rebuilt toolset
                    # always delegates to the manager's current sandbox
                    fresh_sandbox = None
                    try:
                        from ..services.code_sandbox_manager import (
                            get_code_sandbox_manager,
                        )

                        sandbox_manager = get_code_sandbox_manager()
                        fresh_sandbox = sandbox_manager.get_managed_sandbox()
                        logger.info(
                            f"Rebuild codemode using managed sandbox proxy (variant={sandbox_manager.variant})"
                        )
                    except ImportError as e:
                        logger.warning(f"code_sandboxes not available: {e}")

                    return _build_codemode_toolset(
                        temp_request,
                        http_request,
                        agent_id=agent_id,
                        sandbox=fresh_sandbox,
                        disable_mcp_servers=disable_mcp_for_codemode,
                    )

                # Wrap to register a post-init callback for skill re-wiring
                _original_rebuild = rebuild_codemode

                def rebuild_codemode_with_skills(
                    new_servers: list[str | dict[str, str]],
                ) -> Any:
                    new_ts = _original_rebuild(new_servers)
                    if new_ts is not None and skills_enabled:
                        _sk = next(
                            (
                                t
                                for t in non_mcp_toolsets
                                if type(t).__name__ == "AgentSkillsToolset"
                            ),
                            None,
                        )
                        if _sk is not None:
                            new_ts.add_post_init_callback(
                                lambda ts, st=_sk: wire_skills_into_codemode(ts, st)
                            )
                    return new_ts

                codemode_builder = rebuild_codemode_with_skills

            agent = PydanticAIAdapter(
                agent=pydantic_agent,
                name=request.name,
                description=request.description,
                agent_id=agent_id,
                selected_mcp_servers=selected_mcp_servers,
                non_mcp_toolsets=non_mcp_toolsets,
                codemode_builder=codemode_builder,
            )
        elif request.agent_library == "langchain":
            # TODO: Implement LangChain agent creation
            raise HTTPException(
                status_code=501, detail="LangChain agent creation not yet implemented"
            )
        elif request.agent_library == "openai":
            # TODO: Implement OpenAI agent creation
            raise HTTPException(
                status_code=501, detail="OpenAI agent creation not yet implemented"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown agent library: {request.agent_library}",
            )

        # Create agent info
        info = AgentInfo(
            id=agent_id,
            name=request.name,
            description=request.description,
            capabilities=AgentCapabilities(
                streaming=True,
                tool_calling=True,
                code_execution=False,
            ),
        )

        # Register with ACP (base registration)
        register_agent(agent, info)
        logger.info(
            f"POST /agents: Registered agent '{agent_id}' in _agents. All registered: {list(_agents.keys())}"
        )

        # Store the original creation spec (preserves separated system prompts)
        _agent_specs[agent_id] = request.model_dump()
        logger.info(f"Stored creation spec for agent '{agent_id}'")

        # Register with context session for snapshot lookups (enables usage tracking)
        from ..context.session import register_agent as register_agent_for_context

        register_agent_for_context(
            agent_id, agent, {"name": request.name, "description": request.description}
        )
        logger.info(f"Registered agent '{agent_id}' for context snapshots")

        # Determine whether the agent spec declares frontend tools
        _lib_spec = (
            get_library_agent_spec(request.agent_spec_id)
            if request.agent_spec_id
            else None
        )
        has_spec_frontend_tools = bool(
            (_lib_spec and getattr(_lib_spec, "frontend_tools", None))
            or _spec_value("frontendTools", "frontend_tools")
        )

        # Register with the specified transport
        if request.transport == "ag-ui":
            try:
                agui_adapter = AGUITransport(agent, agent_id=agent_id)
                register_agui_agent(agent_id, agui_adapter)
                logger.info(f"Registered agent with AG-UI: {agent_id}")

                # Dynamically add the AG-UI mount to the FastAPI app
                agui_app = get_agui_app(agent_id)
                if agui_app and http_request.app:
                    # Mount path should NOT have trailing slash - Starlette Mount handles that
                    mount_path = f"{_api_prefix}/ag-ui/{agent_id}"
                    # Use app.mount() for proper dynamic route registration
                    # This is more reliable than manually manipulating app.routes
                    http_request.app.mount(
                        mount_path, agui_app, name=f"agui-{agent_id}"
                    )
                    logger.info(f"Dynamically mounted AG-UI route: {mount_path}/")
            except Exception as e:
                logger.warning(f"Could not register with AG-UI: {e}")

        elif request.transport == "vercel-ai":
            try:
                vercel_adapter = VercelAITransport(
                    agent,
                    agent_id=agent_id,
                    has_spec_frontend_tools=has_spec_frontend_tools,
                )
                register_vercel_agent(agent_id, vercel_adapter)
                logger.info(f"Registered agent with Vercel AI: {agent_id}")
            except Exception as e:
                logger.warning(f"Could not register with Vercel AI: {e}")

        elif request.transport == "a2a":
            try:
                # Use the request's base URL to construct the A2A endpoint
                base_url = str(http_request.base_url).rstrip("/")
                a2a_card = A2AAgentCard(
                    id=agent_id,
                    name=request.name,
                    description=request.description or "Dynamic agent",
                    url=f"{base_url}{_api_prefix}/a2a/agents/{agent_id}",
                    version="1.0.0",
                )
                register_a2a_agent(agent, a2a_card)
                logger.info(f"Registered agent with A2A: {agent_id}")
            except Exception as e:
                logger.warning(f"Could not register with A2A: {e}")

        # ACP is already registered above

        # Also register with MCP-UI for tools
        try:
            mcp_ui_adapter = MCPUITransport(agent)
            register_mcp_ui_agent(agent_id, mcp_ui_adapter)
            logger.info(f"Registered agent with MCP-UI: {agent_id}")
        except Exception as e:
            logger.warning(f"Could not register with MCP-UI: {e}")

        logger.info(f"Created agent: {agent_id} ({request.name})")

        return CreateAgentResponse(
            id=agent_id,
            name=request.name,
            description=request.description,
            transport=request.transport,
            status="running",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create agent: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create agent: {str(e)}")


def _get_agent_toolsets_info(agent: Any) -> dict[str, Any]:
    """
    Extract toolset information from an agent adapter.

    Args:
        agent: The agent adapter (e.g., PydanticAIAdapter)

    Returns:
        Dictionary with toolset details including:
        - mcp_servers: List of selected MCP server IDs
        - codemode: Whether codemode is enabled
        - skills: List of skill names if available
        - toolset_count: Total number of toolsets
        - tools: List of tool definitions
        - tools_count: Number of tools available
    """
    toolsets_info: dict[str, Any] = {
        "mcp_servers": [],
        "codemode": False,
        "skills": [],
        "toolset_count": 0,
        "tools": [],
        "tools_count": 0,
    }

    try:
        # Get selected MCP servers
        if hasattr(agent, "selected_mcp_server_ids"):
            toolsets_info["mcp_servers"] = agent.selected_mcp_server_ids
        elif hasattr(agent, "_selected_mcp_servers"):
            toolsets_info["mcp_servers"] = [
                getattr(s, "id", str(s)) for s in agent._selected_mcp_servers
            ]

        # Check for non-MCP toolsets
        non_mcp_toolsets = getattr(agent, "_non_mcp_toolsets", [])
        for toolset in non_mcp_toolsets:
            toolset_class = type(toolset).__name__

            # Check for CodemodeToolset
            if "Codemode" in toolset_class:
                toolsets_info["codemode"] = True

            # Check for AgentSkillsToolset
            if "Skills" in toolset_class:
                # Try to get skill names
                skills = getattr(toolset, "skills", [])
                if skills:
                    toolsets_info["skills"] = [
                        {
                            "name": getattr(s, "name", str(s)),
                            "description": getattr(s, "description", ""),
                        }
                        for s in skills
                    ]

        # Get tools from the agent
        if hasattr(agent, "agent") and hasattr(agent.agent, "_function_tools"):
            tools = agent.agent._function_tools
            tool_list = []
            for tool_name, tool_def in tools.items():
                tool_info = {
                    "name": tool_name,
                    "description": getattr(tool_def, "description", ""),
                }
                tool_list.append(tool_info)
            toolsets_info["tools"] = tool_list
            toolsets_info["tools_count"] = len(tool_list)

        # Calculate total toolset count
        mcp_count = len(toolsets_info["mcp_servers"])
        non_mcp_count = len(non_mcp_toolsets)
        toolsets_info["toolset_count"] = mcp_count + non_mcp_count

    except Exception as e:
        logger.warning(f"Error extracting toolset info: {e}")

    return toolsets_info


def _get_agent_details(agent: Any, agent_id: str, info: Any) -> dict[str, Any]:
    """
    Get detailed agent information for display.

    Args:
        agent: The agent adapter
        agent_id: The agent ID
        info: The AgentInfo object

    Returns:
        Dictionary with comprehensive agent details
    """
    toolsets_info = _get_agent_toolsets_info(agent)

    # Get model name - try multiple access patterns
    model_name = "unknown"

    # Try _agent (PydanticAIAdapter pattern)
    if hasattr(agent, "_agent") and hasattr(agent._agent, "model"):
        model = agent._agent.model
        if hasattr(model, "model_name"):
            model_name = model.model_name
        elif hasattr(model, "name"):
            model_name = model.name
        elif model:
            model_str = str(model)
            # Handle Pydantic AI model strings like "openai:gpt-4o"
            if ":" in model_str:
                model_name = model_str
            else:
                model_name = model_str
    # Fallback: try agent (other adapter patterns)
    elif hasattr(agent, "agent") and hasattr(agent.agent, "model"):
        model = agent.agent.model
        if hasattr(model, "model_name"):
            model_name = model.model_name
        elif hasattr(model, "name"):
            model_name = model.name
        elif model:
            model_str = str(model)
            if ":" in model_str:
                model_name = model_str
            else:
                model_name = model_str

    # Get system prompt (truncated) - try multiple access patterns
    system_prompt = ""
    # Try _agent (PydanticAIAdapter pattern)
    if hasattr(agent, "_agent") and hasattr(agent._agent, "_system_prompts"):
        prompts = agent._agent._system_prompts
        if prompts:
            system_prompt = str(prompts[0])
            if len(system_prompt) > 100:
                system_prompt = system_prompt[:97] + "..."
    # Fallback: try agent (other adapter patterns)
    elif hasattr(agent, "agent") and hasattr(agent.agent, "_system_prompts"):
        prompts = agent.agent._system_prompts
        if prompts:
            system_prompt = str(prompts[0])
            if len(system_prompt) > 100:
                system_prompt = system_prompt[:97] + "..."

    return {
        "id": agent_id,
        "name": info.name,
        "description": info.description,
        "status": "running",
        "protocol": getattr(info, "protocol", "ag-ui"),
        "model": model_name,
        "system_prompt": system_prompt,
        "capabilities": info.capabilities.model_dump() if info.capabilities else {},
        "toolsets": toolsets_info,
    }


@router.get("", response_model=AgentListResponse)
async def list_agents() -> AgentListResponse:
    """
    List all registered agents.

    Returns:
        List of agent information including toolset details.
    """
    agents = []
    for agent_id, (agent, info) in list(_agents.items()):
        # Get detailed agent information
        agent_details = _get_agent_details(agent, agent_id, info)
        agents.append(agent_details)

    return AgentListResponse(agents=agents)


@router.get("/{agent_id:path}")
async def get_agent(agent_id: str) -> dict[str, Any]:
    """
    Get information about a specific agent.

    Args:
        agent_id: The agent identifier.

    Returns:
        Agent information with full details.

    Raises:
        HTTPException: If agent not found.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    agent, info = _agents[agent_id]
    return _get_agent_details(agent, agent_id, info)


@router.delete("/{agent_id:path}")
async def delete_agent(agent_id: str) -> dict[str, str]:
    """
    Delete an agent.

    Args:
        agent_id: The agent identifier.

    Returns:
        Success message.

    Raises:
        HTTPException: If agent not found.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    # Remove the stored creation spec
    _agent_specs.pop(agent_id, None)

    # Note: MCP servers are managed at server level (started on server startup,
    # stopped on server shutdown), so no cleanup needed per-agent.

    # Unregister from all protocols
    try:
        unregister_agent(agent_id)
    except Exception as e:
        logger.warning(f"Could not unregister from ACP: {e}")

    try:
        unregister_agui_agent(agent_id)
    except Exception as e:
        logger.warning(f"Could not unregister from AG-UI: {e}")

    try:
        unregister_vercel_agent(agent_id)
    except Exception as e:
        logger.warning(f"Could not unregister from Vercel AI: {e}")

    try:
        unregister_a2a_agent(agent_id)
    except Exception as e:
        logger.warning(f"Could not unregister from A2A: {e}")

    try:
        unregister_mcp_ui_agent(agent_id)
    except Exception as e:
        logger.warning(f"Could not unregister from MCP-UI: {e}")

    # Unregister from context session
    try:
        from ..context.session import unregister_agent as unregister_agent_for_context

        unregister_agent_for_context(agent_id)
    except Exception as e:
        logger.warning(f"Could not unregister from context session: {e}")

    logger.info(f"Deleted agent: {agent_id}")

    return {"message": f"Agent {agent_id} deleted successfully"}


class UpdateAgentTransportRequest(BaseModel):
    """Request to update an agent's transport protocol."""

    transport: Literal["ag-ui", "vercel-ai"] = Field(
        ..., description="New transport protocol"
    )


@router.patch("/{agent_id:path}/transport")
async def update_agent_transport(
    agent_id: str,
    request: UpdateAgentTransportRequest,
    http_request: Request,
) -> dict[str, Any]:
    """
    Update an agent's transport protocol (ag-ui or vercel-ai).

    This re-registers the agent with the new transport while keeping
    the same underlying agent instance.

    Args:
        agent_id: The agent identifier.
        request: The transport update request.
        http_request: The FastAPI request.

    Returns:
        Updated agent information.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    agent, info = _agents[agent_id]
    current_transport = getattr(info, "transport", None)
    new_transport = request.transport

    if current_transport == new_transport:
        return {
            "id": agent_id,
            "transport": new_transport,
            "message": f"Agent already using {new_transport} transport",
        }

    # Unregister from old transport
    if current_transport == "ag-ui":
        try:
            unregister_agui_agent(agent_id)
            # Remove the dynamic mount
            if http_request.app:
                mount_path = f"{_api_prefix}/ag-ui/{agent_id}"
                http_request.app.routes[:] = [
                    r
                    for r in http_request.app.routes
                    if not (
                        hasattr(r, "path") and getattr(r, "path", None) == mount_path
                    )
                ]
            logger.info(f"Unregistered agent from AG-UI: {agent_id}")
        except Exception as e:
            logger.warning(f"Could not unregister from AG-UI: {e}")
    elif current_transport == "vercel-ai":
        try:
            unregister_vercel_agent(agent_id)
            logger.info(f"Unregistered agent from Vercel AI: {agent_id}")
        except Exception as e:
            logger.warning(f"Could not unregister from Vercel AI: {e}")

    # Register with new transport
    if new_transport == "ag-ui":
        try:
            agui_adapter = AGUITransport(agent, agent_id=agent_id)
            register_agui_agent(agent_id, agui_adapter)
            # Dynamically add the AG-UI mount
            agui_app = get_agui_app(agent_id)
            if agui_app and http_request.app:
                mount_path = f"{_api_prefix}/ag-ui/{agent_id}"
                http_request.app.mount(mount_path, agui_app, name=f"agui-{agent_id}")
                logger.info(f"Dynamically mounted AG-UI route: {mount_path}/")
            logger.info(f"Registered agent with AG-UI: {agent_id}")
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to register with AG-UI: {e}"
            )
    elif new_transport == "vercel-ai":
        try:
            stored_spec = _agent_specs.get(agent_id, {})
            stored_agent_spec = stored_spec.get("agent_spec") or {}
            _has_ft = bool(
                stored_agent_spec.get("frontendTools")
                or stored_agent_spec.get("frontend_tools")
            )
            if not _has_ft and stored_spec.get("agent_spec_id"):
                _lib = get_library_agent_spec(stored_spec["agent_spec_id"])
                _has_ft = bool(_lib and getattr(_lib, "frontend_tools", None))
            vercel_adapter = VercelAITransport(
                agent, agent_id=agent_id, has_spec_frontend_tools=_has_ft
            )
            register_vercel_agent(agent_id, vercel_adapter)
            logger.info(f"Registered agent with Vercel AI: {agent_id}")
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to register with Vercel AI: {e}"
            )

    # Update the stored info transport field
    if hasattr(info, "transport"):
        info.transport = new_transport

    logger.info(
        f"Updated agent {agent_id} transport: {current_transport} -> {new_transport}"
    )

    return {
        "id": agent_id,
        "transport": new_transport,
        "previous_transport": current_transport,
        "message": f"Agent transport updated to {new_transport}",
    }


class UpdateAgentMcpServersRequest(BaseModel):
    """Request to update an agent's MCP servers."""

    selected_mcp_servers: list[McpServerSelection] = Field(
        default_factory=list,
        description="New list of MCP server selections to use",
    )


@router.patch("/{agent_id:path}/mcp-servers")
async def update_agent_mcp_servers(
    agent_id: str,
    request: UpdateAgentMcpServersRequest,
) -> dict[str, Any]:
    """
    Update an agent's selected MCP servers at runtime.

    This allows dynamically adding or removing MCP servers from a running agent
    without recreating the agent.

    Args:
        agent_id: The agent identifier.
        request: The new list of MCP server IDs.

    Returns:
        Updated agent info.

    Raises:
        HTTPException: If agent not found or update fails.
    """
    if agent_id not in _agents:
        logger.error(
            f"PATCH /agents/{agent_id}/mcp-servers: Agent not found. Registered agents: {list(_agents.keys())}"
        )
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    try:
        adapter, info = _agents[agent_id]

        logger.info(
            f"PATCH /agents/{agent_id}/mcp-servers: Adapter type={type(adapter).__name__}, request={request.selected_mcp_servers}"
        )

        # Check if adapter supports updating MCP servers
        # Renamed method consistent with new interface
        if hasattr(adapter, "update_mcp_servers"):
            # Log current state
            if hasattr(adapter, "_selected_mcp_servers"):
                logger.info(
                    f"PATCH /agents/{agent_id}/mcp-servers: Current servers before update: {adapter._selected_mcp_servers}"
                )

            # Ensure new servers are running (similar logic to create_agent)
            lifecycle_manager = get_mcp_lifecycle_manager()

            for item in request.selected_mcp_servers:
                server_id = item.id
                is_config = item.origin == "config"
                if not server_id:
                    continue

                # Start logical check/start...
                started = False
                # Check if running first
                if not lifecycle_manager.is_server_running(
                    server_id, is_config=is_config
                ):
                    # 1. Try Config
                    if (is_config is None or is_config is True) and not started:
                        config_server = lifecycle_manager.get_server_config_from_file(
                            server_id
                        )
                        if config_server:
                            await lifecycle_manager.start_server(
                                server_id, config_server
                            )
                            started = True

                    # 2. Try Catalog
                    if (is_config is None or is_config is False) and not started:
                        catalog_server = MCP_SERVER_CATALOG.get(server_id)
                        if catalog_server:
                            await lifecycle_manager.start_server(
                                server_id, catalog_server
                            )
                            started = True

            # Update the adapter
            adapter.update_mcp_servers(request.selected_mcp_servers)

        elif hasattr(adapter, "update_selected_mcp_servers"):
            # Legacy fallback if needed (but we changed the adapter)
            logger.warning("Using legacy update_selected_mcp_servers method")
            adapter.update_selected_mcp_servers(request.selected_mcp_servers)
        else:
            raise HTTPException(
                status_code=400,
                detail="Agent adapter does not support updating MCP servers",
            )

        logger.info(
            f"Updated agent '{agent_id}' MCP servers to: {request.selected_mcp_servers}"
        )

        return {
            "agent_id": agent_id,
            "selected_mcp_servers": request.selected_mcp_servers,
            "message": "MCP servers updated successfully",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update MCP servers for agent '{agent_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update MCP servers: {str(e)}",
        )


# ============================================================================
# Code Sandbox Configuration
# ============================================================================


class ConfigureSandboxRequest(BaseModel):
    """Request to configure the code sandbox manager."""

    variant: Literal["local-eval", "local-jupyter", "jupyter"] = Field(
        default="local-eval",
        description=(
            "Sandbox variant to use: 'local-eval' (Python exec), "
            "'jupyter' (managed Jupyter sandbox), or "
            "'local-jupyter' (existing Jupyter server URL)"
        ),
    )
    jupyter_url: str | None = Field(
        default=None,
        description="Jupyter server URL (required for local-jupyter variant). "
        "Can include token as query param: http://localhost:8888?token=xxx",
    )
    jupyter_token: str | None = Field(
        default=None,
        description="Jupyter server token (optional, overrides token in URL if provided)",
    )


class SandboxStatusResponse(BaseModel):
    """Response with current sandbox status."""

    variant: str = Field(..., description="Current sandbox variant")
    jupyter_url: str | None = Field(
        default=None, description="Jupyter URL if configured"
    )
    jupyter_token_set: bool = Field(
        default=False, description="Whether a Jupyter token is configured"
    )
    sandbox_running: bool = Field(
        default=False, description="Whether a sandbox instance is active"
    )


@router.get("/sandbox/status")
async def get_sandbox_status() -> SandboxStatusResponse:
    """
    Get the current status of the code sandbox manager.

    Returns:
        Current sandbox configuration and status.
    """
    try:
        from ..services.code_sandbox_manager import get_code_sandbox_manager

        manager = get_code_sandbox_manager()
        status = manager.get_status()
        return SandboxStatusResponse(**status)
    except ImportError:
        return SandboxStatusResponse(
            variant="local-eval",
            sandbox_running=False,
        )


@router.post("/sandbox/configure")
async def configure_sandbox(request: ConfigureSandboxRequest) -> SandboxStatusResponse:
    """
    Configure the code sandbox manager.

    This endpoint allows runtime configuration of the sandbox variant.
    Use 'local-eval' for simple Python exec-based execution,
    'jupyter' for a managed Jupyter sandbox, or
    'local-jupyter' to connect to an existing Jupyter server.

    Note: If a sandbox is currently running with a different configuration,
    it will be stopped and recreated on next use.

    Args:
        request: Sandbox configuration including variant and Jupyter details.

    Returns:
        Updated sandbox status.

    Raises:
        HTTPException: If configuration fails.
    """
    try:
        from ..services.code_sandbox_manager import get_code_sandbox_manager

        manager = get_code_sandbox_manager()

        # Configure the sandbox
        if request.variant == "local-jupyter" and not request.jupyter_url:
            raise HTTPException(
                status_code=400,
                detail="jupyter_url is required when variant is 'local-jupyter'",
            )

        manager.configure(
            variant=request.variant,
            jupyter_url=request.jupyter_url,
            jupyter_token=request.jupyter_token,
        )

        try:
            from .configure import notify_sandbox_status_change

            await notify_sandbox_status_change()
        except Exception as exc:
            logger.debug("Failed to notify sandbox configure change: %s", exc)

        logger.info(f"Sandbox configured: variant={request.variant}")

        status = manager.get_status()
        return SandboxStatusResponse(**status)

    except HTTPException:
        raise
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"code_sandboxes package not installed: {e}",
        )
    except Exception as e:
        logger.error(f"Failed to configure sandbox: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to configure sandbox: {str(e)}",
        )


@router.post("/sandbox/restart")
async def restart_sandbox() -> SandboxStatusResponse:
    """
    Restart the code sandbox with current configuration.

    This stops any running sandbox and creates a new instance
    with the current configuration.

    Returns:
        Updated sandbox status.
    """
    try:
        from ..services.code_sandbox_manager import get_code_sandbox_manager

        manager = get_code_sandbox_manager()
        manager.restart()

        try:
            from .configure import notify_sandbox_status_change

            await notify_sandbox_status_change()
        except Exception as exc:
            logger.debug("Failed to notify sandbox restart change: %s", exc)

        logger.info(f"Sandbox restarted: variant={manager.variant}")

        status = manager.get_status()
        return SandboxStatusResponse(**status)

    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"code_sandboxes package not installed: {e}",
        )
    except Exception as e:
        logger.error(f"Failed to restart sandbox: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to restart sandbox: {str(e)}",
        )


# ============================================================================
# Agent MCP Server Lifecycle Management
# ============================================================================


class EnvVar(BaseModel):
    """Environment variable name-value pair."""

    name: str = Field(..., description="Environment variable name")
    value: str = Field(..., description="Environment variable value")


class StartAgentMcpServersRequest(BaseModel):
    """
    Request to start MCP servers for a running agent.

    For two-container Kubernetes deployments, both jupyter_sandbox and
    mcp_proxy_url should be provided to enable the full codemode flow:
    - jupyter_sandbox: URL of the Jupyter server for code execution
    - mcp_proxy_url: URL of the MCP proxy endpoint for tool calls

    In Kubernetes pods, containers communicate via localhost (127.0.0.1).
    """

    env_vars: list[EnvVar] = Field(
        default_factory=list,
        description="Environment variables to set before starting MCP servers",
    )
    jupyter_sandbox: str | None = Field(
        default=None,
        description="Jupyter sandbox URL with token (e.g., http://127.0.0.1:8888?token=xxx). "
        "If provided, configures the code sandbox manager to use Jupyter for code execution.",
    )
    mcp_proxy_url: str | None = Field(
        default=None,
        description="MCP tool proxy URL (e.g., http://127.0.0.1:8765/api/v1/mcp/proxy). "
        "If provided, the Jupyter kernel will call tools via HTTP to this URL "
        "instead of requiring direct stdio access to MCP servers.",
    )


class AgentMcpServersResponse(BaseModel):
    """Response for agent MCP server operations."""

    agent_id: str | None = Field(
        default=None, description="Agent ID (None if operating on all agents)"
    )
    agents_processed: list[str] = Field(
        default_factory=list, description="List of agent IDs processed"
    )
    started_servers: list[str] = Field(default_factory=list)
    stopped_servers: list[str] = Field(default_factory=list)
    already_running: list[str] = Field(default_factory=list)
    already_stopped: list[str] = Field(default_factory=list)
    failed_servers: list[dict[str, str]] = Field(default_factory=list)
    codemode_rebuilt: bool = False
    sandbox_configured: bool = Field(
        default=False, description="Whether the code sandbox was (re)configured"
    )
    sandbox_variant: str | None = Field(
        default=None,
        description="The sandbox variant after configuration (local-eval or local-jupyter)",
    )
    mcp_proxy_url: str | None = Field(
        default=None, description="The MCP proxy URL configured for tool calls (if any)"
    )
    env_vars_set: int = Field(
        default=0,
        description="Number of env vars set on the process environment (and forwarded to MCP subprocesses). "
        "For local-jupyter sandboxes they are also injected into the kernel when it is first used.",
    )
    message: str


async def _start_mcp_servers_for_agent(
    agent_id: str,
    env_vars: list[EnvVar],
    request: Request | None = None,
) -> tuple[list[str], list[str], list[dict[str, str]], bool]:
    """
    Internal helper to start MCP servers for a single agent.

    Args:
        agent_id: The agent ID to start servers for
        env_vars: Environment variables to set before starting
        request: Optional FastAPI request (used to access app.state.pending_mcp_servers)

    Returns:
        Tuple of (started_servers, already_running, failed_servers, codemode_rebuilt)
    """
    adapter, info = _agents[agent_id]

    logger.info(f"_start_mcp_servers_for_agent: Starting for agent '{agent_id}'")
    logger.info(f"_start_mcp_servers_for_agent: Adapter type: {type(adapter).__name__}")
    if env_vars:
        for ev in env_vars:
            stripped = ev.value[:5] + "..." if len(ev.value) > 5 else ev.value
            logger.info(
                f"_start_mcp_servers_for_agent: env var: {ev.name} = {stripped}"
            )
    else:
        logger.info("_start_mcp_servers_for_agent: no env vars provided")

    # Get the agent's selected MCP servers
    selected_servers: list[Any] = []
    if hasattr(adapter, "_selected_mcp_servers"):
        selected_servers = adapter._selected_mcp_servers
        logger.info(
            f"_start_mcp_servers_for_agent: Found {len(selected_servers)} servers in adapter._selected_mcp_servers"
        )
    elif hasattr(adapter, "selected_mcp_server_ids"):
        selected_servers = [
            McpServerSelection(id=s, origin="catalog")
            for s in adapter.selected_mcp_server_ids
        ]
        logger.info(
            f"_start_mcp_servers_for_agent: Found {len(selected_servers)} servers in adapter.selected_mcp_server_ids"
        )
    else:
        logger.warning(
            "_start_mcp_servers_for_agent: Adapter has no selected MCP servers attribute"
        )

    # If no selected servers, check for pending servers in app.state
    # (set when --no-catalog-mcp-servers flag was used at startup)
    if not selected_servers and request is not None:
        try:
            pending_mcp_servers = getattr(request.app.state, "pending_mcp_servers", [])
            if pending_mcp_servers:
                logger.info(
                    f"_start_mcp_servers_for_agent: Using {len(pending_mcp_servers)} pending MCP servers from app.state"
                )
                selected_servers = [
                    McpServerSelection(id=s.id, origin="catalog")
                    for s in pending_mcp_servers
                ]
                # Also update the adapter's selected servers so subsequent calls work
                if hasattr(adapter, "_selected_mcp_servers"):
                    adapter._selected_mcp_servers = selected_servers
                    logger.info(
                        "_start_mcp_servers_for_agent: Updated adapter._selected_mcp_servers"
                    )
        except Exception as e:
            logger.warning(
                f"_start_mcp_servers_for_agent: Failed to get pending_mcp_servers: {e}"
            )

    if not selected_servers:
        logger.info(
            f"_start_mcp_servers_for_agent: No MCP servers selected for agent '{agent_id}', nothing to start"
        )
        return [], [], [], False

    logger.info(
        f"_start_mcp_servers_for_agent: Will try to start {len(selected_servers)} servers: {[getattr(s, 'id', str(s)) for s in selected_servers]}"
    )

    lifecycle_manager = get_mcp_lifecycle_manager()

    started: list[str] = []
    already_running: list[str] = []
    failed: list[dict[str, str]] = []

    for selection in selected_servers:
        server_id = selection.id if hasattr(selection, "id") else str(selection)
        is_config = getattr(selection, "origin", "catalog") == "config"

        # Check if already running
        if lifecycle_manager.is_server_running(server_id, is_config=is_config):
            logger.info(
                f"_start_mcp_servers_for_agent: Server '{server_id}' is already running"
            )
            already_running.append(server_id)
            continue

        # Get server config from appropriate source
        config = None
        if is_config:
            config = lifecycle_manager.get_server_config_from_file(server_id)
            logger.info(
                f"_start_mcp_servers_for_agent: Got config for '{server_id}' from config file: {config is not None}"
            )
        else:
            config = MCP_SERVER_CATALOG.get(server_id)
            logger.info(
                f"_start_mcp_servers_for_agent: Got config for '{server_id}' from catalog: {config is not None}"
            )

        if config is None:
            logger.warning(
                f"_start_mcp_servers_for_agent: Server config not found for '{server_id}'"
            )
            failed.append(
                {
                    "server_id": server_id,
                    "error": f"Server config not found (origin={getattr(selection, 'origin', 'unknown')})",
                }
            )
            continue

        # Start the server
        try:
            logger.info(
                f"_start_mcp_servers_for_agent: Starting server '{server_id}'..."
            )
            # Pass env vars explicitly so MCP subprocess gets them even if
            # os.environ was not populated (robust, order-independent).
            extra_env = {ev.name: ev.value for ev in env_vars} if env_vars else None
            instance = await lifecycle_manager.start_server(
                server_id, config, extra_env=extra_env
            )
            if instance is not None:
                logger.info(
                    f"_start_mcp_servers_for_agent: ✓ Successfully started server '{server_id}'"
                )
                started.append(server_id)
                # Add the server to mcp_manager so it's available for codemode rebuild
                mcp_manager = get_mcp_manager()
                if not mcp_manager.get_server(server_id):
                    mcp_manager.add_server(config)
                    logger.info(
                        f"_start_mcp_servers_for_agent: Added server '{server_id}' to mcp_manager"
                    )
            else:
                error = lifecycle_manager._failed_servers.get(
                    server_id, "Unknown error"
                )
                logger.warning(
                    f"_start_mcp_servers_for_agent: ✗ Failed to start server '{server_id}': {error}"
                )
                failed.append({"server_id": server_id, "error": str(error)})
        except Exception as e:
            logger.error(
                f"_start_mcp_servers_for_agent: ✗ Exception starting server '{server_id}': {e}"
            )
            failed.append({"server_id": server_id, "error": str(e)})

    # Rebuild Codemode toolset if enabled
    codemode_rebuilt = False
    if hasattr(adapter, "_codemode_builder") and adapter._codemode_builder is not None:
        try:
            # Log sandbox configuration before rebuild
            try:
                from ..services.code_sandbox_manager import get_code_sandbox_manager

                sandbox_manager = get_code_sandbox_manager()
                logger.info(
                    f"Rebuilding Codemode toolset for agent '{agent_id}' "
                    f"(sandbox={sandbox_manager.variant}, url={sandbox_manager.config.jupyter_url})..."
                )
            except ImportError:
                logger.info(f"Rebuilding Codemode toolset for agent '{agent_id}'...")

            new_codemode = adapter._codemode_builder(selected_servers)
            if new_codemode is not None:
                # Log which sandbox the new toolset is using
                if (
                    hasattr(new_codemode, "_sandbox")
                    and new_codemode._sandbox is not None
                ):
                    sandbox_type = type(new_codemode._sandbox).__name__
                    logger.info(f"New codemode toolset has sandbox: {sandbox_type}")
                elif (
                    hasattr(new_codemode, "sandbox")
                    and new_codemode.sandbox is not None
                ):
                    sandbox_type = type(new_codemode.sandbox).__name__
                    logger.info(f"New codemode toolset has sandbox: {sandbox_type}")
                else:
                    logger.info("New codemode toolset has no sandbox attached")

                # Try to initialize the new toolset
                # If start() fails (e.g., pickle error with Jupyter sandbox),
                # we still want to use the new toolset since it has the correct sandbox
                start_succeeded = False
                try:
                    await new_codemode.start()
                    start_succeeded = True
                    logger.info("Codemode toolset start() completed successfully")
                except Exception as start_error:
                    # Log the error but continue - the toolset may still work for execution
                    logger.warning(
                        f"Codemode toolset start() had an error (will still use toolset): {start_error}"
                    )

                # Update the adapter's non-MCP toolsets regardless of start() result
                # The sandbox is already configured and should work for code execution
                if hasattr(adapter, "_non_mcp_toolsets"):
                    # Remove old codemode toolset
                    old_toolsets = adapter._non_mcp_toolsets
                    adapter._non_mcp_toolsets = [
                        t
                        for t in adapter._non_mcp_toolsets
                        if "Codemode" not in type(t).__name__
                    ]
                    removed_count = len(old_toolsets) - len(adapter._non_mcp_toolsets)
                    logger.info(f"Removed {removed_count} old codemode toolset(s)")

                    adapter._non_mcp_toolsets.append(new_codemode)
                    logger.info("Added new codemode toolset to adapter")

                codemode_rebuilt = True
                logger.info(
                    f"Codemode toolset rebuilt for agent '{agent_id}' "
                    f"(start_succeeded={start_succeeded}, tools={len(new_codemode.registry.list_tools()) if new_codemode.registry else 0})"
                )
        except Exception as e:
            logger.warning(f"Failed to rebuild Codemode toolset: {e}")

    return started, already_running, failed, codemode_rebuilt


async def _setup_env_and_sandbox(
    body: StartAgentMcpServersRequest,
    request: Request,
    agent_id: str | None = None,
) -> tuple[bool, str | None, str | None]:
    """
    Shared helper: set process env vars and configure sandbox from request body.

    Environment variables are propagated to:
      1. MCP server subprocesses (npx, uvx, docker) via extra_env
         passed explicitly to lifecycle_manager.start_server()
      2. The Jupyter kernel via _inject_env_vars() in the sandbox
         manager (runs ``import os; os.environ[k] = v`` in the kernel)

    Returns:
        (sandbox_configured, sandbox_variant, mcp_proxy_url)
    """
    label = f"mcp-servers/start/{agent_id}" if agent_id else "mcp-servers/start"
    env_var_names = [ev.name for ev in body.env_vars]
    for env_var in body.env_vars:
        stripped = (
            env_var.value[:5] + "..." if len(env_var.value) > 5 else env_var.value
        )
        logger.info("[%s] setting env var: %s = %s", label, env_var.name, stripped)
        os.environ[env_var.name] = env_var.value
    if env_var_names:
        logger.info(
            f"Set {len(env_var_names)} env var(s)"
            f"{f' for agent {agent_id!r}' if agent_id else ' on process'}"
            f" + will pass to MCP subprocesses and sandbox kernel: {env_var_names}"
        )

    sandbox_configured = False
    sandbox_variant: str | None = None
    mcp_proxy_url: str | None = None
    if body.jupyter_sandbox:
        try:
            from ..services.code_sandbox_manager import get_code_sandbox_manager

            sandbox_manager = get_code_sandbox_manager()
            env_dict = (
                {ev.name: ev.value for ev in body.env_vars} if body.env_vars else None
            )
            sandbox_manager.configure_from_url(
                body.jupyter_sandbox,
                mcp_proxy_url=body.mcp_proxy_url,
                env_vars=env_dict,
            )
            sandbox_configured = True
            sandbox_variant = sandbox_manager.variant
            mcp_proxy_url = sandbox_manager.config.mcp_proxy_url
            logger.info(
                f"Configured sandbox manager for Jupyter: {body.jupyter_sandbox.split('?')[0]}"
            )
            logger.info(f"MCP proxy URL configured: {mcp_proxy_url}")

            # Update startup_info on app.state so /health/startup
            # reflects the reconfigured sandbox (e.g. after the
            # runtimes-companion calls this endpoint).
            existing_info: dict[str, Any] = (
                getattr(request.app.state, "startup_info", None) or {}
            )
            sandbox_block = existing_info.get("sandbox", {})
            sandbox_block["variant"] = sandbox_variant
            sandbox_block["jupyter_url"] = body.jupyter_sandbox.split("?")[0]
            if mcp_proxy_url:
                sandbox_block["mcp_proxy_url"] = mcp_proxy_url
            existing_info["sandbox"] = sandbox_block
            request.app.state.startup_info = existing_info
        except Exception as e:
            logger.warning(f"Failed to configure Jupyter sandbox: {e}")

    return sandbox_configured, sandbox_variant, mcp_proxy_url


def _build_mcp_response_message(
    *,
    agents_processed: list[str],
    started: list[str],
    already_running: list[str],
    failed: list[dict[str, str]],
    sandbox_configured: bool,
    sandbox_variant: str | None,
    mcp_proxy_url: str | None,
    env_count: int,
) -> str:
    """Build a human-readable summary message for MCP server start responses."""
    parts: list[str] = []
    if len(agents_processed) > 1:
        parts.append(f"Processed {len(agents_processed)} agent(s)")
    if started:
        parts.append(f"Started {len(started)} server(s)")
    if already_running:
        parts.append(f"{len(already_running)} already running")
    if failed:
        parts.append(f"{len(failed)} failed")
    if sandbox_configured:
        parts.append(f"sandbox={sandbox_variant}")
    if mcp_proxy_url:
        parts.append(f"mcp_proxy={mcp_proxy_url}")
    if env_count:
        parts.append(f"env_vars={env_count}")
    return ", ".join(parts) if parts else "No servers to start"


@router.post("/mcp-servers/start")
async def start_all_agents_mcp_servers(
    body: StartAgentMcpServersRequest,
    request: Request,
) -> AgentMcpServersResponse:
    """
    Start catalog MCP servers for all running agents.

    This endpoint starts the MCP servers that are configured in each agent's
    selected_mcp_servers list. Environment variables can be provided to
    configure the servers (e.g., API keys).

    If an agent has Codemode enabled, the Codemode toolset will be rebuilt
    to include the newly started servers as programmatic tools.

    If jupyter_sandbox is provided, the code sandbox manager will be configured
    to use the Jupyter kernel for code execution instead of local eval.

    Args:
        body: Environment variables and optional jupyter_sandbox URL.
        request: FastAPI request object (provides access to app.state).

    Returns:
        Aggregated status of server start operations across all agents.
    """
    if not _agents:
        return AgentMcpServersResponse(
            agent_id=None,
            agents_processed=[],
            message="No agents registered",
        )

    try:
        (
            sandbox_configured,
            sandbox_variant,
            mcp_proxy_url,
        ) = await _setup_env_and_sandbox(body, request)

        all_started: list[str] = []
        all_already_running: list[str] = []
        all_failed: list[dict[str, str]] = []
        any_codemode_rebuilt = False
        agents_processed: list[str] = []

        for agent_id in list(_agents.keys()):
            (
                started,
                already_running,
                failed,
                codemode_rebuilt,
            ) = await _start_mcp_servers_for_agent(agent_id, body.env_vars, request)
            all_started.extend(started)
            all_already_running.extend(already_running)
            all_failed.extend(failed)
            if codemode_rebuilt:
                any_codemode_rebuilt = True
            agents_processed.append(agent_id)

        env_count = len(body.env_vars) if body.env_vars else 0

        return AgentMcpServersResponse(
            agent_id=None,
            agents_processed=agents_processed,
            started_servers=all_started,
            already_running=all_already_running,
            failed_servers=all_failed,
            codemode_rebuilt=any_codemode_rebuilt,
            sandbox_configured=sandbox_configured,
            sandbox_variant=sandbox_variant,
            mcp_proxy_url=mcp_proxy_url,
            env_vars_set=env_count,
            message=_build_mcp_response_message(
                agents_processed=agents_processed,
                started=all_started,
                already_running=all_already_running,
                failed=all_failed,
                sandbox_configured=sandbox_configured,
                sandbox_variant=sandbox_variant,
                mcp_proxy_url=mcp_proxy_url,
                env_count=env_count,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start MCP servers for all agents: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start MCP servers: {str(e)}",
        )


@router.post("/{agent_id:path}/mcp-servers/start")
async def start_agent_mcp_servers(
    agent_id: str,
    body: StartAgentMcpServersRequest,
    request: Request,
) -> AgentMcpServersResponse:
    """
    Start catalog MCP servers defined for a specific running agent.

    This endpoint starts the MCP servers that are configured in the agent's
    selected_mcp_servers list. Environment variables can be provided to
    configure the servers (e.g., API keys).

    If the agent has Codemode enabled, the Codemode toolset will be rebuilt
    to include the newly started servers as programmatic tools.

    If jupyter_sandbox is provided, the code sandbox manager will be configured
    to use the Jupyter kernel for code execution instead of local eval.

    Args:
        agent_id: The agent identifier.
        body: Environment variables and optional jupyter_sandbox URL.
        request: FastAPI request object (provides access to app.state).

    Returns:
        Status of each server start operation.

    Raises:
        HTTPException: If agent not found or operation fails.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    try:
        (
            sandbox_configured,
            sandbox_variant,
            mcp_proxy_url,
        ) = await _setup_env_and_sandbox(body, request, agent_id)

        (
            started,
            already_running,
            failed,
            codemode_rebuilt,
        ) = await _start_mcp_servers_for_agent(agent_id, body.env_vars, request)

        if (
            not started
            and not already_running
            and not failed
            and not sandbox_configured
        ):
            return AgentMcpServersResponse(
                agent_id=agent_id,
                agents_processed=[agent_id],
                message="No MCP servers configured for this agent",
            )

        env_count = len(body.env_vars) if body.env_vars else 0

        return AgentMcpServersResponse(
            agent_id=agent_id,
            agents_processed=[agent_id],
            started_servers=started,
            already_running=already_running,
            failed_servers=failed,
            codemode_rebuilt=codemode_rebuilt,
            sandbox_configured=sandbox_configured,
            sandbox_variant=sandbox_variant,
            mcp_proxy_url=mcp_proxy_url,
            env_vars_set=env_count,
            message=_build_mcp_response_message(
                agents_processed=[agent_id],
                started=started,
                already_running=already_running,
                failed=failed,
                sandbox_configured=sandbox_configured,
                sandbox_variant=sandbox_variant,
                mcp_proxy_url=mcp_proxy_url,
                env_count=env_count,
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start MCP servers for agent '{agent_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start MCP servers: {str(e)}",
        )


async def _stop_mcp_servers_for_agent(
    agent_id: str,
) -> tuple[list[str], list[str], list[dict[str, str]]]:
    """
    Internal helper to stop MCP servers for a single agent.

    Returns:
        Tuple of (stopped_servers, already_stopped, failed_servers)
    """
    adapter, info = _agents[agent_id]

    # Get the agent's selected MCP servers
    selected_servers: list[Any] = []
    if hasattr(adapter, "_selected_mcp_servers"):
        selected_servers = adapter._selected_mcp_servers
    elif hasattr(adapter, "selected_mcp_server_ids"):
        selected_servers = [
            McpServerSelection(id=s, origin="catalog")
            for s in adapter.selected_mcp_server_ids
        ]

    if not selected_servers:
        return [], [], []

    lifecycle_manager = get_mcp_lifecycle_manager()

    stopped: list[str] = []
    already_stopped: list[str] = []
    failed: list[dict[str, str]] = []

    for selection in selected_servers:
        server_id = selection.id if hasattr(selection, "id") else str(selection)
        is_config = getattr(selection, "origin", "catalog") == "config"

        # Check if already stopped
        if not lifecycle_manager.is_server_running(server_id, is_config=is_config):
            already_stopped.append(server_id)
            continue

        # Stop the server
        try:
            success = await lifecycle_manager.stop_server(
                server_id, is_config=is_config
            )
            if success:
                stopped.append(server_id)
            else:
                failed.append({"server_id": server_id, "error": "Stop returned False"})
        except Exception as e:
            failed.append({"server_id": server_id, "error": str(e)})

    return stopped, already_stopped, failed


@router.post("/mcp-servers/stop")
async def stop_all_agents_mcp_servers() -> AgentMcpServersResponse:
    """
    Stop catalog MCP servers for all running agents.

    This endpoint stops the MCP servers that are configured in each agent's
    selected_mcp_servers list.

    Returns:
        Aggregated status of server stop operations across all agents.
    """
    if not _agents:
        return AgentMcpServersResponse(
            agent_id=None,
            agents_processed=[],
            message="No agents registered",
        )

    try:
        all_stopped: list[str] = []
        all_already_stopped: list[str] = []
        all_failed: list[dict[str, str]] = []
        agents_processed: list[str] = []

        for agent_id in list(_agents.keys()):
            stopped, already_stopped, failed = await _stop_mcp_servers_for_agent(
                agent_id
            )
            all_stopped.extend(stopped)
            all_already_stopped.extend(already_stopped)
            all_failed.extend(failed)
            agents_processed.append(agent_id)

        message_parts = [f"Processed {len(agents_processed)} agent(s)"]
        if all_stopped:
            message_parts.append(f"stopped {len(all_stopped)} server(s)")
        if all_already_stopped:
            message_parts.append(f"{len(all_already_stopped)} already stopped")
        if all_failed:
            message_parts.append(f"{len(all_failed)} failed")

        return AgentMcpServersResponse(
            agent_id=None,
            agents_processed=agents_processed,
            stopped_servers=all_stopped,
            already_stopped=all_already_stopped,
            failed_servers=all_failed,
            message=", ".join(message_parts),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stop MCP servers for all agents: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop MCP servers: {str(e)}",
        )


@router.post("/{agent_id:path}/mcp-servers/stop")
async def stop_agent_mcp_servers(
    agent_id: str,
) -> AgentMcpServersResponse:
    """
    Stop catalog MCP servers for a specific running agent.

    This endpoint stops the MCP servers that are configured in the agent's
    selected_mcp_servers list.

    Args:
        agent_id: The agent identifier.

    Returns:
        Status of each server stop operation.

    Raises:
        HTTPException: If agent not found or operation fails.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    try:
        stopped, already_stopped, failed = await _stop_mcp_servers_for_agent(agent_id)

        if not stopped and not already_stopped and not failed:
            return AgentMcpServersResponse(
                agent_id=agent_id,
                agents_processed=[agent_id],
                message="No MCP servers configured for this agent",
            )

        message_parts = []
        if stopped:
            message_parts.append(f"Stopped {len(stopped)} server(s)")
        if already_stopped:
            message_parts.append(f"{len(already_stopped)} already stopped")
        if failed:
            message_parts.append(f"{len(failed)} failed")

        return AgentMcpServersResponse(
            agent_id=agent_id,
            agents_processed=[agent_id],
            stopped_servers=stopped,
            already_stopped=already_stopped,
            failed_servers=failed,
            message=", ".join(message_parts) if message_parts else "No servers to stop",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to stop MCP servers for agent '{agent_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop MCP servers: {str(e)}",
        )


# ============================================================================
# Durable Agent Lifecycle Endpoints
# ============================================================================


@router.post("/prepare-checkpoint")
async def prepare_checkpoint_endpoint(http_request: Request) -> dict[str, Any]:
    """Prepare the agent-runtimes service for a CRIU checkpoint.

    Flushes DBOS state and closes connections to allow clean container freeze.
    Called by the companion before ``criu dump``.
    """
    logger.info("Preparing for CRIU checkpoint...")
    lifecycle = getattr(http_request.app.state, "durable_lifecycle", None)
    if lifecycle is not None:
        try:
            await lifecycle.prepare_checkpoint()
            logger.info("DBOS state flushed for checkpoint")
        except Exception as e:
            logger.warning("Error preparing DBOS for checkpoint: %s", e)
    return {"success": True, "message": "Ready for checkpoint."}


@router.post("/post-restore")
async def post_restore_endpoint(http_request: Request) -> dict[str, Any]:
    """Re-initialize after a CRIU restore.

    Re-launches DBOS and re-establishes connections after container thaw.
    Called by the companion after ``criu restore``.
    """
    logger.info("Post-restore re-initialization...")
    lifecycle = getattr(http_request.app.state, "durable_lifecycle", None)
    if lifecycle is not None:
        try:
            await lifecycle.post_restore()
            logger.info("DBOS re-launched after restore")
        except Exception as e:
            logger.warning("Error re-launching DBOS after restore: %s", e)
    return {"success": True, "message": "Post-restore complete."}


class ConfigureFromSpecRequest(BaseModel):
    """Request body for the configure-from-spec endpoint."""

    agent_spec_id: str
    agent_spec: dict[str, Any] | None = None
    env_vars: list[dict[str, str]] = Field(default_factory=list)
    user_token: str | None = None


@router.post("/configure-from-spec")
async def configure_from_spec_endpoint(
    http_request: Request,
    body: ConfigureFromSpecRequest,
) -> dict[str, Any]:
    """Configure and create an agent from an AgentSpec ID.

    Called by the companion during run-start-hooks when the operator
    provides an ``agent_spec_id``. Applies env vars and reuses the
    canonical ``POST /agents`` creation logic so all spec attributes
    are handled consistently.
    """
    logger.info("Configuring agent from spec: %s", body.agent_spec_id)

    # Set env vars from companion (secrets, API keys, etc.)
    for env_var in body.env_vars:
        name = env_var.get("name", "")
        value = env_var.get("value", "")
        if name:
            stripped = value[:5] + "..." if len(value) > 5 else value
            logger.info(
                "[configure-from-spec] setting env var: %s = %s", name, stripped
            )
            os.environ[name] = value

    # Validate that the referenced library spec exists.
    spec = get_library_agent_spec(body.agent_spec_id)
    if spec is None:
        raise HTTPException(
            status_code=404,
            detail=f"AgentSpec '{body.agent_spec_id}' not found in library.",
        )

    # Delegate to the canonical create flow. Defaults from the library spec
    # and optional forwarded agent_spec are applied in create_agent().
    #
    # Propagate the server-level codemode flag so that sandbox creation
    # (which is gated on enable_codemode) respects the --codemode startup flag
    # even when the forwarded agent_spec has no explicit codemode block.
    server_codemode = os.environ.get("AGENT_RUNTIMES_CODEMODE", "").lower() == "true"

    # The UI always talks to the "default" agent, so reconfigure the existing
    # default agent rather than creating a new one with the spec ID as name.
    # Delete the existing "default" agent first so create_agent() succeeds.
    target_agent_name = "default"
    if target_agent_name in _agents:
        logger.info(
            "Removing existing '%s' agent to reconfigure from spec '%s'",
            target_agent_name,
            body.agent_spec_id,
        )
        try:
            await delete_agent(target_agent_name)
        except Exception as e:
            logger.warning("Failed to delete existing default agent: %s", e)

    try:
        created = await create_agent(
            CreateAgentRequest(
                name=target_agent_name,
                agent_spec_id=body.agent_spec_id,
                agent_spec=body.agent_spec,
                enable_codemode=server_codemode,
            ),
            http_request,
        )
        logger.info(
            "Agent '%s' reconfigured from spec '%s' and registered",
            target_agent_name,
            body.agent_spec_id,
        )
        created_id = getattr(created, "id", target_agent_name)
        created_model = getattr(created, "model", spec.model or DEFAULT_MODEL)

        # ── Trigger invoker for "once" triggers ──────────────────
        trigger = getattr(spec, "trigger", None)
        if trigger is None and body.agent_spec:
            trigger_raw = body.agent_spec.get("trigger")
            if isinstance(trigger_raw, dict):
                trigger = trigger_raw
        trigger_type = None
        trigger_config: dict[str, Any] = {}
        if trigger:
            if isinstance(trigger, dict):
                trigger_type = trigger.get("type")
                trigger_config = trigger
            else:
                trigger_type = getattr(trigger, "type", None)
                trigger_config = trigger.__dict__ if hasattr(trigger, "__dict__") else {}

        # NOTE: "once" triggers are NOT auto-fired on agent creation.
        # The user must explicitly invoke them via POST /{agent_id}/trigger/run.

        return {
            "success": True,
            "agent_id": created_id,
            "model": created_model,
            "message": f"Agent 'default' reconfigured from spec '{body.agent_spec_id}'.",
        }

    except Exception as e:
        logger.error(
            "Failed to configure agent from spec '%s': %s", body.agent_spec_id, e
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create agent from spec: {str(e)}",
        )


# ── Trigger / Run ────────────────────────────────────────────────────────


class TriggerRunRequest(BaseModel):
    """Body for POST /{agent_id}/trigger/run."""

    source: str = "once"


@router.post("/{agent_id}/trigger/run")
async def trigger_run(agent_id: str, body: TriggerRunRequest, request: Request):
    """Manually trigger an agent run (e.g. the *once* trigger).

    The endpoint looks up the agent, retrieves its spec trigger config,
    creates the appropriate invoker, and fires it in the background.
    """
    from .acp import _agents as _registered_agents

    pair = _registered_agents.get(agent_id)
    if pair is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    # Resolve trigger config from agent spec
    _agent_adapter, agent_info = pair
    trigger_config: dict[str, Any] = {}
    agent_spec_id: str = agent_id  # fallback

    # Try to find the spec for this agent
    for spec_id, spec in AGENT_SPECS.items():
        if agent_id.endswith(spec_id.replace("_", "-")) or spec_id in agent_id:
            agent_spec_id = spec_id
            spec_data = spec if isinstance(spec, dict) else spec.__dict__
            trigger_raw = spec_data.get("trigger", {})
            if isinstance(trigger_raw, dict):
                trigger_config = trigger_raw
            break

    # Extract user token from Authorization header
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip() if auth_header else ""

    base_url = os.environ.get("DATALAYER_RUN_URL", "https://prod1.datalayer.run")
    runtime_id = os.environ.get("HOSTNAME")

    import asyncio

    from agent_runtimes.invoker import get_invoker

    trigger_type = body.source or "once"
    invoker = get_invoker(
        trigger_type=trigger_type,
        agent_id=agent_id,
        agent_spec_id=agent_spec_id,
        token=token,
        base_url=base_url,
        runtime_id=runtime_id,
    )

    if invoker is None:
        raise HTTPException(
            status_code=400,
            detail=f"No invoker registered for trigger type '{trigger_type}'",
        )

    logger.info("Trigger/run: scheduling '%s' invoker for agent '%s'", trigger_type, agent_id)
    asyncio.ensure_future(invoker.invoke(trigger_config))

    return {
        "success": True,
        "agent_id": agent_id,
        "trigger_type": trigger_type,
        "message": f"Trigger '{trigger_type}' launched for agent '{agent_id}'.",
    }
