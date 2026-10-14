# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Loop application as a PAP company (AGENT_PROTOCOLS PR-04).

``PapCompanyCapability`` publishes an application's ``pap.company`` through the
SDK's reference company, ``pap.company.agent`` being the application over its
A2A route. The application here answers as the runtime does in a company turn
(``agent_runtimes.loop.apps.pap_company``): a declared tool's call proposed as
``pap_operation``, and, in a perform turn, the ticket redeemed through the
runtime's ``pap.company.operationTickets`` before the one call is made. A
local personal agent (``PapPersonalAgentCapability``, PR-03) reaches it.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
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

from agent_runtimes.loop.apps.pap_company import PapTurn, pap_turn_of, redeem
from agent_runtimes.pap import (
    A2AApplication,
    PapCompanyCapability,
    PapPersonalAgentCapability,
)
from agent_runtimes.protocols import protocols_platform

DOMAIN = "orders.example"
COMPANY = AppPapCompany(
    enabled=True,
    signed_out=True,
    scopes=["orders:read", "orders:write"],
    extensions=["operations"],
    operations=[
        AppPapOperation(
            action="orders.exchange",
            tool="exchange_order",
            summary="Exchange order {order_id} for size {size}",
        )
    ],
)


class Accounts:
    """The host's accounts: people approve on its own page; no password is typed to an agent."""

    async def authenticate(self, credentials: Any, context: Any) -> None:
        return None

    async def check_code(self, code_reference: str, code: Any) -> bool:
        return False


