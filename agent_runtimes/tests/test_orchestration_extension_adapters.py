# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The adapters, over a worker that speaks the orchestration extension (ORCHESTRATOR.md, O2-05).

A worker that declares the Datalayer orchestration extension — on its A2A
agent card, or in its ACP capabilities at initialize — is resolved with
steering, pause and resume. Its delegation names the execution, and the
checkpoint when the attempt resumes; a pause is asked of it and comes back on
its stream as the checkpoint it kept; and an attempt that resumes starts by
resuming. A worker that does not declare it keeps every refusal, and one that
no longer declares it is not sent an attempt it could only start over.
"""

from __future__ import annotations

from typing import Any

import pytest
from acp.schema import AgentCapabilities
from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    ErrorCode,
    Execution,
    ExecutionEventType,
    ExecutionState,
    LifecycleEvent,
    WorkerOperation,
)

from agent_runtimes.context.delegation import EXTENSION_URI
from agent_runtimes.orchestration import InMemoryExecutionStore, ResolvedWorker
from agent_runtimes.orchestration.adapter import (
    EXTENSION_OPERATIONS,
    Observation,
    Performed,
    Unsupported,
    WorkerAdapter,
    capability_report,
    recorded_capabilities,
)
from agent_runtimes.orchestration.adapters import a2a as a2a_binding
from agent_runtimes.orchestration.adapters.a2a import (
    A2A_CAPABILITIES,
    A2A_EXTENDED_CAPABILITIES,
    A2AWorkerAdapter,
)
from agent_runtimes.orchestration.adapters.acp import (
    ACP_CAPABILITIES,
    ACP_EXTENDED_CAPABILITIES,
)
from agent_runtimes.subagents.a2a import A2ARemoteAgent
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution
from agent_runtimes.tests.test_orchestration_acp_adapter import (
    ENDPOINT,
    SPEC_UPDATES,
    FakeChannel,
)
from agent_runtimes.tests.test_orchestration_acp_adapter import (
    _adapter as acp_adapter,
)

WORKER = "http://worker.test/api/v1/a2a/agents/validator"
ROUTES = {"pause": "/api/v1/a2a/pause", "steer": "/api/v1/a2a/steer"}
PAUSED = {"datalayer": {"paused": {"checkpointId": "ckpt_1"}}}


def _card(params: dict[str, Any] | None = None) -> dict[str, Any]:
    """An agent card declaring the extension, with its routes."""
    return {
        "name": "validator",
        "capabilities": {
            "streaming": True,
            "extensions": [
                {
                    "uri": EXTENSION_URI,
                    "required": False,
                    "params": ROUTES if params is None else params,
                }
            ],
        },
    }


def _a2a_worker(card: dict[str, Any] | None) -> ResolvedWorker:
    """An A2A worker as ``resolve`` returns it, for the card it serves."""
    remote = A2ARemoteAgent(
        name="validator", url=WORKER, launch="remote", card=card, token="tok"
    )
    return ResolvedWorker(
        binding=an_execution().agent,
        capabilities=A2A_EXTENDED_CAPABILITIES if card else A2A_CAPABILITIES,
        endpoint=WORKER,
        details=remote.describe(),
        handle=remote,
    )


def _acp_worker(*, extended: bool) -> ResolvedWorker:
    """An ACP agent as ``resolve`` returns it."""
    return ResolvedWorker(
        binding=AgentBinding(
            agent_id="coder",
            capability="notebook.validate",
            protocol=AgentProtocol.ACP,
            endpoint=ENDPOINT,
        ),
        capabilities=ACP_EXTENDED_CAPABILITIES if extended else ACP_CAPABILITIES,
        endpoint=ENDPOINT,
        details={"loadSession": True, "sessionFork": False},
    )


def _relay(
    monkeypatch: pytest.MonkeyPatch,
    script: list[tuple[str, dict[str, Any]]],
    *,
    raises: Exception | None = None,
) -> list[dict[str, Any] | None]:
    """Stand in for the A2A relay; answer what the delegation carried."""
    sent: list[dict[str, Any] | None] = []

    async def relay_a2a_task(remote, task, *, context_id, emit, metadata=None):
        sent.append(metadata)
        for phase, payload in script:
            emit(phase, **payload)
        if raises is not None:
            raise raises
        return "The notebook runs clean."

    async def get_task(self, remote, task_id):
        return None

    monkeypatch.setattr(a2a_binding, "relay_a2a_task", relay_a2a_task)
    monkeypatch.setattr(A2AWorkerAdapter, "_get_task", get_task)
    return sent


def _posts(
    monkeypatch: pytest.MonkeyPatch, answer: dict[str, Any] | None = None
) -> list[tuple[str, dict[str, Any]]]:
    """Stand in for the posts to the extension's routes; answer what was posted."""
    posted: list[tuple[str, dict[str, Any]]] = []

    async def post_extension(self, remote, route, body):
        posted.append((route, dict(body)))
        return answer if answer is not None else {"success": True, "message": "Taken"}

    monkeypatch.setattr(A2AWorkerAdapter, "_post_extension", post_extension)
    return posted


