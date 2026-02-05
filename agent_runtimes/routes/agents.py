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
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from pydantic_ai import Agent as PydanticAgent

from ..adapters.pydantic_ai_adapter import PydanticAIAdapter
from ..config.agents import AGENT_SPECS
from ..config.agents import get_agent_spec as get_agent_spec
from ..config.agents import list_agent_specs as list_library_agents
from ..mcp import get_mcp_manager, initialize_config_mcp_servers
from ..mcp.catalog_mcp_servers import MCP_SERVER_CATALOG
from ..mcp.lifecycle import get_mcp_lifecycle_manager
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


def set_api_prefix(prefix: str) -> None:
    """
    Set the API prefix for dynamic mount paths.
    """
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


@router.get("/library/{agent_id}", response_model=AgentSpec)
async def get_agent_spec_endpoint(agent_id: str) -> dict[str, Any]:
    """
    Get a specific agent specification from the library.

    Args:
        agent_id: The ID of the agent spec (e.g., 'data-acquisition', 'crawler')
    """
    try:
        agent = get_agent_spec(agent_id)
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


def _build_codemode_toolset(
    request: "CreateAgentRequest",
    http_request: Request,
    sandbox: Any | None = None,
) -> Any | None:
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

    try:
        from pathlib import Path

        from agent_codemode import (
            PYDANTIC_AI_AVAILABLE as CODEMODE_AVAILABLE,
        )
        from agent_codemode import (
            CodeModeConfig,
            CodemodeToolset,
            MCPServerConfig,
            ToolRegistry,
        )
    except ImportError:
        logger.warning("agent-codemode package not installed, codemode disabled")
        return None

    if not CODEMODE_AVAILABLE:
        logger.warning("agent-codemode pydantic-ai integration not available")
        return None

    allow_direct = (
        request.allow_direct_tool_calls
        if request.allow_direct_tool_calls is not None
        else False
    )

    reranker = None
    if request.enable_tool_reranker:
        reranker = getattr(http_request.app.state, "codemode_tool_reranker", None)
        if reranker is None:
            logger.warning("Tool reranker requested but not configured on app.state")

    # Build registry with selected MCP servers
    registry = ToolRegistry()
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

    servers_added = []
    for server in servers:
        if not server.enabled:
            logger.debug(f"Skipping disabled MCP server: {server.id}")
            continue
        if not server.is_available:
            logger.warning(f"Skipping unavailable MCP server for codemode: {server.id}")
            continue

        # Normalize server name to valid Python identifier
        # Replace dashes and other invalid chars with underscores
        normalized_name = "".join(
            c if c.isalnum() or c == "_" else "_" for c in server.id
        )

        # Pass through relevant environment variables for MCP servers
        server_env: dict[str, str] = {}
        for env_key in ["TAVILY_API_KEY", "LINKEDIN_API_KEY", "LINKEDIN_ACCESS_TOKEN"]:
            env_val = os.getenv(env_key)
            if env_val:
                server_env[env_key] = env_val

        registry.add_server(
            MCPServerConfig(
                name=normalized_name,
                url=server.url if server.transport == "http" else "",
                command=server.command or "",
                args=server.args or [],
                env=server_env,
                enabled=server.enabled,
            )
        )
        servers_added.append(normalized_name)
        logger.info(
            f"Added MCP server to codemode registry: {normalized_name} (command={server.command}, args={server.args})"
        )

    logger.info(
        f"Codemode registry built with {len(servers_added)} servers: {servers_added}"
    )

    # Configure paths for codemode environment (following agent_cli.py pattern)
    # Use app state for custom paths if configured, otherwise use repo-relative defaults
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
    skills_path = getattr(
        http_request.app.state,
        "codemode_skills_path",
        str((repo_root / "skills").resolve()),
    )

    # Create config with all required paths
    config = CodeModeConfig(
        workspace_path=workspace_path,
        generated_path=generated_path,
        skills_path=skills_path,
        allow_direct_tool_calls=allow_direct,
    )

    # Create toolset following the working agent_cli.py pattern:
    # - Use the config object
    # - Enable discovery tools so LLM can find available MCP tools
    # - Pass tool_reranker if configured
    # - Pass sandbox if provided (to share with AgentSkillsToolset)
    return CodemodeToolset(
        registry=registry,
        config=config,
        sandbox=sandbox,
        allow_discovery_tools=True,  # Enable discovery tools (search_tools, get_tool_details, etc.)
        tool_reranker=reranker,
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
    agent_library: Literal["pydantic-ai", "langchain", "openai"] = Field(
        default="pydantic-ai", description="Agent library to use"
    )
    transport: Literal["ag-ui", "vercel-ai", "acp", "a2a"] = Field(
        default="ag-ui", description="Transport protocol to use"
    )
    model: str = Field(
        default="bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        description="Model to use",
    )
    system_prompt: str = Field(
        default="You are a helpful AI assistant.",
        description="System prompt for the agent",
    )
    enable_skills: bool = Field(
        default=False,
        description="Enable agent-skills toolset for reusable skill compositions",
    )
    skills: list[str] = Field(
        default_factory=list,
        description="Selected skill names to enable for this agent",
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
            status_code=400, detail=f"Agent with ID '{agent_id}' already exists"
        )

    try:
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

        # Create shared sandbox for both codemode and skills toolsets
        # This ensures state persistence between execute_code and skill script executions
        shared_sandbox = None
        skills_enabled = request.enable_skills or len(request.skills) > 0
        if request.enable_codemode and skills_enabled:
            try:
                from code_sandboxes import LocalEvalSandbox

                shared_sandbox = LocalEvalSandbox()
                shared_sandbox.start()  # Must start before use by either toolset
                logger.info(f"Created shared LocalEvalSandbox for agent {agent_id}")
            except ImportError:
                logger.warning(
                    "code_sandboxes not installed, cannot create shared sandbox"
                )

        # Add skills toolset if enabled
        if skills_enabled:
            try:
                from agent_skills import (
                    PYDANTIC_AI_AVAILABLE,
                    AgentSkill,
                    AgentSkillsToolset,
                    SandboxExecutor,
                )
                from code_sandboxes import LocalEvalSandbox

                if PYDANTIC_AI_AVAILABLE:
                    repo_root = Path(__file__).resolve().parents[2]
                    skills_path = getattr(
                        http_request.app.state,
                        "codemode_skills_path",
                        str((repo_root / "skills").resolve()),
                    )

                    selected = [s for s in request.skills if s]
                    if selected:
                        selected_set = set(selected)
                        selected_skills: list[AgentSkill] = []
                        for skill_md in Path(skills_path).rglob("SKILL.md"):
                            try:
                                skill = AgentSkill.from_skill_md(skill_md)
                            except Exception as exc:
                                logger.warning(
                                    "Failed to load skill from %s: %s",
                                    skill_md,
                                    exc,
                                )
                                continue
                            if skill.name in selected_set:
                                selected_skills.append(skill)

                        missing = selected_set - {s.name for s in selected_skills}
                        if missing:
                            logger.warning(
                                "Requested skills not found in %s: %s",
                                skills_path,
                                sorted(missing),
                            )

                        # Create executor for running skill scripts
                        # Use shared sandbox if available for state persistence with codemode
                        if shared_sandbox is not None:
                            executor = SandboxExecutor(shared_sandbox)
                            logger.info(
                                f"Using shared sandbox for skills executor (agent {agent_id})"
                            )
                        else:
                            # Create dedicated sandbox for skills
                            skills_sandbox = LocalEvalSandbox()
                            skills_sandbox.start()
                            executor = SandboxExecutor(skills_sandbox)
                        skills_toolset = AgentSkillsToolset(
                            skills=selected_skills,
                            executor=executor,
                        )
                    else:
                        # Create executor for running skill scripts
                        # Use shared sandbox if available for state persistence with codemode
                        if shared_sandbox is not None:
                            executor = SandboxExecutor(shared_sandbox)
                            logger.info(
                                f"Using shared sandbox for skills executor (agent {agent_id})"
                            )
                        else:
                            # Create dedicated sandbox for skills
                            skills_sandbox = LocalEvalSandbox()
                            skills_sandbox.start()
                            executor = SandboxExecutor(skills_sandbox)
                        skills_toolset = AgentSkillsToolset(
                            directories=[skills_path],  # TODO: Make configurable
                            executor=executor,
                        )
                    non_mcp_toolsets.append(skills_toolset)
                    logger.info(f"Added AgentSkillsToolset for agent {agent_id}")
                else:
                    logger.warning("agent-skills pydantic-ai integration not available")
            except ImportError:
                logger.warning("agent-skills package not installed, skills disabled")

        # Add codemode toolset if enabled
        if request.enable_codemode:
            # Ensure MCP servers are loaded before building codemode toolset
            mcp_manager = get_mcp_manager()
            if not mcp_manager.get_servers():
                mcp_servers = await initialize_config_mcp_servers(discover_tools=True)
                mcp_manager.load_servers(mcp_servers)
                logger.info(
                    f"Loaded {len(mcp_servers)} MCP servers for codemode agent {agent_id}"
                )
            codemode_toolset = _build_codemode_toolset(
                request, http_request, sandbox=shared_sandbox
            )
            if codemode_toolset is not None:
                # Initialize the toolset to discover tools and generate bindings
                # This must happen before the agent can use execute_code
                logger.info(f"Starting codemode toolset for agent {agent_id}...")
                await codemode_toolset.start()

                # Log discovered tools from the registry
                if codemode_toolset.registry:
                    discovered_tools = codemode_toolset.registry.list_tools(
                        include_deferred=True
                    )
                    tool_names = [t.name for t in discovered_tools]
                    logger.info(
                        f"Codemode discovered {len(tool_names)} tools: {tool_names}"
                    )

                try:
                    generated_root = Path(codemode_toolset.config.generated_path)
                    servers_dir = generated_root / "servers"
                    if servers_dir.exists():
                        server_modules = sorted(
                            p.name
                            for p in servers_dir.iterdir()
                            if p.is_dir() and not p.name.startswith("__")
                        )
                        logger.info(
                            "Codemode bindings generated for servers: %s",
                            server_modules or "(none)",
                        )
                    else:
                        logger.warning(
                            "Codemode generated servers directory not found: %s",
                            servers_dir,
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

        logger.info(
            f"Creating agent '{agent_id}' with selected_mcp_servers={selected_mcp_servers}"
        )

        # Create the agent based on the library
        if request.agent_library == "pydantic-ai":
            # First create the underlying Pydantic AI Agent
            # NOTE: We don't pass MCP toolsets here. They will be dynamically
            # fetched at run time by the adapter to reflect current server state.
            # Only non-MCP toolsets (codemode, skills) are passed at construction.
            pydantic_agent = PydanticAgent(
                request.model,
                system_prompt=request.system_prompt,
                # Don't pass toolsets here - they'll be dynamically provided at run time
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

                def rebuild_codemode(new_servers: list[McpServerSelection]) -> Any:
                    """Rebuild codemode toolset with new MCP server selection."""
                    # Create a temporary request object with new servers
                    import copy

                    temp_request = copy.copy(request)
                    temp_request.selected_mcp_servers = new_servers
                    return _build_codemode_toolset(
                        temp_request, http_request, sandbox=shared_sandbox
                    )

                codemode_builder = rebuild_codemode

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

        # Register with context session for snapshot lookups (enables usage tracking)
        from ..context.session import register_agent as register_agent_for_context

        register_agent_for_context(
            agent_id, agent, {"name": request.name, "description": request.description}
        )
        logger.info(f"Registered agent '{agent_id}' for context snapshots")

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
                vercel_adapter = VercelAITransport(agent, agent_id=agent_id)
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
    for agent_id, (agent, info) in _agents.items():
        # Get detailed agent information
        agent_details = _get_agent_details(agent, agent_id, info)
        agents.append(agent_details)

    return AgentListResponse(agents=agents)


@router.get("/{agent_id}")
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


@router.delete("/{agent_id}")
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


class UpdateAgentMcpServersRequest(BaseModel):
    """Request to update an agent's MCP servers."""

    selected_mcp_servers: list[McpServerSelection] = Field(
        default_factory=list,
        description="New list of MCP server selections to use",
    )


@router.patch("/{agent_id}/mcp-servers")
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
# Agent MCP Server Lifecycle Management
# ============================================================================


class EnvVar(BaseModel):
    """Environment variable name-value pair."""

    name: str = Field(..., description="Environment variable name")
    value: str = Field(..., description="Environment variable value")


class StartAgentMcpServersRequest(BaseModel):
    """Request to start MCP servers for a running agent."""

    env_vars: list[EnvVar] = Field(
        default_factory=list,
        description="Environment variables to set before starting MCP servers",
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
    message: str


async def _start_mcp_servers_for_agent(
    agent_id: str,
    env_vars: list[EnvVar],
) -> tuple[list[str], list[str], list[dict[str, str]], bool]:
    """
    Internal helper to start MCP servers for a single agent.

    Returns:
        Tuple of (started_servers, already_running, failed_servers, codemode_rebuilt)
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
        return [], [], [], False

    lifecycle_manager = get_mcp_lifecycle_manager()

    started: list[str] = []
    already_running: list[str] = []
    failed: list[dict[str, str]] = []

    for selection in selected_servers:
        server_id = selection.id if hasattr(selection, "id") else str(selection)
        is_config = getattr(selection, "origin", "catalog") == "config"

        # Check if already running
        if lifecycle_manager.is_server_running(server_id, is_config=is_config):
            already_running.append(server_id)
            continue

        # Get server config from appropriate source
        config = None
        if is_config:
            config = lifecycle_manager.get_server_config_from_file(server_id)
        else:
            config = MCP_SERVER_CATALOG.get(server_id)

        if config is None:
            failed.append(
                {
                    "server_id": server_id,
                    "error": f"Server config not found (origin={getattr(selection, 'origin', 'unknown')})",
                }
            )
            continue

        # Start the server
        try:
            instance = await lifecycle_manager.start_server(server_id, config)
            if instance is not None:
                started.append(server_id)
            else:
                error = lifecycle_manager._failed_servers.get(
                    server_id, "Unknown error"
                )
                failed.append({"server_id": server_id, "error": str(error)})
        except Exception as e:
            failed.append({"server_id": server_id, "error": str(e)})

    # Rebuild Codemode toolset if enabled
    codemode_rebuilt = False
    if hasattr(adapter, "_codemode_builder") and adapter._codemode_builder is not None:
        try:
            logger.info(f"Rebuilding Codemode toolset for agent '{agent_id}'...")
            new_codemode = adapter._codemode_builder(selected_servers)
            if new_codemode is not None:
                # Initialize the new toolset
                await new_codemode.start()
                # Update the adapter's non-MCP toolsets
                if hasattr(adapter, "_non_mcp_toolsets"):
                    # Remove old codemode toolset
                    adapter._non_mcp_toolsets = [
                        t
                        for t in adapter._non_mcp_toolsets
                        if "Codemode" not in type(t).__name__
                    ]
                    adapter._non_mcp_toolsets.append(new_codemode)
                codemode_rebuilt = True
                logger.info(f"Codemode toolset rebuilt for agent '{agent_id}'")
        except Exception as e:
            logger.warning(f"Failed to rebuild Codemode toolset: {e}")

    return started, already_running, failed, codemode_rebuilt


@router.post("/mcp-servers/start")
async def start_all_agents_mcp_servers(
    request: StartAgentMcpServersRequest,
) -> AgentMcpServersResponse:
    """
    Start catalog MCP servers for all running agents.

    This endpoint starts the MCP servers that are configured in each agent's
    selected_mcp_servers list. Environment variables can be provided to
    configure the servers (e.g., API keys).

    If an agent has Codemode enabled, the Codemode toolset will be rebuilt
    to include the newly started servers as programmatic tools.

    Args:
        request: Environment variables to set before starting servers.

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
        # Set environment variables before starting servers
        for env_var in request.env_vars:
            os.environ[env_var.name] = env_var.value
            logger.info(f"Set environment variable: {env_var.name}")

        all_started: list[str] = []
        all_already_running: list[str] = []
        all_failed: list[dict[str, str]] = []
        any_codemode_rebuilt = False
        agents_processed: list[str] = []

        for agent_id in _agents:
            (
                started,
                already_running,
                failed,
                codemode_rebuilt,
            ) = await _start_mcp_servers_for_agent(agent_id, request.env_vars)
            all_started.extend(started)
            all_already_running.extend(already_running)
            all_failed.extend(failed)
            if codemode_rebuilt:
                any_codemode_rebuilt = True
            agents_processed.append(agent_id)

        message_parts = [f"Processed {len(agents_processed)} agent(s)"]
        if all_started:
            message_parts.append(f"started {len(all_started)} server(s)")
        if all_already_running:
            message_parts.append(f"{len(all_already_running)} already running")
        if all_failed:
            message_parts.append(f"{len(all_failed)} failed")

        return AgentMcpServersResponse(
            agent_id=None,
            agents_processed=agents_processed,
            started_servers=all_started,
            already_running=all_already_running,
            failed_servers=all_failed,
            codemode_rebuilt=any_codemode_rebuilt,
            message=", ".join(message_parts),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start MCP servers for all agents: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start MCP servers: {str(e)}",
        )


@router.post("/{agent_id}/mcp-servers/start")
async def start_agent_mcp_servers(
    agent_id: str,
    request: StartAgentMcpServersRequest,
) -> AgentMcpServersResponse:
    """
    Start catalog MCP servers defined for a specific running agent.

    This endpoint starts the MCP servers that are configured in the agent's
    selected_mcp_servers list. Environment variables can be provided to
    configure the servers (e.g., API keys).

    If the agent has Codemode enabled, the Codemode toolset will be rebuilt
    to include the newly started servers as programmatic tools.

    Args:
        agent_id: The agent identifier.
        request: Environment variables to set before starting servers.

    Returns:
        Status of each server start operation.

    Raises:
        HTTPException: If agent not found or operation fails.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    try:
        # Set environment variables before starting servers
        for env_var in request.env_vars:
            os.environ[env_var.name] = env_var.value
            logger.info(f"Set environment variable: {env_var.name}")

        (
            started,
            already_running,
            failed,
            codemode_rebuilt,
        ) = await _start_mcp_servers_for_agent(agent_id, request.env_vars)

        if not started and not already_running and not failed:
            return AgentMcpServersResponse(
                agent_id=agent_id,
                agents_processed=[agent_id],
                message="No MCP servers configured for this agent",
            )

        message_parts = []
        if started:
            message_parts.append(f"Started {len(started)} server(s)")
        if already_running:
            message_parts.append(f"{len(already_running)} already running")
        if failed:
            message_parts.append(f"{len(failed)} failed")

        return AgentMcpServersResponse(
            agent_id=agent_id,
            agents_processed=[agent_id],
            started_servers=started,
            already_running=already_running,
            failed_servers=failed,
            codemode_rebuilt=codemode_rebuilt,
            message=", ".join(message_parts)
            if message_parts
            else "No servers to start",
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

        for agent_id in _agents:
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


@router.post("/{agent_id}/mcp-servers/stop")
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
