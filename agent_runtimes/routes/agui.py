# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""AG-UI routes for agent-runtimes server."""

import asyncio
import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from starlette.applications import Starlette
from starlette.routing import Mount

from ..transports import AGUITransport

logger = logging.getLogger(__name__)

# Router for AG-UI endpoints
router = APIRouter(
    prefix="/ag-ui",
    tags=["ag-ui"],
)

# Global registry of AG-UI adapters by agent ID
_agui_adapters: dict[str, AGUITransport] = {}
_agui_apps: dict[str, Starlette] = {}

# Track running requests per thread ID for termination
# Maps thread_id to a cancellation event
_running_threads: dict[str, asyncio.Event] = {}


class TerminateRequest(BaseModel):
    """Request to terminate a running agent thread."""
    thread_id: Optional[str] = None


class TerminateResponse(BaseModel):
    """Response from terminate request."""
    success: bool
    message: str
    thread_id: Optional[str] = None


def register_thread(thread_id: str) -> asyncio.Event:
    """Register a running thread and return its cancellation event.
    
    Args:
        thread_id: The unique thread identifier.
        
    Returns:
        An asyncio.Event that can be set to signal cancellation.
    """
    cancel_event = asyncio.Event()
    _running_threads[thread_id] = cancel_event
    logger.debug(f"Registered AG-UI thread: {thread_id}")
    return cancel_event


def unregister_thread(thread_id: str) -> None:
    """Unregister a thread when it completes.
    
    Args:
        thread_id: The thread identifier to remove.
    """
    if thread_id in _running_threads:
        del _running_threads[thread_id]
        logger.debug(f"Unregistered AG-UI thread: {thread_id}")


def cancel_thread(thread_id: str) -> bool:
    """Cancel a running thread.
    
    Args:
        thread_id: The thread identifier to cancel.
        
    Returns:
        True if the thread was found and cancelled, False otherwise.
    """
    if thread_id in _running_threads:
        _running_threads[thread_id].set()
        logger.info(f"Cancelled AG-UI thread: {thread_id}")
        return True
    return False


def cancel_all_threads() -> int:
    """Cancel all running threads.
    
    Returns:
        Number of threads cancelled.
    """
    count = 0
    for thread_id, cancel_event in _running_threads.items():
        cancel_event.set()
        count += 1
        logger.info(f"Cancelled AG-UI thread: {thread_id}")
    return count


def register_agui_agent(
    agent_id: str,
    adapter: AGUITransport,
) -> None:
    """Register an AG-UI adapter.

    Args:
        agent_id: Unique identifier for the agent.
        adapter: The AGUITransport instance.
    """
    _agui_adapters[agent_id] = adapter
    _agui_apps[agent_id] = adapter.get_app()
    logger.info(f"Registered AG-UI agent: {agent_id}")


def unregister_agui_agent(agent_id: str) -> None:
    """Unregister an AG-UI adapter.

    Args:
        agent_id: The agent identifier.
    """
    if agent_id in _agui_adapters:
        del _agui_adapters[agent_id]
    if agent_id in _agui_apps:
        del _agui_apps[agent_id]
    logger.info(f"Unregistered AG-UI agent: {agent_id}")


def get_agui_app(agent_id: str) -> Starlette | None:
    """Get an AG-UI Starlette app by ID.

    Args:
        agent_id: The agent identifier.

    Returns:
        The Starlette app if found, None otherwise.
    """
    return _agui_apps.get(agent_id)


def get_agui_mounts() -> list[Mount]:
    """Get all AG-UI mounts for the FastAPI app.

    Returns:
        List of Starlette Mount objects for each AG-UI agent.
    """
    mounts = []
    for agent_id, app in _agui_apps.items():
        # Mount each AG-UI app at /api/v1/ag-ui/{agent_id}/
        mount = Mount(f"/{agent_id}", app=app)
        mounts.append(mount)
    return mounts


@router.get("/agents")
async def list_agents() -> dict[str, list[str]]:
    """List available AG-UI agents.

    Returns:
        Dictionary with list of agent IDs and their endpoints.
    """
    return {
        "agents": [
            {
                "id": agent_id,
                "endpoint": f"/api/v1/ag-ui/{agent_id}/",
            }
            for agent_id in _agui_adapters.keys()
        ],
        "count": len(_agui_adapters),
    }


@router.get("/")
async def agui_info() -> dict[str, str]:
    """Get AG-UI service information.

    Returns:
        Information about the AG-UI service.
    """
    return {
        "protocol": "ag-ui",
        "description": "AG-UI (Agent UI) protocol for lightweight web interfaces",
        "documentation": "https://ai.pydantic.dev/ui/ag-ui/",
        "agents_endpoint": "/api/v1/ag-ui/agents",
        "terminate_endpoint": "/api/v1/ag-ui/terminate",
        "note": "Each agent is mounted at /api/v1/ag-ui/{agent_id}/",
    }


@router.post("/terminate", response_model=TerminateResponse)
async def terminate_agent(request: TerminateRequest) -> TerminateResponse:
    """Terminate a running agent thread or all threads.

    This endpoint allows clients to stop running agent executions.
    If thread_id is provided, only that thread is cancelled.
    If thread_id is None, all running threads are cancelled.

    Args:
        request: Terminate request with optional thread_id.

    Returns:
        Result of the termination request.
    """
    if request.thread_id:
        # Cancel specific thread
        if cancel_thread(request.thread_id):
            return TerminateResponse(
                success=True,
                message=f"Thread {request.thread_id} has been terminated",
                thread_id=request.thread_id,
            )
        else:
            return TerminateResponse(
                success=False,
                message=f"Thread {request.thread_id} not found or already completed",
                thread_id=request.thread_id,
            )
    else:
        # Cancel all threads
        count = cancel_all_threads()
        return TerminateResponse(
            success=True,
            message=f"Terminated {count} running thread(s)",
        )


@router.get("/threads")
async def list_threads() -> dict[str, Any]:
    """List all running AG-UI threads.

    Returns:
        Dictionary with list of running thread IDs.
    """
    return {
        "threads": list(_running_threads.keys()),
        "count": len(_running_threads),
    }
