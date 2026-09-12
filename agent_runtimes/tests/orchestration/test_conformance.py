# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Scenarios 1 to 6 (PLAN_ORCHESTRATOR.md, section 13, 19.7, O0-12).

Successful delegation and artifact return, streaming progress, rejection
before acceptance, disconnect after acceptance, lost acknowledgement, and
duplicate command delivery — each written once and run against every
registered adapter. Nothing below names a protocol: a scenario that did
would have stopped testing the claim, which is that the same orchestration
runs over both bindings unchanged.

Scenarios 5 and 6 are shared with O1-05. What is here is what the in-memory
store can already show: an idempotency key that deduplicates a delegation,
and an acknowledgement that arrives twice without the execution moving
twice. What waits for the durable control plane is noted where it applies.

Launch the tests:
```
$ pytest agent_runtimes/tests/orchestration -v
```
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from datalayer_core.orchestration import (
    AcknowledgementKind,
    ErrorCode,
    ExecutionEventType,
    ExecutionState,
    LifecycleEvent,
    WorkerOperation,
)
from datalayer_core.orchestration.lifecycle import InvalidTransition

from agent_runtimes.orchestration import ExecutionConflict
from agent_runtimes.orchestration.adapter import (
    Observation,
    Performed,
    Unsupported,
)
from agent_runtimes.tests.orchestration.bindings import (
    Ending,
    WorkerScript,
    anything,
    current_attempt,
    deliver,
    dispatch,
    require_acknowledgement,
    require_operation,
    require_reattach,
    started,
    subscribe,
)
from agent_runtimes.tests.orchestration_records import (
    TRACEPARENT,
    an_attempt,
    an_execution,
)

# ---------------------------------------------------------------------------
# 1. Successful delegation and artifact return
# ---------------------------------------------------------------------------


class TestSuccessfulDelegation:
    @pytest.mark.asyncio
    async def test_the_execution_completes(self, binding, monkeypatch):
        require_operation(binding.declared, WorkerOperation.DELEGATE)
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered)

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.COMPLETED
        assert stored.error is None

    @pytest.mark.asyncio
    async def test_the_answer_comes_back_as_an_artifact_with_provenance(
        self, binding, monkeypatch
    ):
        """Section 5.4: a typed, attributed record, not an opaque blob.

        The provenance is what makes an artifact answerable six weeks later,
        when the question is which attempt of which execution produced the
        thing somebody is looking at.
        """
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered)

        (artifact,) = await delivered.store.artifacts(delivered.execution.execution_id)
        assert "The notebook runs clean." in (artifact.summary or "")
        (provenance,) = artifact.provenance
        assert provenance.execution_id == delivered.execution.execution_id
        assert provenance.attempt_id == delivered.attempt.attempt_id
        assert provenance.content_hash.startswith("sha256:")

    @pytest.mark.asyncio
    async def test_the_artifact_belongs_to_the_trees_trace(self, binding, monkeypatch):
        """Section 10 asks for artifact provenance to carry the trace, so a
        report and a trace are two views of one run rather than two runs."""
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered)

        (artifact,) = await delivered.store.artifacts(delivered.execution.execution_id)
        (provenance,) = artifact.provenance
        assert provenance.trace_id == TRACEPARENT.split("-")[1]

    @pytest.mark.asyncio
    async def test_the_reduced_guarantees_reach_the_execution_first(
        self, binding, monkeypatch
    ):
        """19.8, decision 5: the reduction is reported, not hidden.

        It is the first event of the dispatch, so 'why did this execution
        never checkpoint?' is answered from the execution's own stream
        rather than from whichever module somebody thinks to open.
        """
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered)

        events = await delivered.store.events(delivered.execution.execution_id)
        reports = [
            event for event in events if "adapterCapabilities" in (event.data or {})
        ]
        assert len(reports) == 1
        report = (reports[0].data or {})["adapterCapabilities"]
        assert report["protocol"] == binding.protocol.value
        assert set(report["supported"]) | {
            entry["operation"] for entry in report["unsupported"]
        } == {operation.value for operation in WorkerOperation}


# ---------------------------------------------------------------------------
# 2. Streaming progress
# ---------------------------------------------------------------------------


