# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
# BSD 3-Clause License

"""Unit tests for the node-side tunneled Jupyter proxy (Option B)."""

from __future__ import annotations

import asyncio
import base64
from typing import Any, Dict, List

import httpx
import pytest

from agent_runtimes.nodes import agent_node_kernel_proxy as proxy_mod
from agent_runtimes.nodes.agent_node_kernel_proxy import NodeKernelProxy


def _collector() -> tuple[List[Dict[str, Any]], Any]:
    frames: List[Dict[str, Any]] = []

    async def _send(frame: Dict[str, Any]) -> None:
        frames.append(frame)

    return frames, _send


def _install_mock_httpx(monkeypatch: pytest.MonkeyPatch, handler: Any) -> None:
    real_async_client = httpx.AsyncClient

    def _factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _factory)


@pytest.mark.asyncio
async def test_handle_http_request_forwards_and_injects_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        proxy_mod,
        "_local_jupyter_target",
        lambda: ("http://127.0.0.1:2300", "secret-token"),
    )

    seen: Dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["method"] = request.method
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"kernels": []})

    _install_mock_httpx(monkeypatch, handler)

    frames, send = _collector()
    proxy = NodeKernelProxy(send)
    await proxy.handle_http_request(
        "req-1",
        {
            "method": "GET",
            "path": "api/kernels",
            "query": "foo=bar",
            "headers": {"accept": "application/json"},
            "body_b64": "",
        },
    )

    assert seen["url"] == "http://127.0.0.1:2300/api/kernels?foo=bar"
    assert seen["method"] == "GET"
    assert seen["auth"] == "token secret-token"
    assert len(frames) == 1
    frame = frames[0]
    assert frame["type"] == "http.response"
    assert frame["request_id"] == "req-1"
    assert frame["payload"]["status"] == 200
    body = base64.b64decode(frame["payload"]["body_b64"])
    assert b"kernels" in body


@pytest.mark.asyncio
async def test_handle_http_request_without_target_returns_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(proxy_mod, "_local_jupyter_target", lambda: None)

    frames, send = _collector()
    proxy = NodeKernelProxy(send)
    await proxy.handle_http_request("req-2", {"method": "GET", "path": "api/kernels"})

    assert len(frames) == 1
    assert frames[0]["type"] == "http.response"
    assert frames[0]["payload"]["status"] == 503


class _FakeWSClient:
    """Minimal async-iterable stand-in for a websockets client connection.

    With ``stay_open`` the iteration blocks after the scripted messages until
    ``close()`` — as a live kernel socket does — instead of ending at once,
    which reads to the proxy as the server hanging up.
    """

    def __init__(self, incoming: List[Any], stay_open: bool = False) -> None:
        self._incoming = incoming
        self._stay_open = stay_open
        self._closed = asyncio.Event()
        self.sent: List[Any] = []
        self.closed = False

    def __aiter__(self) -> "_FakeWSClient":
        self._iter = iter(self._incoming)
        return self

    async def __anext__(self) -> Any:
        try:
            return next(self._iter)
        except StopIteration:  # noqa: PERF203
            if self._stay_open:
                await self._closed.wait()
            raise StopAsyncIteration

    async def send(self, data: Any) -> None:
        self.sent.append(data)

    async def close(self) -> None:
        self.closed = True
        self._closed.set()


