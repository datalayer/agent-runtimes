# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application showing two companies working together over PAP, by composition.

Draft 0.3 defines no company-to-company protocol. Ledgerly, an accounting firm, is
a PAP company to Ada's personal agent (Atlas) and, for the same Ada, a PAP personal
agent at Northwind Bank. Every approval is an Operation, and Ada is asked about each.
"""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import (
    Author,
    ConversationClient,
    DeviceSignInClient,
    DiscoveryClient,
    Message,
    SessionClient,
    SessionHttpClient,
    generate_message_id,
)
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    ScriptedApprovals,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.ledgerly import DOMAIN as LEDGERLY
from personal_agent_protocol.demo.ledgerly import ledgerly
from personal_agent_protocol.demo.northwind import ACCOUNT, northwind
from personal_agent_protocol.operations import OperationsClient

from agent_runtimes.apps import Application

TENANT = "atlas-example"
PAIRWISE = "usr_ada_at_ledgerly_00000000"

app = Application(
    id="pap-two-companies",
    name="PAP Two Companies",
    description="Ledgerly is a company to Ada's agent and her personal agent at Northwind Bank.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use run_two_companies to show how Ledgerly pays Ada's invoices at Northwind "
        "Bank for her. Be clear that this is composition of two PAP relationships, not "
        "a company-to-company protocol. Never expose tokens, codes, or Session JWTs."
    ),
)


@app.tool(does="read")
async def run_two_companies() -> dict[str, Any]:
    """Run Ada → Atlas → Ledgerly → Northwind; return safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    bank, bank_plugin = northwind(network, clock)
    firm, at_northwind = ledgerly(network, clock)
    http = network.client()
    ada = ScriptedApprovals(always=True)
    host = PersonalAgentHost(atlas, clock, approvals=ada)
    reactor = personal_agent_reactor(host, network=network, http_client=http)
    transport = SessionHttpClient(reactor=reactor, http_client=http)
    conversations = ConversationClient(transport=transport)
    operations = OperationsClient(reactor=reactor)

    # Atlas signs Ada in to Ledgerly (Device Sign-In on Ledgerly's page).
    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
        LEDGERLY
    )
    metadata = company.oauth_metadata
    if not (
        metadata is not None and metadata.device_authorization_endpoint is not None
    ):
        raise RuntimeError("the example world is incomplete")
    session = await SessionClient(reactor=reactor, http_client=http).start(
        client_id=atlas.client_id,
        pairwise_user_id=PAIRWISE,
        issuer=metadata.issuer,
        tenant_id=TENANT,
    )
    device = DeviceSignInClient(reactor=reactor, http_client=http)
    started = await device.begin(
        device_authorization_endpoint=metadata.device_authorization_endpoint,
        token_endpoint=metadata.token_endpoint,
        issuer=metadata.issuer,
        client_id=atlas.client_id,
        scopes=("books:read", "payments:write"),
        tenant_id=TENANT,
        organization=company.document.organization,
        protected_resources=metadata.protected_resources,
    )
    await firm.approve_device(started.user_code, account_id="acct_ada_ledgerly")
    clock.advance(started.poll_interval)
    token = (await device.poll(started.reference)).token
    if not (token is not None):
        raise RuntimeError("the example world is incomplete")
    chat = company.document.agent.protocols[0].endpoint  # type: ignore[union-attr]
    cursor: dict[str, Any] = {}

    async def send(fields: dict[str, Any]):  # type: ignore[no-untyped-def]
        message = Message(id=generate_message_id(reactor), **fields)
        if not cursor:
            page = await conversations.start(
                chat, message, session=session, token=token, wait=0
            )
        else:
            page = await conversations.send(
                chat,
                cursor["id"],
                message,
                session=session,
                token=token,
                cursor=cursor["at"],
                wait=0,
            )
        cursor.update(id=page.conversation_id, at=page.cursor)
        return [e for e in page.events if e.type != "state"][-1].message

    async def say(text: str):  # type: ignore[no-untyped-def]
        return await send({"author": Author(type="human"), "text": text})

    # 1. Ledgerly is not yet connected to Northwind: Ada approves it on Northwind's page.
    connect = (await say("Pay INV-0042")).data["connect"]
    await bank.approve_device(connect["user_code"], account_id=ACCOUNT)
    clock.advance(5)

    # 2. Northwind's operation comes back as a Ledgerly operation quoting it as written.
    relayed = (await say("Done. Pay INV-0042")).operation
    performed_before_approval = len(bank_plugin.executor.performed)

    # 3. Ada approves in Atlas; Ledgerly sends Northwind the approval of that exact revision.
    approval = await operations.ask_user(
        relayed, organization=company.document.organization, tenant_id=TENANT
    )
    paid = await send({"author": Author(type="agent"), "approval": approval})
    first = await bank.operation_record(bank_plugin.executor.performed[0])

    # 4. The next payment is asked about too: an approval says nothing of the next one.
    second = (await say("Pay INV-0043")).operation
    await http.aclose()

    return {
        "composition": (
            "Atlas is Ada's personal agent at Ledgerly; Ledgerly is Ada's personal agent "
            "at Northwind. No company-to-company protocol is involved."
        ),
        "ledgerly_identity_at_northwind": at_northwind.identity.client_id,
        "connect_at": connect["verification_uri"],
        "relayed_summary": relayed.summary,
        "ada_was_asked_by": ada.asked[0].company_name,
        "bank_payments_before_ada_approved": performed_before_approval,
        "after_ada_approved": paid.text,
        "bank_record_approved_revision": first.approved,
        "next_payment_asks_ada": second.summary if second else None,
        "bank_payments_performed": len(bank_plugin.executor.performed),
        "tokens_codes_and_session_jwts_withheld": True,
    }
