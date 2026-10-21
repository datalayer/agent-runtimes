# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A team seat works inside an apps session (MH-38, decision T).

The runtime's A2A worker, serving the Coder of the catalogue's
``coding-agents`` team on the ACP SDK's fake harness: a task the control
plane delegates to the seat is a turn of an apps session opened at the
seat's first task with ``runs_on: {kind: team_run, execution_id, seat}``,
its uid answered in the task result's metadata; the seat's next task, handed
that uid, resumes it — the session held here, or rebuilt from the record
when a new worker (a restarted runtime) is asked — and the harness loads its
own session again; the record holds both turns and the tool rows. A session
handed for another run, and a seat of a team the catalogue lacks, are
refused in a sentence.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator

import jwt
import pytest

from agent_runtimes.adapters.acp_agent import ACPAgent
from agent_runtimes.context.delegation import hold
from agent_runtimes.guardrails.shield_policy import policies_of
from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.session_store import FileSessionStore, use_session_store
from agent_runtimes.protocol_state.a2a import DurableStorage
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.tests.test_a2a_harness_worker import (  # noqa: F401 - fixtures
    _statuses,
    _text,
    state,
    workspace,
)
from agent_runtimes.tests.test_acp_agent import FAKE, fake_harness
from agent_runtimes.transports.a2a import A2AWorker, TaskCancellation

ROOT = "exec_team_1"
TEAM = "coding-agents"


def harness_agent(workspace: Path, state: Any) -> ACPAgent:
    """The Coder on the fake harness, its rows in the protocol state store (as a runtime's are)."""
    import sys

    return ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=[sys.executable, str(FAKE)],
        workspace=workspace,
        policies=policies_of(None),
        state_store=state,
    )


#: The execution's token, which the seat's session is opened in the name of: its `sub`.
PERSON = "ada"
CREDENTIAL = jwt.encode(
    {"sub": PERSON, "user": {"firstName": "Ada"}}, "a-secret", algorithm="HS256"
)


@pytest.fixture
def store(tmp_path: Path) -> Iterator[FileSessionStore]:
    """The file session store, in the test's folder: what the seat's record is written to.

    Yields
    ------
    FileSessionStore
        The store, active for the test.
    """
    kept = FileSessionStore(root=tmp_path / "sessions")
    use_session_store(kept)
    yield kept
    use_session_store(None)
    sessions.forget_sessions()


def _delegated(
    text: str,
    *,
    execution_id: str = "exec_seat_1",
    root: str = ROOT,
    seat: dict[str, str] | None = None,
    session: str | None = None,
    context_id: str = "ctx-team",
) -> dict[str, Any]:
    ours: dict[str, Any] = {
        "execution": {
            "executionId": execution_id,
            "rootExecutionId": root,
            "parentExecutionId": root,
            "depth": 1,
        },
        "seat": seat if seat is not None else {"team": TEAM, "seat": "coder"},
    }
    if session:
        ours["session"] = {"uid": session}
    return {
        "role": "user",
        "parts": [{"text": text}],
        "message_id": f"m-{execution_id}",
        "context_id": context_id,
        "metadata": {"datalayer": ours},
    }


async def _tasks(
    state: Any, agent: ACPAgent, messages: list[dict[str, Any]], *, cleanup: bool = True
) -> list[dict[str, Any]]:
    """Run tasks one after the other on one worker; the final status of each."""
    from fasta2a.broker import InMemoryBroker

    storage = DurableStorage(state, "coder")
    broker = InMemoryBroker()
    worker = A2AWorker(
        broker=broker,
        storage=storage,
        agent=agent,
        agent_id="a2a-team-coding-agents-coder",
        cancellation=TaskCancellation(
            register=a2a_routes.register_task,
            unregister=a2a_routes.unregister_task,
            cancel=a2a_routes.cancel_task,
        ),
    )
    finals: list[dict[str, Any]] = []
    try:
        async with broker, worker.run():
            for message in messages:
                task = await storage.submit_task(message["context_id"], message)
                # The execution's token, as the A2A route holds it for the worker (O1-17).
                hold(task["id"], CREDENTIAL)
                params = {
                    "id": task["id"],
                    "context_id": message["context_id"],
                    "message": message,
                }
                events: list[dict[str, Any]] = []
                async with broker.event_bus.subscribe(task["id"]) as receive:
                    await broker.run_task(params)
                    async for event in receive:
                        events.append(event)
                finals.append(_statuses(events)[-1])
    finally:
        if cleanup:
            await agent.cleanup()
    return finals


def _session_of(status: dict[str, Any]) -> dict[str, Any]:
    return ((status.get("message") or {}).get("metadata") or {})["datalayer"]["session"]


