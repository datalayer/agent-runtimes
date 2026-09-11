# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The A2A binding (PLAN_ORCHESTRATOR.md, sections 7.1, O0-06).

Standard A2A only. There is no Datalayer extension on this path and no
private field smuggled into an A2A message: the mapping is the one in the
plan's table — an execution is a Task, an objective is a Message, a status
is a task status, an output is an Artifact, a cancel is a task cancellation
— and a worker that has never heard of Datalayer is expected to work.

It is built on ``agent_runtimes.subagents.a2a``, which already launches or
resolves a remote agent, streams its run, republishes it on the parent's
monitoring stream and cancels it from both ends. A second A2A client here
would be a second set of those decisions, and they would diverge; so the
``emit`` this adapter hands the relay does two things at once — it forwards
the ``agent.subagent`` phases to whatever the parent was already listening
to, and it turns the same phases into canonical observations.

What a plain A2A worker does not get is 19.8's fifth decision, and it is
declared in ``A2A_CAPABILITIES`` rather than discovered:

- No acceptance acknowledgement. A2A's ``submitted`` says an endpoint took
  the message; section 6.3 exists because that is not a worker taking
  responsibility. This adapter reports ``received`` there and never
  ``accepted``.
- No checkpoint, no steering, no pause, no resume, no terminate. A2A has
  none of them, and inventing them client-side would be inventing state.
- No lease. A dispatch that loses its stream is re-attached by polling
  ``tasks/get`` through ``subscribe``, which is all "no lease beyond
  polling" means.
- The objective travels as one text part rather than a structured DataPart.
  The structured form belongs with the extension package (O3-02).

Every one of those is on the execution's own event stream before anything is
dispatched, because ``dispatch`` yields ``capability_report`` first.

The trace (section 10, O0-11) is carried the only way standard A2A leaves
open: a ``traceparent`` header on the HTTP requests the relay makes, which
reaches them because the attempt span instruments ``httpx`` rather than
because this module reaches into a client it does not own. A worker that
ignores the header shows up as a broken link in the tree's trace, which is
what the item asks for — the alternative, a second trace nobody joins to the
first, is the thing worth avoiding.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import logging
import uuid
from dataclasses import dataclass
from typing import Any, AsyncIterator, Mapping

from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    Artifact,
    ArtifactProvenance,
    ArtifactType,
    Attempt,
    ErrorCode,
    Execution,
    LifecycleEvent,
    OrchestrationError,
    WorkerOperation,
)

from agent_runtimes.monitoring.otel import attempt_span
from agent_runtimes.orchestration.adapter import (
    AdapterCapabilities,
    Observation,
    OperationOutcome,
    Performed,
    ResolvedWorker,
    Unsupported,
    WorkerAdapter,
    answer_artifact,
    capability_report,
    now,
    objective_prompt,
    trace_id_of,
)
from agent_runtimes.orchestration.budget import budget_refusal, delegation_meta
from agent_runtimes.subagents.a2a import (
    TERMINAL_STATES,
    A2ARemoteAgent,
    A2ARemoteTarget,
    _artifact_text,
    cancel_remote_task,
    ensure_remote_agent,
    relay_a2a_task,
    spec_id_of,
)

logger = logging.getLogger(__name__)

__all__ = ["A2A_CAPABILITIES", "A2AWorkerAdapter"]


#: What an A2A task state is evidence of, in canonical terms. A2A's states
#: are not canonical states and are not treated as any: the lifecycle
#: decides what an event produces (O0-02). ``submitted`` is deliberately
#: absent — it is an acknowledgement that the endpoint has the message, not
#: a worker taking the work — and so are the terminal states, which are read
#: after the stream ends, when the reason for ending is known too.
A2A_OBSERVED: Mapping[str, LifecycleEvent] = {
    "working": LifecycleEvent.START,
    "input-required": LifecycleEvent.WAIT,
    "auth-required": LifecycleEvent.WAIT,
}

