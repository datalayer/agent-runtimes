# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Generate the redacted PAP traces the UI examples replay.

Each trace runs a world from the PAP Python SDK's `demo` package (real ES256
keys, Session JWTs, and HTTP over ASGI in one process; no network, no model)
and records, step by step:

- what the user sees in her personal agent (`chat`);
- what each party holds or knows (`views`), read from the parties' real state;
- the sequence: every HTTP exchange between the parties, and the user's own
  actions on a company's page or in her agent (`sequence`).

Every token, code, proof, assertion, credential, and key coordinate is
replaced by a placeholder such as `‹access token›`, and every random opaque
identifier by a stable one (`cnv_1`), so the output is deterministic. The
script refuses to write a trace in which a secret survives.

From the Agent Runtimes repository, with the PAP Python SDK installed; each
trace says the SDK release that recorded it:

```bash
python examples/personal-agent-protocol/traces/generate.py
```

It writes `src/examples/pap/traces/<slug>.json`. The commit hook then formats
them with prettier; the content is unchanged.
"""

from __future__ import annotations

import asyncio
import json
import re
import sys
from collections.abc import Awaitable, Callable
from dataclasses import replace
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlsplit

import httpx
from personal_agent_protocol import (
    Approval,
    Author,
    ClientMetadata,
    ConversationClient,
    DeviceSignInClient,
    DiscoveryClient,
    Message,
    Operation,
    OperationError,
    OperationsClient,
    SessionClient,
    SessionHttpClient,
    generate_message_id,
    operations_negotiated,
)
from personal_agent_protocol import (
    mediated_sign_in as mediated_offer,
)
from personal_agent_protocol.__version__ import __version__ as sdk_version
from personal_agent_protocol.accounts import RefreshTokenClient, RefreshTokenContext
from personal_agent_protocol.company import CompanyService, build_company, company_app
from personal_agent_protocol.conversations import StreamReconnected, TextDelta
from personal_agent_protocol.demo import kit
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    ClockPlugin,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
    ScriptedApprovals,
    ScriptedInput,
    personal_agent_reactor,
)
from personal_agent_protocol.demo.ledgerly import ledgerly
from personal_agent_protocol.demo.manzanita import (
    ADA,
    ADA_CODE,
    CONFIG,
    ManzanitaPlugin,
)
from personal_agent_protocol.demo.northwind import ACCOUNT, northwind
from personal_agent_protocol.mediated import MediatedSignInClient
from reactor import PluginManifest

ROOT = Path(__file__).parents[3]
OUTPUT = ROOT / "src" / "examples" / "pap" / "traces"
TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"
PAIRWISE_LEDGERLY = "usr_ada_at_ledgerly_00000000"

#: Field names whose values never appear in a trace.
SECRET_FIELDS = {
    "access_token": "‹access token›",
    "refresh_token": "‹refresh token›",
    "client_assertion": "‹client assertion›",
    "device_code": "‹device code›",
    "user_code": "‹user code›",
    "code": "‹one-time code›",
    "one_time_code": "‹one-time code›",
    "password": "‹password›",
    "email": "‹email›",
}
#: In a revocation request, `token` is the refresh token.
REVOCATION_FIELDS = {"token": "‹refresh token›"}
SECRET_HEADERS = {
    "authorization": "Bearer ‹access token›",
    "poppy-session": "‹Session JWT›",
}
KEPT_REQUEST_HEADERS = ("content-type", "accept", "last-event-id")
KEPT_RESPONSE_HEADERS = ("content-type", "cache-control", "retry-after", "location")
#: Opaque identifiers that are themselves secrets: a safety net behind SECRET_FIELDS.
SECRET_PREFIXES = {
    "at": "‹access token›",
    "rt": "‹refresh token›",
    "dev": "‹device code›",
}
OPAQUE = re.compile(
    r"(?<![A-Za-z0-9])(cnv|op|rev|msg|evt|sgn|si|usr|jti|mediated|account|device|u)"
    r"_([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])"
)
SECRET_OPAQUE = re.compile(
    r"(?<![A-Za-z0-9])(at|rt|dev)_[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])"
)
JWT = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")


class Trace:
    """One redacted, deterministic replay of a demo world."""

    def __init__(
        self, slug: str, title: str, description: str, parties: list[dict[str, str]]
    ):
        self.slug = slug
        self.title = title
        self.description = description
        self.parties = parties
        self.hosts = {
            party["domain"]: party["id"] for party in parties if party.get("domain")
        }
        self.steps: list[dict[str, Any]] = []
        self.pending: list[dict[str, Any]] = []
        self.secrets: dict[str, str] = {}

    # Recording ------------------------------------------------------------------------

    def secret(self, value: str | None, placeholder: str) -> None:
        if value:
            self.secrets[value] = placeholder

    def request(self, source: str, request: httpx.Request) -> dict[str, Any]:
        """Record a request when it is sent, so nested requests follow it in order."""

        target = self.hosts.get(request.url.host or "", request.url.host or "")
        path = urlsplit(str(request.url)).path
        fields = REVOCATION_FIELDS if path.endswith("/revoke") else {}
        entry: dict[str, Any] = {
            "kind": "http",
            "from": source,
            "to": target,
            "method": request.method,
            "url": str(request.url),
            "status": None,
            "request": {
                "headers": self._headers(request.headers, KEPT_REQUEST_HEADERS),
                **self._body(request.headers, request.content, fields),
            },
        }
        self.pending.append(entry)
        return entry

    def response(self, entry: dict[str, Any], response: httpx.Response) -> None:
        entry["status"] = response.status_code
        entry["response"] = {
            "headers": self._headers(response.headers, KEPT_RESPONSE_HEADERS),
            **self._body(response.headers, response.content, {}),
        }

    def action(self, source: str, target: str, label: str) -> None:
        self.pending.append(
            {"kind": "action", "from": source, "to": target, "label": label}
        )

    def step(
        self,
        title: str,
        channel: str,
        summary: str,
        *,
        chat: list[dict[str, Any]],
        views: dict[str, list[dict[str, str]]],
    ) -> None:
        self.steps.append(
            {
                "title": title,
                "channel": channel,
                "summary": summary,
                "chat": chat,
                "views": views,
                "sequence": self.pending,
            }
        )
        self.pending = []

    # Redaction ------------------------------------------------------------------------

    def _headers(self, headers: httpx.Headers, kept: tuple[str, ...]) -> dict[str, str]:
        out: dict[str, str] = {}
        for name in (*kept, *SECRET_HEADERS):
            if name in headers:
                value = headers[name]
                if name in SECRET_HEADERS:
                    self.secret(value, SECRET_HEADERS[name])
                    if name == "authorization":
                        self.secret(value.partition(" ")[2], "‹access token›")
                    value = SECRET_HEADERS[name]
                out[name] = value
        return out

    def _body(
        self, headers: httpx.Headers, content: bytes, extra: dict[str, str]
    ) -> dict[str, Any]:
        if not content:
            return {}
        kind = headers.get("content-type", "").split(";", 1)[0].strip()
        text = content.decode()
        if kind == "application/json":
            return {"body": self._redact(json.loads(text), extra)}
        if kind == "application/x-www-form-urlencoded":
            return {
                "body": self._redact(dict(parse_qsl(text)), extra),
                "encoding": "form",
            }
        if kind == "text/event-stream":
            for line in text.splitlines():
                if line.startswith("data: "):
                    self._redact(json.loads(line[6:]), extra)
            return {"body": text, "encoding": "sse"}
        return {"body": text}

    def _redact(self, value: Any, extra: dict[str, str]) -> Any:
        if isinstance(value, dict):
            out: dict[str, Any] = {}
            for key, item in value.items():
                placeholder = extra.get(key) or SECRET_FIELDS.get(key)
                if placeholder is not None and isinstance(item, str):
                    self.secret(item, placeholder)
                    out[key] = placeholder
                elif key in {"x", "y"} and value.get("kty") == "EC":
                    out[key] = "‹public key›"
                elif key == "verification_uri_complete":
                    out[key] = item  # The user code inside is replaced below.
                else:
                    out[key] = self._redact(item, extra)
            return out
        if isinstance(value, list):
            return [self._redact(item, extra) for item in value]
        return value

    def document(self) -> dict[str, Any]:
        """The trace as JSON: secrets replaced, opaque identifiers renumbered."""

        text = json.dumps(
            {
                "slug": self.slug,
                "title": self.title,
                "description": self.description,
                "generator": "examples/personal-agent-protocol/traces/generate.py",
                # The released SDK it was recorded with: the views say it.
                "sdk": f"personal-agent-protocol {sdk_version}",
                "parties": self.parties,
                "steps": self.steps,
            },
            ensure_ascii=False,
            indent=2,
        )
        # Short values (one-time codes) are redacted by field only: a global
        # replace would hit unrelated text.
        for value in sorted(self.secrets, key=len, reverse=True):
            if len(value) >= 8:
                text = text.replace(json.dumps(value)[1:-1], self.secrets[value])
        text = SECRET_OPAQUE.sub(lambda match: SECRET_PREFIXES[match.group(1)], text)
        numbers: dict[str, str] = {}
        counts: dict[str, int] = {}

        def renumber(match: re.Match[str]) -> str:
            key = match.group(0)
            if key not in numbers:
                prefix = match.group(1)
                counts[prefix] = counts.get(prefix, 0) + 1
                numbers[key] = f"{prefix}_{counts[prefix]}"
            return numbers[key]

        text = OPAQUE.sub(renumber, text)
        for leaked in (JWT, SECRET_OPAQUE):
            if leaked.search(text):
                raise RuntimeError(f"{self.slug}: a credential survived redaction")
        for value in (ADA["password"], ADA["email"], ADA_CODE):
            if value in text:
                raise RuntimeError(f"{self.slug}: a demo credential survived redaction")
        return json.loads(text)


class RecordingNetwork(InProcessNetwork):
    """The demo network, with every request recorded under the party that sent it."""

    def __init__(self, trace: Trace) -> None:
        super().__init__()
        self.trace = trace
        self.caller = "atlas"

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            transport=_Recording(kit._Routing(self), self.trace, self.caller),
            timeout=10.0,
        )


class _Recording(httpx.AsyncBaseTransport):
    def __init__(
        self, inner: httpx.AsyncBaseTransport, trace: Trace, source: str
    ) -> None:
        self.inner = inner
        self.trace = trace
        self.source = source

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        await request.aread()
        entry = self.trace.request(self.source, request)
        response = await self.inner.handle_async_request(request)
        content = await response.aread()
        self.trace.response(
            entry,
            httpx.Response(
                response.status_code, headers=response.headers, content=content
            ),
        )
        return httpx.Response(
            response.status_code,
            headers=response.headers,
            content=content,
            request=request,
        )


# Parties ------------------------------------------------------------------------------

ADA_PARTY = {"id": "user", "name": "Ada", "role": "person", "initial": "A"}
ATLAS_PARTY = {
    "id": "atlas",
    "name": "Atlas",
    "role": "Ada's personal agent",
    "domain": "atlas.example",
    "initial": "At",
}
MANZANITA_PARTY = {
    "id": "manzanita",
    "name": "Manzanita Outfitters",
    "role": "company",
    "domain": "manzanita.example",
    "initial": "M",
}
LEDGERLY_PARTY = {
    "id": "ledgerly",
    "name": "Ledgerly",
    "role": "company to Atlas · personal agent at Northwind",
    "domain": "ledgerly.example",
    "initial": "L",
}
NORTHWIND_PARTY = {
    "id": "northwind",
    "name": "Northwind Bank",
    "role": "company",
    "domain": "northwind.example",
    "initial": "N",
}


def say(speaker: str, text: str) -> dict[str, Any]:
    return {"speaker": speaker, "kind": "message", "text": text}


def page(speaker: str, title: str, text: str) -> dict[str, Any]:
    return {"speaker": speaker, "kind": "page", "title": title, "text": text}


def approval(speaker: str, operation: Operation, status: str) -> dict[str, Any]:
    return {
        "speaker": speaker,
        "kind": "approval",
        "title": f"Revision {operation.revision} · {status}",
        "text": operation.summary,
    }


def result(speaker: str, summary: str | None) -> dict[str, Any]:
    return {
        "speaker": speaker,
        "kind": "result",
        "title": "Result",
        "text": summary or "No result yet",
    }


def fact(label: str, value: object, group: str | None = None) -> dict[str, str]:
    item = {"label": label, "value": str(value)}
    if group:
        item["group"] = group
    return item


async def company_facts(
    service: CompanyService, client_label: str
) -> list[dict[str, str]]:
    """What a company holds: Sessions, accounts, conversations, operations (never tokens)."""

    from personal_agent_protocol.company.store import (
        ACCESS_TOKEN,
        CLIENT,
        CONVERSATION,
        OPERATION,
        REFRESH_TOKEN,
        SESSION,
        AccountGrant,
        IssuedAccessToken,
        StoredConversation,
        StoredOperation,
        StoredSession,
    )

    store = service.store

    async def records(kind: str, record: Any) -> list[Any]:
        # The demo's memory store lists its live keys, for inspection.
        found = []
        for key in store.keys(kind):
            entry = await store.get(kind, key)
            if entry is not None:
                found.append(record.from_json(entry.value))
        return found

    sessions = [s for s in await records(SESSION, StoredSession) if not s.ended]
    tokens = await records(ACCESS_TOKEN, IssuedAccessToken)
    facts = [
        fact("Verified client", client_label if store.keys(CLIENT) else "None yet"),
        fact("Sessions", f"{len(sessions)} live" if sessions else "None"),
    ]
    if tokens:
        facts.append(fact("Account behind the access token", tokens[-1].account_id))
        facts.append(fact("Granted scopes", " ".join(tokens[-1].scopes)))
    elif sessions:
        facts.append(fact("Who is it?", "A pairwise identifier only"))
    grants = await records(REFRESH_TOKEN, AccountGrant)
    if grants:
        live = [grant for grant in grants if not grant.revoked]
        facts.append(
            fact("Refresh tokens issued", f"{len(grants)} · {len(live)} not revoked")
        )
    for conversation in await records(CONVERSATION, StoredConversation):
        kind = "Direct conversation" if conversation.parent_id else "Conversation"
        facts.append(
            fact(
                kind,
                f"{conversation.status} · {conversation.responder} · {len(conversation.events)} events",
            )
        )
    for stored in await records(OPERATION, StoredOperation):
        facts.append(
            fact(
                f"Operation {stored.action}",
                f"revision {stored.operation.revision} · {stored.status}",
            )
        )
    return facts


def atlas_facts(
    host: PersonalAgentHost,
    session: Any,
    token: Any = None,
    *,
    company: str | None = None,
) -> list[dict[str, str]]:
    facts = []
    if company:
        facts.append(fact("Company", f"{company} · discovery verified"))
    if session is not None:
        state = "signed in" if token is not None else "signed out"
        facts.append(fact("Session", f"{state} · a Session JWT on every request"))
        if token is not None:
            facts.append(fact("Scopes", " ".join(token.scopes)))
    references = [key for key in host.vault.values if key.startswith("refresh")]
    facts.append(
        fact(
            "Vault (host only)",
            f"{len(references)} refresh token by reference" if references else "Empty",
        )
    )
    facts.append(fact("Model sees", "Summaries and statuses, never a credential"))
    return facts


class World:
    """Atlas and one Manzanita, on a recording network."""

    def __init__(
        self,
        trace: Trace,
        *,
        humans: bool = False,
        answers: tuple = (),
        approvals: ScriptedApprovals | None = None,
    ) -> None:
        self.trace = trace
        self.clock = MutableClock()
        self.network = RecordingNetwork(trace)
        self.atlas = AgentIdentity(domain="atlas.example", name="Atlas")
        self.network.add(self.atlas.domain, self.atlas.website())
        self.plugin = ManzanitaPlugin()
        self.network.caller = "manzanita"
        self.shop = build_company(
            replace(CONFIG, humans_available=humans),
            http_client=self.network.client(),
            address_resolver=self.network.resolve,
            plugins=[
                (PluginManifest(name="manzanita", version="1"), self.plugin),
                (
                    PluginManifest(name="manzanita-clock", version="1"),
                    ClockPlugin(self.clock),
                ),
            ],
        )
        self.network.add(CONFIG.domain, company_app(self.shop))
        self.network.caller = "atlas"
        self.http = self.network.client()
        self.approvals = approvals or ScriptedApprovals(always=True)
        self.host = PersonalAgentHost(
            self.atlas,
            self.clock,
            protected_input=ScriptedInput(*answers),
            approvals=self.approvals,
        )
        self.reactor = personal_agent_reactor(
            self.host, network=self.network, http_client=self.http
        )
        self.transport = SessionHttpClient(reactor=self.reactor, http_client=self.http)
        self.conversations = ConversationClient(transport=self.transport)
        self.operations = OperationsClient(reactor=self.reactor)
        self.session: Any = None
        self.token: Any = None

    async def discover(self) -> None:
        self.company = await DiscoveryClient(
            reactor=self.reactor, http_client=self.http
        ).discover(CONFIG.domain)
        self.metadata = self.company.oauth_metadata
        self.endpoint = self.company.document.agent.protocols[0].endpoint
        self.negotiated = operations_negotiated(
            self.company.document, ClientMetadata.model_validate(self.atlas.metadata)
        )

    async def start_session(self) -> None:
        self.session = await SessionClient(
            reactor=self.reactor, http_client=self.http
        ).start(
            client_id=self.atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=self.metadata.issuer,
            tenant_id=TENANT,
        )

    @property
    def auth(self) -> dict[str, Any]:
        """What a request is sent with: the Session, and the access token signed in."""
        return {"session": self.session, "token": self.token}

    async def device_sign_in(self) -> Any:
        device = DeviceSignInClient(reactor=self.reactor, http_client=self.http)
        started = await device.begin(
            device_authorization_endpoint=self.metadata.device_authorization_endpoint,
            token_endpoint=self.metadata.token_endpoint,
            issuer=self.metadata.issuer,
            client_id=self.atlas.client_id,
            scopes=("orders:read", "orders:write"),
            tenant_id=TENANT,
            organization=self.company.document.organization,
            protected_resources=self.metadata.protected_resources,
        )
        self.trace.secret(started.user_code, "‹user code›")
        self.clock.advance(started.poll_interval)
        pending = await device.poll(started.reference)
        assert pending.status == "pending"
        self.trace.action(
            "user",
            "manzanita",
            "Signs in on manzanita.example/device, enters the code, approves Atlas",
        )
        await self.shop.approve_device(started.user_code, account_id="acct_ada")
        self.clock.advance(started.poll_interval)
        done = await device.poll(started.reference)
        assert done.status == "complete" and done.token is not None
        self.token = done.token
        return done

    def message(self, text: str, author: str = "human") -> Message:
        return Message(
            id=generate_message_id(self.reactor),
            author=Author(type=author),  # type: ignore[arg-type]
            text=text,
        )

    async def ask_ada(
        self, operation: Operation, replaces: Operation | None = None
    ) -> Approval:
        """Ada is asked about this revision, in Atlas's own interface."""
        return await self.operations.ask_user(
            operation,
            organization=self.company.document.organization,
            tenant_id=TENANT,
            replaces=replaces,
        )

    async def send_approval(
        self, conversation_id: str, approval_: Approval, message_id: str | None = None
    ) -> Any:
        """The approval as a message; retried with the same ID, the same answer."""
        return await self.conversations.send(
            self.endpoint,
            conversation_id,
            Message(
                id=message_id or generate_message_id(self.reactor),
                author=Author(type="agent"),
                approval=approval_,
            ),
            wait=0,
            **self.auth,
        )

    def atlas_view(self) -> list[dict[str, str]]:
        return atlas_facts(
            self.host, self.session, self.token, company="Manzanita Outfitters"
        )

    async def shop_view(self) -> list[dict[str, str]]:
        return await company_facts(self.shop, "atlas.example/agent.json")

    async def views(self) -> dict[str, list[dict[str, str]]]:
        return {"atlas": self.atlas_view(), "manzanita": await self.shop_view()}

    def context(self) -> RefreshTokenContext:
        return RefreshTokenContext(
            token_endpoint=self.metadata.token_endpoint,
            revocation_endpoint=self.metadata.revocation_endpoint,
            issuer=self.metadata.issuer,
            client_id=self.atlas.client_id,
            tenant_id=TENANT,
        )


