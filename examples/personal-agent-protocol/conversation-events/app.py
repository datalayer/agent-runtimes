# Copyright (c) 2025-2026 Datalayer, Inc.
#
# Distributed under the terms of the Modified BSD License.

"""A Pydantic AI tool that consumes PAP conversation events safely."""

from __future__ import annotations

import httpx
from personal_agent_protocol import (
    SESSION_SIGNERS,
    ConversationClient,
    SessionClient,
    SessionHttpClient,
    build_pap_reactor,
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
    id="pap-conversation-events",
    name="PAP Conversation Events",
    description="Follow ordered events with cursor recovery and duplicate suppression.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions="Use follow_conversation. Never expose PAP credentials or identity.",
)


@app.tool(does="read")
async def read_conversation_events() -> dict[str, object]:
    """Read ordered local events and return only safe conversation content."""

    calls = 0

    def company(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        event_id = "evt_reply" if calls == 1 else "evt_closed"
        return httpx.Response(
            200,
            json={
                "conversation_id": "cnv_demo",
                "events": [
                    {
                        "id": event_id,
                        "type": "message" if calls == 1 else "state",
                        "created_at": "2026-10-10T12:00:00Z",
                        **(
                            {
                                "message": {
                                    "id": "msg_reply",
                                    "author": {"type": "agent"},
                                    "role": "company",
                                    "text": "The return is approved.",
                                }
                            }
                            if calls == 1
                            else {"status": "closed", "responder": "agent"}
                        ),
                    }
                ],
                "cursor": event_id,
                "has_more": calls == 1,
                "status": "working" if calls == 1 else "closed",
                "responder": "agent",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(
            http_client=http,
            plugins=[
                (
                    PluginManifest(name="conversation-events-example", version="1"),
                    Plugin(),
                )
            ],
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
        events = [
            event
            async for event in client.events(
                "https://api.shop.example/poppy/conversations",
                "cnv_demo",
                session=session,
                wait=30,
            )
        ]
        reactor.stop()

    return {
        "event_types": [event.type for event in events],
        "company_messages": [
            event.message.text
            for event in events
            if event.message is not None and event.message.role == "company"
        ],
        "closed": events[-1].status == "closed",
        "credentials_withheld": True,
    }
