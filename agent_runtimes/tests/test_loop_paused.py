# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The paused sessions `loop` offers to resume as it starts.

The rows from a store of files on this machine and a stubbed answer of the
platform's record; the choice, resumed where the session lives; Enter
leading to the usual questions; nothing asked when none is paused; the
platform's list failing said in a line and not fatal.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.apps.session_store import FileSessionStore
from agent_runtimes.loop import paused
from agent_runtimes.loop.paused import (
    NEW_SESSION,
    Paused,
    choose_paused,
    paused_line,
    paused_sessions,
    resume_plan,
)

NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)


def _kept(store: FileSessionStore, uid: str, app_uid: str, state: str) -> None:
    """A session in the files, as a runtime's recorder writes it."""
    entries: List[Dict[str, Any]] = [
        {
            "kind": "session",
            "summary": "A session started",
            "payload": {
                "app": "example-simple",
                "state": "open",
                "agent": "example-simple",
                "title": f"Title of {uid}",
                "runs_on": {"kind": "runtime", "uid": "local"},
            },
        },
        {
            "kind": "turn",
            "summary": "One",
            "payload": {"asked": "One", "answered": "1"},
        },
    ]
    if state != "open":
        entries.append({"kind": state, "summary": state, "payload": {"state": state}})
    asyncio.run(store.append(uid, entries, app_uid=app_uid, opened_by=""))


def _cloud(token: str) -> List[Dict[str, Any]]:
    assert token == "the-token"
    return [
        {
            "uid": "cloud-agent-1",
            "app_uid": "agent:worker-marketer",
            "state": "paused",
            "agent": "worker-marketer",
            "title": "The autumn campaign",
            "runs_on": {"kind": "runtime", "uid": "01m6gfaf"},
            "started_at": "2026-11-11T11:00:00+00:00",
            "turns": 4,
        },
        {
            "uid": "cloud-app-1",
            "app_uid": "app-1",
            "state": "paused",
            "agent": "cog-crawler",
            "title": "Hi",
            "runs_on": {"kind": "runtime", "uid": "01m6gfag"},
            "started_at": "2026-11-11T09:00:00+00:00",
        },
        {
            "uid": "own-machine-1",
            "app_uid": "agent:example-simple",
            "state": "paused",
            "agent": "example-simple",
            "title": "Kept on Datalayer, ran here",
            "runs_on": {"kind": "runtime", "uid": "local"},
            "started_at": "2026-11-11T10:00:00+00:00",
        },
        {"uid": "open-1", "app_uid": "agent:x", "state": "open", "agent": "x"},
    ]


@pytest.fixture()
def files(tmp_path: Path) -> FileSessionStore:
    store = FileSessionStore(root=tmp_path / "sessions")
    _kept(store, "local-paused-1", "agent:example-simple", "paused")
    _kept(store, "local-open-1", "agent:example-simple", "open")
    _kept(store, "local-ended-1", "agent:example-simple", "ended")
    return store


def test_the_rows_from_this_machine_and_from_datalayer(files: FileSessionStore) -> None:
    said: List[str] = []
    rows = paused_sessions(
        token="the-token", store=files, asker=_cloud, say=said.append
    )
    assert said == []
    by_uid = {row.uid: row for row in rows}
    # Paused ones only: an open and an ended one are not offered.
    assert set(by_uid) == {
        "local-paused-1",
        "cloud-agent-1",
        "cloud-app-1",
        "own-machine-1",
    }
    assert by_uid["local-paused-1"] == Paused(
        uid="local-paused-1",
        kind="agent",
        agent="example-simple",
        title="Title of local-paused-1",
        where="local",
        store="file",
        started_at=by_uid["local-paused-1"].started_at,
        turns=1,
    )
    assert (by_uid["cloud-agent-1"].where, by_uid["cloud-agent-1"].store) == (
        "cloud",
        "record",
    )
    # Kept in the platform's record by a runtime on this machine: it lives here.
    assert (by_uid["own-machine-1"].where, by_uid["own-machine-1"].store) == (
        "local",
        "record",
    )
    assert by_uid["cloud-app-1"].kind == "application"
    assert not by_uid["cloud-app-1"].resumable and by_uid["cloud-agent-1"].resumable
    # Newest first.
    started = [row.started_at for row in rows]
    assert started == sorted(started, reverse=True)


def test_a_line_says_kind_agent_title_where_and_when() -> None:
    row = Paused(
        uid="u",
        kind="agent",
        agent="worker-marketer",
        title="The autumn campaign",
        where="cloud",
        store="record",
        started_at="2026-11-11T09:00:00+00:00",
    )
    assert paused_line(row, NOW) == (
        "Agent session · worker-marketer · “The autumn campaign” · on Datalayer · started 3 hours ago"
    )
    here = Paused("u", "application", "cog-crawler", "", "local", "file", "")
    assert paused_line(here, NOW) == (
        "Application session · cog-crawler · “(no title)” · on this machine"
    )


def test_not_signed_in_lists_this_machines_only(files: FileSessionStore) -> None:
    def never(token: str) -> List[Dict[str, Any]]:
        raise AssertionError("Nobody signed in: Datalayer is not asked.")

    rows = paused_sessions(token="", store=files, asker=never, say=lambda line: None)
    assert [row.uid for row in rows] == ["local-paused-1"]