#: How an A2A task's last state is read once the stream is over. The error
#: code is what tells conformance scenario 3 (a worker refusing before it
#: accepts) from scenario 4 (one that took the work and then failed), and
#: ``retryable`` is what the retry policy reads: another attempt on a worker
#: that refused this one has nothing new to offer.
A2A_ENDINGS: Mapping[str, tuple[LifecycleEvent, ErrorCode | None, bool]] = {
    "completed": (LifecycleEvent.COMPLETE, None, False),
    "canceled": (LifecycleEvent.CANCEL, None, False),
    "failed": (LifecycleEvent.FAIL, ErrorCode.INTERNAL, True),
    "rejected": (LifecycleEvent.FAIL, ErrorCode.WORKER_REJECTED, False),
}


def _refused(operation: WorkerOperation, reason: str) -> Unsupported:
    """
    One refusal, for the capability report below.

    Parameters
    ----------
    operation : WorkerOperation
        What cannot be done over A2A.
    reason : str
        Why not, in the words a person reading the execution needs.

    Returns
    -------
    Unsupported
        The refusal.
    """
    return Unsupported(operation=operation, protocol=AgentProtocol.A2A, reason=reason)


#: 19.8's fifth decision as data: created, assigned, running, completed,
#: failed, cancelled, artifacts and cancellation, and nothing else.
A2A_CAPABILITIES = AdapterCapabilities(
    protocol=AgentProtocol.A2A,
    supported=frozenset(
        {
            WorkerOperation.DELEGATE,
            WorkerOperation.CANCEL,
            WorkerOperation.SUBSCRIBE,
        }
    ),
    unsupported=(
        _refused(
            WorkerOperation.STEER,
            "A2A has no way to add instructions to a task that is already "
            "running; a plain worker gets a new task or nothing",
        ),
        _refused(
            WorkerOperation.PAUSE,
            "A2A has no pause: a task runs or it is cancelled",
        ),
        _refused(
            WorkerOperation.RESUME,
            "nothing can be resumed that could not be paused",
        ),
        _refused(
            WorkerOperation.CHECKPOINT,
            "A2A has no worker-side checkpoint; the control plane persists "
            "what it holds, which is why recovery here is a retry and not a "
            "resume",
        ),
        _refused(
            WorkerOperation.COLLECT,
            "artifacts are read from the execution store, where they were "
            "registered as they arrived, not fetched from the worker",
        ),
        _refused(
            WorkerOperation.TERMINATE,
            "A2A's tasks/cancel stops a task, it does not release a worker; "
            "agent-runtimes' own terminate endpoint is not A2A and a worker "
            "that never heard of Datalayer does not serve it",
        ),
    ),
    #: Never 'accepted': see the module docstring and section 6.3.
    acknowledgements=frozenset(
        {
            AcknowledgementKind.RECEIVED,
            AcknowledgementKind.STARTED,
            AcknowledgementKind.COMPLETED,
        }
    ),
    #: A reduction that is about a milestone names it in quotes, so the
    #: conformance harness can find the adapter's own reason for skipping a
    #: scenario about that milestone rather than inventing one (O0-12).
    reductions=(
        "No 'accepted' acknowledgement: A2A's 'submitted' says the endpoint "
        "took the message, not that a worker took responsibility (6.3).",
        "No 'checkpointed' acknowledgement: A2A has no worker-side "
        "checkpoint, so recovery here is a retry and not a resume.",
        "No lease: an attempt that loses its stream is re-attached by "
        "polling tasks/get, which is decision 5's 'no lease beyond polling'.",
        "The objective and its context references travel as one text part, "
        "not as a structured DataPart (7.1); the structured form arrives "
        "with the extension package (O3-02).",
        "The trace reaches the worker as a traceparent header on the HTTP "
        "requests, not in the A2A message, so a worker that reads only the "
        "message body shows as a broken link rather than a second trace "
        "(section 10, O0-11).",
    ),
)


@dataclass
class _Seen:
    """What the relay has told us so far, kept so the end can be read.

    The stream reports the same A2A state many times. Only a change is
    worth an observation: a second ``working`` would ask the lifecycle to
    start an execution that is already running, and be recorded as the
    invalid transition it is.
    """

    task_id: str | None = None
    state: str | None = None
    acknowledged: bool = False
    #: The final status message's metadata, which names the model budget's
    #: limit when that is what stopped the worker (O1-07).
    metadata: dict[str, Any] | None = None


