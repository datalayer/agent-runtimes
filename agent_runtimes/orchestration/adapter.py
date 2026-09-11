# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The one port a protocol binding implements (PLAN_ORCHESTRATOR.md, O0-05).

An adapter turns a canonical command into protocol operations and turns what
the protocol says back into observations. It does exactly that, and it is
refused two things it would be easy to give it: it never decides a canonical
state, and it never holds policy. ``datalayer_core.orchestration.lifecycle``
decides what an observation means (O0-02) and the control plane decides what
to do about it; an adapter allowed to do either would be a second place
where an execution's truth lives, and a worker that can talk to that place
can report work it never did.

Nothing in this module may assume a request scope, a live client connection
or a process that outlives one step. From Phase 1 these adapters run inside
the durable worker (19.8), which is replayed across step boundaries and pod
rolls. That is why ``resolve`` returns a ``ResolvedWorker`` whose ``handle``
is rebuildable rather than durable, and why re-attaching to work already
dispatched is ``subscribe`` — a fresh look at the worker — rather than a
connection somebody kept open.

An operation an adapter cannot perform returns ``Unsupported`` rather than
answering as though it had. And it is decided before anything is dispatched:
``AdapterCapabilities`` refuses to exist unless it accounts for every member
of ``WorkerOperation``, so there is no operation whose absence is discovered
at the worst moment. Decision 5 of 19.8 requires the reduction to be
reported on the execution rather than hidden, which is what
``capability_report`` is for: the adapters yield it as the first observation
of a dispatch, so "why did this execution never checkpoint?" is answered
from the execution's own event stream.

``checkpoint`` and ``collect`` are commands (section 6.2) but not adapter
methods. Collecting reads artifacts from the execution store, and a
checkpoint is the control plane persisting what it already holds; neither
A2A nor ACP has a worker-side equivalent. They are still declared in the
capability report — unsupported, with that reason — because a report with a
hole in it is how a later reader concludes the hole was an oversight.

A worker that speaks the Datalayer orchestration extension is resolved with
more (``AdapterCapabilities.extended``, O2-05): it is steered within its turn,
paused at a checkpoint it reports, and resumed by a new attempt that names
that checkpoint (``Attempt.resumed_from``). It checkpoints as it pauses, not
on request, so ``checkpoint`` stays refused for it too, with that reason.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Mapping, Sequence, Union

from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    Artifact,
    ArtifactProvenance,
    ArtifactType,
    Attempt,
    ContextReference,
    ErrorCode,
    Execution,
    ExecutionEvent,
    ExecutionEventType,
    LifecycleEvent,
    OrchestrationError,
    Usage,
    WorkerOperation,
)

from agent_runtimes.context.delegation import EXTENSION_URI

__all__ = [
    "CAPABILITY_REPORT_KEY",
    "EXTENSION_OPERATIONS",
    "AdapterCapabilities",
    "Observation",
    "OperationOutcome",
    "Performed",
    "ResolvedWorker",
    "Unsupported",
    "WorkerAdapter",
    "answer_artifact",
    "capability_report",
    "now",
    "objective_prompt",
    "recorded_capabilities",
    "resume_in_a_new_attempt",
    "resumed_without_the_extension",
    "trace_id_of",
]


def now() -> str:
    """
    The clock every canonical record is stamped from: RFC 3339, UTC.

    It lives here rather than in the store because an adapter stamps the
    provenance of what it saw, and two spellings of "now" in one package is
    how two records of the same moment end up disagreeing.

    Returns
    -------
    str
        The current time.
    """
    return datetime.now(timezone.utc).isoformat()


#: What an attempt that resumes from a checkpoint is told before its
#: objective (O2-05): its worker has the conversation it paused in back.
RESUMING = (
    "Carry on from where you were paused: the conversation so far is restored "
    "from the checkpoint. Do not start again, and do not repeat what is done."
)


