# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A notebook's panel as the ACP client of a shielded harness (SH-49).

A browser opens a websocket with no header of its own, so the panel says who
it is in a message — ``authenticate`` with methodId ``bearer`` and the
person's token in ``_meta.token``, as agent-shield's ``serve`` takes it,
never in the address — and that token is the turn's, as the
``Authorization`` header's would be. ``session/new`` tells the panel the
runtime's workspace, which is where the harness's paths are (not the cwd the
panel sent). Then the harness's edit comes back as a ``diff`` the panel draws,
the push it asks for reaches the panel after the Rules said *ask me first*,
answered by an option id, and the Shield's audit holds both decisions.
"""

from __future__ import annotations

import base64
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes import acp as acp_route
from agent_runtimes.routes.acp import AgentInfo, register_agent, unregister_agent
from agent_runtimes.routes.acp import router as acp_router
from agent_runtimes.tests.test_acp_route_harness import Wire, _prompt, harness_agent


def _segment(data: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")


#: A JWT's shape with no secret in it: the route reads it as the identity.
TOKEN = f"{_segment({'alg': 'none'})}.{_segment({'sub': 'a-person'})}.signature"


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


def allow(params: dict[str, Any]) -> dict[str, Any]:
    chosen = next(o["optionId"] for o in params["options"] if o["kind"] == "allow_once")
    return {"outcome": {"outcome": "selected", "optionId": chosen}}


def test_a_notebook_panel_authenticates_in_a_message_and_sees_the_diff_and_the_permission(
    client: TestClient, workspace: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    turned: list[str | None] = []
    monkeypatch.setattr(acp_route, "set_request_user_jwt", turned.append)
    # The turn's record, kept here: nothing exported to an OTEL endpoint.
    counted: list[dict[str, Any]] = []
    monkeypatch.setattr(
        acp_route, "record_prompt_turn_completion", lambda **kw: counted.append(kw)
    )
    agent = harness_agent(workspace)
    register_agent(agent, AgentInfo(id="fake-notebook", name="Fake"))
    try:
        # No Authorization header: a browser cannot set one on a websocket.
        with client.websocket_connect("/api/v1/acp/ws/fake-notebook") as websocket:
            wire = Wire(websocket, allow)
            _, initialized = wire.request("initialize", {"protocolVersion": 1})
            assert [m["id"] for m in initialized["result"]["authMethods"]] == ["bearer"]
            _, authenticated = wire.request(
                "authenticate", {"methodId": "bearer", "_meta": {"token": TOKEN}}
            )
            assert authenticated["result"] == {}
            _, created = wire.request(
                "session/new", {"cwd": "/home/jovyan/notebooks", "mcpServers": []}
            )
            # The workspace the harness's paths are in, said to the panel.
            assert created["result"]["_meta"] == {
                "datalayer": {"workspace": str(workspace)}
            }
            session_id = created["result"]["sessionId"]
            updates, answer = wire.request(
                "session/prompt", _prompt(session_id, "edit then push")
            )
            wire.request("shutdown", {})
    finally:
        unregister_agent("fake-notebook")
        client.portal.call(agent.cleanup)
    assert answer["result"]["stopReason"] == "end_turn"
    # The token in the message is the turn's identity, and its record's.
    assert turned == [TOKEN]
    assert [kw["user_jwt_token"] for kw in counted] == [TOKEN]
    # The edit, drawn as a diff in the workspace; the file written there.
    diffs = [
        c
        for u in updates
        if u["sessionUpdate"] == "tool_call_update"
        for c in u.get("content") or []
        if c["type"] == "diff"
    ]
    assert diffs and {d["path"] for d in diffs} == {"hello.txt"}
    assert diffs[-1]["newText"] == "hello, shield\n"
    assert (workspace / "hello.txt").read_text() == "hello, shield\n"
    # Only the push reached the panel, with the harness's own option ids.
    [asked] = wire.asked
    assert asked["toolCall"]["title"] == "git push origin main"
    assert [o["optionId"] for o in asked["options"]] == ["allow", "reject"]
    # The Shield decided both and recorded them.
    rows = agent.audit.rows
    assert any(
        r["event"] == "fs_write"
        and r.get("decision") == "allow"
        and "do it" in r.get("sentence", "")
        for r in rows
    )
    assert any(
        r["event"] == "permission"
        and r.get("title") == "git push origin main"
        and "ask me first" in r.get("sentence", "")
        for r in rows
    )


@pytest.mark.parametrize(
    ("params", "said"),
    [
        (
            {"methodId": "password", "_meta": {"token": TOKEN}},
            "methodId 'bearer' only, not 'password'",
        ),
        ({"methodId": "bearer"}, "needs the person's token, a JWT, in `_meta.token`"),
        (
            {"methodId": "bearer", "_meta": {"token": "not-a-jwt"}},
            "needs the person's token, a JWT, in `_meta.token`",
        ),
    ],
)
def test_authenticate_refuses_in_a_sentence_and_the_connection_goes_on(
    client: TestClient, workspace: Path, params: dict[str, Any], said: str
) -> None:
    agent = harness_agent(workspace)
    register_agent(agent, AgentInfo(id="fake-refused", name="Fake"))
    try:
        with client.websocket_connect("/api/v1/acp/ws/fake-refused") as websocket:
            wire = Wire(websocket)
            _, refused = wire.request("authenticate", params)
            assert said in refused["error"]["message"]
            # The refusal never says the token back.
            assert TOKEN not in json.dumps(refused)
            _, initialized = wire.request("initialize", {"protocolVersion": 1})
            assert initialized["result"]["protocolVersion"] == 1
    finally:
        unregister_agent("fake-refused")
        client.portal.call(agent.cleanup)
