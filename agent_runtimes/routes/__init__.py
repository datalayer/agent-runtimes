# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Server routes for agent-runtimes."""

from .a2a import (
    A2AAgentCard,
    get_a2a_agents,
    get_a2a_mounts,
    register_a2a_agent,
    set_a2a_app,
    start_a2a_task_managers,
    stop_a2a_task_managers,
    unregister_a2a_agent,
)
from .a2a import (
    router as a2a_protocol_router,
)
from .a2ui import router as a2ui_router
from .acp import router as acp_router
from .agents import router as agents_router
from .agui import (
    cancel_all_threads as cancel_agui_threads,
)
from .agui import (
    cancel_thread as cancel_agui_thread,
)
from .agui import (
    get_agui_app,
    get_agui_mounts,
    register_agui_agent,
    unregister_agui_agent,
)
from .agui import (
    register_thread as register_agui_thread,
)
from .agui import (
    router as agui_router,
)
from .agui import (
    unregister_thread as unregister_agui_thread,
)
from .configure import router as configure_router
from .examples import get_example_mounts
from .examples import router as examples_router
from .health import router as health_router
from .identity import router as identity_router
from .mcp import router as mcp_router
from .mcp_ui import register_mcp_ui_agent, unregister_mcp_ui_agent
from .mcp_ui import router as mcp_ui_router
from .skills import router as skills_router
from .vercel_ai import register_vercel_agent, unregister_vercel_agent
from .vercel_ai import router as vercel_ai_router

__all__ = [
    "a2a_protocol_router",
    "A2AAgentCard",
    "a2ui_router",
    "acp_router",
    "agents_router",
    "agui_router",
    "cancel_agui_thread",
    "cancel_agui_threads",
    "configure_router",
    "examples_router",
    "get_a2a_agents",
    "get_a2a_mounts",
    "get_agui_app",
    "get_agui_mounts",
    "get_example_mounts",
    "health_router",
    "identity_router",
    "mcp_router",
    "mcp_ui_router",
    "register_a2a_agent",
    "register_agui_agent",
    "register_agui_thread",
    "register_mcp_ui_agent",
    "register_vercel_agent",
    "set_a2a_app",
    "skills_router",
    "start_a2a_task_managers",
    "stop_a2a_task_managers",
    "unregister_a2a_agent",
    "unregister_agui_agent",
    "unregister_agui_thread",
    "unregister_mcp_ui_agent",
    "unregister_vercel_agent",
    "vercel_ai_router",
]
