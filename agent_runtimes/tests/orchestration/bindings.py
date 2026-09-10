# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The registry, and the only protocol-specific code in this suite (O0-12).

A conformance scenario says what the worker does — it works for a while and
answers, it refuses before taking the job, it takes the job and then fails,
it is still going when we lose sight of it — and a binding renders that into
whichever protocol it speaks. The scenario never learns which one it got,
which is the whole claim O0-12 is making: the same orchestration runs over
A2A and over ACP with nothing changed in between.

Three entries are registered, and the third is a worker rather than a
protocol. An ACP agent that does not declare ``loadSession`` cannot be
re-attached to, and ``resolve`` narrows its capability report to say so
(O0-07). Registering it means the harness has something real to skip, and
that the skip comes from a declaration the adapter produced rather than from
a protocol name written into a test.

Nothing here reaches a network. The A2A relay and the ACP channel are stood
in for, because what is under test is the orchestration, not ``httpx``.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Mapping

import pytest
from acp.schema import AgentCapabilities
from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentProtocol,
    Attempt,
    Execution,
    LifecycleEvent,
    WorkerOperation,
)

from agent_runtimes.orchestration import (
    AdapterCapabilities,
    InMemoryExecutionStore,
    Observation,
    ResolvedWorker,
    WorkerAdapter,
)
from agent_runtimes.orchestration.adapters import a2a as a2a_binding
from agent_runtimes.orchestration.adapters.a2a import A2AWorkerAdapter
from agent_runtimes.orchestration.adapters.acp import ACPChannel, ACPWorkerAdapter
from agent_runtimes.subagents.a2a import A2ARemoteAgent
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution

ACP_ENDPOINT = "ws://worker.test/api/v1/acp/ws/coder"
A2A_ENDPOINT = "http://worker.test/api/v1/a2a/agents/validator"

#: When a scenario stops consuming a stream, said as a rule about what has
#: been observed rather than as a number of observations.
Stop = Callable[[Observation], bool]


class Ending(str, Enum):
    """How the worker's turn finishes, in terms neither protocol owns.

    ``REJECTED`` and ``FAILED`` are deliberately separate: section 13 asks
    for a worker refusing before it accepts (scenario 3) and one that
    disappeared after accepting (scenario 4) to be told apart, and it is the
    error code and its ``retryable`` that tell them apart. ``WORKING`` never
    finishes at all, which is what a disconnect happens in the middle of.
    """

    COMPLETED = "completed"
    REJECTED = "rejected"
    FAILED = "failed"
    WORKING = "working"


@dataclass(frozen=True)
class WorkerScript:
    """What the worker does, said once for every protocol.

    ``progress`` is what it says while it is working; ``answer`` is what it
    says at the end, which is what becomes the execution's artifact. The two
    are separate because a worker's running commentary is not its result,
    and a suite that could not tell them apart would pass on an adapter that
    registered the wrong one.
    """

    progress: tuple[str, ...] = ("Running the notebook.",)
    answer: str = "The notebook runs clean."
    ending: Ending = Ending.COMPLETED


class ConformanceBinding(ABC):
    """One registered adapter, with everything the scenarios need of it.

    A binding builds the worker, resolves it through the adapter's own
    ``resolve`` — so the per-worker narrowing under test is the one the
    adapter produced — and answers what this worker can be asked to do by
    reading its declared report rather than by knowing which protocol it is.
    """

    #: What this entry is called in the test identifiers.
    name: str
    #: Which binding it exercises.
    protocol: AgentProtocol

    @abstractmethod
    def execution(self, **kwargs: Any) -> Execution:
        """
        One execution bound to this protocol's worker.

        Parameters
        ----------
        **kwargs : Any
            Passed to the shared record builder.

        Returns
        -------
        Execution
            The execution, in the state a freshly created one is in.
        """

    @abstractmethod
    async def resolve(
        self, monkeypatch: pytest.MonkeyPatch, script: WorkerScript
    ) -> tuple[WorkerAdapter, ResolvedWorker]:
        """
        Stand the worker up and resolve it through the adapter.

        Parameters
        ----------
        monkeypatch : pytest.MonkeyPatch
            The patcher, for the protocol client this binding stands in for.
        script : WorkerScript
            What the worker will do when it is dispatched to.

        Returns
        -------
        tuple[WorkerAdapter, ResolvedWorker]
            The adapter, and the worker as ``resolve`` returned it.
        """

    @property
    @abstractmethod
    def declared(self) -> AdapterCapabilities:
        """
        What the adapter says it can do before it has met a worker.

        Returns
        -------
        AdapterCapabilities
            The report.
        """

    def reattach_refusal(self, worker: ResolvedWorker) -> str | None:
        """
        Why this worker cannot be looked at again, in its own declared words.

        The base answer is the capability report's: an adapter that refused
        ``subscribe`` outright refused it for every worker. A binding whose
        adapter narrows per worker overrides this and reads that narrowing.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker as ``resolve`` returned it.

        Returns
        -------
        str | None
            The declared reason, or ``None`` when re-attaching is possible.
        """
        refusal = worker.capabilities.refusal(WorkerOperation.SUBSCRIBE)
        return refusal.reason if refusal is not None else None


