# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Our ACP route pauses a turn at a checkpoint, resumes from it, and is steered while it works (ORCHESTRATOR.md, O2-05).

The route as served, over a websocket, with an agent that says what it has,
waits at a gate, and then says what it was steered. Checkpoints and sessions
go to the protocol state store, here a SQLite file of the test's own.
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from datalayer_core.orchestration import Usage
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.adapters.base import AgentContext, BaseAgent, StreamEvent
from agent_runtimes.checkpoints.protocol_state import ProtocolStateCheckpointStore
from agent_runtimes.context import delegation
from agent_runtimes.context.delegation import (
    EXTENSION_URI,
    paused_at,
    spent_of,
    take_steers,
)
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes.acp import AgentInfo, register_agent
from agent_runtimes.routes.acp import router as acp_router

EXECUTION = {"executionId": "exec_acp", "rootExecutionId": "exec_acp"}
CONVERSATION = [
    {"role": "user", "content": "Profile the notebook"},
    {"role": "assistant", "content": "Reading the cells. "},
]


class GatedAgent(BaseAgent):
    """Says what it has, waits for the gate, then says what it was steered."""

    def __init__(self) -> None:
        self.gate = threading.Event()
        self.reached = threading.Event()
        self.histories: list[list[dict[str, Any]]] = []

    async def run(self, prompt: str, context: AgentContext) -> Any:  # pragma: no cover
        raise NotImplementedError

    async def stream(self, prompt: str, context: AgentContext) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        self.histories.append([dict(message) for message in context.conversation_history])
        yield StreamEvent(type="text", data="Reading the cells. ")
        self.reached.set()
        while not self.gate.is_set():
            await asyncio.sleep(0.01)
        steers = take_steers(context.metadata["steer_run"])
        yield StreamEvent(type="text", data=f"Steered: {' | '.join(steers)}")
        yield StreamEvent(type="done", data=None)

    def get_tools(self) -> list[Any]:
        return []

    @property
    def name(self) -> str:
        return "Gated agent"

    @property
    def description(self) -> str:
        return "Waits at a gate."

    @property
    def version(self) -> str:
        return "1.0.0"


