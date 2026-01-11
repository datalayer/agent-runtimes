# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""MCP-UI routes for agent-runtimes server."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from ..transports import MCPUITransport

logger = logging.getLogger(__name__)

# Router for MCP-UI endpoints
router = APIRouter(
    prefix="/mcp-ui",
    tags=["mcp-ui"],
)

# Global registry of MCP-UI adapters by agent ID
_mcp_ui_adapters: dict[str, MCPUITransport] = {}


class MCPUIRequest(BaseModel):
    """MCP-UI chat request."""
    message: str
    session_id: str | None = None
    ui_options: dict[str, Any] | None = None


class MCPUIResponse(BaseModel):
    """MCP-UI chat response."""
    role: str
    content: list[dict[str, Any]]
    session_id: str | None = None


def register_mcp_ui_agent(
    agent_id: str,
    adapter: MCPUITransport,
) -> None:
    """Register an MCP-UI adapter.

    Args:
        agent_id: Unique identifier for the agent.
        adapter: The MCPUITransport instance.
    """
    _mcp_ui_adapters[agent_id] = adapter
    logger.info(f"Registered MCP-UI agent: {agent_id}")


def get_mcp_ui_adapter(agent_id: str) -> MCPUITransport | None:
    """Get an MCP-UI adapter by ID.

    Args:
        agent_id: The agent identifier.

    Returns:
        The MCPUITransport if found, None otherwise.
    """
    return _mcp_ui_adapters.get(agent_id)


def unregister_mcp_ui_agent(agent_id: str) -> bool:
    """Unregister an MCP-UI adapter.

    Args:
        agent_id: The agent identifier.

    Returns:
        True if agent was unregistered, False if not found.
    """
    if agent_id in _mcp_ui_adapters:
        del _mcp_ui_adapters[agent_id]
        logger.info(f"Unregistered MCP-UI agent: {agent_id}")
        return True
    return False


@router.get("/")
async def mcp_ui_info() -> dict[str, Any]:
    """Get MCP-UI service information.

    Returns:
        Information about the MCP-UI service.
    """
    return {
        "protocol": "mcp-ui",
        "description": "MCP-UI (Model Context Protocol UI) for interactive agent UIs",
        "documentation": "https://mcpui.dev",
        "version": "5.2.0",
        "features": [
            "Interactive UI resources in responses",
            "HTML, external URLs, and Remote DOM support",
            "Secure sandboxed iframe execution",
            "Two-way communication with host",
            "Flexible metadata for UI customization",
        ],
        "endpoints": {
            "chat": "/api/v1/mcp-ui/chat/{agent_id}",
            "stream": "/api/v1/mcp-ui/stream/{agent_id}",
            "agents": "/api/v1/mcp-ui/agents",
        },
    }


@router.get("/agents")
async def list_agents() -> dict[str, Any]:
    """List available MCP-UI agents.

    Returns:
        Dictionary with list of agent IDs and their endpoints.
    """
    return {
        "agents": [
            {
                "id": agent_id,
                "chat_endpoint": f"/api/v1/mcp-ui/chat/{agent_id}",
                "stream_endpoint": f"/api/v1/mcp-ui/stream/{agent_id}",
            }
            for agent_id in _mcp_ui_adapters.keys()
        ],
        "count": len(_mcp_ui_adapters),
    }


@router.post("/chat/{agent_id}")
async def chat(
    agent_id: str,
    request: MCPUIRequest,
) -> MCPUIResponse:
    """Handle MCP-UI chat request (non-streaming).

    This endpoint processes a chat message and returns a response that may
    include interactive UI resources.

    Args:
        agent_id: The agent to use.
        request: The chat request with message and options.

    Returns:
        Chat response with potential UI resources.

    Example:
        ```python
        # Client request
        response = requests.post(
            "http://localhost:8000/api/v1/mcp-ui/chat/demo-agent",
            json={
                "message": "Show me a visualization",
                "session_id": "session-123"
            }
        )

        # Response may include UI resources
        # {
        #   "role": "assistant",
        #   "content": [
        #     {"type": "text", "text": "Here's the visualization:"},
        #     {
        #       "type": "resource",
        #       "resource": {
        #         "uri": "ui://viz/chart",
        #         "mimeType": "text/html",
        #         "text": "<div>...</div>"
        #       }
        #     }
        #   ]
        # }
        ```
    """
    # Get the adapter for this agent
    adapter = get_mcp_ui_adapter(agent_id)

    if not adapter:
        # Try to create a default adapter if we have a demo agent
        from ..demo.demo_adapter import create_demo_agent

        try:
            agent, _ = create_demo_agent()
            # Create MCP-UI adapter
            adapter = MCPUITransport(agent)
            register_mcp_ui_agent(agent_id, adapter)
            logger.info(f"Auto-registered demo agent for MCP-UI: {agent_id}")
        except Exception as e:
            logger.error(f"Could not create demo agent: {e}")
            raise HTTPException(
                status_code=404,
                detail=f"Agent '{agent_id}' not found and could not create demo agent",
            )

    # Handle the request
    try:
        response_data = await adapter.handle_request(request.model_dump())
        return MCPUIResponse(**response_data)
    except Exception as e:
        logger.error(f"Error handling MCP-UI request: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}",
        )


@router.post("/stream/{agent_id}")
async def stream(
    agent_id: str,
    request: MCPUIRequest,
) -> StreamingResponse:
    """Handle MCP-UI streaming chat request.

    This endpoint streams agent responses and UI resources as they become
    available, providing a real-time interactive experience.

    Args:
        agent_id: The agent to use.
        request: The chat request with message and options.

    Returns:
        Streaming response with text deltas and UI resources.

    Example:
        ```python
        # Client request with streaming
        import requests

        response = requests.post(
            "http://localhost:8000/api/v1/mcp-ui/stream/demo-agent",
            json={"message": "Generate a report"},
            stream=True
        )

        for line in response.iter_lines():
            if line:
                event = json.loads(line)
                if event["type"] == "delta":
                    print(event["delta"], end="")
                elif event["type"] == "resource":
                    # Render UI resource
                    render_ui_resource(event["resource"])
        ```
    """
    # Get the adapter for this agent
    adapter = get_mcp_ui_adapter(agent_id)

    if not adapter:
        # Try to create a default adapter
        from ..demo.demo_adapter import create_demo_agent

        try:
            agent, _ = create_demo_agent()
            adapter = MCPUITransport(agent)
            register_mcp_ui_agent(agent_id, adapter)
            logger.info(f"Auto-registered demo agent for MCP-UI: {agent_id}")
        except Exception as e:
            logger.error(f"Could not create demo agent: {e}")
            raise HTTPException(
                status_code=404,
                detail=f"Agent '{agent_id}' not found",
            )

    # Create streaming response
    async def event_generator():
        """Generate server-sent events."""
        import json

        try:
            async for event in adapter.handle_stream(request.model_dump()):
                # Format as JSON lines
                yield f"{json.dumps(event)}\n"
        except Exception as e:
            logger.error(f"Error in stream: {e}")
            yield f'{json.dumps({"type": "error", "error": str(e)})}\n'

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
    )