class A2ABinding(ConformanceBinding):
    """A worker that speaks standard A2A, with the relay stood in for.

    The relay is where an A2A run's phases come from, so the script is
    replayed through the ``emit`` the adapter hands it — the same path a
    real stream takes — rather than by feeding the adapter observations it
    would never have built itself.
    """

    name = "a2a"
    protocol = AgentProtocol.A2A

    def execution(self, **kwargs: Any) -> Execution:
        """
        One execution bound to the A2A worker.

        Parameters
        ----------
        **kwargs : Any
            Passed to the shared record builder.

        Returns
        -------
        Execution
            The execution.
        """
        kwargs.setdefault("protocol", AgentProtocol.A2A)
        kwargs.setdefault("agent_id", "notebook-validator")
        kwargs.setdefault("endpoint", A2A_ENDPOINT)
        return an_execution(**kwargs)

    @property
    def declared(self) -> AdapterCapabilities:
        """
        What A2A can do, before a worker has been met.

        Returns
        -------
        AdapterCapabilities
            The report.
        """
        return A2AWorkerAdapter().capabilities()

    async def resolve(
        self, monkeypatch: pytest.MonkeyPatch, script: WorkerScript
    ) -> tuple[WorkerAdapter, ResolvedWorker]:
        """
        Stand the worker up, and resolve it the way the adapter really does.

        Parameters
        ----------
        monkeypatch : pytest.MonkeyPatch
            The patcher.
        script : WorkerScript
            What the worker will do.

        Returns
        -------
        tuple[WorkerAdapter, ResolvedWorker]
            The adapter and the resolved worker.
        """
        remote = A2ARemoteAgent(
            name="notebook-validator", url=A2A_ENDPOINT, launch="remote"
        )
        task = _A2ATask(script)

        async def ensure_remote_agent(name, description, target):
            """
            Answer with the worker instead of launching one.

            Parameters
            ----------
            name : str
                The worker's name.
            description : str
                What it is for.
            target : A2ARemoteTarget
                Where it is, or which agentspec to launch.

            Returns
            -------
            A2ARemoteAgent
                The worker.
            """
            return remote

        async def relay_a2a_task(remote_agent, objective, *, context_id, emit):
            """
            Replay the script through the relay's own phases.

            Parameters
            ----------
            remote_agent : A2ARemoteAgent
                The worker.
            objective : str
                The objective, as text.
            context_id : str
                The A2A context, which is the tree's root.
            emit : Callable[..., None]
                Where phases are republished.

            Returns
            -------
            str
                The worker's answer.
            """
            task.sent.append({"text": objective, "contextId": context_id})
            return await task.run(emit)

        async def get_task(self, remote_agent, task_id):
            """
            Answer ``tasks/get`` from the worker's current state.

            Parameters
            ----------
            self : A2AWorkerAdapter
                The adapter.
            remote_agent : A2ARemoteAgent
                The worker.
            task_id : str | None
                The task asked about.

            Returns
            -------
            dict[str, Any] | None
                The task as the worker would report it.
            """
            return task.snapshot()

        monkeypatch.setattr(a2a_binding, "ensure_remote_agent", ensure_remote_agent)
        monkeypatch.setattr(a2a_binding, "relay_a2a_task", relay_a2a_task)
        monkeypatch.setattr(A2AWorkerAdapter, "_get_task", get_task)
        adapter = A2AWorkerAdapter(poll_interval_seconds=0)
        return adapter, await adapter.resolve(self.execution().agent)


