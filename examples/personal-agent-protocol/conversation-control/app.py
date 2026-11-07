# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application demonstrating PAP conversation control.

Sign-in mid-conversation, Direct Conversations, handoff to a person, and closing.
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from personal_agent_protocol import (
    Author,
    ConversationClient,
    ConversationError,
    DeviceSignInClient,
    DiscoveryClient,
    Message,
    SessionClient,
    SessionHttpClient,
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

from agent_runtimes.apps import Application

TENANT = "atlas-example"
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
        "Use explain_conversation_control to explain how a PAP conversation is signed "
        "in to, handed to the user directly or to a person at the company, and closed. "
        "Never expose tokens, codes, or Session JWTs."
    ),
)


@app.tool(does="read")
async def explain_conversation_control() -> dict[str, Any]:
    """Drive one Manzanita conversation through every control; return safe evidence."""

    clock = MutableClock()
    network = InProcessNetwork()
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    # Manzanita, this time with a support desk staffed (`humans_available`).
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
    http = network.client()
    reactor = personal_agent_reactor(
        PersonalAgentHost(atlas, clock), network=network, http_client=http
    )
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
    conversations = ConversationClient(
        transport=SessionHttpClient(reactor=reactor, http_client=http)
    )
    endpoint = company.document.agent.protocols[0].endpoint  # type: ignore[union-attr]

    def say(text: str, author: str = "agent") -> Message:
        return Message(
            id=generate_message_id(reactor),
            author=Author(type=author),  # type: ignore[arg-type]
            text=text,
        )

    # 1. Signed out, the company answers with an `authorization` event instead:
    #    `insufficient_scope`, with the scope the request needs.
    page = await conversations.start(
        endpoint, say("Where is my jacket order?"), session=session, wait=0
    )
    parent = page.conversation_id
    asked = [e for e in page.events if e.type != "state"][-1]

    # 2. The host signs Ada in (Device Sign-In on Manzanita's page) for that scope; the
    #    same Session and conversation continue signed in.
    device = DeviceSignInClient(reactor=reactor, http_client=http)
    started = await device.begin(
        device_authorization_endpoint=metadata.device_authorization_endpoint,
        token_endpoint=metadata.token_endpoint,
        issuer=metadata.issuer,
        client_id=atlas.client_id,
        scopes=tuple((asked.scope or "").split()),
        tenant_id=TENANT,
        organization=company.document.organization,
        protected_resources=metadata.protected_resources,
    )
    await shop.approve_device(started.user_code, account_id="acct_ada")
    clock.advance(started.poll_interval)
    token = (await device.poll(started.reference)).token
    if not (token is not None):
        raise RuntimeError("the example world is incomplete")
    page = await conversations.send(
        endpoint,
        parent,
        say("Where is my jacket order?"),
        session=session,
        token=token,
        cursor=page.cursor,
        wait=0,
    )
    answered = [e for e in page.events if e.type != "state"][-1].message

    # 3. Ada wants to talk to Manzanita herself: a Direct Conversation under the parent.
    direct = await conversations.start_direct(
        endpoint,
        parent,
        say("I'd like to ask about sizing myself", "human"),
        session=session,
        token=token,
    )
    refusals: dict[str, object] = {}
    for action in ("send", "handoff"):
        try:
            if action == "send":
                await conversations.send(
                    endpoint, parent, say("Still there?"), session=session, token=token
                )
            else:
                await conversations.handoff(
                    endpoint, parent, session=session, token=token
                )
        except ConversationError as error:
            refusals[action] = error.code
            refusals[f"{action}_names_the_open_direct_conversation"] = (
                error.details or {}
            ).get("conversation_id") == direct.conversation_id
    direct_closed = await conversations.close(
        endpoint, direct.conversation_id, session=session, token=token
    )

    # 4. Handoff to a person at the company; their replies' author is `human`.
    handed = await conversations.handoff(endpoint, parent, session=session, token=token)
    page = await conversations.send(
        endpoint,
        parent,
        say("Thank you"),
        session=session,
        token=token,
        cursor=page.cursor,
        wait=0,
    )
    after_handoff = [
        f"{event.type}:{event.status}" if event.status else event.type
        for event in page.events
    ]
    # A person at Manzanita answers; their message names its `author`: `human`, and who.
    await shop.staff_reply(
        parent,
        after=page.events[-1].id,
        text="Hi Ada, Sam here. Happy to help with the sizing.",
        author_id="staff_sam",
        author_name="Sam",
    )
    page = await conversations.read_events(
        endpoint, parent, session=session, token=token, cursor=page.cursor, wait=0
    )
    replies = [event.message for event in page.events if event.message is not None]
    person = replies[-1].author.model_dump(exclude_none=True) if replies else None

    # 5. Closing ends the conversation; what it started is not cancelled.
    closed = await conversations.close(endpoint, parent, session=session, token=token)
    try:
        await conversations.send(
            endpoint, parent, say("One more thing"), session=session, token=token
        )
        after_close = "accepted"
    except ConversationError as error:
        after_close = error.code
    await http.aclose()

    return {
        "signed_out_answer": f"{asked.type}: {asked.error} ({asked.scope})",
        "signed_in_same_conversation": page.conversation_id == parent,
        "signed_in_answer": answered.text if answered else None,
        "direct_conversation_opened": direct.conversation_id != parent,
        "parent_while_direct_is_open": refusals,
        "direct_conversation_closed": direct_closed.status,
        "handoff_status": handed.status,
        "handoff_responder": handed.responder,
        "events_after_handoff": after_handoff,
        "person_reply_author": person,
        "closed": closed.status,
        "message_after_close": after_close,
        "tokens_and_codes_withheld": True,
    }