class A2AWorkerAdapter(WorkerAdapter):
    """One execution, delegated to an agent that speaks standard A2A.

    Parameters
    ----------
    emit : Callable[..., None] | None
        The parent's ``agent.subagent`` emitter, when this dispatch is
        happening inside a parent agent's run. Passing it keeps the events
        the transcript already shows: an orchestration that made the
        subagent stream go quiet would be a regression dressed as progress.
    poll_interval_seconds : float
        How often ``subscribe`` asks the worker where its task has got to.
    """

    def __init__(
        self,
        *,
        emit: Any = None,
        poll_interval_seconds: float = 2.0,
        credential: str | None = None,
    ) -> None:
        """
        Hold the parent's emitter, the polling interval and the execution's credential.

        Parameters
        ----------
        emit : Callable[..., None] | None
            The parent's subagent emitter, if any.
        poll_interval_seconds : float
            Seconds between ``tasks/get`` polls in ``subscribe``.
        credential : str | None
            The execution's token for the run, handed to the worker with the
            delegation (O1-17).
        """
        self._emit = emit
        self._poll_interval_seconds = poll_interval_seconds
        self._credential = credential

    def capabilities(self) -> AdapterCapabilities:
        """
        What A2A can do, before a worker has been met.

        Returns
        -------
        AdapterCapabilities
            19.8's fifth decision.
        """
        return A2A_CAPABILITIES

    async def resolve(self, binding: AgentBinding) -> ResolvedWorker:
        """
        Find the worker, or launch it from the agentspec the binding names.

        A binding with an endpoint is an agent already answering. A binding
        without one names an agentspec, and launching it — beside this
        server or on a Datalayer runtime — is what ``ensure_remote_agent``
        already does for subagents; doing it a second way here is how the
        two would come to disagree about what a launched agent is.

        Parameters
        ----------
        binding : AgentBinding
            Which worker, and where.

        Returns
        -------
        ResolvedWorker
            The worker, its capabilities and the handle to reach it.

        Raises
        ------
        ValueError
            When the binding is not an A2A binding.
        """
        if binding.protocol is not AgentProtocol.A2A:
            raise ValueError(
                f"The A2A adapter was given a '{binding.protocol.value}' binding."
            )
        target = A2ARemoteTarget(
            url=binding.endpoint,
            spec_id=None if binding.endpoint else spec_id_of(binding.agent_id),
        )
        remote = await ensure_remote_agent(
            binding.agent_id,
            f"A2A worker for '{binding.capability}'",
            target,
        )
        return ResolvedWorker(
            binding=binding.model_copy(update={"endpoint": remote.url}),
            capabilities=A2A_CAPABILITIES,
            endpoint=remote.url,
            # What the worker says about itself, shown and never followed.
            details=remote.describe(),
            handle=remote,
        )

    async def dispatch(
        self, worker: ResolvedWorker, execution: Execution, attempt: Attempt
    ) -> AsyncIterator[Observation]:
        """
        Send the objective as an A2A message and report the task it becomes.

        The caller has already assigned the execution: choosing a worker is
        a control-plane decision, not something an adapter observes. From
        here everything is observation — the endpoint has the message, the
        worker started, it is waiting on input, it produced artifacts, it
        ended — and what each of those means to the execution is decided
        where the execution lives.

        Stopping the iteration cancels the remote task rather than
        abandoning it, so a step boundary or a cancelled parent does not
        leave a worker spending on an answer nobody will read.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker, from ``resolve``.
        execution : Execution
            The execution, with its objective and context manifest.
        attempt : Attempt
            This dispatch.

        Yields
        ------
        Observation
            What the worker did, as it did it.
        """
        remote = _remote(worker)
        # O0-11: one span for this dispatch, inside the tree's trace. It
        # stays current across the yields below, so the events the caller
        # records between observations land on it, and it is what puts the
        # traceparent on the relay's outgoing requests.
        with attempt_span(execution, attempt, operation=WorkerOperation.DELEGATE):
            yield capability_report(worker.capabilities)

            queue: asyncio.Queue[Observation | None] = asyncio.Queue()
            seen = _Seen()
            relay = asyncio.create_task(self._relay(remote, execution, queue, seen))
            try:
                while True:
                    observation = await queue.get()
                    if observation is None:
                        break
                    yield observation
            finally:
                if not relay.done():
                    # relay_a2a_task tells the remote agent on the way out.
                    relay.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await relay

            if relay.cancelled():
                return
            failure = relay.exception()
            if failure is not None:
                yield self._ending(seen, str(failure))
                return

            answer = str(relay.result() or "")
            # The whole body travels with the observation, for the durable
            # worker to write to the platform (O1-10); the record keeps a
            # summary and the body's hash.
            for artifact, body in await self._artifacts(
                remote, execution, attempt, seen, answer
            ):
                yield Observation.produced(artifact, data={"text": body})
            yield Observation.moved(
                LifecycleEvent.COMPLETE,
                message=seen.state or "completed",
                protocol_task_id=seen.task_id,
            )
            yield Observation.acknowledged(
                AcknowledgementKind.COMPLETED,
                message="The A2A task ended and its artifacts are registered.",
                protocol_task_id=seen.task_id,
            )

    async def subscribe(
        self, worker: ResolvedWorker, execution: Execution, attempt: Attempt
    ) -> AsyncIterator[Observation]:
        """
        Re-attach to a task already dispatched, by polling ``tasks/get``.

        This is the whole of decision 5's "no lease beyond polling", and the
        recovery path of conformance scenario 4. The first poll reports
        where the task stands as progress rather than as a state change: an
        execution that was running before the disconnect is still running,
        and saying so again would be an adapter inventing a transition. Only
        a change since then, and the ending, are reported as moves.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker, resolved again.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt, carrying the A2A task id to re-attach to.

        Yields
        ------
        Observation
            Where the task stands, and what it does next.
        """
        remote = _remote(worker)
        # The re-attach is part of the same attempt, so it goes under the
        # same span: restoring the execution's traceparent is what rejoins
        # the tree's trace after the step that dispatched it has gone.
        with attempt_span(execution, attempt, operation=WorkerOperation.SUBSCRIBE):
            task_id = attempt.protocol_task_id
            if not task_id:
                yield Observation.failed(
                    OrchestrationError(
                        code=ErrorCode.NOT_FOUND,
                        message=(
                            "This attempt has no A2A task id, so there is nothing to "
                            "re-attach to; it never reached the worker."
                        ),
                        retryable=True,
                        source="adapter:a2a",
                    )
                )
                return

            seen = _Seen(task_id=task_id)
            first = True
            while True:
                task = await self._get_task(remote, task_id)
                if task is None:
                    yield Observation.failed(
                        OrchestrationError(
                            code=ErrorCode.WORKER_UNREACHABLE,
                            message=f"The worker did not answer for task '{task_id}'.",
                            retryable=True,
                            source="adapter:a2a",
                        )
                    )
                    return
                state = str((task.get("status") or {}).get("state") or "")
                if state in TERMINAL_STATES:
                    for artifact, body in _task_artifacts(task, execution, attempt):
                        yield Observation.produced(artifact, data={"text": body})
                    yield self._ending(_Seen(task_id=task_id, state=state), None)
                    return
                if first:
                    yield Observation.progress(
                        f"Re-attached to A2A task '{task_id}', which is '{state}'.",
                        protocol_task_id=task_id,
                    )
                elif state != seen.state:
                    observed = A2A_OBSERVED.get(state)
                    yield (
                        Observation.moved(
                            observed, message=state, protocol_task_id=task_id
                        )
                        if observed
                        else Observation.progress(
                            f"A2A task '{task_id}' is '{state}'.",
                            protocol_task_id=task_id,
                        )
                    )
                seen.state, first = state, False
                await asyncio.sleep(self._poll_interval_seconds)

    async def cancel(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        reason: str | None = None,
    ) -> OperationOutcome:
        """
        Stop the task, both ways a worker of ours can be asked.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being cancelled.
        attempt : Attempt
            The attempt whose task is to stop.
        reason : str | None
            Why, for the record; A2A carries no reason on a cancellation.

        Returns
        -------
        OperationOutcome
            What was asked of the worker.
        """
        task_id = attempt.protocol_task_id
        if not task_id:
            return Performed(
                operation=WorkerOperation.CANCEL,
                detail="There is no A2A task to cancel; nothing reached the worker.",
            )
        await cancel_remote_task(_remote(worker), task_id)
        return Performed(
            operation=WorkerOperation.CANCEL,
            detail=f"Asked the worker to stop task '{task_id}'."
            + (f" Reason: {reason}" if reason else ""),
        )

    # -- Working parts. ------------------------------------------------------

    async def _relay(
        self,
        remote: A2ARemoteAgent,
        execution: Execution,
        queue: "asyncio.Queue[Observation | None]",
        seen: _Seen,
    ) -> str:
        """
        Run the shared relay, turning its phases into observations.

        Parameters
        ----------
        remote : A2ARemoteAgent
            The worker.
        execution : Execution
            The execution being dispatched.
        queue : asyncio.Queue[Observation | None]
            Where observations go; ``None`` ends the stream.
        seen : _Seen
            What has been observed, read after the relay returns.

        Returns
        -------
        str
            The worker's answer.
        """

        def emit(phase: str, **payload: Any) -> None:
            """
            Republish one step of the remote run, twice over.

            Parameters
            ----------
            phase : str
                The subagent phase the relay is reporting.
            **payload : Any
                What it is reporting.
            """
            if self._emit is not None:
                # The parent's transcript keeps the events it already had.
                self._emit(phase, **payload)
            for observation in _observe(phase, payload, seen):
                queue.put_nowait(observation)

        try:
            return await relay_a2a_task(
                remote,
                objective_prompt(execution),
                # One tree, one A2A context: the plan's table maps context
                # references onto A2A, and the root is what groups a tree.
                context_id=execution.root_execution_id,
                emit=emit,
                # The model budget the worker's run is held to (O1-07), and
                # the execution's token it reaches Datalayer with (O1-17).
                metadata=delegation_meta(execution, credential=self._credential),
            )
        finally:
            queue.put_nowait(None)

    def _ending(self, seen: _Seen, detail: str | None) -> Observation:
        """
        Read the end of a task: which lifecycle event, and which failure.

        Parameters
        ----------
        seen : _Seen
            What the stream last said.
        detail : str | None
            What the relay said when it refused to return an answer.

        Returns
        -------
        Observation
            The terminal move, with the error when there is one.
        """
        state = seen.state or ""
        refused = (
            budget_refusal(seen.metadata, source="adapter:a2a")
            if state == "failed"
            else None
        )
        if refused is not None:
            # Stopped by the model budget the delegation set: not a worker
            # that broke, and nothing another attempt could spend (O1-07).
            return Observation.moved(
                LifecycleEvent.FAIL,
                message=refused.message,
                error=refused,
                protocol_task_id=seen.task_id,
            )
        event, code, retryable = A2A_ENDINGS.get(
            state, (LifecycleEvent.FAIL, ErrorCode.WORKER_UNREACHABLE, True)
        )
        error = (
            OrchestrationError(
                code=code,
                message=detail or f"The A2A task ended '{state or 'unknown'}'.",
                retryable=retryable,
                source="adapter:a2a",
            )
            if code is not None
            else None
        )
        return Observation.moved(
            event,
            message=detail or state or None,
            error=error,
            protocol_task_id=seen.task_id,
        )

    async def _artifacts(
        self,
        remote: A2ARemoteAgent,
        execution: Execution,
        attempt: Attempt,
        seen: _Seen,
        answer: str,
    ) -> list[tuple[Artifact, str]]:
        """
        The task's A2A artifacts, or the answer it streamed instead.

        A worker that registered artifacts has them read back with their own
        names and identifiers, so the canonical artifact is the worker's
        artifact rather than a rendering of it. A worker that only streamed
        an answer has that answer registered — which is not a lesser version
        of the same thing but a different observation, and it is recorded as
        what it is.

        Parameters
        ----------
        remote : A2ARemoteAgent
            The worker.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt that produced them.
        seen : _Seen
            What the stream said, including the task id.
        answer : str
            What the relay returned.

        Returns
        -------
        list[tuple[Artifact, str]]
            The artifacts to register, each with its body.
        """
        task = await self._get_task(remote, seen.task_id) if seen.task_id else None
        artifacts = _task_artifacts(task or {}, execution, attempt)
        if artifacts:
            return artifacts
        return [(answer_artifact(execution, attempt, answer), answer)] if answer else []

    async def _get_task(
        self, remote: A2ARemoteAgent, task_id: str | None
    ) -> dict[str, Any] | None:
        """
        Ask the worker where a task stands, over standard ``tasks/get``.

        Parameters
        ----------
        remote : A2ARemoteAgent
            The worker.
        task_id : str | None
            The task to ask about.

        Returns
        -------
        dict[str, Any] | None
            The task, or ``None`` when the worker did not answer with one.
        """
        if not task_id:
            return None
        import httpx
        from fasta2a.client import A2AClient

        headers = {"Authorization": f"Bearer {remote.token}"} if remote.token else {}
        try:
            async with httpx.AsyncClient(
                base_url=remote.url, headers=headers, timeout=30.0
            ) as http:
                response = await A2AClient(
                    base_url=remote.url, http_client=http
                ).get_task(task_id)
        except Exception:  # noqa: BLE001 - an unreachable worker is an observation
            logger.debug("tasks/get failed for %s", task_id, exc_info=True)
            return None
        result = response.get("result") if isinstance(response, dict) else None
        return result if isinstance(result, dict) else None