def objective_prompt(execution: Execution, attempt: Attempt | None = None) -> str:
    """
    The objective as text, for the protocols that carry text.

    Both bindings hand a worker one message. A2A maps the objective onto a
    Message and a structured DataPart (7.1) and ACP onto content blocks
    (7.4), but the structured halves of both are extension territory: a
    plain worker on either protocol reads prose. So the goal, the
    instructions, the acceptance criteria and the context references are
    rendered once, here, rather than differently in each adapter — a worker
    that behaves differently over two protocols because it was asked two
    different things is a worker that proves nothing about orchestration.

    The references are named, never resolved: section 2 asks for context to
    be passed by reference, and resolving them is O0-09's.

    An attempt that resumes from a checkpoint (``Attempt.resumed_from``) is
    told so first. Its worker has the conversation it paused in back, and a
    prompt that only repeated the objective would read as being asked again
    from the start.

    Parameters
    ----------
    execution : Execution
        The execution being dispatched.
    attempt : Attempt | None
        The attempt being dispatched.

    Returns
    -------
    str
        What the worker is asked for.
    """
    lines = [execution.objective.goal]
    if execution.objective.instructions:
        lines += ["", "Instructions:", execution.objective.instructions]
    if execution.objective.acceptance_criteria:
        lines += ["", "Acceptance criteria:"]
        lines += [
            f"- {criterion}" for criterion in execution.objective.acceptance_criteria
        ]
    if execution.context.references:
        lines += ["", "Context references, versioned, to resolve through Datalayer:"]
        lines += [
            f"- {reference.uri} ({reference.access.value}, "
            f"{'required' if reference.required else 'optional'})"
            for reference in execution.context.references
        ]
    objective = "\n".join(lines)
    if attempt is not None and attempt.resumed_from:
        return f"{RESUMING}\n\nThe objective, as it was given:\n{objective}"
    return objective


def answer_artifact(
    execution: Execution, attempt: Attempt, text: str, *, name: str = "answer"
) -> Artifact:
    """
    The worker's answer, registered as a typed output rather than a blob.

    Section 5.4 asks for outputs to be typed, versioned references with
    provenance, and this is the smallest honest one: what the worker said,
    hashed, attributed to the attempt that said it. It is ``registered``,
    not ``committed`` — committing it to contents or the Library is O1-10,
    and the commit rule is 19.8's fourth decision.

    Parameters
    ----------
    execution : Execution
        The execution that produced it.
    attempt : Attempt
        The attempt that produced it.
    text : str
        What the worker answered.
    name : str
        What to call it.

    Returns
    -------
    Artifact
        The registered artifact.
    """
    body = text.encode("utf-8")
    structured = _is_json_object(text)
    return Artifact(
        artifact_id=f"art_{uuid.uuid4().hex}",
        type=ArtifactType.JSON if structured else ArtifactType.FILE,
        name=name,
        media_type="application/json" if structured else "text/plain",
        size_bytes=len(body),
        provenance=[
            ArtifactProvenance(
                execution_id=execution.execution_id,
                attempt_id=attempt.attempt_id,
                agent_id=attempt.agent_id,
                produced_at=now(),
                source_references=[
                    reference.uri for reference in execution.context.references
                ],
                content_hash=f"sha256:{hashlib.sha256(body).hexdigest()}",
                trace_id=trace_id_of(execution.trace.traceparent),
            )
        ],
        summary=text if len(text) <= 200 else text[:200] + "\u2026",
    )


def trace_id_of(traceparent: str | None) -> str | None:
    """
    The trace identifier inside a W3C traceparent, when there is one.

    Parameters
    ----------
    traceparent : str | None
        The header as it was carried.

    Returns
    -------
    str | None
        The trace id, or ``None`` when there is no usable header.
    """
    if not traceparent:
        return None
    fields = traceparent.split("-")
    return fields[1] if len(fields) == 4 and fields[1] else None


def _is_json_object(text: str) -> bool:
    """
    Say whether the worker answered with a JSON object or array.

    Parameters
    ----------
    text : str
        The answer.

    Returns
    -------
    bool
        True when it parses as JSON and is not a bare scalar.
    """
    stripped = text.strip()
    if not stripped or stripped[0] not in "[{":
        return False
    try:
        json.loads(stripped)
    except ValueError:
        return False
    return True


