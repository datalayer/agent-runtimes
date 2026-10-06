# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An A2A agent's tasks run beside one another, not one after the other.

fasta2a's worker awaited each task before taking the next: a request sent
while a report was being written waited for it before its stream said
anything, and one its caller gave up on meanwhile stayed submitted.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

import pytest

from agent_runtimes.adapters.base import BaseAgent, StreamEvent
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.a2a import DurableStorage
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore


@pytest.fixture
def state(tmp_path: Any, monkeypatch: Any) -> SqliteProtocolStateStore:
    store = SqliteProtocolStateStore(tmp_path / "state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    return store


def _agent(second_started: asyncio.Event) -> BaseAgent:
    class Worker(BaseAgent):
        async def run(self, prompt: str, context: Any) -> Any:  # pragma: no cover
            raise NotImplementedError

        async def stream(self, prompt: str, context: Any) -> AsyncIterator[StreamEvent]:
            if prompt == "first":
                # Finishes only once the second task has started: one after
                # the other, it never would.
                await second_started.wait()
            else:
                second_started.set()
            yield StreamEvent(type="output", data=f"{prompt} answered")
            yield StreamEvent(type="done", data={})

        def get_tools(self) -> list[Any]:
            return []

        @property
        def name(self) -> str:
            return "worker"

        @property
        def description(self) -> str:
            return "Two tasks at once"

        @property
        def version(self) -> str:
            return "0.0.0"

    return Worker()


def _message(text: str) -> dict[str, Any]:
    return {
        "role": "user",
        "parts": [{"text": text}],
        "message_id": f"m-{text}",
        "context_id": f"ctx-{text}",
    }


async def _states(broker: Any, task_id: str) -> list[str]:
    states: list[str] = []
    async with broker.event_bus.subscribe(task_id) as receive:
        async for event in receive:
            if "status_update" in event:
                states.append(event["status_update"]["status"]["state"])
    return states


@pytest.mark.asyncio
async def test_a_task_sent_while_another_works_starts_at_once(state: Any) -> None:
    from fasta2a.broker import InMemoryBroker

    from agent_runtimes.transports.a2a import A2AWorker

    storage = DurableStorage(state, "accounting")
    broker = InMemoryBroker()
    worker = A2AWorker(
        broker=broker, storage=storage, agent=_agent(asyncio.Event())
    )
    first = await storage.submit_task("ctx-first", _message("first"))
    second = await storage.submit_task("ctx-second", _message("second"))
    async with broker, worker.run():
        readers = [
            asyncio.create_task(_states(broker, task["id"])) for task in (first, second)
        ]
        await asyncio.sleep(0)
        for task in (first, second):
            await broker.run_task(
                {
                    "id": task["id"],
                    "context_id": task["context_id"],
                    "message": task["history"][-1],
                }
            )
        ended = await asyncio.wait_for(asyncio.gather(*readers), 5)
    assert [states[-1] for states in ended] == ["completed", "completed"]
