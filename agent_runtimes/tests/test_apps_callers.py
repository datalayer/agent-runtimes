# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Who may call an application's routes (LOOP R-32)."""

from __future__ import annotations

import asyncio
import time
from typing import Any, List

import jwt
import pytest
from fastapi.testclient import TestClient
from reactor import ContributionRegistry

from agent_runtimes.loop.apps import callers, plugins
from agent_runtimes.loop.apps.callers import (
    APP_EMBED_AUDIENCE,
    CallerRefused,
    CallerVerifier,
    bearer_of,
    is_loopback,
    origin_allowed,
)
from agent_runtimes.routes import apps as routes

pytest.importorskip("agentspecs.apps")

# Signed with a key the runtime never has: it asks the platform instead.
SECRET = "a-secret-only-the-platform-holds-long-enough"


def token(**claims: Any) -> str:
    return jwt.encode(
        {"exp": int(time.time()) + 3600, **claims}, SECRET, algorithm="HS256"
    )


class Platform:
    """IAM and Spacer, as the runtime sees them: an answer per address."""

    def __init__(self, status: int = 200):
        self.status = status
        self.asked: List[str] = []

    async def __call__(self, url: str, bearer: str) -> int:
        self.asked.append(url)
        return self.status


@pytest.fixture(autouse=True)
def platform_urls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATALAYER_IAM_URL", "http://iam")
    monkeypatch.setenv("DATALAYER_SPACER_URL", "http://spacer")
    monkeypatch.delenv("DATALAYER_UI_URL", raising=False)
    monkeypatch.delenv("DATALAYER_RUN_URL", raising=False)


def test_a_person_is_whom_iam_accepts_and_is_asked_once() -> None:
    platform = Platform()
    verifier = CallerVerifier(fetch=platform)
    person = token(sub="u1")
    caller = asyncio.run(verifier.verify(person))
    assert (caller.kind, caller.uid) == ("person", "u1")
    asyncio.run(verifier.verify(person))
    assert platform.asked == ["http://iam/api/iam/v1/whoami"]


def test_an_embed_token_is_whom_spacer_accepts_for_its_application() -> None:
    platform = Platform()
    verifier = CallerVerifier(fetch=platform)
    embed = token(sub="owner", aud=APP_EMBED_AUDIENCE, app_uid="web-research")
    caller = asyncio.run(verifier.verify(embed, "web-research"))
    assert (caller.kind, caller.app_uid) == ("embed", "web-research")
    assert platform.asked == ["http://spacer/api/spacer/v1/apps/web-research/embedded"]
    with pytest.raises(CallerRefused, match="another application"):
        asyncio.run(verifier.verify(embed, "inbox-triage"))


def test_what_the_platform_refuses_or_cannot_say_is_refused() -> None:
    with pytest.raises(CallerRefused) as refused:
        asyncio.run(CallerVerifier(fetch=Platform(401)).verify(token(sub="u1")))
    assert refused.value.status == 401
    with pytest.raises(CallerRefused) as unavailable:
        asyncio.run(CallerVerifier(fetch=Platform(500)).verify(token(sub="u1")))
    assert unavailable.value.status == 503
    with pytest.raises(CallerRefused, match="expired"):
        asyncio.run(CallerVerifier(fetch=Platform()).verify(token(sub="u1", exp=1)))
    with pytest.raises(CallerRefused, match="not one this platform issues"):
        asyncio.run(CallerVerifier(fetch=Platform()).verify("not-a-token"))


def test_a_runtime_that_does_not_know_iam_refuses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATALAYER_IAM_URL")
    with pytest.raises(CallerRefused) as refused:
        asyncio.run(CallerVerifier(fetch=Platform()).verify(token(sub="u1")))
    assert refused.value.status == 503


def test_a_verified_token_is_trusted_for_minutes_not_for_its_life() -> None:
    platform = Platform()
    clock = [0.0]
    verifier = CallerVerifier(fetch=platform, clock=lambda: clock[0])
    person = token(sub="u1")
    asyncio.run(verifier.verify(person))
    clock[0] = callers.CACHE_SECONDS + 1
    asyncio.run(verifier.verify(person))
    assert len(platform.asked) == 2


