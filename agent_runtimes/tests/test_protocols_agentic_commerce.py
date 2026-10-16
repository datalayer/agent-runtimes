# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Agentic Commerce Protocol 2026-04-17 at the test seller (PR-40 to PR-43, PR-53)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
from reactor import PluginManifest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.agentic_commerce import (
    ACTION_CLASSES,
    AgenticCommerceClient,
    AgenticCommerceError,
    session_summary,
)
from agent_runtimes.protocols.agentic_commerce.merchant import (
    HANDLER_ID,
    TEST_BEARER,
    ExampleOutfitters,
)
from agent_runtimes.protocols.agentic_commerce.plugin import (
    APPROVERS,
    CREDENTIALS,
    DISCOUNT,
    PAYMENT_DATA,
    AgenticCommerceExtension,
    approver_of,
    credentials_of,
    declared_extensions,
    payment_data_of,
    proposal_store_of,
)
from agent_runtimes.protocols.commerce import CheckoutProposal
from agent_runtimes.protocols.egress import client_fetch

SELLER = "https://outfitters.example"
TOKEN = "spt_test_shared_payment_token"


@dataclass
class Person:
    answer: bool = True
    asked: list[CheckoutProposal] = field(default_factory=list)

    async def approve(self, proposal: CheckoutProposal) -> bool:
        self.asked.append(proposal)
        return self.answer


class Custody:
    async def bearer(self, seller: str) -> str:
        assert seller == "outfitters.example"
        return TEST_BEARER

    async def payment_data(
        self, proposal: CheckoutProposal, handlers: Any
    ) -> dict[str, Any]:
        assert [h["id"] for h in handlers] == [HANDLER_ID]
        return {
            "handler_id": HANDLER_ID,
            "instrument": {
                "type": "card",
                "credential": {"type": "spt", "token": TOKEN},
            },
        }


class Host:
    def __init__(self, person: Person, discount: bool = False) -> None:
        self.person, self.discount = person, discount

    def provide_contributions(self, contributions: Any) -> None:
        custody = Custody()
        contributions.contribute(
            APPROVERS, self.person, contribution_id="person", order=10
        )
        contributions.contribute(
            PAYMENT_DATA, custody, contribution_id="custody", order=10
        )
        contributions.contribute(
            CREDENTIALS, custody, contribution_id="custody", order=10
        )
        if self.discount:
            contributions.contribute(
                DISCOUNT, AgenticCommerceExtension("discount"), order=10
            )


def _platform(person: Person, discount: bool = False):
    return build_protocols_reactor(
        plugins=[(PluginManifest(name="host", version="1"), Host(person, discount))]
    )


def _client(seller: ExampleOutfitters, platform) -> AgenticCommerceClient:
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=seller.app()), base_url=SELLER
    )
    return AgenticCommerceClient(
        seller=SELLER,
        credentials=credentials_of(platform),
        extensions=declared_extensions(platform),
        http=http,
        # A local test seller: its discovery read over the client the test trusts (PI-13).
        metadata=client_fetch(http),
    )


async def _ready(client: AgenticCommerceClient) -> dict[str, Any]:
    session = await client.create_checkout([{"id": "jacket", "quantity": 1}], "usd")
    assert session["status"] == "not_ready_for_payment"
    assert session_summary(session)["messages"] == ["Buyer email is required"]
    session = await client.update_checkout(
        session["id"], {"buyer": {"email": "ana@example.com"}}
    )
    assert session["status"] == "ready_for_payment"
    return session


def test_never_named_acp():
    """PR-40: the Agent Client Protocol keeps `acp`; commerce is `agentic_commerce`."""
    import agent_runtimes.protocols as protocols

    root = Path(protocols.__file__).parent
    assert not (root / "acp").exists()
    assert (root / "agentic_commerce").is_dir()


@pytest.mark.asyncio
async def test_discovery():
    client = _client(ExampleOutfitters(), _platform(Person()))
    found = await client.discover()
    assert (found.api_base_url, found.versions, found.services) == (
        f"{SELLER}/acp",
        ("2026-04-17",),
        ("checkout",),
    )
    assert found.extensions == ("discount",)