class TestStreamingProgress:
    @pytest.mark.asyncio
    async def test_progress_arrives_before_the_work_is_over(self, binding, monkeypatch):
        """A stream that only reported the ending would be a return value.

        What makes it a stream is that a person watching sees the work
        happening, so the progress has to be on the event log before the
        terminal state is.
        """
        delivered = await deliver(
            binding,
            monkeypatch,
            WorkerScript(progress=("Opening the notebook.", "Running cell 1.")),
        )

        await dispatch(delivered)

        events = await delivered.store.events(delivered.execution.execution_id)
        progress = [
            event.sequence
            for event in events
            if event.type is ExecutionEventType.PROGRESS
            and "Running cell 1." in (event.message or "")
        ]
        completed = [
            event.sequence
            for event in events
            if event.state is ExecutionState.COMPLETED
        ]
        assert progress and completed
        assert max(progress) < min(completed)

    @pytest.mark.asyncio
    async def test_a_subscriber_that_reconnects_loses_nothing(
        self, binding, monkeypatch
    ):
        """``from_sequence`` is what makes a reconnect lossless, and it is
        the same mechanism scenarios 4 and 5 recover through."""
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered)

        everything = await delivered.store.events(delivered.execution.execution_id)
        halfway = everything[len(everything) // 2].sequence
        rest = await delivered.store.events(
            delivered.execution.execution_id, from_sequence=halfway
        )
        assert [event.event_id for event in rest] == [
            event.event_id for event in everything if event.sequence > halfway
        ]

    @pytest.mark.asyncio
    async def test_the_worker_is_asked_for_the_objective_and_its_context(
        self, binding, monkeypatch
    ):
        """Section 2: context is passed by reference, and the reference is
        versioned. A worker that was handed a copy could not be asked what
        version it read."""
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered)

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.context.references[0].uri == "datalayer:notebook/nb-7@3"


# ---------------------------------------------------------------------------
# 3. Worker rejection before acceptance
# ---------------------------------------------------------------------------


class TestRejectionBeforeAcceptance:
    @pytest.mark.asyncio
    async def test_a_refusal_fails_the_execution_and_is_not_retryable(
        self, binding, monkeypatch
    ):
        """A worker that refused this attempt has nothing new to offer the
        next one, which is what ``retryable`` is read for."""
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.REJECTED)
        )

        await dispatch(delivered)

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.FAILED
        assert stored.error is not None
        assert stored.error.code is ErrorCode.WORKER_REJECTED
        assert stored.error.retryable is False

    @pytest.mark.asyncio
    async def test_a_worker_that_took_the_job_and_broke_may_be_tried_again(
        self, binding, monkeypatch
    ):
        """Scenario 3's other half: the two endings must be told apart, or
        the retry policy cannot decide anything."""
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.FAILED)
        )

        await dispatch(delivered)

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.FAILED
        assert stored.error is not None
        assert stored.error.code is not ErrorCode.WORKER_REJECTED
        assert stored.error.retryable is True

    @pytest.mark.asyncio
    async def test_nothing_claims_the_worker_ever_started(self, binding, monkeypatch):
        """Before acceptance means before: an execution that was refused
        must not carry a milestone saying somebody was working on it."""
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.REJECTED)
        )

        await dispatch(delivered)

        reached = {
            milestone.kind
            for milestone in await delivered.store.acknowledgements(
                delivered.execution.execution_id
            )
        }
        assert AcknowledgementKind.STARTED not in reached
        assert AcknowledgementKind.COMPLETED not in reached


# ---------------------------------------------------------------------------
# 4. Disconnect after acceptance
# ---------------------------------------------------------------------------


