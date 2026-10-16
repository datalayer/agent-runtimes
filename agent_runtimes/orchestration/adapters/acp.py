# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ACP binding, client side (O0-07).

Datalayer is the client here and the coding agent is the worker, which is
the opposite of the ACP route this repository already serves. The mapping is
the mapping table: create or attach is ``session/new`` or ``session/load``, a
delegation and a steer are ``session/prompt``, progress is session updates,
an approval is a permission request, and a cancel is ``session/cancel``.

An ACP session is a projection of an execution, never the other way round
(decision 6). Nothing here keeps a connection between operations: each
one connects, does its work and closes, so the adapter survives the step
boundaries of the durable worker it will run inside (O1-03). The session
identifier on the attempt is what makes that possible, and it is why every
observation that learns one carries it back.

A harness's file edits come back as artifacts (SH-45, the mapping on the client side):
every ``diff`` content of the turn's tool calls —
``{path, oldText, newText}`` — is registered once per file at the turn's end
as a ``text/x-diff`` artifact named by its path, the unified diff hashed in
its provenance, as the A2A worker publishes them; a file changed twice is
one diff from what it first held to what it last holds.

Two things this module is honest about rather than quiet about.

The first is what ACP does not have: no acceptance short of the first
session update, no checkpoint, no pause, no resume, no session close, and no
artifact — a turn's answer is registered as one artifact and file edits stay
tool-call content until O1-10 commits them. All of it is in
``ACP_CAPABILITIES`` and reaches the execution as the first observation of a
dispatch (decision 5's rule, applied to the other protocol).

An agent that declares the Datalayer orchestration extension at initialize,
under ``agentCapabilities._meta.datalayer.extensions``, gets three of them
back from the agent rather than invented here (O2-05): it is resolved with
``ACP_EXTENDED_CAPABILITIES``; a steer reaches its running turn as the
``_datalayer/steer`` notification; a pause is a ``session/cancel`` asking for
a checkpoint, and a turn that answers ``cancelled`` naming the checkpoint it
kept is read as a pause; and a resume is a new attempt whose prompt names it.

The second is what carries the connection. The ``ACPChannel`` port below is
the narrow surface this adapter needs — request, notify, respond, listen,
close — and its one implementation, ``ShieldChannel``, is built on the
``agent-shield`` package's client-side channels (SH-02): the
**stdio** channel, which launches a local agent as a subprocess (what 7.4
asked for), and the **WebSocket** channel, both over the official ``acp`` SDK
0.7. An endpoint ``stdio:<command line>`` launches; a ``ws://`` or ``wss://``
endpoint connects. The client this adapter was first built on
(``transports/clients/acp_client.py``, whose ``connect()`` did not work
against the installed SDK) is no longer under it; the ``loop connect -t acp``
command still uses that client and is its only caller.

The trace (O0-11) goes on the connection's headers, because a
WebSocket has no per-message header to stamp and the ``httpx`` instrumentation
that carries it for A2A never sees this socket. Since every operation opens
its own connection, each carries the context of whatever asked for it.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import shlex
from abc import ABC, abstractmethod
from collections import deque
from typing import Any, AsyncIterator, Awaitable, Callable, Mapping, Sequence

from acp import AGENT_METHODS, CLIENT_METHODS
from acp.exceptions import RequestError
from acp.schema import (
    AgentCapabilities,
    LoadSessionRequest,
    NewSessionRequest,
    RequestPermissionResponse,
)
from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    Attempt,
    ContextReference,
    ErrorCode,
    Execution,
    LifecycleEvent,
    OrchestrationError,
    WorkerOperation,
)

from agent_runtimes.adapters.acp_agent import RUNTIME_CLIENT_INFO
from agent_runtimes.context.delegation import (
    EXTENSION_URI,
    STEER_METHOD,
    pause_meta,
    paused_at,
    spent_of,
)
from agent_runtimes.mcp.tracing import with_trace
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
    objective_prompt,
    resume_in_a_new_attempt,
    resumed_without_the_extension,
)
from agent_runtimes.orchestration.budget import budget_refusal, delegation_meta
from agent_runtimes.subagents.a2a import caller_token
from agent_runtimes.transports.a2a import DIFF_MEDIA_TYPE, unified_diff

logger = logging.getLogger(__name__)

__all__ = [
    "ACP_CAPABILITIES",
    "ACP_EXTENDED_CAPABILITIES",
    "ACPChannel",
    "ACPWorkerAdapter",
    "ShieldChannel",
]

#: Who answers a permission request. It is given the request's parameters
#: and returns the option the person chose, or ``None`` to refuse. The
#: control plane owns approvals (O1-08); with nobody configured, this
#: adapter refuses and says so on the execution, because a request left
#: unanswered stops the worker and hides the reason.
ApprovalResponder = Callable[[Mapping[str, Any]], Awaitable[str | None]]

#: What an ACP turn's stop reason is evidence of, and what kind of failure
#: it is. A refusal is the worker declining the work — conformance scenario
#: 3 — and no other worker is implied to be at fault; a limit reached is the
#: worker's own budget, not the execution's, and both are worth telling
#: apart from a turn that simply ended.
ACP_STOP_REASONS: Mapping[str, tuple[LifecycleEvent, ErrorCode | None, bool]] = {
    "end_turn": (LifecycleEvent.COMPLETE, None, False),
    "cancelled": (LifecycleEvent.CANCEL, None, False),
    "refusal": (LifecycleEvent.FAIL, ErrorCode.WORKER_REJECTED, False),
    "max_tokens": (LifecycleEvent.FAIL, ErrorCode.BUDGET_EXHAUSTED, False),
    "max_turn_requests": (LifecycleEvent.FAIL, ErrorCode.BUDGET_EXHAUSTED, False),
}


def _refused(operation: WorkerOperation, reason: str) -> Unsupported:
    """
    One refusal, for the capability report below.

    Parameters
    ----------
    operation : WorkerOperation
        What cannot be done over ACP.
    reason : str
        Why not, in the words a person reading the execution needs.

    Returns
    -------
    Unsupported
        The refusal.
    """
    return Unsupported(operation=operation, protocol=AgentProtocol.ACP, reason=reason)


#: The reductions an agent speaking the orchestration extension does not have.
_NO_CHECKPOINTED = (
    "No 'checkpointed' acknowledgement: a session is the agent's own "
    "memory and the control plane cannot ask it to persist one."
)
_STEER_IS_A_TURN = (
    "A steer is a turn of its own: ACP cannot add instructions to a turn "
    "already running, so executions.steer becomes the session's next "
    "prompt and its updates reach the execution only while a dispatch or "
    "a subscribe is streaming that session (7.4)."
)

