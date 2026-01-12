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
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from starlette.routing import Mount

from pydantic_ai import Agent as PydanticAgent

from ..adapters.pydantic_ai_adapter import PydanticAIAdapter
from ..mcp import get_mcp_toolsets
from ..transports import AGUITransport, VercelAITransport, MCPUITransport
from .acp import AgentCapabilities, AgentInfo, register_agent, unregister_agent, _agents
from .agui import register_agui_agent, unregister_agui_agent, get_agui_app
from .vercel_ai import register_vercel_agent, unregister_vercel_agent
from .a2a import register_a2a_agent, unregister_a2a_agent, A2AAgentCard
from .mcp_ui import register_mcp_ui_agent, unregister_mcp_ui_agent

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])

# Store the API prefix for dynamic mount paths
_api_prefix = "/api/v1"


def set_api_prefix(prefix: str) -> None:
    """Set the API prefix for dynamic mount paths."""
    global _api_prefix
    _api_prefix = prefix


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
    model: str = Field(default="openai:gpt-4o-mini", description="Model to use")
    system_prompt: str = Field(
        default="You are a helpful AI assistant.",
        description="System prompt for the agent"
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
        # Get pre-loaded MCP toolsets (started at server startup)
        mcp_toolsets = get_mcp_toolsets()
        if mcp_toolsets:
            logger.info(f"Using {len(mcp_toolsets)} pre-loaded MCP toolsets for agent {agent_id}")
        
        # Create the agent based on the library
        if request.agent_library == "pydantic-ai":
            # First create the underlying Pydantic AI Agent with MCP toolsets
            pydantic_agent = PydanticAgent(
                request.model,
                system_prompt=request.system_prompt,
                toolsets=mcp_toolsets if mcp_toolsets else None,
            )
            # Then wrap it with our adapter
            agent = PydanticAIAdapter(
                agent=pydantic_agent,
                name=request.name,
                description=request.description,
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
                agui_adapter = AGUITransport(agent)
                register_agui_agent(agent_id, agui_adapter)
                logger.info(f"Registered agent with AG-UI: {agent_id}")
                
                # Dynamically add the AG-UI mount to the FastAPI app
                agui_app = get_agui_app(agent_id)
                if agui_app and http_request.app:
                    mount_path = f"{_api_prefix}/ag-ui/{agent_id}"
                    full_mount = Mount(mount_path, app=agui_app)
                    http_request.app.routes.append(full_mount)
                    logger.info(f"Dynamically mounted AG-UI route: {mount_path}/")
            except Exception as e:
                logger.warning(f"Could not register with AG-UI: {e}")
        
        elif request.transport == "vercel-ai":
            try:
                vercel_adapter = VercelAITransport(agent)
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
