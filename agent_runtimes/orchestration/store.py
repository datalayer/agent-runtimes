# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where executions live in Phase 0 (PLAN_ORCHESTRATOR.md, O0-04).

An ``ExecutionStore`` holds the executions, their attempts, their events,
their acknowledgements and their artifacts, and it is the only place any of
those change. In Phase 0 it is a dictionary in a process; in Phase 1 it is
Solr (O1-02). Both implement the same twelve storage primitives, and both
inherit the rules written here — so the rules are not something the Solr
store gets a second chance to have an opinion about.

The most important of those rules is that a state change goes through
``datalayer_core.orchestration.lifecycle.transition`` (O0-02). The store
does not know which states exist, which are terminal or which moves are
allowed; it asks. A worker reporting that it completed a cancelled
execution therefore gets an ``invalid_transition`` recorded against it
rather than a state, which is conformance scenario 9 written down once
instead of in every adapter.

``record`` is the second rule: it is where an adapter's ``Observation``
(O0-05) becomes canonical. The adapter says what it saw, the lifecycle says
what that means, and the store stamps the correlation — root, parent,
execution, attempt, agent, session, protocol, traceparent — that makes the
event placeable in a tree afterwards. An adapter filling those in itself
would be an adapter deciding them.

Nothing is ported when Phase 1 arrives. ``durable``, ``runtimes`` and
``jupyter-mcp-server`` already depend on ``agent-runtimes`` and import it in
process, so the durable worker and the control plane consume this module as
a library; only the implementation behind the port changes.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from abc import ABC, abstractmethod
from typing import Any, Mapping

from datalayer_core.orchestration import (
    Acknowledgement,
    Artifact,
    ArtifactCommit,
    ArtifactStatus,
    Attempt,
    ErrorCode,
    Execution,
    ExecutionEvent,
    ExecutionEventType,
    ExecutionState,
    InvalidTransition,
    LifecycleEvent,
    OrchestrationError,
    is_terminal,
    transition,
)
from datalayer_core.orchestration import commit_artifacts as arbitrate

from agent_runtimes.orchestration.adapter import Observation, now

__all__ = [
    "REATTACHED",
    "ExecutionConflict",
    "ExecutionNotFound",
    "ExecutionStore",
    "ExecutionStoreError",
    "InMemoryExecutionStore",
    "event_for",
    "now",
]

logger = logging.getLogger(__name__)

#: The ``data`` key of the progress event ``record_reattach`` appends when a
#: watcher lost sight of an attempt and asked its worker again. It holds the
#: attempt's number, and it is what tells a disconnect apart in the settled
#: measure of O1-14.
REATTACHED = "reattached"


class ExecutionStoreError(Exception):
    """Something the store was asked to do that it must not do."""


class ExecutionNotFound(ExecutionStoreError):
    """An execution that is not there, said so rather than returned as ``None``.

    A caller acting on an execution has a reason to believe it exists, and a
    ``None`` that flows on becomes a failure somewhere it cannot be
    explained. ``find_by_idempotency_key`` is the one lookup that answers
    ``None``, because asking whether a command has been seen before is a
    question whose answer is legitimately no.
    """

    def __init__(self, execution_id: str) -> None:
        """
        Name the execution that is missing.

        Parameters
        ----------
        execution_id : str
            The execution that was asked for.
        """
        self.execution_id = execution_id
        super().__init__(f"No execution '{execution_id}'.")


class ExecutionConflict(ExecutionStoreError):
    """Two things that cannot both be true of one execution.

    Raised when an execution identifier is reused, and when an idempotency
    key comes back with a different intent behind it: section 6.4 wants the
    second delivery of a delegation to find the first execution, and a key
    reused for different work is a caller's mistake, not a second execution.
    """


