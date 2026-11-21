# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A protocol plugin's Reactor manifest, from its protocol spec.

What the Agentspecs pages show of a protocol is carried by its plugin's
manifest (the user, 21 November 2026): its name and description, the
distribution that ships the plugin, ``agent-protocols`` and its layer as
tags, the contribution points it declares, and under ``metadata`` the whole
protocol spec (``agentspecs/protocols``, generated into
:mod:`agent_runtimes.specs.protocols`) as ``protocol`` — publisher, layer,
the specification and the version implemented, shipped or planned, what it
connects an agent to, the roles a runtime takes in it, the packages that
implement it, its protocol tools and Appspec block — and its contribution
points as its ``reactor-points.json`` says them, as ``points`` (the
extensions it defines, with their URIs). One source: the YAML, the
generated spec, then this.

A host reads it with ``list_plugins()`` before anything runs;
``scripts/codegen/export_plugin_manifests.py`` writes what it lists for the
npm package. The plugin's ``version`` is its own (``1.0.0``); the spec's is
under ``metadata.protocol.version``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Iterable, Optional

from reactor import PluginManifest

#: The distribution that ships the protocol plugins.
PACKAGE = "agent-runtimes"
#: Every protocol plugin's own version.
PLUGIN_VERSION = "1.0.0"
#: Where a protocol plugin's manifest keeps its spec.
PROTOCOL_KEY = "protocol"
#: Where it keeps its contribution points.
POINTS_KEY = "points"
#: Every protocol plugin's icon (the Agentspecs pages' globe).
OCTICON = "globe"


def protocol_spec(catalogue: str) -> Any:
    """The protocol spec of a catalogue id.

    :raises KeyError: When the catalogue has none: a plugin names a protocol
        of the catalogue, or is refused.
    """
    from agent_runtimes.specs.protocols import PROTOCOL_CATALOGUE

    try:
        return PROTOCOL_CATALOGUE[catalogue]
    except KeyError:
        raise KeyError(
            f"there is no protocol {catalogue!r} in the catalogue: one of "
            f"{', '.join(sorted(PROTOCOL_CATALOGUE))}"
        ) from None


def protocol_roles(catalogue: str) -> tuple[str, ...]:
    """The roles a runtime takes in a protocol, as its spec says them."""
    return tuple(protocol_spec(catalogue).roles)


def _points(points_file: Optional[Path]) -> list[dict[str, Any]]:
    if points_file is None:
        return []
    entries = json.loads(points_file.read_text())["points"]
    return [
        {
            "id": entry["id"],
            "extension": bool(entry["extension"]),
            "resolution": entry["resolution"],
            **({"uri": entry["uri"]} if entry.get("uri") else {}),
        }
        for entry in entries
    ]


def protocol_manifest(
    catalogue: str,
    *,
    name: str,
    contribution_points: Iterable[str] = (),
    points_file: Optional[Path] = None,
) -> PluginManifest:
    """The manifest of the plugin ``name`` implementing the catalogue's ``catalogue``.

    ``points_file`` is the plugin's ``reactor-points.json``; its points must
    be the ones the plugin declares.
    """
    spec = protocol_spec(catalogue)
    declared = list(contribution_points)
    points = _points(points_file)
    if [point["id"] for point in points] != declared:
        raise ValueError(
            f"{name}: declares {declared}, its reactor-points.json says "
            f"{[point['id'] for point in points]}"
        )
    return PluginManifest(
        name=name,
        version=PLUGIN_VERSION,
        display_name=spec.name,
        description=" ".join(spec.description.split()),
        octicon=OCTICON,
        package=PACKAGE,
        tags=["agent-protocols", spec.layer],
        contribution_points=declared,
        metadata={
            PROTOCOL_KEY: spec.model_dump(mode="json"),
            POINTS_KEY: points,
        },
    )


__all__ = [
    "OCTICON",
    "PACKAGE",
    "PLUGIN_VERSION",
    "POINTS_KEY",
    "PROTOCOL_KEY",
    "protocol_manifest",
    "protocol_roles",
    "protocol_spec",
]
