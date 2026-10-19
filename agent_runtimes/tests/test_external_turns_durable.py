# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A host's turn is answered once, across a restart of the runtime (DC-205, S-207).

The turn an external event id or an ``Idempotency-Key`` names is kept in the
runtime's protocol state store, not only in the process: a retry that reaches
a restarted runtime is answered the original turn, with nothing run again; a
turn that was running when its process went is answered ``failed``; another
request under the same key is still a 409; two deliveries of one turn at
once make one turn.

A restart is simulated by forgetting what the process holds and opening a
fresh store over the same SQLite file; one case kills a real process.
"""

import asyncio
import os
import signal
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Iterator, List

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import external_turns
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.protocol_state import (
    SqliteProtocolStateStore,
    use_protocol_state_store,
)
from agent_runtimes.routes import apps as routes
from agent_runtimes.tests.test_app_host_sessions import (
    DEPLOYED,
    _start,
    _turn,
    hosted,
    remote,
    runtime,
)
from agent_runtimes.tests.test_app_sessions import ASSISTANT, Runtime, as_, events_of

__all__ = ["hosted", "remote", "runtime"]

HOST = "host:alice:dep-1"
#: The key the host's start under ``Ev-durable`` is kept under.
START_KEY = "host|alice|inst-1#event:Ev-durable"


@pytest.fixture()
def state(tmp_path: Path) -> Iterator[Path]:
    """The protocol state file of this test, in a store of its own.

    Yields
    ------
    Path
        The SQLite file the store of this test keeps its records in.
    """
    path = tmp_path / "protocol-state.sqlite"
    use_protocol_state_store(SqliteProtocolStateStore(path))
    external_turns.forget()
    yield path
    external_turns.forget()
    use_protocol_state_store(None)


def restart(path: Path) -> SqliteProtocolStateStore:
    """What a restarted runtime holds: nothing in memory, the same file."""
    external_turns.forget()
    store = SqliteProtocolStateStore(path)
    use_protocol_state_store(store)
    return store


def test_a_start_and_a_message_retried_after_a_restart_answer_the_original_turns(
    runtime: Runtime, remote: TestClient, hosted: Any, state: Path
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    first = _turn(
        events_of(
            _start(remote, HOST, "slack-thread-0101", external_event_id="Ev-durable")
        )
    )
    keyed = {**as_(HOST), "Idempotency-Key": "k-durable"}
    messages = "/api/v1/apps/sessions/slack-thread-0101/messages"
    message = {"text": "And the costs?", "external_event_id": "Ev-durable-2"}
    said = _turn(events_of(remote.post(messages, headers=keyed, json=message)))
    assert len(model.prompts) == 2

    store = restart(state)
    kept = asyncio.run(store.get(external_turns.KIND, START_KEY))
    assert kept is not None
    assert (kept["turn"], kept["state"]) == (first["turn"], "finished")

    again = _turn(
        events_of(
            _start(remote, HOST, "slack-thread-0101", external_event_id="Ev-durable")
        )
    )
    assert (again["turn"], again["replayed"], again["state"]) == (
        first["turn"],
        True,
        "finished",
    )
    retried = _turn(events_of(remote.post(messages, headers=keyed, json=message)))
    assert (retried["turn"], retried["replayed"], retried["state"]) == (
        said["turn"],
        True,
        "finished",
    )
    assert len(model.prompts) == 2, "nothing ran again"

    # Another request under the same key, after the restart: 409, nothing run.
    restart(state)
    other = _start(
        remote,
        HOST,
        "slack-thread-0101",
        external_event_id="Ev-durable",
        opener="Other",
    )
    assert other.status_code == 409
    restart(state)
    assert (
        remote.post(
            messages, headers=keyed, json={**message, "text": "Something else"}
        ).status_code
        == 409
    )
    assert len(model.prompts) == 2


def test_a_turn_running_when_its_process_went_is_answered_failed(
    runtime: Runtime, remote: TestClient, hosted: Any, state: Path
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, DEPLOYED)
    first = _turn(
        events_of(
            _start(remote, HOST, "slack-thread-0102", external_event_id="Ev-durable")
        )
    )
    # The process went in the middle of the turn: the store says running.
    store = restart(state)
    kept = asyncio.run(store.get(external_turns.KIND, START_KEY))
    assert kept is not None
    asyncio.run(store.put(external_turns.KIND, START_KEY, {**kept, "state": "running"}))

    restart(state)
    again = _turn(
        events_of(
            _start(remote, HOST, "slack-thread-0102", external_event_id="Ev-durable")
        )
    )
    assert (again["turn"], again["replayed"], again["state"]) == (
        first["turn"],
        True,
        "failed",
    )
    assert len(model.prompts) == 1
    # And kept so.
    kept = asyncio.run(store.get(external_turns.KIND, START_KEY))
    assert kept is not None and kept["state"] == "failed"


class _Live:
    """What `_external_turn` reads of a session."""

    uid = "s-concurrent"

    def session_event(self) -> str:
        return ""


def test_two_deliveries_of_one_turn_at_once_make_one_turn(state: Path) -> None:
    """Both read the store before either claims: one runs, the other replays."""
    key = external_turns.key_of(Caller(kind="host", uid="alice"), "", "Ev-twice")
    assert key
    asked = {"session": "s-concurrent", "text": "Hello"}
    ran: List[str] = []

    async def run(head: str) -> AsyncIterator[str]:
        ran.append(head)
        yield "data: {}\n\n"

    async def deliver() -> str:
        known = await routes._peek_turn(key, asked)
        if known is not None:
            return f"replayed {known.turn}"
        response = await routes._external_turn(key, asked, _Live(), "Ev-twice", run)
        async for _ in response.body_iterator:
            pass
        return f"ran {external_turns._TURNS[key].turn}"

    async def both() -> List[str]:
        return list(await asyncio.gather(deliver(), deliver()))

    answers = sorted(asyncio.run(both()))
    turn = external_turns._TURNS[key].turn
    assert answers == [f"ran {turn}", f"replayed {turn}"]
    assert len(ran) == 1

    # After a restart the same delivery is the same turn, finished.
    store = restart(state)
    asyncio.run(external_turns.recall(key))
    replay = external_turns.peek(key, request=asked)
    assert replay is not None and (replay.turn, replay.state) == (turn, "finished")
    assert [
        record["key"] for record in asyncio.run(store.list(external_turns.KIND))
    ] == [key]


def test_the_turns_kept_expire_after_a_day_and_at_most_held_remain(
    state: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def kept(at: float, *keys: str) -> None:
        for each in keys:
            turn, _ = external_turns.claim(
                each, request={"k": each}, session_uid="s", external_event_id="", now=at
            )
            await external_turns.keep(each, turn, now=at)

    store = SqliteProtocolStateStore(state)
    asyncio.run(kept(0, "old"))
    # Read back after a day: not answered, and removed.
    restart(state)
    asyncio.run(external_turns.recall("old", now=external_turns.TTL_SECONDS))
    assert external_turns.peek("old", request={"k": "old"}) is None
    assert asyncio.run(store.get(external_turns.KIND, "old")) is None

    # The store is pruned to the newest HELD.
    monkeypatch.setattr(external_turns, "HELD", 2)
    restart(state)
    asyncio.run(kept(external_turns.PRUNE_EVERY, "a", "b", "c"))
    restart(state)
    asyncio.run(kept(2 * external_turns.PRUNE_EVERY, "d"))
    remaining = [
        record["key"] for record in asyncio.run(store.list(external_turns.KIND))
    ]
    assert remaining == ["c", "d"]


@pytest.mark.skipif(sys.platform == "win32", reason="SIGKILL")
def test_a_turn_running_in_a_killed_process_is_answered_failed_by_the_next(
    state: Path,
) -> None:
    """A real process claims a turn, keeps it, and is killed mid-run."""
    child = textwrap.dedent(
        f"""
        import asyncio, os, signal
        from agent_runtimes.loop.apps import external_turns

        async def main():
            turn, _ = external_turns.claim(
                "k-killed", request={{"text": "Hello"}}, session_uid="s",
                external_event_id="Ev-killed",
            )
            await external_turns.keep("k-killed", turn)
            print(turn.turn, flush=True)
            os.kill(os.getpid(), signal.SIGKILL)

        asyncio.run(main())
        """
    )
    environment = {**os.environ, "AGENT_RUNTIMES_PROTOCOL_STATE_PATH": str(state)}
    environment.pop("KUBERNETES_SERVICE_HOST", None)
    killed = subprocess.run(
        [sys.executable, "-c", child],
        env=environment,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert killed.returncode == -signal.SIGKILL, killed.stderr
    turn = killed.stdout.strip()

    restart(state)
    asyncio.run(external_turns.recall("k-killed"))
    found = external_turns.peek("k-killed", request={"text": "Hello"})
    assert found is not None and (found.turn, found.state) == (turn, "failed")
    with pytest.raises(external_turns.TurnConflict):
        external_turns.peek("k-killed", request={"text": "Other"})
    record: Dict[str, Any] | None = asyncio.run(
        SqliteProtocolStateStore(state).get(external_turns.KIND, "k-killed")
    )
    assert record is not None and record["state"] == "failed"
