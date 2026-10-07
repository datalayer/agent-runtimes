# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application's two plugins, named once (LOOP F-15, F-16).

The runtime's plugin and the page's share the application's name,
``loop-app-<id>``; the runtime's manifest names the page's as what it cannot be
used without, both are delivered as one extension of that name, and the page
follows what the runtime holds through ``/api/v1/apps/<id>/plugins/state``.
Written as a spec or ejected to an ``app.py``, an application is the same pair
(the page's half, and its Canvas round trip, in ``src/loop/__tests__/plugin-pair.test.ts``).
"""

from __future__ import annotations

import json
from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.testclient import TestClient
from reactor import ContributionRegistry

from agent_runtimes.loop.apps.application import load_application
from agent_runtimes.loop.apps.loading import load_app
from agent_runtimes.loop.apps.plugins import (
    REGISTRY,
    app_plugin_name,
    app_plugins_state,
    manifest_of,
    register_app,
    register_application,
    revision_of,
    unregister_app,
)
from agent_runtimes.loop.apps.scaffold import eject, init
from agent_runtimes.routes.app_plugins import router
from agent_runtimes.specs.apps import APP_CATALOGUE


def _pair(manifest) -> tuple:
    """What a manifest says of the pair: its name, the page plugin it needs,
    and the extension that delivers both.
    """
    return (manifest.name, tuple(manifest.frontend_dependencies), manifest.extension)


def test_the_pair_has_one_name_declared_each_way() -> None:
    for app in APP_CATALOGUE.values():
        name = app_plugin_name(app.id)
        assert name == f"loop-app-{app.id}"
        assert _pair(manifest_of(app)) == (name, (name,), name)


def test_the_state_says_the_applications_own_plugin_once_it_is_held() -> None:
    registry = ContributionRegistry()
    app = APP_CATALOGUE["web-research"]
    before = app_plugins_state(app.id, registry)
    # Known from the catalogue, not configured: its own plugin is not held.
    assert before["plugins"] == []
    register_app(app, registry)
    held = app_plugins_state(app.id, registry)
    assert held["plugins"] == [
        {
            "name": "loop-app-web-research",
            "enabled": True,
            "activated": True,
            "display_name": app.name,
            "emoji": app.emoji,
            "extension": "loop-app-web-research",
            "frontend_dependencies": ["loop-app-web-research"],
        }
    ]
    assert held["revision"] > before["revision"]
    # Nothing of another application, held or not.
    register_app(APP_CATALOGUE["inbox-triage"], registry)
    assert [p["name"] for p in app_plugins_state(app.id, registry)["plugins"]] == [
        "loop-app-web-research"
    ]
    assert app_plugins_state("support-desk", registry)["plugins"] == []
    revision = revision_of(registry)
    assert unregister_app(app.id, registry)
    gone = app_plugins_state(app.id, registry)
    assert gone["plugins"] == [] and gone["revision"] > revision
    # Taking away what is not there changes nothing.
    assert not unregister_app(app.id, registry)
    assert revision_of(registry) == gone["revision"]


def test_the_routes_answer_reactors_shape_for_one_application() -> None:
    api = FastAPI()
    api.include_router(router, prefix="/api/v1")
    client = TestClient(api)
    app = APP_CATALOGUE["web-research"]
    unregister_app(app.id)
    try:
        state = client.get(f"/api/v1/apps/{app.id}/plugins/state").json()
        assert state == {"revision": revision_of(REGISTRY), "plugins": []}
        register_app(app)
        state = client.get(f"/api/v1/apps/{app.id}/plugins/state").json()
        assert [p["name"] for p in state["plugins"]] == ["loop-app-web-research"]
        streamed = client.get(
            f"/api/v1/apps/{app.id}/events/stream",
            params={"poll_seconds": 0.01, "max_seconds": 0.05},
        )
        assert streamed.headers["content-type"].startswith("text/event-stream")
        frames = [
            line[len("data: ") :]
            for line in streamed.text.splitlines()
            if line.startswith("data: ")
        ]
        # One frame while nothing moves: the snapshot.
        assert [json.loads(frame) for frame in frames] == [state]
    finally:
        unregister_app(app.id)


def test_a_spec_and_the_app_py_eject_writes_give_the_same_pair(tmp_path: Path) -> None:
    """LOOP F-16, the runtime's half: the spec, and the ``app.py`` that
    ``loop apps eject`` writes from it, are the same plugin pair."""
    written = init("desk", tmp_path, example="support-desk")
    spec_path = written.folder / "app.yaml"
    from_spec = manifest_of(load_app(yaml.safe_load(spec_path.read_text())))
    application = load_application(eject(spec_path))
    from_python = register_application(application, ContributionRegistry())
    assert (
        _pair(from_spec)
        == _pair(from_python)
        == (
            "loop-app-desk",
            ("loop-app-desk",),
            "loop-app-desk",
        )
    )