#: What ACP gives an execution, before a particular agent has been asked.
#: ``resolve`` narrows it further from what the agent declares in its
#: ``initialize`` response.
ACP_CAPABILITIES = AdapterCapabilities(
    protocol=AgentProtocol.ACP,
    supported=frozenset(
        {
            WorkerOperation.DELEGATE,
            WorkerOperation.STEER,
            WorkerOperation.CANCEL,
            WorkerOperation.SUBSCRIBE,
        }
    ),
    unsupported=(
        _refused(
            WorkerOperation.PAUSE,
            "ACP has no pause: a turn runs or it is cancelled",
        ),
        _refused(
            WorkerOperation.RESUME,
            "nothing can be resumed that could not be paused; the unstable "
            "session/resume reopens a session, which is what subscribe does",
        ),
        _refused(
            WorkerOperation.CHECKPOINT,
            "ACP has no worker-side checkpoint; a session is the agent's own "
            "memory and the control plane cannot ask it to persist one",
        ),
        _refused(
            WorkerOperation.COLLECT,
            "artifacts are read from the execution store, where they were "
            "registered as they arrived, not fetched from the worker",
        ),
        _refused(
            WorkerOperation.TERMINATE,
            "ACP has no session close or delete; agent-runtimes' own "
            "DELETE /sessions/{id} is a route of ours, not ACP, and session "
            "ownership moves behind the execution store in O1-11",
        ),
    ),
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
        "No 'accepted' acknowledgement: session/prompt answers only when the "
        "turn is over, so the first session update is the earliest evidence "
        "that a worker took the work, and it is reported as 'started' (6.3).",
        _NO_CHECKPOINTED,
        _STEER_IS_A_TURN,
        "No artifacts in ACP: the turn's answer is registered as one "
        "artifact, and each file a tool call's diff content changed as a "
        "text/x-diff artifact, both registered at the turn's end and "
        "committed by O1-10.",
        "A permission request is reported on the execution and, with no "
        "approval responder configured, refused rather than left hanging; "
        "answering it is the control plane's (O1-08).",
        "The trace reaches the agent as a traceparent header on the "
        "connection rather than on each turn, which is all a WebSocket "
        "leaves open; this adapter opens a connection per operation, so "
        "each one carries the context of whatever asked for it, and an "
        "agent that ignores the header is a broken link in the tree's "
        "trace rather than a second trace (O0-11).",
    ),
)

#: An agent that declares the Datalayer orchestration extension at
#: initialize (O2-05): steered within its turn, paused at a checkpoint it
#: reports, and resumed by an attempt that names that checkpoint.
ACP_EXTENDED_CAPABILITIES = ACP_CAPABILITIES.extended(
    without=(_NO_CHECKPOINTED, _STEER_IS_A_TURN),
    reductions=(
        "A pause keeps the conversation — what was asked and what the agent "
        "had said — and not the tool calls of the turn it stopped, so a "
        "resumed attempt may make them again (O2-05).",
        "A resume is a new session whose prompt names the checkpoint, and the "
        "agent restores the conversation before that prompt: session/load "
        "replays a session, it does not carry on a turn that was cancelled.",
        "A steer reaches the running turn as the _datalayer/steer "
        "notification, which is not answered: one sent when no turn is "
        "running reaches nobody, and nothing says so.",
    ),
)