def manzanita_trace(slug: str, title: str, description: str) -> Trace:
    return Trace(slug, title, description, [ADA_PARTY, ATLAS_PARTY, MANZANITA_PARTY])


async def discover_and_start(world: World, chat: list[dict[str, Any]]) -> None:
    await world.discover()
    await world.start_session()
    world.trace.step(
        "Atlas finds Manzanita",
        "Discovery + Session",
        "Atlas reads Manzanita's protected resource metadata, public poppy.json and OAuth "
        "metadata. A Session is local: Atlas chooses a random sid for Ada's pairwise User ID, "
        "and no request is sent. Manzanita verifies Atlas's delegation at its first request.",
        chat=chat,
        views=await world.views(),
    )


# Worlds -------------------------------------------------------------------------------


def said(page_: Any) -> Any:
    """The company's last message on a page: a ``state`` event may follow it (PAP SDK 0.15)."""
    return next(
        event.message
        for event in reversed(page_.events)
        if event.message and event.message.role != "user"
    )


def refused(page_: Any) -> Any:
    """The last error event on a page: a ``state`` event may follow it (PAP SDK 0.15)."""
    return next(event.error for event in reversed(page_.events) if event.error)


async def user_with_a_company() -> Trace:
    trace = manzanita_trace(
        "user-with-a-company",
        "A user with a company",
        "Ada asks her personal agent, Atlas, to exchange a jacket at Manzanita Outfitters. "
        "Both sides are the PAP Python SDK's demo world: real keys and Session JWTs over "
        "in-process HTTP, recorded and redacted.",
    )
    world = World(trace)
    await discover_and_start(
        world,
        [
            say(
                "user",
                "My Ridge Jacket from Manzanita isn't warm enough. Can you sort it out?",
            ),
            say("atlas", "I'll ask Manzanita Outfitters."),
        ],
    )

    page_ = await world.conversations.start(
        world.endpoint,
        world.message("Where is my jacket order?"),
        wait=0,
        **world.auth,
    )
    reply = next(
        e.message.text
        for e in page_.events
        if e.message and e.message.role == "company"
    )
    trace.step(
        "Asking, signed out",
        "Conversation",
        "Atlas starts a conversation before anyone knows who Ada is. Manzanita's agent answers, "
        f"then sends an authorization event: {refused(page_)}.",
        chat=[
            say("manzanita", reply),
            say(
                "atlas",
                "Manzanita needs you to sign in before it can look up the order.",
            ),
        ],
        views=await world.views(),
    )

    done = await world.device_sign_in()
    trace.step(
        "Ada signs in on Manzanita's page",
        "Device Sign-In",
        "Atlas shows Manzanita's link and code. Ada signs in on manzanita.example and approves. "
        "Atlas polls at the company's pace; sign-in is plain OAuth and names no Session. The "
        "same Session sends the access token from now on, and the refresh token goes to the "
        "host's vault, by reference.",
        chat=[
            say("atlas", "Open manzanita.example/device and enter ‹user code›."),
            page(
                "manzanita",
                "manzanita.example/device",
                "Ada signs in to Manzanita and lets Atlas see her orders and exchange items.",
            ),
            say("atlas", f"You're signed in: {', '.join(done.granted_scopes)}."),
        ],
        views=await world.views(),
    )

    page_ = await world.conversations.send(
        world.endpoint,
        page_.conversation_id,
        world.message("Exchange it for something warmer"),
        cursor=page_.cursor,
        wait=0,
        **world.auth,
    )
    proposal = said(page_).operation
    trace.step(
        "The same conversation, signed in",
        "Conversation + Operation",
        "The conversation keeps its ID; now signed in, Manzanita returns the exchange as an "
        "operation: one summary, exact terms, an opaque revision. Nothing happens until Ada "
        "approves it.",
        chat=[
            say("user", "Exchange it for something warmer."),
            say("manzanita", said(page_).text),
            approval("manzanita", proposal, "needs your approval"),
        ],
        views=await world.views(),
    )

    trace.action("user", "atlas", f"Approves revision {proposal.revision} as shown")
    given = await world.ask_ada(proposal)
    outcome = await world.send_approval(page_.conversation_id, given)
    trace.step(
        "Ada approves this exact revision",
        "Operations version 2",
        "Atlas asks Ada in its own interface, and sends her approval of that revision as a "
        "message in the conversation. Manzanita performs the exchange once and says how it "
        "went, which Atlas shows as written.",
        chat=[
            approval("user", proposal, "approved"),
            result("manzanita", said(outcome).text),
        ],
        views=await world.views(),
    )

    trace.action("user", "atlas", "Disconnects Atlas from Manzanita")
    await RefreshTokenClient(reactor=world.reactor, http_client=world.http).revoke(
        done.refresh_token_reference, context=world.context()
    )
    trace.step(
        "Ada disconnects Atlas",
        "Refresh token revocation",
        "Atlas revokes the refresh token at Manzanita, then forgets it. With no valid refresh "
        "token left, the account is signed out.",
        chat=[
            say("user", "Disconnect Atlas from Manzanita."),
            say("atlas", "Done. I can no longer sign in to your Manzanita account."),
        ],
        views={
            "atlas": atlas_facts(world.host, None, company="Manzanita Outfitters"),
            "manzanita": await world.shop_view(),
        },
    )
    return trace