class ACPBinding(ConformanceBinding):
    """An agent that speaks ACP, over a scripted channel.

    Parameters
    ----------
    name : str
        What this entry is called.
    loads : bool
        Whether the agent declares ``loadSession``. The entry that does not
        is the one that gives the harness a real skip to report.
    """

    protocol = AgentProtocol.ACP

    def __init__(self, *, name: str, loads: bool) -> None:
        """
        Record which agent this entry stands for.

        Parameters
        ----------
        name : str
            What this entry is called.
        loads : bool
            Whether the agent declares ``loadSession``.
        """
        self.name = name
        self._loads = loads

    def execution(self, **kwargs: Any) -> Execution:
        """
        One execution bound to the ACP agent.

        Parameters
        ----------
        **kwargs : Any
            Passed to the shared record builder.

        Returns
        -------
        Execution
            The execution.
        """
        kwargs.setdefault("protocol", AgentProtocol.ACP)
        kwargs.setdefault("agent_id", "coder")
        kwargs.setdefault("endpoint", ACP_ENDPOINT)
        return an_execution(**kwargs)

    @property
    def declared(self) -> AdapterCapabilities:
        """
        What ACP can do, before a particular agent has been asked.

        Returns
        -------
        AdapterCapabilities
            The report.
        """
        return ACPWorkerAdapter().capabilities()

    async def resolve(
        self, monkeypatch: pytest.MonkeyPatch, script: WorkerScript
    ) -> tuple[WorkerAdapter, ResolvedWorker]:
        """
        Stand the agent up, and resolve it the way the adapter really does.

        Resolving for real is what makes the per-worker narrowing genuine:
        the ``loadSession`` this binding declares comes back as the reduction
        the harness later skips on.

        Parameters
        ----------
        monkeypatch : pytest.MonkeyPatch
            The patcher, unused here because the channel is injected.
        script : WorkerScript
            What the agent will do.

        Returns
        -------
        tuple[WorkerAdapter, ResolvedWorker]
            The adapter and the resolved worker.
        """
        channel = _ACPChannel(script, AgentCapabilities(load_session=self._loads))

        async def connect(endpoint, headers=None, timeout=None):
            """
            Answer with the scripted channel.

            Parameters
            ----------
            endpoint : str
                Where the agent answers.
            headers : Mapping[str, str] | None
                What the adapter put on the connection, kept for assertions.
            timeout : float | None
                How long a request may take.

            Returns
            -------
            _ACPChannel
                The channel.
            """
            channel.headers = dict(headers or {})
            return channel

        adapter = ACPWorkerAdapter(connect=connect)
        return adapter, await adapter.resolve(self.execution().agent)

    def reattach_refusal(self, worker: ResolvedWorker) -> str | None:
        """
        Why this agent cannot be re-attached to, from what ``resolve`` found.

        ACP supports ``subscribe`` as a protocol and refuses it per agent, so
        the answer is in the narrowing rather than in the base report. The
        reduction is taken from the worker's own capabilities, which is what
        keeps this from being the protocol name in disguise.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker as ``resolve`` returned it.

        Returns
        -------
        str | None
            The declared reason, or ``None`` when the session can be loaded.
        """
        refused = super().reattach_refusal(worker)
        if refused is not None or worker.details.get("loadSession"):
            return refused
        return next(
            reduction
            for reduction in worker.capabilities.reductions
            if "loadSession" in reduction
        )


#: Every adapter and worker the suite runs against. A binding added here is
#: run through all six scenarios without any of them being edited, which is
#: what the registry is for.
BINDINGS: tuple[ConformanceBinding, ...] = (
    A2ABinding(),
    ACPBinding(name="acp", loads=True),
    ACPBinding(name="acp-without-loadsession", loads=False),
)


@dataclass
class Delivered:
    """One delegation, ready to be dispatched, with where it is recorded.

    The store is the canonical side and the adapter is the protocol side;
    a scenario holds both because what it is asserting is that the second
    became the first correctly.
    """

    binding: ConformanceBinding
    adapter: WorkerAdapter
    worker: ResolvedWorker
    store: InMemoryExecutionStore
    execution: Execution
    attempt: Attempt


async def deliver(
    binding: ConformanceBinding,
    monkeypatch: pytest.MonkeyPatch,
    script: WorkerScript,
    *,
    idempotency_key: str = "idem-1",
) -> Delivered:
    """
    Do what a control plane does before an adapter is asked for anything.

    Create the execution under the command's idempotency key, record the
    first attempt, and assign it — choosing a worker is a control-plane
    decision and never something an adapter observes.

    Parameters
    ----------
    binding : ConformanceBinding
        Which adapter and worker.
    monkeypatch : pytest.MonkeyPatch
        The patcher.
    script : WorkerScript
        What the worker will do.
    idempotency_key : str
        The key of the ``executions.delegate`` that asked for this.

    Returns
    -------
    Delivered
        Everything the scenario needs to dispatch and to read the result.
    """
    store = InMemoryExecutionStore()
    adapter, worker = await binding.resolve(monkeypatch, script)
    execution = await store.create(binding.execution(), idempotency_key=idempotency_key)
    attempt = await store.record_attempt(an_attempt(execution))
    execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)
    return Delivered(
        binding=binding,
        adapter=adapter,
        worker=worker,
        store=store,
        execution=execution,
        attempt=attempt,
    )


