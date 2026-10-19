# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A user with a company: question, sign-in, the same conversation, one approved operation."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import (
    ConversationClient,
    DeviceSignInClient,
    DiscoveryClient,
    DpopHttpClient,
    Message,
    SessionClient,
    generate_message_id,
)
from personal_agent_protocol.accounts import AccountTokenClient, AccountTokenContext
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita
from personal_agent_protocol.models import ClientMetadata
from personal_agent_protocol.operations import (
    OperationsClient,
    approve,
    operations_endpoint,
)

from agent_runtimes.loop.apps import Application

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"


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
    id="pap-user-with-a-company",
    name="PAP User with a Company",
    description="Ada's personal agent and Manzanita Outfitters, from question to confirmed exchange.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_user_with_a_company. A chat message is never an approval. "
        "Never expose a user code, Session Token, Account Token, assertion, or proof."
    ),
)


@app.tool(does="read")
async def explain_user_with_a_company() -> dict[str, Any]:
    """Run the whole journey over in-process HTTP and return what each party saw."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, plugin = manzanita(network, clock)
    host = PersonalAgentHost(atlas, clock)
    async with network.client() as http:
        reactor = personal_agent_reactor(host, network=network, http_client=http)
        transport = DpopHttpClient(reactor=reactor, http_client=http)
        conversations = ConversationClient(transport=transport)

        def say(text: str) -> Message:
            return Message(id=generate_message_id(reactor), sender="human", text=text)

        # 1. Atlas discovers Manzanita and opens a signed-out, pairwise Session.
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "manzanita.example"
        )
        metadata = company.oauth_metadata
        assert metadata is not None and metadata.device_authorization_endpoint
        assert company.document.agent is not None
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id=atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=metadata.issuer,
            token_endpoint=metadata.token_endpoint,
            tenant_id=TENANT,
        )
        who = {
            "tenant_id": TENANT,
            "pairwise_user_id": PAIRWISE,
            "issuer": metadata.issuer,
        }
        endpoint = company.document.agent.protocols[0].endpoint

        # 2. Ada asks; Manzanita answers that it needs her to sign in.
        page = await conversations.start(
            endpoint, say("Where is my jacket order?"), token=session, wait=0, **who
        )
        asked_to_sign_in = _last(page, "error")
        first_conversation = page.conversation_id

        # 3. Device Sign-In: Ada approves on Manzanita's own page.
        device = DeviceSignInClient(reactor=reactor, http_client=http)
        started = await device.begin(
            device_authorization_endpoint=metadata.device_authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            issuer=metadata.issuer,
            client_id=atlas.client_id,
            scopes=("orders:read", "orders:write"),
            tenant_id=TENANT,
            pairwise_user_id=PAIRWISE,
            session_id=session.session_id,
            organization=company.document.organization,
            poppy_domains=metadata.poppy_domains,
        )
        await shop.approve_device(started.user_code, account_id="acct_ada")
        clock.advance(started.poll_interval)
        done = await device.poll(started.reference)
        token = done.token
        assert token is not None and done.account_token_reference is not None

        # 4. The same conversation continues, signed in; Manzanita proposes the exchange.
        page = await conversations.send(
            endpoint,
            page.conversation_id,
            say("Exchange it for something warmer"),
            token=token,
            cursor=page.cursor,
            wait=0,
            **who,
        )
        proposal = _last(page, "message").operation  # type: ignore[union-attr]
        assert proposal is not None

        # 5. Ada approves exactly this revision in Atlas; it is confirmed once.
        operations = OperationsClient(transport=transport)
        negotiated = operations_endpoint(
            company.document, ClientMetadata.model_validate(atlas.metadata)
        )
        assert negotiated is not None
        outcome = await operations.confirm(
            negotiated, proposal, approval=approve(proposal), token=token, **who
        )

        # 6. Ada disconnects Atlas: the Account Token is revoked at Manzanita.
        revoked = await AccountTokenClient(reactor=reactor, http_client=http).revoke(
            done.account_token_reference,
            context=AccountTokenContext(
                token_endpoint=metadata.token_endpoint,
                revocation_endpoint=metadata.revocation_endpoint,
                issuer=metadata.issuer,
                client_id=atlas.client_id,
                tenant_id=TENANT,
                pairwise_user_id=PAIRWISE,
            ),
        )

    confirmed = outcome.operation
    assert confirmed is not None and confirmed.confirmation and confirmed.result
    stored = await shop.operation_record(proposal.operation_id)
    return {
        "personal_agent": "Atlas",
        "company": company.document.organization.name,
        "first_reply_required": asked_to_sign_in,
        "signed_in_on_company_page": done.status == "complete",
        "same_session_signed_in": token.session_id == session.session_id,
        "granted_scopes": token.scopes,
        "same_conversation_continued": page.conversation_id == first_conversation,
        "proposed_operation": {
            "action": stored.action,
            "summary": proposal.summary,
            "revision": proposal.revision,
            "user_approval_required": proposal.user_approval_required,
        },
        "confirmed": {
            "state": confirmed.state,
            "approved_by": confirmed.confirmation.approved_by,
            "result_summary": confirmed.result.summary,
        },
        "performed_once": plugin.executor.performed == [proposal.operation_id],
        "company_knows_the_account_only_after_sign_in": stored.account_id == "acct_ada",
        "account_token_revoked": revoked.revoked,
        "user_code_and_credentials_withheld": True,
    }
