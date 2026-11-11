# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``datalayer`` provider's GitHub token: from the grant Datalayer IAM holds,
asked with the person's token for a runtime of theirs; when GitHub is not
connected, the consent shown in the chat and the grant waited for."""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator

import httpx
import pytest

from agent_runtimes import identity
from agent_runtimes.identity import github_connection
from agent_runtimes.identity.datalayer import DatalayerIdentity
from agent_runtimes.plugins.points import (
    AuthorizationRequired,
    AuthorizationTimedOut,
    IdentityRefused,
)
from agent_runtimes.tools import github as github_tool
from agent_runtimes.transports.agui_authorizations import stream_with_authorizations

#: The real client, before a test stands IAM in for it.
REAL_CLIENT = httpx.AsyncClient

IAM = "https://iam.example"
START = f"{IAM}/api/iam/v1/oauth2/github-connection/start?ticket=t1"
NOT_CONNECTED = {
    "detail": "GitHub is not connected: connect it in Settings › GitHub, or from the chat's prompt.",
    "reason": "not_connected",
}


class FakeIam:
    """IAM's GitHub connection: the token route answers in turn what the test lines up."""

    def __init__(self, *answers: httpx.Response) -> None:
        self.answers = list(answers)
        self.seen: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(request)
        if request.url.path.endswith("/consent"):
            return httpx.Response(
                200, json={"success": True, "authorization_url": START}
            )
        return self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]

    def tokens(self) -> list[httpx.Request]:
        return [r for r in self.seen if r.url.path.endswith("/token")]


@pytest.fixture()
def iam(monkeypatch: pytest.MonkeyPatch):
    def use(*answers: httpx.Response) -> FakeIam:
        fake = FakeIam(*answers)
        monkeypatch.setattr(github_connection, "_iam_url", lambda: IAM)
        monkeypatch.setattr(
            github_connection.httpx,
            "AsyncClient",
            lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(fake.handler)),
        )
        return fake

    monkeypatch.setenv("DATALAYER_USER_UID", "person-1")
    monkeypatch.setenv("DATALAYER_RUNTIME_ID", "01RUNTIME")
    return use


def _provider(clock: list[float]) -> DatalayerIdentity:
    async def sleep(seconds: float) -> None:
        clock[0] += seconds

    return DatalayerIdentity(
        wait_seconds=6, poll_seconds=2, clock=lambda: clock[0], sleep=sleep
    )


TOKEN = httpx.Response(200, json={"success": True, "access_token": "gho_person"})
CONTEXT = {"agent_id": "researcher", "bearer": "person-jwt"}


def test_the_persons_token_from_iam_for_a_runtime_of_theirs(iam) -> None:
    fake = iam(TOKEN)
    token = asyncio.run(
        _provider([0.0]).oauth_token(
            "github", ["read:user"], "USER_FEDERATION", None, context=CONTEXT
        )
    )
    assert token == "gho_person"
    (asked,) = fake.tokens()
    assert asked.method == "POST"
    assert asked.url.path == "/api/iam/v1/oauth2/github-connection/token"
    assert asked.headers["authorization"] == "Bearer person-jwt"
    assert json.loads(asked.content) == {
        "level": "public",
        "runtime_owner_uid": "person-1",
        "runtime_uid": "01RUNTIME",
    }


def test_repo_asks_the_private_level() -> None:
    assert github_connection.level_of(["read:user", "repo"]) == "private"
    assert github_connection.level_of(["read:user"]) == "public"


def test_not_connected_shows_iams_start_link_and_waits_for_the_grant(iam) -> None:
    fake = iam(
        httpx.Response(409, json=NOT_CONNECTED),
        httpx.Response(409, json=NOT_CONNECTED),
        TOKEN,
    )
    shown: list[str] = []
    token = asyncio.run(
        _provider([0.0]).oauth_token(
            "github", ["read:user"], "USER_FEDERATION", shown.append, context=CONTEXT
        )
    )
    assert token == "gho_person"
    assert shown == [START]
    assert len(fake.tokens()) == 3
    (consent,) = [r for r in fake.seen if r.url.path.endswith("/consent")]
    assert consent.url.params["level"] == "public"
    assert consent.headers["authorization"] == "Bearer person-jwt"


