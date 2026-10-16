# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""ACP in, ACP out (SH-17): the runtime's ACP server driving a harness.

An IDE connects to the runtime's ACP endpoint and gets the fake harness: its
``session/new`` opens the adapter's session in the runtime's workspace (the
IDE's cwd is not it, decision 6); prompts and updates are relayed as ACP
spells them (a tool call with its kind, its diff as content, a plan); a
permission reaches the IDE only after the Rules decided *ask me first*, with
the same options, and its answer goes back to the harness — a *do it* never
reaches it, a *leave it to me* is answered without it; ``fs/*`` and
``terminal/*`` are answered by the runtime and never sent to the IDE;
``session/load`` replays. The last test is the proof with a real ACP client:
agent-shield's WebSocket channel, on the SDK's ``Connection``, against the
route served by uvicorn.
"""

from __future__ import annotations

import asyncio
import socket
import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.adapters.acp_agent import ACPAgent
from agent_runtimes.guardrails.shield_policy import policies_of
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes.acp import AgentInfo, register_agent, unregister_agent
from agent_runtimes.routes.acp import router as acp_router
from agent_runtimes.tests.test_acp_agent import FAKE, fake_harness

Decider = Callable[[dict[str, Any]], dict[str, Any]]


def harness_agent(workspace: Path) -> ACPAgent:
    return ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=[sys.executable, str(FAKE)],
        workspace=workspace,
        policies=policies_of(None),
    )


class Wire:
    """One ACP connection as an IDE: requests answered by id, the route's own requests decided."""

    def __init__(self, websocket: Any, decide: Decider | None = None) -> None:
        self.websocket = websocket
        self.decide = decide
        self.counter = 0
        self.asked: list[dict[str, Any]] = []

    def send(self, method: str, params: dict[str, Any]) -> int:
        self.counter += 1
        self.websocket.send_json(
            {"jsonrpc": "2.0", "id": self.counter, "method": method, "params": params}
        )
        return self.counter

    def answer(self, identifier: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        updates: list[dict[str, Any]] = []
        while True:
            message = self.websocket.receive_json()
            if message.get("id") == identifier:
                return updates, message
            if message.get("method") == "session/request_permission":
                # The route asks the IDE: answered as the test decides.
                self.asked.append(message["params"])
                assert self.decide is not None, "a permission reached the IDE unasked"
                self.websocket.send_json(
                    {
                        "jsonrpc": "2.0",
                        "id": message["id"],
                        "result": self.decide(message["params"]),
                    }
                )
                continue
            assert message.get("method") == "session/update", message
            updates.append(message["params"]["update"])

    def request(
        self, method: str, params: dict[str, Any]
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        return self.answer(self.send(method, params))


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(
        state_store, "_store", SqliteProtocolStateStore(tmp_path / "state.sqlite")
    )
    app = FastAPI()
    app.include_router(acp_router, prefix="/api/v1")
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    root = tmp_path / "work"
    root.mkdir()
    (root / "README.md").write_text("# A readme\n", encoding="utf-8")
    return root


@contextmanager
def ide(
    client: TestClient, workspace: Path, decide: Decider | None = None
) -> Iterator[tuple[Wire, str]]:
    """An IDE connected, with a session open on the harness."""
    agent = harness_agent(workspace)
    register_agent(agent, AgentInfo(id="fake-ide", name="Fake"))
    try:
        with client.websocket_connect("/api/v1/acp/ws/fake-ide") as websocket:
            wire = Wire(websocket, decide)
            wire.request("initialize", {"protocolVersion": 1})
            _, created = wire.request(
                "session/new",
                {
                    "cwd": "/somewhere/else",
                    "mcpServers": [{"name": "theirs", "command": "x", "args": []}],
                },
            )
            yield wire, created["result"]["sessionId"]
            wire.request("shutdown", {})
    finally:
        unregister_agent("fake-ide")
        # The harness's process lives on the server's loop: ended there.
        client.portal.call(agent.cleanup)


def _prompt(session_id: str, text: str) -> dict[str, Any]:
    return {"sessionId": session_id, "prompt": [{"type": "text", "text": text}]}


def _texts(updates: list[dict[str, Any]]) -> str:
    return "".join(
        u["content"]["text"]
        for u in updates
        if u.get("sessionUpdate") == "agent_message_chunk"
    )


def allow(params: dict[str, Any]) -> dict[str, Any]:
    chosen = next(o["optionId"] for o in params["options"] if o["kind"] == "allow_once")
    return {"outcome": {"outcome": "selected", "optionId": chosen}}


def reject(params: dict[str, Any]) -> dict[str, Any]:
    chosen = next(
        o["optionId"] for o in params["options"] if o["kind"] == "reject_once"
    )
    return {"outcome": {"outcome": "selected", "optionId": chosen}}


def cancelled(params: dict[str, Any]) -> dict[str, Any]:
    return {"outcome": {"outcome": "cancelled"}}


def test_an_edit_is_relayed_as_acp_and_the_workspace_is_the_runtimes(
    client: TestClient, workspace: Path
) -> None:
    with ide(client, workspace) as (wire, session_id):
        updates, answer = wire.request("session/prompt", _prompt(session_id, "edit"))
    assert answer["result"]["stopReason"] == "end_turn"
    # No permission reached the IDE: an edit inside the workspace is *do it*.
    assert wire.asked == []
    kinds = [u["sessionUpdate"] for u in updates]
    assert "agent_thought_chunk" in kinds and "agent_message_chunk" in kinds
    said = [u for u in updates if u["sessionUpdate"] == "tool_call"]
    assert any(u["title"] == "Edit hello.txt" and u["kind"] == "edit" for u in said)
    assert any(u["title"].startswith("Write hello.txt — do it") for u in said)
    done = [u for u in updates if u["sessionUpdate"] == "tool_call_update"]
    diffs = [c for u in done for c in u.get("content") or [] if c["type"] == "diff"]
    assert diffs and diffs[-1]["path"] == "hello.txt"
    assert diffs[-1]["newText"] == "hello, shield\n"
    # Written in the runtime's workspace, not the IDE's cwd (decision 6), and
    # never asked of the IDE's filesystem.
    assert (workspace / "hello.txt").read_text() == "hello, shield\n"
    assert _texts(updates).endswith("done")


def test_ask_me_first_reaches_the_ide_with_the_same_options_and_its_answer_goes_back(
    client: TestClient, workspace: Path
) -> None:
    with ide(client, workspace, allow) as (wire, session_id):
        updates, answer = wire.request("session/prompt", _prompt(session_id, "push"))
        assert answer["result"]["stopReason"] == "end_turn"
        [asked] = wire.asked
        assert asked["sessionId"] == session_id
        assert asked["toolCall"]["title"] == "git push origin main"
        assert asked["toolCall"]["kind"] == "execute"
        assert asked["toolCall"]["rawInput"]["command"] == "git push origin main"
        assert [(o["optionId"], o["kind"]) for o in asked["options"]] == [
            ("allow", "allow_once"),
            ("reject", "reject_once"),
        ]
        assert "option_id='allow'" in _texts(updates)
        wire.decide = reject
        updates, _ = wire.request("session/prompt", _prompt(session_id, "push"))
        assert "option_id='reject'" in _texts(updates)
        wire.decide = cancelled
        updates, _ = wire.request("session/prompt", _prompt(session_id, "push"))
        assert "option_id='reject'" in _texts(updates)
    assert len(wire.asked) == 3


def test_leave_it_to_me_is_answered_without_the_ide(
    client: TestClient, workspace: Path
) -> None:
    with ide(client, workspace) as (wire, session_id):
        updates, answer = wire.request("session/prompt", _prompt(session_id, "fetch"))
    # A fetch with no allow-list is refused by decision 5's policy: the turn
    # ends with the sentence and ACP's `refusal`, and the IDE was not asked.
    assert wire.asked == []
    assert answer["result"]["stopReason"] == "refusal"
    assert "[Shield]" in _texts(updates) and "leave it to me" in _texts(updates)


def test_a_plan_and_a_read_are_relayed(client: TestClient, workspace: Path) -> None:
    with ide(client, workspace) as (wire, session_id):
        updates, _ = wire.request("session/prompt", _prompt(session_id, "plan read"))
    plans = [u for u in updates if u["sessionUpdate"] == "plan"]
    assert plans and plans[0]["entries"] == [
        {"content": "step one", "priority": "medium", "status": "in_progress"}
    ]
    reads = [u for u in updates if u.get("title") == "Read README.md"]
    assert reads[0]["sessionUpdate"] == "tool_call" and reads[0]["kind"] == "read"
    finished = [
        u
        for u in updates
        if u["sessionUpdate"] == "tool_call_update" and u["toolCallId"] == "c2"
    ]
    assert finished and finished[-1]["status"] == "completed"
    assert finished[-1]["content"][0]["content"]["text"].startswith("# A readme")


def test_session_load_replays_and_the_session_goes_on(
    client: TestClient, workspace: Path
) -> None:
    with ide(client, workspace) as (wire, session_id):
        wire.request("session/prompt", _prompt(session_id, "hello"))
        replayed, loaded = wire.request(
            "session/load", {"sessionId": session_id, "cwd": "/x"}
        )
        assert loaded["result"] == {}
        assert [u["sessionUpdate"] for u in replayed] == [
            "user_message_chunk",
            "agent_message_chunk",
        ]
        assert replayed[0]["content"]["text"] == "hello"
        updates, answer = wire.request(
            "session/prompt", _prompt(session_id, "hello again")
        )
        assert answer["result"]["stopReason"] == "end_turn"
        assert _texts(updates).endswith("done")


def test_a_response_nobody_asked_is_said(client: TestClient, workspace: Path) -> None:
    with ide(client, workspace) as (wire, _):
        wire.websocket.send_json({"jsonrpc": "2.0", "id": "perm_nobody", "result": {}})
        answer = wire.websocket.receive_json()
        assert (
            "No request of this route has the id 'perm_nobody'"
            in answer["error"]["message"]
        )


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class IdeClient:
    """An ACP client on the SDK: what the route asks of it, recorded; its filesystem never touched."""

    def __init__(self) -> None:
        self.updates: list[Any] = []
        self.asked: list[Any] = []
        self.touched: list[str] = []

    async def session_update(self, session_id: str, update: Any, **kwargs: Any) -> None:
        self.updates.append(update)

    async def request_permission(
        self, options: Any, session_id: str, tool_call: Any, **kwargs: Any
    ) -> Any:
        from acp.schema import AllowedOutcome, RequestPermissionResponse

        self.asked.append((tool_call, options))
        chosen = next(o.option_id for o in options if o.kind == "allow_once")
        return RequestPermissionResponse(
            outcome=AllowedOutcome(outcome="selected", option_id=chosen)
        )

    async def read_text_file(self, *args: Any, **kwargs: Any) -> Any:
        self.touched.append("fs/read_text_file")
        raise AssertionError("the IDE's filesystem was asked")

    async def write_text_file(self, *args: Any, **kwargs: Any) -> Any:
        self.touched.append("fs/write_text_file")
        raise AssertionError("the IDE's filesystem was asked")

    async def create_terminal(self, *args: Any, **kwargs: Any) -> Any:
        self.touched.append("terminal/create")
        raise AssertionError("the IDE's terminal was asked")

    async def ext_method(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        from acp.exceptions import RequestError

        raise RequestError.method_not_found(method)

    async def ext_notification(self, method: str, params: dict[str, Any]) -> None:
        return None


@pytest.mark.asyncio
async def test_a_real_acp_client_over_websocket_drives_the_harness(
    workspace: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The proof: agent-shield's WebSocket channel (the SDK's Connection) against the route served by uvicorn."""
    import uvicorn
    from acp import text_block
    from acp.schema import ClientCapabilities, FileSystemCapability, Implementation
    from agent_shield.acp.channel import WebSocketACPChannel

    monkeypatch.setattr(
        state_store, "_store", SqliteProtocolStateStore(tmp_path / "state.sqlite")
    )
    app = FastAPI()
    app.include_router(acp_router, prefix="/api/v1")
    agent = harness_agent(workspace)
    register_agent(agent, AgentInfo(id="fake-ws", name="Fake"))
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            app, host="127.0.0.1", port=port, log_level="warning", lifespan="off"
        )
    )
    serving = asyncio.create_task(server.serve())
    client = IdeClient()
    try:
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(0.05)
        assert server.started
        async with WebSocketACPChannel.connect(
            client, f"ws://127.0.0.1:{port}/api/v1/acp/ws/fake-ws"
        ) as channel:
            advertised = await channel.initialize(
                client_capabilities=ClientCapabilities(
                    fs=FileSystemCapability(read_text_file=True, write_text_file=True),
                    terminal=True,
                ),
                client_info=Implementation(name="ide", version="0"),
            )
            assert advertised.protocol_version == 1
            opened = await channel.new_session(str(tmp_path / "ide-side"), [])
            answer = await channel.prompt(
                opened.session_id, [text_block("edit then push")]
            )
            assert answer.stop_reason == "end_turn"
    finally:
        server.should_exit = True
        await asyncio.wait_for(serving, 10)
        unregister_agent("fake-ws")
        await agent.cleanup()
    # The IDE was asked once — the push, *ask me first* — with the agent's own
    # options; the edit was done without it, in the runtime's workspace.
    [(tool_call, options)] = client.asked
    assert tool_call.title == "git push origin main" and tool_call.kind == "execute"
    assert [o.kind for o in options] == ["allow_once", "reject_once"]
    assert client.touched == []
    assert (workspace / "hello.txt").read_text() == "hello, shield\n"
    kinds = [getattr(u, "session_update", None) for u in client.updates]
    assert "tool_call" in kinds and "tool_call_update" in kinds
    said = "".join(
        u.content.text
        for u in client.updates
        if getattr(u, "session_update", "") == "agent_message_chunk"
    )
    assert "option_id='allow'" in said and said.endswith("done")