async def account_tokens() -> Trace:
    trace = manzanita_trace(
        "account-tokens",
        "Refresh tokens",
        "Refresh, rotation, narrowing, re-consent, and revocation of the refresh token Atlas "
        "holds for Ada at Manzanita, which never leaves the host's vault.",
    )
    world = World(trace)
    await discover_and_start(
        world, [say("user", "Connect Atlas to my Manzanita account.")]
    )
    done = await world.device_sign_in()
    trace.step(
        "Signed in: an access token and a refresh token",
        "Device Sign-In",
        "Ada approves on Manzanita's page. The sign-in returns a Bearer access token and a "
        "refresh token; the host stores the refresh token behind an opaque reference.",
        chat=[
            page(
                "manzanita",
                "manzanita.example/device",
                "Ada signs in and approves Atlas.",
            ),
            say("atlas", "Connected to Manzanita."),
        ],
        views=await world.views(),
    )
    accounts = RefreshTokenClient(reactor=world.reactor, http_client=world.http)
    reference = done.refresh_token_reference
    refreshed = await accounts.refresh(reference, context=world.context())
    world.token = refreshed.token
    trace.step(
        "Refresh and rotation",
        "refresh_token grant",
        "The access token ends; Atlas gets another with the refresh token and a fresh client "
        "assertion. A refresh names no Session: any of Ada's Sessions uses the new token. "
        "Manzanita rotates the refresh token; the new one replaces the old before the call "
        f"returns (rotated: {refreshed.rotated}).",
        chat=[say("atlas", "(Signed in again in the background.)")],
        views=await world.views(),
    )
    narrowed = await accounts.refresh(
        reference, context=world.context(), scopes=("orders:read",)
    )
    world.token = narrowed.token
    wider = await accounts.refresh(
        reference,
        context=world.context(),
        scopes=("orders:read", "orders:admin"),
    )
    trace.step(
        "Narrower, then wider",
        "Scope narrowing",
        f"A refresh for fewer scopes is granted ({' '.join(narrowed.granted_scopes)}). A wider "
        f"one is the company's invalid_scope, reported as {wider.status}: the host must ask Ada "
        "to sign in again, not retry.",
        chat=[
            say(
                "atlas",
                "To do more than read your orders, I'd need you to sign in again.",
            )
        ],
        views=await world.views(),
    )
    trace.action("user", "atlas", "Disconnects Atlas from Manzanita")
    await accounts.revoke(reference, context=world.context())
    after = await accounts.refresh(reference, context=world.context())
    trace.step(
        "Revocation",
        "RFC 7009",
        "Atlas revokes the refresh token at Manzanita and deletes its copy once the company "
        f"answered. A later refresh finds nothing to use: {after.status}, without a request.",
        chat=[
            say("user", "Disconnect Atlas from Manzanita."),
            say("atlas", "Done. I can no longer sign in to your Manzanita account."),
        ],
        views={
            "atlas": atlas_facts(world.host, None, company="Manzanita Outfitters"),
            "manzanita": await world.shop_view(),
        },
    )
    return trace


