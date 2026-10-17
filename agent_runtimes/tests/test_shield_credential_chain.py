# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Authority across the chain (SH-33).

A run delegated with an execution's credential (``_meta.datalayer.credential``
over ACP, ``metadata.datalayer.credential`` over A2A, O1-17) lends
its harness the gateway's toolsets with *that* credential — before a
deployment's principal or the caller's token — so a sub-agent the harness
spawns, which reaches MCP through the servers its parent was lent, is held to
the execution's manifest at the gateway: a read-only manifest stops its write.
A later turn under another authority does not run on servers lent with the
first. The gateway here is a stand-in that decides by the bearer as the real
one decides by the credential's manifest; the r1 drill is done apart.
"""

from __future__ import annotations

import json
import socket
import sys
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from mcp.server.lowlevel import Server

from agent_runtimes.adapters.acp_agent import ACPAgent, LentToolset
from agent_runtimes.adapters.base import AgentContext
from agent_runtimes.context.delegation import DELEGATED_CREDENTIAL
from agent_runtimes.guardrails.shield_policy import policies_of
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes.acp import AgentInfo, register_agent, unregister_agent
from agent_runtimes.routes.acp import router as acp_router
from agent_runtimes.tests.test_acp_agent import FAKE, connecting, fake_harness, texts
from mcp import types

READ_ONLY = "tok-read-only"
RUNTIME = "tok-runtime"


class Gateway:
    """A stand-in for the gateway: ``read_note`` for any credential, ``write_note`` refused to a read-only one."""

    def __init__(self) -> None:
        self.seen: list[tuple[str, str]] = []

    def server(self) -> Server[Any]:
        async def list_tools(_ctx: Any, _params: Any) -> types.ListToolsResult:
            return types.ListToolsResult(
                tools=[
                    types.Tool(name=name, input_schema={"type": "object"})
                    for name in ("read_note", "write_note")
                ]
            )

        async def call_tool(
            ctx: Any, params: types.CallToolRequestParams
        ) -> types.CallToolResult:
            bearer = str(ctx.request.headers.get("authorization") or "")
            token = bearer.removeprefix("Bearer ")
            self.seen.append((params.name, token))
            if params.name == "write_note" and token == READ_ONLY:
                return types.CallToolResult(
                    content=[
                        types.TextContent(
                            type="text",
                            text="write_note: the execution's manifest reads this notebook, it does not write it.",
                        )
                    ],
                    is_error=True,
                )
            return types.CallToolResult(
                content=[types.TextContent(type="text", text=f"{params.name}: done")]
            )

        return Server(
            "gateway-stand-in", on_list_tools=list_tools, on_call_tool=call_tool
        )


def _free_port() -> int:
    with socket.socket() as one:
        one.bind(("127.0.0.1", 0))
        return int(one.getsockname()[1])


@pytest.fixture
def gateway() -> Iterator[tuple[Gateway, str]]:
    import uvicorn

    stand_in = Gateway()
    port = _free_port()
    app = stand_in.server().streamable_http_app(host="127.0.0.1")
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started:
        if time.monotonic() > deadline:
            raise RuntimeError("the gateway stand-in did not start")
        time.sleep(0.05)
    yield stand_in, f"http://127.0.0.1:{port}/mcp"
    server.should_exit = True
    thread.join(timeout=10)


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    root = tmp_path / "work"
    root.mkdir()
    return root


def harness(workspace: Path, url: str) -> ACPAgent:
    """The fake harness lent the stand-in's toolset, its own credential the runtime's (wider) one."""
    return ACPAgent(
        agent_id="fake",
        harness=fake_harness(),
        command=[sys.executable, str(FAKE)],
        workspace=workspace,
        lent=[LentToolset("notebooks", url)],
        policies=policies_of(connecting("notebooks"), ["notebooks"]),
        credential=RUNTIME,
        environment={"FAKE_AGENT_MCP_HTTP": "1"},
    )


SUBAGENT = "subagent: " + json.dumps(
    {
        "server": "notebooks",
        "calls": [["read_note", {}], ["write_note", {"text": "changed"}]],
    }
)


@pytest.mark.asyncio
async def test_a_subagents_write_is_held_to_the_delegated_read_only_credential(
    gateway: tuple[Gateway, str], workspace: Path
) -> None:
    stand_in, url = gateway
    agent = harness(workspace, url)
    try:
        delegated = AgentContext(
            session_id="s1",
            metadata={DELEGATED_CREDENTIAL: READ_ONLY, "user_token": READ_ONLY},
        )
        said = texts([event async for event in agent.stream(SUBAGENT, delegated)])
        # The same conversation, a turn of the runtime's own: not on servers lent
        # with the execution's credential — a new session, said, lent its own.
        own = AgentContext(session_id="s1", metadata={})
        said_after = texts([event async for event in agent.stream(SUBAGENT, own)])
    finally:
        await agent.cleanup()
    assert "subagent: read_note: allowed" in said
    assert "subagent: write_note: refused" in said
    assert "does not write it" in said
    assert "another authority" in said_after
    assert "subagent: write_note: allowed" in said_after
    # The sub-agent reached the gateway with the execution's credential only,
    # never the runtime's, while the turn was delegated.
    assert stand_in.seen[:2] == [("read_note", READ_ONLY), ("write_note", READ_ONLY)]
    assert stand_in.seen[2:] == [("read_note", RUNTIME), ("write_note", RUNTIME)]
    assert READ_ONLY not in repr(agent.audit.rows) and RUNTIME not in repr(
        agent.audit.rows
    )


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(
        state_store, "_store", SqliteProtocolStateStore(tmp_path / "state.sqlite")
    )
    app = FastAPI()
    app.include_router(acp_router, prefix="/api/v1")
    with TestClient(app) as test_client:
        yield test_client


def _answer(
    websocket: Any, identifier: int
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    updates: list[dict[str, Any]] = []
    while True:
        message = websocket.receive_json()
        if message.get("id") == identifier:
            return updates, message
        if message.get("method") == "session/update":
            updates.append(message["params"]["update"])


def test_the_credential_in_the_prompts_meta_scopes_the_harnesss_subagent(
    client: TestClient, gateway: tuple[Gateway, str], workspace: Path
) -> None:
    """Over the runtime's ACP route: the orchestrator's prompt carries the execution's credential."""
    stand_in, url = gateway
    agent = harness(workspace, url)
    register_agent(agent, AgentInfo(id="fake-chain", name="Fake"))
    try:
        with client.websocket_connect("/api/v1/acp/ws/fake-chain") as websocket:
            calls = 0

            def request(method: str, params: dict[str, Any]) -> Any:
                nonlocal calls
                calls += 1
                websocket.send_json(
                    {"jsonrpc": "2.0", "id": calls, "method": method, "params": params}
                )
                return _answer(websocket, calls)

            request("initialize", {"protocolVersion": 1})
            _, created = request("session/new", {"cwd": "/elsewhere", "mcpServers": []})
            session = created["result"]["sessionId"]
            updates, answered = request(
                "session/prompt",
                {
                    "sessionId": session,
                    "prompt": [{"type": "text", "text": SUBAGENT}],
                    "_meta": {"datalayer": {"credential": READ_ONLY}},
                },
            )
            request("shutdown", {})
    finally:
        unregister_agent("fake-chain")
        client.portal.call(agent.cleanup)
    assert answered["result"]["stopReason"] == "end_turn", answered
    said = "".join(
        u["content"]["text"]
        for u in updates
        if u.get("sessionUpdate") == "agent_message_chunk"
    )
    assert "subagent: write_note: refused" in said, said
    assert stand_in.seen == [("read_note", READ_ONLY), ("write_note", READ_ONLY)]


