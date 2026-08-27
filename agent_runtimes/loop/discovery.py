# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Finding the slash commands that do not live in this repository.

The Datalayer CLI already discovers its command *groups* through the
``datalayer.cli`` entry point and the reactor's ``provide_cli`` hook. Interactive
commands work the same way through ``provide_slash_commands``: a distribution
advertises a plugin, the plugin is handed the registry, and it registers what it
ships.

    [project.entry-points."loop.plugins"]
    my-package = "my_package.loop_plugin:plugin"

A plugin that cannot be loaded — a missing optional dependency, a broken import,
an exception in the hook — costs a warning and is skipped. One bad plugin must
never be the reason a prompt refuses to open.
"""

from __future__ import annotations

import logging
from importlib.metadata import entry_points
from typing import Any, Iterable

from agent_runtimes.loop.commands import SlashCommandRegistry

logger = logging.getLogger(__name__)

#: Entry point group advertising interactive command plugins.
ENTRY_POINT_GROUP = "loop.plugins"


def _iter_entry_points(group: str) -> Iterable[Any]:
    """Entry points for a group, tolerating an unreadable environment."""
    try:
        return tuple(entry_points(group=group))
    except Exception as error:  # noqa: BLE001
        logger.warning("Entry points for %s could not be read: %s", group, error)
        return ()


def _resolve_plugin(loaded: Any) -> Any:
    """Get the implementation object out of whatever an entry point resolved to.

    Mirrors ``agent_runtimes.reactor_extension:plugin``, which returns a
    ``(manifest, implementation)`` pair. A plugin may also expose the
    implementation directly, or a zero-argument factory for one.
    """
    if callable(loaded):
        loaded = loaded()
    if isinstance(loaded, tuple) and len(loaded) == 2:
        return loaded[1]
    return loaded


def discover_slash_commands(
    registry: SlashCommandRegistry,
    *,
    group: str = ENTRY_POINT_GROUP,
) -> tuple[str, ...]:
    """Let every discovered plugin register its commands.

    Returns the names of the plugins that contributed, for logging and for the
    `/help` footer — a user who installed a plugin should be able to see that it
    was found.
    """
    contributed: list[str] = []

    for entry_point in _iter_entry_points(group):
        name = getattr(entry_point, "name", "?")
        try:
            implementation = _resolve_plugin(entry_point.load())
            hook = getattr(implementation, "provide_slash_commands", None)
            if hook is None:
                logger.debug("Plugin %s provides no slash commands", name)
                continue
            hook(registry)
            contributed.append(name)
        except Exception as error:  # noqa: BLE001
            logger.warning(
                "The slash commands of plugin %s could not be registered: %s",
                name,
                error,
            )

    return tuple(contributed)