def _remote(worker: ResolvedWorker) -> A2ARemoteAgent:
    """
    The A2A handle on a resolved worker, or a refusal to guess.

    Parameters
    ----------
    worker : ResolvedWorker
        The worker as resolved.

    Returns
    -------
    A2ARemoteAgent
        The handle.

    Raises
    ------
    ValueError
        When the worker was not resolved by this adapter.
    """
    if not isinstance(worker.handle, A2ARemoteAgent):
        raise ValueError(
            "This worker was not resolved by the A2A adapter; resolve it again "
            "rather than reusing a handle from another step."
        )
    return worker.handle


def _observe(phase: str, payload: Mapping[str, Any], seen: _Seen) -> list[Observation]:
    """
    Turn one relayed subagent phase into observations, or into none.

    Parameters
    ----------
    phase : str
        The phase the relay reported.
    payload : Mapping[str, Any]
        What it reported.
    seen : _Seen
        What has been observed so far, which decides what is new.

    Returns
    -------
    list[Observation]
        What is worth reporting, which is often nothing: the stream repeats
        a state many times and only a change means anything.
    """
    if phase != "status":
        message = {
            "text": str(payload.get("text") or ""),
            "tool_call": f"Calling '{payload.get('toolName') or ''}'.",
            "tool_result": f"'{payload.get('toolName') or ''}' answered.",
        }.get(phase, f"The worker reported '{phase}'.")
        return [
            Observation.progress(
                message or None,
                data={"phase": phase, **payload},
                protocol_task_id=seen.task_id,
            )
        ]

    task_id = payload.get("taskId") or seen.task_id
    state = str(payload.get("state") or "")
    seen.task_id = task_id
    observations: list[Observation] = []
    if not seen.acknowledged:
        # The first status of any kind is the endpoint saying it has the
        # message. That is 'received', and on standard A2A it is the only
        # acknowledgement there is (19.8, decision 5).
        seen.acknowledged = True
        observations.append(
            Observation.acknowledged(
                AcknowledgementKind.RECEIVED,
                message=f"The A2A endpoint has the task, in state '{state}'.",
                protocol_task_id=task_id,
            )
        )
    if state == seen.state:
        return observations
    seen.state = state
    if state in TERMINAL_STATES:
        # Read after the stream ends, where the reason is known too.
        if isinstance(payload.get("metadata"), Mapping):
            seen.metadata = dict(payload["metadata"])
        return observations
    observed = A2A_OBSERVED.get(state)
    if observed is None:
        observations.append(
            Observation.progress(
                f"The A2A task is '{state}'.", protocol_task_id=task_id
            )
        )
        return observations
    observations.append(
        Observation.moved(observed, message=state, protocol_task_id=task_id)
    )
    if observed is LifecycleEvent.START:
        # Started is a milestone as well as a move, and the move goes first:
        # an acknowledgement never lands on an execution the lifecycle has
        # not yet let start.
        observations.append(
            Observation.acknowledged(
                AcknowledgementKind.STARTED,
                message=f"The worker is running task '{task_id}'.",
                protocol_task_id=task_id,
            )
        )
    return observations