@pytest.mark.asyncio
async def test_ws_open_relays_messages_and_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        proxy_mod, "_local_jupyter_target", lambda: ("http://127.0.0.1:2300", "tok")
    )

    captured: Dict[str, Any] = {}
    fake_client = _FakeWSClient(["hello", b"\x01\x02"])

    async def fake_connect(url: str, **kwargs: Any) -> _FakeWSClient:
        captured["url"] = url
        captured["subprotocols"] = kwargs.get("subprotocols")
        return fake_client

    import websockets.asyncio.client as wsclient

    monkeypatch.setattr(wsclient, "connect", fake_connect)

    frames, send = _collector()
    proxy = NodeKernelProxy(send)
    await proxy.handle_ws_open(
        "chan-1",
        {
            "path": "api/kernels/abc/channels",
            "query": "session_id=s1",
            "subprotocols": ["v1.kernel.websocket.jupyter.org"],
        },
    )

    # Let the pump task drain the fake client.
    await asyncio.sleep(0)
    task = proxy._ws_tasks.get("chan-1")
    if task is not None:
        await asyncio.wait_for(asyncio.shield(task), timeout=1.0)

    assert captured["url"] == (
        "ws://127.0.0.1:2300/api/kernels/abc/channels?session_id=s1&token=tok"
    )
    assert captured["subprotocols"] == ["v1.kernel.websocket.jupyter.org"]

    message_frames = [f for f in frames if f["type"] == "ws.message"]
    assert message_frames[0]["payload"] == {"data": "hello", "binary": False}
    assert message_frames[1]["payload"]["binary"] is True
    assert base64.b64decode(message_frames[1]["payload"]["data"]) == b"\x01\x02"

    close_frames = [f for f in frames if f["type"] == "ws.close"]
    assert close_frames and close_frames[-1]["channel_id"] == "chan-1"


@pytest.mark.asyncio
async def test_ws_send_forwards_text_and_binary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        proxy_mod, "_local_jupyter_target", lambda: ("http://127.0.0.1:2300", "")
    )
    fake_client = _FakeWSClient([], stay_open=True)

    async def fake_connect(url: str, **kwargs: Any) -> _FakeWSClient:
        return fake_client

    import websockets.asyncio.client as wsclient

    monkeypatch.setattr(wsclient, "connect", fake_connect)

    frames, send = _collector()
    proxy = NodeKernelProxy(send)
    await proxy.handle_ws_open("chan-2", {"path": "api/kernels/x/channels"})

    await proxy.handle_ws_send("chan-2", {"data": "ping", "binary": False})
    await proxy.handle_ws_send(
        "chan-2",
        {"data": base64.b64encode(b"\xff\x00").decode("ascii"), "binary": True},
    )
    # Sends are queued and written by the channel's own task.
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert fake_client.sent[0] == "ping"
    assert fake_client.sent[1] == b"\xff\x00"

    await proxy.handle_ws_close("chan-2")
    assert fake_client.closed is True


@pytest.mark.asyncio
async def test_ws_send_before_open_completes_is_not_lost(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Frames sent while the local socket is still opening wait for it, in order.

    ``ws.open`` and the ``ws.send`` frames behind it are dispatched as separate
    tasks, and a kernel session opens with a burst of sends. They used to be
    dropped when they beat the handshake — which every session's first
    messages did.
    """
    monkeypatch.setattr(
        proxy_mod, "_local_jupyter_target", lambda: ("http://127.0.0.1:2300", "")
    )
    fake_client = _FakeWSClient([], stay_open=True)
    handshake = asyncio.Event()

    async def slow_connect(url: str, **kwargs: Any) -> _FakeWSClient:
        await handshake.wait()  # the round trip to Jupyter
        return fake_client

    import websockets.asyncio.client as wsclient

    monkeypatch.setattr(wsclient, "connect", slow_connect)

    _, send = _collector()
    proxy = NodeKernelProxy(send)
    opening = asyncio.create_task(
        proxy.handle_ws_open("chan-3", {"path": "api/kernels/x/channels"})
    )
    await asyncio.sleep(0)  # the open task has started and is waiting

    # The browser's opening burst, before the socket exists.
    await proxy.handle_ws_send(
        "chan-3", {"data": "kernel_info_request", "binary": False}
    )
    await proxy.handle_ws_send("chan-3", {"data": "execute_request", "binary": False})
    assert fake_client.sent == []

    handshake.set()
    await opening
    for _ in range(4):
        await asyncio.sleep(0)

    assert fake_client.sent == ["kernel_info_request", "execute_request"]
    await proxy.handle_ws_close("chan-3")
