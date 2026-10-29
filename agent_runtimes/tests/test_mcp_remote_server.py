# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A remote MCP server is reached at its url with its headers, no process.

The home page's demo scenes on r1 ran and their tools failed (28 October
2026): five catalogue servers reached the Datalayer MCP gateway through
``npx -y mcp-remote …``, which a runtime pod cannot fetch — its egress
boundary allows the gateway and no package registry, and the image carries no
``mcp-remote``. The runtime now connects to such a server itself: a spec with
``transport: streamable-http``, a ``url`` and no ``command``, its ``headers``
sent with every request, their ``${VAR}`` expanded the way arguments are.

Replayed here against a fake gateway in-process: the ``mcp`` package's server
mounted on a Starlette app behind a gate that answers as the real gateway
does — a wrong key refused in a sentence, as a JSON-RPC error with no id at
HTTP 200 (``mcp.datalayer.run``, probed 28 October 2026) or at a 401 with a
``detail``. Nothing here reaches the network.
"""

from __future__ import annotations

import socket
import sys
import threading
import time
from typing import Any

import pytest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from agent_runtimes.guardrails.credentials import redact
from agent_runtimes.mcp import lifecycle
from agent_runtimes.mcp.lifecycle import MCPLifecycleManager
from agent_runtimes.mcp.remote import refusal_sentence
from agent_runtimes.types import MCPServer

#: How long a server is given to start in these tests, in seconds.
DEADLINE = 8.0

KEY = "dl-key-for-the-fake-gateway-0123456789"

#: The gateway's own sentence for a token it cannot attribute (probed live).
UNATTRIBUTED = (
    "This request carries a token that could not be attributed to a Datalayer "
    "user, so it was not judged and not run. Authenticate again to obtain a "
    "valid token."
)
REFUSED_TOOL = "The policy refuses odoo_accounting_post_invoice to this agent."


class _Gate(BaseHTTPMiddleware):
    """The gateway's door: every request's headers seen, a wrong key refused."""

    def __init__(self, app: Any, seen: list[dict[str, str]], mode: dict[str, str]):
        super().__init__(app)
        self.seen = seen
        self.mode = mode

    async def dispatch(self, request: Any, call_next: Any) -> Any:
        self.seen.append(dict(request.headers))
        if request.headers.get("authorization") == f"Bearer {KEY}":
            return await call_next(request)
        if self.mode["refusal"] == "jsonrpc":
            # The live gateway: a JSON-RPC error with no id, at 200.
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {
                        "code": -32001,
                        "message": UNATTRIBUTED,
                        "data": {"reason": "attribution_failed"},
                    },
                }
            )
        return JSONResponse({"detail": REFUSED_TOOL}, status_code=403)


class FakeGateway:
    """The ``mcp`` package's server behind the gate, served in a thread."""

    def __init__(self) -> None:
        self.seen: list[dict[str, str]] = []
        self.mode = {"refusal": "jsonrpc"}
        self.url = ""

    def start(self) -> "FakeGateway":
        import uvicorn
        from mcp.server.mcpserver import MCPServer as FakeServer

        fake = FakeServer("fake-gateway")

        @fake.tool()
        def odoo_accounting_list_invoices(limit: int = 10) -> str:
            """The invoices, newest first."""
            return f"{limit} invoices"

        app = fake.streamable_http_app(streamable_http_path="/mcp", stateless_http=True)
        app.add_middleware(_Gate, seen=self.seen, mode=self.mode)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            port = int(probe.getsockname()[1])
        self.server = uvicorn.Server(
            uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
        )
        threading.Thread(target=self.server.run, daemon=True).start()
        deadline = time.monotonic() + 10
        while not self.server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        assert self.server.started
        self.url = f"http://127.0.0.1:{port}/mcp?only=odoo-accounting"
        return self

    def stop(self) -> None:
        self.server.should_exit = True


@pytest.fixture()
def gateway() -> Any:
    fake = FakeGateway().start()
    yield fake
    fake.stop()


@pytest.fixture()
def manager(monkeypatch: pytest.MonkeyPatch) -> Any:
    fresh = MCPLifecycleManager()
    monkeypatch.setattr(lifecycle, "MCP_SERVER_STARTUP_TIMEOUT", DEADLINE)
    monkeypatch.setattr(lifecycle, "MCP_SERVER_HANDSHAKE_TIMEOUT", DEADLINE)
    monkeypatch.setattr(lifecycle, "_lifecycle_manager", fresh)
    return fresh


def _remote(url: str) -> MCPServer:
    return MCPServer(
        id="odoo-accounting",
        name="Odoo Accounting",
        transport="streamable-http",
        url=url,
        headers={"Authorization": "Bearer ${DATALAYER_API_KEY}"},
        required_env_vars=["DATALAYER_API_KEY:0.0.1"],
    )