def _notebook_part(raw: Mapping[str, Any]) -> str | None:
    """
    The notebook an A2A artifact carries, as JSON text, when it carries one.

    In a file part under the notebook media type with its bytes inline, or in
    a data part that is an nbformat document itself.

    Parameters
    ----------
    raw : Mapping[str, Any]
        The A2A artifact.

    Returns
    -------
    str | None
        The notebook's JSON, or ``None``.
    """
    import base64
    import json

    from agent_runtimes.orchestration.documents import NOTEBOOK_MEDIA_TYPE, notebook_of

    for part in raw.get("parts") or []:
        if not isinstance(part, dict):
            continue
        file = part.get("file")
        media_type = (
            (file.get("mimeType") or file.get("mime_type"))
            if isinstance(file, dict)
            else None
        )
        if media_type == NOTEBOOK_MEDIA_TYPE and file.get("bytes"):
            try:
                text = base64.b64decode(str(file["bytes"])).decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                return None
            return text if notebook_of(text) is not None else None
        data = part.get("data")
        if isinstance(data, dict) and notebook_of(json.dumps(data)) is not None:
            return json.dumps(data)
    return None


def _task_artifacts(
    task: Mapping[str, Any], execution: Execution, attempt: Attempt
) -> list[tuple[Artifact, str]]:
    """
    The A2A artifacts of a task, as canonical artifacts with provenance.

    Each comes with its body, which the observation carries for the durable
    worker to write to the platform (O1-10): the notebook, when a part is
    one, and the artifact's text otherwise. The record keeps a summary and
    the body's hash.

    Parameters
    ----------
    task : Mapping[str, Any]
        The task as the worker returned it.
    execution : Execution
        The execution.
    attempt : Attempt
        The attempt that produced them.

    Returns
    -------
    list[tuple[Artifact, str]]
        One canonical artifact per A2A artifact, with its body.
    """
    from agent_runtimes.orchestration.documents import NOTEBOOK_MEDIA_TYPE, notebook_of

    registered: list[tuple[Artifact, str]] = []
    for raw in task.get("artifacts") or []:
        if not isinstance(raw, dict):
            continue
        notebook = _notebook_part(raw)
        # The same reader the relay uses, so an artifact says the same thing
        # whether it arrived on the stream or from tasks/get.
        text = notebook if notebook is not None else _artifact_text(raw)
        body = text.encode("utf-8")
        if notebook is not None:
            cells = len((notebook_of(notebook) or {}).get("cells") or [])
            summary = f"A notebook of {cells} cells"
        else:
            summary = text if len(text) <= 200 else text[:200] + "…"
        registered.append(
            (
                Artifact(
                    artifact_id=str(
                        raw.get("artifactId")
                        or raw.get("artifact_id")
                        or f"art_{uuid.uuid4().hex}"
                    ),
                    type=ArtifactType.NOTEBOOK
                    if notebook is not None
                    else ArtifactType.FILE,
                    name=str(raw.get("name") or "artifact"),
                    media_type=NOTEBOOK_MEDIA_TYPE
                    if notebook is not None
                    else "text/plain",
                    size_bytes=len(body),
                    provenance=[
                        ArtifactProvenance(
                            execution_id=execution.execution_id,
                            attempt_id=attempt.attempt_id,
                            agent_id=attempt.agent_id,
                            produced_at=now(),
                            source_references=[
                                reference.uri
                                for reference in execution.context.references
                            ],
                            content_hash=f"sha256:{hashlib.sha256(body).hexdigest()}",
                            trace_id=trace_id_of(execution.trace.traceparent),
                        )
                    ],
                    summary=summary,
                ),
                text,
            )
        )
    return registered