async def _dispatch(
    adapter: WorkerAdapter,
    worker: ResolvedWorker,
    store: InMemoryExecutionStore,
    execution: Execution,
    attempt: Any,
) -> list[Observation]:
    """One dispatch through the store, as the durable worker records it."""
    observations = []
    async for observation in adapter.dispatch(worker, execution, attempt):
        observations.append(observation)
        await store.record(
            execution.execution_id, observation, attempt_id=attempt.attempt_id
        )
    return observations


async def _paused(store: InMemoryExecutionStore, execution: Execution) -> Any:
    """The execution paused at ``ckpt_1`` by its first attempt, and the attempt resuming it."""
    first = await store.record_attempt(an_attempt(execution))
    for event in (LifecycleEvent.ASSIGN, LifecycleEvent.START, LifecycleEvent.PAUSE):
        await store.set_state(execution.execution_id, event, attempt_id=first.attempt_id)
    return await store.record_attempt(
        an_attempt(execution, attempt_id="att_2", number=2, resumed_from="ckpt_1")
    )


def _states(events: list[Any]) -> list[ExecutionState]:
    return [event.state for event in events if event.type is ExecutionEventType.STATE_CHANGED]


# ---------------------------------------------------------------------------
# What the extension adds to a report
# ---------------------------------------------------------------------------


class TestTheReport:
    def test_the_extension_adds_the_same_to_either_protocol(self):
        for extended, plain in (
            (A2A_EXTENDED_CAPABILITIES, A2A_CAPABILITIES),
            (ACP_EXTENDED_CAPABILITIES, ACP_CAPABILITIES),
        ):
            assert EXTENSION_OPERATIONS <= extended.supported
            assert not extended.supports(WorkerOperation.CHECKPOINT)
            assert "as it pauses" in extended.refusal(WorkerOperation.CHECKPOINT).reason
            assert AcknowledgementKind.CHECKPOINTED in extended.acknowledgements
            assert AcknowledgementKind.CHECKPOINTED not in plain.acknowledgements
            assert (extended.extensions, plain.extensions) == ((EXTENSION_URI,), ())
            assert not any("'checkpointed'" in reduction for reduction in extended.reductions)
            assert extended.to_wire()["extensions"] == [EXTENSION_URI]

    @pytest.mark.asyncio
    async def test_the_report_a_dispatch_recorded_is_read_back(self):
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution())
        assert recorded_capabilities(await store.events(execution.execution_id)) is None
        await store.record(execution.execution_id, capability_report(A2A_CAPABILITIES))
        await store.record(execution.execution_id, capability_report(A2A_EXTENDED_CAPABILITIES))
        await store.record(execution.execution_id, Observation.progress("Working."))
        report = recorded_capabilities(await store.events(execution.execution_id))
        assert report is not None and report["extensions"] == [EXTENSION_URI]
        assert "pause" in report["supported"]

    def test_only_a_checkpointed_milestone_names_a_checkpoint(self):
        with pytest.raises(ValueError, match="checkpointed"):
            Observation.acknowledged(AcknowledgementKind.STARTED, checkpoint_id="ckpt_1")


