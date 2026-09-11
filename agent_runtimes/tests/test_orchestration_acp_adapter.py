# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the ACP binding (PLAN_ORCHESTRATOR.md, sections 7.4, O0-07).

The same execution that ran through A2A runs through ACP with no
orchestration logic changed: a session is opened, a turn is prompted, its
updates become canonical events, its answer becomes an artifact and its stop
reason becomes the ending. What ACP cannot do — re-attach without
``loadSession``, fork without the capability, answer a permission request
with nobody to ask — is reported rather than papered over.

The tests run against a fake ``ACPChannel``. That is the point of the port:
a WebSocket, a stdio pipe and a script are the same three verbs to the
adapter above them.
"""

from __future__ import annotations

from typing import Any, Callable, Mapping

import pytest
from acp.schema import (
    AgentCapabilities,
    SessionCapabilities,
    SessionForkCapabilities,
)
from datalayer_core.orchestration import (
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    ErrorCode,
    ExecutionEventType,
    ExecutionState,
    LifecycleEvent,
    Trace,
    Usage,
    WorkerOperation,
)

from agent_runtimes.orchestration import InMemoryExecutionStore, ResolvedWorker
from agent_runtimes.orchestration.adapters.acp import (
    ACP_CAPABILITIES,
    ACPChannel,
    ACPWorkerAdapter,
)
from agent_runtimes.tests.orchestration_records import (
    TRACEPARENT,
    an_attempt,
    an_execution,
)

ENDPOINT = "ws://worker.test/api/v1/acp/ws/coder"

#: A turn as the ACP schema spells it: the update nested under ``update``.
SPEC_UPDATES = [
    {
        "method": "session/update",
        "params": {
            "sessionId": "sess-1",
            "update": {
                "sessionUpdate": "agent_message_chunk",
                "content": {"type": "text", "text": "The notebook runs clean."},
            },
        },
    }
]

#: The same turn in the dialect agent-runtimes' own ACP route spoke until
#: O1-11: flattened into the parameters, a bare string for the content block.
ROUTE_UPDATES = [
    {
        "method": "session/update",
        "params": {
            "sessionId": "sess-1",
            "sessionUpdate": "agent_message_chunk",
            "chunk": "The notebook runs clean.",
        },
    }
]

PERMISSION = {
    "id": "req-9",
    "method": "session/request_permission",
    "params": {
        "sessionId": "sess-1",
        "toolCall": {"title": "write pipeline.py"},
        "options": [{"optionId": "allow", "name": "Allow", "kind": "allow_once"}],
    },
}


class FakeChannel(ACPChannel):
    """One scripted ACP connection.

    A prompt replays the script through whoever is listening and then
    answers with the turn's stop reason, which is what a real agent does
    over one connection.
    """

    def __init__(
        self,
        *,
        script: list[Mapping[str, Any]] | None = None,
        stop_reason: str = "end_turn",
        capabilities: AgentCapabilities | None = None,
        meta: Mapping[str, Any] | None = None,
    ) -> None:
        """
        Hold the script and what the agent declares.

        Parameters
        ----------
        script : list[Mapping[str, Any]] | None
            The messages the agent sends during a turn.
        stop_reason : str
            Why the turn stops.
        capabilities : AgentCapabilities | None
            What the agent declared at initialize.
        meta : Mapping[str, Any] | None
            The ``_meta`` the turn's answer carries.
        """
        self.script = list(script or [])
        self.stop_reason = stop_reason
        self.meta = dict(meta) if meta else None
        self._capabilities = capabilities
        self.requests: list[tuple[str, Mapping[str, Any]]] = []
        self.notifications: list[tuple[str, Mapping[str, Any]]] = []
        self.responses: list[tuple[Any, Mapping[str, Any] | None]] = []
        self.headers: dict[str, str] = {}
        self.closed = False
        self._handlers: list[Callable[[dict[str, Any]], None]] = []

    async def request(self, method, params):
        """
        Answer one request, replaying the script for a prompt.

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
            for message in self.script:
                for handler in list(self._handlers):
                    handler(dict(message))
            return {"sessionId": params.get("sessionId")}
        if method == "session/fork":
            return {"sessionId": "sess-2"}
        if method == "session/prompt":
            for message in self.script:
                for handler in list(self._handlers):
                    handler(dict(message))
            return {"stopReason": self.stop_reason, **({"_meta": self.meta} if self.meta else {})}
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
        Record an answer to the agent.

        Parameters
        ----------
        request_id : str | int
            The agent's request id.
        result : Mapping[str, Any] | None
            The answer, or ``None`` for a refusal.
        """
        self.responses.append((request_id, dict(result) if result else None))

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
        return lambda: self._handlers.remove(handler)

    async def close(self):
        """Close the connection."""
        self.closed = True

    @property
    def agent_capabilities(self):
        """
        What the agent declared.

        Returns
        -------
        AgentCapabilities | None
            Its capabilities.
        """
        return self._capabilities


def _adapter(channel: FakeChannel, **kwargs: Any) -> ACPWorkerAdapter:
    """
    An adapter that connects to the given channel and nothing else.

    Parameters
    ----------
    channel : FakeChannel
        The channel every operation gets.
    **kwargs : Any
        Passed to the adapter.

    Returns
    -------
    ACPWorkerAdapter
        The adapter.
    """

    async def connect(endpoint, headers=None, timeout=None):
        """
        Answer with the scripted channel.

        Parameters
        ----------
        endpoint : str
            Ignored.
        headers : Mapping[str, str] | None
            What the adapter put on the connection, kept for assertions.
        timeout : float | None
            Ignored.

        Returns
        -------
        FakeChannel
            The channel.
        """
        channel.headers = dict(headers or {})
        return channel

    return ACPWorkerAdapter(connect=connect, **kwargs)


def _worker(*, loads: bool = True, forks: bool = False) -> ResolvedWorker:
    """
    A worker as ``resolve`` would have returned it.

    Parameters
    ----------
    loads : bool
        Whether the agent declares ``loadSession``.
    forks : bool
        Whether it declares ``session/fork``.

    Returns
    -------
    ResolvedWorker
        The worker.
    """
    return ResolvedWorker(
        binding=AgentBinding(
            agent_id="coder",
            capability="notebook.validate",
            protocol=AgentProtocol.ACP,
            endpoint=ENDPOINT,
        ),
        capabilities=ACP_CAPABILITIES,
        endpoint=ENDPOINT,
        details={"loadSession": loads, "sessionFork": forks},
    )


async def _dispatch(adapter: ACPWorkerAdapter, store: InMemoryExecutionStore, **kwargs):
    """
    Run one dispatch through the store, as a control plane would.

    Parameters
    ----------
    adapter : ACPWorkerAdapter
        The adapter under test.
    store : InMemoryExecutionStore
        Where the observations are recorded.
    **kwargs : Any
        Passed to the worker builder.

    Returns
    -------
    tuple
        The execution, its attempt and the observations seen.
    """
    execution = await store.create(
        an_execution(protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT)
    )
    attempt = await store.record_attempt(an_attempt(execution))
    execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)
    observations = []
    async for observation in adapter.dispatch(_worker(**kwargs), execution, attempt):
        observations.append(observation)
        await store.record(
            execution.execution_id, observation, attempt_id=attempt.attempt_id
        )
    return execution, attempt, observations


# ---------------------------------------------------------------------------
# A turn, from session to stop reason
# ---------------------------------------------------------------------------


class TestDelegation:
    @pytest.mark.asyncio
    async def test_a_turn_runs_an_execution_to_completion(self):
        channel = FakeChannel(script=SPEC_UPDATES)
        store = InMemoryExecutionStore()

        execution, attempt, _ = await _dispatch(_adapter(channel), store)

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
        assert channel.closed

    @pytest.mark.asyncio
    async def test_the_session_reaches_the_attempt_and_the_binding(self):
        """A session is a projection of the execution (19.8, decision 6).

        The identifier has to be on the attempt or the next step cannot
        load it, and O1-11 moves session ownership behind this store.
        """
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(
            _adapter(FakeChannel(script=SPEC_UPDATES)), store
        )

        (attempt,) = await store.attempts(execution.execution_id)
        assert attempt.session_id == "sess-1"
        assert (await store.get(execution.execution_id)).agent.session_id == "sess-1"

    @pytest.mark.asyncio
    async def test_the_answer_is_registered_as_an_artifact(self):
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(
            _adapter(FakeChannel(script=SPEC_UPDATES)), store
        )

        (artifact,) = await store.artifacts(execution.execution_id)
        assert artifact.summary == "The notebook runs clean."

    @pytest.mark.asyncio
    async def test_the_attempt_keeps_what_the_agent_says_the_turn_spent(self):
        # O2-10: in the answer's `_meta`, as agent-runtimes' ACP route sends it.
        spent = {"inputTokens": 21, "outputTokens": 8, "cost": None, "currency": "USD"}
        channel = FakeChannel(script=SPEC_UPDATES, meta={"datalayer": {"usage": spent}})
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(_adapter(channel), store)

        (attempt,) = await store.attempts(execution.execution_id)
        assert attempt.usage == Usage(input_tokens=21, output_tokens=8)

    @pytest.mark.asyncio
    async def test_an_update_outside_the_schema_carries_no_answer(self):
        """The flattened dialect with a bare ``chunk`` is not the schema's.

        agent-runtimes' own route spoke it until O1-11; now that the route
        speaks the schema, an update in that shape is read as nothing rather
        than guessed at.
        """
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(
            _adapter(FakeChannel(script=ROUTE_UPDATES)), store
        )

        assert [artifact.summary for artifact in await store.artifacts(execution.execution_id)] in ([], [""], [None])

    @pytest.mark.asyncio
    async def test_the_objective_is_prompted_as_the_schema_spells_it(self):
        channel = FakeChannel(script=SPEC_UPDATES)

        await _dispatch(_adapter(channel), InMemoryExecutionStore())

        methods = [method for method, _ in channel.requests]
        assert methods == ["session/new", "session/prompt"]
        (_, params) = channel.requests[1]
        assert params["sessionId"] == "sess-1"
        assert params["prompt"][0]["type"] == "text"
        assert "datalayer:notebook/nb-7@3" in params["prompt"][0]["text"]

    @pytest.mark.asyncio
    async def test_the_first_update_is_the_earliest_honest_acceptance(self):
        """ACP answers the prompt only when the turn is over (6.3).

        So the first session update is what tells the control plane a
        worker took the work, and it is reported as 'started'. 'accepted'
        never appears, and the capability report says why.
        """
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(
            _adapter(FakeChannel(script=SPEC_UPDATES)), store
        )

        report = next(
            (event.data or {})["adapterCapabilities"]
            for event in await store.events(execution.execution_id)
            if "adapterCapabilities" in (event.data or {})
        )
        assert report["protocol"] == "acp"
        assert "accepted" not in report["acknowledgements"]

    @pytest.mark.asyncio
    async def test_a_refusal_fails_the_execution_and_says_which_kind(self):
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(
            _adapter(FakeChannel(script=SPEC_UPDATES, stop_reason="refusal")), store
        )

        stored = await store.get(execution.execution_id)
        assert stored.status is ExecutionState.FAILED
        assert stored.error is not None
        assert stored.error.code is ErrorCode.WORKER_REJECTED

    @pytest.mark.asyncio
    async def test_a_cancelled_turn_is_a_cancellation_not_a_failure(self):
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(
            _adapter(FakeChannel(script=SPEC_UPDATES, stop_reason="cancelled")), store
        )

        assert (await store.get(execution.execution_id)).status is (
            ExecutionState.CANCELLED
        )


# ---------------------------------------------------------------------------
# Approvals
# ---------------------------------------------------------------------------


class TestApprovals:
    @pytest.mark.asyncio
    async def test_a_permission_request_is_reported_and_refused_when_nobody_can_answer(
        self,
    ):
        """Answering for a person is the control plane's (O1-08).

        Leaving the request unanswered would stop the worker with no reason
        recorded anywhere, which is the failure mode this refusal replaces.
        """
        channel = FakeChannel(script=[PERMISSION, *SPEC_UPDATES])
        store = InMemoryExecutionStore()

        execution, _, observations = await _dispatch(_adapter(channel), store)

        approvals = [
            observation
            for observation in observations
            if observation.type is ExecutionEventType.APPROVAL_REQUESTED
        ]
        assert len(approvals) == 1
        assert "write pipeline.py" in (approvals[0].message or "")
        assert channel.responses == [("req-9", {"outcome": {"outcome": "cancelled"}})]

    @pytest.mark.asyncio
    async def test_a_responder_answers_with_the_option_it_chose(self):
        async def approve(request):
            """
            Choose the first option offered.

            Parameters
            ----------
            request : Mapping[str, Any]
                The permission request.

            Returns
            -------
            str
                The option chosen.
            """
            return str(request["options"][0]["optionId"])

        channel = FakeChannel(script=[PERMISSION, *SPEC_UPDATES])

        await _dispatch(_adapter(channel, approvals=approve), InMemoryExecutionStore())

        assert channel.responses == [
            ("req-9", {"outcome": {"outcome": "selected", "optionId": "allow"}})
        ]

    @pytest.mark.asyncio
    async def test_a_client_capability_we_never_offered_is_refused_out_loud(self):
        channel = FakeChannel(
            script=[
                {"id": "req-3", "method": "fs/write_text_file", "params": {}},
                *SPEC_UPDATES,
            ]
        )
        store = InMemoryExecutionStore()

        execution, _, observations = await _dispatch(_adapter(channel), store)

        refusals = [
            observation
            for observation in observations
            if observation.type is ExecutionEventType.ERROR
        ]
        assert len(refusals) == 1
        assert refusals[0].error is not None
        assert refusals[0].error.code is ErrorCode.UNSUPPORTED_OPERATION
        assert channel.responses == [("req-3", None)]


# ---------------------------------------------------------------------------
# Attaching, steering, cancelling, forking
# ---------------------------------------------------------------------------


class TestOtherOperations:
    @pytest.mark.asyncio
    async def test_resolving_reads_what_the_agent_declares(self):
        channel = FakeChannel(
            capabilities=AgentCapabilities(
                load_session=True,
                session_capabilities=SessionCapabilities(
                    fork=SessionForkCapabilities()
                ),
            )
        )

        worker = await _adapter(channel).resolve(_worker().binding)

        assert worker.details["loadSession"] and worker.details["sessionFork"]
        assert worker.capabilities.reductions == ACP_CAPABILITIES.reductions
        # Nothing is held open: resolve closes what it opened.
        assert channel.closed

    @pytest.mark.asyncio
    async def test_an_agent_that_cannot_load_a_session_says_so_in_its_report(self):
        channel = FakeChannel(capabilities=AgentCapabilities())

        worker = await _adapter(channel).resolve(_worker().binding)

        assert not worker.details["loadSession"]
        assert any(
            "loadSession" in reduction for reduction in worker.capabilities.reductions
        )
        assert any(
            "session/fork" in reduction for reduction in worker.capabilities.reductions
        )

    @pytest.mark.asyncio
    async def test_an_attempt_with_a_session_is_loaded_not_restarted(self):
        channel = FakeChannel(script=SPEC_UPDATES)
        store = InMemoryExecutionStore()
        execution = await store.create(
            an_execution(
                protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT
            )
        )
        attempt = await store.record_attempt(an_attempt(execution, session_id="sess-1"))
        execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        async for _ in _adapter(channel).dispatch(_worker(), execution, attempt):
            pass

        assert [method for method, _ in channel.requests][0] == "session/load"

    @pytest.mark.asyncio
    async def test_a_session_that_cannot_be_loaded_fails_rather_than_starting_a_new_one(
        self,
    ):
        """A new session would be a different conversation.

        Silently opening one and calling it the same execution is exactly
        the substitution the plan's trust boundary is written against.
        """
        channel = FakeChannel(script=SPEC_UPDATES)
        store = InMemoryExecutionStore()
        execution = await store.create(
            an_execution(
                protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT
            )
        )
        attempt = await store.record_attempt(an_attempt(execution, session_id="sess-1"))
        execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        observations = []
        async for observation in _adapter(channel).dispatch(
            _worker(loads=False), execution, attempt
        ):
            observations.append(observation)
            await store.record(
                execution.execution_id, observation, attempt_id=attempt.attempt_id
            )

        assert channel.requests == []
        assert (await store.get(execution.execution_id)).status is ExecutionState.FAILED

    @pytest.mark.asyncio
    async def test_re_attaching_replays_the_session_and_admits_what_is_unknown(self):
        """Section 6.4: a lost lease is unknown, not failed.

        ACP puts a turn's outcome on the prompt response, and that response
        went to the connection that was lost, so subscribe reports the
        replay and says the outcome cannot be seen from here.
        """
        channel = FakeChannel(script=SPEC_UPDATES)
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        observations = [
            observation
            async for observation in _adapter(channel).subscribe(
                _worker(), execution, an_attempt(execution, session_id="sess-1")
            )
        ]

        assert [method for method, _ in channel.requests] == ["session/load"]
        assert "The notebook runs clean." in (observations[0].message or "")
        assert "unknown" in (observations[-1].message or "")
        assert all(
            observation.type is ExecutionEventType.PROGRESS
            for observation in observations
        )

    @pytest.mark.asyncio
    async def test_re_attaching_without_load_session_is_refused(self):
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        observations = [
            observation
            async for observation in _adapter(FakeChannel()).subscribe(
                _worker(loads=False),
                execution,
                an_attempt(execution, session_id="sess-1"),
            )
        ]

        (only,) = observations
        assert only.error is not None
        assert only.error.code is ErrorCode.UNSUPPORTED_OPERATION

    @pytest.mark.asyncio
    async def test_steering_is_the_sessions_next_prompt(self):
        channel = FakeChannel(script=SPEC_UPDATES)
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        outcome = await _adapter(channel).steer(
            _worker(),
            execution,
            an_attempt(execution, session_id="sess-1"),
            instructions="Check the statistical assumptions",
        )

        assert outcome.operation is WorkerOperation.STEER
        assert "end_turn" in (outcome.detail or "")
        (_, params) = channel.requests[0]
        assert "Check the statistical assumptions" in params["prompt"][0]["text"]

    @pytest.mark.asyncio
    async def test_steering_an_attempt_with_no_session_is_refused(self):
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        outcome = await _adapter(FakeChannel()).steer(
            _worker(), execution, an_attempt(execution), instructions="go left"
        )

        assert outcome.as_error().code is ErrorCode.UNSUPPORTED_OPERATION

    @pytest.mark.asyncio
    async def test_cancelling_is_a_notification_as_acp_defines_it(self):
        channel = FakeChannel()
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        outcome = await _adapter(channel).cancel(
            _worker(), execution, an_attempt(execution, session_id="sess-1")
        )

        assert channel.notifications == [("session/cancel", {"sessionId": "sess-1"})]
        assert outcome.operation is WorkerOperation.CANCEL

    @pytest.mark.asyncio
    async def test_pausing_is_refused_rather_than_answered(self):
        execution = an_execution(protocol=AgentProtocol.ACP, endpoint=ENDPOINT)

        outcome = await _adapter(FakeChannel()).pause(
            _worker(), execution, an_attempt(execution)
        )

        assert outcome.operation is WorkerOperation.PAUSE
        assert "no pause" in outcome.reason

    @pytest.mark.asyncio
    async def test_forking_is_probed_and_falls_back_by_saying_so(self):
        """``session/fork`` is unstable and declared per agent (7.4).

        Without it a child execution opens its own session with the
        parent's manifest, and the cost of that is in the capability report
        rather than discovered by a child with no context.
        """
        channel = FakeChannel()

        assert await _adapter(channel).fork_session(_worker(forks=False), "sess-1") is (
            None
        )
        assert channel.requests == []
        assert (
            await _adapter(channel).fork_session(_worker(forks=True), "sess-1")
            == "sess-2"
        )


# ---------------------------------------------------------------------------
# The trace, on the only place a WebSocket leaves for it
# ---------------------------------------------------------------------------


class TestTheTrace:
    @pytest.mark.asyncio
    async def test_the_connection_carries_the_delegation_trace_to_the_agent(self):
        """O0-11: restored on every worker.

        ACP has no per-message header, so the connection is where the trace
        goes, and nobody has to remember to put it there: the attempt span
        restores whatever the execution was delegated under. Without it the
        agent's own spans are a second trace nobody joins to the delegation
        that caused them.
        """
        channel = FakeChannel(script=SPEC_UPDATES)

        await _dispatch(_adapter(channel), InMemoryExecutionStore())

        assert TRACEPARENT.split("-")[1] in channel.headers["traceparent"]

    @pytest.mark.asyncio
    async def test_an_execution_with_no_trace_carries_no_header(self):
        """An invented traceparent is an orphan trace that looks real: it
        joins to nothing and sends whoever opens it looking for a parent
        that was never emitted."""
        channel = FakeChannel(script=SPEC_UPDATES)
        store = InMemoryExecutionStore()
        execution = await store.create(
            an_execution(
                protocol=AgentProtocol.ACP, agent_id="coder", endpoint=ENDPOINT
            ).model_copy(update={"trace": Trace()})
        )
        attempt = await store.record_attempt(an_attempt(execution))
        execution = await store.set_state(execution.execution_id, LifecycleEvent.ASSIGN)

        async for _ in _adapter(channel).dispatch(_worker(), execution, attempt):
            pass

        assert "traceparent" not in channel.headers
