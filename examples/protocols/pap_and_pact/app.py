# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""PAP and PACT in one task (AGENT_PROTOCOLS EX-07, PR-14).

Ada asks her application, *Atlas*, one question: *where is my jacket order,
and when do I fly?* The order is at a PAP company, Manzanita Outfitters (the
PAP SDK's demo world); the flight is at a PACT Brand, Example Air (agent
runtimes' local Provider). Atlas asks both, Ada signs in at each business's
own page, and one record keeps what each protocol did — written through the
same contribution points a Datalayer host fills (`pact.receiptStore` is the
record, R-07).

Everything runs in one process with no network and no model: real keys,
DPoP proofs, personal-agent JWTs and signed receipts over in-process HTTP.

    python examples/protocols/pap_and_pact/app.py
    loop apps run examples/protocols/pap_and_pact/app.py
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Mapping

import httpx
from personal_agent_protocol import (
    ConversationClient,
    DeviceSignInClient,
    DiscoveryClient,
    DpopHttpClient,
    Message,
    SessionClient,
    generate_message_id,
)
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application
from agent_runtimes.protocols import build_protocols_reactor
from agent_runtimes.protocols.egress import client_fetch
from agent_runtimes.protocols.pact import PactPersonalAgent
from agent_runtimes.protocols.pact.plugin import (
    RECEIPT_STORES,
    SIGNERS,
    delegation_store_of,
    receipt_store_of,
    signer_of,
)
from agent_runtimes.protocols.pact.provider import ExampleAir
from agent_runtimes.protocols.web_bot_auth import LocalSigner

TENANT = "atlas-demo"
#: Ada at Manzanita: a pairwise id, never her address (PAP).
PAP_USER = "usr_ada_at_manzanita_000000"
#: Ada at Example Air: the stable opaque `sub` of the personal-agent JWT (PACT).
PACT_USER = "ada-7f3a"
#: The personal-agent platform, as PACT's `iss`.
ISSUER = "https://atlas.example"

QUESTION = "Where is my jacket order, and when do I fly?"


class Record:
    """The task's record: what each protocol did, in the order it did it (R-07).

    Contributed to ``pact.receiptStore`` below the default, so a Brand's
    verified receipt is kept here; PAP's steps are written by the tool. Only
    safe fields: no token, no code, no proof.
    """

    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []
        #: A Brand's interface URL → its name, as its card says it.
        self.brands: dict[str, str] = {}

    def write(self, protocol: str, counterpart: str, event: str, **said: Any) -> None:
        self.entries.append(
            {"protocol": protocol, "counterpart": counterpart, "event": event, **said}
        )

    async def keep(self, brand: str, user: str, claims: Mapping[str, Any]) -> None:
        self.write(
            "PACT",
            self.brands.get(brand, brand),
            "receipt verified",
            grant=claims.get("grantId"),
            scopes_used=list(claims.get("scopesUsed") or []),
            actions=[a.get("tool") for a in claims.get("actions") or []],
        )


class AtlasHost:
    """Atlas's host: its PACT key and its record, as contributions."""

    def __init__(self, signer: LocalSigner, record: Record) -> None:
        self.signer = signer
        self.record = record

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            SIGNERS, self.signer, contribution_id="atlas", order=10
        )
        contributions.contribute(
            RECEIPT_STORES, self.record, contribution_id="record", order=10
        )


def _last(page: Any, what: str) -> Any:
    """The page's last event carrying a `message` (or an `error`)."""
    return next(
        getattr(event, what)
        for event in reversed(page.events)
        if getattr(event, what, None) is not None
    )


