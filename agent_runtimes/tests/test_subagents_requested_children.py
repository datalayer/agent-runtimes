# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A worker's children are requested, not taken (ORCHESTRATOR.md, O2-06).

A run the control plane dispatched carries its execution. Its ``delegate_task``
asks the control plane for a subagent reached over A2A, as a child of that
execution, with the run's own token, and answers with what the child
produced; what the child does is republished as the phases a relayed
subagent's run produces. Resolving, launching or relaying to an agent itself
is refused. An in-process subagent stays in the run, and a run nobody
orchestrates delegates as it always did.
"""

from __future__ import annotations

import re
from typing import Any, AsyncIterator, Iterator

import pytest
from datalayer_core.mixins.orchestration import Collection, Receipt
from datalayer_core.orchestration import (
    Acknowledgement,
    AcknowledgementKind,
    AgentBinding,
    AgentProtocol,
    ErrorCode,
    ExecutionsCancel,
    ExecutionsCollect,
    ExecutionsDelegate,
    LifecycleEvent,
    OrchestrationError,
)
from pydantic_ai import Agent
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart, ToolReturnPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agent_runtimes.context import delegation
from agent_runtimes.context.identities import set_request_user_jwt
from agent_runtimes.orchestration import InMemoryExecutionStore
from agent_runtimes.orchestration import following as following_module
from agent_runtimes.orchestration.adapter import Observation, answer_artifact, now
from agent_runtimes.orchestration.budget import delegation_meta
from agent_runtimes.subagents import (
    A2ARemoteAgent,
    A2ARemoteTarget,
    SubagentDefinition,
    SubagentsCapability,
)
from agent_runtimes.subagents.a2a import (
    ChildNotRequested,
    child_slot,
    ensure_remote_agent,
    relay_a2a_task,
    request_child,
)
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution

PARENT = {"executionId": "exec_parent", "rootExecutionId": "exec_parent", "depth": 0, "accountUid": "org-1"}
RESEARCHER = A2ARemoteTarget(spec_id="example-a2a-researcher")
#: The binding ``delegate_task`` asks for that subagent with.
RESEARCHER_BINDING = AgentBinding(agent_id="example-a2a-researcher", capability="researcher", protocol=AgentProtocol.A2A)
#: The control plane's rule for a slot (O2-01).
SLOT = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,63}")


class FakePlane:
    """The control plane as the worker's client sees it: a child, and what it does."""

    def __init__(self) -> None:
        self.delegated: list[tuple[ExecutionsDelegate, str | None]] = []
        self.cancelled: list[ExecutionsCancel] = []
        self.tokens: list[str] = []
        self.events: list[Any] = []
        self.collection: Collection | None = None
        self.receipt: Receipt | None = None

    async def child(self, *, ending: LifecycleEvent = LifecycleEvent.COMPLETE) -> None:
        """The child's run, recorded as the durable worker records it."""
        store = InMemoryExecutionStore()
        child = await store.create(
            an_execution(execution_id="exec_child", parent_execution_id="exec_parent", root_execution_id="exec_parent")
        )
        attempt = await store.record_attempt(an_attempt(child, attempt_id="att_child_1"))
        await store.set_state(child.execution_id, LifecycleEvent.ASSIGN)
        self.receipt = Receipt(
            execution=await store.get(child.execution_id),
            acknowledgement=Acknowledgement(
                kind=AcknowledgementKind.RECEIVED, execution_id=child.execution_id, acknowledged_at=now()
            ),
            delivered=True,
        )
        for observation in (
            Observation.moved(LifecycleEvent.START, protocol_task_id="task-1"),
            Observation.progress("Found three facts", data={"phase": "text", "text": "Found three facts"}),
            Observation.produced(answer_artifact(child, attempt, "The facts."), data={"text": "The facts."}),
        ):
            await store.record(child.execution_id, observation, attempt_id=attempt.attempt_id)
        failure = (
            OrchestrationError(code=ErrorCode.WORKER_REJECTED, message="The worker refused it.", retryable=False)
            if ending is LifecycleEvent.FAIL
            else None
        )
        await store.record(
            child.execution_id, Observation.moved(ending, error=failure), attempt_id=attempt.attempt_id
        )
        self.events = await store.events(child.execution_id)
        self.collection = Collection(
            execution=await store.get(child.execution_id),
            artifacts=await store.artifacts(child.execution_id),
            children=[],
        )

    def delegate_execution(self, command: ExecutionsDelegate, *, account_uid: str | None = None) -> Receipt:
        self.delegated.append((command, account_uid))
        assert self.receipt is not None
        return self.receipt

    def subscribe_execution(self, execution_id: str, **options: Any) -> Iterator[tuple[Any, str]]:
        for event in self.events:
            yield event, str(event.sequence)

    def collect_execution(self, command: ExecutionsCollect, *, account_uid: str | None = None) -> Collection:
        assert self.collection is not None
        return self.collection

    def cancel_execution(self, command: ExecutionsCancel, *, account_uid: str | None = None) -> None:
        self.cancelled.append(command)


