# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application demonstrating PAP conversation streaming over SSE."""

from __future__ import annotations

from typing import Any

import httpx
from personal_agent_protocol import (
    Author,
    ConversationClient,
    DiscoveryClient,
    Message,
    SessionClient,
    SessionHttpClient,
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

from agent_runtimes.apps import Application

TENANT = "atlas-example"
PAIRWISE = "usr_ada_at_manzanita_000000"


class DroppedConnection(httpx.AsyncBaseTransport):
    """The network between Atlas and Manzanita: the first stream breaks mid-message.

    Every other request passes through unchanged. It records the `Last-Event-ID`
    each stream was opened with.
    """

    def __init__(self, inner: httpx.AsyncClient) -> None:
        self.inner = inner
        self.streams_opened: list[str | None] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        response = await self.inner.send(request)
        if request.headers.get("accept") != "text/event-stream":
            return httpx.Response(
                response.status_code, headers=response.headers, content=response.content
            )
        self.streams_opened.append(request.headers.get("last-event-id"))
        body = response.content
        if len(self.streams_opened) == 1:
            # Cut right after the first `text-delta` frame: the message never arrives.
            start = body.find(b"event: text-delta")
            body = body[: body.find(b"\n\n", start) + 2]
        return httpx.Response(
            response.status_code,
            headers={"Content-Type": response.headers["content-type"]},
            content=body,
        )


app = Application(
    id="pap-conversation-streaming",
    name="PAP Conversation Streaming",
    description="Stream a company conversation over SSE and act only on complete events.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_conversation_streaming to explain PAP conversation streaming. "
        "Text deltas are for display only: never act on one. Never expose tokens or Session JWTs."
    ),
)


@app.tool(does="read")
async def explain_conversation_streaming() -> dict[str, Any]:
    """Stream a Manzanita conversation through a dropped connection; return safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    manzanita(network, clock)
    wire = DroppedConnection(network.client())
    http = httpx.AsyncClient(transport=wire)
    reactor = personal_agent_reactor(
        PersonalAgentHost(atlas, clock), network=network, http_client=http
    )
    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
        "manzanita.example"
    )
    metadata = company.oauth_metadata
    if not (metadata is not None):
        raise RuntimeError("the example world is incomplete")
    session = await SessionClient(reactor=reactor, http_client=http).start(
        client_id=atlas.client_id,
        pairwise_user_id=PAIRWISE,
        issuer=metadata.issuer,
        tenant_id=TENANT,
    )
    conversations = ConversationClient(
        transport=SessionHttpClient(reactor=reactor, http_client=http)
    )
    endpoint = company.document.agent.protocols[0].endpoint  # type: ignore[union-attr]
    receipt = await conversations.start(
        endpoint,
        Message(
            id=generate_message_id(reactor), author=Author(type="human"), text="Hello"
        ),
        session=session,
    )

    deltas: list[TextDelta] = []
    reconnects: list[StreamReconnected] = []
    delivered: list[str] = []
    final_text: list[str] = []
    last_state = None
    async for item in conversations.stream(
        endpoint, receipt.conversation_id, session=session
    ):
        if isinstance(item, TextDelta):
            deltas.append(item)  # display only: shown while typing, never acted on
        elif isinstance(item, StreamReconnected):
            reconnects.append(item)
            if len(reconnects) == 2:
                # Everything is delivered; the user is done, so the agent closes it.
                await conversations.close(
                    endpoint, receipt.conversation_id, session=session
                )
        else:
            delivered.append(item.id)
            last_state = item.status if item.type == "state" else last_state
            if item.message is not None and item.message.role == "company":
                final_text.append(item.message.text or "")
    await http.aclose()
    await wire.inner.aclose()

    return {
        "stream_openings_last_event_id": [
            "none" if value is None else "last handled event"
            for value in wire.streams_opened
        ],
        "reconnects": len(reconnects),
        "partial_messages_discarded": [
            len(item.discarded_message_ids) for item in reconnects
        ],
        "text_deltas_seen": len(deltas),
        "any_delta_actionable": any(delta.actionable for delta in deltas),
        "events_delivered_once": len(delivered) == len(set(delivered)),
        "events_delivered": len(delivered),
        "company_reply_from_the_complete_message": final_text,
        "stopped_on_state": last_state,
        "session_jwts_withheld": True,
    }
