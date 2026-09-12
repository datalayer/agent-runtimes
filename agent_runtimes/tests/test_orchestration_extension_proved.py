# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Proved over both protocols: paused before a restart, resumed from the checkpoint (ORCHESTRATOR.md, O2-05).

Nothing is stood in for between the adapters and the model. agent-runtimes'
own A2A and ACP routes are served on a socket, in front of a pydantic-ai agent
behind ``PydanticAIAdapter`` whose model is a function, over a protocol state
store in a SQLite file. The adapters are driven as the durable worker drives
them: what they observe is recorded in an execution store, and a resume is an
attempt recorded naming the checkpoint. Between the pause and the resume the
runtime is stopped and another started over the same file, keeping nothing of
the first in memory. A steer sent while the model's tool call runs reaches
the model's next request.
"""

from __future__ import annotations

import asyncio
import socket
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Iterator

import pytest
import uvicorn
from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentProtocol,
    Attempt,
    Execution,
    ExecutionEventType,
    ExecutionState,
    LifecycleEvent,
    WorkerOperation,
)
from fastapi import FastAPI
from pydantic_ai import Agent
from pydantic_ai.messages import TextPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, DeltaToolCall, FunctionModel
from starlette.routing import Mount

from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
from agent_runtimes.context import delegation
from agent_runtimes.orchestration import InMemoryExecutionStore
from agent_runtimes.orchestration.adapter import (
    Performed,
    ResolvedWorker,
    WorkerAdapter,
    objective_prompt,
)
from agent_runtimes.orchestration.adapters.a2a import A2AWorkerAdapter
from agent_runtimes.orchestration.adapters.acp import ACPWorkerAdapter
from agent_runtimes.protocol_state.store import (
    SqliteProtocolStateStore,
    use_protocol_state_store,
)
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.routes import acp as acp_routes
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution

AGENT = "profiler"
PROTOCOLS = (AgentProtocol.A2A, AgentProtocol.ACP)


@dataclass
class Model:
    """The agent's model: says what it is doing, calls a tool that waits at a gate, then answers.

    What each of its requests was given is kept.
    """

    requests: list[list[Any]] = field(default_factory=list)
    reached: asyncio.Event = field(default_factory=asyncio.Event)
    gate: asyncio.Event = field(default_factory=asyncio.Event)

    def adapter(self) -> PydanticAIAdapter:
        async def stream(messages: list[Any], info: AgentInfo) -> AsyncIterator[Any]:
            self.requests.append(list(messages))
            if len(self.requests) == 1:
                yield "Reading the cells. "
                yield {0: DeltaToolCall(name="read_cells", json_args="{}")}
            else:
                yield "The notebook profiles cleanly."

        agent = Agent(FunctionModel(stream_function=stream))

        @agent.tool_plain
        async def read_cells() -> str:
            self.reached.set()
            await self.gate.wait()
            return "12 cells"

        return PydanticAIAdapter(agent, name=AGENT)


class Runtime:
    """One process of agent-runtimes: the A2A and ACP routes on a socket, over one state file.

    It starts with its store and nothing else of a process before it: the
    delegations' in-memory state is gone, and the agent is registered anew.
    """

    def __init__(self, path: Path, model: Model, port: int) -> None:
        self.path, self.model, self.port = path, model, port

    async def __aenter__(self) -> "Runtime":
        use_protocol_state_store(SqliteProtocolStateStore(self.path))
        for kept in (delegation._held, delegation._pauses, delegation._steers):
            kept.clear()
        agent = self.model.adapter()
        a2a_routes.register_a2a_agent(
            agent,
            a2a_routes.A2AAgentCard(
                id=AGENT, name=AGENT, description="Profiles notebooks", url=endpoint(AgentProtocol.A2A, self.port)
            ),
        )
        acp_routes.register_agent(agent, acp_routes.AgentInfo(id=AGENT, name=AGENT))

        @asynccontextmanager
        async def lifespan(app: FastAPI) -> AsyncIterator[None]:
            await a2a_routes.start_a2a_task_managers()
            try:
                yield
            finally:
                await a2a_routes.stop_a2a_task_managers()

        app = FastAPI(lifespan=lifespan)
        app.include_router(a2a_routes.router, prefix="/api/v1")
        app.include_router(acp_routes.router, prefix="/api/v1")
        for mount in a2a_routes.get_a2a_mounts():
            app.routes.append(Mount(f"/api/v1/a2a/agents{mount.path}", app=mount.app))
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=self.port, log_level="warning"))
        self.serving = asyncio.create_task(self.server.serve())
        while not self.server.started:
            if self.serving.done():
                await self.serving
            await asyncio.sleep(0.02)
        return self

    async def __aexit__(self, *exc: Any) -> None:
        self.server.should_exit = True
        await self.serving
        a2a_routes.unregister_a2a_agent(AGENT)
        acp_routes._agents.pop(AGENT, None)
        acp_routes._adapters.pop(AGENT, None)


def endpoint(protocol: AgentProtocol, port: int) -> str:
    if protocol is AgentProtocol.A2A:
        return f"http://127.0.0.1:{port}/api/v1/a2a/agents/{AGENT}"
    return f"ws://127.0.0.1:{port}/api/v1/acp/ws/{AGENT}"


def _adapter(protocol: AgentProtocol) -> WorkerAdapter:
    return A2AWorkerAdapter() if protocol is AgentProtocol.A2A else ACPWorkerAdapter()


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _said(messages: list[Any]) -> list[tuple[str, str]]:
    """Each thing the model was given, as who said it and what."""
    said: list[tuple[str, str]] = []
    for message in messages:
        for part in message.parts:
            if isinstance(part, UserPromptPart):
                said.append(("user", str(part.content)))
            elif isinstance(part, TextPart):
                said.append(("assistant", part.content))
    return said


async def _watch(
    adapter: WorkerAdapter, worker: ResolvedWorker, store: InMemoryExecutionStore, execution: Execution, attempt: Attempt
) -> None:
    """The dispatch, recorded observation by observation, as the durable worker records it."""
    async for observation in adapter.dispatch(worker, execution, attempt):
        await store.record(execution.execution_id, observation, attempt_id=attempt.attempt_id)


async def _named(store: InMemoryExecutionStore, attempt: Attempt) -> Attempt:
    """The attempt once the worker has named its task or session."""
    for _ in range(500):
        [latest] = [one for one in await store.attempts(attempt.execution_id) if one.attempt_id == attempt.attempt_id]
        if latest.protocol_task_id or latest.session_id:
            return latest
        await asyncio.sleep(0.01)
    raise AssertionError("the worker never named the attempt's task or session")


@pytest.fixture
def isolated(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Routes registered on no app of another test, and the process's store put back after.

    No credential of the shell's either: the adapters call with the caller's
    key, and a route handed a real one sets up the process-wide telemetry that
    exports its turns, which every later test in the session then inherits.
    """
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    app = a2a_routes._app
    a2a_routes.set_a2a_app(None)
    yield
    a2a_routes.set_a2a_app(app)
    use_protocol_state_store(None)
    for kept in (delegation._held, delegation._pauses, delegation._steers):
        kept.clear()