def event_for(
    execution: Execution,
    event_type: ExecutionEventType,
    *,
    attempt_id: str | None = None,
    state: ExecutionState | None = None,
    previous_state: ExecutionState | None = None,
    lifecycle_event: LifecycleEvent | None = None,
    acknowledgement: Acknowledgement | None = None,
    artifact: Artifact | None = None,
    error: OrchestrationError | None = None,
    approval_uid: str | None = None,
    message: str | None = None,
    data: Mapping[str, Any] | None = None,
) -> ExecutionEvent:
    """
    Build one event, correlated to the execution it happened to.

    The correlation is taken from the execution rather than from the caller,
    because a root, a parent and a protocol restated at every call site are
    a root, a parent and a protocol that eventually disagree. ``sequence``
    is left at zero: the store stamps it, since a sequence a caller chooses
    is a sequence two callers can choose the same value for.

    Parameters
    ----------
    execution : Execution
        The execution the event belongs to.
    event_type : ExecutionEventType
        What the event is telling a subscriber.
    attempt_id : str | None
        The attempt it was observed on, when there is one.
    state : ExecutionState | None
        The state after the change, for a state change.
    previous_state : ExecutionState | None
        The state before it.
    lifecycle_event : LifecycleEvent | None
        What was observed, which produced the state.
    acknowledgement : Acknowledgement | None
        The milestone, for an acknowledgement.
    artifact : Artifact | None
        The artifact, for a registration.
    error : OrchestrationError | None
        What went wrong, when something did.
    approval_uid : str | None
        The platform approval this event waits on, when there is one.
    message : str | None
        What to show a reader.
    data : Mapping[str, Any] | None
        What the adapter observed that has no canonical field. Untrusted.

    Returns
    -------
    ExecutionEvent
        The event, ready to be appended.
    """
    return ExecutionEvent(
        event_id=f"evt_{uuid.uuid4().hex}",
        type=event_type,
        sequence=0,
        emitted_at=now(),
        root_execution_id=execution.root_execution_id,
        execution_id=execution.execution_id,
        parent_execution_id=execution.parent_execution_id,
        attempt_id=attempt_id or execution.current_attempt_id,
        agent_id=execution.agent.agent_id,
        session_id=execution.agent.session_id,
        protocol=execution.agent.protocol,
        traceparent=execution.trace.traceparent,
        state=state,
        previous_state=previous_state,
        lifecycle_event=lifecycle_event,
        acknowledgement=acknowledgement,
        artifact=artifact,
        error=error,
        approval_uid=approval_uid,
        message=message,
        data=dict(data) if data is not None else None,
    )


