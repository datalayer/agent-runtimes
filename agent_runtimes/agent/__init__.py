# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Agent session: its command registry, its discovery, its session object.

One session, several front-ends. What a command *is* lives here; how it is drawn
belongs to whichever front-end is driving — a prompt_toolkit terminal, the
browser workspace, a JupyterLab panel.

The lifecycle, written in Python::

    from agent_runtimes import agent

    app = agent.app(id="echo-desk", name="Echo Desk", kind="chat", agent="example-simple:0.0.1")
    scene = agent.scene("desk-and-sales", "Desk & Sales")
    agent.stage(scene, runs_in={"desk": "browser"})

``agent.app`` is `agent_runtimes.apps.Application`; ``agent.scene`` and
``agent.stage`` write a scene spec (`agent_runtimes.agent.scenes.written`).
Each is imported when first named.
"""

from typing import Any

from agent_runtimes.agent.commands import (
    CommandArgSpec,
    CommandCollisionError,
    CommandHandler,
    SlashCommandRegistry,
    SlashCommandSpec,
    spec_from_module,
)
from agent_runtimes.agent.discovery import (
    ENTRY_POINT_GROUP,
    discover_slash_commands,
)
from agent_runtimes.agent.entrypoint import (
    WORKSPACE_ENTRYPOINTS,
    invoked_name,
    opens_workspace,
)
from agent_runtimes.agent.session import AgentSession
from agent_runtimes.agent.sync import (
    DEFAULT_INTERVAL_SECONDS,
    ForeignTurn,
    SessionSync,
)

#: What ``agent.<name>`` is, imported when first named.
_LIFECYCLE = {
    "app": ("agent_runtimes.apps.application", "Application"),
    "scene": ("agent_runtimes.agent.scenes.written", "scene"),
    "stage": ("agent_runtimes.agent.scenes.written", "stage"),
}


def __getattr__(name: str) -> Any:
    """``agent.app``, ``agent.scene`` and ``agent.stage``, imported when first named."""
    if name in _LIFECYCLE:
        import importlib

        module, attribute = _LIFECYCLE[name]
        return getattr(importlib.import_module(module), attribute)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "ENTRY_POINT_GROUP",
    "WORKSPACE_ENTRYPOINTS",
    "CommandArgSpec",
    "CommandCollisionError",
    "CommandHandler",
    "DEFAULT_INTERVAL_SECONDS",
    "ForeignTurn",
    "AgentSession",
    "SessionSync",
    "SlashCommandRegistry",
    "SlashCommandSpec",
    "discover_slash_commands",
    "invoked_name",
    "opens_workspace",
    "spec_from_module",
]
