# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
FastAPI application factory for agent-runtimes server.

Provides a configurable FastAPI application with:
- ACP protocol endpoints
- Health check endpoints
- CORS configuration
- OpenAPI documentation
- Demo agent for testing
"""

import asyncio
import logging
import multiprocessing as mp
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.routing import Mount

from .config.agents import get_agent_spec
from .mcp import (
    ensure_config_mcp_toolsets_event,
    get_mcp_lifecycle_manager,
    get_mcp_manager,
    initialize_config_mcp_servers,
    initialize_config_mcp_toolsets,
    shutdown_config_mcp_toolsets,
)
from .mcp.catalog_mcp_servers import get_catalog_server
from .routes import (
    a2a_protocol_router,
    a2ui_router,
    acp_router,
    agents_router,
    agui_router,
    configure_router,
    examples_router,
    get_a2a_mounts,
    get_agui_mounts,
    get_example_mounts,
    health_router,
    history_router,
    identity_router,
    mcp_proxy_router,
    mcp_router,
    mcp_ui_router,
    set_a2a_app,
    skills_router,
    start_a2a_task_managers,
    stop_a2a_task_managers,
    vercel_ai_router,
)
from .routes.agents import set_api_prefix

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

# Reduce noise from verbose libraries
logging.getLogger("botocore").setLevel(logging.WARNING)
logging.getLogger("botocore.parsers").setLevel(logging.WARNING)
logging.getLogger("botocore.hooks").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)


def _is_reload_parent_process() -> bool:
    """Return True when running inside the reload supervisor parent."""
    return "--reload" in sys.argv and mp.current_process().name == "MainProcess"


async def _create_and_register_cli_agent(
    app: FastAPI,
    agent_id: str,
    agent_spec: Any,
    enable_codemode: bool,
    skills: list[str],
    all_mcp_servers: list[Any],
    api_prefix: str,
    protocol: str = "ag-ui",
) -> None:
    """
    Create and register an agent from CLI options.

    This is called when --agent-id is provided to actually create an agent
    with the specified codemode and skills settings.

    Args:
        app: The FastAPI app instance
        agent_id: The agent ID/name to register
        agent_spec: The AgentSpec from the library
        enable_codemode: Whether codemode is enabled (--codemode flag)
        skills: List of skill names to enable (--skills flag)
        all_mcp_servers: All MCP servers (agent spec + CLI servers)
        api_prefix: API prefix for routes
        protocol: Transport protocol (ag-ui, vercel-ai, vercel-ai-jupyter, a2a)
    """

    from pydantic_ai import Agent as PydanticAgent

    from .adapters.pydantic_ai_adapter import PydanticAIAdapter
    from .context.session import register_agent as register_agent_for_context
    from .routes.acp import AgentCapabilities, AgentInfo, register_agent
    from .routes.agui import get_agui_app, register_agui_agent
    from .routes.configure import _codemode_state
    from .routes.mcp_ui import register_mcp_ui_agent
    from .transports import AGUITransport, MCPUITransport

    logger.info(
        f"Creating agent '{agent_id}' with codemode={enable_codemode}, skills={skills}"
    )

    # Update the global codemode state so AgentDetails shows correct status
    _codemode_state["enabled"] = enable_codemode
    _codemode_state["skills"] = list(skills) if skills else []

    # Build list of non-MCP toolsets (codemode, skills)
    non_mcp_toolsets = []
    shared_sandbox = None

    # Create shared sandbox if both codemode and skills are enabled
    # Use CodeSandboxManager to support Jupyter sandbox configuration via CLI/API
    skills_enabled = len(skills) > 0
    if enable_codemode and skills_enabled:
        try:
            from .services.code_sandbox_manager import get_code_sandbox_manager

            # Get the sandbox manager and configure if Jupyter sandbox URL is provided
            sandbox_manager = get_code_sandbox_manager()
            jupyter_sandbox_url = os.getenv("AGENT_RUNTIMES_JUPYTER_SANDBOX")
            if jupyter_sandbox_url:
                sandbox_manager.configure_from_url(jupyter_sandbox_url)
                logger.info(
                    f"Configured sandbox manager for Jupyter: {jupyter_sandbox_url.split('?')[0]}"
                )
            else:
                # Use default local-eval sandbox
                sandbox_manager.configure(variant="local-eval")

            shared_sandbox = sandbox_manager.get_sandbox()
            logger.info(
                f"Created shared {sandbox_manager.variant} sandbox for agent {agent_id}"
            )
        except ImportError as e:
            logger.warning(
                f"code_sandboxes not installed, cannot create shared sandbox: {e}"
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

            if PYDANTIC_AI_AVAILABLE:
                repo_root = Path(__file__).resolve().parents[1]
                skills_path = str((repo_root / "skills").resolve())

                selected_set = set(skills)
                selected_skills: list[AgentSkill] = []

                for skill_md in Path(skills_path).rglob("SKILL.md"):
                    try:
                        skill = AgentSkill.from_skill_md(skill_md)
                    except Exception as exc:
                        logger.warning(f"Failed to load skill from {skill_md}: {exc}")
                        continue
                    if skill.name in selected_set:
                        selected_skills.append(skill)
                        logger.info(f"Loaded skill: {skill.name}")

                missing = selected_set - {s.name for s in selected_skills}
                if missing:
                    logger.warning(
                        f"Requested skills not found in {skills_path}: {sorted(missing)}"
                    )

                # Create executor for running skill scripts
                if shared_sandbox is not None:
                    executor = SandboxExecutor(shared_sandbox)
                    logger.info("Using shared sandbox for skills executor")
                else:
                    # Use CodeSandboxManager for skills-only sandbox as well
                    from .services.code_sandbox_manager import get_code_sandbox_manager

                    sandbox_manager = get_code_sandbox_manager()

                    # Configure if Jupyter sandbox URL is provided
                    jupyter_sandbox_url = os.getenv("AGENT_RUNTIMES_JUPYTER_SANDBOX")
                    if jupyter_sandbox_url:
                        sandbox_manager.configure_from_url(jupyter_sandbox_url)
                    else:
                        sandbox_manager.configure(variant="local-eval")

                    skills_sandbox = sandbox_manager.get_sandbox()
                    executor = SandboxExecutor(skills_sandbox)

                skills_toolset = AgentSkillsToolset(
                    skills=selected_skills,
                    executor=executor,
                )
                non_mcp_toolsets.append(skills_toolset)
                logger.info(
                    f"Added AgentSkillsToolset with {len(selected_skills)} skills for agent {agent_id}"
                )
            else:
                logger.warning("agent-skills pydantic-ai integration not available")
        except ImportError as e:
            logger.warning(f"agent-skills package not installed, skills disabled: {e}")

    # Add codemode toolset if enabled
    codemode_toolset = None
    if enable_codemode:
        try:
            from agent_codemode import (
                PYDANTIC_AI_AVAILABLE as CODEMODE_AVAILABLE,
            )
            from agent_codemode import (
                CodeModeConfig,
                CodemodeToolset,
                MCPServerConfig,
                ToolRegistry,
            )

            if CODEMODE_AVAILABLE:
                # Build registry with all MCP servers
                registry = ToolRegistry()

                for mcp_server in all_mcp_servers:
                    if not mcp_server.enabled:
                        continue

                    # Normalize server name to valid Python identifier
                    normalized_name = "".join(
                        c if c.isalnum() or c == "_" else "_" for c in mcp_server.id
                    )

                    # Pass through ALL environment variables from mcp_server config
                    # This includes both required_env_vars and any custom env from config
                    server_env: dict[str, str] = {}

                    # Add required env vars
                    for env_key in mcp_server.required_env_vars:
                        env_val = os.getenv(env_key)
                        if env_val:
                            server_env[env_key] = env_val

                    # Add any custom env from mcp_server.env (with expansion)
                    if mcp_server.env:
                        for env_key, env_value in mcp_server.env.items():
                            # Expand ${VAR} syntax
                            if isinstance(env_value, str) and "${" in env_value:
                                import re

                                pattern = r"\$\{([^}]+)\}"

                                def replace(match: re.Match[str]) -> str:
                                    var_name = match.group(1)
                                    return os.environ.get(var_name, "")

                                expanded_value = re.sub(pattern, replace, env_value)
                                server_env[env_key] = expanded_value
                            else:
                                server_env[env_key] = env_value

                    registry.add_server(
                        MCPServerConfig(
                            name=normalized_name,
                            url=mcp_server.url
                            if mcp_server.transport == "http"
                            else "",
                            command=mcp_server.command or "",
                            args=mcp_server.args or [],
                            env=server_env,
                            enabled=mcp_server.enabled,
                        )
                    )
                    logger.info(
                        f"Added MCP server to codemode registry: {normalized_name}"
                    )

                # Configure paths for codemode
                # Use CLI/env configured folders if provided, otherwise use defaults
                repo_root = Path(__file__).resolve().parents[1]
                generated_folder = os.getenv("AGENT_RUNTIMES_GENERATED_CODE_FOLDER")
                skills_folder_path = os.getenv("AGENT_RUNTIMES_SKILLS_FOLDER")

                # Get MCP proxy URL from sandbox manager or environment
                # This enables the two-container architecture where Jupyter kernel
                # calls tools via HTTP to the agent-runtimes container
                mcp_proxy_url = os.getenv("AGENT_RUNTIMES_MCP_PROXY_URL")
                if not mcp_proxy_url and shared_sandbox is not None:
                    # If sandbox manager has a proxy URL configured, use it
                    try:
                        from .services.code_sandbox_manager import (
                            get_code_sandbox_manager,
                        )

                        manager_status = get_code_sandbox_manager().get_status()
                        mcp_proxy_url = manager_status.get("mcp_proxy_url")
                    except Exception:
                        pass

                # For Jupyter sandboxes, always use HTTP proxy if not already set
                # This ensures local Jupyter examples also use the HTTP proxy pattern
                if not mcp_proxy_url and shared_sandbox is not None:
                    # Check if it's a Jupyter sandbox
                    if hasattr(shared_sandbox, "_server_url"):
                        # Default to local agent-runtimes proxy URL
                        mcp_proxy_url = "http://localhost:8765/api/v1/mcp/proxy"
                        logger.info(
                            f"Using default MCP proxy URL for Jupyter sandbox: {mcp_proxy_url}"
                        )

                codemode_config = CodeModeConfig(
                    workspace_path=str((repo_root / "workspace").resolve()),
                    generated_path=generated_folder
                    or str((repo_root / "generated").resolve()),
                    skills_path=skills_folder_path
                    or str((repo_root / "skills").resolve()),
                    allow_direct_tool_calls=False,
                    **(
                        {}
                        if mcp_proxy_url is None
                        else {"mcp_proxy_url": mcp_proxy_url}
                    ),
                )

                logger.info(
                    f"Codemode config: generated_path={codemode_config.generated_path}, skills_path={codemode_config.skills_path}, mcp_proxy_url={getattr(codemode_config, 'mcp_proxy_url', None)}"
                )

                codemode_toolset = CodemodeToolset(
                    registry=registry,
                    config=codemode_config,
                    sandbox=shared_sandbox,
                    allow_discovery_tools=True,
                )

                # Initialize the toolset
                logger.info(f"Starting codemode toolset for agent {agent_id}...")
                await codemode_toolset.start()

                # Log discovered tools
                if codemode_toolset.registry:
                    discovered_tools = codemode_toolset.registry.list_tools(
                        include_deferred=True
                    )
                    tool_names = [t.name for t in discovered_tools]
                    logger.info(
                        f"Codemode discovered {len(tool_names)} tools: {tool_names}"
                    )

                non_mcp_toolsets.append(codemode_toolset)
                logger.info(
                    f"Added and initialized CodemodeToolset for agent {agent_id}"
                )
            else:
                logger.warning("agent-codemode pydantic-ai integration not available")
        except ImportError as e:
            logger.warning(
                f"agent-codemode package not installed, codemode disabled: {e}"
            )

    # Build selected MCP servers list for the adapter
    # When codemode is enabled, MCP servers are accessed via CodemodeToolset registry
    # If all_mcp_servers is empty but we have pending servers in app state, use those for selection
    from .routes.agents import McpServerSelection

    # Check for pending MCP servers (stored when --no-catalog-mcp-servers is used)
    pending_servers = getattr(app.state, "pending_mcp_servers", []) if app else []
    servers_for_selection = all_mcp_servers if all_mcp_servers else pending_servers

    selected_mcp_servers = [
        McpServerSelection(id=s.id, origin="catalog") for s in servers_for_selection
    ]
    logger.info(
        f"Agent '{agent_id}' selected MCP servers: {[s.id for s in selected_mcp_servers]}"
    )

    # Create the underlying Pydantic AI Agent
    # Use default model - can be configured via environment
    model = os.environ.get(
        "AGENT_RUNTIMES_MODEL", "bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0"
    )
    system_prompt = agent_spec.description or "You are a helpful AI assistant."

    pydantic_agent = PydanticAgent(
        model,
        system_prompt=system_prompt,
    )

    # Create codemode builder for dynamic rebuilding
    codemode_builder = None
    if enable_codemode:

        def rebuild_codemode(new_servers: list[str | dict[str, str]]) -> Any:
            """Rebuild codemode toolset with new MCP server selection.

            This function properly rebuilds the codemode toolset by:
            1. Creating a new ToolRegistry with the specified servers
            2. Adding MCPServerConfig for each server from mcp_manager
            3. Creating a new CodemodeToolset with the new registry
            """
            nonlocal codemode_toolset
            logger.info(f"Rebuild codemode requested with servers: {new_servers}")

            try:
                from agent_codemode import (
                    CodeModeConfig,
                    CodemodeToolset,
                    MCPServerConfig,
                    ToolRegistry,
                )

                # Get the running MCP servers from mcp_manager
                mcp_manager = get_mcp_manager()
                available_servers = mcp_manager.get_servers()
                logger.info(
                    f"rebuild_codemode: Found {len(available_servers)} servers in mcp_manager"
                )

                # Create new registry with the available servers
                new_registry = ToolRegistry()

                # Extract server IDs from new_servers (may be McpServerSelection objects or dicts)
                server_ids = set()
                for s in new_servers:
                    if hasattr(s, "id"):
                        server_ids.add(s.id)
                    elif isinstance(s, dict) and "id" in s:
                        server_ids.add(s["id"])
                    elif isinstance(s, str):
                        server_ids.add(s)

                logger.info(f"rebuild_codemode: Target server IDs: {server_ids}")

                # Add servers to the registry
                servers_added = []
                for server in available_servers:
                    if not server.enabled:
                        continue
                    if server_ids and server.id not in server_ids:
                        continue

                    # Normalize server name to valid Python identifier
                    normalized_name = "".join(
                        c if c.isalnum() or c == "_" else "_" for c in server.id
                    )

                    # Get env vars from environment
                    server_env: dict[str, str] = {}
                    for env_key in [
                        "TAVILY_API_KEY",
                        "KAGGLE_KEY",
                        "KAGGLE_USERNAME",
                        "GITHUB_TOKEN",
                        "GITHUB_PERSONAL_ACCESS_TOKEN",
                    ]:
                        env_val = os.getenv(env_key)
                        if env_val:
                            server_env[env_key] = env_val

                    new_registry.add_server(
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
                    f"rebuild_codemode: Added {len(servers_added)} servers to registry: {servers_added}"
                )

                # Create new config - use CLI/env configured folders if provided
                repo_root = Path(__file__).resolve().parents[1]
                generated_folder = os.getenv("AGENT_RUNTIMES_GENERATED_CODE_FOLDER")
                skills_folder_path = os.getenv("AGENT_RUNTIMES_SKILLS_FOLDER")

                # Get MCP proxy URL from sandbox manager or environment
                # This enables the two-container architecture where Jupyter kernel
                # calls tools via HTTP to the agent-runtimes container
                mcp_proxy_url = os.getenv("AGENT_RUNTIMES_MCP_PROXY_URL")
                if not mcp_proxy_url:
                    try:
                        from .services.code_sandbox_manager import (
                            get_code_sandbox_manager,
                        )

                        manager_status = get_code_sandbox_manager().get_status()
                        mcp_proxy_url = manager_status.get("mcp_proxy_url")
                    except Exception:
                        pass

                new_config = CodeModeConfig(
                    workspace_path=str((repo_root / "workspace").resolve()),
                    generated_path=generated_folder
                    or str((repo_root / "generated").resolve()),
                    skills_path=skills_folder_path
                    or str((repo_root / "skills").resolve()),
                    allow_direct_tool_calls=False,
                    **(
                        {}
                        if mcp_proxy_url is None
                        else {"mcp_proxy_url": mcp_proxy_url}
                    ),
                )

                logger.info(
                    f"rebuild_codemode: Using generated_path={new_config.generated_path}, skills_path={new_config.skills_path}, mcp_proxy_url={getattr(new_config, 'mcp_proxy_url', None)}"
                )

                # Get fresh sandbox from manager (may have been reconfigured via API)
                # Do NOT use the captured shared_sandbox from agent creation time
                # This ensures that if the sandbox manager was reconfigured
                # (e.g., from local-eval to local-jupyter via the /mcp-servers/start API),
                # the rebuilt codemode will use the new sandbox configuration.
                #
                # IMPORTANT: We get an unstarted sandbox to avoid pickle errors.
                # The Jupyter sandbox creates websocket connections and asyncio Futures
                # when started, which cannot be pickled. By passing an unstarted sandbox,
                # the CodemodeToolset can start it lazily when code is executed.
                fresh_sandbox = None
                try:
                    from .services.code_sandbox_manager import get_code_sandbox_manager

                    sandbox_manager = get_code_sandbox_manager()
                    # Get the sandbox (starts it if needed - this connects to the colocated Jupyter server)
                    fresh_sandbox = sandbox_manager.get_sandbox()
                    logger.info(
                        f"rebuild_codemode: Using {sandbox_manager.variant} sandbox "
                        f"(url={sandbox_manager.config.jupyter_url})"
                    )
                except ImportError as e:
                    logger.warning(
                        f"rebuild_codemode: code_sandboxes not available, using None: {e}"
                    )

                # Create new toolset with the new registry and fresh sandbox
                new_codemode = CodemodeToolset(
                    registry=new_registry,
                    config=new_config,
                    sandbox=fresh_sandbox,
                    allow_discovery_tools=True,
                )

                # Update the reference
                codemode_toolset = new_codemode
                logger.info(
                    "rebuild_codemode: Successfully created new CodemodeToolset"
                )
                return new_codemode

            except Exception as e:
                logger.error(
                    f"rebuild_codemode: Failed to rebuild codemode toolset: {e}",
                    exc_info=True,
                )
                # Return the old toolset on failure
                return codemode_toolset

        codemode_builder = rebuild_codemode

    # Wrap with our adapter
    agent = PydanticAIAdapter(
        agent=pydantic_agent,
        name=agent_spec.name,
        description=agent_spec.description,
        agent_id=agent_id,
        selected_mcp_servers=selected_mcp_servers,
        non_mcp_toolsets=non_mcp_toolsets,
        codemode_builder=codemode_builder,
    )

    # Create agent info with protocol
    info = AgentInfo(
        id=agent_id,
        name=agent_spec.name,
        description=agent_spec.description,
        capabilities=AgentCapabilities(
            streaming=True,
            tool_calling=True,
            code_execution=enable_codemode,
        ),
        protocol=protocol,
    )

    # Register with ACP (base registration)
    register_agent(agent, info)
    logger.info(f"Registered CLI agent '{agent_id}' with ACP (protocol: {protocol})")

    # Register with context session for snapshot lookups
    register_agent_for_context(
        agent_id,
        agent,
        {"name": agent_spec.name, "description": agent_spec.description},
    )
    logger.info(f"Registered agent '{agent_id}' for context snapshots")

    # Register with the selected protocol transport
    if protocol == "ag-ui":
        # Register with AG-UI
        try:
            agui_adapter = AGUITransport(agent, agent_id=agent_id)
            register_agui_agent(agent_id, agui_adapter)
            logger.info(f"Registered agent with AG-UI: {agent_id}")

            # Dynamically mount AG-UI route
            agui_app = get_agui_app(agent_id)
            if agui_app and app:
                mount_path = f"{api_prefix}/ag-ui/{agent_id}"
                app.mount(mount_path, agui_app, name=f"agui-{agent_id}")
                logger.info(f"Dynamically mounted AG-UI route: {mount_path}")
        except Exception as e:
            logger.warning(f"Could not register with AG-UI: {e}")
    elif protocol == "vercel-ai":
        # Register with Vercel AI
        try:
            from .routes.vercel_ai import register_vercel_agent
            from .transports import VercelAITransport

            vercel_adapter = VercelAITransport(agent, agent_id=agent_id)
            register_vercel_agent(agent_id, vercel_adapter)
            logger.info(f"Registered agent with Vercel AI: {agent_id}")
        except Exception as e:
            logger.warning(f"Could not register with Vercel AI: {e}")
    elif protocol == "vercel-ai-jupyter":
        # Register with Vercel AI Jupyter (same as vercel-ai but with jupyter execution context)
        try:
            from .routes.vercel_ai import register_vercel_agent
            from .transports import VercelAITransport

            vercel_adapter = VercelAITransport(agent, agent_id=agent_id)
            register_vercel_agent(agent_id, vercel_adapter)
            logger.info(f"Registered agent with Vercel AI Jupyter: {agent_id}")
        except Exception as e:
            logger.warning(f"Could not register with Vercel AI Jupyter: {e}")
    elif protocol == "a2a":
        # Register with A2A
        try:
            from .routes.a2a import A2AAgentCard, register_a2a_agent

            # Create A2A agent card from agent info
            a2a_card = A2AAgentCard(
                id=agent_id,
                name=info.name,
                description=info.description,
                url=f"{api_prefix}/a2a/agents/{agent_id}",
            )
            register_a2a_agent(agent, a2a_card)
            logger.info(f"Registered agent with A2A: {agent_id}")
        except Exception as e:
            logger.warning(f"Could not register with A2A: {e}")

    # Register with MCP-UI for tools (always, regardless of protocol)
    try:
        mcp_ui_adapter = MCPUITransport(agent)
        register_mcp_ui_agent(agent_id, mcp_ui_adapter)
        logger.info(f"Registered agent with MCP-UI: {agent_id}")
    except Exception as e:
        logger.warning(f"Could not register with MCP-UI: {e}")

    logger.info(
        f"✓ Successfully created and registered CLI agent: {agent_id} (protocol: {protocol})"
    )


class ServerConfig(BaseModel):
    """Configuration for the agent-runtimes server."""

    title: str = "Agent Runtimes Server"
    description: str = "FastAPI server for agent-runtimes with ACP protocol support"
    version: str = "0.1.0"

    # CORS settings
    cors_origins: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_credentials: bool = True
    cors_allow_methods: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_headers: list[str] = Field(default_factory=lambda: ["*"])

    # Server settings
    debug: bool = False
    docs_url: str | None = "/docs"
    redoc_url: str | None = "/redoc"
    openapi_url: str | None = "/openapi.json"

    # API prefix
    api_prefix: str = "/api/v1"


def create_app(config: ServerConfig | None = None) -> FastAPI:
    """
    Create and configure the FastAPI application.

    Args:
        config: Server configuration. If None, uses defaults.

    Returns:
        Configured FastAPI application.
    """
    if config is None:
        config = ServerConfig()

    # Set the API prefix for dynamic agent creation
    set_api_prefix(config.api_prefix)

    # Store reference to background task to prevent garbage collection
    _mcp_toolsets_task: asyncio.Task[Any] | None = None
    _mcp_servers_task: asyncio.Task[Any] | None = None

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        """
        Application lifespan handler.

        Yields
        ------
        None
            Control is yielded to FastAPI during the application runtime.
        """
        nonlocal _mcp_toolsets_task, _mcp_servers_task
        logger.info("Starting agent-runtimes server...")

        is_reload_parent = _is_reload_parent_process()
        logger.info(f"Reload parent check: {is_reload_parent}")

        # Check if config MCP servers should be skipped (--no-config-mcp-servers CLI flag)
        no_config_mcp_servers = (
            os.environ.get("AGENT_RUNTIMES_NO_CONFIG_MCP_SERVERS", "").lower() == "true"
        )

        if is_reload_parent:
            logger.info(
                "Reload parent detected; deferring MCP startup to worker process"
            )
        elif no_config_mcp_servers:
            logger.info(
                "Skipping config MCP server startup (--no-config-mcp-servers flag)"
            )
        else:
            # Initialize Pydantic AI MCP toolsets in a background task
            # This allows FastAPI to start immediately while MCP servers start async
            logger.info("Initializing Pydantic AI MCP toolsets (background startup)...")
            ensure_config_mcp_toolsets_event()

            async def initialize_toolsets_with_logging() -> None:
                """Wrapper to catch and log any exceptions from toolset initialization."""
                try:
                    await initialize_config_mcp_toolsets()
                    logger.info(
                        "✓ MCP toolset background initialization completed successfully"
                    )
                except Exception as e:
                    logger.error(
                        f"✗ MCP toolset background initialization failed: {e}",
                        exc_info=True,
                    )

            _mcp_toolsets_task = asyncio.create_task(initialize_toolsets_with_logging())
            logger.info(
                "MCP toolset initialization started (servers starting in background)"
            )

            # Initialize MCP servers (check availability and discover tools) - for the frontend/config API
            # This also runs async but we need to wait for it before loading into manager
            logger.info("Initializing MCP servers for configuration API...")

            async def load_mcp_servers_background() -> None:
                mcp_servers = await initialize_config_mcp_servers(discover_tools=True)
                mcp_manager = get_mcp_manager()
                mcp_manager.load_servers(mcp_servers)
                logger.info(f"Loaded {len(mcp_servers)} MCP servers into manager")

            _mcp_servers_task = asyncio.create_task(load_mcp_servers_background())

        # Set app reference for dynamic A2A route mounting
        set_a2a_app(app, config.api_prefix)

        # Register default agent if specified via CLI (--agent-id flag)
        default_agent_id = os.environ.get("AGENT_RUNTIMES_DEFAULT_AGENT")
        if default_agent_id:
            agent_spec = get_agent_spec(default_agent_id)
            if agent_spec:
                agent_name = os.environ.get("AGENT_RUNTIMES_AGENT_NAME", "default")

                # Read CLI flags for codemode, skills, and additional MCP servers
                enable_codemode = (
                    os.environ.get("AGENT_RUNTIMES_CODEMODE", "").lower() == "true"
                )
                skills_str = os.environ.get("AGENT_RUNTIMES_SKILLS", "")
                skills_list = (
                    [s.strip() for s in skills_str.split(",") if s.strip()]
                    if skills_str
                    else list(
                        agent_spec.skills
                    )  # Use agent spec skills if no CLI override
                )
                cli_mcp_servers_str = os.environ.get("AGENT_RUNTIMES_MCP_SERVERS", "")
                cli_mcp_servers = (
                    [s.strip() for s in cli_mcp_servers_str.split(",") if s.strip()]
                    if cli_mcp_servers_str
                    else []
                )
                protocol = os.environ.get("AGENT_RUNTIMES_PROTOCOL", "ag-ui")
                no_catalog_mcp_servers = (
                    os.environ.get("AGENT_RUNTIMES_NO_CATALOG_MCP_SERVERS", "").lower()
                    == "true"
                )

                logger.info(
                    f"Registering default agent from catalog: {agent_spec.name} (as '{agent_name}')"
                )
                logger.info(f"  Protocol: {protocol}")
                logger.info(f"  Codemode: {enable_codemode}")
                logger.info(f"  Skills: {skills_list}")
                logger.info(f"  CLI MCP servers: {cli_mcp_servers}")
                logger.info(
                    f"  Agent spec MCP servers: {[s.id for s in agent_spec.mcp_servers]}"
                )
                logger.info(f"  No catalog MCP servers: {no_catalog_mcp_servers}")

                # Determine which MCP servers to use:
                # - If --no-catalog-mcp-servers is specified, skip agent spec MCP servers entirely
                # - If --mcp-servers is specified, use ONLY those (overrides agent spec servers)
                # - Otherwise, use the agent spec servers
                mcp_manager = get_mcp_manager()
                lifecycle_manager = get_mcp_lifecycle_manager()

                if no_catalog_mcp_servers:
                    # Skip all catalog MCP servers (both from agent spec and CLI --mcp-servers)
                    # But still store the agent spec servers so they can be started later via API
                    logger.info(
                        "Catalog MCP servers disabled (--no-catalog-mcp-servers flag)"
                    )
                    all_mcp_servers: list[Any] = []

                    # Store agent spec servers in app state for later API startup
                    # This enables the /api/v1/agents/mcp-servers/start endpoint to start them
                    app.state.pending_mcp_servers = list(agent_spec.mcp_servers)
                    logger.info(
                        f"Stored {len(agent_spec.mcp_servers)} pending MCP servers for later API startup: {[s.id for s in agent_spec.mcp_servers]}"
                    )
                elif cli_mcp_servers:
                    # CLI MCP servers OVERRIDE agent spec servers
                    logger.info(
                        f"CLI --mcp-servers specified: using ONLY {cli_mcp_servers} (overriding agent spec servers)"
                    )
                    all_mcp_servers = []
                    for server_id in cli_mcp_servers:
                        catalog_server = get_catalog_server(server_id)
                        if catalog_server:
                            mcp_manager.add_server(catalog_server)
                            all_mcp_servers.append(catalog_server)
                            logger.info(
                                f"Loaded CLI MCP server from catalog: {server_id}"
                            )
                        else:
                            logger.warning(
                                f"CLI MCP server '{server_id}' not found in catalog"
                            )
                else:
                    # No CLI MCP servers, use agent spec servers
                    logger.info(
                        "No CLI --mcp-servers specified: using agent spec servers"
                    )
                    for mcp_server in agent_spec.mcp_servers:
                        mcp_manager.add_server(mcp_server)
                    all_mcp_servers = list(agent_spec.mcp_servers)
                    logger.info(
                        f"Loaded {len(agent_spec.mcp_servers)} MCP servers from agent spec"
                    )

                async def start_all_mcp_servers() -> None:
                    """Start all MCP servers for the default agent."""
                    for mcp_server in all_mcp_servers:
                        try:
                            instance = await lifecycle_manager.start_server(
                                mcp_server.id, mcp_server
                            )
                            if instance:
                                logger.info(f"✓ Started MCP server: {mcp_server.id}")
                            else:
                                logger.warning(
                                    f"✗ Failed to start MCP server: {mcp_server.id}"
                                )
                        except Exception as e:
                            logger.error(
                                f"✗ Error starting MCP server '{mcp_server.id}': {e}"
                            )

                # Start MCP servers in background (only if codemode is disabled)
                # When codemode is enabled, it will start its own MCP server instances
                if all_mcp_servers and not enable_codemode:
                    logger.info(
                        f"Starting {len(all_mcp_servers)} MCP servers for agent '{agent_name}'..."
                    )
                    await start_all_mcp_servers()
                elif all_mcp_servers and enable_codemode:
                    logger.info(
                        "Codemode enabled: skipping lifecycle manager MCP server startup (codemode will manage servers)"
                    )

                # Create and register the agent with codemode and skills if enabled
                await _create_and_register_cli_agent(
                    app=app,
                    agent_id=agent_name,
                    agent_spec=agent_spec,
                    enable_codemode=enable_codemode,
                    skills=skills_list,
                    all_mcp_servers=all_mcp_servers,
                    api_prefix=config.api_prefix,
                    protocol=protocol,
                )
            else:
                logger.warning(
                    f"Default agent '{default_agent_id}' not found in library"
                )

        # Demo agent auto-registration disabled - use the UI to create agents dynamically
        # To manually register the demo agent, run: python -m agent_runtimes.examples.demo.demo_agent

        # Add AG-UI mounts after agents are registered
        for mount in get_agui_mounts():
            # Mount under /api/v1/ag-ui/{agent_id}
            full_mount = Mount(f"{config.api_prefix}/ag-ui{mount.path}", app=mount.app)
            app.routes.append(full_mount)
            logger.info(f"Mounted AG-UI route: {config.api_prefix}/ag-ui{mount.path}")

        # Add A2A mounts (FastA2A apps) after agents are registered
        for mount in get_a2a_mounts():
            # Mount under /api/v1/a2a/agents/{agent_id}
            full_mount = Mount(
                f"{config.api_prefix}/a2a/agents{mount.path}", app=mount.app
            )
            app.routes.append(full_mount)
            logger.info(
                f"Mounted A2A route: {config.api_prefix}/a2a/agents{mount.path}"
            )

        # Add AG-UI example mounts
        for mount in get_example_mounts(config.api_prefix):
            app.routes.append(mount)
            logger.info(f"Mounted example route: {mount.path}/")

        # Start A2A TaskManagers (required for FastA2A apps to handle requests)
        await start_a2a_task_managers()

        yield

        # Stop A2A TaskManagers on shutdown
        await stop_a2a_task_managers()

        # Wait for MCP toolsets task to complete (or cancel if still running)
        if _mcp_toolsets_task is not None and not _mcp_toolsets_task.done():
            logger.info("Waiting for MCP toolsets initialization to complete...")
            try:
                await asyncio.wait_for(_mcp_toolsets_task, timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("MCP toolsets initialization timed out, cancelling...")
                _mcp_toolsets_task.cancel()
                try:
                    await _mcp_toolsets_task
                except asyncio.CancelledError:
                    pass

        # Wait for MCP server loading to complete (if still running)
        if _mcp_servers_task is not None and not _mcp_servers_task.done():
            logger.info("Waiting for MCP server manager load to complete...")
            try:
                await asyncio.wait_for(_mcp_servers_task, timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("MCP server manager load timed out, cancelling...")
                _mcp_servers_task.cancel()
                try:
                    await _mcp_servers_task
                except asyncio.CancelledError:
                    pass

        # Shutdown MCP toolsets (stop all MCP server subprocesses)
        if not _is_reload_parent_process():
            await shutdown_config_mcp_toolsets()

        logger.info("Shutting down agent-runtimes server...")

    app = FastAPI(
        title=config.title,
        description=config.description,
        version=config.version,
        debug=config.debug,
        docs_url=config.docs_url,
        redoc_url=config.redoc_url,
        openapi_url=config.openapi_url,
        lifespan=lifespan,
    )

    # Add CORS middleware - must be added before other middleware
    # Allow all origins for development and cross-origin agent runtimes
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins
        allow_credentials=True,
        allow_methods=["*"],  # Allow all methods
        allow_headers=["*"],  # Allow all headers
        expose_headers=["*"],  # Expose all headers to the client
    )

    # Include routers
    app.include_router(health_router)
    app.include_router(history_router)  # No prefix - frontend calls /history directly
    app.include_router(identity_router)  # No prefix - uses /api/v1/identity internally
    app.include_router(agents_router, prefix=config.api_prefix)
    app.include_router(acp_router, prefix=config.api_prefix)
    app.include_router(configure_router, prefix=config.api_prefix)
    app.include_router(mcp_router, prefix=config.api_prefix)
    app.include_router(mcp_proxy_router, prefix=config.api_prefix)
    app.include_router(skills_router, prefix=config.api_prefix)
    app.include_router(vercel_ai_router, prefix=config.api_prefix)
    app.include_router(agui_router, prefix=config.api_prefix)
    app.include_router(mcp_ui_router, prefix=config.api_prefix)
    app.include_router(a2a_protocol_router, prefix=config.api_prefix)
    app.include_router(a2ui_router, prefix=config.api_prefix)
    app.include_router(examples_router, prefix=config.api_prefix)

    # Note: AG-UI mounts and example mounts are added dynamically during lifespan startup

    # Root endpoint
    @app.get("/")
    async def root() -> dict[str, Any]:
        """Root endpoint with service information."""
        return {
            "service": config.title,
            "version": config.version,
            "docs": config.docs_url,
            "endpoints": {
                "health": "/health",
                "agents": f"{config.api_prefix}/agents",
                "acp": f"{config.api_prefix}/acp",
                "configure": f"{config.api_prefix}/configure",
                "mcp_servers": f"{config.api_prefix}/mcp/servers",
                "vercel_ai": f"{config.api_prefix}/vercel-ai/chat",
                "ag_ui": f"{config.api_prefix}/ag-ui/",
                "mcp_ui": f"{config.api_prefix}/mcp-ui/",
                "a2a": f"{config.api_prefix}/a2a/",
                "a2ui": f"{config.api_prefix}/a2ui/",
                "examples": f"{config.api_prefix}/examples/",
            },
        }

    return app


def create_dev_app() -> FastAPI:
    """
    Create a development application with debug settings.

    Returns:
        FastAPI application configured for development.
    """
    config = ServerConfig(
        debug=True,
        cors_origins=["*"],
    )
    return create_app(config)


def create_production_app(
    cors_origins: list[str] | None = None,
) -> FastAPI:
    """
    Create a production application with stricter settings.

    Args:
        cors_origins: Allowed CORS origins. Defaults to empty list.

    Returns:
        FastAPI application configured for production.
    """
    config = ServerConfig(
        debug=False,
        cors_origins=cors_origins or [],
        cors_allow_credentials=False,
    )
    return create_app(config)


# Default app instance for uvicorn
app = create_app()
