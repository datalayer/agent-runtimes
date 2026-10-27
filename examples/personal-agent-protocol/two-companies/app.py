# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Two companies working together over PAP: Ledgerly pays at Northwind Bank for Ada."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import (
    Author,
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
from personal_agent_protocol.demo.ledgerly import ledgerly
from personal_agent_protocol.demo.northwind import ACCOUNT, northwind
from personal_agent_protocol.operations import OperationsClient, approve

from agent_runtimes.loop.apps import Application

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_ledgerly_00000000"


def _last(page: Any, what: str) -> Any:
    """The page's last event carrying a `message` (or an `error`): SDK 0.10 ends a
    page with the conversation's state, so it is not always the last event.
    """
    return next(
        getattr(event, what)
        for event in reversed(page.events)
        if getattr(event, what, None) is not None
    )


app = Application(
    id="pap-two-companies",
    name="PAP Two Companies",
    description="Ledgerly is a company to Ada's agent and her personal agent at Northwind Bank.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_two_companies. Every approval is an Operation, never a chat "
        "message. Never expose a user code, token, assertion, or proof."
    ),
)


@app.tool(does="read")
async def explain_two_companies() -> dict[str, Any]:
    """Run the two-company world and return who approved what, and where."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    bank, bank_plugin = northwind(network, clock)
    firm, at_northwind = ledgerly(network, clock)
    async with network.client() as http:
        reactor = personal_agent_reactor(
            PersonalAgentHost(atlas, clock), network=network, http_client=http
        )
        transport = DpopHttpClient(reactor=reactor, http_client=http)
        conversations = ConversationClient(transport=transport)
        operations = OperationsClient(transport=transport)

        # Atlas signs Ada in to Ledgerly, on Ledgerly's page.
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "ledgerly.example"
        )
        metadata = company.oauth_metadata
        assert metadata is not None and metadata.device_authorization_endpoint
        assert company.document.agent is not None
        who = {
            "tenant_id": TENANT,
            "issuer": metadata.issuer,
        }
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id=atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=metadata.issuer,
            token_endpoint=metadata.token_endpoint,
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
            session_key=session.session_key,
            organization=company.document.organization,
            protected_resources=metadata.protected_resources,
        )
        await firm.approve_device(started.user_code, account_id="acct_ada_ledgerly")
        clock.advance(started.poll_interval)
        token = (await device.poll(started.reference)).token
        assert token is not None

        endpoint = company.document.agent.protocols[0].endpoint
        ops = firm.config.operations_endpoint

        async def say(
            conversation_id: str | None, cursor: str | None, text: str
        ) -> Any:
            message = Message(
                id=generate_message_id(reactor), author=Author(type="human"), text=text
            )
            if conversation_id is None:
                return await conversations.start(
                    endpoint, message, token=token, wait=0, **who
                )
            return await conversations.send(
                endpoint,
                conversation_id,
                message,
                token=token,
                cursor=cursor,
                wait=0,
                **who,
            )

        # 1. Ledgerly connects to Northwind as Ada's personal agent there.
        page = await say(None, None, "Pay INV-0042")
        connect = _last(page, "message").data["connect"]
        await bank.approve_device(connect["user_code"], account_id=ACCOUNT)
        clock.advance(5)

        # 2. Northwind's proposal reaches Ada as a Ledgerly operation; she approves it.
        page = await say(page.conversation_id, page.cursor, "Done. Pay INV-0042")
        relayed = _last(page, "message").operation
        paid = await operations.confirm(
            ops, relayed, approval=approve(relayed), token=token, **who
        )

        # 3. A bounded standing permission is itself an operation Ada approves.
        page = await say(
            page.conversation_id,
            page.cursor,
            "Allow Ledgerly to pay Acme invoices up to EUR 2000 without asking",
        )
        grant = _last(page, "message").operation
        granted = await operations.confirm(
            ops, grant, approval=approve(grant), token=token, **who
        )

        # 4. Within the bounds Ledgerly pays and tells Ada; beyond them it asks again.
        page = await say(page.conversation_id, page.cursor, "Pay INV-0043")
        within = _last(page, "message")
        page = await say(page.conversation_id, page.cursor, "Pay INV-0044")
        beyond = _last(page, "message").operation

    at_bank = [
        (await bank.operation_record(op_id)).operation
        for op_id in bank_plugin.executor.performed
    ]
    permission = next(iter(at_northwind.standing.permissions.values()))
    return {
        "personal_agent": "Atlas",
        "companies": [company.document.organization.name, "Northwind Bank"],
        "ledgerly_connected_at_northwind_on_northwinds_page": connect[
            "verification_uri"
        ],
        "relayed_operation_quotes_northwind": relayed.summary,
        "relayed_needs_adas_approval": relayed.user_approval_required,
        "first_payment_result": paid.operation.result.summary,
        "standing_permission_granted": granted.operation.state,
        "standing_permission_summary": grant.summary,
        "standing_uses_left": permission.uses_remaining,
        "within_bounds_told": within.text,
        "within_bounds_needed_no_new_approval": within.operation is None,
        "beyond_bounds_asks_again": beyond is not None
        and beyond.user_approval_required,
        "beyond_bounds_summary": beyond.summary if beyond is not None else None,
        "northwind_payments_performed": len(at_bank),
        "northwind_approved_by": [op.confirmation.approved_by for op in at_bank],
        "user_codes_tokens_and_proofs_withheld": True,
    }
