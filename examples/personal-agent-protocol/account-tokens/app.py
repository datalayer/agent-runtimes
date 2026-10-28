# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Use a PAP Account Token through a safe Agent Runtimes tool."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import DeviceSignInClient, DiscoveryClient, SessionClient
from personal_agent_protocol.accounts import AccountTokenClient, AccountTokenContext
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita

from agent_runtimes.apps import Application

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-account-tokens",
    name="PAP Account Tokens",
    description="Refresh, rotate, narrow, and revoke an Account Token kept behind a reference.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_account_tokens. Never request or expose an Account Token, "
        "Session Token, Session Key, assertion, proof, or token reference."
    ),
)


@app.tool(does="read")
async def explain_account_tokens() -> dict[str, Any]:
    """Run the real PAP Account Token client and return only lifecycle evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, _ = manzanita(network, clock)
    host = PersonalAgentHost(atlas, clock)
    async with network.client() as http:
        reactor = personal_agent_reactor(host, network=network, http_client=http)
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "manzanita.example"
        )
        metadata = company.oauth_metadata
        assert metadata is not None and metadata.device_authorization_endpoint
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id=atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=metadata.issuer,
            token_endpoint=metadata.token_endpoint,
            tenant_id=TENANT,
        )
        # Ada signs in on Manzanita's own page; the host keeps the Account Token.
        device = DeviceSignInClient(reactor=reactor, http_client=http)
        started = await device.begin(
            device_authorization_endpoint=metadata.device_authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            issuer=metadata.issuer,
            client_id=atlas.client_id,
            scopes=("orders:read", "orders:write"),
            tenant_id=TENANT,
            session_key=session.session_key,
            organization=company.document.organization,
            protected_resources=metadata.protected_resources,
        )
        await shop.approve_device(started.user_code, account_id="acct_ada")
        clock.advance(started.poll_interval)
        signed_in = await device.poll(started.reference)
        reference = signed_in.account_token_reference
        assert reference is not None
        stored_before = host.vault.values[reference].get_secret_value()

        accounts = AccountTokenClient(reactor=reactor, http_client=http)
        context = AccountTokenContext(
            token_endpoint=metadata.token_endpoint,
            revocation_endpoint=metadata.revocation_endpoint,
            issuer=metadata.issuer,
            client_id=atlas.client_id,
            tenant_id=TENANT,
            pairwise_user_id=PAIRWISE,
        )
        refreshed = await accounts.refresh(
            reference, context=context, session_key=session.session_key
        )
        rotated_in_store = (
            host.vault.values[reference].get_secret_value() != stored_before
        )
        narrowed = await accounts.refresh(
            reference,
            context=context,
            session_key=session.session_key,
            scopes=("orders:read",),
        )
        wider = await accounts.refresh(
            reference,
            context=context,
            session_key=session.session_key,
            scopes=("orders:read", "orders:admin"),
        )
        revoked = await accounts.revoke(reference, context=context)
        after = await accounts.refresh(
            reference, context=context, session_key=session.session_key
        )

    return {
        "company": company.document.organization.name,
        "signed_in_with_device_sign_in": signed_in.status == "complete",
        "refresh_status": refreshed.status,
        "refresh_kept_the_session": refreshed.token is not None
        and refreshed.token.session_key == session.session_key,
        "rotated": refreshed.rotated,
        "rotated_token_replaced_the_stored_one": rotated_in_store,
        "narrowed_status": narrowed.status,
        "narrowed_scopes": narrowed.granted_scopes,
        "wider_request_status": wider.status,
        "revoked_at_company": revoked.revoked,
        "deleted_locally": revoked.deleted_locally,
        "status_after_revocation": after.status,
        "account_token_withheld": True,
        "session_tokens_withheld": True,
        "token_reference_withheld": True,
    }
