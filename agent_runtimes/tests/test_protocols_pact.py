# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PACT 1.0 at a local Provider: both profiles (AGENT_PROTOCOLS PR-11 to PR-13, PR-53)."""

from __future__ import annotations

import json

import httpx
import pytest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.pact import (
    PactCardError,
    PactError,
    PactPersonalAgent,
    Reply,
    StepUp,
    read_card,
    sign_personal_agent_jwt,
    verify_personal_agent_jwt,
)
from agent_runtimes.protocols.pact.plugin import (
    delegation_store_of,
    profile_of,
    receipt_store_of,
)
from agent_runtimes.protocols.pact.provider import ExampleAir
from agent_runtimes.protocols.web_bot_auth import LocalSigner

ISSUER = "https://pa.example"
USER = "user-7f3a"


def _setup(register: bool = True):
    provider = ExampleAir()
    signer = LocalSigner.generate("ecdsa-p256-sha256")
    if register:
        provider.register(
            ISSUER, {"keys": [{**signer.public_jwk, "alg": "ES256", "use": "sig"}]}
        )
    platform = build_protocols_reactor()
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=provider.app()), base_url=provider.base
    )
    agent = PactPersonalAgent(
        card_url=f"{provider.interface_url}/.well-known/agent-card.json",
        issuer=ISSUER,
        audience=provider.audience,
        signer=signer,
        delegations=delegation_store_of(platform),
        receipts=receipt_store_of(platform),
        http=http,
    )
    return provider, signer, platform, agent


def test_the_card_as_pact_reads_it():
    provider = ExampleAir()
    card = read_card(provider.card())
    assert card.interface_url == provider.interface_url
    assert (card.identity_scheme, card.profile) == ("paJwt", "delegated")
    assert {s.id: s.action_class for s in card.delegation.scopes} == {
        "bookings:read": "read",
        "bookings:change": "write",
    }
    identity_only = {
        **provider.card(),
        "securityRequirements": [{"schemes": {"paJwt": {"list": []}}}],
    }
    assert read_card(identity_only).profile == "identity"
    with pytest.raises(PactCardError, match="HTTP\\+JSON"):
        read_card({**provider.card(), "supportedInterfaces": []})
    with pytest.raises(PactCardError, match="JWT alone"):
        read_card({**provider.card(), "securityRequirements": []})


@pytest.mark.asyncio
async def test_the_personal_agent_jwt():
    signer = LocalSigner.generate("ecdsa-p256-sha256")
    token = await sign_personal_agent_jwt(
        signer, issuer=ISSUER, subject=USER, audience="https://p.example/a2a"
    )
    jwks = {"keys": [signer.public_jwk]}
    claims = verify_personal_agent_jwt(
        token, issuer=ISSUER, audience="https://p.example/a2a", jwks=jwks
    )
    assert claims["sub"] == USER and claims["exp"] - claims["iat"] == 120
    with pytest.raises(PermissionError):
        verify_personal_agent_jwt(
            token, issuer=ISSUER, audience="https://other.example", jwks=jwks
        )
    with pytest.raises(ValueError, match="opaque"):
        await sign_personal_agent_jwt(
            signer, issuer=ISSUER, subject="ana@example.com", audience="a"
        )
    with pytest.raises(ValueError, match="ES256"):
        await sign_personal_agent_jwt(
            LocalSigner.generate(), issuer=ISSUER, subject=USER, audience="a"
        )


@pytest.mark.asyncio
async def test_identity_a_conversation_and_a_retry():
    _, _, _, agent = _setup()
    first = await agent.send(USER, "Hello, about my trip")
    assert isinstance(first, Reply) and "booking reference" in first.text
    second = await agent.send(
        USER, "AB123", context_id=first.context_id, message_id="m-2"
    )
    again = await agent.send(
        USER, "AB123", context_id=first.context_id, message_id="m-2"
    )
    assert second == again
    _, _, _, stranger = _setup(register=False)
    with pytest.raises(PactError, match="refused"):
        await stranger.send(USER, "Hello")