# ---------------------------------------------------------------------------
# A2A
# ---------------------------------------------------------------------------


class TestAnA2AWorkerSpeakingTheExtension:
    @pytest.mark.asyncio
    async def test_resolving_reads_the_extension_off_the_agent_card(self, monkeypatch):
        for card, expected in (
            (_card(), A2A_EXTENDED_CAPABILITIES),
            ({"name": "plain", "capabilities": {"streaming": True}}, A2A_CAPABILITIES),
            (None, A2A_CAPABILITIES),
        ):

            async def ensure_remote_agent(agent_id, description, target, card=card):
                return A2ARemoteAgent(name=agent_id, url=WORKER, launch="remote", card=card)

            monkeypatch.setattr(a2a_binding, "ensure_remote_agent", ensure_remote_agent)
            worker = await A2AWorkerAdapter().resolve(an_execution().agent)
            assert worker.capabilities == expected

    @pytest.mark.asyncio
    async def test_a_task_canceled_at_its_checkpoint_pauses_the_execution(self, monkeypatch):
        sent = _relay(
            monkeypatch,
            [
                ("status", {"taskId": "task-1", "state": "working"}),
                ("status", {"taskId": "task-1", "state": "canceled", "metadata": PAUSED}),
            ],
            raises=RuntimeError("The remote agent's task ended canceled"),
        )
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution())
        attempt = await store.record_attempt(an_attempt(execution))
        execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        observations = await _dispatch(A2AWorkerAdapter(), _a2a_worker(_card()), store, execution, attempt)

        assert (await store.get(execution.execution_id)).status is ExecutionState.PAUSED
        [kept] = [
            known
            for known in await store.acknowledgements(execution.execution_id)
            if known.kind is AcknowledgementKind.CHECKPOINTED
        ]
        assert (kept.checkpoint_id, kept.attempt_id) == ("ckpt_1", attempt.attempt_id)
        [stored] = await store.attempts(execution.execution_id)
        assert stored.state is ExecutionState.PAUSED
        assert not any(o.type is ExecutionEventType.ARTIFACT_REGISTERED for o in observations)
        # The delegation named the execution, the scope its checkpoints are kept under.
        assert sent[0] == {
            "datalayer": {"execution": {"executionId": "exec_1", "rootExecutionId": "exec_1", "depth": 0}}
        }

    @pytest.mark.asyncio
    async def test_a_plain_worker_saying_it_paused_is_cancelled(self, monkeypatch):
        sent = _relay(
            monkeypatch,
            [
                ("status", {"taskId": "task-1", "state": "working"}),
                ("status", {"taskId": "task-1", "state": "canceled", "metadata": PAUSED}),
            ],
            raises=RuntimeError("The remote agent's task ended canceled"),
        )
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution())
        attempt = await store.record_attempt(an_attempt(execution))
        execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        await _dispatch(A2AWorkerAdapter(), _a2a_worker(None), store, execution, attempt)

        assert (await store.get(execution.execution_id)).status is ExecutionState.CANCELLED
        assert sent == [None]

    @pytest.mark.asyncio
    async def test_a_resumed_attempt_names_its_checkpoint_and_resumes_the_execution(self, monkeypatch):
        sent = _relay(
            monkeypatch,
            [
                ("status", {"taskId": "task-2", "state": "working"}),
                ("status", {"taskId": "task-2", "state": "completed"}),
            ],
        )
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution())
        attempt = await _paused(store, execution)

        await _dispatch(A2AWorkerAdapter(), _a2a_worker(_card()), store, await store.get("exec_1"), attempt)

        assert sent[0]["datalayer"]["checkpoint"] == {"checkpointId": "ckpt_1"}
        events = await store.events(execution.execution_id)
        assert _states(events)[-3:] == [ExecutionState.PAUSED, ExecutionState.RUNNING, ExecutionState.COMPLETED]
        assert not [event for event in events if event.error is not None]

    @pytest.mark.asyncio
    async def test_a_resumed_attempt_is_not_sent_to_a_worker_without_the_extension(self, monkeypatch):
        sent = _relay(monkeypatch, [])
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution())
        attempt = await _paused(store, execution)

        await _dispatch(A2AWorkerAdapter(), _a2a_worker(None), store, await store.get("exec_1"), attempt)

        assert sent == []
        failed = await store.get(execution.execution_id)
        assert failed.status is ExecutionState.FAILED
        assert failed.error.code is ErrorCode.UNSUPPORTED_OPERATION and "ckpt_1" in failed.error.message

    @pytest.mark.asyncio
    async def test_pausing_and_steering_post_to_the_cards_routes_on_the_workers_origin(self, monkeypatch):
        posted = _posts(monkeypatch)
        execution = an_execution()
        attempt = an_attempt(execution, protocol_task_id="task-1")
        adapter, worker = A2AWorkerAdapter(), _a2a_worker(_card())

        paused = await adapter.pause(worker, execution, attempt)
        steered = await adapter.steer(worker, execution, attempt, instructions="Check the plots")

        assert posted == [
            ("http://worker.test/api/v1/a2a/pause", {"task_id": "task-1"}),
            ("http://worker.test/api/v1/a2a/steer", {"task_id": "task-1", "instructions": "Check the plots"}),
        ]
        assert isinstance(paused, Performed) and paused.operation is WorkerOperation.PAUSE
        assert isinstance(steered, Performed) and steered.operation is WorkerOperation.STEER

    @pytest.mark.asyncio
    async def test_a_route_the_card_points_elsewhere_is_not_followed(self, monkeypatch):
        posted = _posts(monkeypatch)
        execution = an_execution()
        attempt = an_attempt(execution, protocol_task_id="task-1")
        card = _card({"pause": "https://elsewhere.test/pause", "steer": "//elsewhere.test/steer"})

        paused = await A2AWorkerAdapter().pause(_a2a_worker(card), execution, attempt)
        steered = await A2AWorkerAdapter().steer(_a2a_worker(card), execution, attempt, instructions="x")

        assert posted == []
        for outcome in (paused, steered):
            assert isinstance(outcome, Unsupported) and "own origin" in outcome.reason

    @pytest.mark.asyncio
    async def test_a_worker_that_does_not_take_the_pause_says_so(self, monkeypatch):
        _posts(monkeypatch, {"success": False, "message": "Task task-1 not found or already completed"})
        execution = an_execution()

        outcome = await A2AWorkerAdapter().pause(
            _a2a_worker(_card()), execution, an_attempt(execution, protocol_task_id="task-1")
        )

        assert isinstance(outcome, Performed)
        assert outcome.detail == "The worker did not take the pause: Task task-1 not found or already completed"

    @pytest.mark.asyncio
    async def test_a_task_not_yet_named_is_not_asked(self, monkeypatch):
        posted = _posts(monkeypatch)
        execution = an_execution()

        outcome = await A2AWorkerAdapter().pause(_a2a_worker(_card()), execution, an_attempt(execution))

        assert posted == [] and isinstance(outcome, Unsupported) and "no A2A task yet" in outcome.reason

    @pytest.mark.asyncio
    async def test_a_plain_worker_is_refused_pause_resume_and_steer(self, monkeypatch):
        posted = _posts(monkeypatch)
        execution = an_execution()
        attempt = an_attempt(execution, protocol_task_id="task-1")
        adapter, worker = A2AWorkerAdapter(), _a2a_worker(None)

        outcomes = [
            await adapter.pause(worker, execution, attempt),
            await adapter.resume(worker, execution, attempt, checkpoint_id="ckpt_1"),
            await adapter.steer(worker, execution, attempt, instructions="x"),
        ]

        assert posted == []
        for outcome in outcomes:
            assert isinstance(outcome, Unsupported)
            assert outcome.as_error().code is ErrorCode.UNSUPPORTED_OPERATION

    @pytest.mark.asyncio
    async def test_resuming_says_how_and_needs_a_checkpoint(self):
        execution = an_execution()
        attempt = an_attempt(execution, protocol_task_id="task-1")
        adapter, worker = A2AWorkerAdapter(), _a2a_worker(_card())

        resumed = await adapter.resume(worker, execution, attempt, checkpoint_id="ckpt_1")
        nothing = await adapter.resume(worker, execution, attempt)

        assert isinstance(resumed, Performed) and "a new A2A task" in resumed.detail and "ckpt_1" in resumed.detail
        assert isinstance(nothing, Unsupported) and "none is known" in nothing.reason

    @pytest.mark.asyncio
    async def test_re_attaching_to_a_paused_task_reads_the_pause(self, monkeypatch):
        task = {
            "id": "task-1",
            "status": {"state": "canceled", "message": {"role": "agent", "parts": [], "metadata": PAUSED}},
        }

        async def get_task(self, remote, task_id):
            return task

        monkeypatch.setattr(A2AWorkerAdapter, "_get_task", get_task)
        execution = an_execution()

        observations = [
            observation
            async for observation in A2AWorkerAdapter().subscribe(
                _a2a_worker(_card()), execution, an_attempt(execution, protocol_task_id="task-1")
            )
        ]

        assert [o.lifecycle_event for o in observations if o.type is ExecutionEventType.STATE_CHANGED] == [
            LifecycleEvent.PAUSE
        ]
        assert [o.checkpoint_id for o in observations if o.acknowledgement is AcknowledgementKind.CHECKPOINTED] == [
            "ckpt_1"
        ]


