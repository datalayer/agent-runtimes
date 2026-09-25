# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Finding the slash commands that do not live in this repository.

The mechanism moved to :func:`reactor.repl.discover_slash_commands` — it was
never about agents, and the reactor's extensible REPL walks exactly the same
road. What stays here is the agent-runtimes *convention*: the entry-point
group interactive command plugins advertise under.

    [project.entry-points."loop.plugins"]
    my-package = "my_package.loop_plugin:plugin"

A plugin that cannot be loaded — a missing optional dependency, a broken
import, an exception in the hook — costs a warning and is skipped. One bad
plugin must never be the reason a prompt refuses to open.
"""

from __future__ import annotations

from reactor.repl import discover_slash_commands as _discover

from agent_runtimes.loop.commands import SlashCommandRegistry

#: Entry point group advertising interactive command plugins.
ENTRY_POINT_GROUP = "loop.plugins"


def discover_slash_commands(
    registry: SlashCommandRegistry,
    *,
    group: str = ENTRY_POINT_GROUP,
) -> tuple[str, ...]:
    """Let every discovered plugin register its commands.

    Returns the names of the plugins that contributed, for logging and for
    the `/help` footer — a user who installed a plugin should be able to see
    that it was found.
    """
    return _discover(registry, group=group)
