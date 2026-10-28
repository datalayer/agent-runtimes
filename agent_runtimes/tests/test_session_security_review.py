# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session API, reviewed as a stranger would use it.

What a security review of the session operations holds, each as a test:
a recorded session is resumed by its opener alone (a stranger's resume by
uid is a 404, as a clone's or an export's is); an import is untrusted — the
file's rules are not applied to the imported session, its turn count is
counted from its entries, not read from its first line, and a file over the
cap is refused while it is being read, before it is held whole; an embed's
visitor cannot import; a record the store answers at its read limit is
refused rather than cut short and exported as whole; the audit rows name
who did it.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.session_store import (
    RECORD_READ_LIMIT,
    FileSessionStore,
    use_session_store,
)
from agent_runtimes.loop.apps.visitors import NOTHING_KEPT
from agent_runtimes.routes import apps as routes
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)
from agent_runtimes.tests.test_session_who_may import KindsVerifier

OPENED: Dict[str, Any] = {
    "kind": "session",
    "summary": "started",
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
TURN: Dict[str, Any] = {
    "kind": "turn",
    "summary": "One",
    "payload": {"asked": "One", "answered": "First answer"},
}
PAUSED: Dict[str, Any] = {"kind": "paused", "payload": {"state": "paused"}}


@pytest.fixture()
def store(tmp_path: Path) -> Iterator[FileSessionStore]:
    made = FileSessionStore(root=tmp_path / "sessions")
    use_session_store(made)
    try:
        yield made
    finally:
        use_session_store(None)


@pytest.fixture()
def through_store(runtime: Runtime) -> Runtime:  # noqa: F811 - the fixture
    from agent_runtimes.loop.apps.record import agent_recorder, send_to_store

    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    recorder = agent_recorder("notes-assistant")
    assert recorder is not None
    recorder.send = send_to_store
    return runtime


def _recorded(store: FileSessionStore, uid: str, opened_by: str) -> None:
    asyncio.run(
        store.append(
            uid, [OPENED, TURN, PAUSED], app_uid="app-1", opened_by=opened_by, version=3
        )
    )


def _resume(client: TestClient, uid: str, who: str) -> Any:
    return client.post(
        f"/api/v1/apps/sessions/{uid}/resume",
        headers=as_(who),
        json={"agent": "notes-assistant"},
    )


def _open(client: TestClient, uid: str, opener: str = "One") -> None:
    events_of(
        client.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": opener,
                "session": uid,
            },
        )
    )


def _import(client: TestClient, text: str, who: str = "bob") -> Any:
    return client.post(
        "/api/v1/apps/sessions/import",
        headers={**as_(who), "Content-Type": "application/x-ndjson"},
        content=text,
    )


