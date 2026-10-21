# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Clone, export and import (MH-09, MH-13, MH-14).

A clone at turn 2 of 4 has two turns and both lineage rows, the source
untouched, a clone with another agent carries the sentence, a turn the
source lacks is 422; an export redacts a bearer in a tool row and a declared
secret's value, carries a file's entry with its digest and no bytes, leaves a
running turn out and says so, and writes `exported` with the file's digest;
an import answers 201 and resumes, refuses version 2, a planted kind, a file
over the caps, the exported agent missing without `?agent=`, an unknown
application, and says an older application version.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Iterator, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.session_store import FileSessionStore, use_session_store
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    as_,
    events_of,
    remote,
    runtime,
)

HARNESS_AGENT = "example-harness-codex"


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
    """The application's recorder sends through the active store, as a runtime's does."""
    from agent_runtimes.loop.apps.record import agent_recorder, send_to_store

    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    agent_recorder("notes-assistant").send = send_to_store
    return runtime


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


def _say(client: TestClient, uid: str, text: str) -> None:
    events_of(
        client.post(
            f"/api/v1/apps/sessions/{uid}/messages",
            headers=as_("ada"),
            json={"text": text},
        )
    )


def _kinds(store: FileSessionStore, uid: str) -> List[str]:
    return [e["kind"] for e in asyncio.run(store.entries(uid))]