class ExecutionStore(ABC):
    """The port the control plane and the durable worker hold an execution through.

    Twelve primitives are abstract — they are storage, and Solr will do them
    differently — and the rules on top of them are concrete, because a rule
    implemented twice is a rule that holds in one place and not the other.

    Atomicity belongs to the implementation. This one takes a lock per
    process; the Solr store of O1-02 will need optimistic concurrency, since
    two durable workers can reach the same execution at once.
    """

    # -- Storage primitives. -------------------------------------------------

    @abstractmethod
    async def save(
        self, execution: Execution, *, idempotency_key: str | None = None
    ) -> None:
        """
        Insert or replace one execution, remembering the key of the command.

        Parameters
        ----------
        execution : Execution
            The execution to write.
        idempotency_key : str | None
            The key of the command that created it, on the insert only.
        """

    @abstractmethod
    async def get(self, execution_id: str) -> Execution:
        """
        The execution, or a refusal to pretend there is one.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        Execution
            The execution.

        Raises
        ------
        ExecutionNotFound
            When there is no such execution.
        """

    @abstractmethod
    async def find_by_idempotency_key(self, idempotency_key: str) -> Execution | None:
        """
        The execution a command with this key already created, if any.

        Parameters
        ----------
        idempotency_key : str
            The key the caller sent with its command.

        Returns
        -------
        Execution | None
            The execution, or ``None`` when the command is new.
        """

    @abstractmethod
    async def list_executions(
        self,
        *,
        root_execution_id: str | None = None,
        parent_execution_id: str | None = None,
        status: ExecutionState | None = None,
    ) -> list[Execution]:
        """
        The executions matching every filter given, oldest first.

        Listing by root is how a tree is read in one query, which is why
        every execution carries its root including the root itself. It is
        not called ``list``: a method of that name shadows the builtin
        inside the class body, and every ``list[...]`` annotation below it
        would then be annotating with a method.

        Parameters
        ----------
        root_execution_id : str | None
            Only executions in this tree.
        parent_execution_id : str | None
            Only the children of this execution.
        status : ExecutionState | None
            Only executions in this state.

        Returns
        -------
        list[Execution]
            The matching executions.
        """

    @abstractmethod
    async def save_attempt(self, attempt: Attempt) -> None:
        """
        Insert or replace one attempt.

        Parameters
        ----------
        attempt : Attempt
            The attempt to write.
        """

    @abstractmethod
    async def attempts(self, execution_id: str) -> list[Attempt]:
        """
        Every dispatch of this execution, in the order they were made.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        list[Attempt]
            Its attempts.
        """

    @abstractmethod
    async def append_event(self, event: ExecutionEvent) -> ExecutionEvent:
        """
        Append one event, stamping the sequence the caller must not choose.

        Parameters
        ----------
        event : ExecutionEvent
            The event, correlated by ``event_for``.

        Returns
        -------
        ExecutionEvent
            The event as stored, with its sequence.
        """

    @abstractmethod
    async def events(
        self, execution_id: str, *, from_sequence: int | None = None
    ) -> list[ExecutionEvent]:
        """
        The events of one execution, in sequence.

        ``from_sequence`` is what makes a reconnect lossless: a subscriber
        asks for everything after the last number it saw.

        Parameters
        ----------
        execution_id : str
            Which execution.
        from_sequence : int | None
            Only events after this sequence.

        Returns
        -------
        list[ExecutionEvent]
            The events.
        """

    @abstractmethod
    async def save_acknowledgement(self, acknowledgement: Acknowledgement) -> None:
        """
        Insert one acknowledgement.

        Parameters
        ----------
        acknowledgement : Acknowledgement
            The milestone reached.
        """

    @abstractmethod
    async def acknowledgements(self, execution_id: str) -> list[Acknowledgement]:
        """
        The milestones this execution has reached, in the order reached.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        list[Acknowledgement]
            Its acknowledgements.
        """

    @abstractmethod
    async def save_artifact(self, execution_id: str, artifact: Artifact) -> None:
        """
        Insert or replace one artifact of one execution.

        Parameters
        ----------
        execution_id : str
            The execution that produced it.
        artifact : Artifact
            The artifact.
        """

    @abstractmethod
    async def artifacts(self, execution_id: str) -> list[Artifact]:
        """
        The artifacts registered against this execution.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        list[Artifact]
            Its artifacts.
        """

    @property
    def account_uid(self) -> str | None:
        """
        The account this store's executions belong to, when it is opened for one.

        The canonical execution names no owner, so the owner is the store's
        (O1-01), and the measures of O1-14 are filed under it. A store that
        is not scoped — the in-memory one, an operator's tool — answers
        ``None``, and its points are filed under whoever exports them.

        Returns
        -------
        str | None
            The account, or ``None``.
        """
        return None

    # -- Rules, shared by every implementation. ------------------------------

    def _delegated(self, execution: Execution, *, duplicate: bool) -> None:
        """
        Count one delegation (O1-14), new or already seen.

        Imported where it is used, as the trace is in ``_append``: the
        measures live in ``monitoring``, whose package brings pydantic-ai.

        Parameters
        ----------
        execution : Execution
            The execution created, or the one the command already created.
        duplicate : bool
            Whether the command had been delivered before.
        """
        from agent_runtimes.monitoring.orchestration_measures import (
            delegation_received,
        )

        delegation_received(
            execution, duplicate=duplicate, account_uid=self.account_uid
        )

    async def _settled(self, execution: Execution) -> None:
        """
        Count an execution that has just reached its terminal state (O1-14).

        Read once, here, rather than tracked while the execution moved: how
        it got here — whether its worker was lost, whether its watcher had to
        ask again — is in its events, and only a settled execution has all of
        them.

        Parameters
        ----------
        execution : Execution
            The execution, in its terminal state.
        """
        from agent_runtimes.monitoring.orchestration_measures import (
            execution_settled,
        )

        try:
            events = await self.events(execution.execution_id)
        except Exception as error:  # noqa: BLE001 - a measure never fails the work
            logger.debug("Settled %s unmeasured: %s", execution.execution_id, error)
            return
        execution_settled(execution, events, account_uid=self.account_uid)

    async def _append(self, event: ExecutionEvent) -> ExecutionEvent:
        """
        Append one event, and put it on the tree's trace as well (O0-11).

        ``append_event`` is storage and the Solr store reimplements it; the
        trace hangs here instead, so every implementation tells the same
        story and the span event carries exactly the correlation this store
        stamped rather than a second copy computed somewhere else.

        Imported where it is used rather than at module scope:
        ``monitoring.otel`` is the pydantic-ai capability hook's home and
        brings pydantic-ai in with it, and this store is imported by
        processes that have no agent in them.

        Parameters
        ----------
        event : ExecutionEvent
            The event, correlated by ``event_for``.

        Returns
        -------
        ExecutionEvent
            The event as stored, with its sequence.
        """
        stored = await self.append_event(event)
        from agent_runtimes.monitoring.otel import record_execution_event

        record_execution_event(stored)
        return stored

    async def create(
        self, execution: Execution, *, idempotency_key: str | None = None
    ) -> Execution:
        """
        Create an execution, or find the one this command already created.

        Duplicate delivery is ordinary — a client retries, a queue
        redelivers, a person clicks twice (section 6.4) — so a key that has
        been seen returns the execution it made. The same key behind
        different work is a conflict: the caller has reused a key, and
        answering with an execution that is not the one it asked for would
        be worse than refusing.

        Parameters
        ----------
        execution : Execution
            The execution to create.
        idempotency_key : str | None
            The key of the ``executions.delegate`` that asked for it.

        Returns
        -------
        Execution
            The execution created, or the one the first delivery created.

        Raises
        ------
        ExecutionConflict
            When the identifier is reused, or the key is reused for other work.
        """
        if idempotency_key:
            existing = await self.find_by_idempotency_key(idempotency_key)
            if existing is not None:
                if not _same_intent(existing, execution):
                    raise ExecutionConflict(
                        f"Idempotency key '{idempotency_key}' already created "
                        f"execution '{existing.execution_id}' for different work."
                    )
                self._delegated(existing, duplicate=True)
                return existing
        try:
            await self.get(execution.execution_id)
        except ExecutionNotFound:
            pass
        else:
            raise ExecutionConflict(
                f"Execution '{execution.execution_id}' already exists."
            )
        try:
            await self.save(execution, idempotency_key=idempotency_key)
        except ExecutionConflict:
            # Two deliveries of one command raced past the lookup above: a
            # store that claims the key atomically refuses the second. That
            # one finds the execution the first made, as it would have had
            # it arrived a moment later.
            if idempotency_key:
                existing = await self.find_by_idempotency_key(idempotency_key)
                if existing is not None and _same_intent(existing, execution):
                    self._delegated(existing, duplicate=True)
                    return existing
            raise
        await self._append(
            event_for(
                execution,
                ExecutionEventType.STATE_CHANGED,
                state=execution.status,
                message=execution.objective.goal,
            )
        )
        self._delegated(execution, duplicate=False)
        return execution

    async def set_state(
        self,
        execution_id: str,
        lifecycle_event: LifecycleEvent,
        *,
        attempt_id: str | None = None,
        message: str | None = None,
        error: OrchestrationError | None = None,
        approval_uid: str | None = None,
    ) -> Execution:
        """
        Move an execution, if the canonical lifecycle allows the move.

        Parameters
        ----------
        execution_id : str
            Which execution.
        lifecycle_event : LifecycleEvent
            What was observed or commanded.
        attempt_id : str | None
            The attempt it was observed on, which is moved with it.
        message : str | None
            What to record against the new state.
        error : OrchestrationError | None
            The failure, when this is one.
        approval_uid : str | None
            The platform approval the move waits on, or that ended the wait:
            a ``wait`` for a person and the ``resume`` their decision brought
            name it on their events (O1-08).

        Returns
        -------
        Execution
            The execution in its new state.

        Raises
        ------
        InvalidTransition
            When the lifecycle refuses the move.
        """
        execution, _ = await self._move(
            await self.get(execution_id),
            lifecycle_event,
            attempt_id=attempt_id,
            message=message,
            error=error,
            approval_uid=approval_uid,
        )
        return execution

    async def record_attempt(self, attempt: Attempt) -> Attempt:
        """
        Record one dispatch, and make it the execution's current one.

        Parameters
        ----------
        attempt : Attempt
            The attempt, whose ``number`` the caller owns: 1 for the first
            dispatch, then upwards, so a retry is distinguishable from a
            duplicate.

        Returns
        -------
        Attempt
            The attempt as stored.
        """
        execution = await self.get(attempt.execution_id)
        existing = {
            known.attempt_id for known in await self.attempts(attempt.execution_id)
        }
        await self.save_attempt(attempt)
        if attempt.attempt_id not in existing:
            await self.save(
                execution.model_copy(
                    update={
                        "current_attempt_id": attempt.attempt_id,
                        "attempt_count": len(existing) + 1,
                        "updated_at": now(),
                    }
                )
            )
        return attempt

    async def record_acknowledgement(
        self, acknowledgement: Acknowledgement
    ) -> Acknowledgement:
        """
        Record one milestone of section 6.3, and put it on the event stream.

        Parameters
        ----------
        acknowledgement : Acknowledgement
            The milestone reached.

        Returns
        -------
        Acknowledgement
            The same record, once stored.
        """
        stored, _ = await self._acknowledge(
            await self.get(acknowledgement.execution_id), acknowledgement
        )
        return stored

    async def register_artifact(
        self, execution_id: str, artifact: Artifact
    ) -> Artifact:
        """
        Register an output against the execution that produced it.

        Registering an artifact identifier twice adds the second attempt's
        provenance to the one record rather than replacing it, and a record
        that is already committed is never demoted by a later registration:
        the first attempt to commit wins (19.8, decision 4). Deciding which
        of two artifacts supersedes the other is O0-10's, on the canonical
        model, where the rule can be stated once for every store.

        Parameters
        ----------
        execution_id : str
            The execution that produced it.
        artifact : Artifact
            The artifact.

        Returns
        -------
        Artifact
            The artifact as stored, provenance merged.
        """
        stored, _ = await self._register(await self.get(execution_id), artifact)
        return stored

    async def commit_artifacts(
        self, execution_id: str, attempt_id: str
    ) -> ArtifactCommit:
        """
        Commit what one attempt produced, and write back what that decided.

        ``commit_artifacts`` in ``core`` decides — the first attempt to
        commit wins, and a later one's artifacts are kept and superseded
        (19.8, decision 4). This is where the decision is stored, said on the
        event stream and counted (O1-14). Durable's commit step and the O0-13
        example both call it, so a commit is written in one place rather than
        once per caller.

        Parameters
        ----------
        execution_id : str
            The execution whose artifacts are committed.
        attempt_id : str
            The attempt asking to commit.

        Returns
        -------
        ArtifactCommit
            The set after arbitration, and who holds the result.
        """
        execution = await self.get(execution_id)
        known = await self.artifacts(execution_id)
        decision = arbitrate(known, execution_id=execution_id, attempt_id=attempt_id)
        before = {artifact.artifact_id: artifact for artifact in known}
        changed = [
            artifact
            for artifact in decision.artifacts
            if before.get(artifact.artifact_id) != artifact
        ]
        for artifact in changed:
            await self.save_artifact(execution_id, artifact)
        if changed:
            await self.record(
                execution_id,
                Observation.progress(
                    f"Committed the artifacts of {decision.winning_attempt_id}.",
                    data={
                        "committed": [artifact.artifact_id for artifact in changed],
                        "won": decision.won,
                    },
                ),
                attempt_id=attempt_id,
            )
            from agent_runtimes.monitoring.orchestration_measures import (
                artifacts_committed,
            )

            artifacts_committed(execution, changed, account_uid=self.account_uid)
        return decision

    async def record_reattach(
        self, execution_id: str, attempt: Attempt, *, reason: str
    ) -> ExecutionEvent:
        """
        Say that whoever watched an attempt lost sight of it and is asking again.

        Section 10 records recoveries, and a re-attach is one. A process that
        picks a run up after the one watching it died, or a watch that ended
        before its attempt did, otherwise leaves nothing in the execution's
        history, and section 16's share of executions completing after a
        disconnect could not count it (O1-14).

        Parameters
        ----------
        execution_id : str
            The execution.
        attempt : Attempt
            The attempt re-attached to, through the handle it recorded.
        reason : str
            Why sight of it was lost, in words.

        Returns
        -------
        ExecutionEvent
            The progress event, carrying ``REATTACHED``.
        """
        return await self.record(
            execution_id,
            Observation.progress(reason, data={REATTACHED: attempt.number}),
            attempt_id=attempt.attempt_id,
        )

    async def record(
        self,
        execution_id: str,
        observation: Observation,
        *,
        attempt_id: str | None = None,
    ) -> ExecutionEvent:
        """
        Turn one adapter observation into canonical state and one event.

        This is the seam of section 4: adapters report, the control plane
        decides. Until the control plane exists (O1-01) this is where the
        deciding happens, so both adapters and the conformance harness go
        through the same code rather than each having its own idea of what a
        worker's report means.

        An observation the lifecycle refuses is recorded as the refusal it
        is — an ``invalid_transition`` error event — instead of raising:
        a worker that reports nonsense must not be able to break the control
        plane, and the nonsense is worth keeping.

        Parameters
        ----------
        execution_id : str
            The execution the observation is about.
        observation : Observation
            What the adapter saw.
        attempt_id : str | None
            The attempt it was seen on.

        Returns
        -------
        ExecutionEvent
            The event that was appended.
        """
        execution = await self.get(execution_id)
        attempt_id = attempt_id or execution.current_attempt_id
        if observation.session_id or observation.protocol_task_id:
            execution = await self._remember_handles(execution, attempt_id, observation)

        if observation.type is ExecutionEventType.STATE_CHANGED:
            assert observation.lifecycle_event is not None  # Observation enforces it.
            try:
                _, event = await self._move(
                    execution,
                    observation.lifecycle_event,
                    attempt_id=attempt_id,
                    message=observation.message,
                    error=observation.error,
                )
            except InvalidTransition as refused:
                return await self._append(
                    event_for(
                        execution,
                        ExecutionEventType.ERROR,
                        attempt_id=attempt_id,
                        error=OrchestrationError(
                            code=ErrorCode.INVALID_TRANSITION,
                            message=str(refused),
                            retryable=False,
                            source=f"adapter:{execution.agent.protocol.value}",
                        ),
                        message=observation.message,
                        data=observation.data,
                    )
                )
            return event

        if observation.type is ExecutionEventType.ACKNOWLEDGED:
            assert observation.acknowledgement is not None
            _, event = await self._acknowledge(
                execution,
                Acknowledgement(
                    kind=observation.acknowledgement,
                    execution_id=execution.execution_id,
                    attempt_id=attempt_id,
                    acknowledged_at=now(),
                    checkpoint_id=observation.checkpoint_id,
                    detail=observation.message,
                ),
            )
            return event

        if observation.type is ExecutionEventType.ARTIFACT_REGISTERED:
            assert observation.artifact is not None
            _, event = await self._register(
                execution, observation.artifact, data=observation.data
            )
            return event

        return await self._append(
            event_for(
                execution,
                observation.type,
                attempt_id=attempt_id,
                error=observation.error,
                message=observation.message,
                data=observation.data,
            )
        )

    # -- The rules' working parts. -------------------------------------------

    async def _move(
        self,
        execution: Execution,
        lifecycle_event: LifecycleEvent,
        *,
        attempt_id: str | None,
        message: str | None,
        error: OrchestrationError | None,
        approval_uid: str | None = None,
    ) -> tuple[Execution, ExecutionEvent]:
        """
        Transition, store, keep the attempt in step, and say what happened.

        Parameters
        ----------
        execution : Execution
            The execution as it stands.
        lifecycle_event : LifecycleEvent
            What was observed or commanded.
        attempt_id : str | None
            The attempt to move with it.
        message : str | None
            What to record against the new state.
        error : OrchestrationError | None
            The failure, when this is one.
        approval_uid : str | None
            The platform approval the move waits on or was decided by.

        Returns
        -------
        tuple[Execution, ExecutionEvent]
            The execution in its new state, and the event that says so.

        Raises
        ------
        InvalidTransition
            When the lifecycle refuses the move.
        """
        previous = execution.status
        # The lifecycle decides. This raises before anything is written, so a
        # refused move leaves no trace of having half happened.
        state = transition(previous, lifecycle_event)
        updates: dict[str, Any] = {"status": state, "updated_at": now()}
        if message is not None:
            updates["status_message"] = message
        if error is not None:
            updates["error"] = error
        moved = execution.model_copy(update=updates)
        await self.save(moved)
        await self._move_attempt(moved, attempt_id, state, error)
        event = await self._append(
            event_for(
                moved,
                ExecutionEventType.STATE_CHANGED,
                attempt_id=attempt_id,
                state=state,
                previous_state=previous,
                lifecycle_event=lifecycle_event,
                error=error,
                approval_uid=approval_uid,
                message=message,
            )
        )
        if is_terminal(state):
            await self._settled(moved)
        return moved, event

    async def _move_attempt(
        self,
        execution: Execution,
        attempt_id: str | None,
        state: ExecutionState,
        error: OrchestrationError | None,
    ) -> None:
        """
        Carry a state change onto the attempt it was observed on.

        An attempt whose state disagrees with its execution's is unreadable
        six weeks later, when the question is which of three attempts
        produced the artifact somebody is looking at.

        Parameters
        ----------
        execution : Execution
            The execution, already moved.
        attempt_id : str | None
            The attempt, when the observation named one.
        state : ExecutionState
            The state the execution reached.
        error : OrchestrationError | None
            The failure, when this is one.
        """
        if attempt_id is None:
            return
        for attempt in await self.attempts(execution.execution_id):
            if attempt.attempt_id != attempt_id:
                continue
            updates: dict[str, Any] = {"state": state}
            if state is ExecutionState.RUNNING and attempt.started_at is None:
                updates["started_at"] = now()
            if is_terminal(state):
                updates["ended_at"] = now()
            if error is not None:
                updates["error"] = error
            await self.save_attempt(attempt.model_copy(update=updates))
            return

    async def _acknowledge(
        self, execution: Execution, acknowledgement: Acknowledgement
    ) -> tuple[Acknowledgement, ExecutionEvent]:
        """
        Store one milestone and the event that carries it.

        Parameters
        ----------
        execution : Execution
            The execution that reached it.
        acknowledgement : Acknowledgement
            The milestone.

        Returns
        -------
        tuple[Acknowledgement, ExecutionEvent]
            The milestone and its event.
        """
        try:
            earlier: list[Acknowledgement] | None = await self.acknowledgements(
                execution.execution_id
            )
        except Exception as error:  # noqa: BLE001 - a measure never fails the work
            logger.debug("Milestones of %s unread: %s", execution.execution_id, error)
            earlier = None
        await self.save_acknowledgement(acknowledgement)
        if earlier is not None:
            from agent_runtimes.monitoring.orchestration_measures import (
                milestone_reached,
            )

            milestone_reached(
                execution, acknowledgement, earlier, account_uid=self.account_uid
            )
        event = await self._append(
            event_for(
                execution,
                ExecutionEventType.ACKNOWLEDGED,
                attempt_id=acknowledgement.attempt_id,
                acknowledgement=acknowledgement,
                message=acknowledgement.detail,
            )
        )
        return acknowledgement, event

    async def _register(
        self,
        execution: Execution,
        artifact: Artifact,
        *,
        data: Mapping[str, Any] | None = None,
    ) -> tuple[Artifact, ExecutionEvent]:
        """
        Store one artifact, merging a second attempt's provenance into it.

        Parameters
        ----------
        execution : Execution
            The execution that produced it.
        artifact : Artifact
            The artifact as the adapter reported it.
        data : Mapping[str, Any] | None
            What the artifact stands for until O1-10 commits it.

        Returns
        -------
        tuple[Artifact, ExecutionEvent]
            The artifact as stored, and its event.
        """
        merged = artifact
        for known in await self.artifacts(execution.execution_id):
            if known.artifact_id != artifact.artifact_id:
                continue
            provenance = list(known.provenance)
            provenance.extend(
                record for record in artifact.provenance if record not in provenance
            )
            committed = known.status is ArtifactStatus.COMMITTED
            merged = known.model_copy(
                update={
                    "provenance": provenance,
                    # First commit wins: a later registration adds what it
                    # knows and never takes a committed artifact back.
                    "status": known.status if committed else artifact.status,
                    "reference": known.reference if committed else artifact.reference,
                    # Whose version was committed moves with the status it
                    # belongs to. `model_copy` does not re-run the model's
                    # validators, so a status promoted here without its
                    # committer would be an invalid record that nothing
                    # complained about — the one way this could produce one.
                    "committed_by": (
                        known.committed_by if committed else artifact.committed_by
                    ),
                    "summary": artifact.summary or known.summary,
                }
            )
            break
        await self.save_artifact(execution.execution_id, merged)
        event = await self._append(
            event_for(
                execution,
                ExecutionEventType.ARTIFACT_REGISTERED,
                artifact=merged,
                message=merged.name,
                data=data,
            )
        )
        return merged, event

    async def _remember_handles(
        self, execution: Execution, attempt_id: str | None, observation: Observation
    ) -> Execution:
        """
        Keep the protocol's own identifiers, which are what a re-attach needs.

        A session or a task identifier learnt mid-stream is the only way a
        later step finds the work again (section 6.4, scenario 4), and it is
        a projection: the execution is authoritative, the handle is how the
        protocol currently spells it.

        Parameters
        ----------
        execution : Execution
            The execution.
        attempt_id : str | None
            The attempt the handle belongs to.
        observation : Observation
            The observation carrying the handle.

        Returns
        -------
        Execution
            The execution, with the session on its binding when it is new.
        """
        if (
            observation.session_id
            and execution.agent.session_id != observation.session_id
        ):
            execution = execution.model_copy(
                update={
                    "agent": execution.agent.model_copy(
                        update={"session_id": observation.session_id}
                    ),
                    "updated_at": now(),
                }
            )
            await self.save(execution)
        if attempt_id is None:
            return execution
        for attempt in await self.attempts(execution.execution_id):
            if attempt.attempt_id != attempt_id:
                continue
            updates = {
                name: value
                for name, value in (
                    ("session_id", observation.session_id),
                    ("protocol_task_id", observation.protocol_task_id),
                )
                if value and getattr(attempt, name) != value
            }
            if updates:
                await self.save_attempt(attempt.model_copy(update=updates))
            return execution
        return execution


