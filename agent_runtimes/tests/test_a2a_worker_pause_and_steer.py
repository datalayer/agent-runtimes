# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Our A2A worker pauses at a checkpoint, resumes from it, and is steered while it works (ORCHESTRATOR.md, O2-05).

The worker, its durable storage and the routes of the Datalayer orchestration
extension, with a scripted agent in place of a model. Checkpoints go to the
protocol state store, here a SQLite file of the test's own.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from typing import Any

import pytest

from agent_runtimes.adapters.base import BaseAgent, StreamEvent
from agent_runtimes.checkpoints.protocol_state import ProtocolStateCheckpointStore
from agent_runtimes.context.delegation import paused_at, take_steers
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.a2a import DurableStorage
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes import a2a as a2a_routes

EXECUTION = {"executionId": "exec_1", "rootExecutionId": "exec_1"}
CONVERSATION = [
    {"role": "user", "content": "Profile the notebook"},
    {"role": "assistant", "content": "Reading the cells"},
]


@pytest.fixture
def state(tmp_path: Any, monkeypatch: Any) -> SqliteProtocolStateStore:
    store = SqliteProtocolStateStore(tmp_path / "state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    return store


def _agent(script: Callable[[str, Any], AsyncIterator[StreamEvent]]) -> BaseAgent:
    class Worker(BaseAgent):
        async def run(self, prompt: str, context: Any) -> Any:  # pragma: no cover
            raise NotImplementedError

        async def stream(self, prompt: str, context: Any):  # type: ignore[override]
            async for event in script(prompt, context):
                yield event

        def get_tools(self) -> list[Any]:
            return []

        @property
        def name(self) -> str:
            return "worker"

        @property
        def description(self) -> str:
            return "A worker speaking the extension"

        @property
        def version(self) -> str:
            return "0.0.0"

    return Worker()


def _message(text: str, **datalayer: Any) -> dict[str, Any]:
    return {
        "role": "user",
        "parts": [{"text": text}],
        "message_id": f"m-{text[:8]}",
        "context_id": "ctx-1",
        "metadata": {"datalayer": {"execution": EXECUTION, **datalayer}},
    }


async def _run(
    state: SqliteProtocolStateStore,
    agent: BaseAgent,
    message: dict[str, Any],
    during: Callable[[str], Any] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    from fasta2a.broker import InMemoryBroker

    from agent_runtimes.transports.a2a import A2AWorker, TaskCancellation

    storage = DurableStorage(state, "agent-1")
    broker = InMemoryBroker()
    worker = A2AWorker(
        broker=broker,
        storage=storage,
        agent=agent,
        cancellation=TaskCancellation(
            register=a2a_routes.register_task, unregister=a2a_routes.unregister_task, cancel=a2a_routes.cancel_task
        ),
    )
    task = await storage.submit_task("ctx-1", message)  # type: ignore[arg-type]
    events: list[dict[str, Any]] = []
    async with broker, worker.run():
        async with broker.event_bus.subscribe(task["id"]) as receive:
            await broker.run_task({"id": task["id"], "context_id": "ctx-1", "message": message})  # type: ignore[arg-type]
            # Beside the reading, not before it: the worker waits on a reader
            # for each event it publishes.
            helper = asyncio.create_task(during(task["id"])) if during is not None else None
            async for event in receive:
                events.append(event)
            if helper is not None:
                await asyncio.wait_for(helper, 5)
    return task["id"], events


def _final_status(events: list[dict[str, Any]]) -> dict[str, Any]:
    return [event for event in events if "status_update" in event][-1]["status_update"]["status"]


@pytest.mark.asyncio
async def test_a_paused_task_keeps_its_conversation_and_names_the_checkpoint(state: Any) -> None:
    reached, go = asyncio.Event(), asyncio.Event()

    async def script(prompt: str, context: Any) -> AsyncIterator[StreamEvent]:
        yield StreamEvent(type="text", data="Reading the cells")
        reached.set()
        await go.wait()
        yield StreamEvent(type="text", data=", and more")
        yield StreamEvent(type="output", data="Never reached")

    async def pause(task_id: str) -> None:
        await reached.wait()
        answer = await a2a_routes.pause_task(a2a_routes.PauseRequest(task_id=task_id))
        assert answer.success
        go.set()

    _, events = await _run(state, _agent(script), _message("Profile the notebook"), during=pause)
    final = _final_status(events)
    assert final["state"] == "canceled"
    checkpoint_id = paused_at(final["message"]["metadata"])
    assert checkpoint_id
    checkpoint = await ProtocolStateCheckpointStore("exec_1").get(checkpoint_id)
    assert checkpoint is not None and checkpoint.messages == CONVERSATION


@pytest.mark.asyncio
async def test_a_delegation_naming_the_checkpoint_resumes_from_it(state: Any) -> None:
    kept = await ProtocolStateCheckpointStore("exec_1").create_checkpoint("paused", turn=2, messages=CONVERSATION)
    seen: dict[str, Any] = {}

    async def script(prompt: str, context: Any) -> AsyncIterator[StreamEvent]:
        seen["history"], seen["prompt"] = context.conversation_history, prompt
        yield StreamEvent(type="output", data="Done")
        yield StreamEvent(type="done", data=None)

    _, events = await _run(state, _agent(script), _message("Carry on", checkpoint={"checkpointId": kept.id}))
    assert _final_status(events)["state"] == "completed"
    assert (seen["history"], seen["prompt"]) == (CONVERSATION, "Carry on")


@pytest.mark.asyncio
async def test_a_checkpoint_this_runtime_does_not_keep_fails_the_task(state: Any) -> None:
    async def script(prompt: str, context: Any) -> AsyncIterator[StreamEvent]:  # pragma: no cover
        yield StreamEvent(type="output", data="Never reached")

    _, events = await _run(state, _agent(script), _message("Carry on", checkpoint={"checkpointId": "ckpt_nowhere"}))
    assert _final_status(events)["state"] == "failed"


@pytest.mark.asyncio
async def test_a_working_task_is_steered_and_a_finished_one_is_not(state: Any) -> None:
    during_the_run: dict[str, Any] = {}

    async def script(prompt: str, context: Any) -> AsyncIterator[StreamEvent]:
        task_id = context.metadata["a2a"]["task_id"]
        answer = await a2a_routes.steer_task(a2a_routes.SteerRequest(task_id=task_id, instructions="Check the plots"))
        during_the_run["delivered"] = answer.success
        # What the model's next request would be given (`SteerCapability`).
        during_the_run["taken"] = take_steers(context.metadata["steer_run"])
        yield StreamEvent(type="output", data="Done")
        yield StreamEvent(type="done", data=None)

    task_id, _ = await _run(state, _agent(script), _message("Profile the notebook"))
    after = await a2a_routes.steer_task(a2a_routes.SteerRequest(task_id=task_id, instructions="Too late"))
    assert during_the_run == {"delivered": True, "taken": ["Check the plots"]}
    assert after.success is False


def test_the_agent_card_advertises_the_extension_and_its_routes(state: Any) -> None:
    """What the card is built from; serving it needs the mounted app's lifespan."""
    from agent_runtimes.context.delegation import EXTENSION_URI

    async def script(prompt: str, context: Any) -> AsyncIterator[StreamEvent]:  # pragma: no cover
        yield StreamEvent(type="done", data=None)

    a2a_routes.register_a2a_agent(
        _agent(script),
        a2a_routes.A2AAgentCard(
            id="card-agent", name="Card agent", description="Speaks the extension", url="/api/v1/a2a/agents/card-agent"
        ),
    )
    try:
        extensions = list(a2a_routes._a2a_agents["card-agent"].app.extensions)
    finally:
        a2a_routes.unregister_a2a_agent("card-agent")
    [extension] = [one for one in extensions if one.get("uri") == EXTENSION_URI]
    assert extension["params"] == {"pause": "/api/v1/a2a/pause", "steer": "/api/v1/a2a/steer"}
    assert extension.get("required") is False
