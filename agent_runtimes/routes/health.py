# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Health check routes for agent-runtimes server."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check() -> dict[str, Any]:
    """
    Basic health check endpoint.

    Returns:
        Health status with timestamp.
    """
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "agent-runtimes",
    }


@router.get("/ready")
async def readiness_check() -> dict[str, Any]:
    """
    Readiness check endpoint.

    Checks if the service is ready to accept traffic.

    Returns:
        Readiness status with component states.
    """
    return {
        "status": "ready",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": {
            "api": "ready",
            "websocket": "ready",
        },
    }


@router.get("/live")
async def liveness_check() -> dict[str, Any]:
    """
    Liveness check endpoint.

    Simple check to verify the service is alive.

    Returns:
        Liveness status.
    """
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/startup")
async def startup_info(request: Request) -> dict[str, Any]:
    """
    Startup information endpoint.

    Returns details about the runtime and the agent/sandbox that were
    created during server startup (via ``--agent-id`` CLI flag).  The
    sandbox section is always enriched with the **current** state from
    the :class:`CodeSandboxManager` so that it reflects any
    reconfiguration performed after startup (e.g. via the
    ``/api/v1/agents/mcp-servers/start`` endpoint).

    This is consumed by CLI tools such as *codeai* to display runtime
    and sandbox information to the user.

    Returns:
        Startup info including runtime host/port and sandbox details.
    """
    import logging

    info: dict[str, Any] = dict(getattr(request.app.state, "startup_info", None) or {})

    # Dynamically enrich sandbox info from the sandbox manager so that
    # any reconfiguration (e.g. local-eval → local-jupyter) is reflected.
    try:
        from agent_runtimes.services.code_sandbox_manager import (
            get_code_sandbox_manager,
        )

        manager = get_code_sandbox_manager()
        status = manager.get_status()
        sandbox_block = info.get("sandbox", {})
        sandbox_block["variant"] = status.get("variant", sandbox_block.get("variant"))
        if status.get("jupyter_url"):
            sandbox_block["jupyter_url"] = status["jupyter_url"]
        if status.get("jupyter_token"):
            sandbox_block["jupyter_token"] = status["jupyter_token"]
        if status.get("mcp_proxy_url"):
            sandbox_block["mcp_proxy_url"] = status["mcp_proxy_url"]
        sandbox_block["sandbox_running"] = status.get("sandbox_running", False)
        info["sandbox"] = sandbox_block
    except Exception:
        logging.getLogger(__name__).debug(
            "Could not enrich startup info from sandbox manager", exc_info=True
        )

    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **info,
    }