def _same_intent(existing: Execution, requested: Execution) -> bool:
    """
    Say whether two executions are the same piece of work asked for twice.

    The session on the binding is left out of the comparison, and that is
    the whole subtlety here. A session is a projection the store stamps once
    the worker answers with one (section 5.2), so a redelivery that arrives
    after the first dispatch has opened a session names no session — and
    refusing it as different work would refuse precisely the late
    redelivery section 6.4 is written about. What makes two deliveries the
    same intent is the worker asked for, the objective, and the parent.

    Parameters
    ----------
    existing : Execution
        What the first delivery created.
    requested : Execution
        What this delivery asks for.

    Returns
    -------
    bool
        True when the worker, the objective and the parent all agree.
    """
    return (
        existing.agent.model_dump(exclude={"session_id"})
        == requested.agent.model_dump(exclude={"session_id"})
        and existing.objective == requested.objective
        and existing.parent_execution_id == requested.parent_execution_id
    )


def refuse_moving(existing: Execution, execution: Execution) -> None:
    """
    Refuse a write that would move an execution in its tree (O2-01).

    ``root_execution_id`` is set once, when the execution is created, and so
    are its parent and its depth: a tree is one query on its root, and a
    write that moved one execution would take its whole subtree into another
    tree without anybody asking.

    Parameters
    ----------
    existing : Execution
        What the store holds.
    execution : Execution
        What is being written over it.

    Raises
    ------
    ExecutionConflict
        When the root, the parent or the depth would change.
    """
    for name in ("root_execution_id", "parent_execution_id", "depth"):
        if getattr(existing, name) != getattr(execution, name):
            raise ExecutionConflict(
                f"Execution '{execution.execution_id}' keeps its {name.replace('_', ' ')} "
                f"'{getattr(existing, name)}': it is set when the execution is created and never rewritten."
            )


