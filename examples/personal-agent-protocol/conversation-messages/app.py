# Copyright (c) 2025-2026 Datalayer, Inc.
#
# Distributed under the terms of the Modified BSD License.

"""A Pydantic AI tool that starts and continues a PAP conversation safely."""

from __future__ import annotations

import httpx
from personal_agent_protocol import (
    SESSION_SIGNERS,
    Author,
    ConversationClient,
    Message,
    SessionClient,
    SessionHttpClient,
    build_pap_reactor,
    generate_message_id,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.apps import Application


class SessionJwts:
    async def sign(self, request: object) -> SecretStr:
        return SecretStr("host-only-session-jwt")


class Plugin:
    def provide_contributions(self, contributions: object) -> None:
        contributions.contribute(  # type: ignore[attr-defined]
            SESSION_SIGNERS, SessionJwts(), contribution_id="protected-session-signer"
        )


app = Application(
    id="pap-conversation-messages",
    name="PAP Conversation Messages",
    description="Start and continue a conversation with idempotent message IDs.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions="Use demonstrate_conversation. Never expose PAP credentials or identity.",
)


@app.tool(does="read")
async def demonstrate_conversation() -> dict[str, object]:
    """Start and continue one local PAP conversation."""

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
            transport=SessionHttpClient(reactor=reactor, http_client=http)
        )
        # A Session is local: signed out, and with no request sent.
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id="https://assistant.example/agent.json",
            pairwise_user_id="usr_host_only_example",
            issuer="https://auth.shop.example",
            tenant_id="demo",
        )
        # The personal agent writes this message itself: its `author` is `agent`.
        first = Message(
            id=generate_message_id(reactor),
            author=Author(type="agent"),
            text="Can this order be returned?",
        )
        started = await client.start(
            "https://api.shop.example/poppy/conversations",
            first,
            session=session,
        )
        follow_up = Message(
            id=generate_message_id(reactor),
            author=Author(type="agent"),
            context={"user_available": False},
        )
        continued = await client.send(
            "https://api.shop.example/poppy/conversations",
            started.conversation_id,
            follow_up,
            session=session,
        )
        reactor.stop()
    return {
        "conversation_id": continued.conversation_id,
        "unique_message_ids": first.id != follow_up.id,
        "retry_rule": "retain the same Message object and ID",
        "credentials_withheld": True,
    }
