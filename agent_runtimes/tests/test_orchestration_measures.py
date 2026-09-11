# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Section 16's measures, taken by the store's rules (PLAN_ORCHESTRATOR.md, O1-14).

The measures are taken where the rules are — a delegation created or found
again, a milestone, a move into a terminal state, a commit — so the tests
drive the in-memory store through the same calls the control plane, durable
and the O0-13 example make, and read the points the instruments kept.

What they hold: each measure is taken once, a repeat is told apart rather
than counted twice, an execution is counted with what it recovered from, a
store opened for an account files every point under it, every label is in the
catalogue the OTEL dashboard is built from, and a measure that cannot be taken
never fails the work.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_orchestration_measures.py -v
```
"""

from __future__ import annotations

from typing import Any

import pytest
from datalayer_core.orchestration import (
    Acknowledgement,
    AcknowledgementKind,
    ArtifactStatus,
    ErrorCode,
    ExecutionEventType,
    ExecutionState,
    LifecycleEvent,
    OrchestrationError,
)

from agent_runtimes.monitoring import orchestration_measures as measures
from agent_runtimes.orchestration import InMemoryExecutionStore, now
from agent_runtimes.orchestration.adapter import Observation, answer_artifact
from agent_runtimes.orchestration.store import REATTACHED, event_for
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution


@pytest.fixture(autouse=True)
def recording() -> Any:
    """Recording instruments for each test, and exporting ones restored after."""
    measures.configure(recording=True)
    yield measures.instruments()
    measures.configure()


class _AccountStore(InMemoryExecutionStore):
    """The in-memory store, opened for an account as the Solr one is."""

    @property
    def account_uid(self) -> str | None:
        return "acc_1"


async def _running(store: InMemoryExecutionStore) -> tuple[Any, Any]:
    execution = await store.create(an_execution(), idempotency_key="delegate-1")
    attempt = await store.record_attempt(an_attempt(execution))
    await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)
    await store.set_state(execution.execution_id, LifecycleEvent.START)
    return execution, attempt


def _labels(points: list[tuple[float, dict[str, str]]], name: str) -> list[str]:
    return [attributes.get(name, "") for _, attributes in points]


class TestDelegations:
    @pytest.mark.asyncio
    async def test_a_duplicate_is_told_apart_from_a_new_delegation(self, recording):
        store = InMemoryExecutionStore()
        await store.create(an_execution(), idempotency_key="delegate-1")
        await store.create(an_execution(), idempotency_key="delegate-1")

        assert recording.delegations.points == [
            (1, {"protocol": "a2a", "outcome": "created"}),
            (1, {"protocol": "a2a", "outcome": "duplicate"}),
        ]


class TestMilestones:
    @pytest.mark.asyncio
    async def test_the_first_worker_event_and_acceptance_are_measured_once(
        self, recording
    ):
        """The endpoint taking the message is the first worker event; the
        first milestone at or past accepted is acceptance; a milestone
        delivered twice is measured the first time only."""
        store = InMemoryExecutionStore()
        execution, _ = await _running(store)

        for kind in (
            AcknowledgementKind.RECEIVED,
            AcknowledgementKind.STARTED,
            AcknowledgementKind.STARTED,
            AcknowledgementKind.COMPLETED,
        ):
            await store.record(execution.execution_id, Observation.acknowledged(kind))

        assert len(recording.first_worker_event.points) == 1
        assert len(recording.acceptance.points) == 1
        (elapsed, attributes), *_ = recording.acceptance.points
        assert elapsed > 0 and attributes == {"protocol": "a2a"}

    @pytest.mark.asyncio
    async def test_the_control_planes_own_receipt_is_not_a_worker_event(
        self, recording
    ):
        """`received` of a command names no attempt: nothing reached a worker."""
        store = InMemoryExecutionStore()
        execution = await store.create(an_execution(), idempotency_key="delegate-1")

        await store.record_acknowledgement(
            Acknowledgement(
                kind=AcknowledgementKind.RECEIVED,
                execution_id=execution.execution_id,
                acknowledged_at=now(),
            )
        )

        assert recording.first_worker_event.points == []
        assert recording.acceptance.points == []


class TestSettling:
    @pytest.mark.asyncio
    async def test_an_execution_is_counted_once_when_it_settles(self, recording):
        store = InMemoryExecutionStore()
        execution, _ = await _running(store)

        await store.set_state(execution.execution_id, LifecycleEvent.COMPLETE)

        assert recording.settled.points == [
            (1, {"protocol": "a2a", "state": "completed", "recovery": "none"}),
        ]
        [(duration, attributes)] = recording.duration.points
        assert duration > 0 and attributes == {"protocol": "a2a", "state": "completed"}

    @pytest.mark.asyncio
    async def test_a_re_attach_is_counted_as_a_disconnect(self, recording):
        store = InMemoryExecutionStore()
        execution, attempt = await _running(store)

        event = await store.record_reattach(
            execution.execution_id, attempt, reason="The watcher went away."
        )
        await store.set_state(execution.execution_id, LifecycleEvent.COMPLETE)

        assert event.data == {REATTACHED: 1}
        assert _labels(recording.settled.points, "recovery") == ["disconnected"]

    @pytest.mark.asyncio
    async def test_failing_for_a_lost_worker_is_counted_as_one(self, recording):
        store = InMemoryExecutionStore()
        execution, _ = await _running(store)

        await store.set_state(
            execution.execution_id,
            LifecycleEvent.FAIL,
            error=OrchestrationError(
                code=ErrorCode.LEASE_EXPIRED, message="No retry is left."
            ),
        )

        assert recording.settled.points == [
            (1, {"protocol": "a2a", "state": "failed", "recovery": "worker_lost"}),
        ]


def _state_changed(lifecycle_event: LifecycleEvent, code: ErrorCode | None = None):
    return event_for(
        an_execution(),
        ExecutionEventType.STATE_CHANGED,
        state=ExecutionState.RUNNING,
        lifecycle_event=lifecycle_event,
        error=OrchestrationError(code=code, message="moved") if code else None,
    )


def _error(code: ErrorCode):
    return event_for(
        an_execution(),
        ExecutionEventType.ERROR,
        error=OrchestrationError(code=code, message="lost sight"),
    )


def _progress(data: dict[str, Any]):
    return event_for(an_execution(), ExecutionEventType.PROGRESS, data=data)


class TestRecoveryOf:
    @pytest.mark.parametrize(
        ("events", "recovery"),
        [
            ([], "none"),
            ([_error(ErrorCode.LEASE_EXPIRED)], "disconnected"),
            ([_error(ErrorCode.WORKER_UNREACHABLE)], "disconnected"),
            ([_progress({REATTACHED: 1})], "disconnected"),
            ([_progress({"text": "reattached"})], "none"),
            (
                [_error(ErrorCode.LEASE_EXPIRED), _state_changed(LifecycleEvent.RETRY)],
                "worker_lost",
            ),
            (
                [_state_changed(LifecycleEvent.FAIL, ErrorCode.WORKER_UNREACHABLE)],
                "worker_lost",
            ),
            ([_state_changed(LifecycleEvent.FAIL, ErrorCode.BUDGET_EXHAUSTED)], "none"),
        ],
        ids=[
            "nothing",
            "an-expired-lease",
            "a-broken-stream",
            "a-re-attach",
            "a-worker-saying-the-word",
            "a-retry-after-losing-sight",
            "failing-for-an-unreachable-worker",
            "failing-for-another-reason",
        ],
    )
    def test_what_an_execution_recovered_from(self, events, recovery):
        assert measures.recovery_of(events) == recovery


class TestCommits:
    @pytest.mark.asyncio
    async def test_the_winner_is_committed_and_a_later_attempt_superseded(
        self, recording
    ):
        store = InMemoryExecutionStore()
        execution, first = await _running(store)
        second = await store.record_attempt(
            an_attempt(execution, attempt_id="att_2", number=2)
        )
        await store.register_artifact(
            execution.execution_id, answer_artifact(execution, first, "one")
        )
        await store.register_artifact(
            execution.execution_id,
            answer_artifact(execution, second, "two").model_copy(
                update={"artifact_id": "art_second"}
            ),
        )

        won = await store.commit_artifacts(execution.execution_id, first.attempt_id)
        lost = await store.commit_artifacts(execution.execution_id, second.attempt_id)
        again = await store.commit_artifacts(execution.execution_id, first.attempt_id)

        assert (won.won, lost.won, again.won) == (True, False, True)
        assert _labels(recording.artifacts.points, "outcome") == [
            ArtifactStatus.COMMITTED.value,
            ArtifactStatus.SUPERSEDED.value,
        ], "a commit delivered twice changes nothing and counts nothing"
        said = [
            event.message
            for event in await store.events(execution.execution_id)
            if event.type is ExecutionEventType.PROGRESS
        ]
        assert said == [
            f"Committed the artifacts of {first.attempt_id}.",
            f"Committed the artifacts of {first.attempt_id}.",
        ]


class TestTheAccount:
    @pytest.mark.asyncio
    async def test_a_store_opened_for_an_account_files_every_point_under_it(
        self, recording
    ):
        store = _AccountStore()
        execution, _ = await _running(store)
        await store.record(
            execution.execution_id,
            Observation.acknowledged(AcknowledgementKind.STARTED),
        )
        await store.set_state(execution.execution_id, LifecycleEvent.COMPLETE)

        taken = [
            attributes
            for instrument in recording.all()
            for _, attributes in instrument.points
        ]
        assert taken and all(
            attributes["usage_account_uid"] == "acc_1" for attributes in taken
        )

    @pytest.mark.asyncio
    async def test_an_unscoped_store_names_no_account(self, recording):
        await InMemoryExecutionStore().create(an_execution(), idempotency_key="k")

        [(_, attributes)] = recording.delegations.points
        assert "usage_account_uid" not in attributes


class TestTheWorkComesFirst:
    @pytest.mark.asyncio
    async def test_a_measure_that_cannot_be_taken_fails_nothing(self, monkeypatch):
        def broken() -> Any:
            raise RuntimeError("no meter")

        monkeypatch.setattr(measures, "instruments", broken)
        store = InMemoryExecutionStore()
        execution, _ = await _running(store)
        await store.record(
            execution.execution_id,
            Observation.acknowledged(AcknowledgementKind.STARTED),
        )
        moved = await store.set_state(execution.execution_id, LifecycleEvent.COMPLETE)

        assert moved.status is ExecutionState.COMPLETED


class TestTheCatalogue:
    def test_every_instrument_is_catalogued(self, recording):
        assert {instrument.name for instrument in recording.all()} == set(
            measures.CATALOGUE
        )

    @pytest.mark.asyncio
    async def test_every_label_written_is_a_catalogued_one(self, recording):
        store = _AccountStore()
        execution, attempt = await _running(store)
        await store.record(
            execution.execution_id,
            Observation.acknowledged(AcknowledgementKind.STARTED),
        )
        await store.register_artifact(
            execution.execution_id, answer_artifact(execution, attempt, "answer")
        )
        await store.set_state(execution.execution_id, LifecycleEvent.COMPLETE)
        await store.commit_artifacts(execution.execution_id, attempt.attempt_id)
        await store.create(an_execution(), idempotency_key="delegate-1")
        measures.conformance_scenario(
            scenario="successful_delegation", binding="a2a", outcome="passed"
        )

        for instrument in recording.all():
            assert instrument.points, f"{instrument.name} was never written"
            for _, attributes in instrument.points:
                assert set(attributes) <= set(measures.CATALOGUE[instrument.name]), (
                    instrument.name
                )


class TestTheConformanceRate:
    def test_one_failed_test_fails_the_scenario(self):
        outcome = None
        for reported in ("reduced", "passed", "failed", "passed"):
            outcome = measures.worse_outcome(outcome, reported)
        assert outcome == "failed"

    def test_a_reduction_is_not_a_run(self):
        rates = measures.conformance_rate(
            {
                ("successful_delegation", "a2a"): "passed",
                ("streaming_progress", "a2a"): "failed",
                ("successful_delegation", "acp"): "passed",
                ("lost_acknowledgement", "acp"): "reduced",
                ("successful_delegation", "plain"): "reduced",
            }
        )

        assert (rates["a2a"].run, rates["a2a"].rate) == (2, 0.5)
        assert (rates["acp"].run, rates["acp"].reduced, rates["acp"].rate) == (
            1,
            1,
            1.0,
        )
        assert rates["plain"].rate is None
