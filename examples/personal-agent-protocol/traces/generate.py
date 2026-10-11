# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Generate the redacted PAP traces the UI examples replay.

Each trace runs a world from the PAP Python SDK's `demo` package (real ES256
keys, DPoP proofs, and HTTP over ASGI in one process; no network, no model)
and records, step by step:

- what the user sees in her personal agent (`chat`);
- what each party holds or knows (`views`), read from the parties' real state;
- the sequence: every HTTP exchange between the parties, and the user's own
  actions on a company's page or in her agent (`sequence`).

Every token, code, proof, assertion, credential, and key coordinate is
replaced by a placeholder such as `‹session token›`, and every random opaque
identifier by a stable one (`cnv_1`), so the output is deterministic. The
script refuses to write a trace in which a secret survives.

From the Agent Runtimes repository, with the PAP Python SDK installed (the
features need the PAP release after 0.3.3, or an editable install):

```bash
python examples/personal-agent-protocol/traces/generate.py
```

It writes `src/examples/pap/traces/<slug>.json`.
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
    ConversationClient,
    DeviceSignInClient,
    DiscoveryClient,
    DpopHttpClient,
    Message,
    SessionClient,
    generate_message_id,
)
from personal_agent_protocol.accounts import AccountTokenClient, AccountTokenContext
from personal_agent_protocol.company import CompanyService, build_company, company_app
from personal_agent_protocol.conversations import StreamReconnected, TextDelta
from personal_agent_protocol.demo import kit
from personal_agent_protocol.demo.kit import (
    AgentIdentity,
    ClockPlugin,
    InProcessNetwork,
    MutableClock,
    PersonalAgentHost,
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
from personal_agent_protocol.models import ClientMetadata, Operation
from personal_agent_protocol.operations import (
    OperationError,
    OperationsClient,
    approve,
    operations_endpoint,
)
from reactor import PluginManifest

ROOT = Path(__file__).parents[3]
OUTPUT = ROOT / "src" / "examples" / "pap" / "traces"
TENANT = "atlas-demo"
PAIRWISE = "usr_ada_at_manzanita_000000"
PAIRWISE_LEDGERLY = "usr_ada_at_ledgerly_00000000"

#: Field names whose values never appear in a trace.
SECRET_FIELDS = {
    "access_token": "‹session token›",
    "refresh_token": "‹account token›",
    "assertion": "‹session assertion›",
    "client_assertion": "‹client assertion›",
    "device_code": "‹device code›",
    "user_code": "‹user code›",
    "code": "‹one-time code›",
    "password": "‹password›",
    "email": "‹email›",
}
#: In a revocation request, `token` is the Account Token.
REVOCATION_FIELDS = {"token": "‹account token›"}
SECRET_HEADERS = {
    "authorization": "DPoP ‹session token›",
    "dpop": "‹DPoP proof›",
    "dpop-nonce": "‹DPoP nonce›",
}
KEPT_REQUEST_HEADERS = ("content-type", "accept", "last-event-id")
KEPT_RESPONSE_HEADERS = ("content-type", "cache-control", "retry-after", "location")
#: Opaque identifiers that are themselves secrets: a safety net behind SECRET_FIELDS.
SECRET_PREFIXES = {
    "sat": "‹session token›",
    "acct": "‹account token›",
    "dev": "‹device code›",
}
OPAQUE = re.compile(
    r"(?<![A-Za-z0-9])(cnv|op|msg|evt|ses|si|usr|jti|mediated|account|device|u)"
    r"_([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])"
)
SECRET_OPAQUE = re.compile(
    r"(?<![A-Za-z0-9])(sat|acct|dev)_[A-Za-z0-9_-]{22}(?![A-Za-z0-9_-])"
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
                        self.secret(value.partition(" ")[2], "‹session token›")
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


def result(speaker: str, operation: Operation | None) -> dict[str, Any]:
    summary = (
        operation.result.summary if operation and operation.result else "No result yet"
    )
    return {"speaker": speaker, "kind": "result", "title": "Result", "text": summary}


def fact(label: str, value: object, group: str | None = None) -> dict[str, str]:
    item = {"label": label, "value": str(value)}
    if group:
        item["group"] = group
    return item


def company_facts(service: CompanyService, client_label: str) -> list[dict[str, str]]:
    """What a company holds: Sessions, accounts, conversations, operations (never tokens)."""

    store = service.store
    sessions = list(store.sessions.values())
    signed_in = [session for session in sessions if session.account_id]
    facts = [
        fact("Verified client", client_label if service.extensions else "None yet"),
        fact(
            "Sessions",
            f"{len(sessions)} live · {len(signed_in)} signed in"
            if sessions
            else "None",
        ),
    ]
    if signed_in:
        facts.append(fact("Account behind the Session", signed_in[-1].account_id))
        facts.append(fact("Granted scopes", " ".join(signed_in[-1].scopes)))
    elif sessions:
        facts.append(fact("Who is it?", "A pairwise identifier only"))
    grants = list(store.account_tokens.values())
    if grants:
        live = [grant for grant in grants if not grant.revoked]
        facts.append(
            fact("Account Tokens issued", f"{len(grants)} · {len(live)} not revoked")
        )
    for conversation in store.conversations.values():
        kind = "Direct conversation" if conversation.parent_id else "Conversation"
        facts.append(
            fact(
                kind,
                f"{conversation.status} · {conversation.responder} · {len(conversation.events)} events",
            )
        )
    for stored in store.operations.values():
        operation = stored.operation
        approved = (
            f" · approved by {operation.confirmation.approved_by}"
            if operation.confirmation
            else ""
        )
        facts.append(
            fact(
                f"Operation {stored.action}",
                f"revision {operation.revision} · {operation.state}{approved}",
            )
        )
    return facts


def atlas_facts(
    host: PersonalAgentHost, session: Any, *, company: str | None = None
) -> list[dict[str, str]]:
    facts = []
    if company:
        facts.append(fact("Company", f"{company} · discovery verified"))
    if session is not None:
        state = "signed in" if session.signed_in else "signed out"
        facts.append(fact("Session", f"{state} · DPoP-bound"))
        if session.scopes:
            facts.append(fact("Scopes", " ".join(session.scopes)))
    references = [key for key in host.vault.values if key.startswith("account")]
    facts.append(
        fact(
            "Vault (host only)",
            f"{len(references)} Account Token by reference" if references else "Empty",
        )
    )
    facts.append(fact("Model sees", "Summaries and statuses, never a credential"))
    return facts


class World:
    """Atlas and one Manzanita, on a recording network."""

    def __init__(
        self, trace: Trace, *, humans: bool = False, answers: tuple = ()
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
        self.host = PersonalAgentHost(
            self.atlas, self.clock, protected_input=ScriptedInput(*answers)
        )
        self.reactor = personal_agent_reactor(
            self.host, network=self.network, http_client=self.http
        )
        self.transport = DpopHttpClient(reactor=self.reactor, http_client=self.http)
        self.conversations = ConversationClient(transport=self.transport)
        self.operations = OperationsClient(transport=self.transport)
        self.session: Any = None

    async def discover(self) -> None:
        self.company = await DiscoveryClient(
            reactor=self.reactor, http_client=self.http
        ).discover(CONFIG.domain)
        self.metadata = self.company.oauth_metadata
        self.who = {
            "tenant_id": TENANT,
            "pairwise_user_id": PAIRWISE,
            "issuer": self.metadata.issuer,
        }
        self.endpoint = self.company.document.agent.protocols[0].endpoint
        self.ops = operations_endpoint(
            self.company.document, ClientMetadata.model_validate(self.atlas.metadata)
        )

    async def start_session(self) -> None:
        self.session = await SessionClient(
            reactor=self.reactor, http_client=self.http
        ).start(
            client_id=self.atlas.client_id,
            pairwise_user_id=PAIRWISE,
            issuer=self.metadata.issuer,
            token_endpoint=self.metadata.token_endpoint,
            tenant_id=TENANT,
        )

    async def device_sign_in(self) -> Any:
        device = DeviceSignInClient(reactor=self.reactor, http_client=self.http)
        started = await device.begin(
            device_authorization_endpoint=self.metadata.device_authorization_endpoint,
            token_endpoint=self.metadata.token_endpoint,
            issuer=self.metadata.issuer,
            client_id=self.atlas.client_id,
            scopes=("orders:read", "orders:write"),
            tenant_id=TENANT,
            pairwise_user_id=PAIRWISE,
            session_id=self.session.session_id,
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
        self.shop.approve_device(started.user_code, account_id="acct_ada")
        self.clock.advance(started.poll_interval)
        done = await device.poll(started.reference)
        assert done.status == "complete" and done.token is not None
        self.session = done.token
        return done

    def message(self, text: str, sender: str = "human") -> Message:
        return Message(id=generate_message_id(self.reactor), sender=sender, text=text)  # type: ignore[arg-type]

    def atlas_view(self) -> list[dict[str, str]]:
        return atlas_facts(self.host, self.session, company="Manzanita Outfitters")

    def shop_view(self) -> list[dict[str, str]]:
        return company_facts(self.shop, "atlas.example/agent.json")

    def views(self) -> dict[str, list[dict[str, str]]]:
        return {"atlas": self.atlas_view(), "manzanita": self.shop_view()}

    def context(self) -> AccountTokenContext:
        return AccountTokenContext(
            token_endpoint=self.metadata.token_endpoint,
            revocation_endpoint=self.metadata.revocation_endpoint,
            issuer=self.metadata.issuer,
            client_id=self.atlas.client_id,
            tenant_id=TENANT,
            pairwise_user_id=PAIRWISE,
        )


def manzanita_trace(slug: str, title: str, description: str) -> Trace:
    return Trace(slug, title, description, [ADA_PARTY, ATLAS_PARTY, MANZANITA_PARTY])


async def discover_and_start(world: World, chat: list[dict[str, Any]]) -> None:
    await world.discover()
    await world.start_session()
    world.trace.step(
        "Atlas finds Manzanita",
        "Discovery + Session",
        "Atlas reads Manzanita's public poppy.json and OAuth metadata, then opens a signed-out, "
        "pairwise Session. Manzanita verifies Atlas by fetching its client metadata and keys.",
        chat=chat,
        views=world.views(),
    )


# Worlds -------------------------------------------------------------------------------


async def user_with_a_company() -> Trace:
    trace = manzanita_trace(
        "user-with-a-company",
        "A user with a company",
        "Ada asks her personal agent, Atlas, to exchange a jacket at Manzanita Outfitters. "
        "Both sides are the PAP Python SDK's demo world: real keys and proofs over in-process "
        "HTTP, recorded and redacted.",
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
        token=world.session,
        wait=0,
        **world.who,
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
        f"then sends an authorization event: {page_.events[-1].error}.",
        chat=[
            say("manzanita", reply),
            say(
                "atlas",
                "Manzanita needs you to sign in before it can look up the order.",
            ),
        ],
        views=world.views(),
    )

    done = await world.device_sign_in()
    trace.step(
        "Ada signs in on Manzanita's page",
        "Device Sign-In",
        "Atlas shows Manzanita's link and code. Ada signs in on manzanita.example and approves. "
        "Atlas polls at the company's pace; the same Session is upgraded and the Account Token "
        "goes to the host's vault, by reference.",
        chat=[
            say("atlas", "Open manzanita.example/device and enter ‹user code›."),
            page(
                "manzanita",
                "manzanita.example/device",
                "Ada signs in to Manzanita and lets Atlas see her orders and exchange items.",
            ),
            say("atlas", f"You're signed in: {', '.join(done.granted_scopes)}."),
        ],
        views=world.views(),
    )

    page_ = await world.conversations.send(
        world.endpoint,
        page_.conversation_id,
        world.message("Exchange it for something warmer"),
        token=world.session,
        cursor=page_.cursor,
        wait=0,
        **world.who,
    )
    proposal = page_.events[-1].message.operation  # type: ignore[union-attr]
    trace.step(
        "The same conversation, signed in",
        "Conversation + Operation",
        "The conversation keeps its ID; now signed in, Manzanita proposes the exchange as an "
        "operation: one summary, exact terms, revision 1. Nothing happens until it is confirmed.",
        chat=[
            say("user", "Exchange it for something warmer."),
            say("manzanita", page_.events[-1].message.text),  # type: ignore[union-attr]
            approval("manzanita", proposal, "needs your approval"),
        ],
        views=world.views(),
    )

    trace.action("user", "atlas", f"Approves revision {proposal.revision} as shown")
    outcome = await world.operations.confirm(
        world.ops,
        proposal,
        approval=approve(proposal),
        token=world.session,
        **world.who,
    )
    trace.step(
        "Ada approves this exact revision",
        "Operations v1",
        "Atlas confirms the revision Ada saw, with approved_by: user. Manzanita performs the "
        "exchange once and returns the result summary, which Atlas shows as written.",
        chat=[
            approval("user", proposal, "approved"),
            result("manzanita", outcome.operation),
        ],
        views=world.views(),
    )

    trace.action("user", "atlas", "Disconnects Atlas from Manzanita")
    await AccountTokenClient(reactor=world.reactor, http_client=world.http).revoke(
        done.account_token_reference, context=world.context()
    )
    trace.step(
        "Ada disconnects Atlas",
        "Account Token revocation",
        "Atlas revokes the Account Token at Manzanita, then forgets it. Every Session signed in "
        "with it continues signed out.",
        chat=[
            say("user", "Disconnect Atlas from Manzanita."),
            say("atlas", "Done. I can no longer sign in to your Manzanita account."),
        ],
        views={
            "atlas": atlas_facts(world.host, None, company="Manzanita Outfitters"),
            "manzanita": world.shop_view(),
        },
    )
    return trace


async def account_tokens() -> Trace:
    trace = manzanita_trace(
        "account-tokens",
        "Account Tokens",
        "Refresh, rotation, narrowing, re-consent, and revocation of the Account Token Atlas "
        "holds for Ada at Manzanita, which never leaves the host's vault.",
    )
    world = World(trace)
    await discover_and_start(
        world, [say("user", "Connect Atlas to my Manzanita account.")]
    )
    done = await world.device_sign_in()
    trace.step(
        "Signed in: an Account Token",
        "Device Sign-In",
        "Ada approves on Manzanita's page. The sign-in returns a Session Token and an Account "
        "Token; the host stores the Account Token behind an opaque reference.",
        chat=[
            page(
                "manzanita",
                "manzanita.example/device",
                "Ada signs in and approves Atlas.",
            ),
            say("atlas", "Connected to Manzanita."),
        ],
        views=world.views(),
    )
    accounts = AccountTokenClient(reactor=world.reactor, http_client=world.http)
    reference = done.account_token_reference
    refreshed = await accounts.refresh(
        reference, context=world.context(), session_id=world.session.session_id
    )
    world.session = refreshed.token
    trace.step(
        "Refresh and rotation",
        "refresh_token grant",
        "The Session expired; Atlas signs it in again with the Account Token, a fresh client "
        "assertion, and a fresh DPoP proof. Manzanita rotates the token; the new one replaces "
        f"the old before the call returns (rotated: {refreshed.rotated}).",
        chat=[say("atlas", "(Signed in again in the background.)")],
        views=world.views(),
    )
    narrowed = await accounts.refresh(
        reference,
        context=world.context(),
        session_id=world.session.session_id,
        scopes=("orders:read",),
    )
    world.session = narrowed.token
    wider = await accounts.refresh(
        reference,
        context=world.context(),
        session_id=world.session.session_id,
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
        views=world.views(),
    )
    trace.action("user", "atlas", "Disconnects Atlas from Manzanita")
    await accounts.revoke(reference, context=world.context())
    after = await accounts.refresh(
        reference, context=world.context(), session_id=world.session.session_id
    )
    trace.step(
        "Revocation",
        "RFC 7009",
        "Atlas revokes the Account Token at Manzanita and deletes its copy once the company "
        f"answered. A later refresh finds nothing to use: {after.status}, without a request.",
        chat=[
            say("user", "Disconnect Atlas from Manzanita."),
            say("atlas", "Done. I can no longer sign in to your Manzanita account."),
        ],
        views={
            "atlas": atlas_facts(world.host, None, company="Manzanita Outfitters"),
            "manzanita": world.shop_view(),
        },
    )
    return trace


async def mediated_sign_in() -> Trace:
    trace = manzanita_trace(
        "mediated-sign-in",
        "Mediated Sign-In",
        "Ada signs in to Manzanita without leaving Atlas: the host's protected input collects "
        "the fields Manzanita declares and sends them to Manzanita's endpoint, once.",
    )
    world = World(trace, answers=(dict(ADA), {"code": "000000"}, {"code": ADA_CODE}))
    trace.secret(ADA["password"], "‹password›")
    trace.secret(ADA["email"], "‹email›")
    await discover_and_start(
        world, [say("user", "Sign me in to Manzanita here, please.")]
    )
    auth = world.company.document.auth
    mediated = MediatedSignInClient(reactor=world.reactor, http_client=world.http)
    trace.action("user", "atlas", "Types email and password on Atlas's protected input")
    started = await mediated.sign_in(
        mediated=auth.mediated,
        organization=world.company.document.organization,
        scopes=("orders:read",),
        token=world.session,
        **world.who,
    )
    fields = ", ".join(
        f"{f.label}{' (secret)' if f.secret else ''}" for f in auth.mediated.fields
    )
    trace.step(
        "The declared fields, once",
        "pap.protectedInput",
        f"Manzanita declares {fields}. The host asks Ada on its trusted surface, never through "
        "the model, sends the values to the endpoint on Manzanita's domain with no redirect "
        f"followed, and drops them. Manzanita answers {started.status}.",
        chat=[
            page(
                "atlas",
                "Protected input · Manzanita Outfitters",
                f"Ada enters: {fields}.",
            ),
            say("atlas", f"Manzanita sent a code to {started.sent_to}."),
        ],
        views=world.views(),
    )
    trace.action("user", "atlas", "Mistypes the code on the protected input")
    wrong = await mediated.submit_code(
        started.reference, token=world.session, **world.who
    )
    trace.action("user", "atlas", "Types the right code")
    done = await mediated.submit_code(
        started.reference, token=world.session, **world.who
    )
    world.session = done.token
    trace.step(
        "The one-time code",
        "Mediated Sign-In",
        f"Only the code goes to …/sign-in/{{sign_in_id}}, from the Session that started it. A "
        f"mistyped code is {wrong.status} again; the right one signs the same Session in and "
        "the Account Token goes to the vault.",
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
        views=world.views(),
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
        world.endpoint, world.message("Hello"), token=world.session, **world.who
    )
    trace.step(
        "A conversation starts",
        "Conversation",
        "Atlas starts the conversation and returns at once with a receipt; the events come next.",
        chat=[],
        views=world.views(),
    )
    await world.conversations.close(
        world.endpoint, page_.conversation_id, token=world.session, **world.who
    )
    items = [
        item
        async for item in world.conversations.stream(
            world.endpoint, page_.conversation_id, token=world.session, **world.who
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
        views=world.views(),
    )
    await_items = [
        item
        async for item in world.conversations.stream(
            world.endpoint,
            page_.conversation_id,
            token=world.session,
            last_event_id=events[0].id,
            **world.who,
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
        views=world.views(),
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
        token=world.session,
        wait=0,
        **world.who,
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
        token=world.session,
        **world.who,
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
        views=world.views(),
    )
    try:
        await world.conversations.send(
            world.endpoint,
            parent.conversation_id,
            world.message("Still there?", "agent"),
            token=world.session,
            **world.who,
        )
    except Exception as error:  # noqa: BLE001 - the refusal is the point
        refusal = getattr(error, "code", type(error).__name__)
    trace.step(
        "The parent waits",
        "direct_conversation_open",
        f"While the direct conversation is open, the parent refuses Atlas's messages with "
        f"{refusal}, naming the open one.",
        chat=[],
        views=world.views(),
    )
    await world.conversations.close(
        world.endpoint, direct.conversation_id, token=world.session, **world.who
    )
    receipt = await world.conversations.handoff(
        world.endpoint, parent.conversation_id, token=world.session, **world.who
    )
    trace.step(
        "Handoff to a person",
        "Handoff",
        "Closing the direct conversation tells the parent (direct_closed). Atlas then asks for "
        f"a person: the parent goes queued, then a {receipt.responder} responds.",
        chat=[say("atlas", "A person at Manzanita will take it from here.")],
        views=world.views(),
    )
    await world.conversations.close(
        world.endpoint, parent.conversation_id, token=world.session, **world.who
    )
    trace.step(
        "Closing",
        "Close",
        "Atlas closes the conversation. Closing ends the conversation, not what it started.",
        chat=[say("atlas", "Conversation with Manzanita closed.")],
        views=world.views(),
    )
    return trace


async def operations() -> Trace:
    trace = manzanita_trace(
        "operations",
        "Operations",
        "Manzanita proposes an exchange; Atlas confirms only the exact revision Ada approved, "
        "at most once.",
    )
    world = World(trace)
    await discover_and_start(
        world, [say("user", "Exchange my jacket for a warmer one.")]
    )
    await world.device_sign_in()
    page_ = await world.conversations.start(
        world.endpoint,
        world.message("Exchange my jacket for something warmer"),
        token=world.session,
        wait=0,
        **world.who,
    )
    first = page_.events[-1].message.operation  # type: ignore[union-attr]
    try:
        await world.operations.confirm(
            world.ops,
            first,
            standing=("Manzanita Outfitters", PAIRWISE, "orders.exchange"),
            token=world.session,
            **world.who,
        )
    except OperationError as error:
        standing = error.code
    trace.step(
        "A proposal",
        "Operations v1",
        "Both sides list operations version 1. Signed in, Manzanita proposes the exchange. It "
        f"requires Ada's own approval, so a standing permission is refused locally ({standing}).",
        chat=[
            page(
                "manzanita",
                "manzanita.example/device",
                "Ada signs in and approves Atlas.",
            ),
            say("manzanita", page_.events[-1].message.text),  # type: ignore[union-attr]
            approval("manzanita", first, "needs your approval"),
        ],
        views=world.views(),
    )
    trace.action("user", "atlas", "Approves revision 1")
    approval_of_first = approve(first)
    world.shop.revise(
        first.operation_id,
        summary=f"{first.summary} Return the original by 2026-10-25.",
        terms={**(first.terms or {}), "return_by": "2026-10-25"},
    )
    changed = await world.operations.confirm(
        world.ops, first, approval=approval_of_first, token=world.session, **world.who
    )
    second = changed.operation
    trace.step(
        "The terms changed",
        "terms_changed",
        "Before the confirmation arrives, Manzanita revises the proposal. The company refuses "
        f"revision 1 and returns revision {second.revision}; Atlas shows what changed "  # type: ignore[union-attr]
        f"({', '.join(changed.changed)}). Ada's approval of revision 1 cannot confirm it.",
        chat=[
            approval("user", first, "approved"),
            say(
                "atlas",
                f"Manzanita changed the terms ({', '.join(changed.changed)}). Please look again.",
            ),
            approval("manzanita", second, "needs your approval"),  # type: ignore[arg-type]
        ],
        views=world.views(),
    )
    trace.action("user", "atlas", f"Approves revision {second.revision}")  # type: ignore[union-attr]
    confirmed = await world.operations.confirm(
        world.ops,
        second,
        approval=approve(second),
        token=world.session,
        **world.who,  # type: ignore[arg-type]
    )
    await world.operations.confirm(
        world.ops,
        second,
        approval=approve(second),
        token=world.session,
        **world.who,  # type: ignore[arg-type]
    )
    trace.step(
        "Confirmed once",
        "confirm",
        "Atlas confirms revision 2 with approved_by: user. A retried confirmation returns the "
        "same record: the exchange is performed once.",
        chat=[
            approval("user", second, "approved"),
            result("manzanita", confirmed.operation),
        ],  # type: ignore[arg-type]
        views=world.views(),
    )
    page_ = await world.conversations.send(
        world.endpoint,
        page_.conversation_id,
        world.message("Actually, exchange it for something warmer still"),
        token=world.session,
        cursor=page_.cursor,
        wait=0,
        **world.who,
    )
    other = page_.events[-1].message.operation  # type: ignore[union-attr]
    trace.action("user", "atlas", "Declines the second proposal")
    cancelled = await world.operations.cancel(
        world.ops, other.operation_id, token=world.session, **world.who
    )
    trace.step(
        "Cancelled",
        "cancel",
        "A second proposal Ada declines is cancelled: nothing was changed.",
        chat=[approval("manzanita", other, "declined"), result("manzanita", cancelled)],
        views=world.views(),
    )
    return trace


async def two_companies() -> Trace:
    trace = Trace(
        "two-companies",
        "Two companies working together",
        "Ledgerly, an accounting firm, is a PAP company to Ada's agent Atlas and a PAP "
        "personal agent at Northwind Bank for her. Every approval is an Operation. This is "
        "composition: draft 0.1 defines no company-to-company protocol.",
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
    host = PersonalAgentHost(atlas, clock)
    reactor = personal_agent_reactor(host, network=network, http_client=http)
    transport = DpopHttpClient(reactor=reactor, http_client=http)
    conversations = ConversationClient(transport=transport)
    operations_client = OperationsClient(transport=transport)
    session: Any = None

    def views() -> dict[str, list[dict[str, str]]]:
        link = next(iter(at_northwind.links.values()), None)
        as_agent = "As Ada's personal agent at Northwind"
        ledgerly_facts = [
            {**item, "group": "As a company to Atlas"}
            for item in company_facts(firm, "atlas.example/agent.json")
        ]
        if link is None:
            ledgerly_facts.append(fact("Northwind", "Not connected", as_agent))
        else:
            state = (
                "signed in" if link.session and link.session.signed_in else "signed out"
            )
            ledgerly_facts.append(
                fact("Northwind Session", f"{state} · DPoP-bound", as_agent)
            )
            ledgerly_facts.append(
                fact(
                    "Northwind Account Token",
                    "in Ledgerly's vault, by reference"
                    if link.account_token_reference
                    else "Waiting for Ada on Northwind's page",
                    as_agent,
                )
            )
        for permission in at_northwind.standing.permissions.values():
            ledgerly_facts.append(
                fact(
                    "Standing permission",
                    f"{permission.action} · {permission.uses_remaining} uses left · "
                    + ", ".join(
                        f"{limit.path} ≤ {limit.maximum}"
                        if limit.maximum is not None
                        else f"{limit.path} = {' or '.join(sorted(limit.allowed or ()))}"
                        for limit in permission.limits
                    ),
                    as_agent,
                )
            )
        return {
            "atlas": atlas_facts(host, session, company="Ledgerly"),
            "ledgerly": ledgerly_facts,
            "northwind": company_facts(bank, "ledgerly.example/poppy/agent.json"),
        }

    company = await DiscoveryClient(reactor=reactor, http_client=http).discover(
        "ledgerly.example"
    )
    metadata = company.oauth_metadata
    who = {
        "tenant_id": TENANT,
        "pairwise_user_id": PAIRWISE_LEDGERLY,
        "issuer": metadata.issuer,
    }
    session = await SessionClient(reactor=reactor, http_client=http).start(
        client_id=atlas.client_id,
        pairwise_user_id=PAIRWISE_LEDGERLY,
        issuer=metadata.issuer,
        token_endpoint=metadata.token_endpoint,
        tenant_id=TENANT,
    )
    trace.step(
        "Atlas finds Ledgerly",
        "Discovery + Session",
        "To Atlas, Ledgerly is an ordinary PAP company: Atlas reads its poppy.json and opens a "
        "signed-out, pairwise Session. Ledgerly verifies Atlas's keys.",
        chat=[
            say(
                "user",
                "Ledgerly keeps my books. Let it pay my Acme invoices from Northwind.",
            ),
            say("atlas", "I'll connect to Ledgerly first."),
        ],
        views=views(),
    )

    device = DeviceSignInClient(reactor=reactor, http_client=http)
    started = await device.begin(
        device_authorization_endpoint=metadata.device_authorization_endpoint,
        token_endpoint=metadata.token_endpoint,
        issuer=metadata.issuer,
        client_id=atlas.client_id,
        scopes=("books:read", "payments:write"),
        tenant_id=TENANT,
        pairwise_user_id=PAIRWISE_LEDGERLY,
        session_id=session.session_id,
    )
    trace.secret(started.user_code, "‹Ledgerly user code›")
    trace.action(
        "user", "ledgerly", "Signs in on ledgerly.example/device and approves Atlas"
    )
    firm.approve_device(started.user_code, account_id="acct_ada_ledgerly")
    clock.advance(started.poll_interval)
    done = await device.poll(started.reference)
    session = done.token
    trace.step(
        "Ada signs in to Ledgerly",
        "Device Sign-In",
        "Ada approves Atlas on Ledgerly's own page. Atlas's Session at Ledgerly is signed in.",
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
        views=views(),
    )

    endpoint = company.document.agent.protocols[0].endpoint
    ops = firm.config.operations_endpoint

    async def tell(conversation_id: str | None, cursor: str | None, text: str) -> Any:
        message = Message(id=generate_message_id(reactor), sender="human", text=text)
        if conversation_id is None:
            return await conversations.start(
                endpoint, message, token=session, wait=0, **who
            )
        return await conversations.send(
            endpoint,
            conversation_id,
            message,
            token=session,
            cursor=cursor,
            wait=0,
            **who,
        )

    page_ = await tell(None, None, "Pay INV-0042")
    reply = page_.events[-1].message
    connect = reply.data["connect"]
    trace.secret(connect["user_code"], "‹Northwind user code›")
    trace.step(
        "Ledgerly becomes a personal agent",
        "Ledgerly → Northwind",
        "To pay, Ledgerly needs Ada's Northwind account. It acts as a PAP personal agent with "
        "its own client_id and keys: it discovers Northwind, opens its own pairwise Session, "
        "and starts Device Sign-In there. Northwind verifies Ledgerly, not Atlas.",
        chat=[say("user", "Pay INV-0042."), say("ledgerly", reply.text)],
        views=views(),
    )

    trace.action(
        "user",
        "northwind",
        "Signs in on northwind.example/device and approves Ledgerly",
    )
    bank.approve_device(connect["user_code"], account_id=ACCOUNT)
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
        views=views(),
    )

    page_ = await tell(page_.conversation_id, page_.cursor, "Done. Pay INV-0042")
    relayed = page_.events[-1].message.operation
    trace.step(
        "Northwind proposes; Ledgerly relays",
        "Operation relayed",
        "Ledgerly finishes signing in at Northwind and asks Northwind's agent to pay. Northwind "
        "proposes payments.transfer. No standing permission covers it, so Ledgerly relays it to "
        "Ada as its own operation, quoting Northwind's summary as written.",
        chat=[
            say("user", "Done. Pay INV-0042."),
            say("ledgerly", page_.events[-1].message.text),
            approval("ledgerly", relayed, "needs your approval"),
        ],
        views=views(),
    )

    trace.action("user", "atlas", f"Approves Ledgerly's revision {relayed.revision}")
    paid = await operations_client.confirm(
        ops, relayed, approval=approve(relayed), token=session, **who
    )
    trace.step(
        "Ada approves; Northwind pays",
        "approved_by: user",
        "Atlas confirms Ledgerly's operation. Ledgerly checks Northwind's revision is unchanged "
        "and confirms it at Northwind with approved_by: user. Northwind's result becomes "
        "Ledgerly's, as written.",
        chat=[
            approval("user", relayed, "approved"),
            result("ledgerly", paid.operation),
        ],
        views=views(),
    )

    page_ = await tell(
        page_.conversation_id,
        page_.cursor,
        "Allow Ledgerly to pay Acme invoices up to EUR 2000 without asking",
    )
    grant = page_.events[-1].message.operation
    trace.action("user", "atlas", "Approves the standing permission")
    granted = await operations_client.confirm(
        ops, grant, approval=approve(grant), token=session, **who
    )
    trace.step(
        "A standing permission, approved",
        "ledgerly.standing_permission",
        "The permission is itself an operation Ada approves. Ledgerly records it in its "
        "pap.standingPermissionStore, bounded by payee, amount, currency, uses, and time.",
        chat=[
            say(
                "user",
                "Allow Ledgerly to pay Acme invoices up to EUR 2000 without asking.",
            ),
            approval("ledgerly", grant, "approved"),
            result("ledgerly", granted.operation),
        ],
        views=views(),
    )

    page_ = await tell(page_.conversation_id, page_.cursor, "Pay INV-0043")
    told = page_.events[-1].message
    trace.step(
        "Within the bounds",
        "approved_by: standing_permission",
        "Northwind proposes the next payment; it is within the permission, so Ledgerly confirms "
        "it at Northwind with approved_by: standing_permission and tells Ada what was done.",
        chat=[say("user", "Pay INV-0043."), say("ledgerly", told.text)],
        views=views(),
    )

    page_ = await tell(page_.conversation_id, page_.cursor, "Pay INV-0044")
    over = page_.events[-1].message.operation
    trace.step(
        "Beyond the bounds",
        "Ask again",
        "EUR 3400.00 is over the permission's limit: Ledgerly does not confirm it and relays "
        "Northwind's proposal to Ada again. Nothing is paid until she approves.",
        chat=[
            say("user", "Pay INV-0044."),
            say("ledgerly", page_.events[-1].message.text),
            approval("ledgerly", over, "needs your approval"),
        ],
        views=views(),
    )
    assert len(bank_plugin.executor.performed) == 2
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