def test_the_small_rules() -> None:
    assert is_loopback("127.0.0.1") and is_loopback("::1") and is_loopback("localhost")
    assert (
        not is_loopback("10.0.0.4")
        and not is_loopback("testclient")
        and not is_loopback(None)
    )
    assert (
        bearer_of("Bearer abc ") == "abc"
        and bearer_of("Basic abc") == ""
        and bearer_of(None) == ""
    )
    assert origin_allowed(None, ("https://a.example",))
    assert origin_allowed("https://b.example", ())
    assert origin_allowed("https://a.example/", ("https://a.example",))
    assert not origin_allowed("https://b.example", ("https://a.example",))


WEB_RESEARCH = {
    "schema": "loop.app/v1",
    "id": "web-research",
    "name": "Web research",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "emoji": "\U0001f50e",
    "connections": [{"server": "tavily:0.0.1"}],
}


@pytest.fixture
def remote(monkeypatch: pytest.MonkeyPatch) -> Any:
    """The runtime's routes, called from elsewhere, with a fake platform."""
    from agent_runtimes.app import create_app

    platform = Platform()
    monkeypatch.setattr(callers, "VERIFIER", CallerVerifier(fetch=platform))
    monkeypatch.setattr(routes, "VERIFIER", callers.VERIFIER)
    monkeypatch.setattr(plugins, "REGISTRY", ContributionRegistry())
    routes._RUNNING.clear()
    with TestClient(create_app(), client=("10.0.0.4", 50000)) as client:
        client.platform = platform
        yield client
    routes._RUNNING.clear()


def run(app: dict) -> None:
    from agent_runtimes.loop.apps.loading import load_app

    loaded = load_app(app)
    plugins.register_app(loaded)
    routes._RUNNING["default"] = loaded.id


def test_a_remote_call_without_a_token_is_refused(remote: Any) -> None:
    run(WEB_RESEARCH)
    for method, path in (
        ("post", "/api/v1/apps/configure"),
        ("get", "/api/v1/apps"),
        ("get", "/api/v1/apps/current"),
    ):
        response = getattr(remote, method)(
            path, **({"json": {"app": WEB_RESEARCH}} if method == "post" else {})
        )
        assert response.status_code == 401, path
    assert remote.platform.asked == []


def test_a_person_reads_and_an_embed_cannot_configure(remote: Any) -> None:
    run(WEB_RESEARCH)
    person = {"Authorization": f"Bearer {token(sub='u1')}"}
    assert (
        remote.get("/api/v1/apps/current", headers=person).json()["id"]
        == "web-research"
    )
    embed = {
        "Authorization": f"Bearer {token(sub='u1', aud=APP_EMBED_AUDIENCE, app_uid='web-research')}"
    }
    assert (
        remote.post(
            "/api/v1/apps/decide", headers=embed, json={"tool": "tavily_search"}
        ).status_code
        == 200
    )
    assert (
        remote.post(
            "/api/v1/apps/configure", headers=embed, json={"app": WEB_RESEARCH}
        ).status_code
        == 403
    )


def test_a_public_application_answers_anybody_from_the_origins_it_allows(
    remote: Any,
) -> None:
    run(
        {
            **WEB_RESEARCH,
            "deployment": {
                "hosted": {"visibility": "public"},
                "embedded": {"origins": ["https://shop.example"]},
            },
        }
    )
    assert remote.get("/api/v1/apps/current").status_code == 200
    assert (
        remote.get(
            "/api/v1/apps/current", headers={"Origin": "https://shop.example"}
        ).status_code
        == 200
    )
    assert (
        remote.get(
            "/api/v1/apps/current", headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    # Public is for using it, never for configuring the runtime.
    assert (
        remote.post("/api/v1/apps/configure", json={"app": WEB_RESEARCH}).status_code
        == 401
    )
