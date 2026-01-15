# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Vercel AI SDK routes for agent-runtimes server."""

import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel
from starlette.responses import Response

from ..transports import VercelAITransport

logger = logging.getLogger(__name__)

# Router for Vercel AI endpoints
router = APIRouter(
    prefix="/vercel-ai",
    tags=["vercel-ai"],
)

# Global registry of Vercel AI adapters by agent ID
_vercel_adapters: dict[str, VercelAITransport] = {}

# Track running requests per request ID for termination
# Maps request_id to a cancellation event
_running_requests: dict[str, asyncio.Event] = {}


class TerminateRequest(BaseModel):
    """Request to terminate a running Vercel AI request."""
    request_id: Optional[str] = None


class TerminateResponse(BaseModel):
    """Response from terminate request."""
    success: bool
    message: str
    request_id: Optional[str] = None


def register_request(request_id: str) -> asyncio.Event:
    """Register a running request and return its cancellation event.
    
    Args:
        request_id: The unique request identifier.
        
    Returns:
        An asyncio.Event that can be set to signal cancellation.
    """
    cancel_event = asyncio.Event()
    _running_requests[request_id] = cancel_event
    logger.debug(f"Registered Vercel AI request: {request_id}")
    return cancel_event


def unregister_request(request_id: str) -> None:
    """Unregister a request when it completes.
    
    Args:
        request_id: The request identifier to remove.
    """
    if request_id in _running_requests:
        del _running_requests[request_id]
        logger.debug(f"Unregistered Vercel AI request: {request_id}")


def cancel_request(request_id: str) -> bool:
    """Cancel a running request.
    
    Args:
        request_id: The request identifier to cancel.
        
    Returns:
        True if the request was found and cancelled, False otherwise.
    """
    if request_id in _running_requests:
        _running_requests[request_id].set()
        logger.info(f"Cancelled Vercel AI request: {request_id}")
        return True
    return False


def cancel_all_requests() -> int:
    """Cancel all running requests.
    
    Returns:
        Number of requests cancelled.
    """
    count = 0
    for request_id, cancel_event in _running_requests.items():
        cancel_event.set()
        count += 1
        logger.info(f"Cancelled Vercel AI request: {request_id}")
    return count


def register_vercel_agent(
    agent_id: str,
    adapter: VercelAITransport,
) -> None:
    """Register a Vercel AI adapter.

    Args:
        agent_id: Unique identifier for the agent.
        adapter: The VercelAITransport instance.
    """
    _vercel_adapters[agent_id] = adapter
    logger.info(f"Registered Vercel AI agent: {agent_id}")


def unregister_vercel_agent(agent_id: str) -> None:
    """Unregister a Vercel AI adapter.

    Args:
        agent_id: The agent identifier.
    """
    if agent_id in _vercel_adapters:
        del _vercel_adapters[agent_id]
    logger.info(f"Unregistered Vercel AI agent: {agent_id}")


def get_vercel_adapter(agent_id: str) -> VercelAITransport | None:
    """Get a Vercel AI adapter by ID.

    Args:
        agent_id: The agent identifier.

    Returns:
        The VercelAITransport if found, None otherwise.
    """
    return _vercel_adapters.get(agent_id)


@router.post("/{agent_id}")
async def chat(
    request: Request,
    agent_id: str,
) -> Response:
    """Handle Vercel AI SDK chat requests.

    This endpoint implements the Vercel AI SDK streaming protocol, providing:
    - Streaming chat responses
    - Tool call support
    - Token usage tracking
    - Standard message format

    The model can be specified in the request body to override the agent's default.

    Args:
        request: The FastAPI/Starlette request.
        agent_id: The agent to use (defaults to "demo-agent").

    Returns:
        Streaming response compatible with Vercel AI SDK.

    Example:
        ```javascript
        // Client-side with Vercel AI SDK
        import { useChat } from 'ai/react';

        const { messages, input, handleInputChange, handleSubmit } = useChat({
          api: '/api/v1/vercel-ai/chat',
        });
        ```
    """
    # Get the adapter for this agent
    adapter = get_vercel_adapter(agent_id)

    if not adapter:
        # Try to create a default adapter if we have a demo agent
        from ..demo.demo_adapter import create_demo_agent

        try:
            agent, _ = create_demo_agent()
            # Create Vercel AI adapter with agent_id for usage tracking
            adapter = VercelAITransport(agent, agent_id=agent_id)
            register_vercel_agent(agent_id, adapter)
            logger.info(f"Auto-registered demo agent for Vercel AI: {agent_id}")
        except Exception as e:
            logger.error(f"Could not create demo agent: {e}")
            from starlette.responses import JSONResponse

            return JSONResponse(
                status_code=404,
                content={
                    "error": f"Agent '{agent_id}' not found",
                    "message": "No agent registered for this ID",
                },
            )

    # Handle the request using the Vercel AI adapter
    # The model override is extracted from the request body inside handle_vercel_request
    return await adapter.handle_vercel_request(request)


@router.get("/agents")
async def list_agents() -> dict[str, list[str]]:
    """List available Vercel AI agents.

    Returns:
        Dictionary with list of agent IDs.
    """
    return {
        "agents": list(_vercel_adapters.keys()),
        "count": len(_vercel_adapters),
    }


@router.post("/terminate", response_model=TerminateResponse)
async def terminate_agent(request: TerminateRequest) -> TerminateResponse:
    """Terminate a running Vercel AI request or all requests.

    This endpoint allows clients to stop running agent executions.
    If request_id is provided, only that request is cancelled.
    If request_id is None, all running requests are cancelled.

    Args:
        request: Terminate request with optional request_id.

    Returns:
        Result of the termination request.
    """
    if request.request_id:
        # Cancel specific request
        if cancel_request(request.request_id):
            return TerminateResponse(
                success=True,
                message=f"Request {request.request_id} has been terminated",
                request_id=request.request_id,
            )
        else:
            return TerminateResponse(
                success=False,
                message=f"Request {request.request_id} not found or already completed",
                request_id=request.request_id,
            )
    else:
        # Cancel all requests
        count = cancel_all_requests()
        return TerminateResponse(
            success=True,
            message=f"Terminated {count} running request(s)",
        )


@router.get("/requests")
async def list_requests() -> dict[str, Any]:
    """List all running Vercel AI requests.

    Returns:
        Dictionary with list of running request IDs.
    """
    return {
        "requests": list(_running_requests.keys()),
        "count": len(_running_requests),
    }
