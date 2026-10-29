# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The session list, held and recorded (MH-02), and a session's title and
archive flag (MH-43).

`GET /sessions` lists the caller's sessions held by this runtime and those
its record keeps, paged and filtered; `GET /sessions/{uid}` answers a
recorded one the runtime no longer holds, for its owner alone; a title
comes from the first turn's first line until the person gives one, an
archived session is hidden unless asked for.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.apps.session_store import FileSessionStore, use_session_store
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


def _turn(asked: str) -> Dict[str, Any]:
    return {
        "kind": "turn",
        "summary": asked,
        "payload": {"asked": asked, "answered": "ok"},
    }


@pytest.fixture()
def store(tmp_path: Path) -> Iterator[FileSessionStore]:
    made = FileSessionStore(root=tmp_path / "sessions")
    use_session_store(made)
    try:
        yield made
    finally:
        use_session_store(None)


def _seed(
    store: FileSessionStore, uid: str, entries: List[Dict[str, Any]], owner: str = "ada"
) -> None:
    asyncio.run(store.append(uid, entries, app_uid="app-1", opened_by=owner, version=3))


def _open(
    client: TestClient, uid: str, person: str = "ada", opener: str = "One"
) -> None:
    events_of(
        client.post(
            "/api/v1/apps/sessions",
            headers=as_(person),
            json={
                "agent": "notes-assistant",
                "app_uid": "app-1",
                "version": 3,
                "opener": opener,
                "session": uid,
            },
        )
    )


def test_the_list_holds_the_held_and_the_recorded_paged_and_filtered(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(remote, "session-l001")
    _open(remote, "session-l002")
    _seed(
        store,
        "session-l010",
        [
            OPENED,
            _turn("a"),
            {"kind": "paused", "payload": {"state": "paused", "cancelled": {}}},
        ],
    )
    _seed(
        store,
        "session-l011",
        [
            OPENED,
            _turn("b"),
            {"kind": "ended", "payload": {"state": "ended", "by": "end"}},
        ],
    )
    _seed(
        store,
        "session-l012",
        [
            OPENED,
            _turn("c"),
            {"kind": "titled", "payload": {"title": "The refactor", "archived": False}},
        ],
    )
    _seed(
        store,
        "session-l013",
        [OPENED, {"kind": "titled", "payload": {"title": "Old", "archived": True}}],
    )
    _seed(store, "session-l014", [OPENED, _turn("d")], owner="bob")
    listed = remote.get("/api/v1/apps/sessions", headers=as_("ada")).json()
    uids = [s["uid"] for s in listed["sessions"]]
    assert uids[:2] == ["session-l001", "session-l002"], "held first"
    assert set(uids[2:]) == {"session-l010", "session-l011", "session-l012"}
    assert "session-l013" not in uids and "session-l014" not in uids
    assert not listed["has_more"]
    held = {s["uid"]: s for s in listed["sessions"]}
    assert held["session-l001"]["held"] and held["session-l001"]["turn"] == "idle"
    assert (
        not held["session-l010"]["held"] and held["session-l010"]["state"] == "paused"
    )
    assert (
        held["session-l011"]["state"] == "ended"
        and held["session-l011"]["runs_on"] is None
    )
    assert (
        held["session-l012"]["title"] == "The refactor"
        and held["session-l012"]["turns"] == 1
    )
    # A page of two of the recorded, then the next from `after`.
    page = remote.get(
        "/api/v1/apps/sessions?limit=2&app=app-1", headers=as_("ada")
    ).json()
    assert page["has_more"] and len(page["sessions"]) == 4, (
        "two held, then the page of two"
    )
    rest = remote.get(
        f"/api/v1/apps/sessions?limit=2&after={page['sessions'][-1]['uid']}",
        headers=as_("ada"),
    ).json()
    assert len(rest["sessions"]) == 1 and not rest["has_more"]
    # Filters.
    assert [
        s["uid"]
        for s in remote.get(
            "/api/v1/apps/sessions?state=ended", headers=as_("ada")
        ).json()["sessions"]
    ] == ["session-l011"]
    assert [
        s["uid"]
        for s in remote.get(
            "/api/v1/apps/sessions?q=refactor", headers=as_("ada")
        ).json()["sessions"]
    ] == ["session-l012"]
    assert "session-l013" in [
        s["uid"]
        for s in remote.get(
            "/api/v1/apps/sessions?archived=true", headers=as_("ada")
        ).json()["sessions"]
    ]
    assert [
        s["uid"]
        for s in remote.get(
            "/api/v1/apps/sessions?held=true", headers=as_("ada")
        ).json()["sessions"]
    ] == ["session-l001", "session-l002"]
    refused = remote.get("/api/v1/apps/sessions?state=stopped", headers=as_("ada"))
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "There is no session state 'stopped': one of open, paused, ended.",
    )
    # Bob sees his, and nothing of Ada's.
    assert [
        s["uid"]
        for s in remote.get("/api/v1/apps/sessions", headers=as_("bob")).json()[
            "sessions"
        ]
    ] == ["session-l014"]