class TestDisconnectAfterAcceptance:
    @pytest.mark.asyncio
    async def test_the_attempt_keeps_the_handle_a_re_attach_needs(
        self, binding, monkeypatch
    ):
        """The protocol's own identifier is the only way back to the work.

        It is learnt mid-stream and recorded on the attempt, so a step that
        starts with nothing but the execution record can still find it.
        """
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )

        await dispatch(delivered, until=started)

        attempt = await current_attempt(delivered)
        assert attempt.session_id or attempt.protocol_task_id

    @pytest.mark.asyncio
    async def test_losing_sight_of_the_work_is_unknown_not_failed(
        self, binding, monkeypatch
    ):
        """Section 6.4: reconcile before declaring anything.

        A control plane that failed an execution because its own connection
        dropped would retry work that is still running, and section 6.4 asks
        for the opposite: the state stands until the worker is asked again.
        """
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )
        await dispatch(delivered, until=started)
        require_reattach(delivered)

        before = await delivered.store.get(delivered.execution.execution_id)
        seen = await subscribe(delivered, until=anything)

        after = await delivered.store.get(delivered.execution.execution_id)
        assert before.status is ExecutionState.RUNNING
        assert after.status is ExecutionState.RUNNING
        assert seen, "A re-attach that reports nothing has not re-attached."

    @pytest.mark.asyncio
    async def test_a_re_attach_invents_no_transition(self, binding, monkeypatch):
        """An execution that was running before the disconnect is still
        running, and saying so again would be the adapter deciding a state
        the lifecycle would then have to refuse."""
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )
        await dispatch(delivered, until=started)
        require_reattach(delivered)

        await subscribe(delivered, until=anything)

        assert not _errors(
            await delivered.store.events(delivered.execution.execution_id),
            ErrorCode.INVALID_TRANSITION,
        )

    @pytest.mark.asyncio
    async def test_an_attempt_that_never_reached_a_worker_says_so(
        self, binding, monkeypatch
    ):
        """There is a difference between work that is lost and work that
        never left, and only one of them is worth re-attaching to."""
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )
        require_reattach(delivered)

        seen = await subscribe(delivered, until=anything)

        (only,) = seen
        assert only.error is not None
        assert only.error.code is ErrorCode.NOT_FOUND
        assert only.error.retryable is True


# ---------------------------------------------------------------------------
# 5. Lost acknowledgement
# ---------------------------------------------------------------------------


class TestLostAcknowledgement:
    @pytest.mark.asyncio
    async def test_a_milestone_reported_twice_moves_the_execution_once(
        self, binding, monkeypatch
    ):
        """A worker whose acknowledgement we may not have received will send
        it again, and a re-attach re-reports what it finds. The record of
        having reached a milestone twice is kept — it is evidence — but the
        execution must not move twice for it.

        Detecting that an acknowledgement was *lost*, rather than seeing a
        duplicate of one that arrived, needs a lease and a control plane
        that is waiting for it; that half is O1-05's.
        """
        delivered = await deliver(binding, monkeypatch, WorkerScript())
        seen = await dispatch(delivered)
        milestone = next(
            observation
            for observation in seen
            if observation.type is ExecutionEventType.ACKNOWLEDGED
        )
        before = await delivered.store.get(delivered.execution.execution_id)

        await delivered.store.record(
            delivered.execution.execution_id,
            milestone,
            attempt_id=delivered.attempt.attempt_id,
        )

        after = await delivered.store.get(delivered.execution.execution_id)
        assert after.status is before.status
        assert after.updated_at == before.updated_at

    @pytest.mark.asyncio
    async def test_the_milestones_are_readable_in_the_order_they_were_reached(
        self, binding, monkeypatch
    ):
        """Section 6.3 exists so that 'the endpoint has it' and 'a worker
        took it' are not the same fact; an order that could not be read
        would collapse them again."""
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered)

        reached = [
            milestone.kind
            for milestone in await delivered.store.acknowledgements(
                delivered.execution.execution_id
            )
        ]
        assert reached[0] is AcknowledgementKind.RECEIVED
        assert reached[-1] is AcknowledgementKind.COMPLETED
        assert set(reached) <= binding.declared.acknowledgements

    @pytest.mark.asyncio
    async def test_the_control_plane_is_not_left_waiting_for_acceptance(
        self, binding, monkeypatch
    ):
        """The milestone a lost acknowledgement is really about.

        This is the scenario for an adapter that can report ``accepted``:
        the worker took responsibility, the acknowledgement did not arrive,
        and the control plane has to tell that from a worker that never
        took it. Neither Phase 0 binding can report it — A2A's ``submitted``
        is an endpoint taking a message and ACP answers only when the turn
        is over — so both skip here with their own declared reason rather
        than passing on a weaker assertion.
        """
        require_acknowledgement(binding.declared, AcknowledgementKind.ACCEPTED)
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        await dispatch(delivered, until=started)

        reached = {
            milestone.kind
            for milestone in await delivered.store.acknowledgements(
                delivered.execution.execution_id
            )
        }
        assert AcknowledgementKind.ACCEPTED in reached


# ---------------------------------------------------------------------------
# 6. Duplicate command delivery
# ---------------------------------------------------------------------------


