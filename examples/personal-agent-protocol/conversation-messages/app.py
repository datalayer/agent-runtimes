# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate PAP conversation creation without model-visible credentials."""

from __future__ import annotations

import httpx
from personal_agent_protocol import (
    DPOP_PROOF_PROVIDERS,
    ConversationClient,
    DpopHttpClient,
    Message,
    SessionToken,
    build_pap_reactor,
    generate_message_id,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application


class Proofs:
    async def create(self, request: object) -> SecretStr:
        return SecretStr("host-only-proof")


class Plugin:
    def provide_contributions(self, contributions: object) -> None:
        contributions.contribute(  # type: ignore[attr-defined]
            DPOP_PROOF_PROVIDERS, Proofs(), contribution_id="protected-dpop"
        )


app = Application(
    id="pap-conversation-messages",
    name="PAP Conversation Messages",
    description="Start and continue a conversation with idempotent message IDs.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions="Use demonstrate_conversation. Never expose PAP credentials or identity.",
)


@app.tool(does="read")
async def demonstrate_conversation() -> dict[str, object]:
    """Exercise two messages while returning only safe state."""

    calls = 0

    def company(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(
            201 if calls == 1 else 202,
            json={
                "conversation_id": "cnv_demo",
                "status": "working",
                "responder": "agent",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="conversation-example", version="1"), Plugin()
        )
        client = ConversationClient(
            transport=DpopHttpClient(reactor=reactor, http_client=http)
        )
        token = SessionToken(
            access_token=SecretStr("host-only-token"),
            token_type="DPoP",  # noqa: S106 - OAuth token type
            expires_in=300,
            session_id="ses_demo",
            signed_in=False,
        )
        first = Message(
            id=generate_message_id(reactor),
            sender="agent",
            text="Can this order be returned?",
        )
        started = await client.start(
            "https://api.shop.example/poppy/conversations",
            first,
            token=token,
            tenant_id="demo",
            pairwise_user_id="usr_host_only",
            issuer="https://auth.shop.example",
        )
        follow_up = Message(
            id=generate_message_id(reactor),
            sender="agent",
            context={"user_available": False},
        )
        continued = await client.send(
            "https://api.shop.example/poppy/conversations",
            started.conversation_id,
            follow_up,
            token=token,
            tenant_id="demo",
            pairwise_user_id="usr_host_only",
            issuer="https://auth.shop.example",
        )
        reactor.stop()
    return {
        "conversation_id": continued.conversation_id,
        "unique_message_ids": first.id != follow_up.id,
        "retry_rule": "retain the same message and ID",
        "credentials_withheld": True,
    }
