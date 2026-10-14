# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PACT 1.0 at a local Provider: both profiles (AGENT_PROTOCOLS PR-11 to PR-13, PR-53)."""

from __future__ import annotations

import json

import httpx
import pytest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.egress import client_fetch
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
        metadata=client_fetch(http),
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


# --- a Brand a host answers for (PR-13: an application as a PACT business) ---------------


class _Says:
    """A Brand's agent that says what it was asked, and for whom."""

    def __init__(self) -> None:
        self.turns: list = []

    async def answer(self, turn):
        from agent_runtimes.protocols.pact.provider import BrandAnswer

        self.turns.append(turn)
        if "change" in turn.text and "trips:change" not in turn.scopes:
            return BrandAnswer("I need your permission.", missing=("trips:change",))
        return BrandAnswer(
            f"Answered for {turn.person or 'nobody'}.",
            scopes_used=turn.scopes,
            actions=({"tool": "answer"},),
        )


def _brand(scopes: dict[str, str] | None = None):
    from agent_runtimes.protocols.pact.provider import (
        InMemoryBrandStore,
        PactBrand,
        RegisteredIssuers,
    )

    # The Provider's key elsewhere (Vault transit in Datalayer): only its signer and its keys here.
    key = LocalSigner.generate("ecdsa-p256-sha256")
    published = {"keys": [{**key.public_jwk, "alg": "ES256", "use": "sig"}]}

    async def jwks():
        return published

    signer = LocalSigner.generate("ecdsa-p256-sha256")
    issuers = RegisteredIssuers(
        {ISSUER: {"keys": [{**signer.public_jwk, "alg": "ES256", "use": "sig"}]}}
    )
    said = _Says()
    brand = PactBrand(
        base="https://desk.apps.example",
        brand_id="desk",
        name="Trip Desk",
        provider=("Datalayer", "https://datalayer.ai"),
        scopes=scopes
        if scopes is not None
        else {"trips:read": "See your trips", "trips:change": "Change a trip"},
        audience="https://desk.apps.example/a2a/desk",
        signer=key,
        jwks=jwks,
        issuers=issuers,
        store=InMemoryBrandStore(),
        agent=said,
        verification_uri="https://studio.example/pact/device?slug=desk",
        description="Trip Desk, answering for Ada Lovelace.",
    )
    platform = build_protocols_reactor()
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=brand.app()), base_url=brand.base
    )

    def agent_with(issuer: str, key_of_agent):
        return PactPersonalAgent(
            card_url=f"{brand.interface_url}/.well-known/agent-card.json",
            issuer=issuer,
            audience=brand.audience,
            signer=key_of_agent,
            delegations=delegation_store_of(platform),
            receipts=receipt_store_of(platform),
            http=http,
            metadata=client_fetch(http),
        )

    return brand, said, platform, agent_with(ISSUER, signer), agent_with


@pytest.mark.asyncio
async def test_a_brand_names_its_provider_and_accepts_its_registered_issuers_only():
    brand, said, _, agent, agent_with = _brand()
    card = read_card(brand.card())
    assert card.interface_url == "https://desk.apps.example/a2a/desk"
    assert brand.card()["provider"] == {
        "organization": "Datalayer",
        "url": "https://datalayer.ai",
    }
    assert brand.card()["description"] == "Trip Desk, answering for Ada Lovelace."
    assert [scope.id for scope in card.delegation.scopes] == [
        "trips:read",
        "trips:change",
    ]
    reply = await agent.send(USER, "Hello")
    assert isinstance(reply, Reply) and reply.text == "Answered for nobody."
    [turn] = said.turns
    assert (turn.issuer, turn.subject, turn.person, turn.scopes) == (
        ISSUER,
        USER,
        None,
        (),
    )
    # An issuer nobody registered is refused before its agent is asked.
    stranger = agent_with(
        "https://stranger.example", LocalSigner.generate("ecdsa-p256-sha256")
    )
    with pytest.raises(PactError):
        await stranger.send(USER, "Hello")
    assert len(said.turns) == 1


@pytest.mark.asyncio
async def test_a_brand_delegates_through_its_page_and_signs_each_receipt():
    brand, said, platform, agent, _ = _brand()
    sign_in = await agent.request_sign_in(USER, ["trips:read", "trips:change"])
    assert sign_in.verification_uri.startswith(
        "https://studio.example/pact/device?slug=desk&user_code="
    )
    # What the page shows before the person decides; then they grant one of the two.
    assert await brand.asked(sign_in.user_code) == {
        "personal_agent": ISSUER,
        "scopes": [
            {"id": "trips:read", "description": "See your trips"},
            {"id": "trips:change", "description": "Change a trip"},
        ],
    }
    assert await brand.approve(sign_in.user_code, "ada", ["trips:read"]) == (
        "trips:read",
    )
    with pytest.raises(KeyError):
        await brand.approve(sign_in.user_code, "ada", ["trips:read"])
    with pytest.raises(KeyError):
        await brand.approve("NOPE-0000", "ada", ["trips:read"])
    assert await agent.finish_sign_in(USER, sign_in, interval=0) == ("trips:read",)
    reply = await agent.send(USER, "Where am I going?")
    assert isinstance(reply, Reply) and reply.text == "Answered for ada."
    assert said.turns[-1].scopes == ("trips:read",) and said.turns[-1].grant_id
    step = await agent.send(USER, "Please change it", context_id=reply.context_id)
    assert isinstance(step, StepUp) and step.missing == ("trips:change",)
    assert (
        step.verification_uri
        == "https://studio.example/pact/device?slug=desk&scopes=trips:change"
    )
    # Every answer under the delegation carries a receipt its Provider's key signs (verified by the agent).
    [(_, user, claims)] = receipt_store_of(platform).receipts
    assert user == USER and claims["user"] == "ada" and claims["pa"] == ISSUER
    assert claims["brand"] == brand.interface_url and claims["scopesUsed"] == [
        "trips:read"
    ]


def test_a_brand_with_no_scopes_answers_personal_agents_alone():
    brand, *_ = _brand(scopes={})
    card = read_card(brand.card())
    assert card.delegation is None and card.profile == "identity"
    assert "userDelegation" not in brand.card()["securitySchemes"]


def test_a_brand_signs_es256_only():
    from agent_runtimes.protocols.pact.provider import PactBrand

    with pytest.raises(ValueError, match="ES256"):
        PactBrand(
            base="https://x.example",
            brand_id="x",
            name="X",
            provider=("D", "https://d.example"),
            scopes={},
            audience="a",
            signer=LocalSigner.generate("ed25519"),
            jwks=None,
            issuers=None,
            store=None,
            agent=None,
            verification_uri="https://d.example/v",
        )