async def _at_manzanita(record: Record) -> str:
    """PAP: discover, a signed-out pairwise Session, Device Sign-In, the same conversation."""
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, _ = manzanita(network, clock)
    host = PersonalAgentHost(atlas, clock)
    async with network.client() as http:
        reactor = personal_agent_reactor(host, network=network, http_client=http)
        conversations = ConversationClient(
            transport=DpopHttpClient(reactor=reactor, http_client=http)
        )

        def say(text: str) -> Message:
            return Message(id=generate_message_id(reactor), sender="human", text=text)

        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "manzanita.example"
        )
        name = company.document.organization.name
        metadata = company.oauth_metadata
        assert metadata is not None and metadata.device_authorization_endpoint
        assert company.document.agent is not None
        record.write("PAP", name, "company discovered", domain="manzanita.example")
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id=atlas.client_id,
            pairwise_user_id=PAP_USER,
            issuer=metadata.issuer,
            token_endpoint=metadata.token_endpoint,
            tenant_id=TENANT,
        )
        who = {
            "tenant_id": TENANT,
            "pairwise_user_id": PAP_USER,
            "issuer": metadata.issuer,
        }
        endpoint = company.document.agent.protocols[0].endpoint
        page = await conversations.start(
            endpoint, say("Where is my jacket order?"), token=session, wait=0, **who
        )
        error = _last(page, "error")
        record.write("PAP", name, "sign-in asked", error=error)

        device = DeviceSignInClient(reactor=reactor, http_client=http)
        started = await device.begin(
            device_authorization_endpoint=metadata.device_authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            issuer=metadata.issuer,
            client_id=atlas.client_id,
            scopes=("orders:read",),
            tenant_id=TENANT,
            pairwise_user_id=PAP_USER,
            session_id=session.session_id,
        )
        # Ada approves on Manzanita's own page; the code never reaches the model.
        await shop.approve_device(started.user_code, account_id="acct_ada")
        clock.advance(started.poll_interval)
        done = await device.poll(started.reference)
        assert done.token is not None
        record.write(
            "PAP", name, "signed in", scopes=list(done.token.scopes), where="its page"
        )
        page = await conversations.send(
            endpoint,
            page.conversation_id,
            say("Where is my jacket order?"),
            token=done.token,
            cursor=page.cursor,
            wait=0,
            **who,
        )
        answer = _last(page, "message").text
        record.write("PAP", name, "answered", conversation="the same one")
        return f"{name}: {answer}"


async def _at_example_air(platform: Any, provider: ExampleAir) -> str:
    """PACT: the card, the personal-agent JWT, a device-code delegation, a receipt."""
    record: Record = receipt_store_of(platform)  # type: ignore[assignment]
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=provider.app()), base_url=provider.base
    ) as http:
        agent = PactPersonalAgent(
            card_url=f"{provider.interface_url}/.well-known/agent-card.json",
            issuer=ISSUER,
            audience=provider.audience,
            signer=signer_of(platform),
            delegations=delegation_store_of(platform),
            receipts=receipt_store_of(platform),
            http=http,
            metadata=client_fetch(http),
        )
        card = await agent.discover()
        record.brands[card.interface_url] = card.name
        record.write(
            "PACT",
            card.name,
            "card read",
            profile=card.profile,
            binding="HTTP+JSON 1.0",
        )
        sign_in = await agent.request_sign_in(PACT_USER, ["bookings:read"])
        record.write("PACT", card.name, "sign-in asked", scopes=["bookings:read"])
        # Ada signs in on Example Air's own page and approves.
        provider.approve(sign_in.user_code, "jane-4471", ["bookings:read"])
        granted = await agent.finish_sign_in(PACT_USER, sign_in, interval=0)
        record.write(
            "PACT", card.name, "signed in", scopes=list(granted), where="its page"
        )
        reply = await agent.send(PACT_USER, "When is my booking?")
        record.write("PACT", card.name, "answered", scopes_used=list(reply.scopes_used))
        return f"{card.name}: {reply.text}"


app = Application(
    id="pap-and-pact-one-task",
    name="PAP and PACT in One Task",
    description="One question answered by a PAP company and a PACT Brand, one record.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use ask_both. Never expose a user code, device code, token, assertion, "
        "proof or receipt signature."
    ),
)


@app.tool(does="read")
async def ask_both() -> dict[str, Any]:
    """Ask Manzanita (PAP) and Example Air (PACT) one question; return the answers and the record."""
    record = Record()
    key = LocalSigner.generate("ecdsa-p256-sha256")
    provider = ExampleAir()
    # Registration of Atlas at the Provider, once (PACT §3.1).
    provider.register(
        ISSUER, {"keys": [{**key.public_jwk, "alg": "ES256", "use": "sig"}]}
    )
    platform = build_protocols_reactor(
        plugins=[(PluginManifest(name="atlas", version="1"), AtlasHost(key, record))]
    )
    answers = [await _at_manzanita(record), await _at_example_air(platform, provider)]
    return {"question": QUESTION, "answers": answers, "record": record.entries}


if __name__ == "__main__":
    result = asyncio.run(ask_both())
    print(result["question"])
    for answer in result["answers"]:
        print("  " + answer)
    print("\nThe record:")
    for entry in result["record"]:
        print("  " + json.dumps(entry))
