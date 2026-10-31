# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Credential-free PAP summaries for agent tools and runtime surfaces.

The PAP SDK owns protocol validation and remote trust boundaries. Agent
Runtimes owns what may cross into a model, tool result, trace, or UI state.

Without a host, the capability reads public metadata only (a company's
discovery, a personal agent's identity). Given the host's PAP Reactor
(``build_pap_reactor`` with its ``pap.signer``, ``pap.sessionSigner``,
``pap.tokenStore``, ``pap.authorizationStateStore`` and
``pap.pairwiseUserIdStore`` contributions), it is a local runtime's personal
agent: it keeps one Session at a company under a random ``sid``, sent
as the ``Poppy-Session`` header on every request (PAP draft 0.3), talks in a
conversation, signs the person in with Device Sign-In, and sends the approval
of an operation the person gave on the host's own approval surface
(``pap.approvalSurface``). Every answer is a summary: no token, Session JWT,
assertion, device code or authorization URL with state crosses it. The hosted
path (Datalayer) is the gateway's ``pap`` toolset, whose answers this one
mirrors.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

import httpx
from personal_agent_protocol import (
    AgentIdentityClient,
    ConversationClient,
    DeviceSignInClient,
    DiscoveryClient,
    Message,
    OperationError,
    OperationsClient,
    PapSession,
    SessionClient,
    SessionHttpClient,
    generate_message_id,
    mediated_sign_in,
    operations_negotiated,
    resolve_pairwise_user_id,
)
from personal_agent_protocol.models import (
    Author,
    ClientMetadata,
    DiscoveredCompany,
    JsonWebKeySet,
    Operation,
)
from personal_agent_protocol.sessions import AccessToken
from pydantic import BaseModel, ConfigDict
from reactor import PluginPlatform


class PapScopeHint(BaseModel):
    """What a company says one of its scopes allows at most (PAP draft 0.3 §4.4)."""

    model_config = ConfigDict(frozen=True)

    changes: str
    personal_data: bool


class PapCompanySummary(BaseModel):
    """Verified public company capabilities safe to expose to an agent."""

    model_config = ConfigDict(frozen=True)

    organization: str
    domain: str
    protocol_version: str
    issuer: str | None
    #: Direct and Device as the issuer's ``grant_types_supported`` offers them,
    #: Mediated when the company offers that extension and its grant.
    sign_in: tuple[str, ...]
    #: The company's own scopes and what each allows (``auth.scopes``).
    scopes: dict[str, str]
    #: What each scope's most consequential use changes (``none``,
    #: ``reversible``, ``irreversible``) and whether it touches personal data
    #: (``auth.scope_hints``): the company's claim, read by the Rules.
    scope_hints: dict[str, PapScopeHint]
    #: The domains whose ``poppy.json`` names this issuer (``protected_resources``).
    protected_resources: tuple[str, ...]
    interfaces: tuple[str, ...]
    extensions: dict[str, str]


class PapAgentIdentitySummary(BaseModel):
    """Verified public personal-agent identity safe to expose to an agent."""

    model_config = ConfigDict(frozen=True)

    client_id: str
    client_name: str
    redirect_count: int
    signing_algorithms: tuple[str, ...]
    extensions: dict[str, str]


class _CompanyClient(Protocol):
    async def discover(self, domain: str) -> DiscoveredCompany: ...


class _IdentityClient(Protocol):
    async def fetch_metadata(self, client_id: str) -> ClientMetadata: ...

    async def fetch_jwks(self, client_id: str) -> JsonWebKeySet: ...


def _company_summary(company: DiscoveredCompany) -> PapCompanySummary:
    """A verified company as an agent may read it: capabilities, never endpoints or credentials."""
    document = company.document
    metadata = company.oauth_metadata
    auth = document.auth
    # Direct and Device from the issuer's grants, Mediated from its extension and grant.
    sign_in = [
        name
        for name, offered in (
            ("direct", metadata is not None and metadata.offers_direct),
            ("device", metadata is not None and metadata.offers_device),
            ("mediated", mediated_sign_in(company) is not None),
        )
        if offered
    ]
    interfaces: list[str] = []
    if document.agent is not None:
        interfaces.extend(
            f"agent:{protocol.type}" for protocol in document.agent.protocols
        )
    interfaces.extend(f"api:{api.type}" for api in document.apis)
    if document.web is not None:
        interfaces.append("web")
    return PapCompanySummary(
        organization=document.organization.name,
        domain=document.organization.domain,
        protocol_version=document.protocol_version,
        issuer=metadata.issuer if metadata is not None else None,
        sign_in=tuple(sign_in),
        scopes=dict(auth.scopes) if auth is not None else {},
        scope_hints={
            name: PapScopeHint(changes=hint.changes, personal_data=hint.personal_data)
            for name, hint in (auth.scope_hints.items() if auth is not None else ())
        },
        protected_resources=tuple(metadata.protected_resources)
        if metadata is not None
        else (),
        interfaces=tuple(interfaces),
        extensions={name: value.version for name, value in document.extensions.items()},
    )


def _identity_summary(
    metadata: ClientMetadata,
    keys: JsonWebKeySet,
) -> PapAgentIdentitySummary:
    """A verified personal agent as an agent may read it: no key coordinates."""
    algorithms = {
        key.alg or ("ES256" if key.kty == "EC" else "RS256") for key in keys.keys
    }
    return PapAgentIdentitySummary(
        client_id=metadata.client_id,
        client_name=metadata.client_name,
        redirect_count=len(metadata.redirect_uris),
        signing_algorithms=tuple(sorted(algorithms)),
        extensions={name: value.version for name, value in metadata.extensions.items()},
    )


class PapOperationSummary(BaseModel):
    """An operation a company returned: what the person approves, never a credential."""

    model_config = ConfigDict(frozen=True)

    operation_ref: str
    #: Opaque, the company's: confirmed exactly as it was shown.
    revision: str
    summary: str
    terms: dict[str, Any]
    expires_at: str


class PapReplyLine(BaseModel):
    """One message the company wrote, with who wrote it (``author``, PAP draft 0.3 §7.4)."""

    model_config = ConfigDict(frozen=True)

    #: The company's agent or one of its people.
    author: Literal["agent", "human"]
    #: The writer's display name, when the company gives one.
    name: str | None = None
    text: str


class PapAnswer(BaseModel):
    """What a company said in a conversation turn."""

    model_config = ConfigDict(frozen=True)

    company: str
    replies: tuple[PapReplyLine, ...]
    #: ``insufficient_scope`` with the scopes it names (PAP draft 0.3 §7.11):
    #: signed out, the person signs in for them; signed in, with them.
    authorization: dict[str, str] | None
    operations: tuple[PapOperationSummary, ...]
    status: str | None
    responder: str | None


class PapSignInSummary(BaseModel):
    """Where a Device Sign-In stands; the link and code are for the person."""

    model_config = ConfigDict(frozen=True)

    status: Literal[
        "waiting_for_the_person", "pending", "signed_in", "not_started", "unavailable"
    ]
    company: str
    #: The company's domain, shown with its name next to the link (PAP draft 0.3 §4.6).
    company_domain: str | None = None
    #: Where the person signs in, on the company's own page.
    open: str | None = None
    #: The code the person types there (the private device code is never said).
    code: str | None = None
    expires_at: str | None = None
    granted_scopes: tuple[str, ...] = ()
    missing_scopes: tuple[str, ...] = ()
    reason: str | None = None


class PapConfirmSummary(BaseModel):
    """What sending the person's approval came to, as the gateway's ``pap_confirm`` says it.

    ``confirmed``: the company answered; ``new_revision``: it returned other
    terms, ``operation``, which the person is asked about; ``in_progress``: it
    has not said what came of it, and the same action is not asked again until
    it has; ``not_approved``: the person said no, and nothing was sent;
    ``not_decided``: the revision expired, and the company is asked again.
    """

    model_config = ConfigDict(frozen=True)

    status: Literal[
        "confirmed", "new_revision", "in_progress", "not_approved", "not_decided"
    ]
    operation: PapOperationSummary
    #: For ``confirmed``: ``said`` when the company wrote how it went, else
    #: ``not_said``; nothing in its words says done or failed, so neither is guessed.
    state: Literal["said", "not_said"] | None = None
    #: What the company wrote, in its own words.
    result: str | None = None


class PapCapabilityError(Exception):
    """A personal-agent call the capability refuses, before anything is sent.

    ``code``: ``no_host`` (no PAP Reactor was given), ``no_conversation``,
    ``unknown_operation``, ``no_operations``,
    ``no_approval_surface``, ``approval_surface_ambiguous``, ``approval_failed``.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _operation_summary(operation: Operation) -> PapOperationSummary:
    """A returned operation as the person is shown it."""
    return PapOperationSummary(
        operation_ref=operation.operation_id,
        revision=operation.revision,
        summary=operation.summary,
        terms=dict(operation.terms or {}),
        expires_at=operation.expires_at.isoformat(),
    )


def session_ref(sid: str) -> str:
    """A Session named for a person: one-way, its ``sid`` is not recoverable from it."""
    return hashlib.sha256(sid.encode()).hexdigest()[:12]


@dataclass
class _Returned:
    """An operation the person may approve, and where the company returned it."""

    operation: Operation
    conversation_id: str
    #: The revision this one replaced, for what changed.
    replaces: Operation | None = None


@dataclass
class _Link:
    """What the personal agent holds at one company for one person, in the host's memory."""

    company: DiscoveredCompany
    #: The person's pairwise User ID there, the ``sub`` of its Session.
    pairwise_user_id: str
    session: PapSession | None = None
    #: The account's access token once the person signed in; signed out, none.
    token: AccessToken | None = None
    conversation_id: str | None = None
    cursor: str | None = None
    device_reference: str | None = None
    operations: dict[str, _Returned] = field(default_factory=dict)


class PapPersonalAgentCapability:
    """Use PAP clients while enforcing Agent Runtimes' public-summary boundary.

    ``reactor`` and ``http_client`` make it a local runtime's personal agent
    (Sessions, conversations, Device Sign-In, Operations), as ``client_id``
    for ``tenant_id``; without them it reads public metadata only and every
    session call raises ``PapCapabilityError("no_host")``.
    """

    def __init__(
        self,
        *,
        company_client: _CompanyClient | None = None,
        identity_client: _IdentityClient | None = None,
        reactor: PluginPlatform | None = None,
        http_client: httpx.AsyncClient | None = None,
        client_id: str | None = None,
        tenant_id: str = "local",
    ) -> None:
        if (reactor is None) != (http_client is None) or (reactor is None) != (
            client_id is None
        ):
            raise ValueError(
                "A personal agent needs its PAP reactor, its HTTP client and its client_id together"
            )
        self._reactor = reactor
        self._http = http_client
        self._session_http: SessionHttpClient | None = None
        self._client_id = client_id
        self._tenant_id = tenant_id
        self._links: dict[tuple[str, str], _Link] = {}
        self._metadata: ClientMetadata | None = None
        hosted = {"reactor": reactor, "http_client": http_client} if reactor else {}
        if company_client is None:
            self._owned_company: DiscoveryClient | None = DiscoveryClient(**hosted)
            self._company: _CompanyClient = self._owned_company
        else:
            self._owned_company = None
            self._company = company_client
        if identity_client is None:
            self._owned_identity: AgentIdentityClient | None = AgentIdentityClient(
                **hosted
            )
            self._identity: _IdentityClient = self._owned_identity
        else:
            self._owned_identity = None
            self._identity = identity_client

    async def __aenter__(self) -> PapPersonalAgentCapability:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        """Close only protocol clients created by this capability."""

        if self._owned_company is not None:
            await self._owned_company.aclose()
        if self._owned_identity is not None:
            await self._owned_identity.aclose()

    async def discover_company(self, domain: str) -> PapCompanySummary:
        """Discover and validate a company, then return public capabilities only."""

        return _company_summary(await self._company.discover(domain))

    async def inspect_agent(self, client_id: str) -> PapAgentIdentitySummary:
        """Verify client metadata and public JWKS, then return a safe identity summary."""

        metadata = await self._identity.fetch_metadata(client_id)
        keys = await self._identity.fetch_jwks(client_id)
        return _identity_summary(metadata, keys)

    # -- a local runtime's personal agent ---------------------------

    def _host(self) -> tuple[PluginPlatform, httpx.AsyncClient, str]:
        """The host's reactor, HTTP client and client_id, or ``no_host``."""
        if self._reactor is None or self._http is None or self._client_id is None:
            raise PapCapabilityError(
                "no_host",
                "This capability reads public metadata only: give it the host's PAP reactor",
            )
        return self._reactor, self._http, self._client_id

    def _transport(self) -> SessionHttpClient:
        """The one transport that puts the Session header on every request.

        One, so that it keeps each origin's latest DPoP nonce (§4.5).
        """
        reactor, http, _ = self._host()
        if self._session_http is None:
            self._session_http = SessionHttpClient(reactor=reactor, http_client=http)
        return self._session_http

    async def _link(self, user_id: str, domain: str) -> _Link:
        """What this person holds at the company, its verified issuer unchanged."""
        reactor, _, _ = self._host()
        company = await self._company.discover(domain)
        link = self._links.get((user_id, domain))
        if link is not None:
            # A company that stops or starts having an issuer has changed too, even
            # with the same identifier: its domain when it has none (§3.2).
            if (link.company.issuer, link.company.identifier) != (
                company.issuer,
                company.identifier,
            ):
                # Its pairwise identity, Session and tokens belong to the old issuer.
                raise PapCapabilityError(
                    "issuer_changed",
                    f"{domain}'s verified issuer changed since this person reached it: nothing is sent",
                )
            link.company = company
            return link
        pairwise = await resolve_pairwise_user_id(
            reactor,
            tenant_id=self._tenant_id,
            local_user_id=user_id,
            company_issuer=company.identifier,
        )
        link = _Link(company=company, pairwise_user_id=pairwise)
        self._links[(user_id, domain)] = link
        return link

    async def _session(self, link: _Link) -> PapSession:
        """The person's Session at the company, started with a new ``sid`` when there is none."""
        reactor, http, client_id = self._host()
        if link.session is None:
            link.session = await SessionClient(reactor=reactor, http_client=http).start(
                client_id=client_id,
                pairwise_user_id=link.pairwise_user_id,
                issuer=link.company.identifier,
                tenant_id=self._tenant_id,
            )
        return link.session

    def _keep(
        self, link: _Link, page: Any, replaces: Operation | None = None
    ) -> list[Operation]:
        """Where a conversation stands, and the operations its page returned."""
        link.conversation_id = page.conversation_id
        link.cursor = getattr(page, "cursor", link.cursor)
        returned = [
            event.message.operation
            for event in getattr(page, "events", [])
            if event.type == "message"
            and event.message
            and event.message.role == "company"
            and event.message.operation is not None
        ]
        for operation in returned:
            link.operations[operation.operation_id] = _Returned(
                operation, page.conversation_id, replaces
            )
        return returned

    async def ask(self, domain: str, text: str, *, user_id: str) -> PapAnswer:
        """Say ``text`` to the company for ``user_id``, in one conversation per company.

        A Session is opened (signed out until the person signs in) on first
        use; the answer is the company's words, what it asks for (sign-in, a
        scope) and the operations it proposed, kept for :meth:`confirm`.
        """
        reactor, _, _ = self._host()
        link = await self._link(user_id, domain)
        name = link.company.document.organization.name
        if link.company.document.agent is None:
            raise PapCapabilityError(
                "no_conversation", f"{domain} has no agent to talk to"
            )
        endpoint = link.company.document.agent.protocols[0].endpoint
        session = await self._session(link)
        client = ConversationClient(transport=self._transport())
        # The agent's own words (PAP-7.8-01): what it is given to say is not
        # known to be the person's, so it is never sent as theirs.
        message = Message(
            id=generate_message_id(reactor), author=Author(type="agent"), text=text
        )
        if link.conversation_id is None:
            page = await client.start(
                endpoint, message, session=session, token=link.token, wait=10
            )
        else:
            page = await client.send(
                endpoint,
                link.conversation_id,
                message,
                session=session,
                token=link.token,
                cursor=link.cursor,
                wait=10,
            )
        operations = self._keep(link, page)
        replies: list[PapReplyLine] = []
        authorization: dict[str, str] | None = None
        for event in getattr(page, "events", []):
            if event.type == "authorization" and event.error:
                authorization = {"error": event.error, "scope": event.scope or ""}
            elif (
                event.type == "message"
                and event.message
                and event.message.role == "company"
                and event.message.text
            ):
                replies.append(
                    PapReplyLine(
                        author=event.message.author.type,
                        name=event.message.author.name,
                        text=event.message.text,
                    )
                )
        return PapAnswer(
            company=name,
            replies=tuple(replies),
            authorization=authorization,
            operations=tuple(_operation_summary(item) for item in operations),
            status=getattr(page, "status", None),
            responder=getattr(page, "responder", None),
        )

    async def sign_in(
        self, domain: str, *, user_id: str, scopes: tuple[str, ...] | None = None
    ) -> PapSignInSummary:
        """Start Device Sign-In: the person signs in on the company's own page.

        Device Sign-In is offered when the issuer's ``grant_types_supported``
        lists it (PAP draft 0.3 §3.2). ``scopes`` must be among the issuer's
        ``scopes_supported`` (all of them when omitted). Direct and Mediated
        Sign-In need a host page to hand the browser or the typed values to; a
        local runtime does not offer them.
        """
        reactor, http, client_id = self._host()
        link = await self._link(user_id, domain)
        name = link.company.document.organization.name
        metadata = link.company.oauth_metadata
        if (
            metadata is None
            or not metadata.offers_device
            or metadata.device_authorization_endpoint is None
        ):
            return PapSignInSummary(
                status="unavailable",
                company=name,
                reason=f"{domain} offers no Device Sign-In, the one a local runtime does",
            )
        offered = tuple(metadata.scopes_supported or ())
        asked = offered if scopes is None else tuple(scopes)
        beyond = [scope for scope in asked if scope not in offered]
        if beyond or not asked:
            return PapSignInSummary(
                status="unavailable",
                company=name,
                reason=f"Ask among the scopes {domain} offers: {', '.join(offered)}",
            )
        if link.token is not None:
            # One account per Session: signing in again starts another one.
            link.session = None
            link.token = None
            link.conversation_id = None
            link.cursor = None
            link.operations.clear()
        await self._session(link)
        started = await DeviceSignInClient(reactor=reactor, http_client=http).begin(
            device_authorization_endpoint=metadata.device_authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            issuer=metadata.issuer,
            client_id=client_id,
            scopes=asked,
            tenant_id=self._tenant_id,
            # The SDK shows the link only on the company's issuer host or the host of
            # one of its protected_resources, and names the company with it (§4.6).
            organization=link.company.document.organization,
            protected_resources=metadata.protected_resources,
            dpop_signing_algs=metadata.dpop_signing_alg_values_supported,
        )
        link.device_reference = started.reference
        return PapSignInSummary(
            status="waiting_for_the_person",
            company=name,
            company_domain=started.organization_domain,
            open=started.verification_uri_complete or started.verification_uri,
            code=started.user_code,
            expires_at=started.expires_at.isoformat(),
        )

    async def sign_in_status(self, domain: str, *, user_id: str) -> PapSignInSummary:
        """Poll the Device Sign-In once (paced as the company asks)."""
        reactor, http, _ = self._host()
        link = await self._link(user_id, domain)
        name = link.company.document.organization.name
        if link.device_reference is None:
            return PapSignInSummary(
                status="signed_in" if link.token else "not_started",
                company=name,
                granted_scopes=link.token.scopes if link.token else (),
            )
        polled = await DeviceSignInClient(reactor=reactor, http_client=http).poll(
            link.device_reference
        )
        if polled.status == "pending" or polled.token is None:
            return PapSignInSummary(
                status="pending",
                company=name,
                expires_at=polled.retry_at.isoformat() if polled.retry_at else None,
            )
        link.token, link.device_reference = polled.token, None
        return PapSignInSummary(
            status="signed_in",
            company=name,
            granted_scopes=tuple(polled.granted_scopes),
            missing_scopes=tuple(polled.missing_scopes),
        )

    async def _metadata_of_self(self) -> ClientMetadata:
        """Read this personal agent's own client metadata, once."""
        _, _, client_id = self._host()
        if self._metadata is None:
            self._metadata = await self._identity.fetch_metadata(client_id)
        return self._metadata

    async def confirm(
        self, domain: str, operation_ref: str, revision: str, *, user_id: str
    ) -> PapConfirmSummary:
        """Send an operation to the person, and their approval of this exact revision.

        The person, not the model, answers, every time: the host's
        ``pap.approvalSurface`` is shown the company's name, summary and terms;
        only ``True`` approves. Without a surface nothing is sent
        (``no_approval_surface``). The approval goes as a message in the
        conversation that returned the operation, the same on every send, and
        the action is done at most once. Another revision in answer is
        ``new_revision``, for the person to be asked about.
        """
        reactor, _, _ = self._host()
        link = await self._link(user_id, domain)
        returned = link.operations.get(operation_ref)
        if returned is None or returned.operation.revision != revision:
            raise PapCapabilityError(
                "unknown_operation",
                "Confirm an operation and revision the company returned, as it was shown",
            )
        operation = returned.operation
        if not operations_negotiated(
            link.company.document, await self._metadata_of_self()
        ):
            raise PapCapabilityError(
                "no_operations", f"{domain} and this agent do not both offer Operations"
            )
        client = OperationsClient(reactor=reactor)
        try:
            approval = await client.ask_user(
                operation,
                organization=link.company.document.organization,
                tenant_id=self._tenant_id,
                replaces=returned.replaces,
            )
        except OperationError as error:
            if error.code == "not_approved":
                return PapConfirmSummary(
                    status="not_approved", operation=_operation_summary(operation)
                )
            if error.code == "revision_expired":
                return PapConfirmSummary(
                    status="not_decided", operation=_operation_summary(operation)
                )
            raise PapCapabilityError(error.code, error.message) from error
        conversations = ConversationClient(transport=self._transport())
        document = link.company.document
        assert (
            document.agent is not None
        )  # It returned the operation in a conversation.
        session = await self._session(link)
        message = Message(
            id=generate_message_id(reactor),
            author=Author(type="agent"),
            text="The person approved this.",
            approval=approval,
        )
        sent = await client.send(
            lambda approved: conversations.send(
                document.agent.protocols[0].endpoint,
                returned.conversation_id,
                message.model_copy(update={"approval": approved}),
                session=session,
                token=link.token,
                cursor=link.cursor
                if returned.conversation_id == link.conversation_id
                else None,
                wait=10,
            ),
            approval,
        )
        if sent.status == "unknown":
            return PapConfirmSummary(
                status="in_progress", operation=_operation_summary(operation)
            )
        revised = self._keep(link, sent.answer, operation)
        if revised:
            return PapConfirmSummary(
                status="new_revision", operation=_operation_summary(revised[0])
            )
        link.operations.pop(operation_ref, None)
        said = " ".join(
            event.message.text
            for event in getattr(sent.answer, "events", [])
            if event.type == "message"
            and event.message
            and event.message.role == "company"
            and event.message.text
        )
        return PapConfirmSummary(
            status="confirmed",
            operation=_operation_summary(operation),
            state="said" if said else "not_said",
            result=said or None,
        )

    def session_of(self, domain: str, *, user_id: str) -> dict[str, Any] | None:
        """The Session at a company as a person's card names it: a one-way reference."""
        link = self._links.get((user_id, domain))
        if link is None or link.session is None:
            return None
        return {
            "ref": session_ref(link.session.sid),
            "signed_in": link.token is not None,
        }
