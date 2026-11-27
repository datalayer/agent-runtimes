# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A shop and a person's own agent, both in a local runtime.

The company is the Online Shop, the catalogue's ``online-shop`` application,
published as a PAP company by ``PapCompanyCapability`` with the scopes and
the one operation its Appspec declares (``orders.place``, derived from its
``openapi``). Its A2A route answers from the shop's own tools
(``agent_runtimes.tools.online_shop``), as the shop's agent does on a runtime,
with no model here: it finds products, quotes a basket and, asked to place an
order, proposes it rather than placing it. Once the person confirmed that
exact revision, the perform turn redeems its one-use ticket and places the
test order once — nothing is charged and nothing ships.

The other side is Ada's personal agent (``PapPersonalAgentCapability``): it
discovers the shop, asks for tennis gear before signing in, signs in, has a
basket quoted and places the test order with Ada's approval.
"""

from __future__ import annotations

import json
import re
import tempfile
from pathlib import Path
from typing import Any

import httpx
from agentspecs.apps import get_app
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
from agent_runtimes.tools import online_shop

DOMAIN = "shop.example"
SHOP = get_app("online-shop")
assert SHOP is not None and SHOP.pap is not None
# Its scopes and its operation as its Appspec says them; a local company offers
# its agent alone (its A2A route): at Datalayer the shop also answers at its
# MCP, API and web addresses.
COMPANY = SHOP.pap.company.model_copy(update={"interfaces": ["agent"]})

app = Application(
    id="pap-shop",
    name="PAP Shop",
    description=(
        "The Online Shop published as a PAP company by a local runtime, and a "
        "person's own agent buying from it: find, quote, a test order approved."
    ),
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="blank:0.0.1",
    instructions="Use walk_through.",
)


def _items(text: str) -> list[dict[str, Any]]:
    """``2 tennis-ball, 1 tennis-racket`` as the shop's basket."""
    return [
        {"product_id": product_id, "quantity": int(quantity)}
        for quantity, product_id in re.findall(r"(\d+)\s+([a-z][a-z-]*)", text)
    ]


def _said(answer: Any) -> str:
    """What the shop's tools answered, in the words its agent would say."""
    if isinstance(answer, str):
        return answer
    if answer["shown"] == "products":
        return "; ".join(
            f"{p['title']} {p['price']:.2f} {p['currency']}, {p['stock']} in stock "
            f"(photo {p['image']})"
            for p in answer["products"]
        )
    lines = ", ".join(
        f"{line['quantity']} x {line['title']} {line['line_total']:.2f}"
        for line in answer["lines"]
    )
    total = f"total {answer['total']:.2f} {answer['currency']}"
    if answer["shown"] == "test_order":
        return f"Test order {answer['order_id']}: {lines}, {total}. {answer['note']}"
    return f"Quote: {lines}, {total}. {answer['note']}"


async def shop_route(request: httpx.Request) -> httpx.Response:
    """The Online Shop's A2A route, answering as its agent does in a company turn."""
    message = json.loads(request.content)["params"]["message"]
    turn = pap_turn_of(message["metadata"])
    assert turn is not None
    text = message["parts"][0]["text"]
    if turn.ticket:
        performing = await redeem(turn, "")
        assert performing.tool == "place_test_order"
        placed = online_shop.place_test_order(**performing.terms)
        parts = [
            {"kind": "text", "text": _said(placed)},
            {
                "kind": "data",
                "data": {"pap_performed": {"action": performing.action, "done": True}},
            },
        ]
    elif text.lower().startswith("place"):
        parts = [
            {"kind": "text", "text": "Proposed to you, not placed."},
            {
                "kind": "data",
                "data": {
                    "pap_operation": {
                        "action": "orders.place",
                        "terms": {"items": _items(text)},
                    }
                },
            },
        ]
    elif text.lower().startswith("quote"):
        parts = [
            {"kind": "text", "text": _said(online_shop.quote_basket(_items(text)))}
        ]
    else:
        under = re.search(r"under (\d+(?:\.\d+)?)", text)
        query = re.sub(r"^find\s+|\s*under .*$", "", text, flags=re.IGNORECASE)
        found = online_shop.find_products(
            query, max_price=float(under.group(1)) if under else None
        )
        parts = [{"kind": "text", "text": _said(found)}]
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
    """Publish the Online Shop as a company, then buy from it as Ada's personal agent."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    async with httpx.AsyncClient(transport=httpx.MockTransport(shop_route)) as a2a:
        company = PapCompanyCapability(
            name=SHOP.name,
            domain=DOMAIN,
            company=COMPANY,
            application=A2AApplication(
                "https://runtime.local/api/v1/a2a/online-shop", http_client=a2a
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
                found = await pap.ask(DOMAIN, "Find tennis under 60", user_id="ada")
                started = await pap.sign_in(DOMAIN, user_id="ada")
                assert started.code is not None
                await company.approve_device(started.code, account_id="acct_ada")
                clock.advance(10)
                await pap.sign_in_status(DOMAIN, user_id="ada")
                quoted = await pap.ask(
                    DOMAIN, "Quote 2 tennis-ball, 1 tennis-racket", user_id="ada"
                )
                proposed = (
                    await pap.ask(
                        DOMAIN,
                        "Place a test order of 2 tennis-ball, 1 tennis-racket",
                        user_id="ada",
                    )
                ).operations[0]
                confirmed = await pap.confirm(
                    DOMAIN, proposed.operation_ref, proposed.revision, user_id="ada"
                )
        finally:
            runtime.unregister_plugin(manifest.name)
    return {
        "company": discovered.model_dump(),
        "found_signed_out": [line.text for line in found.replies],
        "quoted": [line.text for line in quoted.replies],
        "proposed": proposed.summary,
        "the_person_was_shown": host.shown,
        "confirmed": confirmed.status,
        "result": confirmed.result,
    }