@dataclass(frozen=True)
class Unsupported:
    """One operation this adapter will not perform, and why not.

    Returned, not raised: a caller asking a worker to pause is not a
    programming error, and the answer is a fact about the worker that the
    control plane records and shows. ``as_error`` is that same fact in the
    canonical form an event carries.
    """

    operation: WorkerOperation
    protocol: AgentProtocol
    reason: str

    def as_error(self) -> OrchestrationError:
        """
        The refusal as the canonical error an event or an attempt carries.

        Returns
        -------
        OrchestrationError
            The refusal, with ``unsupported_operation`` and no retry.
        """
        return OrchestrationError(
            code=ErrorCode.UNSUPPORTED_OPERATION,
            message=(
                f"'{self.operation.value}' is not supported over "
                f"{self.protocol.value}: {self.reason}"
            ),
            retryable=False,
            source=f"adapter:{self.protocol.value}",
        )

    def to_wire(self) -> dict[str, Any]:
        """
        The refusal as it is reported on the execution.

        Returns
        -------
        dict[str, Any]
            The operation and the reason, camel case like the rest of the wire.
        """
        return {"operation": self.operation.value, "reason": self.reason}


@dataclass(frozen=True)
class Performed:
    """One operation this adapter did perform, with whatever the worker said."""

    operation: WorkerOperation
    detail: str | None = None


#: What every optional operation answers: it was done, or it was refused.
OperationOutcome = Union[Performed, Unsupported]

#: What a worker that speaks the Datalayer orchestration extension can be
#: asked besides what its protocol gives (O2-05).
EXTENSION_OPERATIONS: frozenset[WorkerOperation] = frozenset(
    {WorkerOperation.STEER, WorkerOperation.PAUSE, WorkerOperation.RESUME}
)

#: Where a capability report sits in the data of the event that records it.
CAPABILITY_REPORT_KEY = "adapterCapabilities"

#: Why ``checkpoint`` stays refused for a worker that speaks the extension.
CHECKPOINTS_AS_IT_PAUSES = (
    "a worker speaking the orchestration extension keeps a checkpoint as it "
    "pauses (executions.pause), and takes none while it goes on working"
)