def test_a_grant_not_given_in_time_ends_in_a_sentence(iam) -> None:
    iam(httpx.Response(409, json=NOT_CONNECTED))
    with pytest.raises(AuthorizationTimedOut, match="not granted within 6 seconds"):
        asyncio.run(
            _provider([0.0]).oauth_token(
                "github",
                ["read:user"],
                "USER_FEDERATION",
                lambda url: None,
                context=CONTEXT,
            )
        )


def test_without_a_display_the_link_is_carried(iam) -> None:
    iam(httpx.Response(409, json=NOT_CONNECTED))
    with pytest.raises(AuthorizationRequired) as required:
        asyncio.run(
            _provider([0.0]).oauth_token(
                "github", ["read:user"], "USER_FEDERATION", None, context=CONTEXT
            )
        )
    assert required.value.url == START


def test_another_persons_runtime_is_iams_refusal_and_no_consent(iam) -> None:
    fake = iam(
        httpx.Response(
            403,
            json={
                "detail": "This runtime is another person's: your GitHub is handed to a runtime of yours only."
            },
        )
    )
    shown: list[str] = []
    with pytest.raises(IdentityRefused, match="another person's"):
        asyncio.run(
            _provider([0.0]).oauth_token(
                "github",
                ["read:user"],
                "USER_FEDERATION",
                shown.append,
                context=CONTEXT,
            )
        )
    assert shown == [] and not [r for r in fake.seen if r.url.path.endswith("/consent")]


def test_no_person_or_no_owner_is_refused(iam, monkeypatch: pytest.MonkeyPatch) -> None:
    fake = iam(TOKEN)
    with pytest.raises(IdentityRefused, match="nobody signed in"):
        asyncio.run(
            _provider([0.0]).oauth_token(
                "github", ["read:user"], context={"agent_id": "a"}
            )
        )
    monkeypatch.delenv("DATALAYER_USER_UID")
    with pytest.raises(IdentityRefused, match="assigned to nobody"):
        asyncio.run(
            _provider([0.0]).oauth_token("github", ["read:user"], context=CONTEXT)
        )
    assert fake.seen == []


def test_the_tool_on_a_pod_shows_the_consent_in_the_stream_then_lists(
    iam, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The github-repositories tool, unconnected: the AG-UI consent event, then the list."""
    iam(httpx.Response(409, json=NOT_CONNECTED), TOKEN)
    provider = _provider([0.0])
    monkeypatch.setattr(identity, "active_provider", lambda platform=None: provider)

    def github_api(request: httpx.Request) -> httpx.Response:
        assert request.headers["authorization"] == "Bearer gho_person"
        if request.url.path == "/user":
            return httpx.Response(200, json={"login": "octo"})
        return httpx.Response(200, json=[{"full_name": "octo/one", "private": False}])

    monkeypatch.setattr(
        github_tool,
        "_client",
        lambda: REAL_CLIENT(transport=httpx.MockTransport(github_api)),
    )

    async def chunks() -> AsyncIterator[bytes]:
        yield b'data: {"type":"RUN_STARTED"}\n\n'
        result = await github_tool.github_repositories()
        yield f"data: {json.dumps({'type': 'TOOL_CALL_RESULT', 'content': result})}\n\n".encode()

    async def read() -> list[dict[str, Any]]:
        seen: list[dict[str, Any]] = []
        async for chunk in stream_with_authorizations(chunks(), CONTEXT):
            for line in chunk.decode().splitlines():
                if line.startswith("data: "):
                    seen.append(json.loads(line[len("data: ") :]))
        return seen

    seen = asyncio.run(read())
    assert [e["type"] for e in seen] == ["RUN_STARTED", "CUSTOM", "TOOL_CALL_RESULT"]
    assert seen[1]["name"] == "identity.authorization_required"
    assert seen[1]["value"]["provider"] == "github"
    assert seen[1]["value"]["url"] == START
    assert seen[1]["value"]["agent"] == "researcher"
    assert seen[2]["content"]["login"] == "octo"
    assert seen[2]["content"]["repositories"][0]["full_name"] == "octo/one"
