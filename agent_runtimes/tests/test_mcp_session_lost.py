# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A server that lost the session: one new session, the call asked again.

The gateway's per-user worker keeps an MCP session per client. When it no
longer knows the one the runtime holds (the worker restarted, the replica
changed, the session was reaped as idle), it answers 404 "Session not found",
and the SDK's client raised it: the run failed with ``RuntimeError: Session
not found``. :class:`DisplayMCPToolset` opens a new session once and asks that
call again; a second loss surfaces, and no other error is asked again.

The server here is the SDK's own, over real HTTP, speaking the handshake era
as the gateway's workers do, and forgetting its sessions on demand.
"""

from __future__ import annotations

import json
import logging
import socket
import threading
import time
from collections.abc import Iterator
from typing import Any

import pytest
import uvicorn
from mcp.server import MCPServer
from pydantic_ai.exceptions import ModelRetry

from agent_runtimes.mcp.displays import DisplayMCPToolset, session_lost


class Forgetful:
    """The SDK's streamable-HTTP server, forgetting its sessions on demand.

    ``forget`` is how many of the next ``tools/call`` or ``tools/list``
    requests find the server without any session: it forgets them all just
    before serving the request, as a restarted worker would.
    """

    def __init__(self) -> None:
        self.server = MCPServer("forgetful")
        self.calls = 0
        self.forget = 0
        self.fail_with: str | None = None
        self.initialized = 0

        @self.server.tool()
        def add(a: int, b: int) -> int:
            self.calls += 1
            if self.fail_with is not None:
                raise ValueError(self.fail_with)
            return a + b

        self.app = self.server.streamable_http_app()

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http" or scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        chunks: list[bytes] = []
        while True:
            message = await receive()
            chunks.append(message.get("body", b""))
            if not message.get("more_body"):
                break
        body = b"".join(chunks)
        method = json.loads(body).get("method") if body else None
        if method == "server/discover":
            # A handshake-era server, as the gateway's workers are: it does
            # not know the modern era's discovery, so the client initializes
            # and holds an `Mcp-Session-Id`.
            await _json(send, 404, b"Not Found")
            return
        if method == "initialize":
            self.initialized += 1
        if method in ("tools/call", "tools/list") and self.forget > 0:
            self.forget -= 1
            self.server.session_manager._server_instances.clear()
        replayed = False

        async def replay() -> dict[str, Any]:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)


async def _json(send: Any, status: int, body: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", b"text/plain")],
        }
    )
    await send({"type": "http.response.body", "body": body})


@pytest.fixture()
def forgetful() -> Iterator[tuple[Forgetful, str]]:
    served_app = Forgetful()
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = int(probe.getsockname()[1])
    served = uvicorn.Server(
        uvicorn.Config(served_app, host="127.0.0.1", port=port, log_level="error")
    )
    thread = threading.Thread(target=served.run, daemon=True)
    thread.start()
    for _ in range(100):
        if served.started:
            break
        time.sleep(0.05)
    yield served_app, f"http://127.0.0.1:{port}/mcp"
    served.should_exit = True
    thread.join(timeout=5)


def _lost_logs(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [
        r.getMessage() for r in caplog.records if "no longer knows" in r.getMessage()
    ]


@pytest.mark.asyncio
async def test_the_session_is_held_as_the_gateway_s_workers_hold_it(
    forgetful: tuple[Forgetful, str],
) -> None:
    served, url = forgetful
    async with DisplayMCPToolset(url, id="books") as toolset:
        assert toolset.client.initialize_result is not None
        assert list(served.server.session_manager._server_instances)


@pytest.mark.asyncio
async def test_a_lost_session_is_opened_again_and_the_call_answered(
    forgetful: tuple[Forgetful, str], caplog: pytest.LogCaptureFixture
) -> None:
    served, url = forgetful
    caplog.set_level(logging.WARNING, logger="agent_runtimes.mcp.displays")
    async with DisplayMCPToolset(url, id="books") as toolset:
        assert [t.name for t in await toolset.list_tools()] == ["add"]
        served.forget = 1
        assert await toolset.direct_call_tool("add", {"a": 1, "b": 2}) == 3
        # And the new session serves the calls that follow.
        assert await toolset.direct_call_tool("add", {"a": 2, "b": 2}) == 4
    assert served.initialized == 2
    assert served.calls == 2
    assert len(_lost_logs(caplog)) == 1


@pytest.mark.asyncio
async def test_a_lost_session_is_opened_again_for_the_tools_list(
    forgetful: tuple[Forgetful, str], caplog: pytest.LogCaptureFixture
) -> None:
    served, url = forgetful
    caplog.set_level(logging.WARNING, logger="agent_runtimes.mcp.displays")
    async with DisplayMCPToolset(url, id="books") as toolset:
        served.forget = 1
        assert [t.name for t in await toolset.list_tools()] == ["add"]
    assert served.initialized == 2
    assert len(_lost_logs(caplog)) == 1


@pytest.mark.asyncio
async def test_a_session_lost_twice_surfaces(
    forgetful: tuple[Forgetful, str], caplog: pytest.LogCaptureFixture
) -> None:
    served, url = forgetful
    caplog.set_level(logging.WARNING, logger="agent_runtimes.mcp.displays")
    async with DisplayMCPToolset(url, id="books") as toolset:
        await toolset.list_tools()
        served.forget = 2
        with pytest.raises(ModelRetry, match="Session not found") as raised:
            await toolset.direct_call_tool("add", {"a": 1, "b": 2})
        assert session_lost(raised.value.__cause__)
        served.forget = 2
        toolset._cached_tools = None
        with pytest.raises(Exception, match="Session not found"):
            await toolset.list_tools()
    assert served.calls == 0
    # One new session per loss: the second loss of each is not asked again.
    assert served.initialized == 3
    assert len(_lost_logs(caplog)) == 2


@pytest.mark.asyncio
async def test_any_other_error_is_not_asked_again(
    forgetful: tuple[Forgetful, str], caplog: pytest.LogCaptureFixture
) -> None:
    served, url = forgetful
    caplog.set_level(logging.WARNING, logger="agent_runtimes.mcp.displays")
    served.fail_with = "Session not found"
    async with DisplayMCPToolset(url, id="books") as toolset:
        await toolset.list_tools()
        # A tool's own error, even worded as a lost session, is the tool's.
        with pytest.raises(ModelRetry):
            await toolset.direct_call_tool("add", {"a": 1, "b": 2})
    assert served.calls == 1
    assert served.initialized == 1
    assert _lost_logs(caplog) == []


def test_only_the_lost_session_s_protocol_error_matches() -> None:
    from mcp.shared.exceptions import MCPError
    from mcp.types import INTERNAL_ERROR, INVALID_REQUEST

    assert session_lost(MCPError(code=INVALID_REQUEST, message="Session not found"))
    assert session_lost(MCPError(code=INVALID_REQUEST, message="Session terminated"))
    assert session_lost(
        BaseExceptionGroup(
            "g", [MCPError(code=INVALID_REQUEST, message="Session not found")]
        )
    )
    assert not session_lost(MCPError(code=INTERNAL_ERROR, message="Session not found"))
    assert not session_lost(MCPError(code=INVALID_REQUEST, message="Invalid params"))
    assert not session_lost(RuntimeError("Session not found"))
    assert not session_lost(
        BaseExceptionGroup(
            "g",
            [
                MCPError(code=INVALID_REQUEST, message="Session not found"),
                RuntimeError("boom"),
            ],
        )
    )