class TestDuplicateCommandDelivery:
    @pytest.mark.asyncio
    async def test_the_second_delivery_finds_the_first_execution(
        self, binding, monkeypatch
    ):
        """Section 6.4: a client retries, a queue redelivers, a person
        clicks twice. The second delivery must find the work the first
        started, not start a second piece of it."""
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        again = await delivered.store.create(
            binding.execution(), idempotency_key="idem-1"
        )

        assert again.execution_id == delivered.execution.execution_id
        assert len(await delivered.store.list_executions()) == 1

    @pytest.mark.asyncio
    async def test_a_duplicate_delegation_dispatches_once(self, binding, monkeypatch):
        """The consequence that matters: one worker doing the work once.

        Guaranteeing it against a worker that is *concurrently* being
        dispatched to by another control-plane replica needs the durable
        claim of O1-03; what the store guarantees here is that a duplicate
        never becomes a second attempt.
        """
        delivered = await deliver(binding, monkeypatch, WorkerScript())
        await dispatch(delivered)

        await delivered.store.create(binding.execution(), idempotency_key="idem-1")

        attempts = await delivered.store.attempts(delivered.execution.execution_id)
        assert len(attempts) == 1

    @pytest.mark.asyncio
    async def test_the_same_key_behind_different_work_is_refused(
        self, binding, monkeypatch
    ):
        """Answering with an execution that is not the one asked for would
        be worse than refusing: the caller would wait on somebody else's
        work believing it was its own."""
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        with pytest.raises(ExecutionConflict):
            await delivered.store.create(
                binding.execution(
                    execution_id="exec_2", goal="Summarise the notebook instead"
                ),
                idempotency_key="idem-1",
            )


# ---------------------------------------------------------------------------
# The harness itself: what it must refuse to pass
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# 7. Worker crash and checkpoint recovery (O1-16, O2-05)
# ---------------------------------------------------------------------------


class TestWorkerCrashAndRecovery:
    """A worker that took the job and then died.

    What every protocol settles the same way is here: a crash is not an
    ending, the lost attempt is closed before anything is sent again, and
    the execution ends on the successor rather than on the attempt that
    disappeared. Resuming *from a checkpoint* belongs to the orchestration
    extension, and neither plain binding has one — each says why in its own
    words, which the reduced-guarantee test below reads rather than assumes.
    O2-05 proves the extended path over both protocols against a runtime.
    """

    @pytest.mark.asyncio
    async def test_the_execution_ends_on_the_successor_attempt(
        self, binding, monkeypatch
    ):
        """Recovery is a new attempt, and the new attempt is what finishes.

        The crashed attempt stays in the history — it is how the retry is
        told from a duplicate — but it commits nothing, and the artifact
        the execution ends with came from the worker that actually answered.
        """
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )
        await dispatch(delivered, until=started)

        await delivered.store.set_state(
            delivered.execution.execution_id,
            LifecycleEvent.RETRY,
            message="the worker was lost",
        )
        adapter, worker = await binding.resolve(monkeypatch, WorkerScript())
        successor = await delivered.store.record_attempt(
            an_attempt(delivered.execution, attempt_id="att_2", number=2)
        )
        second = replace(
            delivered, adapter=adapter, worker=worker, attempt=successor
        )

        await dispatch(second)

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.COMPLETED
        artifacts = await delivered.store.artifacts(
            delivered.execution.execution_id
        )
        assert artifacts, "A recovered execution with no result recovered nothing."
        produced_by = {
            entry.attempt_id
            for artifact in artifacts
            for entry in artifact.provenance
        }
        assert produced_by == {successor.attempt_id}, (
            "The crashed attempt produced nothing, so nothing may carry its "
            "provenance; the result belongs to the worker that answered."
        )

    @pytest.mark.asyncio
    async def test_the_crashed_attempt_never_reports_the_ending(
        self, binding, monkeypatch
    ):
        """The lifecycle is walked once, through the states section 6.1 has.

        An execution that went straight from running to completed would
        have hidden the recovery; one that moved twice into a terminal
        state would have let the dead attempt speak for the live one.
        """
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )
        await dispatch(delivered, until=started)
        await delivered.store.set_state(
            delivered.execution.execution_id,
            LifecycleEvent.RETRY,
            message="the worker was lost",
        )
        adapter, worker = await binding.resolve(monkeypatch, WorkerScript())
        successor = await delivered.store.record_attempt(
            an_attempt(delivered.execution, attempt_id="att_2", number=2)
        )

        await dispatch(
            replace(delivered, adapter=adapter, worker=worker, attempt=successor)
        )

        events = await delivered.store.events(delivered.execution.execution_id)
        assert not _errors(events, ErrorCode.INVALID_TRANSITION)
        moves = [
            event.state
            for event in events
            if event.type is ExecutionEventType.STATE_CHANGED
        ]
        assert moves == [
            ExecutionState.CREATED,
            ExecutionState.ASSIGNED,
            ExecutionState.RUNNING,
            ExecutionState.RETRYING,
            ExecutionState.RUNNING,
            ExecutionState.COMPLETED,
        ]

    @pytest.mark.asyncio
    async def test_a_worker_with_no_checkpoint_says_so_rather_than_pretending(
        self, binding, monkeypatch
    ):
        """The reduced guarantee of decision 5, read from the adapter.

        A plain worker cannot be resumed from a checkpoint, and the useful
        thing on the day somebody asks why a crash cost the whole run is
        the adapter's own sentence — not a silent restart that looks like
        a resume.
        """
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )
        await dispatch(delivered, until=started)

        outcome = await delivered.adapter.resume(
            delivered.worker,
            delivered.execution,
            delivered.attempt,
            checkpoint_id="ckpt-that-does-not-exist",
        )

        refusal = delivered.worker.capabilities.refusal(WorkerOperation.RESUME)
        if refusal is None:
            pytest.skip("This worker declares it can be resumed; O2-05 proves that.")
        assert isinstance(outcome, Unsupported)
        assert outcome.reason.strip()


