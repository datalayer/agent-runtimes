# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Protocol clients for agent-runtimes.

Provides client implementations for consuming agent-runtimes protocols:
- ACPClient: WebSocket-based ACP (Agent Communication Protocol) client
- AGUIClient: HTTP/SSE-based AG-UI (Agent UI) client

Example:
    from agent_runtimes.transports.clients import ACPClient, AGUIClient

    # ACP client (WebSocket)
    async with ACPClient("ws://localhost:8000/api/v1/acp/ws/agent-1") as client:
        async for event in client.run("Hello!"):
            print(event)

    # AG-UI client (HTTP/SSE) - trailing slash required for mounted apps
    async with AGUIClient("http://localhost:8000/api/v1/ag-ui/agent-1/") as client:
        async for event in client.run("Hello!"):
            print(event.delta, end="")
"""

from .acp_client import (
    ACPClient,
    ACPClientError,
    connect_acp,
)
from .ag_ui_client import (
    AGUIClient,
    AGUIClientError,
    AGUIConversation,
    AGUIEvent,
    connect_agui,
)

__all__ = [
    # ACP client
    "ACPClient",
    "ACPClientError",
    "connect_acp",
    # AG-UI client
    "AGUIClient",
    "AGUIClientError",
    "AGUIEvent",
    "AGUIConversation",
    "connect_agui",
]
