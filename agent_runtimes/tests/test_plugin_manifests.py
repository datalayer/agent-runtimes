# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The protocol and harness plugins' manifests are their specs, and the export is up to date.

Each protocol of the agentspecs catalogue has one plugin of the
``agent-protocols`` Extension whose manifest carries its spec; each harness
one plugin of the ``agent-runtimes`` Extension. A protocol plugin's
description to ``protocols.description`` says the roles its spec says. The
export the npm package ships (``src/specs/pluginManifests.generated.*``) is
what the specs give, sorted and stable: ``make specs-manifests`` rewrites it.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from reactor import PluginPlatform

from agent_runtimes.plugins.extension import extension as runtimes_extension
from agent_runtimes.plugins.harnesses import (
    HARNESS_KEY,
    harness_plugin_name,
)
from agent_runtimes.plugins.host import BUILTIN_PLUGIN
from agent_runtimes.protocols import list_protocols
from agent_runtimes.protocols.extension import extension as protocols_extension
from agent_runtimes.protocols.listed import LISTED_PLUGINS
from agent_runtimes.protocols.manifest import POINTS_KEY, PROTOCOL_KEY
from agent_runtimes.specs.harnesses import HARNESS_CATALOGUE
from agent_runtimes.specs.protocols import PROTOCOL_CATALOGUE

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "scripts" / "codegen"))

import export_plugin_manifests  # noqa: E402

JSON_FILE = REPO / "src" / "specs" / "pluginManifests.generated.json"
TS_FILE = REPO / "src" / "specs" / "pluginManifests.generated.ts"


@pytest.fixture(scope="module")
def platform() -> PluginPlatform:
    platform = PluginPlatform()
    platform.register_extension_object(protocols_extension())
    platform.register_extension_object(runtimes_extension())
    return platform


def _listed(platform: PluginPlatform, key: str) -> dict[str, dict]:
    return {
        entry["metadata"][key]["id"]: entry
        for entry in platform.list_plugins()
        if key in entry["metadata"]
    }


def test_every_protocol_of_the_catalogue_has_one_plugin_whose_manifest_is_its_spec(
    platform: PluginPlatform,
) -> None:
    listed = _listed(platform, PROTOCOL_KEY)
    assert sorted(listed) == sorted(PROTOCOL_CATALOGUE)
    for protocol_id, spec in PROTOCOL_CATALOGUE.items():
        manifest = listed[protocol_id]
        assert manifest["display_name"] == spec.name
        assert manifest["description"] == " ".join(spec.description.split())
        assert manifest["package"] == "agent-runtimes"
        assert manifest["tags"] == ["agent-protocols", spec.layer]
        assert manifest["extension"] == "agent-protocols"
        assert manifest["metadata"][PROTOCOL_KEY] == spec.model_dump(mode="json")
        # Its points, as its reactor-points.json says them, are the ones it declares.
        assert [point["id"] for point in manifest["metadata"][POINTS_KEY]] == manifest[
            "contribution_points"
        ]


def test_a_protocol_implemented_elsewhere_is_listed_and_contributes_nothing(
    platform: PluginPlatform,
) -> None:
    listed = _listed(platform, PROTOCOL_KEY)
    for protocol_id, name in LISTED_PLUGINS.items():
        assert listed[protocol_id]["name"] == name
        assert listed[protocol_id]["contribution_points"] == []
    described = {description.catalogue for description in list_protocols(platform)}
    assert described.isdisjoint(LISTED_PLUGINS)


def test_a_protocol_plugin_describes_the_roles_its_spec_says(
    platform: PluginPlatform,
) -> None:
    for description in list_protocols(platform):
        assert (
            list(description.roles) == PROTOCOL_CATALOGUE[description.catalogue].roles
        )


def test_an_extension_point_says_its_uri(platform: PluginPlatform) -> None:
    a2a = _listed(platform, PROTOCOL_KEY)["a2a"]["metadata"][POINTS_KEY]
    assert {point["id"]: point.get("uri") for point in a2a} == {
        "a2a.extension.orchestration": "https://datalayer.ai/extensions/orchestration/v1",
        "a2a.extension.face": "https://datalayer.ai/extensions/face/v1",
        "a2a.extension.other": None,
    }


def test_every_harness_of_the_catalogue_has_one_plugin_whose_manifest_is_its_spec(
    platform: PluginPlatform,
) -> None:
    listed = _listed(platform, HARNESS_KEY)
    assert sorted(listed) == sorted(HARNESS_CATALOGUE)
    for harness_id, spec in HARNESS_CATALOGUE.items():
        manifest = listed[harness_id]
        assert manifest["name"] == harness_plugin_name(harness_id)
        assert manifest["display_name"] == spec.name
        assert manifest["description"] == " ".join(spec.description.split())
        assert manifest["package"] == "agent-runtimes"
        assert manifest["tags"] == ["agent-runtimes", *spec.tags]
        assert manifest["dependencies"] == [BUILTIN_PLUGIN]
        assert manifest["extension"] == "agent-runtimes"
        assert manifest["metadata"][HARNESS_KEY] == spec.model_dump(mode="json")


def test_a_harness_manifest_carries_its_capabilities_and_local_keys(
    platform: PluginPlatform,
) -> None:
    claude = _listed(platform, HARNESS_KEY)["claude-code"]["metadata"][HARNESS_KEY]
    assert claude["capabilities"]["resume"] == "load"
    assert claude["capabilities"]["fork_history"] == "replay"
    assert claude["capabilities"]["interrupt"] is True
    assert claude["capabilities"]["auto_run"]
    assert claude["requires"]["secrets"] == ["ANTHROPIC_API_KEY"]
    assert "ai-inference" in claude["registered"]["credential"]


def test_the_export_is_sorted_and_stable() -> None:
    first = export_plugin_manifests.collect()
    second = export_plugin_manifests.collect()
    assert export_plugin_manifests.render_json(
        first
    ) == export_plugin_manifests.render_json(second)
    assert [m["metadata"][PROTOCOL_KEY]["id"] for m in first["protocols"]] == sorted(
        PROTOCOL_CATALOGUE
    )
    assert [m["metadata"][HARNESS_KEY]["id"] for m in first["harnesses"]] == sorted(
        HARNESS_CATALOGUE
    )
    # The manifest fields alone, never the platform's state.
    for manifest in first["protocols"] + first["harnesses"]:
        assert set(manifest) == set(export_plugin_manifests.MANIFEST_FIELDS)


def test_the_committed_export_is_what_the_specs_give() -> None:
    data = export_plugin_manifests.collect()
    assert JSON_FILE.read_text() == export_plugin_manifests.render_json(data), (
        "src/specs/pluginManifests.generated.json is stale: run 'make specs-manifests'"
    )
    assert TS_FILE.read_text() == export_plugin_manifests.render_typescript(data), (
        "src/specs/pluginManifests.generated.ts is stale: run 'make specs-manifests'"
    )
    assert json.loads(JSON_FILE.read_text()) == data
