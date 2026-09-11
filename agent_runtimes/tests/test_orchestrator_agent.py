# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The orchestrator as one ACP agent (ORCHESTRATOR.md, 7.4, O2-08).

A turn is a root execution, delegated as the person connected to the agent
the orchestrator was registered with, and keyed on the session and the
prompt. The tree's state changes are the turn's thoughts, and what the root
produced is its answer. A turn that stops cancels its tree. The whole of it,
through a real control plane, an ACP client and a restart, is proved in
durable's `test_the_orchestrator_is_one_acp_agent.py`.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any, Iterator

import pytest
from datalayer_core.mixins.orchestration import Collection, Receipt
from datalayer_core.orchestration import (
    Acknowledgement,
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    ErrorCode,
    ExecutionsCancel,
    ExecutionsDelegate,
    LifecycleEvent,
    OrchestrationError,
)

from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.context.identities import set_request_user_jwt
from agent_runtimes.orchestration import InMemoryExecutionStore
from agent_runtimes.orchestration import following as following_module
from agent_runtimes.orchestration.adapter import Observation, answer_artifact, now
from agent_runtimes.orchestration.orchestrator import (
    OrchestratorAgent,
    root_binding,
    turn_key,
)
from agent_runtimes.specs.agents import AGENTSPECS
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution

PARENT = AgentBinding(
    agent_id="parent",
    capability="parent",
    protocol=AgentProtocol.A2A,
    endpoint="http://worker.test/api/v1/a2a/agents/parent",
)
SESSION = AgentContext(session_id="sess-1")
PROMPT = "Find the facts, and check them"


class FakePlane:
    """The control plane as the orchestrator's client sees it: a root, its tree's events, what it produced."""

    def __init__(self) -> None:
        self.delegated: list[ExecutionsDelegate] = []
        self.cancelled: list[ExecutionsCancel] = []
        self.tokens: list[str] = []
        self.events: list[Any] = []
        self.collection: Collection | None = None
        self.receipt: Receipt | None = None
        #: A tree still working: its subscription answers nothing until it is cancelled.
        self.working = False
        self._released = threading.Event()

    async def tree(self, *, ending: LifecycleEvent = LifecycleEvent.COMPLETE) -> None:
        """A root and the child under it, recorded as the durable worker records them."""
        store = InMemoryExecutionStore()
        root = await store.create(an_execution(execution_id="exec_root", agent_id="parent"))
        child = await store.create(
            an_execution(
                execution_id="exec_child",
                parent_execution_id="exec_root",
                root_execution_id="exec_root",
                agent_id="researcher",
            )
        )
        self.receipt = Receipt(
            execution=root,
            acknowledgement=Acknowledgement(
                kind=AcknowledgementKind.RECEIVED, execution_id=root.execution_id, acknowledged_at=now()
            ),
            delivered=True,
        )
        for one, text, end in ((child, "Three facts.", LifecycleEvent.COMPLETE), (root, "The facts hold.", ending)):
            attempt = await store.record_attempt(an_attempt(one, attempt_id=f"att_{one.execution_id}"))
            await store.set_state(one.execution_id, LifecycleEvent.ASSIGN)
            for observation in (
                Observation.moved(LifecycleEvent.START, protocol_task_id="task-1"),
                Observation.produced(answer_artifact(one, attempt, text), data={"text": text}),
            ):
                await store.record(one.execution_id, observation, attempt_id=attempt.attempt_id)
            failure = (
                OrchestrationError(code=ErrorCode.WORKER_REJECTED, message="The worker refused it.", retryable=False)
                if end is LifecycleEvent.FAIL
                else None
            )
            await store.record(one.execution_id, Observation.moved(end, error=failure), attempt_id=attempt.attempt_id)
        self.events = [*await store.events("exec_child"), *await store.events("exec_root")]
        self.collection = Collection(
            execution=await store.get("exec_root"),
            artifacts=await store.artifacts("exec_root"),
            children=[await store.get("exec_child")],
        )

    def delegate_execution(self, command: ExecutionsDelegate, *, account_uid: str | None = None) -> Receipt:
        self.delegated.append(command)
        assert self.receipt is not None
        return self.receipt

    def subscribe_execution(self, execution_id: str, **options: Any) -> Iterator[tuple[Any, str]]:
        if self.working:
            self._released.wait(timeout=5)
            return
        for event in self.events:
            yield event, str(event.sequence)

    def collect_execution(self, command: Any, *, account_uid: str | None = None) -> Collection:
        assert self.collection is not None
        return self.collection

    def cancel_execution(self, command: ExecutionsCancel, *, account_uid: str | None = None) -> None:
        self.cancelled.append(command)
        self._released.set()


