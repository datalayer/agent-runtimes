# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""AG-UI Example Agents.

This module provides example agents demonstrating AG-UI protocol features:
- Agentic Chat: Basic conversational agent with tools
- Human in the Loop: Agent that requires human approval for actions
- Tool Based Generative UI: Agent that uses tools to render UI components
- Shared State: Agent that shares state between UI and backend
- Agentic Generative UI: Agent that generates UI through plans and steps
- Predictive State Updates: Agent that predicts state changes

These examples are based on the AG-UI protocol (CopilotKit) and adapted
for the Datalayer agent-runtimes infrastructure.

Reference: https://docs.copilotkit.ai/guides
"""

from .agentic_chat import agent as agentic_chat_agent, app as agentic_chat_app
from .human_in_the_loop import agent as human_in_the_loop_agent, app as human_in_the_loop_app
from .tool_based_generative_ui import agent as tool_based_generative_ui_agent, app as tool_based_generative_ui_app
from .shared_state import agent as shared_state_agent, app as shared_state_app
from .agentic_generative_ui import agent as agentic_generative_ui_agent, app as agentic_generative_ui_app
from .backend_tool_rendering import agent as backend_tool_rendering_agent, app as backend_tool_rendering_app
from .haiku_generative_ui import agent as haiku_generative_ui_agent, app as haiku_generative_ui_app


__all__ = [
    # Agentic Chat
    "agentic_chat_agent",
    "agentic_chat_app",
    # Human in the Loop
    "human_in_the_loop_agent",
    "human_in_the_loop_app",
    # Tool Based Generative UI
    "tool_based_generative_ui_agent",
    "tool_based_generative_ui_app",
    # Shared State
    "shared_state_agent",
    "shared_state_app",
    # Agentic Generative UI
    "agentic_generative_ui_agent",
    "agentic_generative_ui_app",
    # Backend Tool Rendering
    "backend_tool_rendering_agent",
    "backend_tool_rendering_app",
    # Haiku Generative UI
    "haiku_generative_ui_agent",
    "haiku_generative_ui_app",
]
