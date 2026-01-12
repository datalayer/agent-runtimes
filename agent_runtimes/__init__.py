# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent Runtimes - Datalayer's AI Agent Infrastructure.

This package provides:
- Base agent interface for protocol adapters
- Protocol adapters (ACP, etc.)
- FastAPI server for agent communication
- Observability with OpenTelemetry
- Jupyter server extension integration

FastAPI server for agent-runtimes provides:
- ACP (Agent Communication Protocol) endpoints
- WebSocket support for real-time agent communication
- Health check endpoints
- OpenAPI documentation

The ACP (Agent Client Protocol) support uses the official SDK from:
- Python: https://github.com/agentclientprotocol/python-sdk
- TypeScript: https://github.com/agentclientprotocol/typescript-sdk
"""

from typing import Any, Dict, List

from agent_runtimes.__version__ import __version__
from agent_runtimes.app import create_app
from agent_runtimes.routes.acp import router as acp_router
from agent_runtimes.routes.health import router as health_router
from agent_runtimes.jupyter.serverapplication import AgentRuntimesExtensionApp
# Agent interfaces
from agent_runtimes.adapters.base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolCall,
    ToolDefinition,
    ToolResult,
)
from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
# Protocol adapters
from agent_runtimes.transports.base import AdapterEvent, BaseTransport
from agent_runtimes.transports.acp import ACPTransport, ACPSession


def _jupyter_server_extension_points() -> List[Dict[str, Any]]:
    """
    Get Jupyter server extension points for Datalayer.

    Returns
    -------
    List[Dict[str, Any]]
        List of extension point configurations for Jupyter server.
    """
    return [
        {
            "module": "agent_runtimes",
            "app": AgentRuntimesExtensionApp,
        }
    ]


__all__ = [
    # Version
    "__version__",
    "create_app",
    "acp_router",
    "health_router",
    # Base agent interface
    "BaseAgent",
    "AgentContext",
    "AgentResponse",
    "StreamEvent",
    "ToolCall",
    "ToolResult",
    "ToolDefinition",
    # Agent implementations
    "PydanticAIAdapter",
    # Protocol adapters
    "BaseTransport",
    "AdapterEvent",
    "ACPTransport",
    "ACPSession",
]