@pytest.fixture
def plane(monkeypatch: pytest.MonkeyPatch) -> FakePlane:
    fake = FakePlane()

    def client(token: str) -> FakePlane:
        fake.tokens.append(token)
        return fake

    monkeypatch.setattr(following_module, "orchestration_client", client)
    return fake


@pytest.fixture
def phases(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str, dict[str, Any]]]:
    said: list[tuple[str, str, dict[str, Any]]] = []

    def emit(self: Any, subagent_name: str, tool_call_id: Any, phase: str, **payload: Any) -> None:
        said.append((subagent_name, phase, payload))

    monkeypatch.setattr(SubagentsCapability, "_emit_subagent_event", emit)
    return said


def _orchestrated(token: str | None = "tok-exec") -> None:
    """What the A2A worker and the ACP route put on a run the control plane dispatched."""
    delegation.enter_execution({"datalayer": {"execution": dict(PARENT)}})
    set_request_user_jwt(token)


def _delegating(subagent: str, task: str) -> FunctionModel:
    """A parent that delegates once, then answers with what the delegation returned."""

    def model(messages: list[Any], info: AgentInfo) -> ModelResponse:
        returns = [part for message in messages for part in message.parts if isinstance(part, ToolReturnPart)]
        if returns:
            return ModelResponse(parts=[TextPart(content=str(returns[-1].content))])
        return ModelResponse(
            parts=[ToolCallPart(tool_name="delegate_task", args={"subagent_name": subagent, "task": task})]
        )

    return FunctionModel(model)


class TestTheRunKnowsItsExecution:
    def test_a_transport_puts_the_execution_its_delegation_names_on_the_run(self) -> None:
        delegation.enter_execution({"datalayer": {"execution": dict(PARENT)}})
        assert delegation.run_execution() == PARENT
        delegation.enter_execution({"datalayer": {"budget": {"outputTokens": 10}}})
        assert delegation.run_execution() is None

    def test_the_delegation_names_the_account_beside_the_execution(self) -> None:
        meta = delegation_meta(an_execution(), extended=True, account_uid="org-1")
        assert meta is not None and meta["datalayer"]["execution"]["accountUid"] == "org-1"
        plain = delegation_meta(an_execution(), extended=True)
        assert plain is not None and "accountUid" not in plain["datalayer"]["execution"]


