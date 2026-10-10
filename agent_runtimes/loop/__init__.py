# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The LOOP session: its command registry, its discovery, its session object.

One loop, several front-ends. What a command *is* lives here; how it is drawn
belongs to whichever front-end is driving — a prompt_toolkit terminal, the
browser workspace, a JupyterLab panel.

The lifecycle, written in Python (LOOP §10, P-30)::

    from agent_runtimes import loop

    app = loop.app(id="echo-desk", name="Echo Desk", kind="chat", agent="example-simple:0.0.1")
    scene = loop.scene("desk-and-sales", "Desk & Sales")
    loop.stage(scene, runs_in={"desk": "browser"})

``loop.app`` is `agent_runtimes.loop.apps.Application`; ``loop.scene`` and
``loop.stage`` write a scene spec (`agent_runtimes.loop.scenes.written`).
Each is imported when first named.
"""

from typing import Any

from agent_runtimes.loop.commands import (
    CommandArgSpec,
    CommandCollisionError,
    CommandHandler,
    SlashCommandRegistry,
    SlashCommandSpec,
    spec_from_module,
)
from agent_runtimes.loop.discovery import (
    ENTRY_POINT_GROUP,
    discover_slash_commands,
)
from agent_runtimes.loop.entrypoint import (
    WORKSPACE_ENTRYPOINTS,
    invoked_name,
    opens_workspace,
)
from agent_runtimes.loop.session import LoopSession
from agent_runtimes.loop.sync import (
    DEFAULT_INTERVAL_SECONDS,
    ForeignTurn,
    SessionSync,
)

#: What ``loop.<name>`` is, imported when first named.
_LIFECYCLE = {
    "app": ("agent_runtimes.loop.apps.application", "Application"),
    "scene": ("agent_runtimes.loop.scenes.written", "scene"),
    "stage": ("agent_runtimes.loop.scenes.written", "stage"),
}


def __getattr__(name: str) -> Any:
    """``loop.app``, ``loop.scene`` and ``loop.stage``, imported when first named."""
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
    "LoopSession",
    "SessionSync",
    "SlashCommandRegistry",
    "SlashCommandSpec",
    "discover_slash_commands",
    "invoked_name",
    "opens_workspace",
    "spec_from_module",
]
