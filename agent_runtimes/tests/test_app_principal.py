# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A deployment's agent acts as its application's principal (LOOP I-03).

Its token is asked of ai-agents with the token of whoever opens the session,
kept by deployment and asked for again before it runs out; the agent calls
ai-inference and writes its record with it and with nothing else, and without
it calls nothing.
"""

from __future__ import annotations

import asyncio
import time

import httpx
import pytest

from agent_runtimes.loop.apps import principal
from agent_runtimes.loop.apps.principal import (
    PrincipalTokenMissing,
    api_key_for,
    ensure_principal_token,
    forget_principal_token,
    give_principal_token,
    principal_token,
    principal_token_refusal,
)
from agent_runtimes.models.models import resolve_model_for_inference_provider
from agent_runtimes.models.offered import InferenceTokenMissing, give_inference_token


@pytest.fixture(autouse=True)
def asked():
    calls: list[tuple[str, str]] = []

    async def ask(deployment_uid: str, bearer: str) -> dict:
        calls.append((deployment_uid, bearer))
        if bearer == "nobody":
            raise PrincipalTokenMissing(
                "ai-agents gave deployment dep-1 no principal's token (404)."
            )
        return {
            "access_token": f"narrowed-{len(calls)}",
            "expires_in": 3600,
            "principal_uid": "p-1",
        }

    principal.use_asker(ask)
    forget_principal_token("dep-1")
    yield calls
    principal.use_asker(None)
    forget_principal_token("dep-1")


def test_its_token_is_asked_with_the_openers_and_kept(asked):
    assert asyncio.run(ensure_principal_token("dep-1", "owner")) == "narrowed-1"
    # Kept: the next request does not ask again.
    assert asyncio.run(ensure_principal_token("dep-1", "owner")) == "narrowed-1"
    assert asked == [("dep-1", "owner")]
    assert principal_token("dep-1") == "narrowed-1"


def test_without_one_it_is_not_made_and_says_why(asked):
    with pytest.raises(PrincipalTokenMissing, match="nobody's name"):
        asyncio.run(ensure_principal_token("dep-1", None))
    with pytest.raises(PrincipalTokenMissing, match="404"):
        asyncio.run(ensure_principal_token("dep-1", "nobody"))


def test_it_is_asked_again_before_it_runs_out(asked):
    give_principal_token("dep-1", "old", expires_in=60)
    assert asyncio.run(ensure_principal_token("dep-1", "owner")) == "narrowed-1"
    # Refused while the old one still holds: kept until it runs out.
    give_principal_token("dep-1", "old", expires_in=60)
    assert asyncio.run(ensure_principal_token("dep-1", "nobody")) == "old"


def test_expired_it_calls_nothing(asked):
    give_principal_token("dep-1", "old", expires_in=0)
    principal._HELD["dep-1"]["expires_at"] = time.time() - 1
    assert principal_token("dep-1") is None
    assert "expired" in (principal_token_refusal("dep-1") or "")
    with pytest.raises(PrincipalTokenMissing, match="expired"):
        asyncio.run(ensure_principal_token("dep-1", None))
    with pytest.raises(InferenceTokenMissing, match="expired"):
        asyncio.run(api_key_for("dep-1")())


def test_its_model_calls_never_use_the_runtimes_token(monkeypatch):
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://inference.example")
    give_inference_token("the-runtime-token")
    model = resolve_model_for_inference_provider(
        "bedrock:x",
        "datalayer",
        app_instance={"app_uid": "app-1", "deployment_uid": "dep-1"},
    )
    model.client._client._transport = httpx.MockTransport(
        lambda request: httpx.Response(500)
    )
    # No principal's token: the call is not made, with the runtime's or any other.
    with pytest.raises(InferenceTokenMissing, match="nobody's name"):
        asyncio.run(
            model.client.chat.completions.create(
                model="bedrock:x", messages=[{"role": "user", "content": "hi"}]
            )
        )


def test_a_preview_calls_with_the_runtimes_token(monkeypatch):
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://inference.example")
    give_inference_token("the-runtime-token")
    seen: list[httpx.Request] = []
    model = resolve_model_for_inference_provider(
        "bedrock:x", "datalayer", app_instance={"app_uid": "app-1"}
    )

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(500)

    model.client._client._transport = httpx.MockTransport(answer)
    with pytest.raises(Exception):
        asyncio.run(
            model.client.with_options(max_retries=0).chat.completions.create(
                model="bedrock:x", messages=[{"role": "user", "content": "hi"}]
            )
        )
    assert seen[0].headers["authorization"] == "Bearer the-runtime-token"


def test_its_record_is_written_as_the_principal(monkeypatch):
    from agent_runtimes.loop.apps import record

    sent: list[httpx.Request] = []
    real = httpx.AsyncClient

    def client(**kwargs):
        def answer(request: httpx.Request) -> httpx.Response:
            sent.append(request)
            return httpx.Response(200, json={"success": True})

        return real(transport=httpx.MockTransport(answer), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client)
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "the-launchers-token")
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://ai-agents.example")
    body = {
        "app_uid": "app-1",
        "deployment_uid": "dep-1",
        "session_uid": "s",
        "entries": [],
    }
    with pytest.raises(record.RecordNotSent, match="nobody's name"):
        asyncio.run(record.send_to_ai_agents(body))
    give_principal_token("dep-1", "narrowed", expires_in=3600)
    asyncio.run(record.send_to_ai_agents(body))
    assert sent[0].headers["authorization"] == "Bearer narrowed"


def test_a_deployments_agent_is_not_made_without_its_principals_token():
    from fastapi import HTTPException

    from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
    from agent_runtimes.tests.test_agents_create_integration import _DummyRequest

    request = CreateAgentRequest(
        name="digest",
        transport="vercel-ai",
        app_spec={
            "schema": "loop.app/v1",
            "id": "digest",
            "name": "Digest",
            "kind": "worker",
            "agent": "cog-crawler:0.0.1",
            "goal": "A digest of the week's news.",
            "triggers": [
                {"type": "schedule", "cron": "0 9 * * 1", "prompt": "Write it."}
            ],
        },
        app_instance={"app_uid": "app-1", "deployment_uid": "dep-1", "version": 3},
    )
    # Nobody's token on the request, none held: refused, in a sentence.
    with pytest.raises(HTTPException) as refused:
        asyncio.run(create_agent(request, _DummyRequest()))
    assert refused.value.status_code == 422
    assert "nobody's name" in str(refused.value.detail)


def test_its_keeper_renews_it_whatever_is_held(asked):
    """A kept deployment asked only over A2A is renewed by ai-agents (STUDIO A-08)."""
    from agent_runtimes.loop.apps.principal import renew_principal_token

    # Its agent made an hour ago: the token still holds, and is asked again anyway.
    give_principal_token("dep-1", "old", expires_in=1800, principal_uid="p-1")
    expires_at = asyncio.run(renew_principal_token("dep-1", "owner-key"))
    assert principal_token("dep-1") == "narrowed-1"
    assert expires_at > time.time() + 3500
    assert asked == [("dep-1", "owner-key")]
    # Refused: what is held is left as it is.
    with pytest.raises(PrincipalTokenMissing, match="404"):
        asyncio.run(renew_principal_token("dep-1", "nobody"))
    assert principal_token("dep-1") == "narrowed-1"


def test_no_agent_here_serves_it_nothing_is_asked(asked):
    from agent_runtimes.loop.apps.principal import renew_principal_token

    with pytest.raises(PrincipalTokenMissing, match="No agent on this runtime"):
        asyncio.run(renew_principal_token("dep-1", "owner-key"))
    assert asked == []


def test_the_route_renews_it_with_the_key_it_is_sent(asked):
    """`POST /api/v1/apps/principal`: the owner's key renews it; no agent here, 404; refused, 502."""
    from fastapi import HTTPException
    from starlette.requests import Request

    from agent_runtimes.loop.apps.callers import LOCAL
    from agent_runtimes.routes import apps as apps_routes

    def request(bearer: str) -> Request:
        headers = [(b"authorization", f"Bearer {bearer}".encode())] if bearer else []
        return Request(
            {"type": "http", "method": "POST", "path": "/", "headers": headers}
        )

    authorized = apps_routes.Authorized(LOCAL, None)
    body = apps_routes.RenewPrincipalRequest(deployment="dep-1")
    with pytest.raises(HTTPException) as unserved:
        asyncio.run(apps_routes.renew_principal(body, request("owner-key"), authorized))
    assert unserved.value.status_code == 404 and asked == []
    give_principal_token("dep-1", "old", expires_in=0)
    said = asyncio.run(
        apps_routes.renew_principal(body, request("owner-key"), authorized)
    )
    assert said["deployment"] == "dep-1" and principal_token("dep-1") == "narrowed-1"
    with pytest.raises(HTTPException) as refused:
        asyncio.run(apps_routes.renew_principal(body, request("nobody"), authorized))
    assert refused.value.status_code == 502
    with pytest.raises(HTTPException) as keyless:
        asyncio.run(apps_routes.renew_principal(body, request(""), authorized))
    assert keyless.value.status_code == 401
