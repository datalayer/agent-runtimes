# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Open a Direct Conversation, hand off to a person, and close a PAP conversation."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from personal_agent_protocol import (
    Author,
    ConversationClient,
    ConversationError,
    DiscoveryClient,
    DpopHttpClient,
    Message,
    SessionClient,
    generate_message_id,
)
from personal_agent_protocol.company import build_company, company_app
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    ClockPlugin,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import CONFIG, DOMAIN, ManzanitaPlugin
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-conversation-control",
    name="PAP Conversation Control",
    description="Direct Conversations, handoff to a person, and closing, through the real client.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_conversation_control. Never expose a Session Token, proof, "
        "or pairwise identifier."
    ),
)


@app.tool(does="read")
async def explain_conversation_control() -> dict[str, Any]:
    """Drive conversation control against the demo company and return safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    # Manzanita, with people available to take a handed-off conversation.
    shop = build_company(
        replace(CONFIG, humans_available=True),
        http_client=network.client(),
        address_resolver=network.resolve,
        plugins=[
            (PluginManifest(name="manzanita", version="1"), ManzanitaPlugin()),
            (PluginManifest(name="manzanita-clock", version="1"), ClockPlugin(clock)),
        ],
    )
    network.add(DOMAIN, company_app(shop))
    async with network.client() as http:
        reactor = personal_agent_reactor(
            PersonalAgentHost(atlas, clock), network=network, http_client=http
        )
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            DOMAIN
        )
        metadata = company.oauth_metadata
        assert metadata is not None and company.document.agent is not None
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id=atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=metadata.issuer,
            token_endpoint=metadata.token_endpoint,
            tenant_id=TENANT,
        )
        who = {
            "tenant_id": TENANT,
            "issuer": metadata.issuer,
        }
        endpoint = company.document.agent.protocols[0].endpoint
        conversations = ConversationClient(
            transport=DpopHttpClient(reactor=reactor, http_client=http)
        )

        def say(text: str, author: str = "agent") -> Message:
            return Message(
                id=generate_message_id(reactor),
                author=Author(type=author),  # type: ignore[arg-type]
                text=text,
            )

        parent = await conversations.start(
            endpoint, say("Hello, can someone help me?"), token=session, **who
        )
        direct = await conversations.start_direct(
            endpoint,
            parent.conversation_id,
            say("I'll take it from here", author="human"),
            token=session,
            **who,
        )
        try:
            await conversations.send(
                endpoint,
                parent.conversation_id,
                say("Still there?"),
                token=session,
                **who,
            )
            refused_code, points_to_direct = None, False
        except ConversationError as error:
            refused_code = error.code
            points_to_direct = (error.details or {}).get("conversation_id") == (
                direct.conversation_id
            )
        direct_closed = await conversations.close(
            endpoint, direct.conversation_id, token=session, **who
        )
        handed_off = await conversations.handoff(
            endpoint, parent.conversation_id, token=session, **who
        )
        closed = await conversations.close(
            endpoint, parent.conversation_id, token=session, **who
        )
        history = await conversations.read_events(
            endpoint, parent.conversation_id, token=session, **who
        )

    return {
        "company": company.document.organization.name,
        "direct_conversation_opened": direct.conversation_id != parent.conversation_id,
        "parent_refused_while_direct_open": refused_code,
        "refusal_names_the_direct_conversation": points_to_direct,
        "direct_conversation_closed": direct_closed.status,
        "handoff_status": handed_off.status,
        "handoff_responder": handed_off.responder,
        "closed_status": closed.status,
        "parent_event_types": [event.type for event in history.events],
        "parent_states": [
            f"{event.status}/{event.responder}"
            for event in history.events
            if event.type == "state"
        ],
        "session_token_and_proofs_withheld": True,
    }