async def mediated_sign_in() -> Trace:
    trace = manzanita_trace(
        "mediated-sign-in",
        "Mediated Sign-In",
        "Ada signs in to Manzanita without leaving Atlas: the host's protected input collects "
        "the fields Manzanita declares in its mediated-sign-in extension and sends them to "
        "Manzanita's token endpoint, once, as an extension grant.",
    )
    world = World(trace, answers=(dict(ADA), {"code": "000000"}, {"code": ADA_CODE}))
    trace.secret(ADA["password"], "‹password›")
    trace.secret(ADA["email"], "‹email›")
    await discover_and_start(
        world, [say("user", "Sign me in to Manzanita here, please.")]
    )
    offered = mediated_offer(world.company)
    mediated = MediatedSignInClient(reactor=world.reactor, http_client=world.http)
    trace.action("user", "atlas", "Types email and password on Atlas's protected input")
    started = await mediated.sign_in(
        company=world.company,
        client_id=world.atlas.client_id,
        scopes=("orders:read",),
    )
    fields = ", ".join(
        f"{f.label}{' (secret)' if f.secret else ''}" for f in offered.fields
    )
    trace.step(
        "The declared fields, once",
        "pap.protectedInput",
        f"Manzanita declares {fields}. The host asks Ada on its trusted surface, never through "
        "the model, sends the values with the grant to the issuer's token endpoint with no "
        f"redirect followed, and drops them. Manzanita answers {started.status}.",
        chat=[
            page(
                "atlas",
                "Protected input · Manzanita Outfitters",
                f"Ada enters: {fields}.",
            ),
            say("atlas", f"Manzanita sent a code to {started.sent_to}."),
        ],
        views=await world.views(),
    )
    trace.action("user", "atlas", "Mistypes the code on the protected input")
    wrong = await mediated.submit_code(started.reference)
    trace.action("user", "atlas", "Types the right code")
    done = await mediated.submit_code(started.reference)
    world.token = done.token
    trace.step(
        "The one-time code",
        "Mediated Sign-In",
        "Only the sign_in_id and the code go to the token endpoint. A mistyped code is "
        f"{wrong.status} again; the right one signs Ada in, and the refresh token goes to the "
        "vault.",
        chat=[
            page(
                "atlas",
                "Protected input · Manzanita Outfitters",
                "Ada enters the code.",
            ),
            say("atlas", "That code didn't work. Try again?"),
            page(
                "atlas",
                "Protected input · Manzanita Outfitters",
                "Ada enters the code again.",
            ),
            say("atlas", f"You're signed in: {', '.join(done.granted_scopes)}."),
        ],
        views=await world.views(),
    )
    return trace


