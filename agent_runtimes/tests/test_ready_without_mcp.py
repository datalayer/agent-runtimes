# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent answers with its model while its MCP servers start (8 November 2026).

On r1 a runtime's configure-from-spec waited about 72 s on ``tavily``, whose
``npx tavily-mcp`` could not reach registry.npmjs.org, before it created the
agent; then the server was started again, twice, once without its secrets.
The page said "Connecting" all that while, then "no MCP server".

Now the configure answers as soon as the agent can answer with its model;
each server starts once, in the background, with its secrets, bounded by its
own deadline; the status says each one starting, ready or failed, a failure
in a sentence. And the user's token in a websocket's query string is never
written to uvicorn's log.
"""

from __future__ import annotations

import asyncio
import logging
import sys
import time
from types import SimpleNamespace
from typing import Any

import pytest

from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager, failure_sentence
from agent_runtimes.types import MCPServer

#: How long a server is given to start in these tests, in seconds.
DEADLINE = 1.0

UNREACHABLE = MCPServer(
    id="tavily",
    name="Tavily",
    command=sys.executable,
    # What npx says when the registry cannot be reached, then it ends.
    args=[
        "-c",
        "import sys; sys.stderr.write('npm error code ECONNREFUSED\\n"
        "npm error FetchError: request to https://registry.npmjs.org/tavily-mcp "
        "failed, reason: connect ECONNREFUSED 104.16.0.35:443\\n'); sys.exit(1)",
    ],
    env={"TAVILY_API_KEY": "${TAVILY_API_KEY}"},
)

HANGING = MCPServer(
    id="hanging",
    name="Hanging",
    command=sys.executable,
    # Never speaks MCP; ends on its own, so that no start of it outlives the test.
    args=["-c", "import time; time.sleep(4)"],
)


@pytest.fixture()
def manager(monkeypatch: pytest.MonkeyPatch) -> Any:
    fresh = MCPLifecycleManager()
    monkeypatch.setattr(lifecycle, "MCP_SERVER_STARTUP_TIMEOUT", 20.0)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_HANDSHAKE_TIMEOUT", 20.0)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_START_GRACE", 0.5)
    monkeypatch.setattr(lifecycle, "_lifecycle_manager", fresh)
    monkeypatch.setenv("AGENT_RUNTIMES_MCP_BACKGROUND_START_TIMEOUT", str(DEADLINE))
    yield fresh


# ── The failure, in a sentence ──────────────────────────────────────────


def test_an_unreachable_registry_is_said_by_its_host() -> None:
    said = failure_sentence(
        "tavily",
        "MCP server 'tavily' failed to start: Connection closed",
        "npm error code ECONNREFUSED\nnpm error FetchError: request to "
        "https://registry.npmjs.org/tavily-mcp failed",
    )
    assert (
        said == "tavily could not start: the runtime cannot reach registry.npmjs.org."
    )


def test_a_deadline_and_a_missing_command_are_said() -> None:
    assert (
        failure_sentence(
            "x", "MCP server 'x' did not start within 30s: its start was ended"
        )
        == "x could not start within 30 s."
    )
    assert (
        failure_sentence("x", "Connection closed", "sh: 1: uvx: not found")
        == "x could not start: the runtime has no uvx."
    )
    assert (
        failure_sentence("x", "Connection closed")
        == "x could not start: Connection closed."
    )


@pytest.mark.asyncio
async def test_a_server_whose_process_cannot_reach_the_registry_fails_with_the_reason(
    manager: Any,
) -> None:
    assert await manager.start_server("tavily", UNREACHABLE.model_copy()) is None
    [status] = manager.get_all_servers_status()
    assert status["status"] == "failed"
    assert status["reason"] == (
        "tavily could not start: the runtime cannot reach registry.npmjs.org."
    )


@pytest.mark.asyncio
async def test_a_background_start_is_ended_at_its_own_deadline(manager: Any) -> None:
    started = time.monotonic()
    assert (
        await manager.start_server("hanging", HANGING.model_copy(), deadline=DEADLINE)
        is None
    )
    assert time.monotonic() - started < DEADLINE + 3
    assert manager.get_server_status("hanging")["reason"] == (
        f"hanging could not start within {DEADLINE:g} s."
    )


def test_an_announced_server_is_starting_until_withdrawn(manager: Any) -> None:
    manager.announce(["tavily"])
    assert manager.get_server_status("tavily")["status"] == "starting"
    assert [s["status"] for s in manager.get_all_servers_status()] == ["starting"]
    manager.withdraw("tavily")
    assert manager.get_server_status("tavily")["status"] == "stopped"


# ── One start, with its secrets ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_server_starting_is_not_started_again(
    manager: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.routes import agents
    from agent_runtimes.routes.acp import _agents

    calls: list[dict[str, Any]] = []
    real = manager.start_server

    async def start_server(server_id: str, config: Any = None, **kwargs: Any) -> Any:
        calls.append({"id": server_id, **kwargs})
        return await real(server_id, config, **kwargs)

    monkeypatch.setattr(manager, "start_server", start_server)
    monkeypatch.setattr(agents, "MCP_SERVER_CATALOG", {"hanging": HANGING})
    adapter = SimpleNamespace(
        _selected_mcp_servers=[SimpleNamespace(id="hanging", origin="catalog")],
        _codemode_builder=None,
    )
    monkeypatch.setitem(_agents, "once", (adapter, SimpleNamespace()))  # type: ignore[arg-type]
    first = asyncio.create_task(
        agents._start_mcp_servers_for_agent("once", [], deadline=DEADLINE)
    )
    await asyncio.sleep(0.2)
    # A second start asked for while the first runs: not another process.
    started, running, failed, _ = await agents._start_mcp_servers_for_agent(
        "once", [], deadline=DEADLINE
    )
    assert (started, running, failed) == ([], [], [])
    await first
    assert [c["id"] for c in calls] == ["hanging"]
    assert calls[0]["deadline"] == DEADLINE


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, manager: Any) -> Any:
    """The runtime, with agent creation reduced to registering the agent."""
    from fastapi.testclient import TestClient
    from reactor import PluginPlatform

    from agent_runtimes.app import create_app
    from agent_runtimes.apps import plugins
    from agent_runtimes.routes import agents
    from agent_runtimes.routes import apps as routes
    from agent_runtimes.routes.acp import _agents

    created: list[Any] = []

    async def create_agent(request: Any, http_request: Any) -> dict:
        # Registered at once: the agent answers with its model.
        created.append(request)
        adapter = SimpleNamespace(
            _selected_mcp_servers=[SimpleNamespace(id="tavily", origin="catalog")],
            _codemode_builder=None,
        )
        _agents["default"] = (adapter, SimpleNamespace())  # type: ignore[assignment]
        agents._agentspecs["default"] = request.model_dump()
        return {"id": request.name}

    async def delete_agent(name: str, **kwargs: Any) -> None:
        _agents.pop(name, None)

    calls: list[dict[str, Any]] = []
    real = manager.start_server

    async def start_server(server_id: str, config: Any = None, **kwargs: Any) -> Any:
        calls.append({"id": server_id, **kwargs})
        # A slow start: the configure has answered long before it ends.
        await asyncio.sleep(0.5)
        return await real(server_id, config, **kwargs)

    monkeypatch.setattr(manager, "start_server", start_server)
    monkeypatch.setattr(agents, "create_agent", create_agent)
    monkeypatch.setattr(agents, "delete_agent", delete_agent)
    monkeypatch.setattr(agents, "_emit_agent_assigned_event", lambda **kwargs: None)
    monkeypatch.setattr(agents, "MCP_SERVER_CATALOG", {"tavily": UNREACHABLE})
    monkeypatch.setitem(agents._agentspecs, "default", None)
    saved = _agents.pop("default", None)
    routes._RUNNING.clear()
    monkeypatch.setattr(plugins, "PLATFORM", PluginPlatform())
    with TestClient(create_app(), client=("127.0.0.1", 50000)) as test_client:
        test_client.created = created
        test_client.calls = calls
        yield test_client
    _agents.pop("default", None)
    if saved is not None:
        _agents["default"] = saved


def test_configure_answers_before_the_servers_start_and_says_each_one(
    client: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("agentspecs.apps")
    for name in ("TAVILY_API_KEY", "GITHUB_TOKEN"):
        monkeypatch.setenv(name, "declared-for-this-test")
        monkeypatch.delenv(name)
    started = time.monotonic()
    response = client.post(
        "/api/v1/agents/configure-from-spec",
        json={
            "agent_spec_id": "cog-crawler",
            "env_vars": [
                {"name": "TAVILY_API_KEY", "value": "tavily-for-this-test"},
                {"name": "GITHUB_TOKEN", "value": "github-for-this-test"},
            ],
        },
    )
    assert response.status_code == 200, response.text
    assert time.monotonic() - started < 0.5, "the configure waited on a server"
    body = response.json()
    assert body["agent_id"] == "default"
    assert body["ready"] is True
    assert body["mcp_servers"] == [{"id": "tavily", "status": "starting"}]
    # The agent was made not to wait on its servers.
    [request] = client.created
    assert request.mcp_servers_in_background is True
    assert "mcp_servers_in_background" not in request.model_dump()
    # Said starting, then failed with its reason.
    status: dict[str, Any] = {}
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        servers = client.get("/api/v1/configure/mcp-toolsets-status").json()["servers"]
        status = next((s for s in servers if s["id"] == "tavily"), {})
        if status.get("status") == "failed":
            break
        assert status.get("status") == "starting", status
        time.sleep(0.1)
    assert status["reason"] == (
        "tavily could not start: the runtime cannot reach registry.npmjs.org."
    )
    # Started once, with its own secret alone, within its deadline.
    [call] = client.calls
    assert call["id"] == "tavily"
    assert call["extra_env"] == {"TAVILY_API_KEY": "tavily-for-this-test"}
    assert call["deadline"] == DEADLINE


# ── A turn does not wait on a server starting ───────────────────────────


@pytest.mark.asyncio
async def test_a_turn_does_not_wait_on_a_server_starting(manager: Any) -> None:
    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter

    manager.announce(["tavily"])
    adapter = SimpleNamespace(
        _selected_mcp_servers=[SimpleNamespace(id="tavily", origin="catalog")],
        _codemode_toolset_index=None,
        _get_runtime_toolsets=lambda: ["model-only"],
    )
    started = time.monotonic()
    toolsets = await PydanticAIAdapter._get_runtime_toolsets_async(adapter)  # type: ignore[arg-type]
    assert toolsets == ["model-only"]
    assert time.monotonic() - started < 0.5


# ── No token in uvicorn's log ───────────────────────────────────────────

JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLW5ldmVyLWxvZ2dlZA"


def _record(name: str, msg: str, args: tuple) -> logging.LogRecord:
    return logging.LogRecord(name, logging.INFO, __file__, 1, msg, args, None)


def test_the_access_log_withholds_the_token_of_a_query_string() -> None:
    from agent_runtimes.access_log import QueryTokenFilter

    record = _record(
        "uvicorn.access",
        '%s - "%s %s HTTP/%s" %d',
        (
            "10.0.0.1:5000",
            "GET",
            f"/api/v1/configure/sandbox/ws?agent_id=default&token={JWT}",
            "1.1",
            101,
        ),
    )
    assert QueryTokenFilter().filter(record)
    line = record.getMessage()
    assert JWT not in line
    assert "agent_id=default&token=[withheld]" in line


def test_create_app_puts_the_filter_on_uvicorns_loggers(
    caplog: pytest.LogCaptureFixture,
) -> None:
    from agent_runtimes.access_log import QueryTokenFilter
    from agent_runtimes.app import create_app

    create_app()
    for name in ("uvicorn.access", "uvicorn.error"):
        assert any(
            isinstance(f, QueryTokenFilter) for f in logging.getLogger(name).filters
        )
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    # How uvicorn says a websocket it accepted: its path with its query.
    logging.getLogger("uvicorn.error").info(
        '%s - "WebSocket %s" [accepted]',
        ("10.0.0.1", 5000),
        f"/api/v1/tool-approvals/ws?agent_id=default&token={JWT}",
    )
    assert JWT not in caplog.text
    assert "token=[withheld]" in caplog.text


def test_nothing_else_in_a_line_is_changed() -> None:
    from agent_runtimes.access_log import redact_query

    line = "/api/v1/agents/default/spec?view=full&page=2"
    assert redact_query(line) == line
