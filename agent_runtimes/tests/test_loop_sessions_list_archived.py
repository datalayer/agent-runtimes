# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop sessions list --archived`: the archived sessions too, each marked."""

from __future__ import annotations

from typing import Any, Dict, List

from typer.testing import CliRunner

from agent_runtimes.commands import sessions

runner = CliRunner()

ROWS = [
    {"uid": "01a", "state": "paused", "kind": "app", "agent": "writer", "turns": 2},
    {
        "uid": "01b",
        "state": "ended",
        "kind": "app",
        "agent": "writer",
        "turns": 1,
        "archived": True,
    },
]


class _Answer:
    def __init__(self, body: Dict[str, Any]) -> None:
        self._body = body

    def json(self) -> Dict[str, Any]:
        return self._body


def _listing(monkeypatch: Any) -> List[Dict[str, Any]]:
    asked: List[Dict[str, Any]] = []

    def ask(client: Any, method: str, path: str, **kwargs: Any) -> _Answer:
        params = dict(kwargs.get("params") or {})
        asked.append(params)
        rows = ROWS if params.get("archived") == "true" else ROWS[:1]
        return _Answer({"sessions": rows})

    monkeypatch.setattr(sessions, "_client", lambda server, cloud: object())
    monkeypatch.setattr(sessions, "_ask", ask)
    return asked


def test_archived_sessions_are_left_out_unless_asked_for(monkeypatch: Any) -> None:
    asked = _listing(monkeypatch)
    result = runner.invoke(sessions.app, ["list"])
    assert result.exit_code == 0, result.output
    assert "archived" not in asked[0]
    assert "01a" in result.output and "01b" not in result.output


def test_the_archived_flag_lists_them_too_and_marks_each(monkeypatch: Any) -> None:
    asked = _listing(monkeypatch)
    result = runner.invoke(sessions.app, ["list", "--archived"])
    assert result.exit_code == 0, result.output
    assert asked[0]["archived"] == "true"
    lines = result.output.splitlines()
    assert "archived" in next(line for line in lines if line.startswith("01b"))
    assert "archived" not in next(line for line in lines if line.startswith("01a"))


def test_the_former_all_flag_is_gone() -> None:
    assert runner.invoke(sessions.app, ["list", "--all"]).exit_code != 0
