# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A personal agent at a business, over PACT 1.0 (AGENT_PROTOCOLS EX-06).

A local Provider with one Brand, *Example Air*, and a personal agent, in one
process with no network: the Brand's card read, a conversation under the
personal-agent JWT alone (the *Identity* profile), then the person signs in
at the Brand and grants one scope of the two asked (the *Delegated* profile),
the agent answers within it, asks for more when a change needs it, and every
reply under delegation carries a receipt, verified and kept.

    python examples/protocols/pact/personal_agent.py
"""

from __future__ import annotations

import asyncio

import httpx
from reactor import PluginManifest

from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.egress import client_fetch
from agent_runtimes.protocols.pact import PactPersonalAgent, StepUp
from agent_runtimes.protocols.pact.plugin import (
    SIGNERS,
    delegation_store_of,
    receipt_store_of,
    signer_of,
)
from agent_runtimes.protocols.pact.provider import ExampleAir
from agent_runtimes.protocols.web_bot_auth import LocalSigner

ISSUER = "https://pa.example"
USER = "user-7f3a"


class Host:
    """The personal-agent platform: its ES256 key stays with it."""

    def __init__(self, signer: LocalSigner) -> None:
        self.signer = signer

    def provide_contributions(self, contributions) -> None:
        contributions.contribute(SIGNERS, self.signer, contribution_id="host", order=10)


async def main() -> None:
    provider = ExampleAir()
    key = LocalSigner.generate("ecdsa-p256-sha256")
    # Registration, once per personal agent and Provider (§3.1).
    provider.register(
        ISSUER, {"keys": [{**key.public_jwk, "alg": "ES256", "use": "sig"}]}
    )
    platform = build_protocols_reactor(
        plugins=[(PluginManifest(name="host", version="1"), Host(key))]
    )
    http = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=provider.app()), base_url=provider.base
    )
    agent = PactPersonalAgent(
        card_url=f"{provider.interface_url}/.well-known/agent-card.json",
        issuer=ISSUER,
        audience=provider.audience,
        signer=signer_of(platform),
        delegations=delegation_store_of(platform),
        receipts=receipt_store_of(platform),
        http=http,
        # The local Provider, read over the client this example trusts; a real
        # Brand's card is read on the single egress path (the default).
        metadata=client_fetch(http),
    )
    card = await agent.discover()
    print(f"{card.name}: PACT {card.profile}, scopes:")
    for scope in card.delegation.scopes:
        print(f"  {scope.id} ({scope.action_class}): {scope.description}")

    first = await agent.send(USER, "Hello, about my trip")
    print("\nIdentity only →", first.text)

    sign_in = await agent.request_sign_in(USER, ["bookings:read", "bookings:change"])
    print(
        f"\nThe person signs in at {sign_in.verification_uri} (code {sign_in.user_code})"
    )
    provider.approve(sign_in.user_code, "jane-4471", ["bookings:read"])
    print("They grant:", await agent.finish_sign_in(USER, sign_in, interval=0))

    reply = await agent.send(USER, "When is my booking?", context_id=first.context_id)
    print("\nDelegated →", reply.text, "| used:", reply.scopes_used)
    step = await agent.send(
        USER, "Please change my flight", context_id=first.context_id
    )
    assert isinstance(step, StepUp)
    print("Step-up →", step.text, "| missing:", step.missing)
    more = await agent.request_sign_in(USER, list(step.missing))
    provider.approve(more.user_code, "jane-4471", list(step.missing))
    await agent.finish_sign_in(USER, more, interval=0)
    changed = await agent.send(
        USER, "Please change my flight", context_id=first.context_id
    )
    print("Delegated →", changed.text, "| actions:", changed.actions)
    print(f"\nReceipts verified and kept: {len(receipt_store_of(platform).receipts)}")


if __name__ == "__main__":
    asyncio.run(main())
