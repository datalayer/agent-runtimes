# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The protocols of the catalogue implemented outside a protocol plugin.

A2UI (``a2ui``) is drawn by the ``a2ui`` UI plugins, AG-UI (``ag-ui``) is a
transport of the agent-runtimes server, and the Trusted Agent Protocol
(``tap``) is a profile of Web Bot Auth (:mod:`.web_bot_auth.tap`). Each is
still a plugin of the ``agent-protocols`` Extension, so that every protocol
of the catalogue has a manifest a host lists (:mod:`.manifest`): it declares
no point and contributes nothing — in particular no description to
``protocols.description``, which says what a runtime's protocol plugins
implement.
"""

from __future__ import annotations

from reactor import PluginManifest

from .manifest import protocol_manifest

#: Each listed protocol's plugin name, by its catalogue id.
LISTED_PLUGINS: dict[str, str] = {
    "a2ui": "agent-runtimes.protocols.a2ui",
    "ag-ui": "agent-runtimes.protocols.ag-ui",
    "tap": "agent-runtimes.protocols.tap",
}


class ListedProtocolPlugin:
    """Declares nothing, contributes nothing: a manifest to list."""


def listed_plugins() -> list[tuple[PluginManifest, ListedProtocolPlugin]]:
    """The listed protocols' plugins, in the catalogue's order of ids."""
    return [
        (protocol_manifest(catalogue, name=name), ListedProtocolPlugin())
        for catalogue, name in sorted(LISTED_PLUGINS.items())
    ]


__all__ = ["LISTED_PLUGINS", "ListedProtocolPlugin", "listed_plugins"]