@pytest.mark.asyncio
async def test_a_remote_server_starts_at_its_url_with_its_header_expanded(
    manager: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATALAYER_API_KEY", KEY)
    config = _remote(gateway.url)
    instance = await manager.start_server("odoo-accounting", config)
    try:
        assert instance is not None and instance.is_running
        assert [tool.name for tool in instance.tools] == [
            "odoo_accounting_list_invoices"
        ]
        assert instance.config.is_running and instance.config.is_available
        # Every request carried the bearer, expanded from the environment.
        assert gateway.seen and all(
            seen.get("authorization") == f"Bearer {KEY}" for seen in gateway.seen
        )
        # The config the routes answer keeps its placeholder (R-19).
        assert config.headers == {"Authorization": "Bearer ${DATALAYER_API_KEY}"}
        assert "odoo-accounting" not in manager.get_failed_servers()
    finally:
        assert await manager.stop_server("odoo-accounting")


@pytest.mark.asyncio
async def test_the_header_is_expanded_from_the_secrets_a_configure_gave(
    manager: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    instance = await manager.start_server(
        "odoo-accounting", _remote(gateway.url), extra_env={"DATALAYER_API_KEY": KEY}
    )
    try:
        assert instance is not None
        assert gateway.seen[0].get("authorization") == f"Bearer {KEY}"
    finally:
        await manager.stop_server("odoo-accounting")


@pytest.mark.asyncio
async def test_a_wrong_key_fails_at_once_with_the_gateways_sentence(
    manager: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The gateway answers a wrong key as a JSON-RPC error with no id, at 200:
    the MCP client would wait the whole handshake for an answer to its
    ``initialize`` and say nothing of why. The start fails at the gateway's
    first word, with that word."""
    monkeypatch.setenv("DATALAYER_API_KEY", "not-the-gateways-key-0123456789")
    started = time.monotonic()
    assert await manager.start_server("odoo-accounting", _remote(gateway.url)) is None
    assert time.monotonic() - started < DEADLINE / 2
    said = manager.get_failed_servers()["odoo-accounting"]
    assert said.startswith("MCP server 'odoo-accounting' at http://127.0.0.1:")
    assert "refused the handshake: " + UNATTRIBUTED in said
    assert "HTTP" not in said
    assert "not-the-gateways-key" not in said


@pytest.mark.asyncio
async def test_a_refusal_at_a_status_is_said_with_its_detail_and_the_status(
    manager: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    gateway.mode["refusal"] = "status"
    monkeypatch.setenv("DATALAYER_API_KEY", "not-the-gateways-key-0123456789")
    assert await manager.start_server("odoo-accounting", _remote(gateway.url)) is None
    said = manager.get_failed_servers()["odoo-accounting"]
    assert "refused the handshake (HTTP 403): " + REFUSED_TOOL in said


@pytest.mark.asyncio
async def test_the_key_is_held_and_never_in_what_is_said(
    manager: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    secret = "held-remote-key-value-9876543210"
    monkeypatch.setenv("DATALAYER_API_KEY", secret)
    instance = await manager.start_server("odoo-accounting", _remote(gateway.url))
    try:
        assert instance is None
        assert secret not in manager.get_failed_servers()["odoo-accounting"]
        assert secret not in redact(f"the header was Bearer {secret}")
    finally:
        await manager.stop_server("odoo-accounting")


@pytest.mark.asyncio
async def test_an_empty_bearer_header_is_refused_without_connecting(
    manager: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    assert await manager.start_server("odoo-accounting", _remote(gateway.url)) is None
    assert (
        "DATALAYER_API_KEY is not set"
        in manager.get_failed_servers()["odoo-accounting"]
    )
    assert gateway.seen == []


@pytest.mark.asyncio
async def test_a_remote_server_from_mcp_json_names_its_url_and_headers(
    manager: Any, gateway: FakeGateway, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATALAYER_API_KEY", KEY)
    config = manager.get_merged_server_config(
        "books",
        {
            "transport": "streamable-http",
            "url": gateway.url,
            "headers": {"Authorization": "Bearer ${DATALAYER_API_KEY}"},
        },
        from_config_file=True,
    )
    assert config is not None and config.command is None
    assert config.url == gateway.url and config.is_config
    assert config.headers == {"Authorization": "Bearer ${DATALAYER_API_KEY}"}
    instance = await manager.start_server("books", config)
    try:
        assert instance is not None
        assert [tool.name for tool in instance.tools] == [
            "odoo_accounting_list_invoices"
        ]
    finally:
        await manager.stop_server("books", is_config=True)


@pytest.mark.asyncio
async def test_a_server_with_neither_command_nor_url_is_refused(
    manager: Any,
) -> None:
    nothing = MCPServer(id="nothing", name="Nothing")
    assert await manager.start_server("nothing", nothing) is None
    assert (
        "names no command to run and no url" in manager.get_failed_servers()["nothing"]
    )


@pytest.mark.asyncio
async def test_a_local_stdio_server_still_starts(manager: Any, tmp_path: Any) -> None:
    script = tmp_path / "answering.py"
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
    local = MCPServer(
        id="answering", name="Answering", command=sys.executable, args=[str(script)]
    )
    instance = await manager.start_server("answering", local)
    try:
        assert instance is not None
        assert [tool.name for tool in instance.tools] == ["ping"]
        assert not hasattr(instance.pydantic_server, "refusals")
    finally:
        await manager.stop_server("answering")


@pytest.mark.parametrize(
    ("status", "content_type", "body", "sentence"),
    [
        (
            200,
            "application/json",
            b'{"jsonrpc":"2.0","id":null,"error":{"code":-32001,"message":"Who?"}}',
            "Who?",
        ),
        (200, "application/json", b'{"jsonrpc":"2.0","id":1,"result":{}}', None),
        (200, "text/event-stream", b"", None),
        (401, "application/json", b'{"detail":"Not yours."}', "Not yours."),
        (403, "application/json", b'{"error":"Refused."}', "Refused."),
        (403, "application/json", b'{"message":" Said. "}', "Said."),
        (502, "text/html", b"<h1>Bad Gateway</h1>", "<h1>Bad Gateway</h1>"),
        (503, "text/plain", b"", "HTTP 503"),
        (400, "application/json", b"not json", "not json"),
    ],
)
def test_what_an_answer_refuses_with(
    status: int, content_type: str, body: bytes, sentence: str | None
) -> None:
    assert refusal_sentence(status, content_type, body) == sentence
