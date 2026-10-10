# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Consume ordered PAP conversation events without model-visible credentials."""

from __future__ import annotations

import httpx
from personal_agent_protocol import (
    DPOP_PROOF_PROVIDERS,
    ConversationClient,
    DpopHttpClient,
    SessionToken,
    build_pap_reactor,
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
    id="pap-conversation-events",
    name="PAP Conversation Events",
    description="Follow ordered events with cursor recovery and duplicate suppression.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions="Use follow_conversation. Never expose PAP credentials or identity.",
)


@app.tool(does="read")
async def follow_conversation() -> dict[str, object]:
    """Exercise event polling while returning only safe event evidence."""

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
                                    "sender": "agent",
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
            transport=DpopHttpClient(reactor=reactor, http_client=http)
        )
        token = SessionToken(
            access_token=SecretStr("host-only-token"),
            token_type="DPoP",  # noqa: S106 - OAuth token type
            expires_in=300,
            session_id="ses_demo",
            signed_in=False,
        )
        events = [
            event
            async for event in client.events(
                "https://api.shop.example/poppy/conversations",
                "cnv_demo",
                token=token,
                tenant_id="demo",
                pairwise_user_id="usr_host_only",
                issuer="https://auth.shop.example",
                wait=30,
            )
        ]
        reactor.stop()

    return {
        "event_ids": [event.id for event in events],
        "event_types": [event.type for event in events],
        "ordered": [event.id for event in events] == ["evt_reply", "evt_closed"],
        "closed": events[-1].status == "closed",
        "credentials_withheld": True,
    }