@dataclass(frozen=True)
class AdapterCapabilities:
    """What an adapter can do, and what it has to say about what it cannot.

    Every ``WorkerOperation`` is either in ``supported`` or has an entry in
    ``unsupported``; a capability report that leaves one out does not
    validate. The two sets are what ``agents.discover`` matches against and
    what the reduction of decision 5 is written from.

    ``acknowledgements`` is the second half of that reduction and the one
    that is easiest to fake: it lists the milestones of section 6.3 this
    adapter can ever report. A plain A2A worker cannot report ``accepted``,
    because A2A's ``submitted`` says the endpoint took the message and not
    that a worker took responsibility, and section 6.3 exists precisely so
    that those two are not confused. Saying so here means the control plane
    can stop waiting for a milestone that is never coming.

    ``reductions`` is everything else that is smaller than the canonical
    model promises, in plain words, for a person reading the execution.

    ``extensions`` are the protocol extensions the worker speaks, which is
    what the report was widened by (``extended``); the control plane reads
    the report recorded on the execution rather than its protocol's, so a
    worker is asked only for what it said it does.
    """

    protocol: AgentProtocol
    supported: frozenset[WorkerOperation]
    unsupported: tuple[Unsupported, ...] = ()
    acknowledgements: frozenset[AcknowledgementKind] = frozenset()
    reductions: tuple[str, ...] = ()
    extensions: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        """
        Refuse a report that does not account for every operation.

        Raises
        ------
        ValueError
            When an operation is claimed and refused at once, or when one is
            neither claimed nor refused.
        """
        refused = {entry.operation for entry in self.unsupported}
        both = refused & set(self.supported)
        if both:
            raise ValueError(
                "An operation cannot be supported and unsupported at once: "
                + ", ".join(sorted(operation.value for operation in both))
            )
        missing = set(WorkerOperation) - refused - set(self.supported)
        if missing:
            raise ValueError(
                "A capability report must say something about every operation; "
                "these say nothing: "
                + ", ".join(sorted(operation.value for operation in missing))
            )
        mismatched = [
            entry for entry in self.unsupported if entry.protocol is not self.protocol
        ]
        if mismatched:
            raise ValueError(
                "A refusal must name the protocol it belongs to: "
                + ", ".join(entry.operation.value for entry in mismatched)
            )

    def supports(self, operation: WorkerOperation) -> bool:
        """
        Say whether this adapter performs the operation.

        Parameters
        ----------
        operation : WorkerOperation
            The operation to ask about.

        Returns
        -------
        bool
            True when the adapter performs it.
        """
        return operation in self.supported

    def refusal(self, operation: WorkerOperation) -> Unsupported | None:
        """
        The refusal recorded for an operation, or ``None`` when it is supported.

        Parameters
        ----------
        operation : WorkerOperation
            The operation to ask about.

        Returns
        -------
        Unsupported | None
            The refusal, when there is one.
        """
        for entry in self.unsupported:
            if entry.operation is operation:
                return entry
        return None

    def with_reduction(self, *reductions: str) -> "AdapterCapabilities":
        """
        The same report with more said about it, for a per-worker narrowing.

        A capability that depends on the worker rather than on the protocol —
        an ACP agent that declares no ``session/fork``, say — is learnt in
        ``resolve``, and this is how it reaches the report the execution
        will carry.

        Parameters
        ----------
        *reductions : str
            What else is reduced, in plain words.

        Returns
        -------
        AdapterCapabilities
            A new report; capabilities are values, never mutated in place.
        """
        return AdapterCapabilities(
            protocol=self.protocol,
            supported=self.supported,
            unsupported=self.unsupported,
            acknowledgements=self.acknowledgements,
            reductions=(*self.reductions, *reductions),
            extensions=self.extensions,
        )

    def extended(
        self, *, without: tuple[str, ...] = (), reductions: tuple[str, ...] = ()
    ) -> "AdapterCapabilities":
        """
        The report for a worker that speaks the Datalayer orchestration extension (O2-05).

        The same for either protocol: the worker is steered within its turn,
        paused, and resumed from the checkpoint it paused at, which it
        reports as ``checkpointed``. ``checkpoint`` stays refused, with the
        reason that is true of such a worker.

        Parameters
        ----------
        without : tuple[str, ...]
            The reductions of the protocol's report the extension answers.
        reductions : tuple[str, ...]
            What is still reduced, or newly so, in plain words.

        Returns
        -------
        AdapterCapabilities
            A new report, naming the extension.
        """
        return AdapterCapabilities(
            protocol=self.protocol,
            supported=self.supported | EXTENSION_OPERATIONS,
            unsupported=tuple(
                Unsupported(
                    operation=entry.operation,
                    protocol=self.protocol,
                    reason=CHECKPOINTS_AS_IT_PAUSES,
                )
                if entry.operation is WorkerOperation.CHECKPOINT
                else entry
                for entry in self.unsupported
                if entry.operation not in EXTENSION_OPERATIONS
            ),
            acknowledgements=self.acknowledgements
            | {AcknowledgementKind.CHECKPOINTED},
            reductions=(
                *(reduction for reduction in self.reductions if reduction not in without),
                *reductions,
            ),
            extensions=(*self.extensions, EXTENSION_URI),
        )

    def to_wire(self) -> dict[str, Any]:
        """
        The report as it is recorded on the execution.

        Returns
        -------
        dict[str, Any]
            The protocol, the operations either way, the milestones this
            adapter can reach, and the reductions in plain words.
        """
        return {
            "protocol": self.protocol.value,
            "supported": sorted(operation.value for operation in self.supported),
            "unsupported": [entry.to_wire() for entry in self.unsupported],
            "acknowledgements": [
                kind.value
                for kind in AcknowledgementKind
                if kind in self.acknowledgements
            ],
            "reductions": list(self.reductions),
            "extensions": list(self.extensions),
        }