# ---------------------------------------------------------------------------
# 9. Cancellation race with completion (O1-16)
# ---------------------------------------------------------------------------


class TestCancellationRacesCompletion:
    """A cancel and an ending, in flight at the same time.

    One of them is the execution's outcome and the other is late. Which one
    wins is not the claim — either order is legitimate, and which arrives
    first is a race nobody controls. The claim is that the loser does not
    overwrite the winner, does not go unrecorded, and does not leave a
    worker running.
    """

    @pytest.mark.asyncio
    async def test_an_ending_that_arrives_after_a_cancel_does_not_overwrite_it(
        self, binding, monkeypatch
    ):
        """The cancel won. The worker's completion is late, not authoritative.

        It is recorded as a refused move against the adapter that reported
        it, which is the only way a later reader can tell this execution
        from one that was cancelled before its worker ever answered.
        """
        require_operation(binding.declared, WorkerOperation.CANCEL)
        delivered = await deliver(binding, monkeypatch, WorkerScript())
        await dispatch(delivered, until=started)

        await delivered.store.set_state(
            delivered.execution.execution_id,
            LifecycleEvent.CANCEL,
            message="the person stopped it",
        )
        ending = Observation(
            type=ExecutionEventType.STATE_CHANGED,
            lifecycle_event=LifecycleEvent.COMPLETE,
        )
        await delivered.store.record(
            delivered.execution.execution_id,
            ending,
            attempt_id=delivered.attempt.attempt_id,
        )

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.CANCELLED
        assert _errors(
            await delivered.store.events(delivered.execution.execution_id),
            ErrorCode.INVALID_TRANSITION,
        )

    @pytest.mark.asyncio
    async def test_a_cancel_that_arrives_after_the_ending_is_refused(
        self, binding, monkeypatch
    ):
        """The completion won, and a completed execution has no moves left.

        Section 6.1 makes terminal states absorbing precisely so that a
        cancel racing a result cannot un-complete work that was done — and
        the result stays committed, because the worker did the work.
        """
        require_operation(binding.declared, WorkerOperation.CANCEL)
        delivered = await deliver(binding, monkeypatch, WorkerScript())
        await dispatch(delivered)
        before = await delivered.store.artifacts(delivered.execution.execution_id)

        with pytest.raises(InvalidTransition):
            await delivered.store.set_state(
                delivered.execution.execution_id,
                LifecycleEvent.CANCEL,
                message="the person stopped it, too late",
            )

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.COMPLETED
        assert (
            await delivered.store.artifacts(delivered.execution.execution_id)
        ) == before

    @pytest.mark.asyncio
    async def test_the_worker_is_told_to_stop_even_when_the_cancel_was_late(
        self, binding, monkeypatch
    ):
        """A worker is not left running because the control plane was slow.

        The canonical state is settled and the worker is told anyway; an
        adapter that refuses tells the caller in its own words instead of
        reporting a stop that never happened.
        """
        require_operation(binding.declared, WorkerOperation.CANCEL)
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.WORKING)
        )
        await dispatch(delivered, until=started)

        outcome = await delivered.adapter.cancel(
            delivered.worker,
            delivered.execution,
            delivered.attempt,
            reason="the person stopped it",
        )

        assert isinstance(outcome, (Performed, Unsupported))
        if isinstance(outcome, Performed):
            assert outcome.operation is WorkerOperation.CANCEL
        else:
            assert outcome.reason.strip()