@pytest.fixture
def plane(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakePlane]:
    fake = FakePlane()

    def client(token: str) -> FakePlane:
        fake.tokens.append(token)
        return fake

    monkeypatch.setattr(following_module, "orchestration_client", client)
    set_request_user_jwt("tok-person")
    yield fake
    set_request_user_jwt(None)


async def _said(agent: OrchestratorAgent) -> list[tuple[str, Any]]:
    return [(event.type, event.data) async for event in agent.stream(PROMPT, SESSION)]


class TestTheAgentItDelegatesTo:
    def test_an_http_endpoint_is_an_a2a_agent_and_a_ws_one_an_acp_agent(self) -> None:
        a2a = root_binding("http://worker.test/api/v1/a2a/agents/parent/")
        acp = root_binding("wss://worker.test/api/v1/acp/ws/reviewer")
        assert (a2a.agent_id, a2a.protocol, a2a.endpoint) == (
            "parent",
            AgentProtocol.A2A,
            "http://worker.test/api/v1/a2a/agents/parent/",
        )
        assert (acp.agent_id, acp.protocol) == ("reviewer", AgentProtocol.ACP)

    def test_an_agentspec_is_brought_up_and_reached_over_a2a(self) -> None:
        spec = next(iter(AGENTSPECS))
        binding = root_binding(spec)
        assert (binding.agent_id, binding.protocol, binding.endpoint) == (spec, AgentProtocol.A2A, None)

    def test_a_name_that_is_neither_is_refused(self) -> None:
        with pytest.raises(ValueError, match="neither an endpoint nor an agentspec"):
            root_binding("no-such-agent")

    def test_a_turn_asked_again_is_the_same_root(self) -> None:
        assert turn_key("sess-1", PROMPT) == turn_key("sess-1", PROMPT)
        assert turn_key("sess-1", PROMPT) != turn_key("sess-2", PROMPT)
        assert turn_key("sess-1", PROMPT) != turn_key("sess-1", "Another question")


class TestATurnIsARootExecution:
    @pytest.mark.asyncio
    async def test_it_delegates_as_the_person_and_answers_with_what_the_root_produced(self, plane: FakePlane) -> None:
        await plane.tree()

        said = await _said(OrchestratorAgent(PARENT))

        [command] = plane.delegated
        assert (command.agent, command.objective.goal, command.parent_execution_id) == (PARENT, PROMPT, None)
        assert command.idempotency_key == turn_key("sess-1", PROMPT) and plane.tokens == ["tok-person"]
        thoughts = [data for kind, data in said if kind == "thought"]
        assert "researcher: completed" in thoughts and "parent: completed" in thoughts
        assert said[-2:] == [("text", "The facts hold."), ("done", {})]

    @pytest.mark.asyncio
    async def test_a_root_that_did_not_complete_is_the_turns_error(self, plane: FakePlane) -> None:
        await plane.tree(ending=LifecycleEvent.FAIL)

        said = await _said(OrchestratorAgent(PARENT))

        assert said[-1] == ("error", "Execution 'exec_root' ended failed: The worker refused it.")

    @pytest.mark.asyncio
    async def test_a_connection_naming_nobody_delegates_nothing(self, plane: FakePlane) -> None:
        set_request_user_jwt(None)

        said = await _said(OrchestratorAgent(PARENT))

        assert said[0][0] == "error" and plane.delegated == []

    @pytest.mark.asyncio
    async def test_a_turn_that_stops_cancels_its_tree(self, plane: FakePlane) -> None:
        await plane.tree()
        plane.working = True
        turn = OrchestratorAgent(PARENT).stream(PROMPT, SESSION)

        waiting = asyncio.ensure_future(turn.__anext__())
        await asyncio.sleep(0.1)
        waiting.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiting

        [cancel] = plane.cancelled
        assert (cancel.execution_id, cancel.idempotency_key) == ("exec_root", f"{turn_key('sess-1', PROMPT)}:cancel")