def anything(observation: Observation) -> bool:
    """
    Stop at the first thing reported, whatever it was.

    For the scenarios that need only to know the work was found again, and
    where going on would mean polling a worker that is still working.

    Parameters
    ----------
    observation : Observation
        What the adapter reported.

    Returns
    -------
    bool
        Always true.
    """
    return True


def started(observation: Observation) -> bool:
    """
    Say whether this is the worker's own evidence that it took the work.

    Which milestone that is depends on the adapter and is declared, not
    assumed: neither of the Phase 0 bindings can report ``accepted``, and
    both report ``started`` the moment the worker actually does something.

    Parameters
    ----------
    observation : Observation
        What the adapter reported.

    Returns
    -------
    bool
        True at the started milestone.
    """
    return observation.acknowledgement is AcknowledgementKind.STARTED


async def dispatch(
    delivered: Delivered, *, until: Stop | None = None
) -> list[Observation]:
    """
    Dispatch, recording every observation as the control plane would.

    ``until`` is how a disconnect is written: the caller stops consuming,
    which is exactly what a step boundary, a cancelled parent or a pod roll
    looks like from the adapter's side. It is a rule about what was
    observed rather than a count, because two protocols do not report the
    same number of things on the way to the same milestone. The stream is
    closed rather than abandoned, so the adapter's own cleanup runs.

    Parameters
    ----------
    delivered : Delivered
        The delegation to dispatch.
    until : Stop | None
        Stop once an observation satisfies this.

    Returns
    -------
    list[Observation]
        The observations that were seen.
    """
    stream = delivered.adapter.dispatch(
        delivered.worker, delivered.execution, delivered.attempt
    )
    return await _drain(delivered, stream, until)


async def subscribe(
    delivered: Delivered, *, until: Stop | None = None
) -> list[Observation]:
    """
    Look again at work already dispatched, recording what is seen.

    Parameters
    ----------
    delivered : Delivered
        The delegation, whose attempt now carries the protocol's handle.
    until : Stop | None
        Stop once an observation satisfies this.

    Returns
    -------
    list[Observation]
        The observations that were seen.
    """
    attempt = await current_attempt(delivered)
    stream = delivered.adapter.subscribe(delivered.worker, delivered.execution, attempt)
    return await _drain(delivered, stream, until)


async def current_attempt(delivered: Delivered) -> Attempt:
    """
    The attempt as the store now holds it, with whatever handle it learnt.

    Parameters
    ----------
    delivered : Delivered
        The delegation.

    Returns
    -------
    Attempt
        The attempt, carrying the session or task the worker answered with.
    """
    attempts = await delivered.store.attempts(delivered.execution.execution_id)
    return next(
        attempt
        for attempt in attempts
        if attempt.attempt_id == delivered.attempt.attempt_id
    )


async def _drain(
    delivered: Delivered, stream: Any, until: Stop | None
) -> list[Observation]:
    """
    Consume an observation stream into the store, and close it on the way out.

    Parameters
    ----------
    delivered : Delivered
        Where the observations are recorded.
    stream : AsyncIterator[Observation]
        What the adapter is reporting.
    until : Stop | None
        Stop once an observation satisfies this.

    Returns
    -------
    list[Observation]
        The observations that were seen.
    """
    seen: list[Observation] = []
    try:
        async for observation in stream:
            seen.append(observation)
            await delivered.store.record(
                delivered.execution.execution_id,
                observation,
                attempt_id=delivered.attempt.attempt_id,
            )
            if until is not None and until(observation):
                break
    finally:
        await stream.aclose()
    return seen


# ---------------------------------------------------------------------------
# What a scenario is allowed to ask of an adapter
# ---------------------------------------------------------------------------