async def conversation_streaming() -> Trace:
    trace = manzanita_trace(
        "conversation-streaming",
        "Conversation streaming",
        "Atlas reads a Manzanita conversation over Server-Sent Events: display-only text "
        "deltas, complete message events, and a resume from Last-Event-ID.",
    )
    world = World(trace)
    await discover_and_start(world, [say("user", "Say hello to Manzanita for me.")])
    page_ = await world.conversations.start(
        world.endpoint, world.message("Hello"), **world.auth
    )
    trace.step(
        "A conversation starts",
        "Conversation",
        "Atlas starts the conversation and returns at once with a receipt; the events come next.",
        chat=[],
        views=await world.views(),
    )
    await world.conversations.close(world.endpoint, page_.conversation_id, **world.auth)
    items = [
        item
        async for item in world.conversations.stream(
            world.endpoint, page_.conversation_id, **world.auth
        )
    ]
    deltas = [item for item in items if isinstance(item, TextDelta)]
    events = [
        item for item in items if not isinstance(item, (TextDelta, StreamReconnected))
    ]
    reply = next(
        e.message.text for e in events if e.message and e.message.role == "company"
    )
    trace.step(
        "Streaming the events",
        "SSE",
        f"{len(deltas)} text-delta piece(s) are shown as they arrive but never acted on "
        "(actionable: false); the complete message event replaces them. The stream ends at "
        "the closed state.",
        chat=[
            {"speaker": "manzanita", "kind": "delta", "text": deltas[0].text},
            say("manzanita", reply),
        ],
        views=await world.views(),
    )
    await_items = [
        item
        async for item in world.conversations.stream(
            world.endpoint,
            page_.conversation_id,
            last_event_id=events[0].id,
            **world.auth,
        )
    ]
    resumed = [
        i for i in await_items if not isinstance(i, (TextDelta, StreamReconnected))
    ]
    trace.step(
        "Resuming from Last-Event-ID",
        "SSE resume",
        f"Reopened with Last-Event-ID, the stream skips the {len(events) - len(resumed)} event(s) "
        "already handled and continues to the end.",
        chat=[],
        views=await world.views(),
    )
    return trace


