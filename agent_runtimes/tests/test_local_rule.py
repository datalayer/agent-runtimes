# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A paused session is always resumable, on this machine too (`local_rule`).

The table is the mirror of the services' (`datalayer_solr/tests/
test_session_rule.py`): the two rules must stay in step, so a row added to
one is added to the other. Then the files made to say it as they are read —
by the file store's listing and by the picker's first group.
"""

from __future__ import annotations

import asyncio
import json
import os
import socket
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest

from agent_runtimes.apps import local_rule
from agent_runtimes.apps.record import session_from_entries
from agent_runtimes.apps.session_store import FileSessionStore
from agent_runtimes.loop.paused import STATES, listed, local_paused

RUN = "exec_0001"
SEAT = {"kind": "team_run", "execution_id": RUN, "seat": "analyst"}
HERE = {"kind": "runtime", "uid": "local"}
GONE = {"pid": 4_000_000, "host": local_rule.this_machine()}
ALIVE = {"pid": os.getpid(), "host": local_rule.this_machine()}


def _session(state: str = "paused", **more: Any) -> Dict[str, Any]:
    return {"uid": "s", "state": state, "runs_on": HERE, **more}


#: The rule's table: the session, the team runs' files, what is decided.
#: The same rows as the services' table, said for this machine.
TABLE = [
    # A seat of a team run ends with its run.
    (
        "a seat whose run goes on",
        _session("open", runs_on=SEAT),
        {RUN: {"state": "open", "held_by": ALIVE}},
        None,
    ),
    (
        "a seat whose run is paused",
        _session(runs_on=SEAT),
        {RUN: {"state": "paused"}},
        None,
    ),
    (
        "a seat whose run ended",
        _session(runs_on=SEAT),
        {RUN: {"state": "ended"}},
        ("ended", f"Its team run {RUN} ended.", "run"),
    ),
    (
        "a seat whose run nothing keeps",
        _session("open", runs_on=SEAT),
        {RUN: None},
        ("ended", f"Its team run {RUN} is no longer kept on this machine.", "run"),
    ),
    (
        "a seat whose run crashed",
        _session("open", runs_on=SEAT),
        {RUN: {"state": "open", "held_by": GONE}},
        (
            "ended",
            f"Its team run {RUN} stopped without ending: its process is gone.",
            "run",
        ),
    ),
    (
        "a seat whose run names no holder",
        _session("open", runs_on=SEAT),
        {RUN: {"state": "open"}},
        None,
    ),
    # An open session is one a process holds.
    ("open, its process alive", _session("open", held_by=ALIVE), {}, None),
    (
        "open, its process gone",
        _session("open", held_by=GONE),
        {},
        ("paused", "The process that held it is gone from this machine.", "record"),
    ),
    ("open, nobody said who holds it", _session("open"), {}, None),
    (
        "open, held on another machine",
        _session("open", held_by={"pid": 1, "host": "elsewhere"}),
        {},
        None,
    ),
    # Every other session is left as the files say it.
    ("paused, an agent's", _session(), {}, None),
    (
        "a harness that starts over (resume: none)",
        _session(harness="opencode"),
        {},
        None,
    ),
    ("ended already", _session("ended", runs_on=SEAT), {RUN: {"state": "ended"}}, None),
]


@pytest.mark.parametrize(
    "name,session,runs,expected", TABLE, ids=[row[0] for row in TABLE]
)
def test_the_rule(
    name: str,
    session: Dict[str, Any],
    runs: Dict[str, Any],
    expected: Any,
    tmp_path: Path,
) -> None:
    for run, row in runs.items():
        if row is not None:
            (tmp_path / f"{run}.json").write_text(
                json.dumps({"execution_id": run, **row})
            )
    assert local_rule.decided([session], teams_root=tmp_path).get("s") == expected


def test_the_two_rules_say_they_must_stay_in_step() -> None:
    assert "datalayer_solr/session_rule.py" in (local_rule.__doc__ or "")
    assert "must stay in step" in " ".join((local_rule.__doc__ or "").split())


def _keep(
    store: FileSessionStore,
    uid: str,
    state: str = "open",
    *,
    runs_on: Optional[Dict[str, Any]] = None,
    held_by: Any = None,
) -> None:
    payload: Dict[str, Any] = {
        "app": "agent:example-simple",
        "state": "open",
        "agent": "example-simple",
        "runs_on": runs_on or HERE,
    }
    if held_by:
        payload["held_by"] = held_by
    entries: List[Dict[str, Any]] = [
        {"kind": "session", "summary": "started", "payload": payload}
    ]
    if state != "open":
        entries.append({"kind": state, "summary": state, "payload": {"state": state}})
    asyncio.run(
        store.append(uid, entries, app_uid="agent:example-simple", opened_by="")
    )


@pytest.fixture()
def files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> FileSessionStore:
    monkeypatch.setenv(local_rule.TEAMS_PATH_VARIABLE, str(tmp_path / "teams"))
    (tmp_path / "teams").mkdir()
    return FileSessionStore(root=tmp_path / "sessions")


def test_a_runtime_started_by_hand_says_which_process_holds_its_session() -> None:
    assert local_rule.holder() == ALIVE and local_rule.process_gone(ALIVE) is False
    # The machine is a digest of its name, never the name: a session file is exported.
    assert socket.gethostname() not in json.dumps(local_rule.holder())
    assert (
        local_rule.process_gone(GONE) is True and local_rule.process_gone(None) is None
    )
    opened = {
        "kind": "session",
        "payload": {"agent": "a", "runs_on": HERE, "held_by": ALIVE},
        "at": "2026-11-12T10:00:00Z",
    }
    assert session_from_entries("s", [opened])["held_by"] == ALIVE
    paused = session_from_entries(
        "s", [opened, {"kind": "paused", "payload": {"state": "paused"}}]
    )
    assert "held_by" not in paused


def test_the_files_are_made_to_say_it_as_they_are_listed(
    files: FileSessionStore, tmp_path: Path
) -> None:
    _keep(files, "held", held_by=ALIVE)
    _keep(files, "stale", held_by=GONE)
    _keep(files, "legacy")
    _keep(files, "seat-over", runs_on=SEAT)
    _keep(files, "seat-crashed", runs_on={**SEAT, "execution_id": "exec_0002"})
    _keep(files, "paused", "paused")
    (tmp_path / "teams" / f"{RUN}.json").write_text(
        json.dumps({"execution_id": RUN, "state": "ended"})
    )
    (tmp_path / "teams" / "exec_0002.json").write_text(
        json.dumps({"execution_id": "exec_0002", "state": "open", "held_by": GONE})
    )
    page = asyncio.run(files.list({"kind": "local", "uid": ""}))
    assert {s["uid"]: s["state"] for s in page.sessions} == {
        "held": "open",
        "stale": "paused",
        "legacy": "open",
        "paused": "paused",
    }
    ended = asyncio.run(files.list({"kind": "local", "uid": ""}, state="ended"))
    assert {s["uid"] for s in ended.sessions} == {"seat-over", "seat-crashed"}
    # Written, not only answered: the file says why and by what; nothing was deleted.
    last = files._read("stale")[-1]
    assert last["kind"] == "paused" and last["payload"] == {
        "state": "paused",
        "by": "record",
        "why": "The process that held it is gone from this machine.",
    }
    assert files._read("seat-over")[-1]["payload"]["by"] == "run"
    assert len(list(files.root.iterdir())) >= 6
    # Read again, there is nothing left to decide.
    assert local_rule.decided(files.described()) == {}


def test_the_pickers_first_group_lists_what_runs_or_resumes_here(
    files: FileSessionStore, tmp_path: Path
) -> None:
    """The invariant on this machine: every local row listed as paused is resumed by Enter."""
    from agent_runtimes.loop.picker import why_not

    _keep(files, "stale", held_by=GONE)
    _keep(files, "seat-over", runs_on=SEAT)
    _keep(files, "paused", "paused")
    (tmp_path / "teams" / f"{RUN}.json").write_text(
        json.dumps({"execution_id": RUN, "state": "ended"})
    )
    rows = listed(local_paused(files, names={}, states=STATES))
    assert {row.uid: row.state for row in rows} == {
        "stale": "paused",
        "paused": "paused",
    }
    for row in rows:
        assert why_not("resume", row) == "", row.uid
