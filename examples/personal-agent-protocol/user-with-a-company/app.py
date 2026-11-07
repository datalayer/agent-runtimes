# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application walking one user through a whole PAP journey with one company.

Ada asks her personal agent, Atlas, to exchange a jacket at Manzanita Outfitters:
discovery, a signed-out Session, sign-in mid-conversation, an exact approval, a
approved exchange, and finally narrowing and revoking the refresh token.
"""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import (
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
from personal_agent_protocol.accounts import RefreshTokenClient, RefreshTokenContext
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    ScriptedApprovals,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import DOMAIN, manzanita
from personal_agent_protocol.operations import OperationsClient, operations_negotiated

from agent_runtimes.apps import Application

TENANT = "atlas-example"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-user-with-a-company",
    name="PAP User with a Company",
    description="Ada's personal agent and Manzanita Outfitters, from question to confirmed exchange.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use run_manzanita_journey to show how Ada's personal agent exchanges a jacket "
        "with Manzanita over PAP. Say what Ada approved and what the company did. Never "
        "expose tokens, codes, or Session JWTs."
    ),
)


@app.tool(does="read")
async def run_manzanita_journey() -> dict[str, Any]:
    """Run the whole journey against the reference company; return safe evidence."""

    steps: list[str] = []
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, shop_plugin = manzanita(network, clock)
    http = network.client()
    approvals = ScriptedApprovals(
        always=True
    )  # the host's own surface, a script for Ada
    reactor = personal_agent_reactor(
        PersonalAgentHost(atlas, clock, approvals=approvals),
        network=network,
        http_client=http,
    )
    transport = SessionHttpClient(reactor=reactor, http_client=http)
    conversations = ConversationClient(transport=transport)

    def say(text: str) -> Message:
        return Message(
            id=generate_message_id(reactor), author=Author(type="human"), text=text
        )

    # Discovery and a signed-out Session.
    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(DOMAIN)
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
    name = company.document.organization.name
    steps.append(f"discovered {name}; signed-out Session, its ID chosen here")

    # A question only a signed-in user can have answered.
    endpoint = company.document.agent.protocols[0].endpoint  # type: ignore[union-attr]
    page = await conversations.start(
        endpoint, say("Where is my jacket order?"), session=session, wait=0
    )
    asked = [e for e in page.events if e.type != "state"][-1]
    conversation_id = page.conversation_id
    steps.append(f"company asked for more scope: {asked.error} ({asked.scope})")

    # Device Sign-In: Ada approves on Manzanita's own page.
    device = DeviceSignInClient(reactor=reactor, http_client=http)
    started = await device.begin(
        device_authorization_endpoint=metadata.device_authorization_endpoint,
        token_endpoint=metadata.token_endpoint,
        issuer=metadata.issuer,
        client_id=atlas.client_id,
        scopes=("orders:read", "orders:write"),
        tenant_id=TENANT,
        organization=company.document.organization,
        protected_resources=metadata.protected_resources,
    )
    steps.append(f"Ada opened {started.verification_uri} and entered the code")
    await shop.approve_device(started.user_code, account_id="acct_ada")
    clock.advance(started.poll_interval)
    done = await device.poll(started.reference)
    signed_in = done.token
    if not (signed_in is not None and done.refresh_token_reference is not None):
        raise RuntimeError("the example world is incomplete")
    steps.append(f"same Session signed in with {', '.join(done.granted_scopes)}")

    # The same conversation continues; the company proposes the exchange.
    page = await conversations.send(
        endpoint,
        page.conversation_id,
        say("Exchange it for something warmer"),
        session=session,
        token=signed_in,
        cursor=page.cursor,
        wait=0,
    )
    proposal = [e for e in page.events if e.type != "state"][-1].message.operation  # type: ignore[union-attr]
    if not (proposal is not None):
        raise RuntimeError("the example world is incomplete")
    steps.append(f"company proposed revision {proposal.revision}: {proposal.summary}")

    # Ada approves exactly that revision, in the host's own interface; it is done once.
    if not operations_negotiated(
        company.document, ClientMetadata.model_validate(atlas.metadata)
    ):
        raise RuntimeError("the example world is incomplete")
    approval = await OperationsClient(reactor=reactor).ask_user(
        proposal, organization=company.document.organization, tenant_id=TENANT
    )

    async def send_approval() -> Any:
        return await conversations.send(
            endpoint,
            page.conversation_id,
            Message(
                id=generate_message_id(reactor),
                author=Author(type="agent"),
                approval=approval,
            ),
            session=session,
            token=signed_in,
            wait=0,
        )

    outcome = await send_approval()
    result = [
        e.message for e in outcome.events if e.message and e.message.role == "company"
    ][-1]
    await send_approval()
    steps.append(f"Ada approved; Manzanita: {result.text}")

    # The refresh token: narrowed for read-only follow-up, then revoked.
    accounts = RefreshTokenClient(reactor=reactor, http_client=http)
    context = RefreshTokenContext(
        token_endpoint=metadata.token_endpoint,
        revocation_endpoint=metadata.revocation_endpoint,
        issuer=metadata.issuer,
        client_id=atlas.client_id,
        tenant_id=TENANT,
    )
    narrowed = await accounts.refresh(
        done.refresh_token_reference,
        context=context,
        scopes=("orders:read",),
    )
    revoked = await accounts.revoke(done.refresh_token_reference, context=context)
    steps.append("Ada signed out: refresh token revoked")
    await http.aclose()

    return {
        "steps": steps,
        "conversation_kept_its_id_across_sign_in": page.conversation_id
        == conversation_id,
        "ada_was_asked": len(approvals.asked),
        "exchanges_performed": len(shop_plugin.executor.performed),
        "narrowed_to": narrowed.granted_scopes,
        "revoked": revoked.revoked,
        "tokens_codes_and_session_jwts_withheld": True,
    }