@pytest.mark.asyncio
@pytest.mark.parametrize("protocol", PROTOCOLS, ids=lambda protocol: protocol.value)
async def test_paused_before_a_restart_it_resumes_from_its_checkpoint(
    protocol: AgentProtocol, tmp_path: Path, isolated: None
) -> None:
    port, path, store = _free_port(), tmp_path / "state.sqlite", InMemoryExecutionStore()
    execution = await store.create(
        an_execution(protocol=protocol, agent_id=AGENT, endpoint=endpoint(protocol, port), references=())
    )
    attempt = await store.record_attempt(an_attempt(execution))
    execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

    first = Model()
    async with Runtime(path, first, port):
        adapter = _adapter(protocol)
        worker = await adapter.resolve(execution.agent)
        assert worker.capabilities.supports(WorkerOperation.PAUSE)
        watching = asyncio.create_task(_watch(adapter, worker, store, execution, attempt))
        await asyncio.wait_for(first.reached.wait(), 10)
        asked = await adapter.pause(worker, execution, await _named(store, attempt))
        assert isinstance(asked, Performed), asked
        first.gate.set()
        await asyncio.wait_for(watching, 10)

    paused = await store.get(execution.execution_id)
    assert paused.status is ExecutionState.PAUSED
    [checkpoint_id] = [
        known.checkpoint_id
        for known in await store.acknowledgements(execution.execution_id)
        if known.kind is AcknowledgementKind.CHECKPOINTED
    ]

    second = Model()
    second.gate.set()
    async with Runtime(path, second, port):
        adapter = _adapter(protocol)
        worker = await adapter.resolve(paused.agent)
        resumed = await store.record_attempt(
            an_attempt(paused, attempt_id="att_2", number=2, resumed_from=checkpoint_id)
        )
        await asyncio.wait_for(_watch(adapter, worker, store, paused, resumed), 10)

    assert (await store.get(execution.execution_id)).status is ExecutionState.COMPLETED
    events = await store.events(execution.execution_id)
    assert [event.state for event in events if event.type is ExecutionEventType.STATE_CHANGED] == [
        ExecutionState.CREATED, ExecutionState.ASSIGNED, ExecutionState.RUNNING,
        ExecutionState.PAUSED, ExecutionState.RUNNING, ExecutionState.COMPLETED,
    ]
    # The restarted runtime's model was given the conversation kept at the
    # pause, then the prompt to carry on — once.
    said = _said(second.requests[0])
    assert said[:2] == [("user", objective_prompt(execution)), ("assistant", "Reading the cells. ")]
    assert said[2:] == [("user", objective_prompt(execution, resumed))]


@pytest.mark.asyncio
@pytest.mark.parametrize("protocol", PROTOCOLS, ids=lambda protocol: protocol.value)
async def test_a_steer_sent_while_it_works_reaches_its_model_within_the_turn(
    protocol: AgentProtocol, tmp_path: Path, isolated: None
) -> None:
    port, store = _free_port(), InMemoryExecutionStore()
    execution = await store.create(
        an_execution(protocol=protocol, agent_id=AGENT, endpoint=endpoint(protocol, port), references=())
    )
    attempt = await store.record_attempt(an_attempt(execution))
    execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

    model = Model()
    async with Runtime(tmp_path / "state.sqlite", model, port):
        adapter = _adapter(protocol)
        worker = await adapter.resolve(execution.agent)
        watching = asyncio.create_task(_watch(adapter, worker, store, execution, attempt))
        await asyncio.wait_for(model.reached.wait(), 10)
        steered = await adapter.steer(worker, execution, await _named(store, attempt), instructions="Check the plots")
        assert isinstance(steered, Performed), steered
        # An ACP notification is not answered: the steer is in once the runtime holds it.
        for _ in range(500):
            if any(delegation._steers.values()):
                break
            await asyncio.sleep(0.01)
        model.gate.set()
        await asyncio.wait_for(watching, 10)

    assert (await store.get(execution.execution_id)).status is ExecutionState.COMPLETED
    assert ("user", "Steering from the orchestrator:\nCheck the plots") in _said(model.requests[1])
