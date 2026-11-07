# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application demonstrating PAP refresh tokens against a real PAP company."""

from __future__ import annotations

import asyncio
from typing import Any

from personal_agent_protocol import (
    AccessToken,
    Author,
    ConversationClient,
    ConversationError,
    DeviceSignInClient,
    DiscoveryClient,
    Message,
    PapSession,
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
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita

from agent_runtimes.apps import Application

TENANT = "atlas-example"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-account-tokens",
    name="PAP Refresh Tokens",
    description="Refresh, rotate, narrow, and revoke a refresh token kept behind a reference.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_account_tokens to explain PAP refresh tokens. Never ask for or "
        "expose a refresh token, access token, delegated key, assertion, or Session JWT."
    ),
)


@app.tool(does="read")
async def explain_account_tokens() -> dict[str, Any]:
    """Refresh, rotate, narrow, expire, and revoke refresh tokens; return safe evidence."""

    # Manzanita Outfitters (the reference company) and Atlas (Ada's personal agent),
    # both on an in-process network: real HTTP, real keys, nothing leaves the process.
    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    shop, _ = manzanita(network, clock)
    http = network.client()
    host = PersonalAgentHost(atlas, clock)
    reactor = personal_agent_reactor(host, network=network, http_client=http)
    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
        "manzanita.example"
    )
    metadata = company.oauth_metadata
    if not (
        metadata is not None and metadata.device_authorization_endpoint is not None
    ):
        raise RuntimeError("the example world is incomplete")
    sessions = SessionClient(reactor=reactor, http_client=http)
    device = DeviceSignInClient(reactor=reactor, http_client=http)

    async def signed_in_session() -> tuple[PapSession, AccessToken, str]:
        """A signed-out Session, then Device Sign-In Ada approves on Manzanita's page."""

        session = await sessions.start(
            client_id=atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=metadata.issuer,
            tenant_id=TENANT,
        )
        started = await device.begin(
            device_authorization_endpoint=metadata.device_authorization_endpoint,  # type: ignore[arg-type]
            token_endpoint=metadata.token_endpoint,
            issuer=metadata.issuer,
            client_id=atlas.client_id,
            scopes=("orders:read", "orders:write"),
            tenant_id=TENANT,
            organization=company.document.organization,
            protected_resources=metadata.protected_resources,
        )
        await shop.approve_device(started.user_code, account_id="acct_ada")
        clock.advance(started.poll_interval)
        done = await device.poll(started.reference)
        if not (done.token is not None and done.refresh_token_reference is not None):
            raise RuntimeError("the example world is incomplete")
        return session, done.token, done.refresh_token_reference

    accounts = RefreshTokenClient(reactor=reactor, http_client=http)
    context = RefreshTokenContext(
        token_endpoint=metadata.token_endpoint,
        revocation_endpoint=metadata.revocation_endpoint,
        issuer=metadata.issuer,
        client_id=atlas.client_id,
        tenant_id=TENANT,
    )
    conversations = ConversationClient(
        transport=SessionHttpClient(reactor=reactor, http_client=http)
    )
    endpoint = company.document.agent.protocols[0].endpoint  # type: ignore[union-attr]

    def question() -> Message:
        return Message(
            id=generate_message_id(reactor),
            author=Author(type="human"),
            text="Where is my order?",
        )

    # 1. A refresh names no Session: it gets a new access token for the account, and the
    #    company rotates the refresh token. Any of the User's Sessions uses the new token.
    _, token, reference = await signed_in_session()
    stored_before = host.vault.values[reference]
    refreshed = await accounts.refresh(reference, context=context)
    rotated_in_place = host.vault.values[reference] is not stored_before
    another_session = await sessions.start(
        client_id=atlas.client_id,
        pairwise_user_id=PAIRWISE,
        issuer=metadata.issuer,
        tenant_id=TENANT,
    )
    answered = await conversations.start(
        endpoint, question(), session=another_session, token=refreshed.token, wait=0
    )

    # 2. Two refreshes at once: the Reactor `pap.refreshTokenLock` serializes them, so the
    #    second presents the token the first rotated in, never the one it revoked.
    racing = await asyncio.gather(
        accounts.refresh(reference, context=context),
        accounts.refresh(reference, context=context),
    )

    # 3. Narrower is allowed; wider is the user's decision, not a retry.
    narrowed = await accounts.refresh(
        reference, context=context, scopes=("orders:read",)
    )
    wider = await accounts.refresh(
        reference, context=context, scopes=("orders:read", "orders:admin")
    )

    # 4. Ninety-one days later the refresh token has expired: the company answers
    #    `invalid_grant`, so the stored copy is deleted and the Sessions go on signed out.
    clock.advance(91 * 24 * 3600)
    expired = await accounts.refresh(reference, context=context)
    expired_deleted = reference not in host.vault.values

    # 5. Revocation (RFC 7009) deletes the sign-in's access tokens: one still in hand is
    #    `invalid_token`, and the Session goes on signed out by sending no token.
    session, token, reference = await signed_in_session()
    revoked = await accounts.revoke(reference, context=context)
    try:
        await conversations.start(
            endpoint, question(), session=session, token=token, wait=0
        )
        refused_with = "accepted"
    except ConversationError as error:
        refused_with = error.code
    page = await conversations.start(endpoint, question(), session=session, wait=0)
    after_revocation = await accounts.refresh(reference, context=context)
    await http.aclose()

    return {
        "refresh_status": refreshed.status,
        "another_session_used_the_new_token": not any(
            event.type == "authorization" for event in answered.events
        ),
        "rotated": refreshed.rotated,
        "rotated_token_replaced_the_stored_one": rotated_in_place,
        "concurrent_refreshes_serialized": [result.status for result in racing],
        "narrowed_granted_scopes": narrowed.granted_scopes,
        "wider_request": wider.status,
        "expired_token": expired.status,
        "expired_token_deleted_locally": expired_deleted,
        "revoked_at_company": revoked.revoked,
        "revoked_token_deleted_locally": revoked.deleted_locally,
        "token_after_revocation": refused_with,
        "session_after_revocation": [event.type for event in page.events][-1]
        + ": "
        + str([e for e in page.events if e.type != "state"][-1].error),
        "refresh_after_revocation": after_revocation.status,
        "refresh_token_withheld": True,
        "access_tokens_and_session_jwts_withheld": True,
    }