class Application:
    """The application's A2A route, answering as the runtime does in a company turn."""

    def __init__(self) -> None:
        self.performed: list[tuple[str, dict[str, Any]]] = []
        self.asked: list[dict[str, Any]] = []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        message = json.loads(request.content)["params"]["message"]
        meta = message["metadata"]
        self.asked.append(meta["pap"])
        turn = pap_turn_of(meta)
        assert isinstance(turn, PapTurn)
        text = message["parts"][0]["text"]
        if turn.ticket:
            performing = await redeem(turn, "")
            self.performed.append((performing.tool, performing.terms))
            parts = [
                {"kind": "text", "text": "Exchanged: a size L is on its way."},
                {
                    "kind": "data",
                    "data": {
                        "pap_performed": {"action": performing.action, "done": True}
                    },
                },
            ]
        elif "exchange" in text.lower():
            parts = [
                {
                    "kind": "text",
                    "text": "I proposed the exchange; it is done once you confirm.",
                },
                {
                    "kind": "data",
                    "data": {
                        "pap_operation": {
                            "action": "orders.exchange",
                            "summary": "ignored: the Maker's words are used",
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


class Host:
    def __init__(self, folder: Path) -> None:
        self.pairwise = SqlitePairwiseUserIdStore(folder / "pairwise.sqlite")
        self.asked: list[ApprovalRequest] = []

    async def approve(self, request: ApprovalRequest) -> bool:
        self.asked.append(request)
        return True

    def provide_contributions(self, contributions: Any) -> None:
        contributions.contribute(
            PAIRWISE_USER_ID_STORES, self.pairwise, contribution_id="host", order=50
        )
        contributions.contribute(
            APPROVAL_SURFACES, self, contribution_id="person", order=50
        )


@pytest.mark.asyncio
async def test_a_personal_agent_works_with_the_application_as_a_company(
    tmp_path: Path,
) -> None:
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    application = Application()
    async with httpx.AsyncClient(transport=httpx.MockTransport(application)) as a2a:
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
            # The demo world's clock, which the personal agent's proofs are dated by.
            plugins=[(PluginManifest(name="clock", version="1"), ClockPlugin(clock))],
        )
        network.add(DOMAIN, company.asgi())
        runtime = protocols_platform()
        manifest, tickets = company.runtime_plugin()
        runtime.register_plugin(manifest, tickets)
        try:
            host = Host(tmp_path)
            http = network.client()
            reactor = personal_agent_reactor(
                PersonalAgentHost(atlas, clock),
                network=network,
                http_client=http,
                plugins=[(PluginManifest(name="host", version="1"), host)],
            )
            pap = PapPersonalAgentCapability(
                reactor=reactor, http_client=http, client_id=atlas.client_id
            )
            summary = await pap.discover_company(DOMAIN)
            assert summary.organization == "Order Desk"
            assert summary.sign_in == ("device",)
            assert summary.extensions == {"operations": "1"}

            signed_out = await pap.ask(DOMAIN, "Where is my order?", user_id="ada")
            assert signed_out.replies == ("Order o-17 is delivered.",)
            # Signed out, nothing is proposed for nobody.
            asked = await pap.ask(DOMAIN, "Exchange it for an L", user_id="ada")
            assert asked.operations == ()
            assert asked.authorization == {
                "error": "sign_in_required",
                "scope": "orders:read orders:write",
            }

            started = await pap.sign_in(DOMAIN, user_id="ada")
            assert started.status == "waiting_for_the_person" and started.code
            # Ada approves on the host's own page.
            await company.approve_device(started.code, account_id="acct_ada")
            clock.advance(10)
            assert (
                await pap.sign_in_status(DOMAIN, user_id="ada")
            ).status == "signed_in"

            proposed = await pap.ask(DOMAIN, "Exchange it for an L", user_id="ada")
            [operation] = proposed.operations
            assert operation.summary == "Exchange order o-17 for size L"
            assert operation.terms == {"order_id": "o-17", "size": "L"}
            assert operation.user_approval_required is True
            assert application.performed == []

            confirmed = await pap.confirm(
                DOMAIN, operation.operation_ref, operation.revision, user_id="ada"
            )
            assert confirmed.status == "confirmed"
            assert confirmed.result == "Exchanged: a size L is on its way."
            assert application.performed == [
                ("exchange_order", {"order_id": "o-17", "size": "L"})
            ]
            assert host.asked[0].summary == "Order Desk: Exchange order o-17 for size L"
            # The application was told who asks, never a credential.
            for meta in application.asked:
                assert set(meta) <= {"account", "client_id", "perform"}
            # A ticket is used once.
            assert company.tickets._tickets == {}
        finally:
            runtime.unregister_plugin(manifest.name)


@pytest.mark.asyncio
async def test_a_ticket_is_redeemed_once() -> None:
    company_tickets = PapCompanyCapability.__new__(PapCompanyCapability)
    from agent_runtimes.pap.company import MemoryOperationTickets

    tickets = MemoryOperationTickets()
    company_tickets.tickets = tickets
    ticket = tickets.issue({"action": "a", "tool": "t", "terms": {}})
    assert await tickets.redeem(ticket, "") == {"action": "a", "tool": "t", "terms": {}}
    assert await tickets.redeem(ticket, "") is None
    runtime = protocols_platform()
    manifest, plugin = company_tickets.runtime_plugin()
    runtime.register_plugin(manifest, plugin)
    try:
        with pytest.raises(RuntimeError, match="did not honour"):
            await redeem(PapTurn(ticket="unknown"))
    finally:
        runtime.unregister_plugin(manifest.name)


def test_a_local_company_offers_its_agent_only() -> None:
    with pytest.raises(ValueError, match="agent interface only"):
        PapCompanyCapability(
            name="X",
            domain=DOMAIN,
            company=COMPANY.model_copy(update={"interfaces": ["agent", "mcp"]}),
            application=A2AApplication(
                "https://runtime.local/a2a", http_client=httpx.AsyncClient()
            ),
            accounts=Accounts(),
            http_client=httpx.AsyncClient(),
        )
    with pytest.raises(ValueError, match="does not enable"):
        PapCompanyCapability(
            name="X",
            domain=DOMAIN,
            company=AppPapCompany(),
            application=A2AApplication(
                "https://runtime.local/a2a", http_client=httpx.AsyncClient()
            ),
            accounts=Accounts(),
            http_client=httpx.AsyncClient(),
        )


def test_a_local_company_gives_no_standing_permission() -> None:
    """PAP_DATALAYER R-07: a standing permission is the person's approval in advance, which only
    Datalayer keeps; a company in this process refuses an Appspec that would give one."""
    from agentspecs.apps import AppPapStanding

    allows = AppPapStanding(
        connection="bank",
        action="buy",
        limits=[{"path": "amount.amount", "maximum": "maximum"}],
        uses="uses",
        days="days",
    )
    giving = AppPapOperation(
        action="payments.allow",
        allows=allows,
        summary="Pay up to {maximum}, {uses} times, for {days} days",
    )
    with pytest.raises(
        ValueError, match="gives no standing permission: payments.allow"
    ):
        PapCompanyCapability(
            name="X",
            domain=DOMAIN,
            company=COMPANY.model_copy(update={"operations": [giving]}),
            application=A2AApplication(
                "https://runtime.local/a2a", http_client=httpx.AsyncClient()
            ),
            accounts=Accounts(),
            http_client=httpx.AsyncClient(),
        )
