# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``examples/sales-accounting-a2a/serve_scenes.py`` (LOOP A-15): which members
it serves, on which ports — the same the Scenes example reads
(``sceneRuntimePorts``) — and what it says of a member it cannot serve.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

SCRIPT = (
    Path(__file__).resolve().parents[2]
    / "examples"
    / "sales-accounting-a2a"
    / "serve_scenes.py"
)


@pytest.fixture(scope="module")
def serve_scenes():
    spec = importlib.util.spec_from_file_location("serve_scenes", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_every_runtime_member_of_every_scene_is_served_once_in_order(
    serve_scenes,
) -> None:
    assert serve_scenes.runtime_members() == [
        "crop-monitoring",
        "disaster-assessment",
        "change-detection",
        "month-end-close",
        "accounting",
    ]


def test_accounting_keeps_its_port_and_the_others_take_the_next_ones(
    serve_scenes,
) -> None:
    members = serve_scenes.runtime_members()
    assert serve_scenes.ports_of(members) == {
        "crop-monitoring": 8768,
        "disaster-assessment": 8769,
        "change-detection": 8770,
        "month-end-close": 8771,
        "accounting": 8767,
    }
    assert serve_scenes.ports_of(
        ["accounting", "crop-monitoring"], ports_from=9000
    ) == {
        "accounting": 8767,
        "crop-monitoring": 9000,
    }
    assert (
        serve_scenes.a2a_url("http://127.0.0.1:8769/", "disaster-assessment")
        == "http://127.0.0.1:8769/api/v1/a2a/agents/disaster-assessment"
    )


def test_a_member_cast_in_the_browser_is_not_served(serve_scenes) -> None:
    from agent_runtimes.specs.scenes import SCENE_CATALOGUE

    scene = SCENE_CATALOGUE["disaster-assessment"]
    assert serve_scenes.runtime_members([scene]) == [
        "disaster-assessment",
        "change-detection",
    ]
    assert "event-response" not in serve_scenes.runtime_members()


def test_what_a_member_needs_is_its_applications_setup(serve_scenes) -> None:
    assert serve_scenes.member_setup("change-detection") == [
        "The agent 'worker-change-detection:0.0.1' is not enabled."
    ]
    assert (
        "The MCP server 'odoo-accounting:0.0.1' is not enabled."
        in serve_scenes.member_setup("month-end-close")
    )
    assert serve_scenes.member_setup("not-an-app") == []


def test_a_member_refused_is_said_not_raised(serve_scenes, monkeypatch, capsys) -> None:
    import agent_runtimes.commands.apps as apps

    def refuse(url, document, organization=None, a2a_url=None):
        raise RuntimeError("its connection earthdata did not start (no key)")

    monkeypatch.setattr(apps, "configure_on", refuse)
    assert serve_scenes.serve("http://127.0.0.1:8770", "change-detection") is False
    out = capsys.readouterr().out
    assert "Change detection is not served on http://127.0.0.1:8770" in out
    assert "earthdata did not start" in out
    assert "worker-change-detection:0.0.1" in out