def test_a_recorded_session_is_answered_to_its_owner_alone(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _seed(
        store,
        "session-l020",
        [
            OPENED,
            _turn("a"),
            {"kind": "cloned", "payload": {"from": "session-l000", "at_turn": 1}},
        ],
    )
    said = remote.get("/api/v1/apps/sessions/session-l020", headers=as_("ada")).json()
    assert (said["uid"], said["held"], said["state"], said["turns"]) == (
        "session-l020",
        False,
        "open",
        1,
    )
    assert said["lineage"]["forked_from"] == {"uid": "session-l000", "at_turn": 1}
    # A stranger's — an organization admin's too — is a 404, not a 403.
    assert (
        remote.get("/api/v1/apps/sessions/session-l020", headers=as_("bob")).status_code
        == 404
    )
    assert (
        remote.get("/api/v1/apps/sessions/session-none", headers=as_("ada")).status_code
        == 404
    )


def test_a_title_from_the_first_turn_renamed_and_archived(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1", "version": 3})
    _open(
        remote,
        "session-l030",
        opener="Refactor the billing module so that it handles the new tax rules\nand more",
    )
    said = remote.get("/api/v1/apps/sessions/session-l030", headers=as_("ada")).json()
    assert (
        said["title"]
        == "Refactor the billing module so that it handles the new tax rules"[:60]
    )
    assert len(said["title"]) == 60
    [titled] = [
        e for e in runtime.entries("titled") if e["session_uid"] == "session-l030"
    ]
    assert titled["payload"] == {"title": said["title"], "archived": False}
    renamed = remote.put(
        "/api/v1/apps/sessions/session-l030/title",
        headers=as_("ada"),
        json={"title": "The refactor"},
    ).json()
    assert renamed["title"] == "The refactor"
    too_long = remote.put(
        "/api/v1/apps/sessions/session-l030/title",
        headers=as_("ada"),
        json={"title": "x" * 201},
    )
    assert (too_long.status_code, too_long.json()["detail"]) == (
        422,
        "A session's title is at most 200 characters; this one has 201.",
    )
    archived = remote.put(
        "/api/v1/apps/sessions/session-l030/archived",
        headers=as_("ada"),
        json={"archived": True},
    ).json()
    assert archived["archived"] is True
    assert "session-l030" not in [
        s["uid"]
        for s in remote.get("/api/v1/apps/sessions", headers=as_("ada")).json()[
            "sessions"
        ]
    ]
    assert "session-l030" in [
        s["uid"]
        for s in remote.get(
            "/api/v1/apps/sessions?archived=true", headers=as_("ada")
        ).json()["sessions"]
    ]
    assert [
        e["payload"]["title"]
        for e in runtime.entries("titled")
        if e["session_uid"] == "session-l030"
    ][-1] == "The refactor"
    # A recorded session this runtime does not hold is renamed through the store.
    _seed(store, "session-l031", [OPENED, _turn("a")])
    renamed = remote.put(
        "/api/v1/apps/sessions/session-l031/title",
        headers=as_("ada"),
        json={"title": "Kept"},
    ).json()
    assert renamed["title"] == "Kept"
    kept = asyncio.run(store.get("session-l031"))
    assert kept is not None and kept["title"] == "Kept"
    assert (
        remote.put(
            "/api/v1/apps/sessions/session-l031/title",
            headers=as_("bob"),
            json={"title": "Mine"},
        ).status_code
        == 404
    )


def test_a_harness_sessions_row_says_its_folder_and_a_model_agents_does_not(
    store: FileSessionStore,
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
) -> None:
    """DESKTOP DK-26: `workspace` on the list's row of a harness session, from its harness row."""
    from agent_runtimes.protocol_state.store import use_protocol_state_store
    from agent_runtimes.tests.test_acp_agent import Store

    harness_rows = Store()
    use_protocol_state_store(harness_rows)  # type: ignore[arg-type]
    try:
        asyncio.run(
            harness_rows.put(
                "harness_session",
                "shield-mvp-claude-code:session-w001",
                {
                    "acp_session_id": "acp-1",
                    "harness": "claude-code",
                    "agent": "shield-mvp-claude-code",
                    "workspace": "/home/ada/project",
                },
            )
        )
        harness_opened = {
            **OPENED,
            "payload": {
                **OPENED["payload"],
                "app": "shield-mvp-claude-code",
                "agent": "shield-mvp-claude-code",
                "harness": "claude-code",
            },
        }
        _seed(
            store,
            "session-w001",
            [
                harness_opened,
                _turn("a"),
                {"kind": "paused", "payload": {"state": "paused", "cancelled": {}}},
            ],
        )
        _seed(store, "session-w002", [harness_opened, _turn("b")])
        _seed(store, "session-w003", [OPENED, _turn("c")])
        rows = {
            s["uid"]: s
            for s in remote.get("/api/v1/apps/sessions", headers=as_("ada")).json()[
                "sessions"
            ]
        }
        assert rows["session-w001"]["workspace"] == "/home/ada/project"
        # A harness session whose row names no folder says so, as empty.
        assert rows["session-w002"]["workspace"] == ""
        # A model agent's row says nothing of a folder.
        assert "workspace" not in rows["session-w003"]
    finally:
        use_protocol_state_store(None)
