# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An approval waited on in an Agent Substrate actor (Kagent) reaches it.

Agent Substrate's egress gateway refuses every WebSocket upgrade ("egress
denied: WebSocket upgrades are not supported"), so the listener of a Kagent
actor never connected to ai-agents, and a tool that asked for approval waited
on a decision that could not arrive (the drill of 26 November 2026). On an
actor, every approval is read at ai-agents one by one over plain HTTP, and a
decision taken on the runtime's own page is sent to ai-agents over HTTP too:
with the token that asked it, to ai-agents' usual name, nothing put in.
"""

from __future__ import annotations

import asyncio
import base64
import json

import httpx
import pytest

from agent_runtimes.routes import tool_approvals as approvals
from agent_runtimes.routes import tool_approvals_listener as listener


def _jwt(claims: dict) -> str:
    def part(value: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

    return f"{part({'alg': 'RS256'})}.{part(claims)}.c2ln"


PERSON = _jwt({"sub": "person"})
AGENTS = "http://datalayer-ai-agents-svc.datalayer-api.svc.cluster.local:4400"


@pytest.fixture
def on_an_actor(monkeypatch):
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "ate")
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", AGENTS)


@pytest.mark.asyncio
async def test_on_an_actor_a_person_s_approvals_are_read_and_the_websocket_never_opened(
    on_an_actor, monkeypatch
):
    watched: list[tuple[str, str]] = []

    async def watch(jwt, url, client=None):
        watched.append((jwt, url))

    def connect(url, *args, **kwargs):
        raise AssertionError(
            "an actor's egress refuses a WebSocket: it is never opened"
        )

    monkeypatch.setattr(listener, "_watch_approvals", watch)
    monkeypatch.setattr("websockets.asyncio.client.connect", connect)
    await listener._run_listener(PERSON)
    assert watched == [(PERSON, AGENTS)]


@pytest.mark.asyncio
async def test_off_an_actor_a_person_s_approvals_are_still_listened_to(monkeypatch):
    monkeypatch.delenv("AGENT_RUNTIMES_TARGET", raising=False)
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://r1.test")
    opened: list[str] = []

    def connect(url, *args, **kwargs):
        opened.append(url)
        raise asyncio.CancelledError

    monkeypatch.setattr("websockets.asyncio.client.connect", connect)
    with pytest.raises(asyncio.CancelledError):
        await listener._run_listener(PERSON)
    assert opened and opened[0].startswith("wss://r1.test/api/ai-agents/v1/ws")


@pytest.mark.asyncio
async def test_on_an_actor_an_approval_given_at_ai_agents_reaches_the_waiting_tool(
    on_an_actor, monkeypatch
):
    """End to end in the runtime: the tool waits, ai-agents is told of it over HTTP, the listener reads it
    until the person approves, and the waiting call goes on."""
    from agent_runtimes.guardrails.tool_approvals import (
        ToolApprovalConfig,
        ToolApprovalManager,
    )

    monkeypatch.setattr(listener, "NARROWED_POLL_SECONDS", 0.01)
    seen: list[tuple[str, str, str]] = []
    state = {"reads": 0}

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(
            (
                request.method,
                f"{request.url.scheme}://{request.url.host}:{request.url.port}{request.url.path}",
                request.headers.get("authorization", ""),
            )
        )
        if (
            request.method == "POST"
            and request.url.path == "/api/ai-agents/v1/tool-approvals"
        ):
            return httpx.Response(200, json={"id": "remote-1", "status": "pending"})
        state["reads"] += 1
        return httpx.Response(
            200,
            json={
                "id": "remote-1",
                "status": "approved" if state["reads"] >= 2 else "pending",
            },
        )

    transport = httpx.MockTransport(answer)
    real = httpx.AsyncClient

    def client(*args, **kwargs):
        kwargs["transport"] = transport
        return real(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)
    monkeypatch.setattr(
        "agent_runtimes.context.identities.get_request_user_jwt", lambda: PERSON
    )
    manager = ToolApprovalManager(
        ToolApprovalConfig(
            agent_id="traveller", tools_requiring_approval=["overture_.*"], timeout=5.0
        )
    )
    decided = await asyncio.wait_for(
        manager.request_and_wait(
            "overture_search_places", {"category": "restaurant"}, tool_call_id="call-1"
        ),
        timeout=10.0,
    )
    assert decided["status"] == "approved"
    # Asked and read at ai-agents' usual name, with the person's own token, over plain HTTP.
    assert seen[0] == (
        "POST",
        f"{AGENTS}/api/ai-agents/v1/tool-approvals",
        f"Bearer {PERSON}",
    )
    assert {(method, url) for method, url, _ in seen[1:]} == {
        ("GET", f"{AGENTS}/api/ai-agents/v1/tool-approvals/remote-1")
    }
    assert {auth for _, _, auth in seen} == {f"Bearer {PERSON}"}
    await asyncio.sleep(0.05)  # the listener is let go once nothing waits


@pytest.mark.asyncio
async def test_on_an_actor_a_decision_taken_on_the_runtime_s_page_is_sent_over_http(
    on_an_actor, monkeypatch
):
    posted: list[tuple[str, str, dict]] = []

    def answer(request: httpx.Request) -> httpx.Response:
        posted.append(
            (
                request.url.path,
                request.headers.get("authorization", ""),
                json.loads(request.content or b"{}"),
            )
        )
        return httpx.Response(200, json={"success": True})

    transport = httpx.MockTransport(answer)
    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient", lambda *a, **k: real(*a, **{**k, "transport": transport})
    )

    def connect(url, *args, **kwargs):
        raise AssertionError(
            "an actor's egress refuses a WebSocket: it is never opened"
        )

    monkeypatch.setattr("websockets.asyncio.client.connect", connect)
    await approvals._relay_decision_to_ai_agents_ws("remote-1", True, None, PERSON)
    await approvals._relay_decision_to_ai_agents_ws(
        "remote-2", False, "not this one", PERSON
    )
    assert posted == [
        ("/api/ai-agents/v1/tool-approvals/remote-1/approve", f"Bearer {PERSON}", {}),
        (
            "/api/ai-agents/v1/tool-approvals/remote-2/reject",
            f"Bearer {PERSON}",
            {"note": "not this one"},
        ),
    ]
