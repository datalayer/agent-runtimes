# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the A2A binding (PLAN_ORCHESTRATOR.md, sections 7.1, O0-06).

A worker that has never heard of Datalayer runs an execution to completion,
its artifacts are registered, the parent's ``agent.subagent`` events keep
arriving, and the guarantees it does not give are on the execution rather
than in a docstring. The relay is stood in for, because what is under test
is the mapping, not ``httpx``.
"""

from __future__ import annotations

from typing import Any

import pytest
from datalayer_core.orchestration import (
    AcknowledgementKind,
    ErrorCode,
    ExecutionEventType,
    ExecutionState,
    LifecycleEvent,
    Usage,
    WorkerOperation,
)

from agent_runtimes.orchestration import InMemoryExecutionStore, ResolvedWorker
from agent_runtimes.orchestration.adapters import a2a as binding
from agent_runtimes.orchestration.adapters.a2a import A2A_CAPABILITIES, A2AWorkerAdapter
from agent_runtimes.subagents.a2a import A2ARemoteAgent
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution

#: A stream from a worker that took the task, worked, and answered.
GOOD_RUN = [
    ("status", {"taskId": "task-1", "state": "submitted"}),
    ("status", {"taskId": "task-1", "state": "working"}),
    ("text", {"text": "Running the notebook."}),
    ("tool_call", {"toolName": "execute_cell", "toolArgs": {"index": 1}}),
    ("status", {"taskId": "task-1", "state": "working"}),
    ("status", {"taskId": "task-1", "state": "completed"}),
]


def _worker() -> ResolvedWorker:
    """
    A worker as ``resolve`` would have returned it.

    Returns
    -------
    ResolvedWorker
        The worker, with the A2A handle the adapter needs.
    """
    remote = A2ARemoteAgent(
        name="notebook-validator",
        url="http://worker.test/api/v1/a2a/agents/validator",
        launch="remote",
    )
    return ResolvedWorker(
        binding=an_execution().agent,
        capabilities=A2A_CAPABILITIES,
        endpoint=remote.url,
        details=remote.describe(),
        handle=remote,
    )


def _relay(
    monkeypatch: pytest.MonkeyPatch,
    script: list[tuple[str, dict[str, Any]]],
    *,
    answer: str = "The notebook runs clean.",
    raises: Exception | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """
    Stand in for the shared relay, replaying a script through ``emit``.

    Parameters
    ----------
    monkeypatch : pytest.MonkeyPatch
        The patcher.
    script : list[tuple[str, dict[str, Any]]]
        The phases the worker's stream produces.
    answer : str
        What the relay returns when it returns.
    raises : Exception | None
        What it raises instead, as it does on a terminal failure.

    Returns
    -------
    list[tuple[str, dict[str, Any]]]
        Where the objective and the context id are recorded, for assertions.
    """
    sent: list[tuple[str, dict[str, Any]]] = []

    async def relay_a2a_task(remote, task, *, context_id, emit, metadata=None):
        """
        Replay the script, then answer or fail as the worker did.

        Parameters
        ----------
        remote : A2ARemoteAgent
            The worker.
        task : str
            The objective, as text.
        context_id : str
            The A2A context the task belongs to.
        emit : Callable[..., None]
            Where phases are republished.

        Returns
        -------
        str
            The worker's answer.
        """
        sent.append(("task", {"text": task, "contextId": context_id}))
        for phase, payload in script:
            emit(phase, **payload)
        if raises is not None:
            raise raises
        return answer

    monkeypatch.setattr(binding, "relay_a2a_task", relay_a2a_task)
    return sent


def _no_task_lookup(
    monkeypatch: pytest.MonkeyPatch, task: dict[str, Any] | None = None
):
    """
    Answer ``tasks/get`` without a network.

    Parameters
    ----------
    monkeypatch : pytest.MonkeyPatch
        The patcher.
    task : dict[str, Any] | None
        The task to answer with; ``None`` for a worker that registered none.
    """

    async def get_task(self, remote, task_id):
        """
        Answer with the task under test.

        Parameters
        ----------
        self : A2AWorkerAdapter
            The adapter.
        remote : A2ARemoteAgent
            The worker.
        task_id : str | None
            The task asked about.

        Returns
        -------
        dict[str, Any] | None
            The task.
        """
        return task

    monkeypatch.setattr(A2AWorkerAdapter, "_get_task", get_task)


async def _dispatch(adapter: A2AWorkerAdapter, store: InMemoryExecutionStore):
    """
    Run one dispatch through the store, as a control plane would.

    Parameters
    ----------
    adapter : A2AWorkerAdapter
        The adapter under test.
    store : InMemoryExecutionStore
        Where the observations are recorded.

    Returns
    -------
    tuple
        The execution, its attempt, and the observations seen.
    """
    execution = await store.create(an_execution())
    attempt = await store.record_attempt(an_attempt(execution))
    # Choosing a worker is the control plane's, not an observation.
    execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)
    observations = []
    async for observation in adapter.dispatch(_worker(), execution, attempt):
        observations.append(observation)
        await store.record(
            execution.execution_id, observation, attempt_id=attempt.attempt_id
        )
    return execution, attempt, observations


# ---------------------------------------------------------------------------
# A worker with no extension, running to completion
# ---------------------------------------------------------------------------


class TestDelegation:
    @pytest.mark.asyncio
    async def test_a_plain_worker_completes_an_execution(self, monkeypatch):
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(monkeypatch)
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        assert (await store.get(execution.execution_id)).status is (
            ExecutionState.COMPLETED
        )
        assert [
            milestone.kind
            for milestone in await store.acknowledgements(execution.execution_id)
        ] == [
            AcknowledgementKind.RECEIVED,
            AcknowledgementKind.STARTED,
            AcknowledgementKind.COMPLETED,
        ]

    @pytest.mark.asyncio
    async def test_the_answer_is_registered_as_an_artifact(self, monkeypatch):
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(monkeypatch)
        store = InMemoryExecutionStore()

        execution, attempt, _ = await _dispatch(A2AWorkerAdapter(), store)

        (artifact,) = await store.artifacts(execution.execution_id)
        assert artifact.summary == "The notebook runs clean."
        (provenance,) = artifact.provenance
        assert provenance.attempt_id == attempt.attempt_id

    @pytest.mark.asyncio
    async def test_the_attempt_keeps_what_the_worker_says_it_spent(self, monkeypatch):
        # O2-10: the status that ends the task says what the task spent.
        spent = {"inputTokens": 1200, "outputTokens": 340, "cost": 0.0123, "currency": "USD"}
        ended = (
            "status",
            {"taskId": "task-1", "state": "completed", "metadata": {"datalayer": {"usage": spent}}},
        )
        _relay(monkeypatch, [*GOOD_RUN[:-1], ended])
        _no_task_lookup(monkeypatch)
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        (attempt,) = await store.attempts(execution.execution_id)
        assert attempt.usage == Usage(input_tokens=1200, output_tokens=340, cost=0.0123)

    @pytest.mark.asyncio
    async def test_the_workers_own_a2a_artifacts_are_the_ones_registered(
        self, monkeypatch
    ):
        """A worker that registered artifacts keeps their names.

        Rendering its answer instead would lose what the worker called its
        own output, which is the thing a report has to link to.
        """
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(
            monkeypatch,
            {
                "status": {"state": "completed"},
                "artifacts": [
                    {
                        "artifactId": "art_report",
                        "name": "validation-report",
                        "parts": [{"text": "12 cells, 0 errors"}],
                    }
                ],
            },
        )
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        (artifact,) = await store.artifacts(execution.execution_id)
        assert artifact.artifact_id == "art_report"
        assert artifact.name == "validation-report"

    @pytest.mark.asyncio
    async def test_the_objective_and_the_tree_reach_the_worker(self, monkeypatch):
        sent = _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(monkeypatch)
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        (_, task) = sent[0]
        assert "Validate the notebook from a clean sandbox" in task["text"]
        assert "datalayer:notebook/nb-7@3" in task["text"]
        # One tree, one A2A context.
        assert task["contextId"] == execution.root_execution_id

    @pytest.mark.asyncio
    async def test_the_parents_subagent_stream_keeps_its_events(self, monkeypatch):
        """The transcript a person is already watching must not go quiet.

        Orchestration is added beside the subagent events, not instead of
        them, so the same phases still reach the parent's stream.
        """
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(monkeypatch)
        republished: list[tuple[str, dict[str, Any]]] = []

        def emit(phase: str, **payload: Any) -> None:
            """
            Record one republished phase.

            Parameters
            ----------
            phase : str
                The subagent phase.
            **payload : Any
                What it carried.
            """
            republished.append((phase, payload))

        await _dispatch(A2AWorkerAdapter(emit=emit), InMemoryExecutionStore())

        assert [phase for phase, _ in republished] == [phase for phase, _ in GOOD_RUN]

    @pytest.mark.asyncio
    async def test_a_repeated_state_is_not_reported_twice(self, monkeypatch):
        """A2A repeats a state; the lifecycle would refuse the repeat.

        Reporting 'working' twice would ask the lifecycle to start an
        execution that is already running, and the store would record the
        refusal — noise that reads like a defect.
        """
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(monkeypatch)
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        errors = [
            event
            for event in await store.events(execution.execution_id)
            if event.type is ExecutionEventType.ERROR
        ]
        assert errors == []

    @pytest.mark.asyncio
    async def test_the_reduced_guarantees_land_on_the_execution(self, monkeypatch):
        """19.8, decision 5: the reduction is reported, not hidden."""
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(monkeypatch)
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        report = next(
            (event.data or {})["adapterCapabilities"]
            for event in await store.events(execution.execution_id)
            if "adapterCapabilities" in (event.data or {})
        )
        assert report["protocol"] == "a2a"
        assert "accepted" not in report["acknowledgements"]
        assert {entry["operation"] for entry in report["unsupported"]} == {
            operation.value
            for operation in WorkerOperation
            if operation
            not in {
                WorkerOperation.DELEGATE,
                WorkerOperation.CANCEL,
                WorkerOperation.SUBSCRIBE,
            }
        }


# ---------------------------------------------------------------------------
# Endings that are not completions
# ---------------------------------------------------------------------------


class TestEndings:
    @pytest.mark.asyncio
    async def test_a_worker_that_refuses_before_accepting_is_told_apart(
        self, monkeypatch
    ):
        """Conformance scenario 3.

        A rejection is not retryable on the same worker, and the code says
        which of the two happened.
        """
        _relay(
            monkeypatch,
            [
                ("status", {"taskId": "task-1", "state": "submitted"}),
                ("status", {"taskId": "task-1", "state": "rejected"}),
            ],
            raises=RuntimeError("The remote agent's task ended rejected: no capacity"),
        )
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        stored = await store.get(execution.execution_id)
        assert stored.status is ExecutionState.FAILED
        assert stored.error is not None
        assert stored.error.code is ErrorCode.WORKER_REJECTED
        assert stored.error.retryable is False

    @pytest.mark.asyncio
    async def test_a_worker_that_failed_after_accepting_may_be_retried(
        self, monkeypatch
    ):
        _relay(
            monkeypatch,
            [
                ("status", {"taskId": "task-1", "state": "working"}),
                ("status", {"taskId": "task-1", "state": "failed"}),
            ],
            raises=RuntimeError("The remote agent's task ended failed: kernel died"),
        )
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        stored = await store.get(execution.execution_id)
        assert stored.status is ExecutionState.FAILED
        assert stored.error is not None
        assert stored.error.code is ErrorCode.INTERNAL and stored.error.retryable

    @pytest.mark.asyncio
    async def test_a_worker_waiting_on_input_is_waiting_not_running(self, monkeypatch):
        _relay(
            monkeypatch,
            [
                ("status", {"taskId": "task-1", "state": "working"}),
                ("status", {"taskId": "task-1", "state": "input-required"}),
                ("status", {"taskId": "task-1", "state": "completed"}),
            ],
        )
        _no_task_lookup(monkeypatch)
        store = InMemoryExecutionStore()

        execution, _, observations = await _dispatch(A2AWorkerAdapter(), store)

        assert LifecycleEvent.WAIT in [
            observation.lifecycle_event for observation in observations
        ]


# ---------------------------------------------------------------------------
# Losing sight of a task, and stopping one
# ---------------------------------------------------------------------------


class TestRecoveryAndCancellation:
    @pytest.mark.asyncio
    async def test_re_attaching_reports_where_the_task_stands(self, monkeypatch):
        """Conformance scenario 4, on the polling decision 5 allows.

        The first look is progress, not a state change: an execution that
        was running before the disconnect is still running, and saying so
        again would be the adapter inventing a transition.
        """
        _no_task_lookup(monkeypatch, {"status": {"state": "working"}})
        adapter = A2AWorkerAdapter(poll_interval_seconds=0)
        execution = an_execution()
        attempt = an_attempt(execution, protocol_task_id="task-1")

        observations = []
        async for observation in adapter.subscribe(_worker(), execution, attempt):
            observations.append(observation)
            break

        assert observations[0].type is ExecutionEventType.PROGRESS
        assert "task-1" in (observations[0].message or "")

    @pytest.mark.asyncio
    async def test_re_attaching_to_a_finished_task_collects_it(self, monkeypatch):
        _no_task_lookup(
            monkeypatch,
            {
                "status": {"state": "completed"},
                "artifacts": [
                    {"name": "validation-report", "parts": [{"text": "clean"}]}
                ],
            },
        )
        adapter = A2AWorkerAdapter(poll_interval_seconds=0)
        execution = an_execution()
        attempt = an_attempt(execution, protocol_task_id="task-1")

        observations = [
            observation
            async for observation in adapter.subscribe(_worker(), execution, attempt)
        ]

        assert observations[0].type is ExecutionEventType.ARTIFACT_REGISTERED
        assert observations[-1].lifecycle_event is LifecycleEvent.COMPLETE

    @pytest.mark.asyncio
    async def test_an_attempt_that_never_reached_a_worker_says_so(self, monkeypatch):
        adapter = A2AWorkerAdapter(poll_interval_seconds=0)
        execution = an_execution()

        observations = [
            observation
            async for observation in adapter.subscribe(
                _worker(), execution, an_attempt(execution)
            )
        ]

        (only,) = observations
        assert only.error is not None
        assert only.error.code is ErrorCode.NOT_FOUND and only.error.retryable

    @pytest.mark.asyncio
    async def test_cancelling_asks_the_worker_both_ways(self, monkeypatch):
        asked: list[str] = []

        async def cancel_remote_task(remote, task_id):
            """
            Record the cancellation instead of sending it.

            Parameters
            ----------
            remote : A2ARemoteAgent
                The worker.
            task_id : str
                The task to stop.
            """
            asked.append(task_id)

        monkeypatch.setattr(binding, "cancel_remote_task", cancel_remote_task)
        execution = an_execution()

        outcome = await A2AWorkerAdapter().cancel(
            _worker(),
            execution,
            an_attempt(execution, protocol_task_id="task-1"),
            reason="the parent stopped",
        )

        assert asked == ["task-1"]
        assert outcome.operation is WorkerOperation.CANCEL
        assert "the parent stopped" in (outcome.detail or "")

    @pytest.mark.asyncio
    async def test_steering_a_plain_a2a_worker_is_refused_not_faked(self):
        execution = an_execution()

        outcome = await A2AWorkerAdapter().steer(
            _worker(), execution, an_attempt(execution), instructions="check the stats"
        )

        assert outcome.operation is WorkerOperation.STEER
        assert outcome.as_error().code is ErrorCode.UNSUPPORTED_OPERATION