class TestAnOrchestratedRunAsksForItsChildren:
    @pytest.mark.asyncio
    async def test_delegating_to_an_a2a_subagent_asks_the_control_plane(
        self, plane: FakePlane, phases: list[Any]
    ) -> None:
        await plane.child()
        _orchestrated()
        capability = SubagentsCapability(
            subagents=[SubagentDefinition(name="researcher", description="Facts", a2a=RESEARCHER)],
            include_general_purpose=False,
        )

        result = await Agent(_delegating("researcher", "Find the facts"), capabilities=[capability]).run("Research")

        assert result.output == "The facts."
        [(command, account_uid)] = plane.delegated
        assert (command.parent_execution_id, account_uid, plane.tokens) == ("exec_parent", "org-1", ["tok-exec"])
        assert command.slot == child_slot("researcher", "Find the facts")
        assert command.idempotency_key == f"exec_parent:{command.slot}"
        assert (command.agent.agent_id, command.agent.protocol.value, command.objective.goal) == (
            "example-a2a-researcher",
            "a2a",
            "Find the facts",
        )
        said = [(phase, payload.get("text") or payload.get("state")) for _, phase, payload in phases]
        assert ("text", "Found three facts") in said and ("status", "completed") in said
        assert said[-1][0] == "end"

    @pytest.mark.asyncio
    async def test_a_child_that_did_not_complete_fails_the_delegation_saying_how(
        self, plane: FakePlane, phases: list[Any]
    ) -> None:
        await plane.child(ending=LifecycleEvent.FAIL)
        _orchestrated()

        with pytest.raises(RuntimeError, match="ended failed: The worker refused it"):
            await request_child(PARENT, "researcher", RESEARCHER_BINDING, "Find the facts", emit=lambda *a, **k: None)

    @pytest.mark.asyncio
    async def test_a_child_over_acp_is_asked_for_as_one_over_a2a(self, plane: FakePlane) -> None:
        await plane.child()
        _orchestrated()
        reviewer = AgentBinding(
            agent_id="reviewer",
            capability="review",
            protocol=AgentProtocol.ACP,
            endpoint="ws://worker.test/api/v1/acp/ws/reviewer",
        )

        answer = await request_child(PARENT, "reviewer", reviewer, "Review the facts", emit=lambda *a, **k: None)

        assert answer == "The facts."
        [(command, account_uid)] = plane.delegated
        assert (command.agent, command.parent_execution_id, account_uid) == (reviewer, "exec_parent", "org-1")
        assert command.slot == child_slot("reviewer", "Review the facts")

    @pytest.mark.asyncio
    async def test_a_run_without_its_executions_token_cannot_ask(self, plane: FakePlane) -> None:
        _orchestrated(token=None)

        with pytest.raises(ChildNotRequested, match="holds no token"):
            await request_child(PARENT, "researcher", RESEARCHER_BINDING, "Find the facts", emit=lambda *a, **k: None)
        assert plane.delegated == []

    def test_the_same_task_to_the_same_subagent_is_the_same_child(self) -> None:
        first = child_slot("example a2a researcher!", "Find the facts")
        assert first == child_slot("example a2a researcher!", "Find the facts")
        assert first != child_slot("example a2a researcher!", "Find other facts")
        assert SLOT.fullmatch(first) and SLOT.fullmatch(child_slot("_" * 80, "x"))

    @pytest.mark.asyncio
    async def test_a_worker_that_reaches_or_launches_a_child_itself_is_refused(self) -> None:
        _orchestrated()

        with pytest.raises(ChildNotRequested, match="resolve or launch"):
            await ensure_remote_agent("researcher", "Facts", RESEARCHER)
        with pytest.raises(ChildNotRequested, match="delegate a task"):
            await relay_a2a_task(
                A2ARemoteAgent(name="researcher", url="http://agent.test", launch="remote"),
                "Find the facts",
                context_id="ctx",
                emit=lambda *a, **k: None,
            )

    @pytest.mark.asyncio
    async def test_an_in_process_subagent_stays_in_the_run(self, plane: FakePlane, phases: list[Any]) -> None:
        async def writer(messages: list[Any], info: AgentInfo) -> AsyncIterator[str]:
            yield "Written in the run."

        _orchestrated()
        capability = SubagentsCapability(
            subagents=[SubagentDefinition(name="writer", description="Writes", instructions="Write.")],
            default_model=FunctionModel(stream_function=writer),
            include_general_purpose=False,
        )

        result = await Agent(_delegating("writer", "Write it up"), capabilities=[capability]).run("Write")

        assert result.output == "Written in the run."
        assert plane.delegated == []


class TestARunNobodyOrchestrates:
    @pytest.mark.asyncio
    async def test_delegates_to_an_a2a_subagent_as_it_always_did(
        self, plane: FakePlane, phases: list[Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        async def relayed(self: Any, definition: Any, subagent_name: str, tool_call_id: Any, task: str) -> str:
            return f"Relayed: {task}"

        monkeypatch.setattr(SubagentsCapability, "_run_remote_streaming", relayed)
        delegation.enter_execution(None)
        capability = SubagentsCapability(
            subagents=[SubagentDefinition(name="researcher", description="Facts", a2a=RESEARCHER)],
            include_general_purpose=False,
        )

        result = await Agent(_delegating("researcher", "Find the facts"), capabilities=[capability]).run("Research")

        assert result.output == "Relayed: Find the facts"
        assert plane.delegated == []
