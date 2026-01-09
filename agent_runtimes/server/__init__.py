# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
FastAPI server for agent-runtimes.

Provides:
- ACP (Agent Communication Protocol) endpoints
- WebSocket support for real-time agent communication
- Health check endpoints
- OpenAPI documentation
"""

from .app import create_app
from .routes.acp import router as acp_router
from .routes.health import router as health_router

__all__ = [
    "create_app",
    "acp_router",
    "health_router",
]