@pytest.mark.asyncio
async def test_delegated_the_person_grants_less_than_asked_then_steps_up():
    provider, _, platform, agent = _setup()
    sign_in = await agent.request_sign_in(USER, ["bookings:read", "bookings:change"])
    assert sign_in.verification_uri.startswith("https://air.example/login")
    assert "dc_" not in repr(sign_in)
    # At the Brand, the person signs in and unticks the change.
    provider.approve(sign_in.user_code, "jane-4471", ["bookings:read"])
    granted = await agent.finish_sign_in(USER, sign_in, interval=0)
    assert granted == ("bookings:read",)
    reply = await agent.send(USER, "When is my booking?")
    assert isinstance(reply, Reply) and reply.scopes_used == ("bookings:read",)
    step = await agent.send(
        USER, "Please change my flight", context_id=reply.context_id
    )
    assert isinstance(step, StepUp) and step.missing == ("bookings:change",)
    more = await agent.request_sign_in(USER, list(step.missing))
    provider.approve(more.user_code, "jane-4471", ["bookings:change"])
    await agent.finish_sign_in(USER, more, interval=0)
    changed = await agent.send(
        USER, "Please change my flight", context_id=reply.context_id
    )
    assert isinstance(changed, Reply) and changed.actions == (
        "lookup_booking",
        "change_booking",
    )
    kept = receipt_store_of(platform).receipts
    assert [r[2]["scopesUsed"] for r in kept] == [
        ["bookings:read"],
        ["bookings:read", "bookings:change"],
    ]
    assert profile_of(platform) == "delegated"


@pytest.mark.asyncio
async def test_scopes_not_on_the_card_are_not_asked():
    _, _, _, agent = _setup()
    with pytest.raises(PactError, match="not on the card"):
        await agent.request_sign_in(USER, ["refunds:issue"])


@pytest.mark.asyncio
async def test_no_token_reaches_what_an_agent_sees():
    """PR-53: the delegation token and the device code stay with the host."""
    provider, _, platform, agent = _setup()
    sign_in = await agent.request_sign_in(USER, ["bookings:read"])
    provider.approve(sign_in.user_code, "jane-4471", ["bookings:read"])
    await agent.finish_sign_in(USER, sign_in, interval=0)
    token, _ = await delegation_store_of(platform).get(agent.card.interface_url, USER)
    reply = await agent.send(USER, "When is my booking?")
    seen = json.dumps([repr(reply), repr(sign_in), repr(agent.card)], default=str)
    assert token not in seen
    await agent.disconnect(USER)
    assert (
        await delegation_store_of(platform).get(agent.card.interface_url, USER) is None
    )


def test_the_card_fixture_both_languages_read():
    """PR-51: the TypeScript reader is held to the same card and the same reading."""
    from pathlib import Path

    fixture = json.loads(
        (
            Path(__file__).parents[1] / "protocols" / "pact" / "fixtures" / "card.json"
        ).read_text()
    )
    card = read_card(fixture["card"])
    assert {
        "interfaceUrl": card.interface_url,
        "identityScheme": card.identity_scheme,
        "profile": card.profile,
        "scopes": {s.id: s.action_class for s in card.delegation.scopes},
    } == fixture["reads"]


@pytest.mark.asyncio
async def test_polling_once_says_pending_then_granted():
    provider, _, _, agent = _setup()
    sign_in = await agent.request_sign_in(USER, ["bookings:read"])
    assert await agent.poll_sign_in(USER, sign_in) is None
    provider.approve(sign_in.user_code, "jane-4471", ["bookings:read"])
    assert await agent.poll_sign_in(USER, sign_in) == ("bookings:read",)
    with pytest.raises(PactError, match="no sign-in pending"):
        await agent.poll_sign_in(USER, sign_in)
