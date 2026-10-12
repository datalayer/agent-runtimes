# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An Agentic Commerce Protocol checkout, approved once (AGENT_PROTOCOLS EX-05).

The Agentic Commerce Protocol 2026-04-17 (never ``acp`` in code: that is the
Agent Client Protocol) against a local test seller, *Example Outfitters*, in
one process with no network: discovery, a session that asks for the buyer's
email, the discount extension negotiated because the host contributed it, the
exact purchase approved by the person, paid with a delegated token the host
holds, completed once.

    python examples/protocols/agentic_commerce/checkout.py --yes
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

import httpx
from reactor import PluginManifest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.agentic_commerce import (
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

SELLER = "https://outfitters.example"


class Person:
    def __init__(self, yes: bool) -> None:
        self.yes = yes

    async def approve(self, proposal: CheckoutProposal) -> bool:
        print(f"\n  Approve? {proposal.summary()}")
        if self.yes:
            print("  → approved (--yes)")
            return True
        return input("  [y/N] ").strip().lower() == "y"


class Custody:
    """The host's: the bearer with the seller and the delegated payment token."""

    async def bearer(self, seller: str) -> str:
        return TEST_BEARER

    async def payment_data(
        self, proposal: CheckoutProposal, handlers: Any
    ) -> dict[str, Any]:
        return {
            "handler_id": HANDLER_ID,
            "instrument": {
                "type": "card",
                "credential": {"type": "spt", "token": "spt_test_held_by_the_host"},
            },
        }


class Host:
    def __init__(self, yes: bool) -> None:
        self.yes = yes

    def provide_contributions(self, contributions: Any) -> None:
        custody = Custody()
        contributions.contribute(
            APPROVERS, Person(self.yes), contribution_id="person", order=10
        )
        contributions.contribute(
            CREDENTIALS, custody, contribution_id="custody", order=10
        )
        contributions.contribute(
            PAYMENT_DATA, custody, contribution_id="custody", order=10
        )
        contributions.contribute(
            DISCOUNT, AgenticCommerceExtension("discount"), order=10
        )


async def main(yes: bool) -> None:
    seller = ExampleOutfitters(SELLER)
    platform = build_protocols_reactor(
        plugins=[(PluginManifest(name="host", version="1"), Host(yes))]
    )
    client = AgenticCommerceClient(
        seller=SELLER,
        credentials=credentials_of(platform),
        extensions=declared_extensions(platform),
        http=httpx.AsyncClient(
            transport=httpx.ASGITransport(app=seller.app()), base_url=SELLER
        ),
    )
    found = await client.discover()
    print(
        f"{found.domain} speaks the Agentic Commerce Protocol {found.versions[-1]}: {found.services}, extensions {found.extensions}"
    )
    session = await client.create_checkout([{"id": "socks", "quantity": 2}], "usd")
    print("\nSession:", session_summary(session))
    session = await client.update_checkout(
        session["id"],
        {"buyer": {"email": "ana@example.com"}, "discounts": {"codes": ["WELCOME10"]}},
    )
    print(
        "With the email and WELCOME10:",
        session_summary(session)["status"],
        session_summary(session)["totals"],
    )
    proposal = await client.propose_completion(session["id"])
    kwargs = dict(
        approver=approver_of(platform),
        payment=payment_data_of(platform),
        store=proposal_store_of(platform),
    )
    try:
        done = await client.complete(proposal, **kwargs)
    except AgenticCommerceError as refused:
        print("Not bought:", refused)
        return
    print("\nBought:", session_summary(done))
    try:
        await client.complete(proposal, **kwargs)
    except AgenticCommerceError as refused:
        print("The same proposal again:", refused)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="approve without asking")
    asyncio.run(main(parser.parse_args().yes))