def require_operation(
    capabilities: AdapterCapabilities, operation: WorkerOperation
) -> None:
    """
    Skip, in the adapter's own words, when it declared it cannot do this.

    Parameters
    ----------
    capabilities : AdapterCapabilities
        The report, declared or narrowed.
    operation : WorkerOperation
        What the scenario needs.
    """
    refusal = capabilities.refusal(operation)
    if refusal is not None:
        pytest.skip(
            f"The {capabilities.protocol.value} adapter declares "
            f"'{operation.value}' unsupported: {refusal.reason}."
        )


def require_acknowledgement(
    capabilities: AdapterCapabilities, kind: AcknowledgementKind
) -> None:
    """
    Skip when the adapter declared it can never reach this milestone.

    Section 6.3's milestones are the half of decision 5's reduction that is
    easiest to fake, so a scenario about one of them is skipped rather than
    quietly rewritten to assert something weaker. The reason is the
    adapter's: a reduction that is about a milestone names it in quotes.

    Parameters
    ----------
    capabilities : AdapterCapabilities
        The report, declared or narrowed.
    kind : AcknowledgementKind
        The milestone the scenario is about.
    """
    if kind in capabilities.acknowledgements:
        return
    named = [
        reduction
        for reduction in capabilities.reductions
        if f"'{kind.value}'" in reduction
    ]
    pytest.skip(
        f"The {capabilities.protocol.value} adapter declares it never reports "
        f"'{kind.value}': "
        + (named[0] if named else "; ".join(capabilities.reductions))
    )


def require_reattach(delivered: Delivered) -> None:
    """
    Skip when this worker declared it cannot be looked at again.

    Parameters
    ----------
    delivered : Delivered
        The delegation, whose worker carries the narrowed report.
    """
    refusal = delivered.binding.reattach_refusal(delivered.worker)
    if refusal is not None:
        pytest.skip(
            f"This {delivered.binding.protocol.value} worker cannot be "
            f"re-attached to: {refusal}."
        )


# ---------------------------------------------------------------------------
# The protocol stand-ins
# ---------------------------------------------------------------------------


class _A2ATask:
    """One A2A task, driven by a script and readable through ``tasks/get``.

    Parameters
    ----------
    script : WorkerScript
        What the worker does.
    """

    task_id = "task-1"

    def __init__(self, script: WorkerScript) -> None:
        """
        Start the task in the state an endpoint that has the message is in.

        Parameters
        ----------
        script : WorkerScript
            What the worker does.
        """
        self._script = script
        self.state = "submitted"
        self.sent: list[dict[str, Any]] = []

    async def run(self, emit: Callable[..., None]) -> str:
        """
        Replay the script as the phases the relay reports.

        Parameters
        ----------
        emit : Callable[..., None]
            Where phases are republished.

        Returns
        -------
        str
            The worker's answer.

        Raises
        ------
        RuntimeError
            As the relay does when a task ends rejected or failed.
        """
        self.state = "submitted"
        emit("status", taskId=self.task_id, state="submitted")
        if self._script.ending is Ending.REJECTED:
            # A refusal before acceptance never reaches 'working': the worker
            # declined the job rather than taking it and losing it.
            self.state = "rejected"
            emit("status", taskId=self.task_id, state="rejected")
            raise RuntimeError("The remote agent's task ended rejected: no capacity")
        self.state = "working"
        emit("status", taskId=self.task_id, state="working")
        for text in self._script.progress:
            emit("text", text=text)
            # A real A2A stream reports the same state many times. Scripting
            # it once would leave the adapter's decision not to re-report an
            # unchanged state untested, and that decision is the difference
            # between a clean execution and one littered with the invalid
            # transitions the harness's guard looks for.
            emit("status", taskId=self.task_id, state="working")
        if self._script.ending is Ending.WORKING:
            await asyncio.Event().wait()
        if self._script.ending is Ending.FAILED:
            self.state = "failed"
            emit("status", taskId=self.task_id, state="failed")
            raise RuntimeError("The remote agent's task ended failed: kernel died")
        self.state = "completed"
        emit("status", taskId=self.task_id, state="completed")
        return self._script.answer

    def snapshot(self) -> dict[str, Any]:
        """
        The task as ``tasks/get`` would answer with it.

        Returns
        -------
        dict[str, Any]
            Its current status.
        """
        return {"status": {"state": self.state}}