@dataclass(frozen=True)
class Observation:
    """One thing an adapter saw, on its way to becoming a canonical event.

    An adapter reports; ``store.apply_observation`` decides. That is the
    whole reason this type exists instead of adapters building
    ``ExecutionEvent`` envelopes themselves: an envelope carries the root,
    the parent, the sequence and the canonical state, and an adapter that
    filled those in would be deciding them. Here an adapter says what it
    saw — a worker moved, a milestone was reached, an artifact appeared, a
    person is being asked for permission — and the correlation and the
    consequence are stamped where the execution lives.

    ``lifecycle_event`` is the observation, never the resulting state: a
    worker that reports ``completed`` after a cancellation produces
    ``LifecycleEvent.COMPLETE`` here and an invalid-transition event there,
    which is conformance scenario 9 in miniature.

    ``data`` comes from a worker and is untrusted (section 9): it is shown,
    never followed.
    """

    type: ExecutionEventType
    lifecycle_event: LifecycleEvent | None = None
    acknowledgement: AcknowledgementKind | None = None
    artifact: Artifact | None = None
    error: OrchestrationError | None = None
    message: str | None = None
    data: Mapping[str, Any] | None = None
    # What the protocol now calls this attempt. Learnt mid-stream — an A2A
    # task id arrives with the first status, an ACP session id with the
    # session — and recorded on the attempt so a later step can re-attach.
    session_id: str | None = None
    protocol_task_id: str | None = None
    #: The checkpoint a ``checkpointed`` milestone names, which is what a
    #: resume names (O2-05).
    checkpoint_id: str | None = None
    #: What the worker says the attempt spent, on the move that ends the
    #: attempt (O2-10).
    usage: Usage | None = None

    def __post_init__(self) -> None:
        """
        Refuse an observation that does not carry what its type promises.

        Raises
        ------
        ValueError
            When the type and the payload disagree.
        """
        required: Mapping[ExecutionEventType, tuple[str, ...]] = {
            ExecutionEventType.STATE_CHANGED: ("lifecycle_event",),
            ExecutionEventType.ACKNOWLEDGED: ("acknowledgement",),
            ExecutionEventType.ARTIFACT_REGISTERED: ("artifact",),
            ExecutionEventType.APPROVAL_REQUESTED: ("message",),
            ExecutionEventType.ERROR: ("error",),
            ExecutionEventType.STEERED: ("message",),
        }
        for name in required.get(self.type, ()):
            if getattr(self, name) is None:
                raise ValueError(
                    f"An observation of '{self.type.value}' must carry '{name}'."
                )
        if self.type is ExecutionEventType.PROGRESS and not (self.message or self.data):
            raise ValueError("Progress with neither a message nor data says nothing.")
        if (
            self.checkpoint_id is not None
            and self.acknowledgement is not AcknowledgementKind.CHECKPOINTED
        ):
            raise ValueError("Only a 'checkpointed' milestone names a checkpoint.")
        if self.usage is not None and self.type is not ExecutionEventType.STATE_CHANGED:
            raise ValueError("Only a move carries what the attempt spent.")

    @classmethod
    def progress(
        cls,
        message: str | None = None,
        *,
        data: Mapping[str, Any] | None = None,
        session_id: str | None = None,
        protocol_task_id: str | None = None,
    ) -> "Observation":
        """
        The worker is working: text, a tool call, whatever the protocol shows.

        Parameters
        ----------
        message : str | None
            What to show a reader.
        data : Mapping[str, Any] | None
            The protocol's own payload, kept for the report.
        session_id : str | None
            The protocol session, when this is where it became known.
        protocol_task_id : str | None
            The protocol task, when this is where it became known.

        Returns
        -------
        Observation
            A progress observation.
        """
        return cls(
            type=ExecutionEventType.PROGRESS,
            message=message,
            data=data,
            session_id=session_id,
            protocol_task_id=protocol_task_id,
        )

    @classmethod
    def moved(
        cls,
        lifecycle_event: LifecycleEvent,
        *,
        message: str | None = None,
        error: OrchestrationError | None = None,
        session_id: str | None = None,
        protocol_task_id: str | None = None,
        usage: Usage | None = None,
    ) -> "Observation":
        """
        The worker did something the lifecycle may have a state for.

        Parameters
        ----------
        lifecycle_event : LifecycleEvent
            What was observed, not what state it produces.
        message : str | None
            What the worker said about it.
        error : OrchestrationError | None
            The failure, when this is one.
        session_id : str | None
            The protocol session, when this is where it became known.
        protocol_task_id : str | None
            The protocol task, when this is where it became known.
        usage : Usage | None
            What the worker says the attempt spent, when this move ends it.

        Returns
        -------
        Observation
            A state-change observation.
        """
        return cls(
            type=ExecutionEventType.STATE_CHANGED,
            lifecycle_event=lifecycle_event,
            message=message,
            error=error,
            session_id=session_id,
            protocol_task_id=protocol_task_id,
            usage=usage,
        )

    @classmethod
    def acknowledged(
        cls,
        kind: AcknowledgementKind,
        *,
        message: str | None = None,
        protocol_task_id: str | None = None,
        session_id: str | None = None,
        checkpoint_id: str | None = None,
    ) -> "Observation":
        """
        One of the five milestones of section 6.3 was reached.

        Parameters
        ----------
        kind : AcknowledgementKind
            The milestone.
        message : str | None
            What reaching it looked like on this protocol.
        protocol_task_id : str | None
            The protocol task, when this is where it became known.
        session_id : str | None
            The protocol session, when this is where it became known.
        checkpoint_id : str | None
            The checkpoint a ``checkpointed`` milestone kept.

        Returns
        -------
        Observation
            An acknowledgement observation.
        """
        return cls(
            type=ExecutionEventType.ACKNOWLEDGED,
            acknowledgement=kind,
            message=message,
            protocol_task_id=protocol_task_id,
            session_id=session_id,
            checkpoint_id=checkpoint_id,
        )

    @classmethod
    def produced(
        cls, artifact: Artifact, *, data: Mapping[str, Any] | None = None
    ) -> "Observation":
        """
        The worker produced an output worth registering.

        Parameters
        ----------
        artifact : Artifact
            The artifact, with its provenance already filled in by the adapter.
        data : Mapping[str, Any] | None
            The bytes or text the artifact stands for, until O1-10 commits it.

        Returns
        -------
        Observation
            An artifact observation.
        """
        return cls(
            type=ExecutionEventType.ARTIFACT_REGISTERED, artifact=artifact, data=data
        )

    @classmethod
    def approval_requested(
        cls, message: str, *, data: Mapping[str, Any] | None = None
    ) -> "Observation":
        """
        The worker is asking a person for permission.

        Parameters
        ----------
        message : str
            What is being asked for.
        data : Mapping[str, Any] | None
            The protocol's request, so the control plane can answer it.

        Returns
        -------
        Observation
            An approval observation.
        """
        return cls(
            type=ExecutionEventType.APPROVAL_REQUESTED, message=message, data=data
        )

    @classmethod
    def failed(
        cls, error: OrchestrationError, *, message: str | None = None
    ) -> "Observation":
        """
        Something went wrong that is not itself a state change.

        Parameters
        ----------
        error : OrchestrationError
            What went wrong.
        message : str | None
            What to show a reader.

        Returns
        -------
        Observation
            An error observation.
        """
        return cls(type=ExecutionEventType.ERROR, error=error, message=message)