async def conversation_control() -> Trace:
    trace = manzanita_trace(
        "conversation-control",
        "Conversation control",
        "A Direct Conversation under an open one, a handoff to a person at Manzanita, and "
        "closing, through the real ConversationClient.",
    )
    world = World(trace, humans=True)
    await discover_and_start(world, [say("user", "I need help from Manzanita.")])
    parent = await world.conversations.start(
        world.endpoint,
        world.message("Hello, can someone help me?", "agent"),
        wait=0,
        **world.auth,
    )
    hello = next(
        e.message.text
        for e in parent.events
        if e.message and e.message.role == "company"
    )
    direct = await world.conversations.start_direct(
        world.endpoint,
        parent.conversation_id,
        world.message("I'll take it from here"),
        **world.auth,
    )
    trace.step(
        "Ada talks directly",
        "Direct Conversation",
        "Atlas opens a Direct Conversation under the open one, for Ada to talk with Manzanita "
        "through Atlas's interface. The parent records direct_opened.",
        chat=[
            say("manzanita", hello),
            say("user", "I'll take it from here."),
        ],
        views=await world.views(),
    )
    try:
        await world.conversations.send(
            world.endpoint,
            parent.conversation_id,
            world.message("Still there?", "agent"),
            **world.auth,
        )
    except Exception as error:  # noqa: BLE001 - the refusal is the point
        refusal = getattr(error, "code", type(error).__name__)
    trace.step(
        "The parent waits",
        "direct_conversation_open",
        f"While the direct conversation is open, the parent refuses Atlas's messages with "
        f"{refusal}, naming the open one.",
        chat=[],
        views=await world.views(),
    )
    await world.conversations.close(
        world.endpoint, direct.conversation_id, **world.auth
    )
    receipt = await world.conversations.handoff(
        world.endpoint, parent.conversation_id, **world.auth
    )
    trace.step(
        "Handoff to a person",
        "Handoff",
        "Closing the direct conversation tells the parent (direct_closed). Atlas then asks for "
        f"a person: the parent goes queued, then a {receipt.responder} responds.",
        chat=[say("atlas", "A person at Manzanita will take it from here.")],
        views=await world.views(),
    )
    await world.conversations.close(
        world.endpoint, parent.conversation_id, **world.auth
    )
    trace.step(
        "Closing",
        "Close",
        "Atlas closes the conversation. Closing ends the conversation, not what it started.",
        chat=[say("atlas", "Conversation with Manzanita closed.")],
        views=await world.views(),
    )
    return trace


