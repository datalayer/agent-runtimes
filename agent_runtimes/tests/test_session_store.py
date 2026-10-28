# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `session.store` point and its two contributions (MH-F03).

The file store keeps a session whole under `~/.datalayer/sessions/<uid>/`
(the operations of the model against it: list, get, entries, append, copy,
lineage); the record store is today's ai-agents reader and writer behind a
fake shaped as ai-agents answers; one store is active, chosen by
configuration — two named, or one nothing contributes, refuse the host at
start — and the recorder's sends go through it, so a session opened with
the file store active is kept in its file and read back from it.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient
from reactor import PluginPlatform

from agent_runtimes.apps import session_store, sessions
from agent_runtimes.apps.record import session_from_entries
from agent_runtimes.apps.session_store import (
    FileSessionStore,
    RecordSessionStore,
    SessionStoreRefused,
    active_store,
    configured_store_name,
    use_session_store,
)
from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import SESSION_STORES
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)

OPENED: Dict[str, Any] = {
    "kind": "session",
    "summary": "A session of Notes started",
    "payload": {
        "app": "notes-assistant",
        "state": "open",
        "agent": "notes-assistant",
        "harness": None,
        "runs_on": {"kind": "runtime", "uid": "01m5"},
        "title": "",
        "archived": False,
        "lineage": {"forked_from": None, "imported_from": None},
    },
}


def _turn(asked: str) -> Dict[str, Any]:
    return {
        "kind": "turn",
        "summary": asked,
        "payload": {"asked": asked, "answered": f"Heard {asked}"},
    }


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


@pytest.fixture()
def store(tmp_path: Path) -> Iterator[FileSessionStore]:
    made = FileSessionStore(root=tmp_path / "sessions")
    use_session_store(made)
    try:
        yield made
    finally:
        use_session_store(None)


def _seed(
    store: FileSessionStore,
    uid: str,
    entries: List[Dict[str, Any]],
    owner: str = "ada",
    app_uid: str = "app-1",
) -> None:
    _run(store.append(uid, entries, app_uid=app_uid, opened_by=owner, version=3))


def test_the_file_store_keeps_and_describes_a_session(store: FileSessionStore) -> None:
    _seed(
        store,
        "session-f001",
        [
            OPENED,
            _turn("One"),
            _turn("Two"),
            {"kind": "paused", "payload": {"state": "paused", "cancelled": {}}},
        ],
    )
    assert (store.root / "session-f001" / "entries.jsonl").is_file()
    described = _run(store.get("session-f001"))
    assert described is not None
    assert {
        k: described[k]
        for k in ("uid", "agent", "state", "turn", "held", "turns", "runs_on", "title")
    } == {
        "uid": "session-f001",
        "agent": "notes-assistant",
        "state": "paused",
        "turn": "idle",
        "held": False,
        "turns": 2,
        "runs_on": {"kind": "runtime", "uid": "01m5"},
        "title": "",
    }
    assert described["opened_by"] == {"kind": "person", "uid": "ada"} and described[
        "app"
    ] == {"id": "notes-assistant", "version": 3}
    entries = _run(store.entries("session-f001"))
    assert [e["kind"] for e in entries] == ["session", "turn", "turn", "paused"]
    assert all(
        e["at"] and e["session_uid"] == "session-f001" and e["opened_by"] == "ada"
        for e in entries
    )
    assert [e["kind"] for e in _run(store.entries("session-f001", up_to_turn=1))] == [
        "session",
        "turn",
    ]
    assert (
        _run(store.get("session-none")) is None
        and _run(store.entries("session-none")) == []
    )