@pytest.mark.asyncio
async def test_the_credential_in_an_a2a_messages_metadata_scopes_the_harnesss_subagent(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    gateway: tuple[Gateway, str],
    workspace: Path,
) -> None:
    """Over A2A: the delegating message's ``metadata.datalayer.credential`` (O1-17)
    leaves the message before the task keeps it, is held for the run, and lends the
    harness's MCP — the sub-agent's write refused by the read-only credential, the
    credential nowhere in the task's history or the audit."""
    from agent_runtimes.tests.test_a2a_harness_worker import _run, _statuses

    store = SqliteProtocolStateStore(tmp_path / "a2a-state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    stand_in, url = gateway
    agent = harness(workspace, url)
    message = {
        "role": "user",
        "parts": [{"text": SUBAGENT}],
        "message_id": "m-chain",
        "context_id": "ctx-1",
        "metadata": {"datalayer": {"credential": READ_ONLY}},
    }
    task_id, events, storage = await _run(store, agent, message)
    said = " ".join(
        str(part.get("text") or "")
        for event in events
        for part in (
            (event.get("status_update", {}).get("status", {}).get("message") or {}).get(
                "parts"
            )
            or ()
        )
    ) + " ".join(
        str(part.get("text") or "")
        for event in events
        for part in event.get("artifact_update", {}).get("artifact", {}).get("parts")
        or ()
    )
    assert _statuses(events)[-1]["state"] == "completed", _statuses(events)[-1]
    assert "subagent: write_note: refused" in said, said
    assert stand_in.seen == [("read_note", READ_ONLY), ("write_note", READ_ONLY)]
    kept = await storage.load_task(task_id)
    assert READ_ONLY not in repr(kept)
    assert kept["history"][0]["metadata"]["datalayer"]["credential"] == "withheld"
    assert READ_ONLY not in repr(agent.audit.rows)
