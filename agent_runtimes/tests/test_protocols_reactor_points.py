# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Every protocol plugin held to its ``reactor-points.json`` (AGENT_PROTOCOLS §3.1, PR-50).

For each point of each protocol: exported under the id the file says,
declared by the plugin the file names, its default contributed at order
100 (or none), replaced by a host's lower-order contribution, gone with the
host's plugin, and — for a single-provider point — two at the same winning
order failing closed. The TypeScript plugins are held to the same files by
``src/protocols/reactorPoints.unit.test.ts``.
"""

from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import Any

import pytest
from reactor import PluginManifest, PluginPlatform

from agent_runtimes.protocols import (
    DEFAULT_ORDER,
    DESCRIPTIONS,
    ProtocolDescription,
    build_protocols_reactor,
    first_contribution,
    list_protocols,
)
from agent_runtimes.protocols.extension import EXTENSION, extension

ROOT = Path(__file__).parents[1] / "protocols"
FILES = sorted(ROOT.glob("**/reactor-points.json"))
INVENTORY = {path.parent.name: json.loads(path.read_text()) for path in FILES}
POINTS = [(name, entry) for name, data in INVENTORY.items() for entry in data["points"]]


def _constant(path: str) -> Any:
    module, name = path.split(":")
    return getattr(importlib.import_module(module), name)


class _Host:
    def __init__(self, point: Any, value: object, order: int, cid: str) -> None:
        self.point, self.value, self.order, self.cid = point, value, order, cid

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            self.point, self.value, contribution_id=self.cid, order=self.order
        )


def _platform() -> PluginPlatform:
    return build_protocols_reactor()


def test_one_file_per_protocol_plugin():
    names = {path.parent.name for path in FILES}
    assert {
        "protocols",
        "mcp",
        "a2a",
        "web_bot_auth",
        "ucp",
        "agentic_commerce",
        "pact",
    } <= names


def test_the_extension_delivers_every_plugin_and_decides_nothing():
    platform = _platform()
    [delivered] = [e for e in platform.list_extensions() if e["name"] == EXTENSION]
    expected = {data["plugin"]["python"] for data in INVENTORY.values()}
    assert set(delivered["plugins"]) == expected
    assert [manifest.name for manifest, _ in extension().plugins] == delivered[
        "plugins"
    ]
    # Registered once, even when asked again.
    build_protocols_reactor(platform=platform)


@pytest.mark.parametrize("protocol,entry", POINTS, ids=[e["id"] for _, e in POINTS])
def test_point_exported_and_declared(protocol, entry):
    point = _constant(entry["python"])
    assert point.id == entry["id"]
    if entry.get("extension"):
        assert ".extension." in entry["id"]
    platform = _platform()
    plugin = INVENTORY[protocol]["plugin"]["python"]
    declared = [p for p in platform.list_plugins() if p["name"] == plugin]
    assert declared, plugin
    manifest = next(m for m, _ in extension().plugins if m.name == plugin)
    assert entry["id"] in manifest.contribution_points


@pytest.mark.parametrize("protocol,entry", POINTS, ids=[e["id"] for _, e in POINTS])
def test_point_default_replacement_removal(protocol, entry):
    point = _constant(entry["python"])
    platform = _platform()
    contributions = platform.get_contributions(point)
    if entry["default"] is None:
        own = [
            c
            for c in contributions
            if c.plugin == INVENTORY[protocol]["plugin"]["python"]
        ]
        assert own == []
    else:
        [default] = contributions
        assert (default.id, default.order) == (
            entry["default"]["python"],
            DEFAULT_ORDER,
        )
        for member in entry["members"]:
            assert hasattr(default.value, member), member
    value = object()
    platform.register_plugin(
        PluginManifest(name="host", version="1.0.0"), _Host(point, value, 10, "host")
    )
    if entry["resolution"] == "single":
        assert first_contribution(platform, point, entry["id"]) is value
        platform.register_plugin(
            PluginManifest(name="rival", version="1.0.0"),
            _Host(point, object(), 10, "rival"),
        )
        with pytest.raises(LookupError, match="same order"):
            first_contribution(platform, point, entry["id"])
        platform.unregister_plugin("rival")
    else:
        assert value in [c.value for c in platform.get_contributions(point)]
    platform.unregister_plugin("host")
    assert value not in [c.value for c in platform.get_contributions(point)]


def test_each_plugin_describes_its_protocol():
    platform = _platform()
    described = {d.id: d for d in list_protocols(platform)}
    assert set(described) == {
        "a2a",
        "agentic_commerce",
        "mcp",
        "pact",
        "ucp",
        "web_bot_auth",
    }
    for name, data in INVENTORY.items():
        if name == "protocols":
            continue
        description = described[name]
        assert description.plugin == data["plugin"]["python"]
        assert set(description.points) == {entry["id"] for entry in data["points"]}
        assert description.version


def test_a_lower_order_description_answers_in_place():
    better = ProtocolDescription(
        id="a2a",
        name="A2A",
        layer="transport",
        version="1.1",
        roles=("client",),
        status="partial",
        specification="https://a2a-protocol.org",
        plugin="better",
    )
    platform = build_protocols_reactor(
        plugins=[
            (
                PluginManifest(name="better", version="1"),
                _Host(DESCRIPTIONS, better, 10, "a2a"),
            )
        ]
    )
    assert {d.id: d.version for d in list_protocols(platform)}["a2a"] == "1.1"
    platform.register_plugin(
        PluginManifest(name="wrong", version="1"),
        _Host(DESCRIPTIONS, {"id": "x"}, 5, "x"),
    )
    with pytest.raises(TypeError, match="ProtocolDescription"):
        list_protocols(platform)
