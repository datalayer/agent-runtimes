# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Read a PAP conversation over SSE, with display-only deltas and Last-Event-ID resume."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import (
    Author,
    ConversationClient,
    DiscoveryClient,
    DpopHttpClient,
    Message,
    SessionClient,
    generate_message_id,
)
from personal_agent_protocol.conversations import StreamReconnected, TextDelta
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.manzanita import manzanita

from agent_runtimes.loop.apps import Application

TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"

app = Application(
    id="pap-conversation-streaming",
    name="PAP Conversation Streaming",
    description="Stream a company conversation over SSE and act only on complete events.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_conversation_streaming. Never act on a text delta, and never "
        "expose a Session Token, proof, or pairwise identifier."
    ),
)


@app.tool(does="read")
async def explain_conversation_streaming() -> dict[str, Any]:
    """Stream a real conversation from the demo company and return event evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    manzanita(network, clock)
    async with network.client() as http:
        reactor = personal_agent_reactor(
            PersonalAgentHost(atlas, clock), network=network, http_client=http
        )
        company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
            "manzanita.example"
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
        page = await conversations.start(
            endpoint,
            Message(
                id=generate_message_id(reactor),
                author=Author(type="human"),
                text="Hello",
            ),
            token=session,
            wait=0,
            **who,
        )
        await conversations.close(endpoint, page.conversation_id, token=session, **who)
        items = [
            item
            async for item in conversations.stream(
                endpoint, page.conversation_id, token=session, **who
            )
        ]
        events = [i for i in items if not isinstance(i, (TextDelta, StreamReconnected))]
        resumed = [
            item
            async for item in conversations.stream(
                endpoint,
                page.conversation_id,
                token=session,
                last_event_id=events[0].id,
                **who,
            )
        ]

    deltas = [item for item in items if isinstance(item, TextDelta)]
    replies = [
        e for e in events if e.message is not None and e.message.role == "company"
    ]
    resumed_events = [
        i for i in resumed if not isinstance(i, (TextDelta, StreamReconnected))
    ]
    return {
        "company": company.document.organization.name,
        "event_types": [event.type for event in events],
        "text_deltas": len(deltas),
        "deltas_are_display_only": all(delta.actionable is False for delta in deltas),
        "each_delta_completed_by_its_message": {d.message_id for d in deltas}
        <= {r.message.id for r in replies if r.message is not None},
        "company_reply": replies[0].message.text
        if replies and replies[0].message
        else None,
        "stream_ended_at": f"{events[-1].type}:{events[-1].status}",
        "resumed_from_last_event_id_skipped": len(events) - len(resumed_events),
        "resumed_stream_ended_at": f"{resumed_events[-1].type}:{resumed_events[-1].status}",
        "session_token_and_proofs_withheld": True,
    }
