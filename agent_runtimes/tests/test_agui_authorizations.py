# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A tool's authorization asked during an AG-UI turn reaches the stream (ID-10)."""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Callable, Optional, cast

import pytest

from agent_runtimes import identity
from agent_runtimes.apps import visitors
from agent_runtimes.plugins.points import IdentityRefused
from agent_runtimes.transports.agui_authorizations import stream_with_authorizations

URL = (
    "https://bedrock-agentcore.us-east-1.amazonaws.com/identities/oauth2/authorize?x=1"
)


class WaitingProvider:
    """A provider that shows the URL, then waits for the grant the test gives."""

    id = "fake"

    def __init__(self) -> None:
        self.granted = asyncio.Event()
        self.told: dict[str, Any] = {}

    async def oauth_token(
        self,
        provider: str,
        scopes: list[str],
        flow: str = "USER_FEDERATION",
        on_auth_url: Optional[Callable[[str], Any]] = None,
        *,
        context: Any = None,
        **_: Any,
    ) -> str:
        self.told = dict(context or {})
        assert on_auth_url is not None
        on_auth_url(URL)
        await self.granted.wait()
        return "gho_1"


def _events(chunk: bytes) -> list[dict[str, Any]]:
    return [
        json.loads(line[len("data: ") :])
        for line in chunk.decode("utf-8").splitlines()
        if line.startswith("data: ")
    ]


def _run(provider: WaitingProvider) -> AsyncIterator[bytes]:
    """Return the chunks of a run whose one tool needs a GitHub grant."""

    @identity.requires_oauth("github", scopes=["repo"])
    async def my_repos(*, access_token: str) -> str:
        return f"repos with {access_token}"

    async def chunks() -> AsyncIterator[bytes]:
        yield b'data: {"type":"RUN_STARTED"}\n\n'
        original = identity.active_provider
        setattr(identity, "active_provider", lambda platform=None: provider)
        try:
            result = await my_repos()
        finally:
            setattr(identity, "active_provider", original)
        yield f"data: {json.dumps({'type': 'TOOL_CALL_RESULT', 'content': result})}\n\n".encode()
        yield b'data: {"type":"RUN_FINISHED"}\n\n'

    return chunks()


async def _read(
    provider: WaitingProvider, answer: Callable[[dict[str, Any]], Any]
) -> list[dict[str, Any]]:
    seen: list[dict[str, Any]] = []
    stream = stream_with_authorizations(
        _run(provider), {"agent_id": "researcher", "bearer": "jwt"}
    )
    async for chunk in stream:
        for event in _events(chunk):
            seen.append(event)
            if event.get("name") == identity.AUTHORIZATION_EVENT:
                answer(event)
    return seen


def test_the_authorization_event_reaches_the_stream_while_the_tool_waits() -> None:
    provider = WaitingProvider()
    seen = asyncio.run(_read(provider, lambda event: provider.granted.set()))
    assert [e["type"] for e in seen] == [
        "RUN_STARTED",
        "CUSTOM",
        "TOOL_CALL_RESULT",
        "RUN_FINISHED",
    ]
    value = seen[1]["value"]
    assert seen[1]["name"] == "identity.authorization_required"
    assert value["agent"] == "researcher"
    assert value["provider"] == "github"
    assert value["scopes"] == ["repo"]
    assert value["url"] == URL
    assert value["id"]
    assert seen[2]["content"] == "repos with gho_1"
    assert provider.told == {"agent_id": "researcher", "bearer": "jwt"}


def test_declining_ends_the_tool_call_with_a_sentence() -> None:
    provider = WaitingProvider()
    seen = asyncio.run(
        _read(
            provider, lambda event: identity.decline_authorization(event["value"]["id"])
        )
    )
    result = next(e for e in seen if e["type"] == "TOOL_CALL_RESULT")
    assert (
        result["content"]
        == "Access to github was declined: the tool call ends without it."
    )
    assert seen[-1]["type"] == "RUN_FINISHED"
    # Answered: nothing waits under that id any more.
    authorization = next(e for e in seen if e["type"] == "CUSTOM")
    assert identity.decline_authorization(authorization["value"]["id"]) is False


def test_a_visitor_is_never_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(visitors, "in_visitor_turn", lambda: True)
    provider = WaitingProvider()

    async def ask() -> str:
        return await identity.oauth_token(
            "github", scopes=["repo"], identity=cast(Any, provider)
        )

    with pytest.raises(IdentityRefused, match="A visitor grants no access to github"):
        asyncio.run(ask())
    assert provider.told == {}


def test_a_failing_run_fails_its_stream() -> None:
    async def chunks() -> AsyncIterator[bytes]:
        yield b'data: {"type":"RUN_STARTED"}\n\n'
        raise RuntimeError("the model is gone")

    async def read() -> list[bytes]:
        return [chunk async for chunk in stream_with_authorizations(chunks(), {})]

    with pytest.raises(RuntimeError, match="the model is gone"):
        asyncio.run(read())


def test_the_decline_route_refuses_an_unknown_authorization() -> None:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from agent_runtimes.routes.configure import router

    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    answer = TestClient(app).post(
        "/api/v1/configure/identity/authorizations/nope/decline"
    )
    assert answer.status_code == 404
    assert "No authorization nope waits" in answer.json()["detail"]