async def operations() -> Trace:
    trace = manzanita_trace(
        "operations",
        "Operations",
        "Manzanita returns an exchange as an operation; Atlas asks Ada about every revision, "
        "and sends her approval of that exact revision, performed at most once.",
    )
    world = World(trace, approvals=ScriptedApprovals(False, True, True))
    await discover_and_start(
        world, [say("user", "Exchange my jacket for a warmer one.")]
    )
    await world.device_sign_in()
    page_ = await world.conversations.start(
        world.endpoint,
        world.message("Exchange my jacket for something warmer"),
        wait=0,
        **world.auth,
    )
    conversation = page_.conversation_id
    first = said(page_).operation
    trace.step(
        "An operation",
        "Operations version 2",
        f"Both sides list operations version 2 (negotiated: {world.negotiated}). Signed in, "
        "Manzanita returns the exchange as an operation in its message: nothing is done, and "
        "only Ada can approve it.",
        chat=[
            page(
                "manzanita",
                "manzanita.example/device",
                "Ada signs in and approves Atlas.",
            ),
            say("manzanita", said(page_).text),
            approval("manzanita", first, "needs your approval"),
        ],
        views=await world.views(),
    )
    trace.action("user", "atlas", "Says no")
    try:
        await world.ask_ada(first)
    except OperationError as error:
        declined = error.code
    trace.step(
        "Ada says no",
        "The approval surface",
        f"Atlas asks Ada in its own interface, and she says no ({declined}). Nothing is sent: "
        "no Rule, setting or earlier approval answers for her.",
        chat=[approval("user", first, "declined")],
        views=await world.views(),
    )
    trace.action("user", "atlas", f"Approves revision {first.revision}")
    approval_of_first = await world.ask_ada(first)
    await world.shop.revise(
        first.operation_id,
        summary=f"{first.summary} Return the original by 2026-10-25.",
        terms={**(first.terms or {}), "return_by": "2026-10-25"},
    )
    answered = await world.send_approval(conversation, approval_of_first)
    second = said(answered).operation
    trace.action("user", "atlas", f"Approves revision {second.revision}")
    approval_of_second = await world.ask_ada(second, replaces=first)
    changed = world.approvals.asked[-1].changed
    trace.step(
        "The terms changed",
        "A new revision",
        "Before the approval arrives, Manzanita changes the terms. It performs nothing and "
        f"answers with a new revision of the same operation; Atlas shows what changed "
        f"({', '.join(changed)}). Ada's approval covers one revision, so she is asked again.",
        chat=[
            approval("user", first, "approved"),
            say(
                "atlas",
                f"Manzanita changed the terms ({', '.join(changed)}). Please look again.",
            ),
            approval("manzanita", second, "needs your approval"),
        ],
        views=await world.views(),
    )
    message_id = generate_message_id(world.reactor)
    performed = await world.send_approval(conversation, approval_of_second, message_id)
    await world.send_approval(conversation, approval_of_second, message_id)
    assert len(world.plugin.executor.performed) == 1
    trace.step(
        "Approved, performed once",
        "The approval as a message",
        "Atlas sends Ada's approval of that revision. Sent again with the same message ID, it "
        "gets the same answer: the exchange is performed once.",
        chat=[
            approval("user", second, "approved"),
            result("manzanita", said(performed).text),
        ],
        views=await world.views(),
    )
    return trace


