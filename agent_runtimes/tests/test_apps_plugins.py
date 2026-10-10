# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications as Reactor plugins on the runtime (LOOP §5.4, F-12, F-13)."""

from __future__ import annotations

from typing import Any, Optional

from reactor import PluginManifest, PluginPlatform

from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.plugins import (
    APP_POINT,
    CATALOGUE_PLUGIN,
    app_plugin_name,
    find_app,
    list_apps,
    manifest_of,
    register_app,
    rules_for,
    unregister_app,
)
from agent_runtimes.specs.apps import APP_CATALOGUE

EDITED = {
    "schema": "loop.app/v1",
    "id": "web-research",
    "name": "Web research, edited",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "emoji": "\U0001f9ed",
    "connections": [{"server": "tavily:0.0.1"}],
}


def test_the_catalogue_is_contributed_by_agent_runtimes() -> None:
    registry = PluginPlatform()
    apps = list_apps(registry)
    assert {app.id for app in apps} == set(APP_CATALOGUE)
    assert {c.plugin for c in registry.get_contributions(APP_POINT)} == {
        CATALOGUE_PLUGIN
    }
    assert find_app("web-research", registry) is APP_CATALOGUE["web-research"]
    assert find_app("no-such-app", registry) is None


def test_an_application_of_its_own_wins_over_the_catalogue_and_goes_away() -> None:
    registry = PluginPlatform()
    edited = load_app(EDITED)
    manifest = register_app(edited, registry)
    assert manifest.name == app_plugin_name("web-research") == "loop-app-web-research"
    assert (manifest.display_name, manifest.emoji) == (
        "Web research, edited",
        "\U0001f9ed",
    )
    assert find_app("web-research", registry) is edited
    assert [app for app in list_apps(registry) if app.id == "web-research"] == [edited]
    assert len(list_apps(registry)) == len(APP_CATALOGUE)
    # Configured again: replaced, not added.
    register_app(edited, registry)
    held = registry.get_contributions(APP_POINT)
    assert len([c for c in held if c.plugin == manifest.name]) == 1
    assert registry.has_plugin(manifest.name)
    assert unregister_app("web-research", registry)
    assert not registry.has_plugin(manifest.name)
    assert find_app("web-research", registry) is APP_CATALOGUE["web-research"]


def test_the_rules_are_an_extension_a_plugin_can_replace() -> None:
    registry = PluginPlatform()
    app = find_app("web-research", registry)
    assert app is not None
    rules = rules_for(app, agent_id="default", platform=registry)
    assert isinstance(rules, AppRulesCapability)
    assert rules.agent_id == "default"

    class Stricter(AppRulesCapability):
        pass

    def stricter(app: Any, agent_id: Optional[str]) -> AppRulesCapability:
        return Stricter(app=app, agent_id=agent_id)

    app_id = app.id

    class StricterPolicy:
        """Another Reactor plugin, extending the application's contribution."""

        def provide_contributions(self, contributions: Any) -> None:
            contributions.extend(APP_POINT, app_id, stricter)

    registry.register_plugin(
        PluginManifest(name="a-stricter-policy", version="1.0.0"), StricterPolicy()
    )
    assert isinstance(rules_for(app, platform=registry), Stricter)


def test_the_manifest_is_the_applications_identity() -> None:
    manifest = manifest_of(APP_CATALOGUE["inbox-triage"])
    assert manifest.version == APP_CATALOGUE["inbox-triage"].version
    assert "worker" in manifest.tags
