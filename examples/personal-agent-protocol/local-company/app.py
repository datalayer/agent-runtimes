# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application as a PAP company in a local runtime: PapCompanyCapability.

The SDK's reference company publishes *Order Desk* at ``orders.example``;
``pap.company.agent`` is the application over its A2A route. The route here
answers as the runtime does in a company turn (``apps.pap_company``): a
declared tool's call is proposed, not made, and once the person confirmed the
exact revision the perform turn redeems its one-use ticket through the
runtime's ``pap.company.operationTickets`` and makes that one call. A local
personal agent (``PapPersonalAgentCapability``) is the other side.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

import httpx
from agentspecs.apps import AppPapCompany, AppPapOperation
from personal_agent_protocol import (
    APPROVAL_SURFACES,
    PAIRWISE_USER_ID_STORES,
    ApprovalRequest,
    SqlitePairwiseUserIdStore,
)
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    ClockPlugin,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from reactor import PluginManifest

from agent_runtimes.apps import Application
from agent_runtimes.apps.pap_company import pap_turn_of, redeem
from agent_runtimes.pap import (
    A2AApplication,
    PapCompanyCapability,
    PapPersonalAgentCapability,
)
from agent_runtimes.protocols import protocols_platform

DOMAIN = "orders.example"
COMPANY = AppPapCompany(
    enabled=True,
    # Its own scopes, each with what it allows (PAP draft 0.3 §4.4).
    scopes=[
        {"name": "orders:read", "description": "Read your orders", "changes": "none"},
        {"name": "orders:write", "description": "Exchange an order you approved"},
    ],
    extensions=["operations"],
    operations=[
        AppPapOperation(
            action="orders.exchange",
            tool="exchange_order",
            summary="Exchange order {order_id} for size {size}",
        )
    ],
)

app = Application(
    id="pap-local-company",
    name="PAP Local Company",
    description="An application published as a PAP company by a local runtime, reached by a local personal agent.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions="Use walk_through.",
)


async def order_desk(request: httpx.Request) -> httpx.Response:
    """Order Desk's A2A route, answering as the runtime does in a company turn."""
    message = json.loads(request.content)["params"]["message"]
    turn = pap_turn_of(message["metadata"])
    assert turn is not None
    if turn.ticket:
        performing = await redeem(turn, "")
        parts = [
            {"kind": "text", "text": f"Done: {performing.tool} {performing.terms}."},
            {
                "kind": "data",
                "data": {"pap_performed": {"action": performing.action, "done": True}},
            },
        ]
    elif "exchange" in message["parts"][0]["text"].lower():
        parts = [
            {"kind": "text", "text": "Proposed to you, not done."},
            {
                "kind": "data",
                "data": {
                    "pap_operation": {
                        "action": "orders.exchange",
                        "terms": {"order_id": "o-17", "size": "L"},
                    }
                },
            },
        ]
    else:
        parts = [{"kind": "text", "text": "Order o-17 is delivered."}]
    result = {
        "kind": "task",
        "status": {"state": "completed"},
        "artifacts": [{"parts": parts}],
    }
    return httpx.Response(200, json={"jsonrpc": "2.0", "id": "1", "result": result})


class Accounts:
    """The host's accounts: a person approves on the host's own page."""

    async def authenticate(self, credentials: Any, context: Any) -> None:
        return None

    async def check_code(self, code_reference: str, code: Any) -> bool:
        return False


class PersonsHost:
    """The personal agent's host: pairwise ids, and the person's approval surface."""

    def __init__(self, folder: Path) -> None:
        self.pairwise = SqlitePairwiseUserIdStore(folder / "pairwise.sqlite")
        self.shown: list[str] = []

    async def approve(self, request: ApprovalRequest) -> bool:
        self.shown.append(request.summary)
        return True

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            PAIRWISE_USER_ID_STORES, self.pairwise, contribution_id="local", order=50
        )
        contributions.contribute(
            APPROVAL_SURFACES, self, contribution_id="person", order=50
        )


@app.tool(does="read")
async def walk_through() -> dict[str, Any]:
    """Publish Order Desk as a company, then reach it as Ada's personal agent."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    async with httpx.AsyncClient(transport=httpx.MockTransport(order_desk)) as a2a:
        company = PapCompanyCapability(
            name="Order Desk",
            domain=DOMAIN,
            company=COMPANY,
            application=A2AApplication(
                "https://runtime.local/api/v1/a2a/order-desk", http_client=a2a
            ),
            accounts=Accounts(),
            http_client=network.client(),
            address_resolver=network.resolve,
            plugins=[(PluginManifest(name="clock", version="1"), ClockPlugin(clock))],
        )
        network.add(DOMAIN, company.asgi())
        runtime = protocols_platform()
        manifest, tickets = company.runtime_plugin()
        runtime.register_plugin(manifest, tickets)
        try:
            with tempfile.TemporaryDirectory() as folder:
                host = PersonsHost(Path(folder))
                http = network.client()
                reactor = personal_agent_reactor(
                    PersonalAgentHost(atlas, clock),
                    network=network,
                    http_client=http,
                    plugins=[(PluginManifest(name="persons-host", version="1"), host)],
                )
                pap = PapPersonalAgentCapability(
                    reactor=reactor, http_client=http, client_id=atlas.client_id
                )
                discovered = await pap.discover_company(DOMAIN)
                signed_out = await pap.ask(DOMAIN, "Where is my order?", user_id="ada")
                started = await pap.sign_in(DOMAIN, user_id="ada")
                assert started.code is not None
                await company.approve_device(started.code, account_id="acct_ada")
                clock.advance(10)
                await pap.sign_in_status(DOMAIN, user_id="ada")
                proposed = (
                    await pap.ask(DOMAIN, "Exchange it for an L", user_id="ada")
                ).operations[0]
                confirmed = await pap.confirm(
                    DOMAIN, proposed.operation_ref, proposed.revision, user_id="ada"
                )
        finally:
            runtime.unregister_plugin(manifest.name)
    return {
        "company": discovered.model_dump(),
        "signed_out_answer": [line.text for line in signed_out.replies],
        "proposed": proposed.summary,
        "the_person_was_shown": host.shown,
        "confirmed": confirmed.status,
        "result": confirmed.result,
    }
