# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A configure that cannot finish answers with an error, and no secret is logged.

The demo team's cloud deploy (2026-10-06): the companion's
``configure-from-spec`` set the account's secrets and started the default
agent's MCP servers in the background; the CLI's ``/apps/configure`` then
started the application's connection, behind one lock every MCP start shared,
and a server that never answers (``mcp-remote`` with an empty bearer waits for
a browser sign-in) held it for up to 3 x 5 minutes. The CLI gave up after 120s.

Replayed here with the real lifecycle manager and a stdio server that never
answers, in place of the gateway: nothing here reaches the network.
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from reactor import ContributionRegistry

from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
from agent_runtimes.types import MCPServer

pytest.importorskip("agentspecs.apps")

#: How long a server is given to start in these tests, in seconds.
DEADLINE = 3.0

SECRET = "s3cr3tVALUE-never-in-the-logs"

HANGING = MCPServer(
    id="hanging",
    name="Hanging",
    command=sys.executable,
    # Never speaks MCP: the handshake waits until the deadline.
    args=["-c", "import time; time.sleep(3600)"],
)

APP = {
    "schema": "loop.app/v1",
    "id": "web-research",
    "name": "Web Research",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "instructions": "Open what you cite.",
    "connections": [{"server": "tavily:0.0.1"}],
}


def _answering_server(tmp_path: Path) -> MCPServer:
    script = tmp_path / "answering.py"
    # A bare stdio MCP server, with no dependency: it answers the handshake
    # and lists one tool.
    script.write_text(
        "import json, sys\n"
        "for line in sys.stdin:\n"
        "    message = json.loads(line)\n"
        "    if 'id' not in message:\n"
        "        continue\n"
        "    method = message.get('method')\n"
        "    if method == 'initialize':\n"
        "        result = {'protocolVersion': message['params']['protocolVersion'],\n"
        "                  'capabilities': {'tools': {}},\n"
        "                  'serverInfo': {'name': 'answering', 'version': '0'}}\n"
        "    elif method == 'tools/list':\n"
        "        result = {'tools': [{'name': 'ping', 'inputSchema': {'type': 'object'}}]}\n"
        "    else:\n"
        "        result = {}\n"
        "    print(json.dumps({'jsonrpc': '2.0', 'id': message['id'], 'result': result}), flush=True)\n"
    )
    return MCPServer(
        id="answering", name="Answering", command=sys.executable, args=[str(script)]
    )


@pytest.fixture()
def manager(monkeypatch: pytest.MonkeyPatch) -> Any:
    fresh = MCPLifecycleManager()
    monkeypatch.setattr(lifecycle, "MCP_SERVER_STARTUP_TIMEOUT", DEADLINE)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_HANDSHAKE_TIMEOUT", DEADLINE)
    monkeypatch.setattr(lifecycle, "_lifecycle_manager", fresh)
    yield fresh


@pytest.mark.asyncio
async def test_a_server_that_never_answers_fails_by_the_deadline_once(
    manager: Any,
) -> None:
    started = time.monotonic()
    instance = await manager.start_server("hanging", HANGING.model_copy())
    took = time.monotonic() - started
    assert instance is None
    # Once, not three times: a hang is not tried again.
    assert took < 2 * DEADLINE + 2
    assert "did not start within" in manager.get_failed_servers()["hanging"]


@pytest.mark.asyncio
async def test_one_slow_server_does_not_hold_back_another(
    manager: Any, tmp_path: Path
) -> None:
    # The companion's background start of a server that never answers...
    background = asyncio.create_task(
        manager.start_server("hanging", HANGING.model_copy())
    )
    await asyncio.sleep(0.2)
    # ...and the application's connection, started meanwhile.
    instance = await manager.start_server("answering", _answering_server(tmp_path))
    try:
        assert instance is not None
        assert not background.done(), "waited behind the hanging server's start"
    finally:
        await background
        await manager.stop_server("answering")