def test_a_clone_at_turn_2_of_4_has_two_turns_and_both_lineage_rows(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _open(remote, "session-c001")
    for text in ("Two", "Three", "Four"):
        _say(remote, "session-c001", text)
    added = remote.post(
        "/api/v1/apps/sessions/session-c001/rules",
        headers=as_("ada"),
        json={"name": "no-delete", "decision": "deny", "classes": ["delete"]},
    )
    assert added.status_code == 200, added.text
    cloned = remote.post(
        "/api/v1/apps/sessions/session-c001/clone",
        headers=as_("ada"),
        json={"up_to_turn": 2, "title": "Before the refactor"},
    )
    assert cloned.status_code == 201, cloned.text
    clone = cloned.json()
    assert (
        clone["state"],
        clone["runs_on"],
        clone["turns"],
        clone["title"],
        clone["said"],
    ) == ("paused", None, 2, "Before the refactor", "")
    assert clone["lineage"] == {
        "forked_from": {"uid": "session-c001", "at_turn": 2},
        "imported_from": None,
    }
    kinds = _kinds(store, clone["uid"])
    assert kinds.count("turn") == 2 and "cloned" in kinds and "rule" in kinds
    assert "session" not in kinds[: kinds.index("session")], (
        "the clone's opening entry comes after the copied ones"
    )
    described = remote.get(
        f"/api/v1/apps/sessions/{clone['uid']}", headers=as_("ada")
    ).json()
    assert (
        described["state"],
        described["turns"],
        described["held"],
        described["agent"],
    ) == ("paused", 2, False, "notes-assistant")
    assert described["lineage"]["forked_from"] == {"uid": "session-c001", "at_turn": 2}
    # The source: untouched but for its `cloned {to}` row.
    source = remote.get("/api/v1/apps/sessions/session-c001", headers=as_("ada")).json()
    assert source["turns"] == 4 and source["state"] == "open"
    [row] = [
        e for e in asyncio.run(store.entries("session-c001")) if e["kind"] == "cloned"
    ]
    assert row["payload"] == {"to": clone["uid"], "at_turn": 2}
    # The clone resumes, its two turns and its rule back.
    resumed = events_of(
        remote.post(
            f"/api/v1/apps/sessions/{clone['uid']}/resume",
            headers=as_("ada"),
            json={"agent": "notes-assistant"},
        )
    )
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    # The first turn carries the settings in words, as the record keeps it.
    assert [
        m["content"].split("\n")[0] for m in snapshot["messages"] if m["role"] == "user"
    ] == ["One", "Two"]
    assert [
        r["name"]
        for r in remote.get(
            f"/api/v1/apps/sessions/{clone['uid']}/rules", headers=as_("ada")
        ).json()["session_rules"]
    ] == ["no-delete"]
    # A turn the source lacks.
    refused = remote.post(
        "/api/v1/apps/sessions/session-c001/clone",
        headers=as_("ada"),
        json={"up_to_turn": 7},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Session session-c001 has 4 turns; there is no turn 7 to clone it at.",
    )


def test_a_clone_with_another_agent_carries_the_sentence_and_an_ended_source_clones(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _open(remote, "session-c002")
    remote.post("/api/v1/apps/sessions/session-c002/end", headers=as_("ada"))
    clone = remote.post(
        "/api/v1/apps/sessions/session-c002/clone",
        headers=as_("ada"),
        json={"agent": HARNESS_AGENT},
    ).json()
    assert clone["agent"] == HARNESS_AGENT and clone["harness"] == "codex"
    assert clone["said"] == (
        "This conversation was with notes-assistant until turn 1; from here, cloned, it is with Codex. "
        "What was said stays; nothing of what the harness kept for itself carries into a clone."
    )
    assert clone["dropped"]["mode"] == "reset to the application's default"
    [swapped] = [
        e for e in asyncio.run(store.entries(clone["uid"])) if e["kind"] == "swapped"
    ]
    assert (
        swapped["payload"]["said"] == clone["said"]
        and swapped["payload"]["to"] == HARNESS_AGENT
    )
    # Resumed, the sentence is in the conversation.
    from agent_runtimes.loop.apps.loading import load_app

    rebuilt = asyncio.run(
        sessions.rebuilt_from_record(
            clone["uid"], load_app(ASSISTANT), {"app_uid": "app-1"}, "ada"
        )
    )
    assert [m["content"] for m in rebuilt.messages if m["role"] == "assistant"][
        -1
    ] == clone["said"]
    nope = remote.post(
        "/api/v1/apps/sessions/session-c002/clone",
        headers=as_("ada"),
        json={"agent": "nope"},
    )
    assert (nope.status_code, nope.json()["detail"]) == (
        404,
        "There is no agentspec 'nope' on this runtime to clone onto.",
    )


def test_export_redacts_counts_carries_files_as_entries_and_writes_the_digest(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "plain-secret-value-xyz")
    # An application that keeps its actions too: the tool row is on the record.
    from agent_runtimes.loop.apps.record import agent_recorder, send_to_store

    acting = {
        **ASSISTANT,
        "record": {
            "keep_for": "30_days",
            "include": ["conversations", "outputs", "actions"],
        },
    }
    through_store.make("notes-assistant", acting, {"app_uid": "app-1", "version": 3})
    agent_recorder("notes-assistant").send = send_to_store
    _open(remote, "session-e001")
    _say(remote, "session-e001", "Two")
    live = sessions.session_of("session-e001")
    assert live is not None
    # A tool row with a bearer and the declared secret's value, and a file, on the record.
    live.recorder.start("session-e001")
    live.recorder.add(
        "tool_call",
        "fetch: done",
        {
            "tool": "fetch",
            "input": {"headers": {"Authorization": "Bearer sk-abcdef1234567890abcdef"}},
            "note": "key plain-secret-value-xyz here",
        },
    )
    live.recorder.filed(
        "session-e001",
        name="a.csv",
        media_type="text/csv",
        size=8,
        digest="sha256:abc",
        path="files/a.csv",
    )
    asyncio.run(live.recorder.flush("session-e001"))
    # The harness declares OPENAI_API_KEY: its value is redacted by name.
    live.bound_agent = HARNESS_AGENT
    live._shield = lambda: type(
        "S",
        (),
        {
            "harness": type(
                "H",
                (),
                {
                    "id": "codex",
                    "name": "Codex",
                    "capabilities": type(
                        "C", (), {"model_dump": lambda self, mode: {"resume": "load"}}
                    )(),
                },
            )(),
            "_acp_of": {},
            "sessions": {},
        },
    )()  # type: ignore[method-assign]
    response = remote.get(
        "/api/v1/apps/sessions/session-e001/export", headers=as_("ada")
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/x-ndjson")
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="session-e001.session.jsonl"'
    )
    lines = response.text.strip().split("\n")
    head = json.loads(lines[0])
    assert (
        head["record_type"],
        head["format"],
        head["uid"],
        head["turns"],
        head["owner"],
        head["exported_by"],
    ) == (
        "session",
        "datalayer-session/1",
        "session-e001",
        2,
        {"uid": "ada"},
        {"uid": "ada"},
    )
    assert head["agent"] == HARNESS_AGENT and head["harness"] == "codex"
    entries = [json.loads(line) for line in lines[1:]]
    [tool] = [e for e in entries if e["kind"] == "tool_call"]
    assert tool["payload"]["input"]["headers"]["Authorization"] == "[redacted]"
    assert (
        "plain-secret-value-xyz" not in response.text
        and "[redacted]" in tool["payload"]["note"]
    )
    [filed] = [e for e in entries if e["kind"] == "file"]
    assert filed["payload"] == {
        "name": "a.csv",
        "type": "text/csv",
        "size": 8,
        "digest": "sha256:abc",
        "path": "files/a.csv",
    }
    assert head["redactions"] >= 2 and response.headers["x-session-redactions"] == str(
        head["redactions"]
    )
    [exported] = [
        e for e in asyncio.run(store.entries("session-e001")) if e["kind"] == "exported"
    ]
    assert (
        exported["payload"]["digest"] == response.headers["x-session-digest"]
        and exported["payload"]["by"] == "ada"
    )
    assert exported["payload"]["redactions"] == head["redactions"]
    # A running turn is left out: the record holds the complete turns, the session line says so.
    live.turn = "running"
    again = remote.get("/api/v1/apps/sessions/session-e001/export", headers=as_("ada"))
    live.turn = "idle"
    assert json.loads(again.text.split("\n")[0])["turns"] == 2
    unknown = remote.get(
        "/api/v1/apps/sessions/session-e001/export?format=omnigent-jsonl/1",
        headers=as_("ada"),
    )
    assert (unknown.status_code, unknown.json()["detail"]) == (
        422,
        "There is no session file format 'omnigent-jsonl/1': one of datalayer-session/1.",
    )


def test_an_application_keeping_no_conversations_is_not_exported(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    quiet = {
        **ASSISTANT,
        "id": "quiet-notes",
        "name": "Quiet Notes",
        "record": {"keep_for": "30_days", "include": ["outputs"]},
    }
    runtime.make("quiet-notes", quiet, {"app_uid": "app-2", "version": 1})
    events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "quiet-notes",
                "app_uid": "app-2",
                "version": 1,
                "opener": "One",
                "session": "session-e002",
            },
        )
    )
    refused = remote.get(
        "/api/v1/apps/sessions/session-e002/export", headers=as_("ada")
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Quiet Notes keeps no conversations in its record, so a session of it cannot be exported.",
    )