def capability_report(capabilities: AdapterCapabilities) -> Observation:
    """
    The reduction, as an observation, so it lands on the execution (19.8, 5).

    Decision 5 says the reduced guarantees of a plain worker are reported
    rather than hidden. An adapter yields this first, before it dispatches
    anything, and the answer to "why is there no acceptance acknowledgement
    on this execution?" is then in the execution's own event stream rather
    than in this file.

    Parameters
    ----------
    capabilities : AdapterCapabilities
        What the adapter can do with this worker.

    Returns
    -------
    Observation
        A progress observation carrying the report.
    """
    refused = ", ".join(entry.operation.value for entry in capabilities.unsupported)
    return Observation.progress(
        f"Dispatching over {capabilities.protocol.value} without: {refused}."
        if refused
        else f"Dispatching over {capabilities.protocol.value}.",
        data={CAPABILITY_REPORT_KEY: capabilities.to_wire()},
    )


def recorded_capabilities(events: Sequence[ExecutionEvent]) -> Mapping[str, Any] | None:
    """
    The capability report a dispatch recorded on its execution, the newest.

    What the worker was found to do, rather than what its protocol does: a
    worker that speaks the orchestration extension is asked for a pause
    its protocol has no word for (O2-05), and one that does not is refused.

    Parameters
    ----------
    events : Sequence[ExecutionEvent]
        The execution's events.

    Returns
    -------
    Mapping[str, Any] | None
        The report as ``AdapterCapabilities.to_wire`` wrote it, or ``None``
        before anything was dispatched.
    """
    for event in reversed(events):
        report = (event.data or {}).get(CAPABILITY_REPORT_KEY)
        if isinstance(report, Mapping):
            return report
    return None