class Wire:
    """One ACP connection: requests answered by id, notifications sent bare."""

    def __init__(self, websocket: Any) -> None:
        self.websocket = websocket
        self.counter = 0

    def send(self, method: str, params: dict[str, Any]) -> int:
        self.counter += 1
        self.websocket.send_json({"jsonrpc": "2.0", "id": self.counter, "method": method, "params": params})
        return self.counter

    def notify(self, method: str, params: dict[str, Any]) -> None:
        self.websocket.send_json({"jsonrpc": "2.0", "method": method, "params": params})

    def answer(self, identifier: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        updates: list[dict[str, Any]] = []
        while True:
            message = self.websocket.receive_json()
            if message.get("id") == identifier:
                return updates, message
            updates.append(message)

    def request(self, method: str, params: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return self.answer(self.send(method, params))


@pytest.fixture
def client(tmp_path: Any, monkeypatch: Any) -> Iterator[TestClient]:
    monkeypatch.setattr(state_store, "_store", SqliteProtocolStateStore(tmp_path / "state.sqlite"))
    app = FastAPI()
    app.include_router(acp_router, prefix="/api/v1")
    with TestClient(app) as test_client:
        yield test_client


@contextmanager
def session(client: TestClient, agent_id: str, agent: GatedAgent) -> Iterator[tuple[Wire, str, dict[str, Any]]]:
    """A connection with a session open on it, closed as a client closes it."""
    register_agent(agent, AgentInfo(id=agent_id, name=agent_id))
    with client.websocket_connect(f"/api/v1/acp/ws/{agent_id}") as websocket:
        wire = Wire(websocket)
        _, initialized = wire.request("initialize", {"protocolVersion": 1})
        _, created = wire.request("session/new", {"cwd": "/work", "mcpServers": []})
        yield wire, created["result"]["sessionId"], initialized["result"]
        agent.gate.set()


def _prompt(session_id: str, text: str, **datalayer: Any) -> dict[str, Any]:
    return {
        "sessionId": session_id,
        "prompt": [{"type": "text", "text": text}],
        "_meta": {"datalayer": {"execution": EXECUTION, **datalayer}},
    }


def test_the_agent_says_it_speaks_the_extension(client: TestClient) -> None:
    with session(client, "gated-card", GatedAgent()) as (_, _, initialized):
        assert EXTENSION_URI in initialized["agentCapabilities"]["_meta"]["datalayer"]["extensions"]


def test_a_paused_turn_keeps_its_conversation_and_answers_with_the_checkpoint(client: TestClient) -> None:
    agent = GatedAgent()
    with session(client, "gated-pause", agent) as (wire, session_id, _):
        prompted = wire.send("session/prompt", _prompt(session_id, "Profile the notebook"))
        assert agent.reached.wait(5)
        wire.notify("session/cancel", {"sessionId": session_id, "_meta": {"datalayer": {"pause": True}}})
        _, answered = wire.answer(prompted)
    assert answered["result"]["stopReason"] == "cancelled"
    checkpoint_id = paused_at(answered["result"]["_meta"])
    assert checkpoint_id
    checkpoint = asyncio.run(ProtocolStateCheckpointStore("exec_acp").get(checkpoint_id))
    assert checkpoint is not None and checkpoint.messages == CONVERSATION


def test_a_plain_cancel_does_not_pause(client: TestClient) -> None:
    agent = GatedAgent()
    with session(client, "gated-cancel", agent) as (wire, session_id, _):
        prompted = wire.send("session/prompt", _prompt(session_id, "Profile the notebook"))
        assert agent.reached.wait(5)
        wire.notify("session/cancel", {"sessionId": session_id})
        _, answered = wire.answer(prompted)
    assert answered["result"] == {"stopReason": "cancelled"}


class SpendingAgent(GatedAgent):
    """Answers at once, and says at the end of its run what the run spent."""

    async def stream(self, prompt: str, context: AgentContext) -> AsyncIterator[StreamEvent]:  # type: ignore[override]
        yield StreamEvent(type="text", data="Counted. ")
        yield StreamEvent(type="done", data={"usage": {"input_tokens": 21, "output_tokens": 8}})


def test_a_turn_answers_with_what_it_spent(client: TestClient) -> None:
    # O2-10: in the answer's `_meta`, which the ACP adapter records on the attempt.
    with session(client, "spending", SpendingAgent()) as (wire, session_id, _):
        _, answered = wire.request("session/prompt", _prompt(session_id, "Profile the notebook"))
    assert answered["result"]["stopReason"] == "end_turn"
    assert spent_of(answered["result"]["_meta"]) == Usage(input_tokens=21, output_tokens=8)


def test_a_steer_reaches_the_running_turn(client: TestClient) -> None:
    agent = GatedAgent()
    with session(client, "gated-steer", agent) as (wire, session_id, _):
        prompted = wire.send("session/prompt", _prompt(session_id, "Profile the notebook"))
        assert agent.reached.wait(5)
        wire.notify("_datalayer/steer", {"sessionId": session_id, "instructions": "Check the plots"})
        deadline = time.monotonic() + 5
        while not delegation._steers.get(session_id) and time.monotonic() < deadline:
            time.sleep(0.01)
        agent.gate.set()
        updates, answered = wire.answer(prompted)
    assert answered["result"]["stopReason"] == "end_turn"
    said = "".join(
        update["params"]["update"]["content"]["text"]
        for update in updates
        if update.get("method") == "session/update"
        and update["params"]["update"].get("sessionUpdate") == "agent_message_chunk"
    )
    assert "Steered: Check the plots" in said


def test_a_turn_naming_the_checkpoint_resumes_from_it(client: TestClient) -> None:
    kept = asyncio.run(ProtocolStateCheckpointStore("exec_acp").create_checkpoint("paused", turn=2, messages=CONVERSATION))
    agent = GatedAgent()
    agent.gate.set()
    with session(client, "gated-resume", agent) as (wire, session_id, _):
        _, answered = wire.request("session/prompt", _prompt(session_id, "Carry on", checkpoint={"checkpointId": kept.id}))
    assert answered["result"]["stopReason"] == "end_turn"
    # The conversation before the prompt; the prompt is the adapter's once, as such.
    assert agent.histories[-1] == CONVERSATION


def test_a_checkpoint_this_runtime_does_not_keep_is_refused(client: TestClient) -> None:
    agent = GatedAgent()
    agent.gate.set()
    with session(client, "gated-unknown", agent) as (wire, session_id, _):
        _, answered = wire.request(
            "session/prompt", _prompt(session_id, "Carry on", checkpoint={"checkpointId": "ckpt_nowhere"})
        )
    assert answered["error"]["code"] == -32602 and "ckpt_nowhere" in answered["error"]["message"]
    assert agent.histories == []