def test_the_file_store_lists_the_owners_sessions_paged_and_filtered(
    store: FileSessionStore,
) -> None:
    _seed(store, "session-f010", [OPENED, _turn("a")])
    _seed(
        store,
        "session-f011",
        [
            {**OPENED, "payload": {**OPENED["payload"], "agent": "other-agent"}},
            {"kind": "ended", "payload": {"state": "ended", "by": "end"}},
        ],
    )
    _seed(
        store,
        "session-f012",
        [
            OPENED,
            {"kind": "titled", "payload": {"title": "The refactor", "archived": False}},
        ],
    )
    _seed(
        store,
        "session-f013",
        [OPENED, {"kind": "titled", "payload": {"title": "Old", "archived": True}}],
    )
    _seed(store, "session-f014", [OPENED], owner="bob")
    ada = {"kind": "person", "uid": "ada"}
    page = _run(store.list(ada, limit=2))
    assert len(page.sessions) == 2 and page.has_more
    rest = _run(store.list(ada, limit=2, after=page.sessions[-1]["uid"]))
    assert len(rest.sessions) == 1 and not rest.has_more
    assert {s["uid"] for s in page.sessions} | {s["uid"] for s in rest.sessions} == {
        "session-f010",
        "session-f011",
        "session-f012",
    }
    assert [s["uid"] for s in _run(store.list(ada, state="ended")).sessions] == [
        "session-f011"
    ]
    assert [s["uid"] for s in _run(store.list(ada, agent="other-agent")).sessions] == [
        "session-f011"
    ]
    assert [s["uid"] for s in _run(store.list(ada, query="refactor")).sessions] == [
        "session-f012"
    ]
    assert "session-f013" in [
        s["uid"] for s in _run(store.list(ada, archived=True)).sessions
    ]
    assert [
        s["uid"] for s in _run(store.list({"kind": "person", "uid": "bob"})).sessions
    ] == ["session-f014"]
    assert len(_run(store.list({"kind": "local", "uid": ""})).sessions) == 4
    assert _run(store.list(ada, app="nope")).sessions == []


def test_the_file_store_copies_up_to_a_turn_and_says_the_lineage(
    store: FileSessionStore,
) -> None:
    _seed(
        store,
        "session-f020",
        [
            OPENED,
            _turn("One"),
            {"kind": "tool_call", "payload": {"name": "edit"}},
            _turn("Two"),
            _turn("Three"),
            {"kind": "exported", "payload": {"digest": "sha256:0"}},
        ],
    )
    copied = _run(store.copy("session-f020", "session-f021", up_to_turn=2))
    assert copied == 3
    assert [e["kind"] for e in _run(store.entries("session-f021"))] == [
        "turn",
        "tool_call",
        "turn",
    ]
    _seed(
        store,
        "session-f021",
        [{"kind": "cloned", "payload": {"from": "session-f020", "at_turn": 2}}],
    )
    assert _run(store.lineage("session-f021")) == {
        "forked_from": None,
        "imported_from": None,
    }, "no session entry yet: nothing listed"
    _seed(
        store,
        "session-f021",
        [
            {
                **OPENED,
                "payload": {
                    **OPENED["payload"],
                    "lineage": {
                        "forked_from": {"uid": "session-f020", "at_turn": 2},
                        "imported_from": None,
                    },
                },
            }
        ],
    )
    assert _run(store.lineage("session-f021"))["forked_from"] == {
        "uid": "session-f020",
        "at_turn": 2,
    }
    with pytest.raises(
        session_store.SessionStoreError, match="kept already; a clone is a new uid"
    ):
        _run(store.copy("session-f020", "session-f021"))
    # The source is untouched.
    assert len(_run(store.entries("session-f020"))) == 6