def test_datalayer_failing_is_said_in_a_line_and_not_fatal(
    files: FileSessionStore,
) -> None:
    def offline(token: str) -> List[Dict[str, Any]]:
        raise OSError("Name or service not known")

    said: List[str] = []
    rows = paused_sessions(
        token="the-token", store=files, asker=offline, say=said.append
    )
    assert [row.uid for row in rows] == ["local-paused-1"]
    assert said == [
        "Your paused sessions on Datalayer could not be listed (Name or service not known): going on without them."
    ]


def test_none_paused_asks_nobody(tmp_path: Path) -> None:
    def never(*args: Any) -> str:
        raise AssertionError("With no paused session nothing is asked.")

    rows = paused_sessions(
        token="", store=FileSessionStore(root=tmp_path / "none"), say=lambda _: None
    )
    assert rows == []
    assert choose_paused(rows, ask=never) is None


def test_the_choice_and_enter(files: FileSessionStore) -> None:
    rows = paused_sessions(
        token="the-token", store=files, asker=_cloud, say=lambda _: None
    )
    asked: List[Any] = []

    def pick(uid: str) -> Any:
        def ask(question: str, choices: List[tuple], default: str) -> str:
            asked.append((question, choices, default))
            return uid

        return ask

    # Enter: the first choice, a new session, and the usual questions follow.
    assert choose_paused(rows, ask=pick(""), now=NOW) is None
    question, choices, default = asked[0]
    assert question == (
        "You have 4 paused sessions (your agents' shown; 1 more: /sessions). "
        "Go on with one, or start a new one?"
    )
    assert choices[0] == (NEW_SESSION, "") and default == ""
    # An application's is resumed at its address: counted, never offered as
    # a choice that cannot be picked.
    assert [choice[1] for choice in choices[1:]] == [
        row.uid for row in rows if row.kind == "agent"
    ]
    assert all(
        choice[0].startswith("Resume: Agent session · ") for choice in choices[1:]
    )

    # A cloud one is resumed on Datalayer, a local one on this machine,
    # each with its agent, nobody asked where.
    on_datalayer = choose_paused(rows, ask=pick("cloud-agent-1"))
    assert on_datalayer is not None
    plan = resume_plan(on_datalayer)
    assert (plan.uid, plan.agent, plan.cloud, plan.session_store) == (
        "cloud-agent-1",
        "worker-marketer",
        True,
        "",
    )
    here = choose_paused(rows, ask=pick("local-paused-1"))
    assert here is not None
    plan = resume_plan(here)
    # Kept in files: its server reads the files, signed in or not.
    assert (plan.agent, plan.cloud, plan.session_store) == (
        "example-simple",
        False,
        "file",
    )
    kept_on_datalayer = choose_paused(rows, ask=pick("own-machine-1"))
    assert kept_on_datalayer is not None
    assert resume_plan(kept_on_datalayer).cloud is False
    assert resume_plan(kept_on_datalayer).session_store == ""

    with pytest.raises(KeyboardInterrupt):
        choose_paused(rows, ask=lambda *args: None)


def test_five_are_offered_and_the_rest_counted() -> None:
    rows = [
        Paused(
            f"u{n}", "agent", "a", f"T{n}", "local", "file", f"2026-11-0{n}T00:00:00Z"
        )
        for n in range(1, 8)
    ]
    seen: List[Any] = []

    def ask(question: str, choices: List[tuple], default: str) -> str:
        seen.append((question, choices))
        return ""

    choose_paused(rows, ask=ask)
    question, choices = seen[0]
    assert question == (
        "You have 7 paused sessions (the 5 most recent of your agents'; 2 more: /sessions). "
        "Go on with one, or start a new one?"
    )
    assert len(choices) == 1 + paused.OFFERED


def test_a_run_nobody_is_at_asks_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.chat import cli
    from agent_runtimes.loop import launch

    monkeypatch.setattr(launch, "interactive", lambda: False)
    monkeypatch.setattr(
        paused,
        "paused_sessions",
        lambda **kwargs: (_ for _ in ()).throw(AssertionError("not listed")),
    )
    assert cli._offer_paused() is None


def test_a_picked_session_is_resumed_before_the_first_prompt() -> None:
    """The prompt runs `/resume <uid>` as it starts, when one was picked."""
    from pathlib import Path as P

    from agent_runtimes.chat import cli, tux

    source = P(tux.__file__).read_text()
    assert 'await self.run_line(f"/resume {self.resume_at_start}")' in source
    assert "tux.resume_at_start = resume" in source
    wiring = P(cli.__file__).read_text()
    assert "resume=resume_uid," in wiring
    assert "if agent_id is None and not query and not runtime:" in wiring
    # Offered before where the agent runs is asked.
    assert wiring.index("paused = _offer_paused()") < wiring.index(
        "where = _choose_where_at_start(local=local, cloud=cloud)"
    )


def test_only_applications_paused_asks_nobody() -> None:
    def never(*args: Any) -> str:
        raise AssertionError("Nothing here can be resumed: nothing is asked.")

    rows = [Paused("u1", "application", "cog-crawler", "Hi", "cloud", "record", "")]
    assert choose_paused(rows, ask=never) is None
