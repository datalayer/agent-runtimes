# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A consent on AgentCore comes back to Datalayer IAM's binding page with a
state IAM issued to the person: asked once per invocation token and runtime
while it stands, with that token (AgentCore binds a consent to it alone),
forgotten once used, refused in a sentence without IAM in the path."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

from agent_runtimes.agentcore.exchange import TokenExchange, use_exchange
from agent_runtimes.agentcore.identity import use_invocation_token
from agent_runtimes.identity import consent as consent_module
from agent_runtimes.plugins.points import IdentityRefused

IAM = "https://iam.example"
RUNTIME = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/marketer-AbC"


#: The token the invocation carried: what AgentCore made the workload token from.
CARRIED = "invocation-rs256"


@pytest.fixture(autouse=True)
def fresh() -> Any:
    consent_module.forget_states()
    with use_invocation_token(CARRIED):
        yield
    consent_module.forget_states()
    use_exchange(None)


def _iam(answers: list[httpx.Response], seen: list[httpx.Request]) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return answers.pop(0)

    return lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_iam_s_page_and_a_state_asked_with_the_person_s_token() -> None:
    use_exchange(TokenExchange(IAM, RUNTIME))
    seen: list[httpx.Request] = []
    client = _iam([httpx.Response(200, json={"state": "s-1", "expires_in": 600})], seen)

    got = asyncio.run(
        consent_module.consent_for({"bearer": "platform-jwt"}, client=client)
    )

    assert got == consent_module.Consent(
        f"{IAM}/api/iam/v1/identity/agentcore/bind", "s-1"
    )
    [request] = seen
    assert str(request.url) == f"{IAM}/api/iam/v1/identity/agentcore/bind/nonce"
    assert request.headers["authorization"] == "Bearer platform-jwt"
    assert json.loads(request.content) == {"resource": RUNTIME, "user_token": CARRIED}


def test_a_state_not_used_is_given_again_until_it_nearly_expires() -> None:
    use_exchange(TokenExchange(IAM, RUNTIME))
    seen: list[httpx.Request] = []
    client = _iam(
        [
            httpx.Response(200, json={"state": "s-1", "expires_in": 600}),
            httpx.Response(200, json={"state": "s-2", "expires_in": 600}),
        ],
        seen,
    )
    now = [1000.0]

    def ask() -> consent_module.Consent:
        return asyncio.run(
            consent_module.consent_for(
                {"bearer": "platform-jwt"}, client=client, clock=lambda: now[0]
            )
        )

    first = ask()
    again = ask()
    now[0] += 545
    later = ask()

    assert (first.custom_state, again.custom_state, later.custom_state) == (
        "s-1",
        "s-1",
        "s-2",
    )
    assert len(seen) == 2


def test_a_used_state_is_forgotten() -> None:
    use_exchange(TokenExchange(IAM, RUNTIME))
    seen: list[httpx.Request] = []
    client = _iam(
        [
            httpx.Response(200, json={"state": "s-1", "expires_in": 600}),
            httpx.Response(200, json={"state": "s-2", "expires_in": 600}),
        ],
        seen,
    )
    context = {"bearer": "platform-jwt"}

    first = asyncio.run(consent_module.consent_for(context, client=client))
    consent_module.used(context, first)
    second = asyncio.run(consent_module.consent_for(context, client=client))

    assert (first.custom_state, second.custom_state) == ("s-1", "s-2")


def test_iam_refusing_is_said_in_a_sentence() -> None:
    use_exchange(TokenExchange(IAM, RUNTIME))
    client = _iam(
        [
            httpx.Response(
                409,
                json={"detail": "This runtime trusts the organization's own provider."},
            )
        ],
        [],
    )

    with pytest.raises(IdentityRefused, match=r"\(409\): This runtime trusts"):
        asyncio.run(consent_module.consent_for({"bearer": "jwt"}, client=client))


def test_without_iam_in_the_path_or_a_person_it_is_refused() -> None:
    use_exchange(None)
    with pytest.raises(IdentityRefused, match="no Datalayer IAM in its path"):
        asyncio.run(consent_module.consent_for({"bearer": "jwt"}))
    use_exchange(TokenExchange(IAM, RUNTIME))
    with pytest.raises(IdentityRefused, match="No token of the person"):
        asyncio.run(consent_module.consent_for({}))


def test_without_the_invocation_s_token_it_is_refused() -> None:
    use_exchange(TokenExchange(IAM, RUNTIME))
    with use_invocation_token(""):
        with pytest.raises(IdentityRefused, match="carried no token"):
            asyncio.run(consent_module.consent_for({"bearer": "jwt"}))


def test_another_invocation_s_token_asks_a_state_of_its_own() -> None:
    use_exchange(TokenExchange(IAM, RUNTIME))
    seen: list[httpx.Request] = []
    client = _iam(
        [
            httpx.Response(200, json={"state": "s-1", "expires_in": 600}),
            httpx.Response(200, json={"state": "s-2", "expires_in": 600}),
        ],
        seen,
    )
    first = asyncio.run(consent_module.consent_for({"bearer": "jwt"}, client=client))
    with use_invocation_token("another-invocation"):
        second = asyncio.run(
            consent_module.consent_for({"bearer": "jwt"}, client=client)
        )

    assert (first.custom_state, second.custom_state) == ("s-1", "s-2")
    assert json.loads(seen[1].content)["user_token"] == "another-invocation"


def test_only_the_agentcore_provider_asks_for_a_consent(monkeypatch) -> None:
    from agent_runtimes import identity

    asked: list[Any] = []

    async def consent_for(context: Any) -> Any:
        asked.append(context)
        return consent_module.Consent("https://iam/bind", "s")

    monkeypatch.setattr(consent_module, "consent_for", consent_for)

    class Provider:
        def __init__(self, id: str) -> None:
            self.id = id
            self.given: dict[str, Any] = {}

        async def oauth_token(self, provider, scopes, flow, on_auth_url, **kw):
            self.given = kw
            return "token"

    agentcore, datalayer = Provider("agentcore"), Provider("datalayer")
    for chosen in (agentcore, datalayer):
        asyncio.run(
            identity.oauth_token(
                "github", scopes=["read:user"], identity=chosen, context={"bearer": "b"}
            )
        )
    asyncio.run(
        identity.oauth_token(
            "github", scopes=["read:user"], flow="M2M", identity=agentcore, context={}
        )
    )

    assert len(asked) == 1
    assert datalayer.given == {"context": {"bearer": "b"}}
    assert "custom_state" not in agentcore.given
