# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the adapter port (PLAN_ORCHESTRATOR.md, O0-05).

The port's job is to make two mistakes impossible: an adapter that answers
as though it had done something it cannot do, and an adapter whose reduced
guarantees are known only to whoever wrote it. So a capability report that
does not account for an operation does not exist, an optional operation
nobody implemented returns the refusal from that report, and the report
itself is an observation that lands on the execution.
"""

from __future__ import annotations

import json

import pytest
from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    ArtifactType,
    ExecutionEventType,
    LifecycleEvent,
    WorkerOperation,
)

from agent_runtimes.orchestration.adapter import (
    AdapterCapabilities,
    Observation,
    ResolvedWorker,
    Unsupported,
    WorkerAdapter,
    answer_artifact,
    capability_report,
    objective_prompt,
    trace_id_of,
)
from agent_runtimes.tests.orchestration_records import (
    NOTEBOOK,
    an_attempt,
    an_execution,
)

_PROTOCOL = AgentProtocol.DATALAYER


def _refusals(*operations: WorkerOperation) -> tuple[Unsupported, ...]:
    """
    A refusal for each operation named, for building reports in tests.

    Parameters
    ----------
    *operations : WorkerOperation
        What the adapter cannot do.

    Returns
    -------
    tuple[Unsupported, ...]
        The refusals.
    """
    return tuple(
        Unsupported(operation=operation, protocol=_PROTOCOL, reason="nothing does this")
        for operation in operations
    )


class NullAdapter(WorkerAdapter):
    """An adapter that can be resolved and does nothing else.

    It is what proves the defaults: every optional operation answers with
    the refusal in its report rather than with a silent success.
    """

    def capabilities(self) -> AdapterCapabilities:
        """
        Nothing at all, said in full.

        Returns
        -------
        AdapterCapabilities
            A report refusing every operation.
        """
        return AdapterCapabilities(
            protocol=_PROTOCOL,
            supported=frozenset(),
            unsupported=_refusals(*WorkerOperation),
        )

    async def resolve(self, binding: AgentBinding) -> ResolvedWorker:
        """
        Answer with a worker that is not reachable.

        Parameters
        ----------
        binding : AgentBinding
            Which worker.

        Returns
        -------
        ResolvedWorker
            The worker.
        """
        return ResolvedWorker(binding=binding, capabilities=self.capabilities())

    async def dispatch(self, worker, execution, attempt):
        """
        Report nothing, having done nothing.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt.

        Yields
        ------
        Observation
            The capability report, and no more.
        """
        yield capability_report(worker.capabilities)

    async def subscribe(self, worker, execution, attempt):
        """
        Report nothing.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt.

        Yields
        ------
        Observation
            Nothing at all.
        """
        return
        yield  # pragma: no cover - an empty async generator needs the yield

    async def cancel(self, worker, execution, attempt, *, reason=None):
        """
        Refuse, from the report.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt.
        reason : str | None
            Why.

        Returns
        -------
        Unsupported
            The refusal.
        """
        return self.refuse(WorkerOperation.CANCEL)


# ---------------------------------------------------------------------------
# The capability report
# ---------------------------------------------------------------------------


class TestCapabilities:
    def test_a_report_must_account_for_every_operation(self):
        with pytest.raises(ValueError, match="say nothing"):
            AdapterCapabilities(
                protocol=_PROTOCOL,
                supported=frozenset({WorkerOperation.DELEGATE}),
                unsupported=_refusals(WorkerOperation.PAUSE),
            )

    def test_an_operation_cannot_be_claimed_and_refused_at_once(self):
        with pytest.raises(ValueError, match="at once"):
            AdapterCapabilities(
                protocol=_PROTOCOL,
                supported=frozenset(WorkerOperation),
                unsupported=_refusals(WorkerOperation.PAUSE),
            )

    def test_a_refusal_names_the_protocol_it_belongs_to(self):
        with pytest.raises(ValueError, match="name the protocol"):
            AdapterCapabilities(
                protocol=AgentProtocol.A2A,
                supported=frozenset(),
                unsupported=tuple(
                    Unsupported(
                        operation=operation, protocol=_PROTOCOL, reason="wrong protocol"
                    )
                    for operation in WorkerOperation
                ),
            )

    def test_a_narrowing_learnt_from_a_worker_is_added_not_mutated(self):
        report = NullAdapter().capabilities()

        narrowed = report.with_reduction("this one cannot fork either")

        assert narrowed.reductions == ("this one cannot fork either",)
        assert report.reductions == ()

    def test_the_report_travels_as_data_a_person_can_read(self):
        wire = AdapterCapabilities(
            protocol=AgentProtocol.A2A,
            supported=frozenset({WorkerOperation.DELEGATE}),
            unsupported=tuple(
                Unsupported(
                    operation=operation,
                    protocol=AgentProtocol.A2A,
                    reason="A2A has no such thing",
                )
                for operation in WorkerOperation
                if operation is not WorkerOperation.DELEGATE
            ),
            acknowledgements=frozenset({AcknowledgementKind.RECEIVED}),
            reductions=("no acceptance",),
        ).to_wire()

        assert wire["supported"] == ["delegate"]
        assert {entry["operation"] for entry in wire["unsupported"]} == {
            operation.value
            for operation in WorkerOperation
            if operation is not WorkerOperation.DELEGATE
        }
        assert wire["acknowledgements"] == ["received"]
        assert wire["reductions"] == ["no acceptance"]


# ---------------------------------------------------------------------------
# What an adapter is not allowed to fake
# ---------------------------------------------------------------------------


class TestUnsupportedOperations:
    @pytest.mark.asyncio
    async def test_every_optional_operation_answers_with_its_refusal(self):
        adapter = NullAdapter()
        execution = an_execution()
        attempt = an_attempt(execution)
        worker = await adapter.resolve(execution.agent)

        outcomes = [
            await adapter.steer(worker, execution, attempt, instructions="go left"),
            await adapter.pause(worker, execution, attempt),
            await adapter.resume(worker, execution, attempt),
            await adapter.terminate(worker, execution, attempt),
            await adapter.cancel(worker, execution, attempt),
        ]

        assert all(isinstance(outcome, Unsupported) for outcome in outcomes)
        assert [outcome.operation for outcome in outcomes] == [
            WorkerOperation.STEER,
            WorkerOperation.PAUSE,
            WorkerOperation.RESUME,
            WorkerOperation.TERMINATE,
            WorkerOperation.CANCEL,
        ]

    def test_a_refusal_carries_the_canonical_error_a_worker_gets_told(self):
        refusal = _refusals(WorkerOperation.PAUSE)[0]

        error = refusal.as_error()

        assert error.code.value == "unsupported_operation"
        assert "pause" in error.message and not error.retryable

    def test_claiming_an_operation_and_not_implementing_it_is_loud(self):
        """The mistake worth failing on.

        Refusing something the report claims is supported would be a silent
        lie; a caller would read the report, ask for the operation, and be
        told it did not happen without ever being told it could not.
        """

        class Claims(NullAdapter):
            def capabilities(self) -> AdapterCapabilities:
                """
                Claim everything, implement nothing.

                Returns
                -------
                AdapterCapabilities
                    A report claiming every operation.
                """
                return AdapterCapabilities(
                    protocol=_PROTOCOL, supported=frozenset(WorkerOperation)
                )

        with pytest.raises(NotImplementedError, match="does not implement"):
            Claims().refuse(WorkerOperation.PAUSE)

    @pytest.mark.asyncio
    async def test_the_reduction_is_reported_on_the_execution(self):
        """19.8, decision 5: reported, not hidden.

        The first thing a dispatch says is what it cannot do, so the answer
        to "why did this execution never checkpoint?" is on the execution.
        """
        adapter = NullAdapter()
        execution = an_execution()
        worker = await adapter.resolve(execution.agent)

        reports = [
            observation
            async for observation in adapter.dispatch(
                worker, execution, an_attempt(execution)
            )
        ]

        (report,) = reports
        assert report.type is ExecutionEventType.PROGRESS
        assert report.data is not None
        refused = report.data["adapterCapabilities"]["unsupported"]
        assert {entry["operation"] for entry in refused} == {
            operation.value for operation in WorkerOperation
        }


# ---------------------------------------------------------------------------
# Observations
# ---------------------------------------------------------------------------


class TestObservations:
    def test_an_observation_must_carry_what_its_type_promises(self):
        with pytest.raises(ValueError, match="lifecycle_event"):
            Observation(type=ExecutionEventType.STATE_CHANGED)
        with pytest.raises(ValueError, match="artifact"):
            Observation(type=ExecutionEventType.ARTIFACT_REGISTERED)
        with pytest.raises(ValueError, match="says nothing"):
            Observation(type=ExecutionEventType.PROGRESS)

    def test_an_observation_reports_what_was_seen_never_the_state_it_produces(self):
        observation = Observation.moved(LifecycleEvent.START, message="working")

        assert observation.lifecycle_event is LifecycleEvent.START
        # There is no state on an observation to be wrong about.
        assert not hasattr(observation, "state")


# ---------------------------------------------------------------------------
# What both bindings share
# ---------------------------------------------------------------------------


class TestSharedRendering:
    def test_the_objective_names_its_context_rather_than_carrying_it(self):
        prompt = objective_prompt(an_execution())

        assert "Validate the notebook from a clean sandbox" in prompt
        assert "Run it top to bottom." in prompt
        assert "- Every cell runs" in prompt
        assert f"- {NOTEBOOK} (read-only, required)" in prompt

    def test_an_answer_becomes_an_artifact_with_provenance(self):
        execution = an_execution()
        attempt = an_attempt(execution)

        artifact = answer_artifact(execution, attempt, "the notebook runs clean")

        assert artifact.type is ArtifactType.FILE
        assert artifact.media_type == "text/plain"
        (provenance,) = artifact.provenance
        assert provenance.attempt_id == attempt.attempt_id
        assert provenance.source_references == [NOTEBOOK]
        assert provenance.content_hash is not None
        assert provenance.content_hash.startswith("sha256:")
        assert provenance.trace_id == "4bf92f3577b34da6a3ce929d0e0e4736"

    def test_a_structured_answer_is_registered_as_structured(self):
        execution = an_execution()

        artifact = answer_artifact(
            execution, an_attempt(execution), json.dumps({"cells": 12})
        )

        assert artifact.type is ArtifactType.JSON
        assert artifact.media_type == "application/json"

    def test_a_worker_that_drops_the_trace_shows_as_a_broken_link(self):
        assert trace_id_of(None) is None
        assert trace_id_of("nonsense") is None