@dataclass
class ResolvedWorker:
    """A worker this adapter has found, with what it turned out to be.

    ``handle`` is the adapter's own — an A2A remote agent, an ACP endpoint —
    and it is not durable. The control plane never reads it, and a step that
    finds itself without one resolves again; section 8 requires protocol
    sessions to be reconstructable from Datalayer state, and a handle that
    had to survive would be the exception that breaks it.

    ``details`` is what the worker said about itself: an agent card summary,
    an ACP initialize response. It comes from the worker, so it is shown and
    never followed (section 9). Turning it into an ``AgentDescriptor`` is
    O0-08's mapping and deliberately not repeated here.
    """

    binding: AgentBinding
    capabilities: AdapterCapabilities
    endpoint: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    handle: Any = field(default=None, repr=False)


def resume_in_a_new_attempt(
    worker: ResolvedWorker, checkpoint_id: str | None, *, next_attempt: str
) -> OperationOutcome:
    """
    How a worker that speaks the orchestration extension is resumed (O2-05).

    Not in place: the work it paused has ended, and the next attempt is
    dispatched with a delegation that names the checkpoint. What is decided
    here is whether this worker can be resumed at all, from what it declared
    when it was resolved, and whether there is a checkpoint to name.

    Parameters
    ----------
    worker : ResolvedWorker
        The worker, whose report decides.
    checkpoint_id : str | None
        The checkpoint to resume from.
    next_attempt : str
        What the next attempt is on the worker's protocol, in plain words.

    Returns
    -------
    OperationOutcome
        How it resumes, or why it cannot.
    """
    refused = worker.capabilities.refusal(WorkerOperation.RESUME)
    if refused is not None:
        return refused
    if not checkpoint_id:
        return Unsupported(
            operation=WorkerOperation.RESUME,
            protocol=worker.capabilities.protocol,
            reason=(
                "a worker speaking the orchestration extension resumes from the "
                "checkpoint it paused at, and none is known"
            ),
        )
    return Performed(
        operation=WorkerOperation.RESUME,
        detail=(
            f"Resumed by {next_attempt} whose delegation names checkpoint "
            f"'{checkpoint_id}'."
        ),
    )


def resumed_without_the_extension(
    worker: ResolvedWorker, attempt: Attempt
) -> OrchestrationError | None:
    """
    Why an attempt that resumes from a checkpoint cannot be sent to this worker.

    Only a worker speaking the orchestration extension reads the checkpoint a
    delegation names. One resolved without it — redeployed since the
    execution paused, say — would start again from the objective, which is a
    second piece of work under the paused one's name; the attempt fails
    saying so instead.

    Parameters
    ----------
    worker : ResolvedWorker
        The worker, as resolved for this dispatch.
    attempt : Attempt
        The attempt being dispatched.

    Returns
    -------
    OrchestrationError | None
        The refusal, not retryable, or ``None`` when the attempt may be sent.
    """
    if attempt.resumed_from is None or EXTENSION_URI in worker.capabilities.extensions:
        return None
    return OrchestrationError(
        code=ErrorCode.UNSUPPORTED_OPERATION,
        message=(
            f"Attempt {attempt.number} resumes from checkpoint "
            f"'{attempt.resumed_from}', and its worker no longer declares the "
            "orchestration extension, so nothing it could be sent says where "
            "to resume."
        ),
        retryable=False,
        source=f"adapter:{worker.capabilities.protocol.value}",
    )


