# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session's shape and states in the record (MH-01).

A session is `open`, `paused` or `ended` — the record's word, written on
every change — and, while open, the runtime says its turn phase beside it
(`turn`: idle, running, waiting). `stopped` is no state: posted, it is
refused in a sentence; in the code, the only `stopped` left is the run's
end word (`RUN_ENDS`). The `session` entry carries the session's shape
(agent, harness, runs_on, title, archived, lineage); `paused` and `ended`
entries say the state; a runtime stopping gracefully writes `paused` for
every open session it holds.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.record import (
    SESSION_KINDS,
    SESSION_STATES,
    session_facts,
    session_state_of,
)
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)

PACKAGE = Path(sessions.__file__).resolve().parents[3]


def _open(client: TestClient, uid: str, person: str = "ada") -> None:
    events_of(
        client.post(
            "/api/v1/apps/sessions",
            headers=as_(person),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": "One",
                "session": uid,
            },
        )
    )


def _state_entries(made: Runtime, uid: str) -> List[Dict[str, Any]]:
    return [
        {"kind": e["kind"], **e["payload"]}
        for e in [
            {**entry, "session_uid": body["session_uid"]}
            for body in made.records
            for entry in body["entries"]
        ]
        if e["session_uid"] == uid and e["kind"] in ("session", "paused", "ended")
    ]


def test_the_shape_in_the_record_and_describe(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-0101")
    [opened] = _state_entries(runtime, "session-0101")
    assert opened == {
        "kind": "session",
        "app": "notes-assistant",
        "state": "open",
        "agent": "notes-assistant",
        "harness": None,
        "runs_on": {"kind": "runtime", "uid": "local"},
        "title": "",
        "archived": False,
        "lineage": {"forked_from": None, "imported_from": None},
    }
    said = remote.get("/api/v1/apps/sessions/session-0101", headers=as_("ada")).json()
    assert {
        k: said[k]
        for k in (
            "state",
            "turn",
            "held",
            "harness",
            "title",
            "archived",
            "lineage",
            "runs_on",
            "turns",
        )
    } == {
        "state": "open",
        "turn": "idle",
        "held": True,
        "harness": None,
        # The first turn's first line, until the person gives one (MH-43).
        "title": "One",
        "archived": False,
        "lineage": {"forked_from": None, "imported_from": None},
        "runs_on": {"kind": "runtime", "uid": "local"},
        "turns": 1,
    }


def test_describe_after_each_operation_and_the_entries(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-0102")
    paused = remote.post(
        "/api/v1/apps/sessions/session-0102/stop", headers=as_("ada")
    ).json()
    assert (paused["state"], paused["turn"]) == ("paused", "idle")
    # Stop of a paused one: 409.
    again = remote.post("/api/v1/apps/sessions/session-0102/stop", headers=as_("ada"))
    assert (again.status_code, again.json()["detail"]) == (
        409,
        "Session session-0102 is paused already.",
    )
    events_of(
        remote.post(
            "/api/v1/apps/sessions/session-0102/resume", headers=as_("ada"), json={}
        )
    )
    assert (
        remote.get("/api/v1/apps/sessions/session-0102", headers=as_("ada")).json()[
            "state"
        ]
        == "open"
    )
    # Resume of an open one: 409.
    open_again = remote.post(
        "/api/v1/apps/sessions/session-0102/resume", headers=as_("ada"), json={}
    )
    assert (open_again.status_code, open_again.json()["detail"]) == (
        409,
        "Session session-0102 is open, not paused.",
    )
    ended = remote.post(
        "/api/v1/apps/sessions/session-0102/end", headers=as_("ada")
    ).json()
    assert (ended["state"], ended["turn"]) == ("ended", "idle")
    states = [(e["kind"], e["state"]) for e in _state_entries(runtime, "session-0102")]
    assert states == [
        ("session", "open"),
        ("paused", "paused"),
        ("session", "open"),
        ("paused", "paused"),
        ("ended", "ended"),
    ] or states == [
        ("session", "open"),
        ("paused", "paused"),
        ("session", "open"),
        ("ended", "ended"),
    ]
    assert (
        session_state_of([{"kind": k, "payload": {"state": v}} for k, v in states])
        == "ended"
    )
    [ended_entry] = [
        e for e in _state_entries(runtime, "session-0102") if e["kind"] == "ended"
    ]
    assert ended_entry["by"] == "end"
    [paused_entry, *_] = [
        e for e in _state_entries(runtime, "session-0102") if e["kind"] == "paused"
    ]
    assert paused_entry["cancelled"] == {}


def test_stopped_posted_answers_422_in_a_sentence(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    refused = remote.get("/api/v1/apps/sessions?state=stopped", headers=as_("ada"))
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "There is no session state 'stopped': one of open, paused, ended.",
    )
    with pytest.raises(sessions.SessionRefused, match="no session state 'running'"):
        sessions.check_state("running")
    with pytest.raises(ValueError, match="no session state 'stopped'"):
        session_state_of([{"kind": "paused", "payload": {"state": "stopped"}}])
    assert sessions.STATES == SESSION_STATES == ("open", "paused", "ended")
    assert sessions.TURNS == ("idle", "running", "waiting")
    assert set(SESSION_KINDS) == {
        "paused",
        "ended",
        "swapped",
        "cloned",
        "imported",
        "exported",
        "titled",
    }
    assert session_facts(None)["lineage"] == {
        "forked_from": None,
        "imported_from": None,
    }


def test_a_graceful_stop_leaves_paused_entries_for_two_held_sessions(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-0103")
    _open(remote, "session-0104", person="bob")
    import asyncio

    paused = asyncio.run(sessions.pause_held())
    assert sorted(paused) == ["session-0103", "session-0104"]
    for uid in ("session-0103", "session-0104"):
        assert [e["state"] for e in _state_entries(runtime, uid)] == ["open", "paused"]
        held = sessions.session_of(uid)
        assert held is not None and held.state == "paused"
    # Already paused: a second graceful stop pauses nothing more.
    assert asyncio.run(sessions.pause_held()) == []


def test_the_only_stopped_left_in_the_code_is_the_runs_end_word() -> None:
    for relative in (
        "agent_runtimes/loop/apps/sessions.py",
        "agent_runtimes/routes/apps.py",
    ):
        lines = (PACKAGE / relative).read_text().splitlines()
        for number, line in enumerate(lines, 1):
            if '"stopped"' not in line:
                continue
            around = "\n".join(lines[max(0, number - 3) : number + 1])
            assert (
                "RUN_ENDS" in around
                or "ended(" in around
                or "served_apps" in around
                or line.strip().startswith("#")
            ), f"{relative}:{number}: {line.strip()}"
