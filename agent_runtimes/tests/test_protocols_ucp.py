# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""UCP 2026-08-25: shop at the test merchant, buy once approved (AGENT_PROTOCOLS PR-30 to PR-32, PR-53)."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import httpx
import pytest
from reactor import PluginManifest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.egress import client_fetch
from agent_runtimes.protocols.ucp import (
    ACTION_CLASSES,
    CheckoutProposal,
    UcpClient,
    UcpError,
    checkout_summary,
    order_summary,
)
from agent_runtimes.protocols.ucp.merchant import TEST_HANDLER_ID, ExampleStore
from agent_runtimes.protocols.ucp.plugin import (
    APPROVERS,
    FULFILLMENT,
    PAYMENT_INSTRUMENTS,
    UcpExtension,
    approver_of,
    instruments_of,
    negotiate_capabilities,
    proposal_store_of,
)

STORE = "https://store.example"
AGENT_PROFILE = "https://agent.example/.well-known/ucp"
TOKEN = "tok_test_4242_never_shown"


@dataclass
class Person:
    """Approves what it was told to, and remembers what it was asked."""

    answer: bool = True
    asked: list[CheckoutProposal] = field(default_factory=list)

    async def approve(self, proposal: CheckoutProposal) -> bool:
        self.asked.append(proposal)
        return self.answer


class Custody:
    """The host's payment instrument; the token never leaves it but to the business."""

    async def instrument(
        self, proposal: CheckoutProposal, handlers: Any
    ) -> dict[str, Any]:
        assert "com.example.test_pay" in handlers
        return {
            "id": "pi_1",
            "handler_id": TEST_HANDLER_ID,
            "type": "card",
            "selected": True,
            "credential": {"type": "PAYMENT_GATEWAY", "token": TOKEN},
        }


class Host:
    def __init__(self, person: Person) -> None:
        self.person = person

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            APPROVERS, self.person, contribution_id="person", order=10
        )
        contributions.contribute(
            PAYMENT_INSTRUMENTS, Custody(), contribution_id="custody", order=10
        )


def _client(store: ExampleStore) -> UcpClient:
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=store.app()), base_url=STORE
    )
    # A local test merchant: its profile read over the client the test trusts (PI-13).
    return UcpClient(
        business=STORE,
        agent_profile=AGENT_PROFILE,
        http=http,
        metadata=client_fetch(http),
    )


async def _ready(client: UcpClient) -> dict[str, Any]:
    [product] = await client.search("sencha")
    checkout = await client.create_checkout([{"id": product["id"], "quantity": 2}])
    assert checkout["status"] == "incomplete"
    assert checkout_summary(checkout)["messages"] == ["Buyer email is required"]
    checkout = await client.update_checkout(
        checkout["id"], {"buyer": {"email": "ana@example.com"}}
    )
    assert checkout["status"] == "ready_for_complete"
    return checkout


@pytest.mark.asyncio
async def test_discovery_reads_the_profile():
    client = _client(ExampleStore())
    profile = await client.discover()
    assert (profile.version, profile.endpoint) == ("2026-08-25", f"{STORE}/ucp/v1")
    assert profile.capabilities == ("dev.ucp.shopping.checkout",)
    assert profile.payment_handlers == ("com.example.test_pay",)


@pytest.mark.asyncio
async def test_a_purchase_is_proposed_approved_and_made_once():
    store = ExampleStore()
    client = _client(store)
    person = Person()
    platform = build_protocols_reactor(
        plugins=[(PluginManifest(name="host", version="1"), Host(person))]
    )
    checkout = await _ready(client)
    proposal = await client.propose_completion(checkout["id"])
    assert proposal.total == 2700 and proposal.currency == "USD"
    assert (
        proposal.summary()
        == "Buy 2 × Sencha green tea, 100 g at store.example for USD 27.00"
    )
    done = await client.complete(
        proposal,
        approver=approver_of(platform),
        instruments=instruments_of(platform),
        store=proposal_store_of(platform),
    )
    assert done["status"] == "completed" and done["order"]["id"].startswith("ord_")
    assert person.asked == [proposal]
    with pytest.raises(UcpError, match="used already"):
        await client.complete(
            proposal,
            approver=approver_of(platform),
            instruments=instruments_of(platform),
            store=proposal_store_of(platform),
        )
    assert len(store.orders) == 1


@pytest.mark.asyncio
async def test_after_the_sale_the_order_is_read_and_a_stranger_is_refused():
    """PR-31: an order the merchant placed, read back (``read``); an unknown one refused."""
    store = ExampleStore()
    client = _client(store)
    platform = build_protocols_reactor(
        plugins=[(PluginManifest(name="host", version="1"), Host(Person()))]
    )
    checkout = await _ready(client)
    proposal = await client.propose_completion(checkout["id"])
    done = await client.complete(
        proposal,
        approver=approver_of(platform),
        instruments=instruments_of(platform),
        store=proposal_store_of(platform),
    )
    order = await client.get_order(done["order"]["id"])
    assert (order["id"], order["checkout_id"]) == (done["order"]["id"], checkout["id"])
    summary = order_summary(order)
    assert summary["lines"] == [
        {
            "title": "Sencha green tea, 100 g",
            "quantity": 2,
            "fulfilled": 0,
            "status": "processing",
        }
    ]
    assert summary["totals"]["total"] == 2700 and summary["currency"] == "USD"
    assert TOKEN not in json.dumps(order)
    with pytest.raises(UcpError, match="answered 404"):
        await client.get_order("ord_nobody")
    assert ACTION_CLASSES["get_order"] == "read"


