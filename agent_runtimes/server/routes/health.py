# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Health check routes for agent-runtimes server."""

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter

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
