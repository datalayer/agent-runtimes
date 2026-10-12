# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Shopping over UCP, a purchase approved once (AGENT_PROTOCOLS EX-04).

The Universal Commerce Protocol 2026-08-25 against a local test merchant,
*Example Store*, in one process with no network: search, a checkout that
asks for the buyer's email, the exact purchase proposed, approved by the
person, paid with the host's instrument, completed once — and a second
completion of the same proposal refused.

    python examples/protocols/ucp/shopping.py          # asks you
    python examples/protocols/ucp/shopping.py --yes    # approves
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any

import httpx
from reactor import PluginManifest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.egress import client_fetch
from agent_runtimes.protocols.ucp import (
    CheckoutProposal,
    UcpClient,
    UcpError,
    checkout_summary,
)
from agent_runtimes.protocols.ucp.merchant import TEST_HANDLER_ID, ExampleStore
from agent_runtimes.protocols.ucp.plugin import (
    APPROVERS,
    PAYMENT_INSTRUMENTS,
    approver_of,
    instruments_of,
    proposal_store_of,
)

STORE = "https://store.example"


class Person:
    """The person the agent buys for: asked once per exact purchase."""

    def __init__(self, yes: bool) -> None:
        self.yes = yes

    async def approve(self, proposal: CheckoutProposal) -> bool:
        print(f"\n  Approve? {proposal.summary()}")
        if self.yes:
            print("  → approved (--yes)")
            return True
        return input("  [y/N] ").strip().lower() == "y"


class Custody:
    """The host's payment instrument: the token goes to the store, never to the agent."""

    async def instrument(
        self, proposal: CheckoutProposal, handlers: Any
    ) -> dict[str, Any]:
        return {
            "id": "pi_1",
            "handler_id": TEST_HANDLER_ID,
            "type": "card",
            "selected": True,
            "credential": {
                "type": "PAYMENT_GATEWAY",
                "token": "tok_test_held_by_the_host",
            },
        }


class Host:
    def __init__(self, yes: bool) -> None:
        self.yes = yes

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            APPROVERS, Person(self.yes), contribution_id="person", order=10
        )
        contributions.contribute(
            PAYMENT_INSTRUMENTS, Custody(), contribution_id="custody", order=10
        )


async def main(yes: bool) -> None:
    store = ExampleStore(STORE)
    platform = build_protocols_reactor(
        plugins=[(PluginManifest(name="host", version="1"), Host(yes))]
    )
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=store.app()), base_url=STORE
    )
    client = UcpClient(
        business=STORE,
        agent_profile="https://agent.example/.well-known/ucp",
        http=http,
        # The local test store, read over the client this example trusts; a real
        # business's profile is read on the single egress path (the default).
        metadata=client_fetch(http),
    )

    profile = await client.discover()
    print(
        f"{profile.domain} speaks UCP {profile.version}: {', '.join(profile.capabilities)}"
    )
    products = await client.search("tea")
    print("Found:", ", ".join(p["title"] for p in products))

    checkout = await client.create_checkout([{"id": "tea_sencha", "quantity": 2}])
    print("\nCheckout:", checkout_summary(checkout))
    checkout = await client.update_checkout(
        checkout["id"], {"buyer": {"email": "ana@example.com"}}
    )
    print("With the email:", checkout["status"])

    proposal = await client.propose_completion(checkout["id"])
    kwargs = dict(
        approver=approver_of(platform),
        instruments=instruments_of(platform),
        store=proposal_store_of(platform),
    )
    try:
        done = await client.complete(proposal, **kwargs)
    except UcpError as refused:
        print("Not bought:", refused)
        return
    print("\nBought:", checkout_summary(done))
    try:
        await client.complete(proposal, **kwargs)
    except UcpError as refused:
        print("The same proposal again:", refused)
    print("Orders at the store:", len(store.orders))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true", help="approve without asking")
    asyncio.run(main(parser.parse_args().yes))
