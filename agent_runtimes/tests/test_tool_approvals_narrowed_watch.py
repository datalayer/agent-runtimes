# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A narrowed token's approvals (a Preview's, held to its application) are read
at ai-agents one by one: its ``/ws`` takes no narrowed token (fail closed,
the release gates), and a Preview's tool call waited on an approval
the person had already given until it timed out (round 23, on r1).
"""

from __future__ import annotations

import asyncio
import base64
import json

import httpx
import pytest

from agent_runtimes.routes import tool_approvals_listener as listener
from agent_runtimes.routes.tool_approvals import (
    _APPROVALS,
    _APPROVALS_LOCK,
    _REMOTE_APPROVAL_REGISTRY,
    ToolApprovalCreateRequest,
    _create_approval,
    register_remote_approval_mapping,
    remove_remote_approval_mapping,
)


def _jwt(claims: dict) -> str:
    def part(value: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    return f"{part({'alg': 'RS256'})}.{part(claims)}.c2ln"


PREVIEW = _jwt(
    {
        "sub": "person",
        "authorization_details": [{"type": "datalayer_preview", "app_uid": "APP"}],
    }
)
RUN = _jwt({"sub": "person", "task_grant_uid": "tg-1"})
PERSON = _jwt({"sub": "person"})


def test_narrowed_tokens_are_read_as_ai_agents_reads_them():
    assert listener.is_narrowed(PREVIEW)
    assert listener.is_narrowed(RUN)
    assert listener.is_narrowed(_jwt({"sub": "person", "authorization_details": []}))
    assert not listener.is_narrowed(PERSON)
    assert not listener.is_narrowed(_jwt({"sub": "person", "task_grant_uid": " "}))
    assert not listener.is_narrowed("dla_an-api-key")
    assert not listener.is_narrowed("a.b!.c")


@pytest.mark.asyncio
async def test_a_narrowed_tokens_approval_is_read_until_decided(monkeypatch):
    monkeypatch.setattr(listener, "NARROWED_POLL_SECONDS", 0.01)
    async with _APPROVALS_LOCK:
        _APPROVALS.clear()
    mine = await _create_approval(
        ToolApprovalCreateRequest(agent_id="a", tool_name="pap_ask", tool_call_id="c1")
    )
    other = await _create_approval(
        ToolApprovalCreateRequest(agent_id="b", tool_name="pap_ask", tool_call_id="c2")
    )
    register_remote_approval_mapping(mine.id, "remote-mine", PREVIEW)
    register_remote_approval_mapping(other.id, "remote-other", PERSON)
    asked: list[tuple[str, str]] = []

    def answer(request: httpx.Request) -> httpx.Response:
        asked.append((request.url.path, request.headers.get("authorization", "")))
        if len(asked) == 1:
            # A gateway's error page is said and read again, never taken for a decision.
            return httpx.Response(502, text="<html>Bad gateway</html>")
        decided = len(asked) >= 3
        remote = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(
            200, json={"id": remote, "status": "approved" if decided else "pending"}
        )

    client = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    watch = asyncio.create_task(
        listener._watch_approvals(PREVIEW, "https://r1.test/api/ai-agents/v1", client)
    )
    try:
        for _ in range(200):
            async with _APPROVALS_LOCK:
                if _APPROVALS[mine.id].status != "pending":
                    break
            await asyncio.sleep(0.01)
        async with _APPROVALS_LOCK:
            assert _APPROVALS[mine.id].status == "approved"
            assert _APPROVALS[other.id].status == "pending"
        # Only the approval forwarded with this token, read with it, at the service's route.
        assert {path for path, _ in asked} == {
            "/api/ai-agents/v1/tool-approvals/remote-mine"
        }
        assert {auth for _, auth in asked} == {f"Bearer {PREVIEW}"}
        # Decided: no longer read.
        assert "remote-mine" not in [
            remote for remote, _ in _REMOTE_APPROVAL_REGISTRY.values()
        ]
        count = len(asked)
        await asyncio.sleep(0.05)
        assert len(asked) == count
    finally:
        watch.cancel()
        await asyncio.gather(watch, return_exceptions=True)
        await client.aclose()
        remove_remote_approval_mapping(other.id)
        remove_remote_approval_mapping(mine.id)


@pytest.mark.asyncio
async def test_a_narrowed_token_never_opens_the_websocket(monkeypatch):
    watched: list[str] = []

    async def watch(jwt, url, client=None):
        watched.append(url)

    opened: list[str] = []

    def connect(url, *args, **kwargs):
        opened.append(url)
        raise asyncio.CancelledError

    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://r1.test")
    monkeypatch.setattr(listener, "_watch_approvals", watch)
    monkeypatch.setattr("websockets.asyncio.client.connect", connect)
    with pytest.raises(asyncio.CancelledError):
        await listener._run_listener(PERSON)
    assert len(opened) == 1 and not watched
    await listener._run_listener(PREVIEW)
    assert len(watched) == 1 and len(opened) == 1