class _ACPChannel(ACPChannel):
    """One scripted ACP connection.

    A prompt replays the script through whoever is listening and then
    answers with the turn's stop reason, which is what a real agent does
    over one connection.

    Parameters
    ----------
    script : WorkerScript
        What the agent does.
    capabilities : AgentCapabilities
        What it declared at initialize.
    """

    #: What each ending is called on the ACP wire. An unknown stop reason is
    #: read by the adapter as an internal, retryable failure, which is what
    #: 'the worker took the job and then broke' has to look like here.
    STOP_REASONS: Mapping[Ending, str] = {
        Ending.COMPLETED: "end_turn",
        Ending.REJECTED: "refusal",
        Ending.FAILED: "internal_error",
    }

    def __init__(self, script: WorkerScript, capabilities: AgentCapabilities) -> None:
        """
        Hold the script and what the agent declares.

        Parameters
        ----------
        script : WorkerScript
            What the agent does.
        capabilities : AgentCapabilities
            What it declared at initialize.
        """
        self._script = script
        self._capabilities = capabilities
        self._handlers: list[Callable[[dict[str, Any]], None]] = []
        self.requests: list[tuple[str, Mapping[str, Any]]] = []
        self.notifications: list[tuple[str, Mapping[str, Any]]] = []
        self.headers: dict[str, str] = {}
        self.closed = False

    async def request(self, method, params):
        """
        Answer one request, replaying the script for a prompt or a load.

        Parameters
        ----------
        method : str
            The ACP method.
        params : Mapping[str, Any]
            Its parameters.

        Returns
        -------
        dict[str, Any] | None
            What the agent answers.
        """
        self.requests.append((method, dict(params)))
        if method == "session/new":
            return {"sessionId": "sess-1"}
        if method == "session/load":
            self._replay(self._updates())
            return {"sessionId": params.get("sessionId")}
        if method == "session/prompt":
            if self._script.ending is Ending.REJECTED:
                # No updates at all: the agent refused the turn rather than
                # starting it, which is what 'before acceptance' means here.
                return {"stopReason": self.STOP_REASONS[Ending.REJECTED]}
            self._replay(self._updates())
            if self._script.ending is Ending.WORKING:
                await asyncio.Event().wait()
            return {"stopReason": self.STOP_REASONS[self._script.ending]}
        return {}

    async def notify(self, method, params):
        """
        Record a notification.

        Parameters
        ----------
        method : str
            The ACP method.
        params : Mapping[str, Any]
            Its parameters.
        """
        self.notifications.append((method, dict(params)))

    async def respond(self, request_id, result=None):
        """
        Answer the agent; nothing in these scenarios asks anything of us.

        Parameters
        ----------
        request_id : str | int
            The agent's request id.
        result : Mapping[str, Any] | None
            The answer, or ``None`` for a refusal.
        """

    def listen(self, handler):
        """
        Register a listener.

        Parameters
        ----------
        handler : Callable[[dict[str, Any]], None]
            Called with each message.

        Returns
        -------
        Callable[[], None]
            Stop listening.
        """
        self._handlers.append(handler)

        def stop() -> None:
            """Remove the handler, once."""
            if handler in self._handlers:
                self._handlers.remove(handler)

        return stop

    async def close(self):
        """Close the connection."""
        self.closed = True

    @property
    def agent_capabilities(self):
        """
        What the agent declared.

        Returns
        -------
        AgentCapabilities
            Its capabilities.
        """
        return self._capabilities

    def _updates(self) -> list[dict[str, Any]]:
        """
        The turn's session updates: the commentary, then the answer.

        The commentary is thought rather than message content, so that the
        answer the execution registers as its artifact is the answer and not
        everything the agent said on the way there.

        Returns
        -------
        list[dict[str, Any]]
            The notifications the agent sends during the turn.
        """
        updates = [
            _session_update("agent_thought_chunk", text)
            for text in self._script.progress
        ]
        if self._script.ending is Ending.COMPLETED:
            updates.append(_session_update("agent_message_chunk", self._script.answer))
        return updates

    def _replay(self, updates: list[dict[str, Any]]) -> None:
        """
        Send the updates to everyone listening.

        Parameters
        ----------
        updates : list[dict[str, Any]]
            The notifications to send.
        """
        for message in updates:
            for handler in list(self._handlers):
                handler(dict(message))


def _session_update(kind: str, text: str) -> dict[str, Any]:
    """
    One ``session/update`` notification, as the ACP schema spells it.

    Parameters
    ----------
    kind : str
        The update kind.
    text : str
        What it carries.

    Returns
    -------
    dict[str, Any]
        The notification.
    """
    return {
        "method": "session/update",
        "params": {
            "sessionId": "sess-1",
            "update": {
                "sessionUpdate": kind,
                "content": {"type": "text", "text": text},
            },
        },
    }
