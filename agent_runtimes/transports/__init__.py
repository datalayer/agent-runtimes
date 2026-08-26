# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Protocol adapters and clients for agent-runtimes."""

from .a2a import A2ATransport

# Optional, like the ACP route: absent `acp` must not make the whole
# package unimportable for consumers that never speak that protocol.
try:
    from .acp import ACPTransport
except ImportError:  # pragma: no cover - depends on what is installed
    ACPTransport = None  # type: ignore[assignment,misc]
from .agui import AGUITransport
from .base import BaseTransport

# Protocol clients
from .clients import (
    ACPClient,
    ACPClientError,
    AGUIClient,
    AGUIClientError,
    AGUIConversation,
    AGUIEvent,
    connect_acp,
    connect_agui,
)
from .mcp_ui import MCPUITransport
from .vercel_ai import VercelAITransport

__all__ = [
    # Server-side transports/adapters
    "BaseTransport",
    "ACPTransport",
    "AGUITransport",
    "A2ATransport",
    "VercelAITransport",
    "MCPUITransport",
    # Client-side protocol clients
    "ACPClient",
    "ACPClientError",
    "connect_acp",
    "AGUIClient",
    "AGUIClientError",
    "AGUIEvent",
    "AGUIConversation",
    "connect_agui",
]
