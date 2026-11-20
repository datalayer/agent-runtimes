# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A remote server that answers optional requests with errors still starts.

The MCP client's handshake is more than ``initialize``: it first probes
``server/discover`` (an error there falls back to ``initialize``), then sends
``notifications/initialized``, may open the optional GET event stream, and
later lists tools. Public servers answer some of these with errors and work:
a catalogue server answers ``server/discover`` with *"Method not found"*, its
GET stream with a plain 404 and ``resources/*``, ``prompts/*`` and
``logging/setLevel`` with a JSON-RPC error; another answers the probe with
*"Method not supported"* and its GET stream with a 405 and a JSON body. Only
an error answer to ``initialize``, or a 401/403, is a refusal of the
handshake.

The servers here are the SDK's own over real HTTP, behind a gate that answers
as those servers do. Nothing here reaches the network.
"""

from __future__ import annotations

import json
import socket
import threading
import time
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import pytest
import uvicorn
from mcp.server import MCPServer as FakeServer

from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
from agent_runtimes.mcp.remote import McpServerRefused, remote_toolset
from agent_runtimes.types import MCPServer

#: How long a server is given to start in these tests, in seconds.
DEADLINE = 8.0

#: The JSON-RPC error a catalogue server answers calls needing a profile with.
PROFILE_ERROR = {
    "code": -32001,
    "message": "UCP discovery failed",
    "data": {"code": "invalid_profile_url"},
}

OPTIONAL = {
    "logging/setLevel",
    "resources/list",
    "resources/templates/list",
    "prompts/list",
    "completion/complete",
}


async def _send(send: Any, status: int, body: bytes, kind: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", kind)],
        }
    )
    await send({"type": "http.response.body", "body": body})


def _error(request_id: Any, error: dict[str, Any]) -> bytes:
    return json.dumps({"jsonrpc": "2.0", "id": request_id, "error": error}).encode()


class Gate:
    """The SDK's server behind a gate answering as a given public server does.

    ``kind`` is ``catalogue`` (Method not found on the probe, a plain 404 on
    the GET stream, an empty JSON body for ``notifications/initialized``,
    JSON-RPC errors on the optional calls), ``maps`` (Method not supported on
    the probe, a 405 with a JSON body on the GET stream and on optional
    calls), or a refusal: ``initialize-error`` (a JSON-RPC error answering
    ``initialize``), ``initialize-401`` and ``initialize-403``.
    """

    def __init__(self) -> None:
        self.kind = "catalogue"
        self.methods: list[str] = []
        server = FakeServer("gate")

        @server.tool()
        def add(a: int, b: int) -> int:
            """The sum."""
            return a + b

        self.app = server.streamable_http_app()

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["method"] == "GET":
            self.methods.append("GET")
            if self.kind == "maps":
                body = json.dumps(
                    {"error": {"code": 405, "message": "Method not supported"}}
                ).encode()
                await _send(send, 405, body, b"application/json")
            else:
                await _send(send, 404, b"Resource Not Found", b"text/plain")
            return
        if scope["method"] != "POST":
            await self.app(scope, receive, send)
            return
        chunks: list[bytes] = []
        while True:
            message = await receive()
            chunks.append(message.get("body", b""))
            if not message.get("more_body"):
                break
        body = b"".join(chunks)
        payload = json.loads(body) if body else {}
        method = payload.get("method")
        request_id = payload.get("id")
        self.methods.append(str(method))
        if method == "server/discover":
            said = "Method not supported" if self.kind == "maps" else "Method not found"
            await _send(
                send,
                200,
                _error(request_id, {"code": -32601, "message": said}),
                b"application/json",
            )
            return
        if method == "initialize" and self.kind == "initialize-error":
            await _send(
                send,
                200,
                _error(request_id, {"code": -32600, "message": "Not for you."}),
                b"application/json",
            )
            return
        if method == "initialize" and self.kind in ("initialize-401", "initialize-403"):
            status = 401 if self.kind == "initialize-401" else 403
            await _send(
                send, status, b'{"detail":"Sign in first."}', b"application/json"
            )
            return
        if method in OPTIONAL:
            if self.kind == "maps":
                await _send(
                    send,
                    405,
                    json.dumps(
                        {"error": {"code": 405, "message": "Method not supported"}}
                    ).encode(),
                    b"application/json",
                )
            else:
                await _send(
                    send, 200, _error(request_id, PROFILE_ERROR), b"application/json"
                )
            return

        replayed = False

        async def replay() -> dict[str, Any]:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        if method == "notifications/initialized" and self.kind == "catalogue":
            # The server is told; the answer is a 200 with an empty JSON body.
            async def swallow(message: Any) -> None:
                return None

            await self.app(scope, replay, swallow)
            await _send(send, 200, b"", b"application/json")
            return
        await self.app(scope, replay, send)


@pytest.fixture()
def gate() -> Iterator[tuple[Gate, str]]:
    served_app = Gate()
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
    assert served.started
    yield served_app, f"http://127.0.0.1:{port}/mcp"
    served.should_exit = True
    thread.join(timeout=5)


@pytest.fixture()
def manager(monkeypatch: pytest.MonkeyPatch) -> Any:
    fresh = MCPLifecycleManager()
    monkeypatch.setattr(lifecycle, "MCP_SERVER_STARTUP_TIMEOUT", DEADLINE)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_HANDSHAKE_TIMEOUT", DEADLINE)
    monkeypatch.setattr(lifecycle, "_lifecycle_manager", fresh)
    return fresh


def _remote(server_id: str, url: str) -> MCPServer:
    return MCPServer(id=server_id, name=server_id, transport="streamable-http", url=url)


#: What `get_tools` would say of a tool: not run as a task.
TOOL = SimpleNamespace(tool_def=SimpleNamespace(metadata={}))


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["catalogue", "maps"])
async def test_a_server_erring_on_optional_requests_starts_and_answers(
    manager: Any, gate: tuple[Gate, str], kind: str
) -> None:
    served, url = gate
    served.kind = kind
    instance = await manager.start_server(kind, _remote(kind, url))
    try:
        assert kind not in manager.get_failed_servers()
        assert instance is not None and instance.is_running
        assert [tool.name for tool in instance.tools] == ["add"]
        said = await instance.pydantic_server.call_tool(
            "add",
            {"a": 2, "b": 3},
            None,
            TOOL,
        )
        assert said == 5
    finally:
        await manager.stop_server(kind)
    assert served.methods[0] == "server/discover"
    assert "initialize" in served.methods


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["catalogue", "maps"])
async def test_optional_calls_erring_during_the_handshake_refuse_nothing(
    gate: tuple[Gate, str], kind: str
) -> None:
    """Armed throughout (no stand-down): the optional calls' errors are the
    calls' own, and the server is not said to have refused anything."""
    served, url = gate
    served.kind = kind
    toolset = remote_toolset(kind, url, {}, DEADLINE)
    async with toolset:
        assert [tool.name for tool in await toolset.client.list_tools()] == ["add"]
        for call in (
            toolset.client.list_resources,
            toolset.client.list_resource_templates,
            toolset.client.list_prompts,
        ):
            with pytest.raises(Exception) as raised:
                await call()
            assert not isinstance(raised.value, McpServerRefused)
        with pytest.raises(Exception) as raised:
            await toolset.client.session.set_logging_level("info")
        assert not isinstance(raised.value, McpServerRefused)
        result = await toolset.client.call_tool("add", {"a": 1, "b": 1})
        assert result.structured_content == {"result": 2}
    assert toolset.refusals.sentence is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("kind", "sentence"),
    [
        ("initialize-error", "refused the handshake: Not for you."),
        ("initialize-401", "refused the handshake (HTTP 401): Sign in first."),
        ("initialize-403", "refused the handshake (HTTP 403): Sign in first."),
    ],
)
async def test_a_refused_initialize_still_fails_at_once_with_its_sentence(
    manager: Any, gate: tuple[Gate, str], kind: str, sentence: str
) -> None:
    served, url = gate
    served.kind = kind
    started = time.monotonic()
    assert await manager.start_server("refusing", _remote("refusing", url)) is None
    assert time.monotonic() - started < DEADLINE / 2
    said = manager.get_failed_servers()["refusing"]
    assert said.startswith("MCP server 'refusing' at http://127.0.0.1:")
    assert sentence in said


def _answer(
    status: int, method: str | None, body: bytes, kind: str = "application/json"
) -> Any:
    import httpx2

    if method is None:
        request = httpx2.Request("GET", "http://server/mcp")
    else:
        request = httpx2.Request(
            "POST",
            "http://server/mcp",
            json={"jsonrpc": "2.0", "id": 1, "method": method, "params": {}},
        )
    return httpx2.Response(
        status, headers={"content-type": kind}, content=body, request=request
    )


NOT_FOUND = (
    b'{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}'
)
NO_ID = b'{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"Who?"}}'


@pytest.mark.parametrize(
    ("status", "method", "body", "kind", "refused"),
    [
        (200, "initialize", NOT_FOUND, "application/json", True),
        (500, "initialize", b"down", "text/plain", True),
        (401, "tools/list", b'{"detail":"No."}', "application/json", True),
        (403, None, b'{"detail":"No."}', "application/json", True),
        # The gateway's wrong key: no id, whatever was asked.
        (200, "server/discover", NO_ID, "application/json", True),
        (200, "server/discover", NOT_FOUND, "application/json", False),
        (200, "resources/list", NOT_FOUND, "application/json", False),
        (404, None, b"Resource Not Found", "text/plain", False),
        (
            405,
            None,
            b'{"error":{"code":405,"message":"Method not supported"}}',
            "application/json",
            False,
        ),
    ],
)
def test_which_answers_refuse(
    status: int, method: str | None, body: bytes, kind: str, refused: bool
) -> None:
    from agent_runtimes.mcp.remote import refuses

    assert refuses(_answer(status, method, body, kind), body) is refused