class WorkerAdapter(ABC):
    """The protocol binding of section 7, as one port.

    Five things are required of an adapter — say what it can do, find the
    worker, dispatch, re-attach, cancel — and four are optional. The
    optional four answer ``Unsupported`` from the capability report unless
    the adapter overrides them, so an adapter cannot accidentally report a
    silent success for something it never did; and an adapter that claims an
    operation in its report and does not implement it fails loudly rather
    than quietly, which is the mistake this arrangement is really guarding
    against.
    """

    @abstractmethod
    def capabilities(self) -> AdapterCapabilities:
        """
        What this adapter can do at all, before it has met a worker.

        Returns
        -------
        AdapterCapabilities
            The report, narrowed per worker in ``resolve``.
        """

    @abstractmethod
    async def resolve(self, binding: AgentBinding) -> ResolvedWorker:
        """
        Find or bring up the worker the binding names.

        Parameters
        ----------
        binding : AgentBinding
            Which worker, over which protocol, and where.

        Returns
        -------
        ResolvedWorker
            The worker, its effective capabilities and a handle to reach it.
        """

    @abstractmethod
    def dispatch(
        self, worker: ResolvedWorker, execution: Execution, attempt: Attempt
    ) -> AsyncIterator[Observation]:
        """
        Send the objective and report everything that follows from it.

        The stream ends when the worker reaches a terminal state or the
        caller stops iterating; stopping is how a step boundary or a
        cancellation ends a dispatch, and the adapter tells the worker.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker, from ``resolve``.
        execution : Execution
            The execution being dispatched, with its objective and context.
        attempt : Attempt
            This dispatch, which is what a duplicate is told apart from.

        Returns
        -------
        AsyncIterator[Observation]
            What the worker did, as it does it.
        """

    @abstractmethod
    def subscribe(
        self, worker: ResolvedWorker, execution: Execution, attempt: Attempt
    ) -> AsyncIterator[Observation]:
        """
        Look again at work already dispatched, after losing sight of it.

        This is the recovery path of section 6.4 and conformance scenario 4:
        a durable step ended, a connection dropped, a pod rolled, and the
        attempt is still out there under its protocol handle. What can be
        seen depends on the protocol and is in the capability report.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker, resolved again.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt, carrying the protocol handle to re-attach to.

        Returns
        -------
        AsyncIterator[Observation]
            What the worker has been doing, or as much of it as is visible.
        """

    @abstractmethod
    async def cancel(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        reason: str | None = None,
    ) -> OperationOutcome:
        """
        Ask the worker to stop, without deleting anything.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being cancelled.
        attempt : Attempt
            The attempt to stop.
        reason : str | None
            Why, when there is something to say.

        Returns
        -------
        OperationOutcome
            What was done, or why it could not be.
        """

    async def steer(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        instructions: str,
        references: Sequence[ContextReference] = (),
    ) -> OperationOutcome:
        """
        Add instructions while the work is active.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being steered.
        attempt : Attempt
            The attempt being steered.
        instructions : str
            What to add.
        references : Sequence[ContextReference]
            Context to add with it.

        Returns
        -------
        OperationOutcome
            What was done, or why it could not be.
        """
        return self.refuse(WorkerOperation.STEER)

    async def pause(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        reason: str | None = None,
    ) -> OperationOutcome:
        """
        Ask for a recoverable pause.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being paused.
        attempt : Attempt
            The attempt being paused.
        reason : str | None
            Why, when there is something to say.

        Returns
        -------
        OperationOutcome
            What was done, or why it could not be.
        """
        return self.refuse(WorkerOperation.PAUSE)

    async def resume(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        checkpoint_id: str | None = None,
    ) -> OperationOutcome:
        """
        Resume from where the work stopped, or from a checkpoint.

        A protocol that resumes work in place does it here. A worker that
        speaks the Datalayer orchestration extension resumes in a new attempt
        whose delegation names the checkpoint (``Attempt.resumed_from``),
        which the caller records and dispatches; this answers whether this
        worker can be resumed from it, and says how.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being resumed.
        attempt : Attempt
            The attempt being resumed.
        checkpoint_id : str | None
            The checkpoint to resume from, when there is one.

        Returns
        -------
        OperationOutcome
            What was done, or why it could not be.
        """
        return self.refuse(WorkerOperation.RESUME)

    async def terminate(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        release_worker: bool = True,
    ) -> OperationOutcome:
        """
        Release the worker or the session, where the protocol permits it.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being terminated.
        attempt : Attempt
            The attempt whose worker is being released.
        release_worker : bool
            Whether the worker itself goes, or only this session.

        Returns
        -------
        OperationOutcome
            What was done, or why it could not be.
        """
        return self.refuse(WorkerOperation.TERMINATE)

    def refuse(self, operation: WorkerOperation) -> Unsupported:
        """
        The refusal this adapter's report records for an operation.

        Parameters
        ----------
        operation : WorkerOperation
            The operation being asked for.

        Returns
        -------
        Unsupported
            The refusal, from the capability report rather than invented here.

        Raises
        ------
        NotImplementedError
            When the report claims the operation and no method performs it.
            Loud, because the alternative is a caller believing it happened.
        """
        refusal = self.capabilities().refusal(operation)
        if refusal is None:
            raise NotImplementedError(
                f"{type(self).__name__} reports '{operation.value}' supported "
                "and does not implement it."
            )
        return refusal