@pytest.mark.asyncio
async def test_two_tasks_of_one_seat_share_a_session_and_its_record_holds_both_turns(
    state: Any, workspace: Path, store: FileSessionStore
) -> None:
    agent = harness_agent(workspace, state)
    [first] = await _tasks(
        state,
        agent,
        [_delegated("plan edit", execution_id="exec_seat_1")],
        cleanup=False,
    )
    assert first["state"] == "completed", _text(first.get("message"))
    opened = _session_of(first)
    uid = opened["uid"]
    assert opened == {"uid": uid, "seat": "coder", "executionId": ROOT}
    # The next task, handed the uid, is the same session's next turn.
    [second] = await _tasks(
        state,
        agent,
        [_delegated("say hello again", execution_id="exec_seat_2", session=uid)],
    )
    assert second["state"] == "completed", _text(second.get("message"))
    assert _session_of(second)["uid"] == uid
    entries = await store.entries(uid)
    kinds = [entry["kind"] for entry in entries]
    [head] = [entry for entry in entries if entry["kind"] == "session"]
    assert head["payload"]["runs_on"] == {
        "kind": "team_run",
        "execution_id": ROOT,
        "seat": "coder",
    }
    assert (
        head["payload"]["app"] == f"team-{TEAM}" and head["app_uid"] == f"team:{TEAM}"
    )
    assert head["payload"]["agent"] == agent.spec_id
    assert head["opened_by"] == PERSON
    assert kinds.count("turn") == 2
    turns = [entry["payload"] for entry in entries if entry["kind"] == "turn"]
    assert turns[0]["asked"] == "plan edit" and turns[1]["asked"] == "say hello again"
    assert turns[0]["answered"]
    # The harness's edit is a tool row of the record, as any session's.
    assert any(entry["kind"] == "tool_call" for entry in entries), kinds
    row = sessions.session_of(uid)
    assert row is not None and row.turn == "idle" and row.state == "open"
    assert row.describe()["turns"] == 2 and row.describe()["runs_on"]["seat"] == "coder"


@pytest.mark.asyncio
async def test_a_harness_seats_second_task_on_a_new_worker_loads_its_session_from_the_record(
    state: Any, workspace: Path, store: FileSessionStore
) -> None:
    first_agent = harness_agent(workspace, state)
    [first] = await _tasks(
        state, first_agent, [_delegated("plan edit", execution_id="exec_seat_1")]
    )
    uid = _session_of(first)["uid"]
    acp_before = await first_agent._kept_session(uid)
    assert acp_before, "the harness kept its session under the seat's session uid"
    # The runtime that held it is gone: a new worker, the session no longer held here.
    sessions.forget_sessions()
    second_agent = harness_agent(workspace, state)
    [second] = await _tasks(
        state,
        second_agent,
        [_delegated("say hello again", execution_id="exec_seat_2", session=uid)],
        cleanup=False,
    )
    assert second["state"] == "completed", _text(second.get("message"))
    assert _session_of(second)["uid"] == uid
    # The harness loaded its own session again (session/load), under the same uid.
    assert second_agent._acp_of.get(uid) == acp_before
    await second_agent.cleanup()
    entries = await store.entries(uid)
    heads = [entry["payload"] for entry in entries if entry["kind"] == "session"]
    assert len(heads) == 2 and heads[1].get("resumed") is True
    assert [
        entry["payload"]["asked"] for entry in entries if entry["kind"] == "turn"
    ] == [
        "plan edit",
        "say hello again",
    ]


@pytest.mark.asyncio
async def test_a_session_of_another_run_and_an_unknown_team_are_refused(
    state: Any, workspace: Path, store: FileSessionStore
) -> None:
    agent = harness_agent(workspace, state)
    [first] = await _tasks(state, agent, [_delegated("plan edit")], cleanup=False)
    uid = _session_of(first)["uid"]
    [other] = await _tasks(
        state,
        agent,
        [
            _delegated(
                "go on", execution_id="exec_seat_9", root="exec_team_2", session=uid
            )
        ],
        cleanup=False,
    )
    assert other["state"] == "failed"
    assert (
        f"Session {uid} is not this run's: it runs on team run {ROOT}, and the task names run exec_team_2."
        in _text(other.get("message"))
    )
    [unknown] = await _tasks(
        state,
        agent,
        [_delegated("go on", seat={"team": "no-such-team", "seat": "coder"})],
    )
    assert unknown["state"] == "failed"
    assert "team 'no-such-team', which the catalogue does not have" in _text(
        unknown.get("message")
    )


@pytest.mark.asyncio
async def test_a_seats_stopped_task_keeps_its_turn() -> None:
    """A seat session whose only task stopped has that turn: listed, counted, resumable (MH-42)."""
    from agent_runtimes.orchestration.seat_sessions import SeatRun

    class Recorder:
        def __init__(self) -> None:
            self.rows: list[tuple[str, Any]] = []

        def turned(self, asked: str, answered: str) -> None:
            self.rows.append(("turn", (asked, answered)))

        def ended(self, status: str, summary: str, payload: Any) -> None:
            self.rows.append(("ended", status))

        async def flush(self, uid: str) -> None:
            self.rows.append(("flush", uid))

    class Live:
        uid = "s1"
        turn = "running"
        recorder = Recorder()

    live = Live()
    seat = SeatRun(
        live=live,
        team_id=TEAM,
        seat="coder",
        execution_id=ROOT,
        asked="run the tests",
        opened=True,
    )
    meta = await seat.failed("refused by the Shield")
    assert live.recorder.rows == [
        ("turn", ("run the tests", "Stopped: refused by the Shield")),
        ("ended", "stopped"),
        ("flush", "s1"),
    ]
    assert live.turn == "idle" and "s1" in str(meta)