def _exported(client: TestClient, uid: str, as_who: str = "ada") -> str:
    return client.get(f"/api/v1/apps/sessions/{uid}/export", headers=as_(as_who)).text


def test_import_answers_a_new_paused_session_that_resumes(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _open(remote, "session-i001", opener="Hello there")
    _say(remote, "session-i001", "Two")
    text = _exported(remote, "session-i001")
    imported = remote.post(
        "/api/v1/apps/sessions/import",
        headers={**as_("bob"), "Content-Type": "application/x-ndjson"},
        content=text,
    )
    assert imported.status_code == 201, imported.text
    said = imported.json()
    assert (
        said["state"],
        said["runs_on"],
        said["turns"],
        said["redactions"],
        said["agent"],
    ) == ("paused", None, 2, 0, "notes-assistant")
    assert (
        said["uid"] != "session-i001"
        and said["lineage"]["imported_from"]["exported_by"] == "ada"
    )
    assert (
        said["lineage"]["imported_from"]["digest"].startswith("sha256:")
        and said["title"] == "Hello there"
    )
    # The importer is the author: Bob's, not Ada's.
    assert (
        remote.get(
            f"/api/v1/apps/sessions/{said['uid']}", headers=as_("ada")
        ).status_code
        == 404
    )
    described = remote.get(
        f"/api/v1/apps/sessions/{said['uid']}", headers=as_("bob")
    ).json()
    assert (
        described["opened_by"]["uid"] == "bob"
        and described["lineage"]["imported_from"]["digest"]
        == said["lineage"]["imported_from"]["digest"]
    )
    [row] = [
        e for e in asyncio.run(store.entries(said["uid"])) if e["kind"] == "imported"
    ]
    assert (
        row["payload"]["source_uid"] == "session-i001"
        and row["payload"]["file_version"] == 3
    )
    resumed = events_of(
        remote.post(
            f"/api/v1/apps/sessions/{said['uid']}/resume",
            headers={**as_("bob")},
            json={"agent": "notes-assistant"},
        )
    )
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    assert [
        m["content"].split("\n")[0] for m in snapshot["messages"] if m["role"] == "user"
    ] == ["Hello there", "Two"]
    # An imported session's own export imports again: its lineage is the
    # schema's (found on r1, 22 October 2026: refused on `redactions`).
    assert set(said["lineage"]["imported_from"]) == {
        "digest",
        "exported_at",
        "exported_by",
    }
    again = remote.post(
        "/api/v1/apps/sessions/import",
        headers={**as_("bob"), "Content-Type": "application/x-ndjson"},
        content=_exported(remote, said["uid"], as_who="bob"),
    )
    assert again.status_code == 201, again.text


def test_import_refuses_what_the_spec_refuses_and_says_an_older_version(
    store: FileSessionStore,
    through_store: Runtime,
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    _open(remote, "session-i002")
    text = _exported(remote, "session-i002")
    head, *rest = text.strip().split("\n")
    headers = {**as_("ada"), "Content-Type": "application/x-ndjson"}

    def post(body: str, query: str = "") -> object:
        return remote.post(
            f"/api/v1/apps/sessions/import{query}", headers=headers, content=body
        )

    v2 = post(
        head.replace("datalayer-session/1", "datalayer-session/2")
        + "\n"
        + "\n".join(rest)
    )
    assert (v2.status_code, v2.json()["detail"]) == (
        422,
        "The file is datalayer-session/2; this runtime reads datalayer-session/1.",
    )
    planted = post(
        head
        + "\n"
        + json.dumps(
            {
                "record_type": "entry",
                "kind": "shell",
                "at": "x",
                "payload": {"run": "rm"},
            }
        )
    )
    assert (
        planted.status_code == 422
        and "kind 'shell', which the record does not have" in planted.json()["detail"]
    )
    big = post(head + "\n" + "\n".join([rest[0]] * 20_001))
    assert (
        big.status_code == 413
        and "at most 20 000 entries in 64 MB" in big.json()["detail"]
    )
    line = json.loads(head)
    missing = post(
        json.dumps({**line, "agent": "some-agent-gone"}) + "\n" + "\n".join(rest)
    )
    assert (missing.status_code, missing.json()["detail"]) == (
        422,
        "The file's agent some-agent-gone is not on this runtime: name one with ?agent=.",
    )
    named = post(
        json.dumps({**line, "agent": "some-agent-gone"}) + "\n" + "\n".join(rest),
        f"?agent={HARNESS_AGENT}",
    )
    assert named.status_code == 201 and named.json()["agent"] == HARNESS_AGENT
    unknown_app = post(
        json.dumps({**line, "app": {"id": "nope-app", "version": 3}})
        + "\n"
        + "\n".join(rest)
    )
    assert (unknown_app.status_code, unknown_app.json()["detail"]) == (
        422,
        "The file's application 'nope-app' is not on this runtime: a session is imported where its application runs.",
    )
    older = post(
        json.dumps({**line, "app": {"id": "notes-assistant", "version": 2}})
        + "\n"
        + "\n".join(rest)
    )
    assert older.status_code == 201 and older.json()["versions"] == {
        "file": 2,
        "current": 3,
    }
    [row] = [
        e
        for e in asyncio.run(store.entries(older.json()["uid"]))
        if e["kind"] == "imported"
    ]
    assert "the file is version 2 of the application, this is 3" in row["summary"]
