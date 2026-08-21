# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the agent node tunnel: identity, and the AG-UI relay.

The relay is what makes a node usable from the SaaS: it carries the browser's
AG-UI run to the node's own endpoint and the agent's event stream back, byte
for byte. What is worth pinning down is that nothing is interpreted on the
way — a tool call emitted by the agent must reach the browser as a tool call.
"""

from __future__ import annotations

import base64
import json
from typing import Any

import pytest

from agent_runtimes.nodes import agent_node_tunnel as tunnel

# --- Identity --------------------------------------------------------------


def test_node_id_prefers_persisted_uid_over_hostname(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Use persisted node UID when no environment override is set."""

    class _Cfg:
        node_uid = "node-ulid-123"

    monkeypatch.delenv("AGENT_NODE_ID", raising=False)
    monkeypatch.setattr(
        "agent_runtimes.routes.agent_node.get_agent_node_configuration",
        lambda: _Cfg(),
    )

    assert tunnel._node_id() == "node-ulid-123"


def test_node_id_env_override_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prefer AGENT_NODE_ID over persisted node UID when provided."""

    class _Cfg:
        node_uid = "node-ulid-123"

    monkeypatch.setenv("AGENT_NODE_ID", "env-node-999")
    monkeypatch.setattr(
        "agent_runtimes.routes.agent_node.get_agent_node_configuration",
        lambda: _Cfg(),
    )

    assert tunnel._node_id() == "env-node-999"


def test_tunnel_and_sync_resolve_the_same_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The service admits the tunnel only for the user who registered the node.

    So the token the tunnel dials with must be the one the sync loop
    registered with — whatever the node UI posted later. This is the bug that
    showed up as an endless ``HTTP 403`` on the tunnel.
    """
    from agent_runtimes.nodes import agent_node_sync as sync

    monkeypatch.setenv("DATALAYER_API_KEY", "env-key")
    monkeypatch.setattr(
        "agent_runtimes.routes.agent_node.get_runtime_credentials",
        lambda: {"token": "ui-token-from-someone-else", "runtimes_url": ""},
    )

    assert tunnel._auth_token() == "env-key"
    assert sync._auth_token() == "env-key"
    assert tunnel.token_source() == "env:DATALAYER_API_KEY"


def test_agui_agent_id_falls_back_to_the_active_agent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Cfg:
        active_agent_id = "configured-agent"

    monkeypatch.setattr(
        "agent_runtimes.routes.agent_node.get_agent_node_configuration",
        lambda: _Cfg(),
    )
    assert tunnel._agui_agent_id("asked-for") == "asked-for"
    assert tunnel._agui_agent_id("") == "configured-agent"


# --- The AG-UI relay ---------------------------------------------------------


class _FakeStream:
    """What ``httpx.AsyncClient.stream`` yields: a status and a body in pieces."""

    def __init__(self, status: int, chunks: list[bytes], content_type: str) -> None:
        self.status_code = status
        self.headers = {"content-type": content_type}
        self._chunks = chunks

    async def __aenter__(self) -> "_FakeStream":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def aread(self) -> bytes:
        return b"".join(self._chunks)

    async def aiter_bytes(self) -> Any:
        for chunk in self._chunks:
            yield chunk


class _FakeClient:
    calls: list[dict[str, Any]] = []
    response: _FakeStream

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> "_FakeClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    def stream(self, method: str, url: str, **kwargs: Any) -> _FakeStream:
        _FakeClient.calls.append({"method": method, "url": url, **kwargs})
        return _FakeClient.response


@pytest.fixture
def fake_httpx(monkeypatch: pytest.MonkeyPatch) -> type[_FakeClient]:
    import httpx

    _FakeClient.calls = []
    monkeypatch.setattr(httpx, "AsyncClient", _FakeClient)
    monkeypatch.setenv("AGENT_NODE_LOCAL_URL", "http://127.0.0.1:8765")
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.setattr(
        "agent_runtimes.routes.agent_node.get_runtime_credentials",
        lambda: {"token": "", "runtimes_url": ""},
    )
    return _FakeClient


async def _collect(coro: Any) -> list[dict[str, Any]]:
    frames: list[dict[str, Any]] = []

    async def send(frame: dict[str, Any]) -> None:
        frames.append(frame)

    await coro(send)
    return frames


@pytest.mark.asyncio
async def test_relay_streams_the_agents_events_untouched(
    fake_httpx: type[_FakeClient],
) -> None:
    """A tool call emitted by the agent reaches the browser as a tool call."""
    events = [
        b'data: {"type":"RUN_STARTED","threadId":"t","runId":"r"}\n\n',
        b'data: {"type":"TOOL_CALL_START","toolCallId":"c1","toolCallName":"insert_cell"}\n\n',
        # A chunk boundary inside a multi-byte character: must survive.
        'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"caf'.encode() + "é".encode()[:1],
        "é".encode()[1:] + b'"}\n\n',
        b'data: {"type":"RUN_FINISHED","threadId":"t","runId":"r"}\n\n',
    ]
    fake_httpx.response = _FakeStream(200, events, "text/event-stream")
    body = {
        "threadId": "t",
        "runId": "r",
        "messages": [],
        "tools": [{"name": "insert_cell"}],
    }

    frames = await _collect(
        lambda send: tunnel._relay_agui_request(
            send, "req-1", {"agent_id": "example", "body": body}
        )
    )

    # Posted to the node's own mount, with the run input as the browser sent it.
    call = fake_httpx.calls[0]
    assert call["method"] == "POST"
    assert call["url"] == "http://127.0.0.1:8765/api/v1/ag-ui/example/"
    assert call["json"] == body
    assert call["headers"]["Accept"] == "text/event-stream"

    assert [f["type"] for f in frames] == ["agui.start"] + ["agui.chunk"] * 5 + [
        "agui.end"
    ]
    assert all(f["request_id"] == "req-1" for f in frames)
    assert frames[0]["payload"]["status"] == 200

    relayed = b"".join(
        base64.b64decode(f["payload"]["data_b64"])
        for f in frames
        if f["type"] == "agui.chunk"
    )
    assert relayed == b"".join(events)
    # The stream reassembles into exactly the agent's events.
    types = [
        json.loads(line[6:])["type"] for line in relayed.decode().split("\n\n") if line
    ]
    assert types == [
        "RUN_STARTED",
        "TOOL_CALL_START",
        "TEXT_MESSAGE_CONTENT",
        "RUN_FINISHED",
    ]


@pytest.mark.asyncio
async def test_relay_reports_a_rejected_run_with_its_status(
    fake_httpx: type[_FakeClient],
) -> None:
    fake_httpx.response = _FakeStream(
        404, [b'{"detail":"no such agent"}'], "application/json"
    )

    frames = await _collect(
        lambda send: tunnel._relay_agui_request(
            send, "req-2", {"agent_id": "ghost", "body": {}}
        )
    )

    assert [f["type"] for f in frames] == ["agui.start"]
    assert frames[0]["payload"]["status"] == 404
    assert "no such agent" in frames[0]["payload"]["detail"]


@pytest.mark.asyncio
async def test_relay_needs_to_know_where_the_node_answers(
    fake_httpx: type[_FakeClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("AGENT_NODE_LOCAL_URL")

    frames = await _collect(
        lambda send: tunnel._relay_agui_request(
            send, "req-3", {"agent_id": "x", "body": {}}
        )
    )

    assert [f["type"] for f in frames] == ["agui.error"]
    assert "AGENT_NODE_LOCAL_URL" in frames[0]["payload"]["error"]
    assert fake_httpx.calls == []