class ACPChannel(ABC):
    """One ACP connection, as much of it as an orchestrator needs.

    Four verbs, because JSON-RPC has four things an ACP client does: ask and
    wait, tell and do not wait, answer what was asked of it, and listen. A
    transport is one implementation — WebSocket below, stdio when 7.4's
    local agents arrive — and the adapter above never learns which it has.
    """

    @abstractmethod
    async def request(
        self, method: str, params: Mapping[str, Any]
    ) -> dict[str, Any] | None:
        """
        Send a request and wait for its result.

        Parameters
        ----------
        method : str
            The ACP method.
        params : Mapping[str, Any]
            Its parameters, camel case as the wire is.

        Returns
        -------
        dict[str, Any] | None
            The result, or ``None`` when the agent answered with none.
        """

    @abstractmethod
    async def notify(self, method: str, params: Mapping[str, Any]) -> None:
        """
        Send a notification, which by definition is not answered.

        Parameters
        ----------
        method : str
            The ACP method.
        params : Mapping[str, Any]
            Its parameters.
        """

    @abstractmethod
    async def respond(
        self, request_id: str | int, result: Mapping[str, Any] | None = None
    ) -> None:
        """
        Answer a request the agent made of us.

        Parameters
        ----------
        request_id : str | int
            The id of the agent's request.
        result : Mapping[str, Any] | None
            The result, or ``None`` to refuse the method outright.
        """

    @abstractmethod
    def listen(self, handler: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        """
        Hear every notification and request the agent sends.

        Parameters
        ----------
        handler : Callable[[dict[str, Any]], None]
            Called with each raw message. It is called from the receive
            loop, so it must not block and must not await.

        Returns
        -------
        Callable[[], None]
            Stop listening.
        """

    @abstractmethod
    async def close(self) -> None:
        """Close the connection."""

    @property
    @abstractmethod
    def agent_capabilities(self) -> AgentCapabilities | None:
        """
        What the agent declared when the connection was initialized.

        Returns
        -------
        AgentCapabilities | None
            Its capabilities, or ``None`` when it declared none.
        """


class _Relay:
    """What the agent asks of its client, relayed to the adapter's loop.

    Notifications and requests reach the adapter as raw messages through
    ``listen``; a permission request waits here for the adapter's
    ``respond``; the client methods this adapter never declared (files,
    terminals) are refused as the SDK refuses an unknown method.
    """

    def __init__(self) -> None:
        """Hold the requests waiting for the adapter's answer."""
        self.pending_ids: deque[Any] = deque()
        self.answers: dict[Any, asyncio.Future[Mapping[str, Any] | None]] = {}

    def saw(self, message: Mapping[str, Any]) -> None:
        """Note a permission request's id as it arrives, before the SDK dispatches it."""
        if (
            message.get("method") == CLIENT_METHODS["session_request_permission"]
            and "id" in message
        ):
            self.pending_ids.append(message["id"])

    async def session_update(self, session_id: str, update: Any, **kwargs: Any) -> None:
        """Hear an update; the adapter reads it raw through ``listen``."""
        return None

    async def request_permission(
        self, options: list[Any], session_id: str, tool_call: Any, **kwargs: Any
    ) -> Any:
        """Wait for the adapter's ``respond`` to the request that just arrived."""
        if not self.pending_ids:
            raise RequestError.internal_error(
                {"details": "a permission request nobody saw arrive"}
            )
        request_id = self.pending_ids.popleft()
        future: asyncio.Future[Mapping[str, Any] | None] = (
            asyncio.get_running_loop().create_future()
        )
        self.answers[request_id] = future
        try:
            result = await future
        finally:
            self.answers.pop(request_id, None)
        if result is None:
            # -32601: the method is not one this client declared.
            raise RequestError.method_not_found(
                CLIENT_METHODS["session_request_permission"]
            )
        return RequestPermissionResponse.model_validate(dict(result))

    def respond(self, request_id: Any, result: Mapping[str, Any] | None) -> bool:
        """Answer a waiting request; ``False`` when none waits under this id."""
        future = self.answers.get(request_id)
        if future is None or future.done():
            return False
        future.set_result(result)
        return True

    async def _undeclared(self, *args: Any, **kwargs: Any) -> Any:
        """Refuse a client method this orchestrator never declared."""
        raise RequestError.method_not_found(
            "a client method this orchestrator does not offer"
        )

    read_text_file = write_text_file = create_terminal = _undeclared
    terminal_output = wait_for_terminal_exit = kill_terminal = release_terminal = (
        _undeclared
    )

    async def elicitation(self, session_id: str, params: dict[str, Any]) -> Any:
        """Refuse a question: an orchestrator has nobody to ask."""
        raise RequestError.method_not_found("elicitation/create")

    async def ext_method(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        """Refuse an extension method."""
        raise RequestError.method_not_found(f"_{method}")

    async def ext_notification(self, method: str, params: dict[str, Any]) -> None:
        """Hear an extension notification and do nothing with it."""
        return None


class ShieldChannel(ACPChannel):
    """The channel over ``agent_shield.acp``'s client-side channels: stdio or WebSocket.

    ``connect`` launches or connects and runs ``initialize`` (protocol
    version 1, no ``fs`` or ``terminal`` capability: an orchestrator answers
    neither), so ``agent_capabilities`` is known as soon as the channel is.
    """

    def __init__(self, inner: Any, relay: _Relay, launch: Any) -> None:
        """Wrap a connected channel, its relay and the context that launched it."""
        self._inner = inner
        self._relay = relay
        self._launch = launch

    @classmethod
    async def connect(
        cls,
        endpoint: str,
        headers: Mapping[str, str] | None = None,
        timeout: float = 60.0,
    ) -> "ShieldChannel":
        """
        Open and initialize one connection to an ACP agent.

        Parameters
        ----------
        endpoint : str
            ``stdio:<command line>`` to launch a local agent, or its
            ``ws://``/``wss://`` URL.
        headers : Mapping[str, str] | None
            Headers for a WebSocket connection, which is where the caller's
            token and the trace go; a stdio agent has no connection to
            stamp, and gets neither.
        timeout : float
            Unused: the SDK's requests have no timeout of their own; a turn
            is as long as the agent makes it, and ``cancel`` is how it ends.

        Returns
        -------
        ShieldChannel
            The connected, initialized channel.
        """
        from acp.schema import ClientCapabilities
        from agent_shield.acp import StdioACPChannel, WebSocketACPChannel

        relay = _Relay()
        if endpoint.startswith("stdio:"):
            argv = shlex.split(endpoint[len("stdio:") :])
            if not argv:
                raise ValueError(
                    "A stdio endpoint names the agent's command: stdio:<command line>."
                )
            launch = StdioACPChannel.launch(relay, argv[0], *argv[1:])
        elif endpoint.startswith(("ws://", "wss://")):
            launch = WebSocketACPChannel.connect(relay, endpoint, headers=headers)
        else:
            raise ValueError(
                f"An ACP endpoint is stdio:<command line>, ws:// or wss://; not {endpoint!r}."
            )
        inner = await launch.__aenter__()
        try:
            inner.listen(
                lambda message: (
                    relay.saw(message)
                    if message.get("direction") == "incoming"
                    else None
                )
            )
            await inner.initialize(
                client_capabilities=ClientCapabilities(),
                client_info=RUNTIME_CLIENT_INFO,
            )
        except BaseException:
            await launch.__aexit__(None, None, None)
            raise
        return cls(inner, relay, launch)

    async def request(
        self, method: str, params: Mapping[str, Any]
    ) -> dict[str, Any] | None:
        """Send a request and wait for its result."""
        result = await self._inner.request(method, params)
        return dict(result) if isinstance(result, Mapping) else None

    async def notify(self, method: str, params: Mapping[str, Any]) -> None:
        """Send a notification."""
        await self._inner.notify(method, params)

    async def respond(
        self, request_id: str | int, result: Mapping[str, Any] | None = None
    ) -> None:
        """
        Answer a permission request the agent made, or refuse it (``None``).

        A request this adapter never declared a method for (files,
        terminals) was already refused by the SDK's router when it arrived;
        answering it here is a no-op.
        """
        self._relay.respond(request_id, result)

    def listen(self, handler: Callable[[dict[str, Any]], None]) -> Callable[[], None]:
        """Hear every notification and request the agent sends, raw."""

        def incoming(message: dict[str, Any]) -> None:
            """Hand an incoming message to the handler, without the channel's direction mark."""
            if message.get("direction") != "incoming" or "method" not in message:
                return
            handler(
                {key: value for key, value in message.items() if key != "direction"}
            )

        return self._inner.listen(incoming)

    async def close(self) -> None:
        """End the connection and, for stdio, the agent's process."""
        if self._launch is None:
            return
        launch, self._launch = self._launch, None
        await launch.__aexit__(None, None, None)

    @property
    def agent_capabilities(self) -> AgentCapabilities | None:
        """What the agent declared at ``initialize``."""
        return self._inner.agent_capabilities


class ACPWorkerAdapter(WorkerAdapter):
    """One execution, delegated to an agent that speaks ACP.

    Parameters
    ----------
    connect : Callable[..., Awaitable[ACPChannel]]
        How a connection is opened. The default is ``ShieldChannel.connect``
        — stdio for a ``stdio:`` endpoint, WebSocket for a URL; a test
        passes a fake.
    approvals : ApprovalResponder | None
        Who answers a permission request. Nobody, by default, and then the
        request is reported and refused.
    timeout_seconds : float
        How long one request may take. A turn is a request.
    """

    def __init__(
        self,
        *,
        connect: Callable[..., Awaitable[ACPChannel]] | None = None,
        approvals: ApprovalResponder | None = None,
        timeout_seconds: float = 600.0,
        credential: str | None = None,
        account_uid: str | None = None,
        workspace: str | None = None,
    ) -> None:
        """
        Hold how to connect, who approves, how long a turn may take, and the execution's credential and account.

        Parameters
        ----------
        connect : Callable[..., Awaitable[ACPChannel]] | None
            How a connection is opened.
        approvals : ApprovalResponder | None
            Who answers a permission request.
        timeout_seconds : float
            How long one request may take.
        credential : str | None
            The execution's token for the run, handed to the agent with the
            prompt (O1-17).
        account_uid : str | None
            The account the execution belongs to, named to an agent that
            speaks the extension, which asks for its children in it (O2-06).
        workspace : str | None
            The directory a session works in, absolute as ACP requires its
            ``cwd`` to be: a Shield in front of the agent refuses a session
            outside the workspace it guards (SH-45). This process's
            directory by default; a runtime's ACP route answers in its own.
        """
        import os
        from pathlib import Path

        self._workspace = str(Path(workspace or os.getcwd()).resolve())
        self._connect = connect or ShieldChannel.connect
        self._approvals = approvals
        self._timeout_seconds = timeout_seconds
        self._credential = credential
        self._account_uid = account_uid

    def capabilities(self) -> AdapterCapabilities:
        """
        What ACP can do, before a particular agent has been asked.

        Returns
        -------
        AdapterCapabilities
            The report, narrowed per agent in ``resolve``.
        """
        return ACP_CAPABILITIES

    async def resolve(self, binding: AgentBinding) -> ResolvedWorker:
        """
        Open a connection, read what the agent declares, and close it again.

        Nothing is kept: what ``resolve`` returns is the endpoint and what
        the agent said about itself, both of which a later step can act on
        without a connection having been held open for it.

        Parameters
        ----------
        binding : AgentBinding
            Which agent, and where.

        Returns
        -------
        ResolvedWorker
            The agent, its effective capabilities and its endpoint.

        Raises
        ------
        ValueError
            When the binding is not an ACP binding, or names no endpoint.
        """
        if binding.protocol is not AgentProtocol.ACP:
            raise ValueError(
                f"The ACP adapter was given a '{binding.protocol.value}' binding."
            )
        if not binding.endpoint:
            raise ValueError(
                "An ACP binding needs an endpoint: this adapter is a client, "
                "and it does not launch agents (agents.create does)."
            )
        channel = await self._open(binding.endpoint)
        try:
            declared = channel.agent_capabilities
        finally:
            await channel.close()

        loads = bool(getattr(declared, "load_session", False))
        sessions = getattr(declared, "session_capabilities", None)
        forks = bool(getattr(sessions, "fork", None))
        extensions = _declared_extensions(declared)
        capabilities = (
            ACP_EXTENDED_CAPABILITIES
            if EXTENSION_URI in extensions
            else ACP_CAPABILITIES
        )
        if not loads:
            capabilities = capabilities.with_reduction(
                "This agent does not declare loadSession: an attempt that "
                "lost its connection cannot be re-attached, and subscribe "
                "says so rather than opening a second conversation and "
                "calling it the same one."
            )
        if not forks:
            capabilities = capabilities.with_reduction(
                "This agent does not declare session/fork: a contextual "
                "child execution gets its own session/new carrying the "
                "parent's manifest, which is O0-07's documented fallback."
            )
        return ResolvedWorker(
            binding=binding,
            capabilities=capabilities,
            endpoint=binding.endpoint,
            details={
                "loadSession": loads,
                "sessionFork": forks,
                "extensions": extensions,
                "agentCapabilities": declared.model_dump(by_alias=True)
                if declared is not None
                else None,
            },
        )

    async def dispatch(
        self, worker: ResolvedWorker, execution: Execution, attempt: Attempt
    ) -> AsyncIterator[Observation]:
        """
        Open or load a session, prompt it, and report the turn.

        The caller has already assigned the execution; choosing a worker is
        not something an adapter observes. What follows is: the agent
        answered with a session, the first update arrived — which is the
        earliest honest evidence a worker took the work — the turn produced
        text, tool calls and possibly a permission request, and it stopped
        for a reason.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker, from ``resolve``.
        execution : Execution
            The execution, with its objective and context manifest.
        attempt : Attempt
            This dispatch, whose ``session_id`` is loaded when it has one.

        Yields
        ------
        Observation
            What the worker did, as it did it.
        """
        # O0-11: one span for this dispatch, inside the tree's trace. It
        # stays current across the yields below, so the events the caller
        # records between observations land on it, and it is what the
        # connection's traceparent header is taken from.
        with attempt_span(execution, attempt, operation=WorkerOperation.DELEGATE):
            yield capability_report(worker.capabilities)
            refused = resumed_without_the_extension(worker, attempt)
            if refused is not None:
                yield Observation.moved(
                    LifecycleEvent.FAIL, message=refused.message, error=refused
                )
                return
            extended = EXTENSION_URI in worker.capabilities.extensions
            channel = await self._open(_endpoint(worker))
            answer: list[str] = []
            # Each file the turn's tool calls changed, by path (SH-45).
            diffs: dict[str, tuple[str | None, str]] = {}
            try:
                try:
                    session_id = await self._session(channel, worker, attempt)
                except _SessionRefused as refused:
                    yield Observation.failed(refused.error)
                    yield Observation.moved(
                        LifecycleEvent.FAIL,
                        message=refused.error.message,
                        error=refused.error,
                    )
                    return
                yield Observation.acknowledged(
                    AcknowledgementKind.RECEIVED,
                    message=f"The agent answered with session '{session_id}'.",
                    session_id=session_id,
                )

                queue: asyncio.Queue[Any] = asyncio.Queue()
                stop = channel.listen(queue.put_nowait)
                turn = asyncio.create_task(
                    self._prompt(
                        channel,
                        session_id,
                        objective_prompt(execution, attempt),
                        queue,
                        # The model budget the agent's turn is held to (O1-07),
                        # the execution's token it reaches Datalayer with
                        # (O1-17), and, to an agent speaking the extension, the
                        # execution and the checkpoint this attempt resumes
                        # from (O2-05).
                        meta=delegation_meta(
                            execution,
                            credential=self._credential,
                            extended=extended,
                            resumed_from=attempt.resumed_from,
                            account_uid=self._account_uid,
                        ),
                    )
                )
                started = False
                try:
                    while True:
                        message = await queue.get()
                        if message is _DONE:
                            break
                        _collect_diffs(message, session_id, diffs)
                        async for observation in self._translate(
                            channel,
                            session_id,
                            message,
                            answer,
                            started,
                            resumed=attempt.resumed_from is not None,
                        ):
                            started = started or (
                                observation.acknowledgement
                                is AcknowledgementKind.STARTED
                            )
                            yield observation
                finally:
                    stop()
                    if not turn.done():
                        turn.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await turn

                if turn.cancelled():
                    return
                failure = turn.exception()
                if failure is not None:
                    yield Observation.moved(
                        LifecycleEvent.FAIL,
                        message=str(failure),
                        error=OrchestrationError(
                            code=ErrorCode.WORKER_UNREACHABLE,
                            message=f"The ACP turn did not finish: {failure}",
                            retryable=True,
                            source="adapter:acp",
                        ),
                        session_id=session_id,
                    )
                    return
                for path, (old_text, new_text) in diffs.items():
                    text = unified_diff(path, old_text, new_text)
                    yield Observation.produced(
                        diff_artifact_of(execution, attempt, path, text),
                        data={"text": text, "path": path},
                    )
                for observation in self._ending(
                    turn.result(),
                    execution,
                    attempt,
                    session_id,
                    "".join(answer),
                    extended=extended,
                ):
                    yield observation
            finally:
                await channel.close()

    async def subscribe(
        self, worker: ResolvedWorker, execution: Execution, attempt: Attempt
    ) -> AsyncIterator[Observation]:
        """
        Load the session again and report what can be seen of it.

        What can be seen is less than a caller would like, and that is the
        point of saying it: ACP reports a turn's outcome on the prompt
        response, and the prompt response went to the connection that was
        lost. Loading the session replays the conversation, so the work done
        while we were away is visible as updates, but whether the turn ended
        and why is not. The execution stays where it is and the control
        plane reconciles — which is exactly the delivery rules' instruction to
        treat a lost lease as unknown rather than as a failure.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker, resolved again.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt, carrying the session to load.

        Yields
        ------
        Observation
            The replayed session, then what remains unknown.
        """
        # The re-attach is part of the same attempt, so it goes under the
        # same span: restoring the execution's traceparent is what rejoins
        # the tree's trace after the step that dispatched it has gone.
        with attempt_span(execution, attempt, operation=WorkerOperation.SUBSCRIBE):
            if not attempt.session_id:
                yield Observation.failed(
                    OrchestrationError(
                        code=ErrorCode.NOT_FOUND,
                        message=(
                            "This attempt has no ACP session, so there is nothing "
                            "to re-attach to; it never reached the agent."
                        ),
                        retryable=True,
                        source="adapter:acp",
                    )
                )
                return
            if not worker.details.get("loadSession"):
                yield Observation.failed(
                    _unsupported_error(
                        "this agent does not declare loadSession, so its session "
                        "cannot be re-attached to; opening a new one would be a "
                        "different conversation wearing the same execution's name"
                    )
                )
                return

            channel = await self._open(_endpoint(worker))
            replayed: list[Any] = []
            stop = channel.listen(replayed.append)
            try:
                await channel.request(
                    AGENT_METHODS["session_load"],
                    LoadSessionRequest(
                        session_id=attempt.session_id,
                        cwd=self._workspace,
                        mcp_servers=[],
                    ).model_dump(by_alias=True, exclude_none=True),
                )
            finally:
                stop()
                await channel.close()

            for message in replayed:
                if message.get("method") != CLIENT_METHODS["session_update"]:
                    continue
                kind, text = _read_update(message.get("params") or {})
                yield Observation.progress(
                    text or f"Replayed a '{kind}' update.",
                    data={"kind": kind, "replayed": True},
                    session_id=attempt.session_id,
                )
            yield Observation.progress(
                f"Re-attached to ACP session '{attempt.session_id}'. ACP reports a "
                "turn's outcome on its prompt response, which went to the "
                "connection that was lost, so whether the turn ended is unknown "
                "from here.",
                session_id=attempt.session_id,
            )

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
        Steer the running turn, or send the instructions as the session's next prompt.

        An agent speaking the orchestration extension is sent the
        ``_datalayer/steer`` notification, and its model reads the
        instructions before its next request, within the turn (O2-05).

        Plain ACP has no mid-turn steering (7.4 maps steering onto
        ``session/prompt`` because that is all there is), so for any other
        agent this is a turn: it returns when the agent has finished acting
        on the instruction, and the updates of that turn reach the execution
        only through a dispatch or a subscribe streaming the same session.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being steered.
        attempt : Attempt
            The attempt whose session takes the instruction.
        instructions : str
            What to add.
        references : Sequence[ContextReference]
            Context to add with it, named rather than resolved.

        Returns
        -------
        OperationOutcome
            What the agent did with the instruction, or why it could not be
            given one.
        """
        if not attempt.session_id:
            return Unsupported(
                operation=WorkerOperation.STEER,
                protocol=AgentProtocol.ACP,
                reason=(
                    "this attempt has no session yet, and a steer is a prompt "
                    "into a session"
                ),
            )
        lines = [instructions]
        if references:
            lines += ["", "Further context references:"]
            lines += [f"- {reference.uri}" for reference in references]
        if EXTENSION_URI in worker.capabilities.extensions:
            channel = await self._open(_endpoint(worker))
            try:
                await channel.notify(
                    STEER_METHOD,
                    {"sessionId": attempt.session_id, "instructions": "\n".join(lines)},
                )
            finally:
                await channel.close()
            return Performed(
                operation=WorkerOperation.STEER,
                detail=f"Steered the running turn of session '{attempt.session_id}'.",
            )
        channel = await self._open(_endpoint(worker))
        try:
            response = await channel.request(
                AGENT_METHODS["session_prompt"],
                _prompt_params(attempt.session_id, "\n".join(lines)),
            )
        finally:
            await channel.close()
        return Performed(
            operation=WorkerOperation.STEER,
            detail=f"The steering turn stopped: {_stop_reason(response)}.",
        )

    async def cancel(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        reason: str | None = None,
    ) -> OperationOutcome:
        """
        Send ``session/cancel``, which ACP defines as a notification.

        The cancellation shows up where ACP puts it: the running turn's
        prompt response comes back with ``stopReason`` ``cancelled``, which
        a dispatch still streaming that session reports as the cancellation.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being cancelled.
        attempt : Attempt
            The attempt whose turn is to stop.
        reason : str | None
            Why, for the record; ACP carries no reason on a cancellation.

        Returns
        -------
        OperationOutcome
            What was asked of the agent.
        """
        if not attempt.session_id:
            return Performed(
                operation=WorkerOperation.CANCEL,
                detail="There is no ACP session to cancel; nothing reached the agent.",
            )
        channel = await self._open(_endpoint(worker))
        try:
            await channel.notify(
                AGENT_METHODS["session_cancel"], {"sessionId": attempt.session_id}
            )
        finally:
            await channel.close()
        return Performed(
            operation=WorkerOperation.CANCEL,
            detail=f"Cancelled session '{attempt.session_id}'."
            + (f" Reason: {reason}" if reason else ""),
        )

    async def pause(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        reason: str | None = None,
    ) -> OperationOutcome:
        """
        Ask the running turn to pause: ``session/cancel`` asking for a checkpoint (O2-05).

        ``session/cancel`` is a notification, so this says only that the
        agent was asked. The pause arrives where a cancellation does: the
        running turn's prompt response is ``cancelled`` and names the
        checkpoint the agent kept, which ``_ending`` reads as the execution
        pausing.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being paused.
        attempt : Attempt
            The attempt whose turn is to pause.
        reason : str | None
            Why, for the record; ACP carries no reason on a cancellation.

        Returns
        -------
        OperationOutcome
            What was asked of the agent, or why it could not be.
        """
        refused = worker.capabilities.refusal(WorkerOperation.PAUSE)
        if refused is not None:
            return refused
        if not attempt.session_id:
            return Unsupported(
                operation=WorkerOperation.PAUSE,
                protocol=AgentProtocol.ACP,
                reason=(
                    "this attempt has no session yet, and a pause is asked of a "
                    "session's turn"
                ),
            )
        channel = await self._open(_endpoint(worker))
        try:
            await channel.notify(
                AGENT_METHODS["session_cancel"],
                {"sessionId": attempt.session_id, "_meta": pause_meta()},
            )
        finally:
            await channel.close()
        return Performed(
            operation=WorkerOperation.PAUSE,
            detail=f"Asked session '{attempt.session_id}' to pause its turn."
            + (f" Reason: {reason}" if reason else ""),
        )

    async def resume(
        self,
        worker: ResolvedWorker,
        execution: Execution,
        attempt: Attempt,
        *,
        checkpoint_id: str | None = None,
    ) -> OperationOutcome:
        """
        Say how the execution resumes: a new session whose prompt names the checkpoint.

        Nothing is sent here: the turn that paused was cancelled, and a
        cancelled turn is not carried on. The next attempt opens a session,
        and the agent restores the checkpoint's conversation before its
        prompt (O2-05).

        Parameters
        ----------
        worker : ResolvedWorker
            The worker.
        execution : Execution
            The execution being resumed.
        attempt : Attempt
            The attempt that paused.
        checkpoint_id : str | None
            The checkpoint to resume from.

        Returns
        -------
        OperationOutcome
            How it resumes, or why it cannot.
        """
        return resume_in_a_new_attempt(
            worker, checkpoint_id, next_attempt="a new ACP session"
        )

    async def fork_session(self, worker: ResolvedWorker, session_id: str) -> str | None:
        """
        Fork a session for a contextual child execution, where ACP can.

        ``session/fork`` is unstable in ACP and declared per agent, so it is
        probed rather than assumed (7.4). ``None`` means the fallback
        applies: the child gets its own ``session/new`` carrying the
        parent's manifest, which costs the child the parent's conversation
        and is recorded in the capability report as that cost.

        Parameters
        ----------
        worker : ResolvedWorker
            The worker, whose declared capabilities decide this.
        session_id : str
            The session to fork.

        Returns
        -------
        str | None
            The new session, or ``None`` when the agent cannot fork.
        """
        if not worker.details.get("sessionFork"):
            return None
        channel = await self._open(_endpoint(worker))
        try:
            response = await channel.request(
                AGENT_METHODS["session_fork"], {"sessionId": session_id}
            )
        finally:
            await channel.close()
        forked = (response or {}).get("sessionId") or (response or {}).get("session_id")
        return str(forked) if forked else None

    # -- Working parts. ------------------------------------------------------

    async def _open(self, endpoint: str) -> ACPChannel:
        """
        Connect, with the caller's own token and the tree's trace.

        The trace goes on the connection's headers because ACP is a
        WebSocket: there is no per-request header to stamp, and the
        ``httpx`` instrumentation that carries it for A2A never sees this
        socket. ``with_trace`` is the injector this repository already uses
        for outgoing calls, so there is one place that decides what a
        traceparent looks like on the wire (O0-11).

        Parameters
        ----------
        endpoint : str
            The agent's endpoint.

        Returns
        -------
        ACPChannel
            The connected channel.
        """
        token = caller_token()
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return await self._connect(endpoint, with_trace(headers), self._timeout_seconds)

    async def _session(
        self, channel: ACPChannel, worker: ResolvedWorker, attempt: Attempt
    ) -> str:
        """
        Load the attempt's session, or open one.

        Parameters
        ----------
        channel : ACPChannel
            The open connection.
        worker : ResolvedWorker
            The worker, whose declared capabilities decide whether a session
            can be loaded at all.
        attempt : Attempt
            The attempt, which may already have a session.

        Returns
        -------
        str
            The session this turn runs in.

        Raises
        ------
        _SessionRefused
            When the attempt names a session the agent cannot load. Opening
            a new one instead would be a different conversation under the
            same execution, which is the kind of quiet substitution the design
            is written to prevent.
        """
        if attempt.session_id:
            if not worker.details.get("loadSession"):
                raise _SessionRefused(
                    _unsupported_error(
                        f"this agent cannot load session "
                        f"'{attempt.session_id}', and a new session would be "
                        "a different conversation under the same execution"
                    )
                )
            await channel.request(
                AGENT_METHODS["session_load"],
                LoadSessionRequest(
                    session_id=attempt.session_id, cwd=self._workspace, mcp_servers=[]
                ).model_dump(by_alias=True, exclude_none=True),
            )
            return attempt.session_id
        response = await channel.request(
            AGENT_METHODS["session_new"],
            NewSessionRequest(cwd=self._workspace, mcp_servers=[]).model_dump(
                by_alias=True, exclude_none=True
            ),
        )
        session_id = (response or {}).get("sessionId") or (response or {}).get(
            "session_id"
        )
        if not session_id:
            raise _SessionRefused(
                OrchestrationError(
                    code=ErrorCode.WORKER_REJECTED,
                    message="The agent answered session/new without a session.",
                    retryable=True,
                    source="adapter:acp",
                )
            )
        return str(session_id)

    async def _prompt(
        self,
        channel: ACPChannel,
        session_id: str,
        prompt: str,
        queue: "asyncio.Queue[Any]",
        meta: Mapping[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """
        Run the turn, and end the stream whatever happens to it.

        ``meta`` goes in the prompt's ``_meta``: the model budget the turn is
        held to, when the execution sets one.

        Parameters
        ----------
        channel : ACPChannel
            The open connection.
        session_id : str
            The session to prompt.
        prompt : str
            The objective, as text.
        queue : asyncio.Queue[Any]
            Where updates arrive; the sentinel ends the dispatch loop.

        Returns
        -------
        dict[str, Any] | None
            The prompt response, which carries the stop reason.
        """
        try:
            return await channel.request(
                AGENT_METHODS["session_prompt"],
                _prompt_params(session_id, prompt, meta),
            )
        finally:
            queue.put_nowait(_DONE)

    async def _translate(
        self,
        channel: ACPChannel,
        session_id: str,
        message: Mapping[str, Any],
        answer: list[str],
        started: bool,
        *,
        resumed: bool = False,
    ) -> AsyncIterator[Observation]:
        """
        Turn one raw ACP message into observations, answering what must be.

        Parameters
        ----------
        channel : ACPChannel
            The connection, for answering a request.
        session_id : str
            The session this dispatch is about.
        message : Mapping[str, Any]
            The raw JSON-RPC message.
        answer : list[str]
            Where the turn's text is collected, to be registered at the end.
        started : bool
            Whether the started milestone has already been reported.
        resumed : bool
            Whether the attempt resumes from a checkpoint: its first update
            is then the paused execution resuming, not starting (O2-05).

        Yields
        ------
        Observation
            What the message amounts to.
        """
        method = message.get("method")
        params = message.get("params") or {}
        if method == CLIENT_METHODS["session_update"]:
            if _session_of(params) not in (None, session_id):
                return
            if not started:
                yield Observation.moved(
                    LifecycleEvent.RESUME if resumed else LifecycleEvent.START,
                    message="The agent sent its first session update"
                    + (", resuming from the checkpoint." if resumed else "."),
                    session_id=session_id,
                )
                yield Observation.acknowledged(
                    AcknowledgementKind.STARTED,
                    message="The agent is working on the turn.",
                    session_id=session_id,
                )
            kind, text = _read_update(params)
            if kind in _ANSWER_UPDATES and text:
                answer.append(text)
            yield Observation.progress(
                text or f"The agent sent a '{kind}' update.",
                data={"kind": kind},
                session_id=session_id,
            )
            return

        if method == CLIENT_METHODS["session_request_permission"]:
            async for observation in self._approve(channel, message, params):
                yield observation
            return

        if method is not None and "id" in message:
            # A client capability we never declared. Refusing it out loud
            # leaves the agent free to carry on or to fail; leaving it
            # unanswered would hang the turn with no reason recorded.
            await channel.respond(message["id"], None)
            yield Observation.failed(
                _unsupported_error(
                    f"the agent asked this client for '{method}', which "
                    "Datalayer does not offer it"
                )
            )

    async def _approve(
        self,
        channel: ACPChannel,
        message: Mapping[str, Any],
        params: Mapping[str, Any],
    ) -> AsyncIterator[Observation]:
        """
        Report a permission request, and answer it however it is answerable.

        Parameters
        ----------
        channel : ACPChannel
            The connection, for the answer.
        message : Mapping[str, Any]
            The raw request, whose id the answer needs.
        params : Mapping[str, Any]
            The request: the tool call, and the options offered.

        Yields
        ------
        Observation
            The approval, and the refusal when there is nobody to ask.
        """
        tool = params.get("toolCall") or params.get("tool_call") or {}
        name = tool.get("title") or tool.get("name") or "a tool call"
        yield Observation.approval_requested(
            f"The agent is asking permission for {name}.",
            data={"request": dict(params)},
        )
        option = await self._approvals(params) if self._approvals is not None else None
        request_id = message.get("id")
        if request_id is None:
            return
        if option is None:
            await channel.respond(request_id, {"outcome": {"outcome": "cancelled"}})
            if self._approvals is None:
                yield Observation.progress(
                    "Refused, because no approval responder is configured: "
                    "answering for a person is the control plane's (O1-08).",
                    data={"approved": False},
                )
            return
        await channel.respond(
            request_id, {"outcome": {"outcome": "selected", "optionId": option}}
        )
        yield Observation.progress(
            f"Approved with option '{option}'.", data={"approved": True}
        )

    def _ending(
        self,
        response: Mapping[str, Any] | None,
        execution: Execution,
        attempt: Attempt,
        session_id: str,
        answer: str,
        *,
        extended: bool = False,
    ) -> list[Observation]:
        """
        Read the turn's stop reason, and register what it produced.

        A turn of an agent speaking the orchestration extension that stopped
        ``cancelled`` and names the checkpoint it kept has paused (O2-05):
        the execution pauses, the milestone names the checkpoint, and what
        the turn said so far is in the checkpoint rather than an artifact,
        since the attempt that resumes from it registers the answer.

        Parameters
        ----------
        response : Mapping[str, Any] | None
            The prompt response.
        execution : Execution
            The execution.
        attempt : Attempt
            The attempt.
        session_id : str
            The session the turn ran in.
        answer : str
            The text the agent sent during the turn.
        extended : bool
            Whether the agent speaks the orchestration extension: only then is
            a cancelled turn that names a checkpoint a pause.

        Returns
        -------
        list[Observation]
            The artifact, the move, and the milestone when there is one. The
            move carries what the agent says the turn spent, when it says so
            in the response's ``_meta`` (O2-10).
        """
        reason = _stop_reason(response)
        spent = spent_of((response or {}).get("_meta"))
        checkpoint_id = (
            paused_at((response or {}).get("_meta"))
            if extended and reason == "cancelled"
            else None
        )
        if checkpoint_id is not None:
            return [
                Observation.moved(
                    LifecycleEvent.PAUSE,
                    message=f"Paused at checkpoint '{checkpoint_id}'.",
                    session_id=session_id,
                    usage=spent,
                ),
                Observation.acknowledged(
                    AcknowledgementKind.CHECKPOINTED,
                    message="The agent kept its conversation as it paused.",
                    session_id=session_id,
                    checkpoint_id=checkpoint_id,
                ),
            ]
        event, code, retryable = ACP_STOP_REASONS.get(
            reason, (LifecycleEvent.FAIL, ErrorCode.INTERNAL, True)
        )
        observations: list[Observation] = []
        if answer:
            observations.append(
                Observation.produced(
                    answer_artifact(execution, attempt, answer),
                    data={"text": answer},
                )
            )
        error = (
            OrchestrationError(
                code=code,
                message=f"The ACP turn stopped: {reason}.",
                retryable=retryable,
                source="adapter:acp",
            )
            if code is not None
            else None
        )
        if code is ErrorCode.BUDGET_EXHAUSTED:
            # Which limit: the delegation's budget when the agent says so in
            # `_meta`, the agent's own otherwise (O1-07).
            error = budget_refusal(
                (response or {}).get("_meta"), source="adapter:acp"
            ) or OrchestrationError(
                code=code,
                message=f"The ACP turn stopped: {reason}.",
                retryable=False,
                source="adapter:acp",
                details={
                    "budget": "model",
                    "limit": "requests" if reason == "max_turn_requests" else "tokens",
                    "delegated": False,
                },
            )
        observations.append(
            Observation.moved(
                event, message=reason, error=error, session_id=session_id, usage=spent
            )
        )
        if event is LifecycleEvent.COMPLETE:
            observations.append(
                Observation.acknowledged(
                    AcknowledgementKind.COMPLETED,
                    message="The turn ended and its answer is registered.",
                    session_id=session_id,
                )
            )
        return observations


class _SessionRefused(Exception):
    """A session that cannot be had, carrying the error to report for it."""

    def __init__(self, error: OrchestrationError) -> None:
        """
        Carry the canonical error.

        Parameters
        ----------
        error : OrchestrationError
            Why there is no session.
        """
        self.error = error
        super().__init__(error.message)


#: Ends the dispatch loop when the turn's request has answered.
_DONE = object()

#: The session updates whose text is the agent's answer, as against the ones
#: that are the agent thinking, planning or calling a tool.
_ANSWER_UPDATES = frozenset({"agent_message_chunk"})


def _unsupported_error(reason: str) -> OrchestrationError:
    """
    One ``unsupported_operation``, said the same way each time.

    Parameters
    ----------
    reason : str
        What could not be done.

    Returns
    -------
    OrchestrationError
        The canonical error.
    """
    return OrchestrationError(
        code=ErrorCode.UNSUPPORTED_OPERATION,
        message=reason,
        retryable=False,
        source="adapter:acp",
    )


def _declared_extensions(declared: AgentCapabilities | None) -> list[str]:
    """
    The extensions an ACP agent declares at initialize.

    Under ``agentCapabilities._meta.datalayer.extensions``, which is where
    the ACP schema leaves room for what is not in it.

    Parameters
    ----------
    declared : AgentCapabilities | None
        What the agent declared.

    Returns
    -------
    list[str]
        The extension URIs, in the order declared.
    """
    meta = getattr(declared, "field_meta", None)
    ours = meta.get("datalayer") if isinstance(meta, Mapping) else None
    extensions = ours.get("extensions") if isinstance(ours, Mapping) else None
    if not isinstance(extensions, list):
        return []
    return [extension for extension in extensions if isinstance(extension, str)]


def _endpoint(worker: ResolvedWorker) -> str:
    """
    The endpoint of a resolved ACP worker, or a refusal to guess.

    Parameters
    ----------
    worker : ResolvedWorker
        The worker as resolved.

    Returns
    -------
    str
        Where the agent answers.

    Raises
    ------
    ValueError
        When the worker was resolved without one.
    """
    if not worker.endpoint:
        raise ValueError("This worker has no ACP endpoint; resolve it again.")
    return worker.endpoint


def _prompt_params(
    session_id: str, text: str, meta: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    """
    The parameters of ``session/prompt``, spelled as the ACP schema spells them.

    Parameters
    ----------
    session_id : str
        The session to prompt.
    text : str
        What to say to it.
    meta : Mapping[str, Any] | None
        The schema's ``_meta``: what a delegation carries beside the
        objective, its model budget (O1-07).

    Returns
    -------
    dict[str, Any]
        The request parameters.
    """
    return {
        "sessionId": session_id,
        "prompt": [{"type": "text", "text": text}],
        **({"_meta": dict(meta)} if meta else {}),
    }


def _session_of(params: Mapping[str, Any]) -> str | None:
    """
    The session an update belongs to, however it was spelled.

    Parameters
    ----------
    params : Mapping[str, Any]
        The notification's parameters.

    Returns
    -------
    str | None
        The session id, when the update names one.
    """
    session = params.get("sessionId") or params.get("session_id")
    return str(session) if session else None


def _collect_diffs(
    message: Any, session_id: str, diffs: dict[str, tuple[str | None, str]]
) -> None:
    """
    Keep the ``diff`` contents of a session's tool calls, by path (SH-45).

    A file changed twice keeps what it first held and what it last holds.

    Parameters
    ----------
    message : Any
        A raw JSON-RPC message from the agent.
    session_id : str
        The session dispatched; another's updates are not this turn's.
    diffs : dict
        Where they are kept: path → (old text, new text).
    """
    if not isinstance(message, Mapping):
        return
    if message.get("method") != CLIENT_METHODS["session_update"]:
        return
    params = message.get("params") or {}
    if _session_of(params) not in (None, session_id):
        return
    update = params.get("update")
    if not isinstance(update, Mapping) or update.get("sessionUpdate") not in {
        "tool_call",
        "tool_call_update",
    }:
        return
    for block in update.get("content") or []:
        if not isinstance(block, Mapping) or block.get("type") != "diff":
            continue
        path = str(block.get("path") or "")
        if not path:
            continue
        old = block.get("oldText")
        first = diffs.get(path, (None if old is None else str(old), ""))[0]
        diffs[path] = (first, str(block.get("newText") or ""))


def diff_artifact_of(
    execution: Execution, attempt: Attempt, path: str, text: str
) -> Any:
    """
    One file a harness changed, registered as a ``text/x-diff`` artifact named by its path.

    Parameters
    ----------
    execution : Execution
        The execution.
    attempt : Attempt
        The attempt whose turn changed it.
    path : str
        The file, as the agent named it.
    text : str
        The unified diff.

    Returns
    -------
    Artifact
        Registered, its provenance carrying the diff's hash.
    """
    artifact = answer_artifact(execution, attempt, text, name=path)
    return artifact.model_copy(
        update={"media_type": DIFF_MEDIA_TYPE, "summary": f"Changed {path}"}
    )


def _read_update(params: Mapping[str, Any]) -> tuple[str, str]:
    """
    What kind of session update this is, and what text it carries.

    As the ACP schema spells it: the update nested under ``update``, its
    text in a content block. agent-runtimes' own route spoke a flattened
    dialect with a bare ``chunk`` until O1-11 made it speak the schema, so
    the one shape read here is the one every agent is held to.

    Parameters
    ----------
    params : Mapping[str, Any]
        The notification's parameters.

    Returns
    -------
    tuple[str, str]
        The update kind, and its text where it has any.
    """
    update = params.get("update")
    if not isinstance(update, Mapping):
        return "update", ""
    kind = str(update.get("sessionUpdate") or "update")
    content = update.get("content")
    text = str(content.get("text") or "") if isinstance(content, Mapping) else ""
    if not text and kind in {"tool_call", "tool_call_update"}:
        text = f"Calling '{update.get('title') or ''}'."
    return kind, text


def _stop_reason(response: Mapping[str, Any] | None) -> str:
    """
    Why the turn stopped, as the agent said it.

    Parameters
    ----------
    response : Mapping[str, Any] | None
        The prompt response.

    Returns
    -------
    str
        The stop reason, or ``unknown`` when the agent gave none.
    """
    if not response:
        return "unknown"
    return str(response.get("stopReason") or response.get("stop_reason") or "unknown")