def test_the_record_stores_fake_is_shaped_as_ai_agents_answers() -> None:
    """The reader answers ai-agents' entries (`created_at`, `opened_by`), the
    lister `{sessions, has_more}`, the copier `{copied}`."""
    calls: List[Any] = []

    async def reader(uid: str, bearer: str) -> List[Dict[str, Any]]:
        calls.append(("read", uid, bearer))
        return [
            {
                **OPENED,
                "uid": "e1",
                "app_uid": "app-1",
                "session_uid": uid,
                "version": 3,
                "opened_by": "ada",
                "created_at": "2026-10-21T10:00:00Z",
                "sequence": 1,
            },
            {
                **_turn("One"),
                "uid": "e2",
                "app_uid": "app-1",
                "session_uid": uid,
                "version": 3,
                "opened_by": "ada",
                "created_at": "2026-10-21T10:00:01Z",
                "sequence": 2,
            },
        ]

    async def lister(bearer: str, params: Dict[str, Any]) -> Dict[str, Any]:
        calls.append(("list", params))
        return {
            "sessions": [
                session_from_entries("session-r1", await reader("session-r1", bearer))
            ],
            "has_more": False,
        }

    async def copier(bearer: str, body: Dict[str, Any]) -> int:
        calls.append(("copy", body))
        return 2

    record = RecordSessionStore(reader=reader, lister=lister, copier=copier)
    described = _run(record.get("session-r1"))
    assert described["turns"] == 1 and described["started_at"] == "2026-10-21T10:00:00Z"
    page = _run(record.list({"kind": "person", "uid": "ada"}, app="app-1", limit=10))
    assert [s["uid"] for s in page.sessions] == ["session-r1"] and not page.has_more
    assert calls[1] == (
        "list",
        {
            "opened_by": "ada",
            "app_uid": "app-1",
            "agent": "",
            "state": "",
            "q": "",
            "archived": "",
            "after": "",
            "limit": 10,
        },
    )
    assert _run(record.copy("session-r1", "session-r2", up_to_turn=1)) == 2
    assert calls[-1] == (
        "copy",
        {"from": "session-r1", "to": "session-r2", "up_to_turn": 1},
    )
    assert record.name == "record"


def test_one_store_is_active_two_are_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    platform = PluginPlatform(extension_group="agent-runtimes.tests.extensions")
    host.session_platform(platform, discover_installed=False)
    assert {c.id for c in host.accepted(platform, SESSION_STORES)} == {"record", "file"}
    monkeypatch.delenv("DATALAYER_AI_AGENTS_URL", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.delenv(session_store.STORE_VARIABLE, raising=False)
    assert configured_store_name() == "file"
    monkeypatch.setenv("DATALAYER_API_KEY", "x")
    assert configured_store_name() == "record"
    monkeypatch.setenv(session_store.STORE_VARIABLE, "record,file")
    with pytest.raises(
        SessionStoreRefused,
        match="names 2 stores \\(record, file\\): one session store is active",
    ):
        configured_store_name()
    monkeypatch.setenv(session_store.STORE_VARIABLE, "memory")
    use_session_store(None)
    with pytest.raises(
        SessionStoreRefused,
        match="The session store 'memory' is not contributed: one of file, record",
    ):
        active_store(platform)
    monkeypatch.setenv(session_store.STORE_VARIABLE, "file")
    assert active_store(platform).name == "file"
    use_session_store(None)


def test_a_session_opened_with_the_file_store_is_kept_whole_and_read_back(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    # The recorder sends through the active store: its default, not the test's capture.
    from agent_runtimes.apps.record import agent_recorder, send_to_store

    recorder = agent_recorder("notes-assistant")
    assert recorder is not None
    recorder.send = send_to_store
    events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": "One",
                "session": "session-f100",
            },
        )
    )
    events_of(
        remote.post(
            "/api/v1/apps/sessions/session-f100/messages",
            headers=as_("ada"),
            json={"text": "Two"},
        )
    )
    remote.post("/api/v1/apps/sessions/session-f100/stop", headers=as_("ada"))
    kinds = [e["kind"] for e in _run(store.entries("session-f100"))]
    assert kinds[0] == "session" and kinds.count("turn") == 2 and kinds[-1] == "paused"
    described = _run(store.get("session-f100"))
    assert (
        described["state"],
        described["turns"],
        described["opened_by"]["uid"],
        described["runs_on"],
    ) == ("paused", 2, "ada", {"kind": "runtime", "uid": "local"})
    # Read back from the store: the conversation of a session this runtime no longer holds.
    from agent_runtimes.apps.loading import load_app

    messages = _run(
        sessions.conversation_from_record(
            "session-f100", load_app(ASSISTANT), {"app_uid": "app-1"}, "ada"
        )
    )
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant"]
