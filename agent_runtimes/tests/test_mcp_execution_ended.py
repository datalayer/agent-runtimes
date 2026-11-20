# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A gateway call refused because the token's execution has ended: renewed once.

A deployment's principal token is narrowed to the deployment's execution. When
the deployment moves to a new spec version, that execution ends and the gateway
refuses every call made with the old token, as a JSON-RPC error whose ``data``
says ``rule: live`` and ``decided_by: execution``. :class:`DisplayMCPToolset`,
given a way to renew its token, asks for a new one once and calls again; a
second such refusal is said in a sentence, with no third call. Any other
refusal is left as it was.

The server here is the SDK's own over real HTTP, behind a gate that answers as
the gateway's enforcement does (200, a JSON-RPC error) for the tokens it holds
as ended.
"""

from __future__ import annotations

import json
import socket
import threading
import time
from collections.abc import Iterator
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
import uvicorn
from mcp.server import MCPServer
from pydantic_ai.exceptions import ModelRetry

from agent_runtimes.mcp.displays import DisplayMCPToolset, execution_ended

STALE = "stale-principal-token"
FRESH = "fresh-principal-token"


def _refusal(request_id: Any, tool: str, rule: str, detail: str) -> dict[str, Any]:
    """The gateway's refusal, as `enforcement._policy_refusal` writes it."""
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {
            "code": -32000,
            "message": (
                f"'{tool}' is not allowed here: {detail}. "
                "An execution whose manifest names what it needs can reach it."
            ),
            "data": {
                "reason": f"execution: {rule}",
                "rule": rule,
                "decided_by": "execution",
                "tool": tool,
            },
        },
    }


class Gate:
    """The SDK's server behind a gate that refuses some tokens' calls."""

    def __init__(self) -> None:
        self.server = MCPServer("gate")
        self.ended: set[str] = set()
        self.not_allowed: set[str] = set()
        self.calls: list[str] = []

        @self.server.tool()
        def add(a: int, b: int) -> int:
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
        payload = json.loads(body) if body else {}
        method = payload.get("method")
        if method == "server/discover":
            await _send(send, 404, b"Not Found", b"text/plain")
            return
        if method == "tools/call":
            bearer = dict(scope["headers"]).get(b"authorization", b"").decode()
            bearer = bearer.removeprefix("Bearer ")
            self.calls.append(bearer)
            tool = payload["params"]["name"]
            refusal = None
            if bearer in self.ended:
                refusal = _refusal(
                    payload["id"],
                    tool,
                    "live",
                    "the execution this token was issued for has ended",
                )
            elif bearer in self.not_allowed:
                refusal = _refusal(
                    payload["id"],
                    tool,
                    "toolAllowlist",
                    f"{tool!r} reaches nothing the execution's manifest names",
                )
            if refusal is not None:
                await _send(
                    send, 200, json.dumps(refusal).encode(), b"application/json"
                )
                return
        replayed = False

        async def replay() -> dict[str, Any]:
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)


async def _send(send: Any, status: int, body: bytes, kind: bytes) -> None:
    await send(
        {
            "type": "http.response.start",
            "status": status,
            "headers": [(b"content-type", kind)],
        }
    )
    await send({"type": "http.response.body", "body": body})


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
    yield served_app, f"http://127.0.0.1:{port}/mcp"
    served.should_exit = True
    thread.join(timeout=5)


class Renewer:
    """What the toolset is given to renew its token: counts, and answers `FRESH`."""

    def __init__(self, answer: str = FRESH) -> None:
        self.answer = answer
        self.asked: list[str] = []

    async def __call__(self, stale: str) -> str:
        self.asked.append(stale)
        return self.answer


def _toolset(url: str, renew: Renewer) -> DisplayMCPToolset:
    return DisplayMCPToolset(
        url,
        id="datalayer",
        http_client=httpx.AsyncClient(headers={"Authorization": f"Bearer {STALE}"}),
        renew_token=renew,
    )


#: What `get_tools` would say of a tool: not run as a task.
TOOL = SimpleNamespace(tool_def=SimpleNamespace(metadata={}))


async def _call(toolset: DisplayMCPToolset, a: int, b: int) -> Any:
    return await toolset.call_tool("add", {"a": a, "b": b}, None, TOOL)


@pytest.mark.asyncio
async def test_an_ended_execution_renews_the_token_once_and_the_retry_answers(
    gate: tuple[Gate, str],
) -> None:
    served, url = gate
    served.ended.add(STALE)
    renew = Renewer()
    async with _toolset(url, renew) as toolset:
        assert await _call(toolset, 1, 2) == 3
        # The calls that follow go with the new token, renewed no more.
        assert await _call(toolset, 2, 2) == 4
    assert renew.asked == [STALE]
    assert served.calls == [STALE, FRESH, FRESH]


@pytest.mark.asyncio
async def test_a_second_ended_execution_is_said_plainly_with_no_third_call(
    gate: tuple[Gate, str],
) -> None:
    served, url = gate
    served.ended.update({STALE, FRESH})
    renew = Renewer()
    async with _toolset(url, renew) as toolset:
        said = await _call(toolset, 1, 2)
    assert isinstance(said, str) and "could not be renewed" in said
    assert renew.asked == [STALE]
    assert served.calls == [STALE, FRESH]


@pytest.mark.asyncio
async def test_no_new_token_is_said_plainly_and_not_called_again(
    gate: tuple[Gate, str],
) -> None:
    served, url = gate
    served.ended.add(STALE)
    renew = Renewer(answer="")
    async with _toolset(url, renew) as toolset:
        said = await _call(toolset, 1, 2)
    assert isinstance(said, str) and "could not be renewed" in said
    assert renew.asked == [STALE]
    assert served.calls == [STALE]


@pytest.mark.asyncio
async def test_another_refusal_renews_nothing(gate: tuple[Gate, str]) -> None:
    served, url = gate
    served.not_allowed.add(STALE)
    renew = Renewer()
    async with _toolset(url, renew) as toolset:
        with pytest.raises(ModelRetry, match="reaches nothing the execution"):
            await _call(toolset, 1, 2)
    assert renew.asked == []
    assert served.calls == [STALE]


@pytest.mark.asyncio
async def test_without_a_renewer_an_ended_execution_surfaces_as_before(
    gate: tuple[Gate, str],
) -> None:
    served, url = gate
    served.ended.add(STALE)
    async with DisplayMCPToolset(
        url,
        id="datalayer",
        http_client=httpx.AsyncClient(headers={"Authorization": f"Bearer {STALE}"}),
    ) as toolset:
        with pytest.raises(ModelRetry, match="has ended"):
            await _call(toolset, 1, 2)
    assert served.calls == [STALE]


def test_only_the_gateways_execution_live_refusal_matches() -> None:
    from mcp.shared.exceptions import MCPError

    def error(code: int, data: Any) -> MCPError:
        return MCPError(code=code, message="'pap_read' is not allowed here", data=data)

    live = {"rule": "live", "decided_by": "execution", "reason": "execution: live"}
    assert execution_ended(error(-32000, live))
    assert execution_ended(BaseExceptionGroup("g", [error(-32000, live)]))
    assert not execution_ended(error(-32603, live))
    assert not execution_ended(error(-32000, {**live, "rule": "toolAllowlist"}))
    assert not execution_ended(error(-32000, {**live, "decided_by": "organization"}))
    assert not execution_ended(error(-32000, None))
    assert not execution_ended(
        RuntimeError("the execution this token was issued for has ended")
    )
