# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The contract every `ExecutionStore` keeps (PLAN_ORCHESTRATOR.md, O0-04 and O1-02).

The Phase 0 store tests, written once against the port rather than against
the in-memory store, so the Solr store of the control plane runs exactly the
tests the in-memory one does. A store that ordered events differently, or let
a worker talk an execution out of a terminal state, fails here before it
fails in a tree somebody is reading.

Subclass `ExecutionStoreContract` in a class named `Test…` and give it
`make_store`, which answers a fresh, empty store each time it is called::

    class TestMyStore(ExecutionStoreContract):
        def make_store(self):
            return MyStore()

Imports pytest: a module for test suites, never for the runtime.
"""

from __future__ import annotations

import pytest
from datalayer_core.orchestration import (
    Acknowledgement,
    AcknowledgementKind,
    Artifact,
    ArtifactProvenance,
    ArtifactStatus,
    ArtifactType,
    ErrorCode,
    ExecutionEventType,
    ExecutionState,
    InvalidTransition,
    LifecycleEvent,
    OrchestrationError,
)

from agent_runtimes.orchestration import Observation
from agent_runtimes.orchestration.store import (
    ExecutionConflict,
    ExecutionNotFound,
    ExecutionStore,
)
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution


async def _running(store: ExecutionStore):
    """
    An execution with one attempt, dispatched and running.

    Parameters
    ----------
    store : ExecutionStore
        The store to build it in.

    Returns
    -------
    tuple
        The execution and its attempt.
    """
    execution = await store.create(an_execution())
    attempt = await store.record_attempt(an_attempt(execution))
    await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)
    await store.set_state(
        execution.execution_id, LifecycleEvent.START, attempt_id=attempt.attempt_id
    )
    return execution, attempt


# ---------------------------------------------------------------------------
# Creating, and being asked twice
# ---------------------------------------------------------------------------


class CreatingContract:
    @pytest.mark.asyncio
    async def test_a_created_execution_starts_its_own_event_stream(self):
        store = self.make_store()

        execution = await store.create(an_execution())

        assert (await store.get("exec_1")).status is ExecutionState.CREATED
        (event,) = await store.events("exec_1")
        assert event.type is ExecutionEventType.STATE_CHANGED
        assert event.sequence == 1 and event.state is ExecutionState.CREATED
        # Correlation the tree is reassembled from, on the very first event.
        assert event.root_execution_id == execution.execution_id
        assert event.agent_id == "notebook-validator"
        assert event.traceparent is not None

    @pytest.mark.asyncio
    async def test_an_unknown_execution_is_refused_not_returned_as_none(self):
        with pytest.raises(ExecutionNotFound):
            await self.make_store().get("exec_nope")

    @pytest.mark.asyncio
    async def test_the_same_identifier_twice_is_a_conflict(self):
        store = self.make_store()
        await store.create(an_execution())

        with pytest.raises(ExecutionConflict):
            await store.create(an_execution())

    @pytest.mark.asyncio
    async def test_a_duplicate_delivery_finds_the_first_execution(self):
        """Conformance scenario 6, in the small.

        A retried delegation must not become a second execution, and the
        answer to the second delivery is the first execution rather than an
        error the caller has to interpret.
        """
        store = self.make_store()
        first = await store.create(an_execution(), idempotency_key="key-1")

        again = await store.create(
            an_execution(execution_id="exec_2"), idempotency_key="key-1"
        )

        assert again.execution_id == first.execution_id
        assert len(await store.list_executions()) == 1

    @pytest.mark.asyncio
    async def test_a_key_reused_for_other_work_is_a_conflict(self):
        store = self.make_store()
        await store.create(an_execution(), idempotency_key="key-1")

        with pytest.raises(ExecutionConflict):
            await store.create(
                an_execution(execution_id="exec_2", goal="Something else"),
                idempotency_key="key-1",
            )

    @pytest.mark.asyncio
    async def test_an_execution_keeps_its_place_in_its_tree(self):
        """O2-01: the root, the parent and the depth are set when an execution
        is created, and no write rewrites them — a tree is one query on its
        root, and moving one execution would move its subtree with it."""
        store = self.make_store()
        execution = await store.create(an_execution())

        for moved in (
            execution.model_copy(update={"root_execution_id": "exec_other"}),
            execution.model_copy(update={"parent_execution_id": "exec_other"}),
            execution.model_copy(update={"depth": 1}),
        ):
            with pytest.raises(ExecutionConflict):
                await store.save(moved)

        await store.save(execution.model_copy(update={"status_message": "Still here"}))
        kept = await store.get(execution.execution_id)
        assert (kept.root_execution_id, kept.parent_execution_id, kept.depth) == (
            execution.execution_id,
            None,
            0,
        )
        assert kept.status_message == "Still here"


# ---------------------------------------------------------------------------
# Reading a tree
# ---------------------------------------------------------------------------


class ListingContract:
    @pytest.mark.asyncio
    async def test_a_tree_lists_by_root_and_children_by_parent(self):
        store = self.make_store()
        root = await store.create(an_execution())
        for index in (2, 3):
            await store.create(
                an_execution(
                    execution_id=f"exec_{index}",
                    parent_execution_id=root.execution_id,
                    root_execution_id=root.execution_id,
                )
            )
        await store.create(an_execution(execution_id="other"))

        tree = await store.list_executions(root_execution_id=root.execution_id)
        children = await store.list_executions(parent_execution_id=root.execution_id)

        assert {execution.execution_id for execution in tree} == {
            "exec_1",
            "exec_2",
            "exec_3",
        }
        assert {execution.execution_id for execution in children} == {
            "exec_2",
            "exec_3",
        }

    @pytest.mark.asyncio
    async def test_listing_filters_on_state(self):
        store = self.make_store()
        await _running(store)
        await store.create(an_execution(execution_id="exec_2"))

        running = await store.list_executions(status=ExecutionState.RUNNING)

        assert [execution.execution_id for execution in running] == ["exec_1"]


# ---------------------------------------------------------------------------
# Moving, which only the lifecycle decides
# ---------------------------------------------------------------------------


class StateContract:
    @pytest.mark.asyncio
    async def test_a_move_is_stored_and_said_on_the_stream(self):
        store = self.make_store()
        execution, attempt = await _running(store)

        events = await store.events(execution.execution_id)

        assert (await store.get("exec_1")).status is ExecutionState.RUNNING
        assert [event.state for event in events][-1] is ExecutionState.RUNNING
        assert events[-1].previous_state is ExecutionState.ASSIGNED
        assert events[-1].lifecycle_event is LifecycleEvent.START

    @pytest.mark.asyncio
    async def test_the_attempt_moves_with_the_execution(self):
        store = self.make_store()
        execution, attempt = await _running(store)

        (dispatched,) = await store.attempts(execution.execution_id)
        assert dispatched.state is ExecutionState.RUNNING
        assert dispatched.started_at is not None and dispatched.ended_at is None

        await store.set_state(
            execution.execution_id,
            LifecycleEvent.COMPLETE,
            attempt_id=attempt.attempt_id,
        )
        (finished,) = await store.attempts(execution.execution_id)
        assert finished.state is ExecutionState.COMPLETED
        assert finished.ended_at is not None

    @pytest.mark.asyncio
    async def test_a_terminal_execution_absorbs(self):
        store = self.make_store()
        execution, _ = await _running(store)
        await store.set_state(execution.execution_id, LifecycleEvent.CANCEL)

        with pytest.raises(InvalidTransition):
            await store.set_state(execution.execution_id, LifecycleEvent.COMPLETE)

    @pytest.mark.asyncio
    async def test_the_store_has_no_opinion_of_its_own_about_a_move(self):
        """The state came from the lifecycle, not from a table here.

        Assigning a created execution and then starting it is what
        ``lifecycle.TRANSITIONS`` says; if the store kept its own copy of
        that table this test would still pass and the two would drift, so
        the thing worth asserting is that an event the lifecycle does not
        allow never reaches storage.
        """
        store = self.make_store()
        await store.create(an_execution())

        with pytest.raises(InvalidTransition):
            await store.set_state("exec_1", LifecycleEvent.START)

        assert (await store.get("exec_1")).status is ExecutionState.CREATED
        assert len(await store.events("exec_1")) == 1


# ---------------------------------------------------------------------------
# Attempts, milestones and artifacts
# ---------------------------------------------------------------------------


class RecordsContract:
    @pytest.mark.asyncio
    async def test_a_second_attempt_becomes_the_current_one(self):
        store = self.make_store()
        execution = await store.create(an_execution())
        await store.record_attempt(an_attempt(execution))

        await store.record_attempt(an_attempt(execution, attempt_id="att_2", number=2))

        stored = await store.get(execution.execution_id)
        assert stored.current_attempt_id == "att_2" and stored.attempt_count == 2
        assert len(await store.attempts(execution.execution_id)) == 2

    @pytest.mark.asyncio
    async def test_a_milestone_is_kept_and_shown(self):
        store = self.make_store()
        execution, attempt = await _running(store)

        await store.record_acknowledgement(
            Acknowledgement(
                kind=AcknowledgementKind.STARTED,
                execution_id=execution.execution_id,
                attempt_id=attempt.attempt_id,
                acknowledged_at="2026-09-09T10:00:01+00:00",
            )
        )

        (milestone,) = await store.acknowledgements(execution.execution_id)
        assert milestone.kind is AcknowledgementKind.STARTED
        assert (await store.events(execution.execution_id))[
            -1
        ].type is ExecutionEventType.ACKNOWLEDGED

    @pytest.mark.asyncio
    async def test_a_registration_promoted_to_committed_says_who_committed_it(self):
        """A status and its committer move together.

        `model_copy` does not re-run the model's validators, so a merge that
        promoted the status without carrying the committer produced a record
        the model would have refused and nothing complained about.
        """
        store = self.make_store()
        execution, attempt = await _running(store)
        registered = Artifact(
            artifact_id="art_1",
            type=ArtifactType.JSON,
            name="report",
            reference="datalayer:artifact/a-1@1",
            status=ArtifactStatus.REGISTERED,
            provenance=[_provenance(attempt.attempt_id)],
        )
        await store.register_artifact(execution.execution_id, registered)
        await store.register_artifact(
            execution.execution_id,
            registered.model_copy(
                update={
                    "status": ArtifactStatus.COMMITTED,
                    "committed_by": attempt.attempt_id,
                }
            ),
        )
        stored = (await store.artifacts(execution.execution_id))[0]
        assert stored.status is ArtifactStatus.COMMITTED
        assert stored.committed_by == attempt.attempt_id
        # And the record is one the model would accept.
        Artifact(**stored.model_dump())

    @pytest.mark.asyncio
    async def test_two_attempts_at_one_artifact_are_one_record_with_two_provenances(
        self,
    ):
        """Conformance scenario 13 in miniature (19.8, decision 4).

        Nothing is overwritten and nothing is dropped: the second attempt's
        provenance is kept, and the committed version stays committed.
        """
        store = self.make_store()
        execution, attempt = await _running(store)
        committed = Artifact(
            artifact_id="art_1",
            type=ArtifactType.JSON,
            name="report",
            reference="datalayer:artifact/a-1@1",
            status=ArtifactStatus.COMMITTED,
            # A committed record says whose version was committed: two
            # provenances on one record could not otherwise answer it.
            committed_by=attempt.attempt_id,
            provenance=[_provenance(attempt.attempt_id)],
        )
        await store.register_artifact(execution.execution_id, committed)

        await store.register_artifact(
            execution.execution_id,
            committed.model_copy(
                update={
                    "reference": "datalayer:artifact/a-2@1",
                    "status": ArtifactStatus.REGISTERED,
                    "committed_by": None,
                    "provenance": [_provenance("att_2")],
                }
            ),
        )

        (artifact,) = await store.artifacts(execution.execution_id)
        assert artifact.status is ArtifactStatus.COMMITTED
        assert artifact.reference == "datalayer:artifact/a-1@1"
        assert [record.attempt_id for record in artifact.provenance] == [
            attempt.attempt_id,
            "att_2",
        ]


def _provenance(attempt_id: str) -> ArtifactProvenance:
    """
    One provenance record, for the artifact tests.

    Parameters
    ----------
    attempt_id : str
        Which attempt produced it.

    Returns
    -------
    ArtifactProvenance
        The record.
    """
    return ArtifactProvenance(
        execution_id="exec_1",
        attempt_id=attempt_id,
        agent_id="notebook-validator",
        produced_at="2026-09-09T10:00:02+00:00",
    )


# ---------------------------------------------------------------------------
# What an adapter reports
# ---------------------------------------------------------------------------


class RecordingObservationsContract:
    @pytest.mark.asyncio
    async def test_an_observed_move_becomes_a_state_change(self):
        store = self.make_store()
        execution = await store.create(an_execution())
        attempt = await store.record_attempt(an_attempt(execution))

        event = await store.record(
            execution.execution_id,
            Observation.moved(LifecycleEvent.ASSIGN, message="submitted"),
            attempt_id=attempt.attempt_id,
        )

        assert event.state is ExecutionState.ASSIGNED
        assert (await store.get("exec_1")).status is ExecutionState.ASSIGNED

    @pytest.mark.asyncio
    async def test_a_worker_cannot_talk_an_execution_out_of_a_terminal_state(self):
        """Conformance scenario 9: a cancellation racing a completion.

        The worker's report is kept, as the refusal it is, and the
        execution stays cancelled. Raising instead would let one confused
        worker take down whatever was reading its stream.
        """
        store = self.make_store()
        execution, attempt = await _running(store)
        await store.set_state(execution.execution_id, LifecycleEvent.CANCEL)

        event = await store.record(
            execution.execution_id,
            Observation.moved(LifecycleEvent.COMPLETE, message="completed"),
            attempt_id=attempt.attempt_id,
        )

        assert event.type is ExecutionEventType.ERROR
        assert event.error is not None
        assert event.error.code is ErrorCode.INVALID_TRANSITION
        assert (await store.get("exec_1")).status is ExecutionState.CANCELLED

    @pytest.mark.asyncio
    async def test_an_observed_milestone_is_recorded_as_one(self):
        store = self.make_store()
        execution, attempt = await _running(store)

        event = await store.record(
            execution.execution_id,
            Observation.acknowledged(
                AcknowledgementKind.STARTED, message="the worker has it"
            ),
            attempt_id=attempt.attempt_id,
        )

        assert event.acknowledgement is not None
        assert event.acknowledgement.attempt_id == attempt.attempt_id
        assert [
            milestone.kind for milestone in await store.acknowledgements("exec_1")
        ] == [AcknowledgementKind.STARTED]

    @pytest.mark.asyncio
    async def test_a_protocol_handle_lands_on_the_attempt_and_the_binding(self):
        """What a re-attach after a disconnect needs (scenario 4).

        The handle is learnt mid-stream; if it were only on the event
        stream, the next step would have to read every event to find out
        what the worker calls this work.
        """
        store = self.make_store()
        execution, attempt = await _running(store)

        await store.record(
            execution.execution_id,
            Observation.progress(
                "working", session_id="sess-1", protocol_task_id="task-1"
            ),
            attempt_id=attempt.attempt_id,
        )

        (dispatched,) = await store.attempts(execution.execution_id)
        assert dispatched.protocol_task_id == "task-1"
        assert dispatched.session_id == "sess-1"
        assert (await store.get("exec_1")).agent.session_id == "sess-1"

    @pytest.mark.asyncio
    async def test_an_error_observation_is_kept_without_moving_anything(self):
        store = self.make_store()
        execution, attempt = await _running(store)

        event = await store.record(
            execution.execution_id,
            Observation.failed(
                OrchestrationError(
                    code=ErrorCode.UNSUPPORTED_OPERATION,
                    message="this worker cannot pause",
                )
            ),
            attempt_id=attempt.attempt_id,
        )

        assert event.type is ExecutionEventType.ERROR
        assert (await store.get("exec_1")).status is ExecutionState.RUNNING

    @pytest.mark.asyncio
    async def test_events_are_numbered_so_a_reconnect_loses_nothing(self):
        store = self.make_store()
        execution, attempt = await _running(store)
        for index in range(3):
            await store.record(
                execution.execution_id,
                Observation.progress(f"step {index}"),
                attempt_id=attempt.attempt_id,
            )

        events = await store.events(execution.execution_id)
        assert [event.sequence for event in events] == list(range(1, len(events) + 1))

        after = await store.events(
            execution.execution_id, from_sequence=events[-2].sequence
        )
        assert [event.sequence for event in after] == [events[-1].sequence]


class ExecutionStoreContract(
    CreatingContract,
    ListingContract,
    StateContract,
    RecordsContract,
    RecordingObservationsContract,
):
    """Every rule of the port, for one store implementation."""

    def make_store(self) -> ExecutionStore:
        """A fresh, empty store; each test asks for its own."""
        raise NotImplementedError("a contract subclass answers the store it tests")