class InMemoryExecutionStore(ExecutionStore):
    """The Phase 0 store: dictionaries, one process, one lock.

    It is also the test double for every later phase, which is the reason it
    is written as carefully as the Solr one will be: the conformance suite
    of O0-12 runs on it, and a store that quietly ordered events differently
    from Solr would make that suite prove the wrong thing.

    Records are pydantic models and are immutable in practice: every change
    replaces the record rather than mutating it, so a caller holding an
    execution it read a moment ago is holding what it read.
    """

    def __init__(self) -> None:
        """Start empty, with the lock that keeps event sequences distinct."""
        self._executions: dict[str, Execution] = {}
        self._by_idempotency_key: dict[str, str] = {}
        self._attempts: dict[str, list[Attempt]] = {}
        self._events: dict[str, list[ExecutionEvent]] = {}
        self._acknowledgements: dict[str, list[Acknowledgement]] = {}
        self._artifacts: dict[str, list[Artifact]] = {}
        self._lock = asyncio.Lock()

    async def save(
        self, execution: Execution, *, idempotency_key: str | None = None
    ) -> None:
        """
        Insert or replace one execution.

        Parameters
        ----------
        execution : Execution
            The execution to write.
        idempotency_key : str | None
            The key of the command that created it, kept on the insert only.
        """
        existing = self._executions.get(execution.execution_id)
        if existing is not None:
            refuse_moving(existing, execution)
        self._executions[execution.execution_id] = execution
        if idempotency_key:
            self._by_idempotency_key.setdefault(idempotency_key, execution.execution_id)

    async def get(self, execution_id: str) -> Execution:
        """
        The execution.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        Execution
            The execution.

        Raises
        ------
        ExecutionNotFound
            When there is no such execution.
        """
        try:
            return self._executions[execution_id]
        except KeyError:
            raise ExecutionNotFound(execution_id) from None

    async def find_by_idempotency_key(self, idempotency_key: str) -> Execution | None:
        """
        The execution a command with this key already created.

        Parameters
        ----------
        idempotency_key : str
            The key the caller sent.

        Returns
        -------
        Execution | None
            The execution, or ``None``.
        """
        execution_id = self._by_idempotency_key.get(idempotency_key)
        return self._executions.get(execution_id) if execution_id else None

    async def list_executions(
        self,
        *,
        root_execution_id: str | None = None,
        parent_execution_id: str | None = None,
        status: ExecutionState | None = None,
    ) -> list[Execution]:
        """
        The executions matching every filter given, in creation order.

        Parameters
        ----------
        root_execution_id : str | None
            Only executions in this tree.
        parent_execution_id : str | None
            Only the children of this execution.
        status : ExecutionState | None
            Only executions in this state.

        Returns
        -------
        list[Execution]
            The matching executions.
        """
        return [
            execution
            for execution in self._executions.values()
            if (
                root_execution_id is None
                or execution.root_execution_id == root_execution_id
            )
            and (
                parent_execution_id is None
                or execution.parent_execution_id == parent_execution_id
            )
            and (status is None or execution.status is status)
        ]

    async def save_attempt(self, attempt: Attempt) -> None:
        """
        Insert or replace one attempt.

        Parameters
        ----------
        attempt : Attempt
            The attempt to write.
        """
        attempts = self._attempts.setdefault(attempt.execution_id, [])
        for index, known in enumerate(attempts):
            if known.attempt_id == attempt.attempt_id:
                attempts[index] = attempt
                return
        attempts.append(attempt)

    async def attempts(self, execution_id: str) -> list[Attempt]:
        """
        Every dispatch of this execution.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        list[Attempt]
            Its attempts, in the order they were made.
        """
        return list(self._attempts.get(execution_id, ()))

    async def append_event(self, event: ExecutionEvent) -> ExecutionEvent:
        """
        Append one event, stamping its sequence under the lock.

        Parameters
        ----------
        event : ExecutionEvent
            The event to append.

        Returns
        -------
        ExecutionEvent
            The event as stored.
        """
        async with self._lock:
            events = self._events.setdefault(event.execution_id, [])
            stored = event.model_copy(update={"sequence": len(events) + 1})
            events.append(stored)
            return stored

    async def events(
        self, execution_id: str, *, from_sequence: int | None = None
    ) -> list[ExecutionEvent]:
        """
        The events of one execution, in sequence.

        Parameters
        ----------
        execution_id : str
            Which execution.
        from_sequence : int | None
            Only events after this sequence.

        Returns
        -------
        list[ExecutionEvent]
            The events.
        """
        events = self._events.get(execution_id, ())
        if from_sequence is None:
            return list(events)
        return [event for event in events if event.sequence > from_sequence]

    async def save_acknowledgement(self, acknowledgement: Acknowledgement) -> None:
        """
        Insert one acknowledgement.

        Parameters
        ----------
        acknowledgement : Acknowledgement
            The milestone reached.
        """
        self._acknowledgements.setdefault(acknowledgement.execution_id, []).append(
            acknowledgement
        )

    async def acknowledgements(self, execution_id: str) -> list[Acknowledgement]:
        """
        The milestones this execution has reached.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        list[Acknowledgement]
            Its acknowledgements, in the order reached.
        """
        return list(self._acknowledgements.get(execution_id, ()))

    async def save_artifact(self, execution_id: str, artifact: Artifact) -> None:
        """
        Insert or replace one artifact.

        Parameters
        ----------
        execution_id : str
            The execution that produced it.
        artifact : Artifact
            The artifact.
        """
        artifacts = self._artifacts.setdefault(execution_id, [])
        for index, known in enumerate(artifacts):
            if known.artifact_id == artifact.artifact_id:
                artifacts[index] = artifact
                return
        artifacts.append(artifact)

    async def artifacts(self, execution_id: str) -> list[Artifact]:
        """
        The artifacts registered against this execution.

        Parameters
        ----------
        execution_id : str
            Which execution.

        Returns
        -------
        list[Artifact]
            Its artifacts.
        """
        return list(self._artifacts.get(execution_id, ()))