@pytest.mark.asyncio
async def test_a_purchase_is_proposed_approved_and_made_once():
    seller, person = ExampleOutfitters(), Person()
    platform = _platform(person)
    client = _client(seller, platform)
    session = await _ready(client)
    proposal = await client.propose_completion(session["id"])
    assert (
        proposal.summary() == "Buy 1 × Rain jacket at outfitters.example for USD 139.32"
    )
    kwargs = dict(
        approver=approver_of(platform),
        payment=payment_data_of(platform),
        store=proposal_store_of(platform),
    )
    done = await client.complete(proposal, **kwargs)
    assert (
        done["status"] == "completed"
        and done["order"]["checkout_session_id"] == session["id"]
    )
    with pytest.raises(AgenticCommerceError, match="used already"):
        await client.complete(proposal, **kwargs)
    assert len(seller.orders) == 1 and person.asked == [proposal]


@pytest.mark.asyncio
async def test_nothing_is_bought_declined_or_changed():
    platform = _platform(Person())
    client = _client(ExampleOutfitters(), platform)
    session = await _ready(client)
    proposal = await client.propose_completion(session["id"])
    with pytest.raises(LookupError, match="no Agentic Commerce approver"):
        approver_of(build_protocols_reactor())
    with pytest.raises(AgenticCommerceError, match="did not approve"):
        await client.complete(
            proposal,
            approver=Person(answer=False),
            payment=Custody(),
            store=proposal_store_of(platform),
        )
    second = await client.propose_completion(session["id"])
    await client.update_checkout(
        session["id"], {"line_items": [{"id": "jacket", "quantity": 2}]}
    )
    with pytest.raises(AgenticCommerceError, match="changed since it was proposed"):
        await client.complete(
            second,
            approver=Person(),
            payment=Custody(),
            store=proposal_store_of(platform),
        )


@pytest.mark.asyncio
async def test_the_discount_extension_is_negotiated_from_what_is_contributed():
    plain = _client(ExampleOutfitters(), _platform(Person()))
    session = await plain.create_checkout([{"id": "socks", "quantity": 2}], "usd")
    assert session_summary(session)["extensions"] == []
    with_discount = _client(ExampleOutfitters(), _platform(Person(), discount=True))
    session = await with_discount.create_checkout(
        [{"id": "socks", "quantity": 2}], "usd"
    )
    assert session_summary(session)["extensions"] == ["discount"]
    session = await with_discount.update_checkout(
        session["id"],
        {"buyer": {"email": "ana@example.com"}, "discounts": {"codes": ["WELCOME10"]}},
    )
    assert session_summary(session)["totals"]["discount"] == 300


@pytest.mark.asyncio
async def test_the_seller_holds_the_protocol_to_its_headers():
    seller = ExampleOutfitters()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=seller.app()), base_url=SELLER
    ) as http:
        body = {
            "line_items": [{"id": "socks"}],
            "currency": "usd",
            "capabilities": {},
        }
        assert (await http.post("/acp/checkout_sessions", json=body)).status_code == 401
        headers = {
            "Authorization": f"Bearer {TEST_BEARER}",
            "API-Version": "2026-04-17",
        }
        assert (
            await http.post("/acp/checkout_sessions", json=body, headers=headers)
        ).status_code == 400
        headers["Idempotency-Key"] = "k1"
        first = await http.post("/acp/checkout_sessions", json=body, headers=headers)
        again = await http.post("/acp/checkout_sessions", json=body, headers=headers)
        assert first.status_code == 201 and again.json()["id"] == first.json()["id"]
        other = await http.post(
            "/acp/checkout_sessions", json={**body, "currency": "eur"}, headers=headers
        )
        assert other.status_code == 409


@pytest.mark.asyncio
async def test_no_token_reaches_what_an_agent_sees():
    """PR-53: the payment token and the bearer go to the seller, nowhere else."""
    platform = _platform(Person())
    client = _client(ExampleOutfitters(), platform)
    session = await _ready(client)
    proposal = await client.propose_completion(session["id"])
    done = await client.complete(
        proposal,
        approver=approver_of(platform),
        payment=payment_data_of(platform),
        store=proposal_store_of(platform),
    )
    for seen in (session_summary(done), proposal.summary(), repr(proposal)):
        text = json.dumps(seen, default=str)
        assert TOKEN not in text and TEST_BEARER not in text
    assert ACTION_CLASSES["complete"] == "buy"


def test_the_revision_fixture_both_languages_read():
    """PR-51: the TypeScript client computes the same digest from the same session."""
    from agent_runtimes.protocols.agentic_commerce import revision_of

    fixture = json.loads(
        (
            Path(__file__).parents[1]
            / "protocols"
            / "agentic_commerce"
            / "fixtures"
            / "session.json"
        ).read_text()
    )
    assert revision_of(fixture["session"]) == fixture["revision"]