@pytest.mark.asyncio
async def test_nothing_is_bought_without_an_approver_or_an_approval():
    client = _client(ExampleStore())
    checkout = await _ready(client)
    proposal = await client.propose_completion(checkout["id"])
    platform = build_protocols_reactor()
    with pytest.raises(LookupError, match="no UCP approver"):
        approver_of(platform)
    with pytest.raises(LookupError, match="no UCP payment instruments"):
        instruments_of(platform)
    declined = Person(answer=False)
    with pytest.raises(UcpError, match="did not approve"):
        await client.complete(
            proposal,
            approver=declined,
            instruments=Custody(),
            store=proposal_store_of(platform),
        )
    assert (await client.get_checkout(checkout["id"]))["status"] == "ready_for_complete"


@pytest.mark.asyncio
async def test_a_checkout_changed_after_the_approval_is_not_completed():
    client = _client(ExampleStore())
    checkout = await _ready(client)
    proposal = await client.propose_completion(checkout["id"])
    await client.update_checkout(
        checkout["id"],
        {
            "line_items": [{"item": {"id": "tea_sencha"}, "quantity": 5}],
            "buyer": {"email": "ana@example.com"},
        },
    )
    platform = build_protocols_reactor()
    with pytest.raises(UcpError, match="changed since it was proposed"):
        await client.complete(
            proposal,
            approver=Person(),
            instruments=Custody(),
            store=proposal_store_of(platform),
        )


@pytest.mark.asyncio
async def test_the_merchant_holds_the_protocol_to_its_headers():
    store = ExampleStore()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=store.app()), base_url=STORE
    ) as http:
        bare = await http.post("/ucp/v1/checkout-sessions", json={"line_items": []})
        assert bare.status_code == 400
        headers = {
            "UCP-Agent": f'profile="{AGENT_PROFILE}"',
            "Request-Id": "r1",
            "Idempotency-Key": "k1",
        }
        body = {"line_items": [{"item": {"id": "mug"}, "quantity": 1}]}
        first = await http.post("/ucp/v1/checkout-sessions", json=body, headers=headers)
        again = await http.post("/ucp/v1/checkout-sessions", json=body, headers=headers)
        assert first.status_code == 201 and again.json()["id"] == first.json()["id"]
        other = await http.post(
            "/ucp/v1/checkout-sessions", json={**body, "buyer": {}}, headers=headers
        )
        assert other.status_code == 409


@pytest.mark.asyncio
async def test_extensions_are_negotiated_from_what_is_contributed():
    client = _client(ExampleStore())
    profile = (await client.discover()).document
    platform = build_protocols_reactor()
    assert negotiate_capabilities(profile, platform) == ["dev.ucp.shopping.checkout"]

    class Fulfillment:
        def provide_contributions(self, contributions: Any) -> None:
            contributions.contribute(
                FULFILLMENT,
                UcpExtension(capability="dev.ucp.shopping.fulfillment"),
                order=10,
            )

    platform.register_plugin(
        PluginManifest(name="fulfillment", version="1"), Fulfillment()
    )
    offered = {
        **profile,
        "ucp": {
            **profile["ucp"],
            "capabilities": {
                **profile["ucp"]["capabilities"],
                "dev.ucp.shopping.fulfillment": [{}],
            },
        },
    }
    assert negotiate_capabilities(offered, platform) == [
        "dev.ucp.shopping.checkout",
        "dev.ucp.shopping.fulfillment",
    ]


@pytest.mark.asyncio
async def test_no_payment_token_reaches_what_an_agent_sees():
    """PR-53: the token goes to the business, never into a summary or a proposal."""
    client = _client(ExampleStore())
    checkout = await _ready(client)
    proposal = await client.propose_completion(checkout["id"])
    done = await client.complete(
        proposal,
        approver=Person(),
        instruments=Custody(),
        store=proposal_store_of(build_protocols_reactor()),
    )
    for seen in (checkout_summary(done), proposal.summary(), repr(proposal)):
        assert TOKEN not in json.dumps(seen, default=str)
    assert ACTION_CLASSES["complete"] == "buy" and ACTION_CLASSES["search"] == "read"


def test_the_revision_fixture_both_languages_read():
    """PR-51: the TypeScript client computes the same digest from the same checkout."""
    from pathlib import Path

    from agent_runtimes.protocols.ucp import revision_of

    fixture = json.loads(
        (
            Path(__file__).parents[1]
            / "protocols"
            / "ucp"
            / "fixtures"
            / "checkout.json"
        ).read_text()
    )
    assert revision_of(fixture["checkout"]) == fixture["revision"]