# ---------------------------------------------------------------------------
# ACP
# ---------------------------------------------------------------------------


class PausingChannel(FakeChannel):
    """A scripted connection whose prompt answers with ``_meta``, as a paused turn does."""

    def __init__(self, *, meta: dict[str, Any] | None = None, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self.meta = meta

    async def request(self, method, params):
        answer = await super().request(method, params)
        if method == "session/prompt" and self.meta is not None:
            return {**(answer or {}), "_meta": self.meta}
        return answer


def _prompted(channel: FakeChannel) -> dict[str, Any]:
    [params] = [params for method, params in channel.requests if method == "session/prompt"]
    return params


class TestAnACPAgentSpeakingTheExtension:
    @pytest.mark.asyncio
    async def test_resolving_reads_the_extension_from_initialize(self):
        binding = _acp_worker(extended=False).binding
        declared = AgentCapabilities.model_validate(
            {"loadSession": True, "_meta": {"datalayer": {"extensions": [EXTENSION_URI]}}}
        )

        worker = await acp_adapter(FakeChannel(capabilities=declared)).resolve(binding)
        plain = await acp_adapter(
            FakeChannel(capabilities=AgentCapabilities.model_validate({"loadSession": True}))
        ).resolve(binding)

        assert worker.capabilities.extensions == (EXTENSION_URI,)
        assert worker.capabilities.supports(WorkerOperation.PAUSE)
        assert worker.details["extensions"] == [EXTENSION_URI]
        # Still narrowed by what else the agent declares.
        assert any("session/fork" in reduction for reduction in worker.capabilities.reductions)
        assert plain.capabilities.extensions == ()
        assert not plain.capabilities.supports(WorkerOperation.PAUSE)

    @pytest.mark.asyncio
    async def test_a_turn_cancelled_at_its_checkpoint_pauses_the_execution(self):
        channel = PausingChannel(script=SPEC_UPDATES, stop_reason="cancelled", meta=PAUSED)
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution(protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT))
        attempt = await store.record_attempt(an_attempt(execution))
        execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        observations = await _dispatch(acp_adapter(channel), _acp_worker(extended=True), store, execution, attempt)

        assert (await store.get(execution.execution_id)).status is ExecutionState.PAUSED
        assert [
            known.checkpoint_id
            for known in await store.acknowledgements(execution.execution_id)
            if known.kind is AcknowledgementKind.CHECKPOINTED
        ] == ["ckpt_1"]
        # What it had said is in the checkpoint; the attempt that resumes registers the answer.
        assert not any(o.type is ExecutionEventType.ARTIFACT_REGISTERED for o in observations)
        assert _prompted(channel)["_meta"]["datalayer"]["execution"]["executionId"] == "exec_1"

    @pytest.mark.asyncio
    async def test_a_plain_agents_cancelled_turn_is_a_cancellation(self):
        channel = PausingChannel(script=SPEC_UPDATES, stop_reason="cancelled", meta=PAUSED)
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution(protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT))
        attempt = await store.record_attempt(an_attempt(execution))
        execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        await _dispatch(acp_adapter(channel), _acp_worker(extended=False), store, execution, attempt)

        assert (await store.get(execution.execution_id)).status is ExecutionState.CANCELLED
        assert "_meta" not in _prompted(channel)

    @pytest.mark.asyncio
    async def test_a_resumed_attempt_names_its_checkpoint_and_resumes_the_execution(self):
        channel = FakeChannel(script=SPEC_UPDATES)
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution(protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT))
        attempt = await _paused(store, execution)

        await _dispatch(acp_adapter(channel), _acp_worker(extended=True), store, await store.get("exec_1"), attempt)

        assert _prompted(channel)["_meta"]["datalayer"]["checkpoint"] == {"checkpointId": "ckpt_1"}
        events = await store.events(execution.execution_id)
        assert _states(events)[-3:] == [ExecutionState.PAUSED, ExecutionState.RUNNING, ExecutionState.COMPLETED]
        assert not [event for event in events if event.error is not None]

    @pytest.mark.asyncio
    async def test_a_resumed_attempt_is_not_sent_to_an_agent_without_the_extension(self):
        channel = FakeChannel(script=SPEC_UPDATES)
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution(protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT))
        attempt = await _paused(store, execution)

        await _dispatch(acp_adapter(channel), _acp_worker(extended=False), store, await store.get("exec_1"), attempt)

        assert channel.requests == []
        assert (await store.get(execution.execution_id)).status is ExecutionState.FAILED

    @pytest.mark.asyncio
    async def test_pausing_asks_the_turn_for_a_checkpoint(self):
        channel = FakeChannel()
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        outcome = await acp_adapter(channel).pause(
            _acp_worker(extended=True), execution, an_attempt(execution, session_id="sess-1")
        )

        assert channel.notifications == [
            ("session/cancel", {"sessionId": "sess-1", "_meta": {"datalayer": {"pause": True}}})
        ]
        assert isinstance(outcome, Performed) and outcome.operation is WorkerOperation.PAUSE

    @pytest.mark.asyncio
    async def test_steering_reaches_the_running_turn(self):
        channel = FakeChannel()
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        outcome = await acp_adapter(channel).steer(
            _acp_worker(extended=True),
            execution,
            an_attempt(execution, session_id="sess-1"),
            instructions="Check the plots",
        )

        assert channel.notifications == [
            ("_datalayer/steer", {"sessionId": "sess-1", "instructions": "Check the plots"})
        ]
        assert channel.requests == [] and isinstance(outcome, Performed)

    @pytest.mark.asyncio
    async def test_a_plain_agent_is_refused_pause_and_resume(self):
        channel = FakeChannel()
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)
        attempt = an_attempt(execution, session_id="sess-1")
        adapter, worker = acp_adapter(channel), _acp_worker(extended=False)

        outcomes = [
            await adapter.pause(worker, execution, attempt),
            await adapter.resume(worker, execution, attempt, checkpoint_id="ckpt_1"),
        ]

        assert channel.notifications == []
        assert all(isinstance(outcome, Unsupported) for outcome in outcomes)