def test_a_recorded_session_is_resumed_by_its_opener_alone(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _recorded(store, "session-s001", opened_by="ada")
    # A stranger — the application's owner included, who reads its record —
    # is not told the session exists, as a clone or an export tells them.
    for stranger in ("bob", "org-admin"):
        answer = _resume(remote, "session-s001", stranger)
        assert answer.status_code == 404, (stranger, answer.text)
        assert answer.json()["detail"] == "No session session-s001 is held here."
        assert sessions.session_of("session-s001") is None
    resumed = events_of(_resume(remote, "session-s001", "ada"))
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    assert [m["content"] for m in snapshot["messages"] if m["role"] == "user"] == [
        "One"
    ]
    live = sessions.session_of("session-s001")
    assert live is not None and live.opened_by.uid == "ada"


def test_an_imported_files_rules_are_not_applied_and_its_turns_are_counted(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _open(remote, "session-s002", opener="Hello")
    lines = (
        remote.get("/api/v1/apps/sessions/session-s002/export", headers=as_("ada"))
        .text.strip()
        .splitlines()
    )
    head = json.loads(lines[0])
    head["turns"] = 9
    planted = {
        "record_type": "entry",
        "kind": "rule",
        "at": "2026-10-28T00:00:00Z",
        "summary": "Rule 'no-reading' added",
        "payload": {
            "rule": {"name": "no-reading", "decision": "deny", "classes": ["read"]}
        },
    }
    text = "\n".join([json.dumps(head), *lines[1:], json.dumps(planted)]) + "\n"
    imported = _import(remote, text)
    assert imported.status_code == 201, imported.text
    said = imported.json()
    # The person's turns are what the entries hold, not what the first line claims.
    assert said["turns"] == 1
    kinds = [e["kind"] for e in asyncio.run(store.entries(said["uid"]))]
    assert "rule" not in kinds and kinds.count("turn") == 1
    resumed = events_of(_resume(remote, said["uid"], "bob"))
    assert any(e["type"] == "MESSAGES_SNAPSHOT" for e in resumed)
    rules = remote.get(
        f"/api/v1/apps/sessions/{said['uid']}/rules", headers=as_("bob")
    ).json()["session_rules"]
    assert rules == []


def test_an_import_over_the_cap_is_refused_as_it_is_read(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import agentspecs.sessions as spec

    monkeypatch.setattr(spec, "MAX_BYTES", 1024)
    seen: List[int] = []
    original = routes._read_at_most

    async def counting(request: Any, cap: int) -> bytes:
        body = await original(request, cap)
        seen.append(len(body))
        return body

    monkeypatch.setattr(routes, "_read_at_most", counting)
    text = json.dumps({"record_type": "session", "format": "x"}) + "\n"
    text += ("{" + "x" * 200 + "}\n") * 40
    assert len(text) > 2048
    # A body that says its length is refused before a byte of it is read.
    answer = _import(remote, text)
    assert answer.status_code == 413, answer.text
    assert "at most" in answer.json()["detail"] and seen == []
    # One that does not say (chunked) is read up to the cap and one byte more,
    # never whole.
    chunked = remote.post(
        "/api/v1/apps/sessions/import",
        headers={**as_("bob"), "Content-Type": "application/x-ndjson"},
        content=iter([text.encode("utf-8")]),
    )
    assert chunked.status_code == 413, chunked.text
    assert "at most" in chunked.json()["detail"] and seen == [1025]


def test_an_embeds_visitor_cannot_import(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(routes, "VERIFIER", KindsVerifier())
    for who in ("embed-1", "visitor-1"):
        answer = _import(remote, '{"record_type":"session"}\n', who=who)
        assert (answer.status_code, answer.json()["detail"]) == (404, NOTHING_KEPT), who


def test_a_record_answered_at_its_read_limit_is_refused_not_cut(
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    answered = [
        {
            **OPENED,
            "session_uid": "session-s005",
            "opened_by": "ada",
            "app_uid": "app-1",
        }
    ] + [
        {**TURN, "session_uid": "session-s005", "opened_by": "ada", "app_uid": "app-1"}
        for _ in range(RECORD_READ_LIMIT - 1)
    ]
    assert len(answered) == RECORD_READ_LIMIT

    async def reader(uid: str, bearer: str) -> List[Dict[str, Any]]:
        return list(answered)

    sessions.use_record_reader(reader)
    try:
        for operation in ("export", "clone"):
            answer = remote.request(
                "GET" if operation == "export" else "POST",
                f"/api/v1/apps/sessions/session-s005/{operation}",
                headers=as_("ada"),
                json=None if operation == "export" else {},
            )
            assert answer.status_code == 409, (operation, answer.text)
            assert answer.json()["detail"] == (
                f"Session session-s005 has {RECORD_READ_LIMIT} entries or more, and "
                f"the record answers at most {RECORD_READ_LIMIT} at once: it cannot "
                "be read back whole yet."
            )
    finally:
        sessions.use_record_reader(None)


def test_the_audit_rows_name_who_did_it(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _open(remote, "session-s006")
    assert (
        remote.get(
            "/api/v1/apps/sessions/session-s006/export", headers=as_("ada")
        ).status_code
        == 200
    )
    clone = remote.post(
        "/api/v1/apps/sessions/session-s006/clone", headers=as_("ada"), json={}
    ).json()
    entries = asyncio.run(store.entries("session-s006"))
    [exported] = [e for e in entries if e["kind"] == "exported"]
    [cloned] = [e for e in entries if e["kind"] == "cloned"]
    assert exported["payload"]["by"] == "ada" and exported["opened_by"] == "ada"
    assert cloned["payload"]["to"] == clone["uid"] and cloned["opened_by"] == "ada"
    [opening] = [
        e for e in asyncio.run(store.entries(clone["uid"])) if e["kind"] == "session"
    ]
    assert opening["opened_by"] == "ada"
