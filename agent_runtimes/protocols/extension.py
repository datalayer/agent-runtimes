# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``agent-protocols`` Reactor Extension: the protocol plugins, delivered together.

An Extension in Reactor's sense only groups plugins as a unit of delivery:
it has no lifecycle, contributes nothing and cannot be enabled. Advertised
under ``datalayer.reactor.extensions``, so a Reactor host that discovers
extensions gets every protocol plugin; :func:`build_protocols_reactor`
registers it directly.
"""

from __future__ import annotations

from reactor import ExtensionManifest, ReactorExtension

EXTENSION = "agent-protocols"


def extension() -> ReactorExtension:
    """The entry point (``datalayer.reactor.extensions``)."""
    from . import core_plugin
    from .a2a.plugin import plugin as a2a
    from .agentic_commerce.plugin import plugin as agentic_commerce
    from .mcp import plugin as mcp
    from .pact.plugin import plugin as pact
    from .ucp.plugin import plugin as ucp
    from .web_bot_auth.plugin import plugin as web_bot_auth

    return ReactorExtension(
        manifest=ExtensionManifest(
            name=EXTENSION,
            version="1.0.0",
            display_name="Agent protocols",
            description="MCP, A2A, Web Bot Auth, UCP, the Agentic Commerce Protocol and PACT, each a plugin; their extensions its contribution points.",
            octicon="plug",
        ),
        plugins=[
            core_plugin(),
            mcp(),
            a2a(),
            web_bot_auth(),
            ucp(),
            agentic_commerce(),
            pact(),
        ],
    )


__all__ = ["EXTENSION", "extension"]
