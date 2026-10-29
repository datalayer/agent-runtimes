# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``agent-runtimes`` reactor extension (MH-F01): the session's points,
and the built-in plugin that contributes today's implementations.

Advertised under ``datalayer.reactor.extensions`` beside ``agent-protocols``
(``pyproject.toml``), so a reactor host that discovers extensions gets the
session's points and their built-ins; the runtime registers it on its own
platform (:func:`agent_runtimes.plugins.host.session_platform`). The
built-in plugin, ``agent-runtimes.sessions``, contributes at ``order=0``,
first: the seam keeps one contribution per id — the earliest as the registry
orders them — and refuses a second by name (a plugin does not replace the
catalogue's ``claude-code``; it contributes ``aider``).
"""

from __future__ import annotations

from typing import Any

from reactor import ExtensionManifest, PluginManifest, ReactorExtension, hookimpl

from agent_runtimes.plugins.host import BUILTIN_PLUGIN, EXTENSION
from agent_runtimes.plugins.points import POINTS

#: The order of the built-in contributions: first.
DEFAULT_ORDER = 0


class SessionsPlugin:
    """Contributes the harness catalogue, the stores, the format, the carry
    policy and the hooks agent-runtimes ships (:mod:`.builtin`).
    """

    @hookimpl
    def provide_contributions(self, contributions: Any) -> None:
        from agent_runtimes.plugins.builtin import contribute_builtins

        contribute_builtins(contributions, order=DEFAULT_ORDER)


def plugin() -> tuple[PluginManifest, SessionsPlugin]:
    """The built-in plugin, as the extension delivers it."""
    return (
        PluginManifest(
            name=BUILTIN_PLUGIN,
            version="1.0.0",
            description=(
                "The session's points — harness, session.store, session.format, "
                "session.carry, session.hook — and what agent-runtimes contributes to each."
            ),
            tags=["agent-runtimes", "sessions"],
            contribution_points=[point.id for point in POINTS],
        ),
        SessionsPlugin(),
    )


def extension() -> ReactorExtension:
    """The entry point (``datalayer.reactor.extensions``)."""
    from agent_runtimes.guardrails.organization_harnesses import organization_plugin

    return ReactorExtension(
        manifest=ExtensionManifest(
            name=EXTENSION,
            version="1.0.0",
            display_name="Agent runtimes",
            description=(
                "The session as the unit of agent-runtimes: its harnesses, where it is kept, "
                "the files it travels as, what a swap carries, what runs before each operation."
            ),
            octicon="versions",
        ),
        plugins=[plugin(), organization_plugin()],
    )


__all__ = ["DEFAULT_ORDER", "SessionsPlugin", "extension", "plugin"]
