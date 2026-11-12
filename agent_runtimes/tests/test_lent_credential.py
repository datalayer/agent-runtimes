# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A credential lent to a harness is out of reach of what the harness runs.

Commands the model writes run as the harness's user, in its container: a file it
reads, its arguments, its environment and its memory are theirs. So nothing of the
credential is in any of them: the runtime holds it, and adds it on the pod's
loopback (`routes.mcp_lent`). A real harness process is searched here, its memory
included, and the protocol is driven through the route for real.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_lent_credential.py -v
```
"""

from __future__ import annotations

import json
import os
import socket
import threading
import time
from pathlib import Path
from typing import Any, AsyncIterator, Iterator, List

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.apps import principal
from agent_runtimes.apps.principal import OWN_ROUTES_ONLY
from agent_runtimes.apps.visitors import OwnRoutesOnly
from agent_runtimes.guardrails.shield_policy import policies_of
from agent_runtimes.mcp import lent_stdio
from agent_runtimes.routes import mcp_lent
from agent_runtimes.tests.test_acp_agent import (
    an_agent,
    connecting,
    fake_harness,
    turn,
    workspace,  # noqa: F401 - a fixture
)
from agent_runtimes.tests.test_apps_runtime_proof import _proof

GATEWAY = "https://mcp.example/mcp?only=earthdata"
TOKEN = "lent-credential-" + "x7Qp" * 8
POD = ("127.0.0.1", 50000)
OUTSIDE = ("203.0.113.9", 50000)
TRACEPARENT = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"


async def _chunks(body: bytes) -> AsyncIterator[bytes]:
    """
    A body as a stream comes: the route passes it on as it arrives.

    Yields
    ------
    bytes
        The body, in one chunk.
    """
    yield body


@pytest.fixture()
def answered() -> Iterator[List[httpx.Request]]:
    """
    The gateway, keeping what reaches it.

    Yields
    ------
    List[httpx.Request]
        The requests it got.
    """
    seen: List[httpx.Request] = []

    def gateway(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            headers={
                "content-type": "application/json",
                "mcp-session-id": "s-1",
                "set-cookie": "gateway=its-own",
            },
            content=_chunks(b'{"ok": true}'),
        )

    mcp_lent.use_client(
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(gateway))
    )
    yield seen
    mcp_lent.use_client(None)


def _runtime() -> FastAPI:
    runtime = FastAPI()
    runtime.include_router(mcp_lent.router, prefix="/api/v1")
    return runtime


@pytest.fixture()
def handle() -> Iterator[str]:
    held = lent_stdio.hold("earthdata", GATEWAY, TOKEN)
    yield held
    lent_stdio.release(held)


def test_the_bearer_is_added_here_for_the_one_url_it_is_held_for(
    answered: List[httpx.Request], handle: str
) -> None:
    pod = TestClient(_runtime(), client=POD)
    answer = pod.post(
        f"/api/v1/mcp/lent/{handle}",
        headers={
            "Authorization": "Bearer something-the-harness-says",
            "Content-Type": "application/json",
            "mcp-session-id": "s-1",
            "X-Forwarded-Host": "elsewhere.example",
        },
        content=b'{"jsonrpc": "2.0"}',
    )
    assert answer.status_code == 200, answer.text
    assert answer.json() == {"ok": True}
    assert answer.headers["mcp-session-id"] == "s-1"
    assert "set-cookie" not in answer.headers
    [reached] = answered
    assert str(reached.url) == GATEWAY
    assert reached.headers["authorization"] == f"Bearer {TOKEN}"
    assert reached.headers["mcp-session-id"] == "s-1"
    assert "x-forwarded-host" not in reached.headers
    assert reached.content == b'{"jsonrpc": "2.0"}'
    assert TOKEN not in answer.text


def test_a_redirect_takes_the_bearer_nowhere(handle: str) -> None:
    seen: List[str] = []

    def gateway(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        return httpx.Response(
            302,
            headers={"location": "https://elsewhere.example"},
            content=_chunks(b""),
        )

    transport = httpx.MockTransport(gateway)
    mcp_lent.use_client(lambda: _follows_nothing(transport))
    try:
        answer = TestClient(_runtime(), client=POD, follow_redirects=False).get(
            f"/api/v1/mcp/lent/{handle}"
        )
    finally:
        mcp_lent.use_client(None)
    assert seen == [GATEWAY]
    assert answer.status_code == 302 and "location" not in answer.headers


def _follows_nothing(transport: httpx.MockTransport) -> httpx.AsyncClient:
    client = mcp_lent._a_client()
    client._transport = transport
    return client


def test_only_the_pod_reaches_it_and_only_by_a_handle_that_holds_something(
    answered: List[httpx.Request], handle: str
) -> None:
    path = f"/api/v1/mcp/lent/{handle}"
    assert TestClient(_runtime(), client=OUTSIDE).post(path).status_code == 404
    pod = TestClient(_runtime(), client=POD)
    assert pod.post("/api/v1/mcp/lent/a-guess").status_code == 404
    lent_stdio.release(handle)
    assert pod.post(path).status_code == 404
    assert answered == []


def test_a_gateway_that_cannot_be_reached_says_nothing_of_the_call(
    handle: str,
) -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"cannot reach {request.headers['authorization']}")

    mcp_lent.use_client(lambda: httpx.AsyncClient(transport=httpx.MockTransport(down)))
    try:
        answer = TestClient(_runtime(), client=POD).post(f"/api/v1/mcp/lent/{handle}")
    finally:
        mcp_lent.use_client(None)
    assert answer.status_code == 502
    assert TOKEN not in answer.text


def test_the_turns_trace_goes_with_every_call(
    answered: List[httpx.Request], handle: str
) -> None:
    pod = TestClient(_runtime(), client=POD)
    path = f"/api/v1/mcp/lent/{handle}"
    lent_stdio.carry(handle, TRACEPARENT)
    pod.post(path, headers={"traceparent": "00-the-harnesss-own"})
    assert answered[-1].headers["traceparent"] == TRACEPARENT
    lent_stdio.carry(handle, None)
    pod.post(path)
    assert "traceparent" not in answered[-1].headers


def test_a_deployments_runtime_answers_it_to_its_loopback_alone(
    answered: List[httpx.Request],
    handle: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A harness holds no secret of the pod's: what stands for it is the handle."""
    monkeypatch.setattr(principal, "_keep_from_this_user", lambda: None)
    principal.forget_runtime_proof()
    principal.give_runtime_proof(_proof(), "the-pods-secret")
    try:
        gated = OwnRoutesOnly(_runtime())
        pod = TestClient(gated, client=POD)
        assert pod.post(f"/api/v1/mcp/lent/{handle}").status_code == 200
        outside = TestClient(gated, client=OUTSIDE).post(f"/api/v1/mcp/lent/{handle}")
        assert outside.status_code == 404
        assert outside.json()["detail"] == OWN_ROUTES_ONLY
    finally:
        principal.forget_runtime_proof()


def _strings_of(pid: int) -> bytes:
    """All a command of the same user reads of a process, its memory included."""
    proc = Path(f"/proc/{pid}")
    read = [(proc / "cmdline").read_bytes(), (proc / "environ").read_bytes()]
    with open(proc / "mem", "rb", buffering=0) as memory:
        for line in (proc / "maps").read_text().splitlines():
            span, permissions, *_ = line.split()
            if not permissions.startswith("r"):
                continue
            start, stop = (int(end, 16) for end in span.split("-"))
            if stop >= 0x7FFF_FFFF_F000:
                continue
            try:
                memory.seek(start)
                read.append(memory.read(stop - start))
            except (OSError, ValueError, OverflowError):
                continue
    return b"\0".join(read)


def _children_of(pid: int) -> List[int]:
    found: List[int] = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
        except OSError:
            continue
        if int(fields[1]) == pid:
            found.append(int(entry.name))
            found.extend(_children_of(int(entry.name)))
    return found


@pytest.mark.asyncio
@pytest.mark.parametrize("over", ["stdio", "http"])
async def test_nothing_a_harnesss_command_can_read_holds_it(
    workspace: Path,  # noqa: F811 - the fixture
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    over: str,
) -> None:
    """The harness running, its session open: its files, arguments, environment, memory."""
    shield = tmp_path / "shield"
    monkeypatch.setenv("AGENT_SHIELD_HOME", str(shield))
    app = connecting("earthdata")
    lent = lent_stdio_toolsets(app)
    agent = an_agent(
        workspace,
        lent=lent,
        policies=policies_of(app, ["earthdata"]),
        credential=TOKEN,
        environment={"FAKE_AGENT_MCP_HTTP": "1"} if over == "http" else {},
    )
    try:
        events = await turn(agent, "mcp")
        assert f"earthdata:{over}" in repr(events)
        assert agent._handles
        harnesses = _children_of(os.getpid())
        assert harnesses, "the harness is a process of its own"
        secret = TOKEN.encode()
        for pid in harnesses:
            assert secret not in _strings_of(pid)
        assert TOKEN not in repr(agent._lent_servers(TOKEN))
        for root in (shield, workspace):
            for file in root.rglob("*") if root.exists() else ():
                if file.is_file():
                    assert secret not in file.read_bytes(), file
    finally:
        await agent.cleanup()
    assert lent_stdio._LENT == {}


def lent_stdio_toolsets(app: Any) -> List[Any]:
    from agent_runtimes.adapters.acp_agent import lent_toolsets

    return lent_toolsets(fake_harness(), app)


def test_a_deployments_process_is_made_unreadable_before_it_lends(
    workspace: Path,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.models import models

    kept: List[bool] = []
    monkeypatch.setattr(principal, "_keep_from_this_user", lambda: kept.append(True))
    monkeypatch.setattr(
        models, "app_instance_of", lambda _: {"deployment_uid": "dep-1"}
    )
    app = connecting("earthdata")
    agent = an_agent(workspace, lent=lent_stdio_toolsets(app), credential=TOKEN)
    agent._lent_servers(TOKEN)
    agent._release_lent()
    assert kept == [True]


def _free_port() -> int:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


@pytest.fixture()
def a_gateway() -> Iterator[str]:
    """
    A real Streamable HTTP MCP server beside the route, checking the bearer.

    Yields
    ------
    str
        The server's MCP address.
    """
    import uvicorn
    from mcp.server import MCPServer
    from starlette.applications import Starlette
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    server = MCPServer("gateway")

    @server.tool()
    def read_the_catalogue(name: str) -> str:
        return f"read {name}"

    gateway = server.streamable_http_app(stateless_http=True)
    bearers: List[str] = []

    async def guarded(scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] == "http":
            said = Request(scope).headers.get("authorization", "")
            bearers.append(said)
            if said != f"Bearer {TOKEN}":
                refused = JSONResponse({"detail": "no"}, status_code=401)
                await refused(scope, receive, send)
                return
        await gateway(scope, receive, send)

    runtime = _runtime()
    runtime.mount("/", guarded)
    # Its sessions start with what serves it: a mounted application's do not.
    runtime.router.lifespan_context = gateway.router.lifespan_context
    port = _free_port()
    served = uvicorn.Server(
        uvicorn.Config(runtime, host="127.0.0.1", port=port, log_level="error")
    )
    thread = threading.Thread(target=served.run, daemon=True)
    thread.start()
    for _ in range(100):
        if served.started:
            break
        time.sleep(0.05)
    os.environ["AGENT_RUNTIMES_PORT"] = str(port)
    yield f"http://127.0.0.1:{port}/mcp"
    os.environ.pop("AGENT_RUNTIMES_PORT", None)
    served.should_exit = True
    thread.join(timeout=5)


@pytest.mark.asyncio
async def test_the_protocol_goes_through_it_for_real(a_gateway: str) -> None:
    from mcp.client.session import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    handle = lent_stdio.hold("earthdata", a_gateway, TOKEN)
    try:
        async with streamable_http_client(lent_stdio.lent_url(handle)) as streams:
            async with ClientSession(streams[0], streams[1]) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert [tool.name for tool in tools.tools] == ["read_the_catalogue"]
                called = await session.call_tool(
                    "read_the_catalogue", {"name": "granules"}
                )
                assert "read granules" in json.dumps(called.model_dump(mode="json"))
    finally:
        lent_stdio.release(handle)


@pytest.mark.asyncio
async def test_the_stdio_shim_reaches_it_with_nothing_of_the_credential(
    a_gateway: str,
) -> None:
    import sys

    from mcp.client.session import ClientSession
    from mcp.client.stdio import StdioServerParameters, stdio_client

    handle = lent_stdio.hold("earthdata", a_gateway, TOKEN)
    params = StdioServerParameters(
        command=sys.executable,
        args=[
            "-m",
            "agent_runtimes.mcp.lent_stdio",
            "--lent",
            lent_stdio.lent_url(handle),
        ],
        env={"PATH": os.environ["PATH"], "HOME": os.environ["HOME"]},
    )
    try:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                assert [tool.name for tool in tools.tools] == ["read_the_catalogue"]
    finally:
        lent_stdio.release(handle)
