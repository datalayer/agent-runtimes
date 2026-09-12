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

from typing import TYPE_CHECKING, Any, Dict, List

from agent_runtimes._version import __version__

if TYPE_CHECKING:  # pragma: no cover - for type checkers only
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
    from agent_runtimes.app import create_app
    from agent_runtimes.events import (
        create_event,
        get_event,
        list_events,
        update_event,
    )
    from agent_runtimes.jupyter.serverapplication import AgentRuntimesExtensionApp
    from agent_runtimes.otel import (
        create_otel_middleware,
        get_meter,
        get_tracer,
        instrument_agent_runtimes,
        setup_otel,
        uninstrument_agent_runtimes,
    )
    from agent_runtimes.routes.acp import router as acp_router
    from agent_runtimes.routes.health import router as health_router
    from agent_runtimes.transports.acp import ACPSession, ACPTransport
    from agent_runtimes.transports.base import AdapterEvent, BaseTransport


#: Where each exported name actually lives, so it can be fetched when asked
#: for and not before.
_EXPORTS: Dict[str, str] = {
    "create_app": "agent_runtimes.app",
    "create_event": "agent_runtimes.events",
    "get_event": "agent_runtimes.events",
    "list_events": "agent_runtimes.events",
    "update_event": "agent_runtimes.events",
    "AgentRuntimesExtensionApp": "agent_runtimes.jupyter.serverapplication",
    "acp_router": "agent_runtimes.routes.acp",
    "health_router": "agent_runtimes.routes.health",
    "BaseAgent": "agent_runtimes.adapters.base",
    "AgentContext": "agent_runtimes.adapters.base",
    "AgentResponse": "agent_runtimes.adapters.base",
    "StreamEvent": "agent_runtimes.adapters.base",
    "ToolCall": "agent_runtimes.adapters.base",
    "ToolResult": "agent_runtimes.adapters.base",
    "ToolDefinition": "agent_runtimes.adapters.base",
    "PydanticAIAdapter": "agent_runtimes.adapters.pydantic_ai_adapter",
    "BaseTransport": "agent_runtimes.transports.base",
    "AdapterEvent": "agent_runtimes.transports.base",
    "ACPTransport": "agent_runtimes.transports.acp",
    "ACPSession": "agent_runtimes.transports.acp",
    "setup_otel": "agent_runtimes.otel",
    "instrument_agent_runtimes": "agent_runtimes.otel",
    "uninstrument_agent_runtimes": "agent_runtimes.otel",
    "get_tracer": "agent_runtimes.otel",
    "get_meter": "agent_runtimes.otel",
    "create_otel_middleware": "agent_runtimes.otel",
}

#: The name the router is exported under, where the module calls it `router`.
_ROUTER_ALIASES = {"acp_router", "health_router"}


def __getattr__(name: str) -> Any:
    """Fetch an export the first time it is asked for.

    Importing this package used to build the whole server: the FastAPI app,
    every route, every transport. A consumer that wanted only
    `agent_runtimes.client` — a client, over HTTP, to a service somewhere
    else — paid for all of it, and failed outright when any optional extra
    was absent. `ag-ui-protocol` is declared under the `ui` extra, so an
    install without that extra could not import this package AT ALL, and what
    the user was shown was "agent-runtimes package is required for
    DatalayerSandbox" — a message about the wrong package entirely.

    Nothing is imported here. What is asked for is imported then, so a
    missing extra breaks exactly the name that needs it and nothing else.
    """
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib

    module = importlib.import_module(module_name)
    attribute = "router" if name in _ROUTER_ALIASES else name
    value = getattr(module, attribute)
    globals()[name] = value
    return value


def __dir__() -> List[str]:
    return sorted(set(globals()) | set(_EXPORTS))


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
            "app": __getattr__("AgentRuntimesExtensionApp"),
        }
    ]


__all__ = [
    # Version
    "__version__",
    "create_app",
    "create_event",
    "list_events",
    "get_event",
    "update_event",
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
    # Observability
    "setup_otel",
    "instrument_agent_runtimes",
    "uninstrument_agent_runtimes",
    "get_tracer",
    "get_meter",
    "create_otel_middleware",
]