@pytest.mark.asyncio
async def test_an_empty_bearer_is_refused_without_starting_anything(
    manager: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("NOT_SET_FOR_THIS_TEST", raising=False)
    remote = MCPServer(
        id="remote",
        name="Remote",
        # Never run: refused before anything is started.
        command="/nonexistent/mcp-remote",
        args=[
            "https://mcp.example.invalid/mcp",
            "--header",
            "Authorization: Bearer ${NOT_SET_FOR_THIS_TEST}",
        ],
    )
    started = time.monotonic()
    assert await manager.start_server("remote", remote) is None
    assert time.monotonic() - started < 1
    said = manager.get_failed_servers()["remote"]
    assert "NOT_SET_FOR_THIS_TEST is not set" in said


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, manager: Any) -> Any:
    """The runtime, with agent creation reduced to what it does with MCP servers."""
    from agent_runtimes.app import create_app
    from agent_runtimes.loop.apps import plugins
    from agent_runtimes.routes import agents
    from agent_runtimes.routes import apps as routes
    from agent_runtimes.routes.acp import _agents

    deletes: list[dict[str, Any]] = []

    async def create_agent(request: Any, http_request: Any) -> dict:
        # The agent reaches the one server, started as create_agent starts it.
        adapter = SimpleNamespace(
            _selected_mcp_servers=[SimpleNamespace(id="hanging", origin="catalog")]
        )
        _agents["default"] = (adapter, SimpleNamespace())
        agents._agentspecs["default"] = request.model_dump()
        await manager.start_server("hanging", HANGING.model_copy())
        return {"id": request.name}

    async def delete_agent(
        name: str, stop_runtime: bool = False, runtime_id: Any = None
    ) -> None:
        deletes.append({"stop_runtime": stop_runtime, "runtime_id": runtime_id})
        _agents.pop(name, None)

    monkeypatch.setattr(agents, "create_agent", create_agent)
    monkeypatch.setattr(agents, "delete_agent", delete_agent)
    monkeypatch.setattr(agents, "_emit_agent_assigned_event", lambda **kwargs: None)
    # The background start finds the server here, and nowhere on the network.
    monkeypatch.setattr(agents, "MCP_SERVER_CATALOG", {"hanging": HANGING})
    monkeypatch.setitem(agents._agentspecs, "default", None)
    saved = _agents.pop("default", None)
    routes._RUNNING.clear()
    monkeypatch.setattr(plugins, "REGISTRY", ContributionRegistry())
    with TestClient(create_app(), client=("127.0.0.1", 50000)) as test_client:
        test_client.deletes = deletes
        yield test_client
    routes._RUNNING.clear()
    _agents.pop("default", None)
    if saved is not None:
        _agents["default"] = saved


def test_the_cloud_sequence_answers_with_an_error_and_logs_no_secret(
    client: Any, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    # 1. The companion: the account's secrets, and the default agent.
    response = client.post(
        "/api/v1/agents/configure-from-spec",
        json={
            "agent_spec_id": "cog-crawler",
            "env_vars": [{"name": "DEMO_SECRET_FOR_THIS_TEST", "value": SECRET}],
        },
    )
    assert response.status_code == 200, response.text
    # 2. The CLI: the application, while the background start still runs.
    started = time.monotonic()
    response = client.post("/api/v1/apps/configure", json={"app": APP})
    took = time.monotonic() - started
    # An answer, and an error that says which connection and why: not a hang.
    assert took < 3 * DEADLINE + 5
    assert response.status_code == 502, response.text
    [problem] = response.json()["detail"]["problems"]
    assert "hanging" in problem and "did not start within" in problem
    # Deleting the agent it replaces never stops the runtime.
    assert client.deletes
    assert all(d == {"stop_runtime": False, "runtime_id": None} for d in client.deletes)
    # The secret's name is said; no part of its value, anywhere.
    logged = "\n".join(record.getMessage() for record in caplog.records)
    assert "DEMO_SECRET_FOR_THIS_TEST" in logged
    for size in range(3, len(SECRET) + 1):
        assert SECRET[:size] not in logged, f"a {size}-character prefix was logged"
