# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application demonstrating the PAP Operations extension (version 2)."""

from __future__ import annotations

from typing import Any

import httpx
from personal_agent_protocol import (
    Approval,
    Author,
    ClientMetadata,
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
from personal_agent_protocol.demo.northwind import ACCOUNT, DOMAIN, northwind
from personal_agent_protocol.operations import (
    OperationError,
    OperationsClient,
    operations_negotiated,
    terms_differences,
)

from agent_runtimes.apps import Application

TENANT = "atlas-example"
PAIRWISE = "usr_ada_at_northwind_00000"


class LostAnswer(httpx.AsyncBaseTransport):
    """The network between Atlas and Northwind: one message's answer is lost.

    When armed, the next message reaches the bank (which performs what it approves)
    and the answer never comes back. Every other request passes through unchanged.
    """

    def __init__(self, inner: httpx.AsyncClient) -> None:
        self.inner = inner
        self.armed = False

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        response = await self.inner.send(request)
        if self.armed and request.url.path.endswith("/messages"):
            self.armed = False
            raise httpx.ReadTimeout("the answer was lost", request=request)
        return httpx.Response(
            response.status_code, headers=response.headers, content=response.content
        )


app = Application(
    id="pap-operations",
    name="PAP Operations",
    description="The person asked about every revision: a no, new terms, a lost answer sent again, performed once.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_operations to explain PAP Operations. A chat message is never "
        "approval: only the user's approval of an exact revision, in the host's own "
        "interface, approves an operation. Never expose tokens or Session JWTs."
    ),
)


@app.tool(does="read")
async def explain_operations() -> dict[str, Any]:  # noqa: C901 - one walkthrough, in order
    """Ask, approve, revise, and recover a payment; return safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    plain = AgentIdentity(domain="plain.example", name="Plain", extensions=())
    for identity in (atlas, plain):
        network.add(identity.domain, identity.website())
    bank, bank_plugin = northwind(network, clock)
    wire = LostAnswer(network.client())
    http = httpx.AsyncClient(transport=wire)
    # The host's own approval surface: here a script answers for Ada, each time she is asked.
    ada = ScriptedApprovals(False, True, True)
    host = PersonalAgentHost(atlas, clock, approvals=ada)
    reactor = personal_agent_reactor(host, network=network, http_client=http)
    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(DOMAIN)
    metadata = company.oauth_metadata
    if not (
        metadata is not None and metadata.device_authorization_endpoint is not None
    ):
        raise RuntimeError("the example world is incomplete")

    # Ada signs Atlas in at Northwind (Device Sign-In on the bank's own page).
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
        scopes=("accounts:read", "payments:write"),
        tenant_id=TENANT,
        organization=company.document.organization,
        protected_resources=metadata.protected_resources,
    )
    await bank.approve_device(started.user_code, account_id=ACCOUNT)
    clock.advance(started.poll_interval)
    token = (await device.poll(started.reference)).token
    if not (token is not None):
        raise RuntimeError("the example world is incomplete")

    # Negotiation: both the bank's poppy.json and the agent's metadata list version 2.
    negotiated = operations_negotiated(
        company.document, ClientMetadata.model_validate(atlas.metadata)
    )
    without = operations_negotiated(
        company.document, ClientMetadata.model_validate(plain.metadata)
    )
    transport = SessionHttpClient(reactor=reactor, http_client=http)
    conversations = ConversationClient(transport=transport)
    operations = OperationsClient(reactor=reactor)
    chat = company.document.agent.protocols[0].endpoint  # type: ignore[union-attr]
    organization = company.document.organization

    # 1. The bank returns the payment as an operation in its message: nothing is done.
    page = await conversations.start(
        chat,
        Message(
            id=generate_message_id(reactor),
            author=Author(type="agent"),
            text="Pay INV-0042: EUR 1250.00 to Acme GmbH",
        ),
        session=session,
        token=token,
        wait=0,
    )
    first = [e for e in page.events if e.type != "state"][-1].message.operation  # type: ignore[union-attr]
    if not (first is not None):
        raise RuntimeError("the example world is incomplete")
    conversation = page.conversation_id

    async def approving(approval: Approval, message_id: str) -> Any:
        message = Message(id=message_id, author=Author(type="agent"), approval=approval)
        sent = await conversations.send(
            chat, conversation, message, session=session, token=token, wait=0
        )
        return [e for e in sent.events if e.message is not None and e.type != "state"][
            -1
        ].message

    # 2. Ada is asked in the host's own interface, and says no: nothing can be sent.
    try:
        await operations.ask_user(first, organization=organization, tenant_id=TENANT)
        declined = "approved"
    except OperationError as error:
        declined = error.code

    # 3. She says yes; the bank changes the terms before the approval lands. It performs
    #    nothing, and answers with a new revision of the same operation, never the one named.
    approval = await operations.ask_user(
        first, organization=organization, tenant_id=TENANT
    )
    await bank.revise(
        first.operation_id,
        summary=first.summary.replace("1250.00", "1262.50")
        + " Includes a EUR 12.50 fee.",
        terms={
            **(first.terms or {}),
            "amount": {"amount": "1262.50", "currency": "EUR"},
        },
    )
    answered = await approving(approval, generate_message_id(reactor))
    revised = answered.operation
    if not (revised is not None):
        raise RuntimeError("the example world is incomplete")

    # 4. An approval covers one revision: Ada is asked again, with what changed.
    newer = await operations.ask_user(
        revised, organization=organization, tenant_id=TENANT, replaces=first
    )
    changed = ada.asked[-1].changed

    # 5. The answer to the approval is lost. The same approval, in the same message, is
    #    sent again: the bank performs it once, and a retry adds nothing.
    wire.armed = True
    message_id = generate_message_id(reactor)
    sent = await operations.send(lambda given: approving(given, message_id), newer)
    told = await conversations.read_events(
        chat, conversation, session=session, token=token
    )
    said = [
        e.message
        for e in told.events
        if e.message is not None and e.message.role == "company"
    ]
    performed = len(bank_plugin.executor.performed)
    for client in (http, wire.inner):
        await client.aclose()

    return {
        "negotiated": negotiated,
        "negotiated_without_the_extension": without,
        "the_user_said_no": declined,
        "asked_about_every_revision": len(ada.asked),
        "company_named_when_asking": ada.asked[0].company_name,
        "terms_agree_with_the_summary": terms_differences(first) == (),
        "after_bank_revision": "a new revision"
        if revised.revision != first.revision
        else "same",
        "same_operation": revised.operation_id == first.operation_id,
        "changed_terms": changed,
        "lost_answer_retried": sent.status,
        "payments_performed": performed,
        "result_as_written": said[-1].text,
        "tokens_and_session_jwts_withheld": True,
    }