async def two_companies() -> Trace:
    trace = Trace(
        "two-companies",
        "Two companies working together",
        "Ledgerly, an accounting firm, is a PAP company to Ada's agent Atlas and a PAP "
        "personal agent at Northwind Bank for her. Every approval is Ada's. This is "
        "composition: draft 0.3 defines no company-to-company protocol.",
        [ADA_PARTY, ATLAS_PARTY, LEDGERLY_PARTY, NORTHWIND_PARTY],
    )
    clock = MutableClock()
    network = RecordingNetwork(trace)
    atlas = AgentIdentity(domain="atlas.example", name="Atlas")
    network.add(atlas.domain, atlas.website())
    network.caller = "northwind"
    bank, bank_plugin = northwind(network, clock)
    network.caller = "ledgerly"
    firm, at_northwind = ledgerly(network, clock)
    network.caller = "atlas"
    http = network.client()
    host = PersonalAgentHost(atlas, clock, approvals=ScriptedApprovals(always=True))
    reactor = personal_agent_reactor(host, network=network, http_client=http)
    transport = SessionHttpClient(reactor=reactor, http_client=http)
    conversations = ConversationClient(transport=transport)
    operations_client = OperationsClient(reactor=reactor)
    session: Any = None
    token: Any = None

    async def views() -> dict[str, list[dict[str, str]]]:
        link = next(iter(at_northwind.links.values()), None)
        as_agent = "As Ada's personal agent at Northwind"
        ledgerly_facts = [
            {**item, "group": "As a company to Atlas"}
            for item in await company_facts(firm, "atlas.example/agent.json")
        ]
        if link is None:
            ledgerly_facts.append(fact("Northwind", "Not connected", as_agent))
        else:
            state = "signed in" if link.token else "signed out"
            ledgerly_facts.append(
                fact(
                    "Northwind Session",
                    f"{state} · a Session JWT on every request",
                    as_agent,
                )
            )
            ledgerly_facts.append(
                fact(
                    "Northwind refresh token",
                    "in Ledgerly's vault, by reference"
                    if link.refresh_token_reference
                    else "Waiting for Ada on Northwind's page",
                    as_agent,
                )
            )
        return {
            "atlas": atlas_facts(host, session, token, company="Ledgerly"),
            "ledgerly": ledgerly_facts,
            "northwind": await company_facts(bank, "ledgerly.example/poppy/agent.json"),
        }

    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
        "ledgerly.example"
    )
    metadata = company.oauth_metadata
    session = await SessionClient(reactor=reactor, http_client=http).start(
        client_id=atlas.client_id,
        pairwise_user_id=PAIRWISE_LEDGERLY,
        issuer=metadata.issuer,
        tenant_id=TENANT,
    )
    trace.step(
        "Atlas finds Ledgerly",
        "Discovery + Session",
        "To Atlas, Ledgerly is an ordinary PAP company: Atlas reads its protected resource "
        "metadata and poppy.json, and starts a signed-out, pairwise Session under a random "
        "sid, which sends no request.",
        chat=[
            say(
                "user",
                "Ledgerly keeps my books. Let it pay my Acme invoices from Northwind.",
            ),
            say("atlas", "I'll connect to Ledgerly first."),
        ],
        views=await views(),
    )

    device = DeviceSignInClient(reactor=reactor, http_client=http)
    started = await device.begin(
        device_authorization_endpoint=metadata.device_authorization_endpoint,
        token_endpoint=metadata.token_endpoint,
        issuer=metadata.issuer,
        client_id=atlas.client_id,
        scopes=("books:read", "payments:write"),
        tenant_id=TENANT,
        organization=company.document.organization,
        protected_resources=metadata.protected_resources,
    )
    trace.secret(started.user_code, "‹Ledgerly user code›")
    trace.action(
        "user", "ledgerly", "Signs in on ledgerly.example/device and approves Atlas"
    )
    await firm.approve_device(started.user_code, account_id="acct_ada_ledgerly")
    clock.advance(started.poll_interval)
    done = await device.poll(started.reference)
    token = done.token
    trace.step(
        "Ada signs in to Ledgerly",
        "Device Sign-In",
        "Ada approves Atlas on Ledgerly's own page. Atlas's Session at Ledgerly now sends her "
        "access token.",
        chat=[
            say(
                "atlas", "Open ledgerly.example/device and enter ‹Ledgerly user code›."
            ),
            page(
                "ledgerly",
                "ledgerly.example/device",
                "Ada signs in to Ledgerly and approves Atlas.",
            ),
        ],
        views=await views(),
    )

    endpoint = company.document.agent.protocols[0].endpoint

    async def send(
        conversation_id: str | None, cursor: str | None, **fields: Any
    ) -> Any:
        message = Message(id=generate_message_id(reactor), **fields)
        if conversation_id is None:
            return await conversations.start(
                endpoint, message, session=session, token=token, wait=0
            )
        return await conversations.send(
            endpoint,
            conversation_id,
            message,
            session=session,
            token=token,
            cursor=cursor,
            wait=0,
        )

    async def tell(conversation_id: str | None, cursor: str | None, text: str) -> Any:
        return await send(
            conversation_id, cursor, author=Author(type="human"), text=text
        )

    page_ = await tell(None, None, "Pay INV-0042")
    reply = said(page_)
    connect = reply.data["connect"]
    trace.secret(connect["user_code"], "‹Northwind user code›")
    trace.step(
        "Ledgerly becomes a personal agent",
        "Ledgerly → Northwind",
        "To pay, Ledgerly needs Ada's Northwind account. It acts as a PAP personal agent with "
        "its own client_id and keys: it discovers Northwind, starts its own pairwise Session, "
        "and starts Device Sign-In there. Northwind verifies Ledgerly, not Atlas.",
        chat=[say("user", "Pay INV-0042."), say("ledgerly", reply.text)],
        views=await views(),
    )

    trace.action(
        "user",
        "northwind",
        "Signs in on northwind.example/device and approves Ledgerly",
    )
    await bank.approve_device(connect["user_code"], account_id=ACCOUNT)
    clock.advance(5)
    trace.step(
        "Ada approves Ledgerly at Northwind",
        "Northwind's page",
        "Ada signs in on Northwind's own page and lets Ledgerly see balances and make payments. "
        "Northwind's credentials never reach Ledgerly or Atlas.",
        chat=[
            page(
                "northwind",
                "northwind.example/device",
                "Ada signs in to Northwind Bank and approves Ledgerly.",
            )
        ],
        views=await views(),
    )

    page_ = await tell(page_.conversation_id, page_.cursor, "Done. Pay INV-0042")
    relayed = said(page_).operation
    trace.step(
        "Northwind returns the payment; Ledgerly relays it",
        "Operation relayed",
        "Ledgerly finishes signing in at Northwind and asks Northwind's agent to pay. Northwind "
        "returns payments.transfer as an operation. Ledgerly cannot approve it for Ada, so it "
        "relays it to her as its own operation, quoting Northwind's summary as written.",
        chat=[
            say("user", "Done. Pay INV-0042."),
            say("ledgerly", said(page_).text),
            approval("ledgerly", relayed, "needs your approval"),
        ],
        views=await views(),
    )

    trace.action("user", "atlas", f"Approves Ledgerly's revision {relayed.revision}")
    given = await operations_client.ask_user(
        relayed, organization=company.document.organization, tenant_id=TENANT
    )
    page_ = await send(
        page_.conversation_id, page_.cursor, author=Author(type="agent"), approval=given
    )
    trace.step(
        "Ada approves; Northwind pays",
        "Each approval sent on",
        "Atlas sends Ada's approval of Ledgerly's operation. Ledgerly checks Northwind's "
        "revision is unchanged and sends Northwind her approval of it. Northwind's answer "
        "becomes Ledgerly's, as written.",
        chat=[
            approval("user", relayed, "approved"),
            result("ledgerly", said(page_).text),
        ],
        views=await views(),
    )

    page_ = await tell(page_.conversation_id, page_.cursor, "Pay INV-0043")
    following = said(page_).operation
    trace.step(
        "The next payment is asked about too",
        "No approval in advance",
        "An approval says nothing of the next operation: Northwind returns INV-0043, Ledgerly "
        "relays it, and nothing is paid until Ada approves that one as well.",
        chat=[
            say("user", "Pay INV-0043."),
            say("ledgerly", said(page_).text),
            approval("ledgerly", following, "needs your approval"),
        ],
        views=await views(),
    )
    assert len(bank_plugin.executor.performed) == 1
    return trace


WORLDS: dict[str, Callable[[], Awaitable[Trace]]] = {
    "user-with-a-company": user_with_a_company,
    "two-companies": two_companies,
    "account-tokens": account_tokens,
    "mediated-sign-in": mediated_sign_in,
    "conversation-streaming": conversation_streaming,
    "conversation-control": conversation_control,
    "operations": operations,
}


async def main(slugs: list[str]) -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for slug in slugs or list(WORLDS):
        trace = await WORLDS[slug]()
        document = trace.document()
        path = OUTPUT / f"{slug}.json"
        path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
        exchanges = sum(
            1
            for step in document["steps"]
            for item in step["sequence"]
            if item["kind"] == "http"
        )
        sys.stdout.write(
            f"{path.relative_to(ROOT)}: {len(document['steps'])} steps, {exchanges} exchanges\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main(sys.argv[1:])))