# ---------------------------------------------------------------------------
# 11. Budget exhaustion: the model budget (O1-07)
# ---------------------------------------------------------------------------


class TestBudgetExhaustion:
    @pytest.mark.asyncio
    async def test_a_worker_stopped_by_its_budget_fails_the_execution_saying_which_limit(
        self, binding, monkeypatch
    ):
        """The worker's own words for the limit it reached, read into the
        canonical reason: not a worker that broke, and nothing another attempt
        could spend. The platform budget — an exhausted reservation — is the
        durable worker's to see, and has its own reason (``details.budget``)."""
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(ending=Ending.BUDGET)
        )

        await dispatch(delivered)

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.FAILED
        assert stored.error is not None
        assert stored.error.code is ErrorCode.BUDGET_EXHAUSTED
        assert stored.error.retryable is False
        assert (stored.error.details or {}).get("budget") == "model"
        assert (stored.error.details or {}).get("limit") == "output_tokens"


class TestTheHarness:
    @pytest.mark.asyncio
    async def test_a_dispatch_invents_no_canonical_transition(
        self, binding, monkeypatch
    ):
        """O0-12's own acceptance test, and the guard the suite is built on.

        An adapter decides nothing: it reports what it saw and the lifecycle
        says what that means (O0-02). An adapter made to invent a transition
        — reporting a state twice, or one the execution cannot be in — leaves
        an ``invalid_transition`` against itself, and this is where the suite
        stops being green about it.
        """
        delivered = await deliver(
            binding, monkeypatch, WorkerScript(progress=("One.", "Two.", "Three."))
        )

        await dispatch(delivered)

        assert not _errors(
            await delivered.store.events(delivered.execution.execution_id),
            ErrorCode.INVALID_TRANSITION,
        )

    @pytest.mark.asyncio
    async def test_an_adapter_that_invents_a_transition_is_recorded_as_wrong(
        self, binding, monkeypatch
    ):
        """The mechanism the guard above relies on.

        An adapter reporting that a completed execution completed again is
        asking the lifecycle for a move it does not have. The store records
        the refusal against the adapter and leaves the execution where it
        is; a suite that let that through would pass on a worker that could
        talk an execution out of its own history.
        """
        delivered = await deliver(binding, monkeypatch, WorkerScript())
        seen = await dispatch(delivered)
        ending = next(
            observation
            for observation in seen
            if observation.lifecycle_event is LifecycleEvent.COMPLETE
        )

        await delivered.store.record(
            delivered.execution.execution_id,
            ending,
            attempt_id=delivered.attempt.attempt_id,
        )

        stored = await delivered.store.get(delivered.execution.execution_id)
        assert stored.status is ExecutionState.COMPLETED
        assert _errors(
            await delivered.store.events(delivered.execution.execution_id),
            ErrorCode.INVALID_TRANSITION,
        )

    def test_every_registered_adapter_accounts_for_every_operation(self, binding):
        """A report with a hole in it is how a later reader concludes the
        hole was an oversight rather than a decision."""
        declared = binding.declared
        refused = {entry.operation for entry in declared.unsupported}
        assert refused | set(declared.supported) == set(WorkerOperation)

    def test_a_scenario_is_never_silently_skipped(self, binding):
        """A skip has to carry the adapter's own words for why.

        The reason a scenario did not run is the most useful thing the suite
        produces on the day somebody asks what a protocol cannot do.
        """
        for operation in WorkerOperation:
            refusal = binding.declared.refusal(operation)
            assert refusal is None or refusal.reason.strip()

    @pytest.mark.asyncio
    async def test_the_scenarios_do_not_depend_on_the_shared_record(
        self, binding, monkeypatch
    ):
        """The binding decides which worker an execution names; everything
        else about it is the one record every orchestration test shares."""
        delivered = await deliver(binding, monkeypatch, WorkerScript())

        assert delivered.execution.agent.protocol is binding.protocol
        assert delivered.execution.objective == an_execution().objective


def _errors(events, code: ErrorCode) -> list:
    """
    The error events of one code, for the scenarios that assert on them.

    Parameters
    ----------
    events : list[ExecutionEvent]
        The execution's events.
    code : ErrorCode
        The error being looked for.

    Returns
    -------
    list
        The matching events.
    """
    return [
        event
        for event in events
        if event.type is ExecutionEventType.ERROR
        and event.error is not None
        and event.error.code is code
    ]
