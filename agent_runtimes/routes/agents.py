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
from starlette.routing import Mount

from pydantic_ai import Agent as PydanticAgent

from ..adapters.pydantic_ai_adapter import PydanticAIAdapter
from ..mcp import get_mcp_manager, initialize_mcp_servers
from ..mcp.lifecycle import get_mcp_lifecycle_manager
from ..config.mcp_servers import MCP_SERVER_CATALOG
from ..transports import AGUITransport, VercelAITransport, MCPUITransport
from .acp import AgentCapabilities, AgentInfo, register_agent, unregister_agent, _agents
from .agui import register_agui_agent, unregister_agui_agent, get_agui_app
from .vercel_ai import register_vercel_agent, unregister_vercel_agent
from .a2a import register_a2a_agent, unregister_a2a_agent, A2AAgentCard
from .mcp_ui import register_mcp_ui_agent, unregister_mcp_ui_agent

from ..types import AgentSpec
from ..config.agents import AGENT_LIBRARY, list_agents as list_library_agents, get_agent as get_library_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

# Store the API prefix for dynamic mount paths
_api_prefix = "/api/v1"


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


@router.get("/library/{agent_id}", response_model=AgentSpec)
async def get_agent_spec(agent_id: str) -> dict[str, Any]:
    """
    Get a specific agent specification from the library.

    Args:
        agent_id: The ID of the agent spec (e.g., 'data-acquisition', 'crawler')
    """
    try:
        agent = get_library_agent(agent_id)
        if not agent:
            available = list(AGENT_LIBRARY.keys())
            raise HTTPException(
                status_code=404,
                detail=f"Agent '{agent_id}' not found in library. Available: {available}"
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
):
    """Create a CodemodeToolset based on request flags and app configuration.
    
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
        from agent_codemode import (
            CodemodeToolset,
            CodeModeConfig,
            ToolRegistry,
            MCPServerConfig,
            PYDANTIC_AI_AVAILABLE as CODEMODE_AVAILABLE,
        )
        from pathlib import Path
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
        servers = [
            server for server in servers if server.id in request.selected_mcp_servers
        ]
        logger.info(f"Filtered to {len(servers)} selected servers: {request.selected_mcp_servers}")

    servers_added = []
    for server in servers:
        if not server.enabled:
            logger.debug(f"Skipping disabled MCP server: {server.id}")
            continue
        if not server.is_available:
            logger.warning(
                f"Skipping unavailable MCP server for codemode: {server.id}"
            )
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
        logger.info(f"Added MCP server to codemode registry: {normalized_name} (command={server.command}, args={server.args})")
    
    logger.info(f"Codemode registry built with {len(servers_added)} servers: {servers_added}")

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
    model: str = Field(default="bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0", description="Model to use")
    system_prompt: str = Field(
        default="You are a helpful AI assistant.",
        description="System prompt for the agent"
    )
    enable_skills: bool = Field(
        default=False,
        description="Enable agent-skills toolset for reusable skill compositions"
    )
    skills: list[str] = Field(
        default_factory=list,
        description="Selected skill names to enable for this agent"
    )
    enable_codemode: bool = Field(
        default=False,
        description="Enable agent-codemode toolset for code-based tool composition"
    )
    allow_direct_tool_calls: bool | None = Field(
        default=None,
        description="Override direct tool call policy for codemode (None uses defaults)"
    )
    enable_tool_reranker: bool = Field(
        default=False,
        description="Enable optional tool reranker hook for codemode discovery"
    )
    selected_mcp_servers: list[str] = Field(
        default_factory=list,
        description="List of MCP server IDs to include. Empty list means include all available."
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
async def create_agent(request: CreateAgentRequest, http_request: Request) -> CreateAgentResponse:
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
            status_code=400,
            detail=f"Agent with ID '{agent_id}' already exists"
        )
    
    try:
        # Build list of non-MCP toolsets (skills, codemode, etc.)
        # MCP toolsets will be dynamically fetched at run time by the adapter
        non_mcp_toolsets = []
        
        # Determine which MCP servers to use and ensure they are running
        # These will be dynamically fetched at run time, not stored at creation time
        selected_mcp_server_ids: list[str] = []
        if not request.enable_codemode and request.selected_mcp_servers:
            selected_mcp_server_ids = request.selected_mcp_servers
            logger.info(f"Agent {agent_id} will use MCP servers: {selected_mcp_server_ids}")
            
            # Start any MCP servers that aren't already running
            lifecycle_manager = get_mcp_lifecycle_manager()
            for server_id in selected_mcp_server_ids:
                if not lifecycle_manager.is_server_running(server_id):
                    # Look up server in catalog and start it
                    catalog_server = MCP_SERVER_CATALOG.get(server_id)
                    if catalog_server:
                        logger.info(f"Starting MCP server '{server_id}' for agent {agent_id}")
                        instance = await lifecycle_manager.start_server(server_id, catalog_server)
                        if instance:
                            logger.info(f"Started MCP server '{server_id}' with {len(instance.tools)} tools")
                        else:
                            failed = lifecycle_manager.get_failed_servers()
                            error = failed.get(server_id, "Unknown error")
                            logger.warning(f"Failed to start MCP server '{server_id}': {error}")
                    else:
                        logger.warning(f"MCP server '{server_id}' not found in catalog")
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
                logger.warning("code_sandboxes not installed, cannot create shared sandbox")
        
        # Add skills toolset if enabled
        if skills_enabled:
            try:
                from agent_skills import (
                    AgentSkill,
                    AgentSkillsToolset,
                    SandboxExecutor,
                    PYDANTIC_AI_AVAILABLE,
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
                            logger.info(f"Using shared sandbox for skills executor (agent {agent_id})")
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
                            logger.info(f"Using shared sandbox for skills executor (agent {agent_id})")
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
                mcp_servers = await initialize_mcp_servers(discover_tools=True)
                mcp_manager.load_servers(mcp_servers)
                logger.info(
                    f"Loaded {len(mcp_servers)} MCP servers for codemode agent {agent_id}"
                )
            codemode_toolset = _build_codemode_toolset(request, http_request, sandbox=shared_sandbox)
            if codemode_toolset is not None:
                # Initialize the toolset to discover tools and generate bindings
                # This must happen before the agent can use execute_code
                logger.info(f"Starting codemode toolset for agent {agent_id}...")
                await codemode_toolset.start()
                
                # Log discovered tools from the registry
                if codemode_toolset.registry:
                    discovered_tools = codemode_toolset.registry.list_tools(include_deferred=True)
                    tool_names = [t.name for t in discovered_tools]
                    logger.info(f"Codemode discovered {len(tool_names)} tools: {tool_names}")
                
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
                logger.info(f"Added and initialized CodemodeToolset for agent {agent_id}")
        
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
            agent = PydanticAIAdapter(
                agent=pydantic_agent,
                name=request.name,
                description=request.description,
                agent_id=agent_id,
                selected_mcp_server_ids=selected_mcp_server_ids,
                non_mcp_toolsets=non_mcp_toolsets,
            )
        elif request.agent_library == "langchain":
            # TODO: Implement LangChain agent creation
            raise HTTPException(
                status_code=501,
                detail="LangChain agent creation not yet implemented"
            )
        elif request.agent_library == "openai":
            # TODO: Implement OpenAI agent creation
            raise HTTPException(
                status_code=501,
                detail="OpenAI agent creation not yet implemented"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown agent library: {request.agent_library}"
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
                    http_request.app.mount(mount_path, agui_app, name=f"agui-{agent_id}")
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
                base_url = str(http_request.base_url).rstrip('/')
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
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create agent: {str(e)}"
        )


@router.get("", response_model=AgentListResponse)
async def list_agents() -> AgentListResponse:
    """
    List all registered agents.
    
    Returns:
        List of agent information.
    """
    agents = []
    for agent_id, (_, info) in _agents.items():
        agents.append({
            "id": agent_id,
            "name": info.name,
            "description": info.description,
            "status": "running",
            "capabilities": info.capabilities.model_dump() if info.capabilities else {},
        })
    
    return AgentListResponse(agents=agents)


@router.get("/{agent_id}")
async def get_agent(agent_id: str) -> dict[str, Any]:
    """
    Get information about a specific agent.
    
    Args:
        agent_id: The agent identifier.
        
    Returns:
        Agent information.
        
    Raises:
        HTTPException: If agent not found.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")
    
    _, info = _agents[agent_id]
    return {
        "id": agent_id,
        "name": info.name,
        "description": info.description,
        "status": "running",
        "capabilities": info.capabilities.model_dump() if info.capabilities else {},
    }


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
    
    logger.info(f"Deleted agent: {agent_id}")
    
    return {"message": f"Agent {agent_id} deleted successfully"}
