# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A resume from the record rebuilds the whole conversation (MH-03): turns,
tool rows with their displays, the files given with their places, the
session's Rules — not `asked`/`answered` alone — and the session's title and
lineage as the record says them; an ended session is not resumed.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, Iterator, List

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

OPENED = {
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
ENTRIES: List[Dict[str, Any]] = [
    OPENED,
    {"kind": "titled", "payload": {"title": "The refactor", "archived": False}},
    {
        "kind": "turn",
        "summary": "One",
        "payload": {"asked": "One", "answered": "First answer"},
    },
    {
        "kind": "tool_call",
        "summary": "edit: done",
        "payload": {
            "tool": "edit",
            "tool_call_id": "c1",
            "kind": "edit",
            "class": "write",
            "path": "a.py",
            "display": {
                "display": "diff",
                "path": "a.py",
                "additions": 2,
                "deletions": 1,
            },
        },
    },
    {
        "kind": "rule",
        "summary": "Rule 'no-delete' added",
        "payload": {
            "rule": {"name": "no-delete", "decision": "deny", "classes": ["delete"]}
        },
    },
    {
        "kind": "file",
        "summary": "File a.csv",
        "payload": {
            "name": "a.csv",
            "type": "text/csv",
            "size": 12,
            "digest": "sha256:0",
            "path": "files/a.csv",
        },
    },
    {
        "kind": "turn",
        "summary": "Two",
        "payload": {"asked": "Two", "answered": "Second answer"},
    },
    {"kind": "cloned", "payload": {"from": "session-r000", "at_turn": 1}},
    {"kind": "paused", "payload": {"state": "paused", "cancelled": {}}},
]


@pytest.fixture()
def store(tmp_path: Path) -> Iterator[FileSessionStore]:
    made = FileSessionStore(root=tmp_path / "sessions")
    use_session_store(made)
    try:
        yield made
    finally:
        use_session_store(None)


def test_the_resume_rebuilds_turns_rows_files_rules_and_facts(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    asyncio.run(
        store.append(
            "session-r001", ENTRIES, app_uid="app-1", opened_by="ada", version=3
        )
    )
    resumed = events_of(
        remote.post(
            "/api/v1/apps/sessions/session-r001/resume",
            headers=as_("ada"),
            json={"agent": "notes-assistant"},
        )
    )
    [snapshot] = [e for e in resumed if e["type"] == "MESSAGES_SNAPSHOT"]
    assert [m["content"] for m in snapshot["messages"] if m["role"] == "user"] == [
        "One",
        "Two",
    ]
    # The resume ran to its end: what it showed again was shown as the page
    # receives it, never refused on the stream.
    assert [e["type"] for e in resumed if e["type"].startswith("RUN_")] == [
        "RUN_STARTED",
        "RUN_FINISHED",
    ]
    live = sessions.session_of("session-r001")
    assert live is not None and live.state == "open"
    # The tool row, as a display re-shown under the thread — kept in the
    # wire form a live row's is (type, text, data), what a `ShowOp` carries.
    rows = [m for m in live.messages if m.get("shows")]
    [edit] = [m for m in rows if m["shows"]["data"]["name"] == "edit"]
    assert edit["shows"]["type"] == sessions.STEP_DISPLAY_TYPE
    assert edit["shows"]["text"] == "tool step edit ended"
    shown = edit["shows"]["data"]
    assert shown["kind"] == "tool" and shown["output"]["display"] == "diff"
    assert shown["input"] == {"kind": "edit", "class": "write", "path": "a.py"}
    # The file given, its place in the sandbox re-stated.
    assert live.files == [
        {
            "name": "a.csv",
            "type": "text/csv",
            "size": 12,
            "path": "files/a.csv",
            "digest": "sha256:0",
        }
    ]
    assert any(
        "a.csv" in str(m.get("content")) and "files/a.csv" in str(m.get("content"))
        for m in live.messages
    )
    # The session's Rules, in force again.
    rules = remote.get(
        "/api/v1/apps/sessions/session-r001/rules", headers=as_("ada")
    ).json()
    assert [r["name"] for r in rules["session_rules"]] == ["no-delete"]
    # Its title and lineage, the record's.
    said = remote.get("/api/v1/apps/sessions/session-r001", headers=as_("ada")).json()
    assert said["title"] == "The refactor" and said["lineage"]["forked_from"] == {
        "uid": "session-r000",
        "at_turn": 1,
    }
    assert said["turns"] == 2


def test_an_ended_session_is_not_resumed_naming_clone(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    asyncio.run(
        store.append(
            "session-r002",
            [
                *ENTRIES[:-1],
                {"kind": "ended", "payload": {"state": "ended", "by": "end"}},
            ],
            app_uid="app-1",
            opened_by="ada",
            version=3,
        )
    )
    refused = remote.post(
        "/api/v1/apps/sessions/session-r002/resume",
        headers=as_("ada"),
        json={"agent": "notes-assistant"},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Session session-r002 ended; an ended session is not resumed — clone it to go on from it.",
    )


def test_the_file_store_rebuilds_without_a_token_and_the_record_store_asks_for_one(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
) -> None:
    """A local resume — the REPL's, a seat's on a self-hosted runtime —
    reads the file store's own files: no bearer is needed. The record
    store reads ai-agents for the bearer, and asks for one."""
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    asyncio.run(
        store.append(
            "session-r003", ENTRIES, app_uid="app-1", opened_by="ada", version=3
        )
    )
    app, instance = sessions.agent_app("notes-assistant")
    rebuilt = asyncio.run(
        sessions.rebuilt_from_record("session-r003", app, instance, "")
    )
    assert rebuilt.turns == 2 and rebuilt.title == "The refactor"

    async def reader(uid: str, bearer: str) -> List[Dict[str, Any]]:
        """ai-agents, never asked: the refusal comes before the read."""
        raise AssertionError("the record is not read without a token")

    sessions.use_record_reader(reader)
    try:
        with pytest.raises(sessions.SessionRefused) as refused:
            asyncio.run(sessions.rebuilt_from_record("session-r003", app, instance, ""))
    finally:
        sessions.use_record_reader(None)
        use_session_store(store)
    assert (refused.value.status, refused.value.reason) == (
        401,
        "Session session-r003 is read back from its record with your token: send one.",
    )


def test_a_file_given_and_a_rule_added_are_on_the_record(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    from agent_runtimes.tests.test_app_sessions import data_url, uploaded

    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    events_of(
        remote.post(
            "/api/v1/apps/sessions",
            headers=as_("ada"),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": "One",
                "session": "session-r003",
            },
        )
    )
    refs = uploaded(
        remote,
        "notes-assistant",
        "session-r003",
        [
            {
                "name": "a.csv",
                "type": "text/csv",
                "data_url": data_url(b"a,b\n1,2\n", "text/csv"),
            }
        ],
        headers=as_("ada"),
    )
    # A file travels with an AG-UI run, as a page's block sends it (RU-6).
    events_of(
        remote.post(
            "/api/v1/apps/agents/notes-assistant/ag-ui/",
            headers=as_("ada"),
            json={
                "threadId": "session-r003",
                "runId": "run-1",
                "messages": [{"id": "m1", "role": "user", "content": "Read it"}],
                "tools": [],
                "context": [],
                "forwardedProps": {"loop": {"files": refs}},
            },
        )
    )
    [filed] = [e for e in runtime.entries("file") if e["session_uid"] == "session-r003"]
    assert (
        filed["payload"]["name"] == "a.csv"
        and filed["payload"]["digest"].startswith("sha256:")
        and filed["payload"]["size"] == 8
    )
    added = remote.post(
        "/api/v1/apps/sessions/session-r003/rules",
        headers=as_("ada"),
        json={"name": "no-delete", "decision": "deny", "classes": ["delete"]},
    )
    assert added.status_code == 200, added.text
    remote.delete(
        "/api/v1/apps/sessions/session-r003/rules/no-delete", headers=as_("ada")
    )
    ruled = [
        e["payload"]
        for e in runtime.entries("rule")
        if e["session_uid"] == "session-r003"
    ]
    assert ruled[0]["rule"]["name"] == "no-delete" and ruled[1] == {
        "removed": "no-delete"
    }
