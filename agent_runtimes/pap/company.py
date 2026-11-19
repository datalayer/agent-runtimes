# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Loop application as a PAP company, through the SDK's reference company.

``PapCompanyCapability`` assembles ``personal_agent_protocol.company`` for an
application whose Appspec enables ``pap.company``. Its Reactor points:

- ``pap.company.agent`` is the application, asked over its A2A route
  with the message marked ``metadata.pap`` — the turn the runtime reads in
  :mod:`agent_runtimes.apps.pap_company`: a declared operation's tool
  call is proposed rather than made, returned as a ``pap_operation`` data
  part, and the Maker's sentence with the terms is what the person sees;
- ``pap.company.operationExecutor``, one per declared operation, is the
  application again: once the person approved the exact revision, a one-use
  ticket is issued and the application is asked to perform; the runtime
  redeems the ticket at ``pap.company.operationTickets`` (contributed by
  :meth:`PapCompanyCapability.runtime_plugin` on the runtime's platform) and
  makes that one call, then says ``pap_performed``;
- ``pap.company.clientPolicy`` admits only the registered personal agents
  when the Appspec says ``personal_agents: registered``;
- ``pap.company.accounts`` is the host's: whose account a person signs in to.

Datalayer's company service (ai-agents) is the hosted form of the same
company; this is the open-source one, for a local runtime. A local company
offers the ``agent`` interface and Device Sign-In; an Appspec asking for more
is refused when the capability is built.
"""

from __future__ import annotations

import json
import secrets
import time
import uuid
from collections.abc import Awaitable, Callable, Iterable, Sequence
from datetime import timedelta
from typing import Any

import httpx
from personal_agent_protocol.company import (
    CLIENT_POLICIES,
    COMPANY_ACCOUNTS,
    COMPANY_AGENTS,
    COMPANY_APIS,
    OPERATION_EXECUTORS,
    AccountDirectory,
    ActionResult,
    ApiCall,
    ApiResult,
    CompanyConfig,
    CompanyService,
    OperationFailed,
    OperationOutcomeUnknown,
    ProposedOperation,
    Reply,
    Turn,
    build_company,
    company_app,
)
from personal_agent_protocol.models import Operation
from personal_agent_protocol.reactor import resolve_addresses
from reactor import PluginManifest

from agent_runtimes.apps.pap_company import PAP_META_KEY, summary_of
from agent_runtimes.protocols.pap import OPERATION_TICKETS, pap_protocol_version

#: How long a perform turn's ticket can be redeemed.
TICKET_LIFETIME_SECONDS = 300.0

#: How long another MCP client stays signed in once a person allowed it: its refresh
#: tokens rotate at every use, and after this long the person allows it again.
MCP_CLIENT_SIGN_IN_LIFETIME = timedelta(days=30)


def a2a_parts(result: Any) -> list[dict[str, Any]]:
    """Every part of an A2A answer, whether a message or a task."""
    found: list[dict[str, Any]] = []

    def parts(value: Any) -> None:
        """Collect the dict parts of a message."""
        for part in (value or {}).get("parts") or []:
            if isinstance(part, dict):
                found.append(part)

    if not isinstance(result, dict):
        return found
    parts(result)
    parts((result.get("status") or {}).get("message"))
    for artifact in result.get("artifacts") or []:
        parts(artifact)
    return found


def a2a_texts(result: Any) -> list[str]:
    """The text parts of an A2A answer."""
    return [
        str(part["text"])
        for part in a2a_parts(result)
        if part.get("kind", "text") == "text" and part.get("text")
    ]


def a2a_data(result: Any, key: str) -> list[dict[str, Any]]:
    """The data parts of an A2A answer carrying ``key``, each its value."""
    found = []
    for part in a2a_parts(result):
        data = part.get("data")
        if isinstance(data, dict) and isinstance(data.get(key), dict):
            found.append(data[key])
    return found


class A2AApplication:
    """The application, asked over its A2A route (``message/send``, JSON-RPC).

    ``credential(opened_by)`` answers the bearer token a message is sent with
    (the host mints one per personal agent, as Datalayer's visitor tokens),
    or None for a route that takes none.
    """

    def __init__(
        self,
        url: str,
        *,
        http_client: httpx.AsyncClient,
        credential: Callable[[str], Awaitable[str | None]] | None = None,
    ) -> None:
        """Reach the application at ``url`` with ``http_client``."""
        self.url = url.rstrip("/") + "/"
        self.http = http_client
        self.credential = credential

    async def ask(
        self, opened_by: str, text: str, pap: dict[str, Any]
    ) -> dict[str, Any] | None:
        """The A2A ``result``, or None when the application did not answer."""
        token = await self.credential(opened_by) if self.credential else None
        body = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "messageId": str(uuid.uuid4()),
                    "parts": [{"kind": "text", "text": text}],
                    # Who the personal agent acts for here; never a credential.
                    "metadata": {PAP_META_KEY: pap},
                }
            },
        }
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        answered = await self.http.post(self.url, json=body, headers=headers)
        if answered.status_code >= 300:
            return None
        result = (answered.json() or {}).get("result")
        return result if isinstance(result, dict) else None


def _scopes(company: Any) -> tuple[str, ...]:
    """Return the names of the scopes the company offers (PAP draft 0.3 §4.4)."""
    return tuple(str(scope.name) for scope in company.scopes)


def _scope_hints(company: Any) -> dict[str, tuple[str, bool]]:
    """The hints the Maker gave, for the scopes whose both hints are said (``auth.scope_hints``)."""
    hints: dict[str, tuple[str, bool]] = {}
    for scope in company.scopes:
        changes = getattr(scope.changes, "value", scope.changes)
        if changes is not None and scope.personal_data is not None:
            hints[str(scope.name)] = (str(changes), bool(scope.personal_data))
    return hints


def _excluded_tasks(company: Any) -> tuple[dict[str, Any], ...]:
    """The tasks it does not offer through the protocol, as the tasks response lists them
    for each Session (PAP 1.0 §9).
    """
    return tuple(
        task.model_dump(mode="json", exclude_none=True, exclude_defaults=True)
        for task in company.excluded_tasks
    )


class ApplicationCompanyAgent:
    """``pap.company.agent``: the application answers each turn."""

    def __init__(self, company: Any, application: A2AApplication) -> None:
        """Answer for ``company`` through ``application``."""
        self.company = company
        self.application = application

    def _declared(self, action: str) -> Any:
        """Return the company's operation for ``action``, or None."""
        for operation in self.company.operations:
            if operation.action == action:
                return operation
        return None

    async def respond(self, turn: Turn) -> Sequence[Reply]:
        """Answer a turn, asking for the scopes it needs when they are not held.

        Signed out, ``insufficient_scope`` names what to sign in for; signed
        in, what to ask for again (PAP draft 0.3 §7.11).
        """
        scopes = list(_scopes(self.company))
        if turn.account_id is None and not self.company.signed_out:
            return [Reply(authorization=("insufficient_scope", " ".join(scopes)))]
        # Signed in, the person's account is read only with a read scope (a
        # write scope alone never reads); an operation is proposed only with a write scope.
        reads = [scope for scope in scopes if scope.endswith(":read")]
        writes = [scope for scope in scopes if scope.endswith(":write")]
        if turn.account_id is not None and reads and not set(reads) & set(turn.scopes):
            return [Reply(authorization=("insufficient_scope", " ".join(reads)))]
        result = await self.application.ask(
            f"pap:{turn.client_id}",
            turn.text or "",
            {"account": turn.account_id, "client_id": turn.client_id},
        )
        if result is None:
            return [
                Reply(
                    text="The application could not answer just now. Try again in a moment."
                )
            ]
        text = "\n\n".join(a2a_texts(result)) or "…"
        # What it proposed, as its Appspec declares it: the wording is the
        # Maker's, never the model's. Nothing but the terms says what an action
        # is done to, so other terms are another operation, not a new revision.
        proposed = []
        for proposal in a2a_data(result, "pap_operation"):
            declared = self._declared(str(proposal.get("action") or ""))
            terms = proposal.get("terms")
            if declared is None or not isinstance(terms, dict):
                continue
            proposed.append(
                ProposedOperation(
                    action=declared.action,
                    summary=summary_of(declared.summary, terms),
                    terms=terms,
                    subject=json.dumps(terms, sort_keys=True, default=str),
                )
            )
        if not proposed:
            return [Reply(text=text)]
        if turn.account_id is None:
            # Nothing is done for nobody: the personal agent signs in first.
            return [
                Reply(text=text),
                Reply(authorization=("insufficient_scope", " ".join(scopes))),
            ]
        if writes and not set(writes) & set(turn.scopes):
            return [
                Reply(text=text),
                Reply(authorization=("insufficient_scope", " ".join(writes))),
            ]
        if not turn.supports_operations:
            return [Reply(text=text)]
        return [
            Reply(text=text, operation=proposed[0]),
            *(Reply(operation=more) for more in proposed[1:]),
        ]


class MemoryOperationTickets:
    """One-use tickets for confirmed operations, kept in this process."""

    def __init__(self, lifetime: float = TICKET_LIFETIME_SECONDS) -> None:
        """Keep tickets in memory for ``lifetime`` seconds."""
        self.lifetime = lifetime
        self._tickets: dict[str, tuple[float, dict[str, Any]]] = {}

    def issue(self, record: dict[str, Any]) -> str:
        """Issue a ticket for ``record``."""
        ticket = secrets.token_urlsafe(32)
        self._tickets[ticket] = (time.monotonic() + self.lifetime, dict(record))
        return ticket

    async def redeem(self, ticket: str, credential: str) -> dict[str, Any] | None:
        """Redeem a ticket once; None when unknown or expired."""
        held = self._tickets.pop(ticket, None)
        if held is None or held[0] < time.monotonic():
            return None
        return held[1]


class ApplicationOperationExecutor:
    """``pap.company.operationExecutor`` for one declared action: the application makes the call.

    Its outcome is what the runtime says it did (``pap_performed``): made, the
    result is its answer; not made, it failed with nothing changed; anything
    else leaves the operation in progress rather than claim it either way.
    """

    def __init__(
        self,
        declared: Any,
        application: A2AApplication,
        tickets: MemoryOperationTickets,
    ) -> None:
        """Perform a declared operation through the application."""
        self.action = str(declared.action)
        self.tool = str(declared.tool)
        self.application = application
        self.tickets = tickets

    async def perform(
        self, operation: Operation, account_id: str | None
    ) -> ActionResult:
        """Perform the operation for the account with a ticket."""
        ticket = self.tickets.issue(
            {
                "action": self.action,
                "tool": self.tool,
                "terms": dict(operation.terms),
            }
        )
        try:
            result = await self.application.ask(
                f"pap-operation:{operation.operation_id}",
                "Perform the operation the person confirmed.",
                {"account": account_id, "perform": {"ticket": ticket}},
            )
        except httpx.HTTPError as error:
            raise OperationOutcomeUnknown(str(error)) from error
        if result is None:
            raise OperationOutcomeUnknown("the application did not answer")
        said = "\n\n".join(a2a_texts(result)).strip()
        performed = a2a_data(result, "pap_performed")
        state = (result.get("status") or {}).get("state")
        if not performed or performed[0].get("action") != self.action:
            raise OperationOutcomeUnknown(
                "the application did not say whether it made the call"
            )
        if not performed[0].get("done"):
            raise OperationFailed(
                ActionResult(summary=said or "Nothing was done: the call was not made.")
            )
        if state not in (None, "completed"):
            raise OperationOutcomeUnknown(f"the application's turn ended {state}")
        return ActionResult(summary=said or "Done.")


class OpenApiOperationExecutor:
    """``pap.company.operationExecutor`` for an action of the Appspec's ``openapi``: once
    the person approved its exact terms, the operation is answered by the application's
    agent through the call contract (``agent_runtimes.addresses.call_operation``), the
    terms its inputs — the same answer its MCP and API servers give.

    Its answer is the result's ``data`` (under ``result`` when it is not an object);
    inputs that are not the operation's fail with nothing changed; anything else leaves
    the operation in progress rather than claim it either way.
    """

    def __init__(self, declared: Any, operation_id: str, operations: Any) -> None:
        """Perform ``operation_id`` of ``operations`` (an ``AddressedAgent``) for ``declared``."""
        self.action = str(declared.action)
        self.operation_id = operation_id
        self.operations = operations

    async def perform(
        self, operation: Operation, account_id: str | None
    ) -> ActionResult:
        """Answer the operation with its approved terms."""
        from agent_runtimes.addresses.access import Caller
        from agent_runtimes.addresses.operations import OperationError

        caller = Caller(kind="token", uid=account_id or "")
        try:
            answer = await self.operations.call(
                self.operation_id,
                dict(operation.terms),
                interface="agent",
                caller=caller,
            )
        except OperationError as error:
            if error.status == 400:
                raise OperationFailed(
                    ActionResult(summary=f"Nothing was done: {error.detail}")
                ) from error
            raise OperationOutcomeUnknown(error.detail) from error
        data = answer if isinstance(answer, dict) else {"result": answer}
        return ActionResult(summary=f"{self.action}: done.", data=data)


class ApprovedOperationsApi:
    """``pap.company.api`` for the operations of the Appspec's ``openapi`` a person
    approves (those carrying ``x-pap``): what its API address hands the SDK when a
    personal agent calls one in its Session (``addresses.api``).

    It performs nothing. A call is answered with the operation to approve — its
    ``x-pap`` action, the request's inputs as its terms, the Maker's summary — and the
    SDK does the rest as the Operations extension says: ``403 approval_required``
    with the operation, the approval verified on the same request sent again, the
    action performed once through its executor (:class:`OpenApiOperationExecutor`),
    and a repeat answered with what it came to. Every other operation of the
    ``openapi`` is the API address's own to answer, and is not found here.
    """

    description = "The operations a person approves"

    def __init__(self, operations: Any) -> None:
        """Answer for the ``x-pap`` operations of ``operations`` (an ``AddressedAgent``)."""
        self.operations = operations

    def openapi(self) -> dict[str, Any]:
        """The application's own document, as its API address publishes it."""
        return dict(self.operations.published_document())

    def _found(self, call: ApiCall) -> tuple[Any, dict[str, Any]] | None:
        """The ``x-pap`` operation at the call's method and path, and its path values."""
        import re

        for found in getattr(self.operations, "operations", ()) or ():
            if not found.pap or found.method.upper() != call.method.upper():
                continue
            pattern = "".join(
                f"(?P<{part[1:-1]}>[^/]+)"
                if part.startswith("{") and part.endswith("}")
                else re.escape(part)
                for part in re.split(r"(\{[^/{}]+\})", found.path)
            )
            matched = re.fullmatch(pattern, call.path)
            if matched is not None:
                return found, matched.groupdict()
        return None

    async def handle(self, call: ApiCall) -> ApiResult:
        """The operation to approve for ``call``; never its effect."""
        from agent_runtimes.addresses.api import coerced
        from agent_runtimes.addresses.operations import input_problems

        found = self._found(call)
        if found is None:
            return ApiResult.not_found()
        operation, in_path = found
        # Who may call, as the deployment says now: never a copy kept from before.
        policy = await self.operations.access.current_policy()
        if not policy.admits(call.account_id or ""):
            # Who may call a private company is its owner's to say, here as at every address.
            return ApiResult(403, {"error": "access_denied"})
        scope = str(operation.pap.get("scope") or "")
        if scope and (call.account_id is None or scope not in call.scopes):
            return ApiResult.insufficient_scope(scope)
        inputs: dict[str, Any] = dict(call.body) if isinstance(call.body, dict) else {}
        properties = operation.input_schema.get("properties") or {}
        for name, location in operation.parameters:
            value = in_path.get(name) if location == "path" else call.query.get(name)
            if value is not None:
                inputs[name] = coerced(str(value), properties.get(name) or {})
        problems = input_problems(operation, inputs)
        if problems:
            # Nothing is proposed that could not be performed as asked.
            return ApiResult(400, {"error": "invalid_request", "errors": problems})
        template = str(operation.pap.get("summary") or operation.summary or "")
        return ApiResult(
            operation=ProposedOperation(
                action=str(operation.pap.get("action") or operation.operation_id),
                terms=inputs,
                summary=summary_of(template, inputs) if template else None,
                scopes=(scope,) if scope else (),
            )
        )


def openapi_operation_of(operations: Any, action: str) -> str | None:
    """The ``operationId`` whose ``x-pap`` says ``action``, or ``None``."""
    for found in getattr(operations, "operations", ()) or ():
        if str((found.pap or {}).get("action") or "") == action:
            return str(found.operation_id)
    return None


class RegisteredAgents:
    """``pap.company.clientPolicy``: only the personal agents the Appspec registers.

    ``public_clients``: whether the company lets other MCP clients sign in. They are
    no personal agents and are on no list: the policy answers for them apart
    (``allows_public``), all of them or none.
    """

    def __init__(
        self, client_ids: Iterable[str], *, public_clients: bool = False
    ) -> None:
        """Accept the given client ids."""
        self.client_ids = frozenset(client_ids)
        self.public_clients = public_clients

    async def allows(self, client_id: str) -> bool:
        """Tell whether ``client_id`` is registered."""
        return client_id in self.client_ids

    async def allows_public(self, client_id: str) -> bool:
        """Tell whether a client that is no personal agent may sign in at all."""
        return self.public_clients


class _CompanyPlugin:
    """The plugin contributing a company's accounts and operations."""

    def __init__(self, capability: PapCompanyCapability) -> None:
        """Keep the capability."""
        self.capability = capability

    def provide_contributions(self, contributions: Any) -> None:
        """Contribute the company's host pieces."""
        capability = self.capability
        company = capability.company
        contribute = contributions.contribute
        contribute(COMPANY_ACCOUNTS, capability.accounts, contribution_id="host")
        contribute(
            COMPANY_AGENTS,
            ApplicationCompanyAgent(company, capability.application),
            contribution_id="application",
        )
        if (
            str(getattr(company.personal_agents, "value", company.personal_agents))
            == "registered"
        ):
            contribute(
                CLIENT_POLICIES,
                RegisteredAgents(
                    company.registered_agents,
                    public_clients=capability.config.public_clients,
                ),
                contribution_id="registered",
                order=10,
            )
        if capability.rate_limit is not None:
            from personal_agent_protocol.company import COMPANY_RATE_LIMITS

            contribute(
                COMPANY_RATE_LIMITS, capability.rate_limit, contribution_id="host"
            )
        if capability.operations is not None and any(
            found.pap for found in getattr(capability.operations, "operations", ())
        ):
            # Its API address hands the calls of what a person approves to the SDK
            # (``addresses.api``): proposed here, approved and performed there.
            contribute(
                COMPANY_APIS,
                ApprovedOperationsApi(capability.operations),
                contribution_id="approved-operations",
            )
        for declared in company.operations:
            operation_id = (
                openapi_operation_of(capability.operations, str(declared.action))
                if capability.operations is not None
                else None
            )
            contribute(
                OPERATION_EXECUTORS,
                OpenApiOperationExecutor(declared, operation_id, capability.operations)
                if operation_id
                else ApplicationOperationExecutor(
                    declared, capability.application, capability.tickets
                ),
                contribution_id=f"operation-{declared.action}",
            )


class _TicketsPlugin:
    """The plugin contributing the operation tickets."""

    def __init__(self, tickets: MemoryOperationTickets) -> None:
        """Keep the tickets."""
        self.tickets = tickets

    def provide_contributions(self, contributions: Any) -> None:
        """Contribute the operation tickets."""
        contributions.contribute(
            OPERATION_TICKETS, self.tickets, contribution_id="local-company", order=50
        )


def agent_description(name: str, description: str = "") -> str:
    """What an agent can help with, as its ``poppy.json`` says it (PAP 1.0 §3.1)."""
    said = description.strip()
    return said or f"Anything about {name}"


def company_config(
    name: str,
    domain: str,
    company: Any,
    *,
    device_page: str | None = None,
    web: bool = False,
    description: str = "",
    resource_servers: Sequence[str] = (),
    mcp_clients: bool = False,
    consent_page: str | None = None,
) -> CompanyConfig:
    """What a company publishes at ``domain``, from its Appspec's ``pap.company``:
    what :class:`PapCompanyCapability` serves and the ``poppy.json`` of an agent
    that is a company (``agent_runtimes.addresses.poppy``).

    ``description``: what its agent can help with, the Appspec's ``description``
    (PAP 1.0 §3.1, §8.1: each ``agent.protocols`` entry says it); an application
    that says nothing is said to help with anything about it.

    ``resource_servers``: its services at URLs of their own that take its access
    tokens — its MCP server, at its MCP address (PAP 1.0 §4.5, §7): its issuer lists
    each in ``protected_resources`` and issues tokens for it.

    ``mcp_clients``: its owner lets other MCP clients sign in ("Let other MCP clients
    sign in", a private deployment's switch). Clients that are no personal agents (the
    SDK's public clients) then sign in with MCP's own OAuth flow, an authorization
    code with PKCE, after the person allowed them on ``consent_page`` (Datalayer's,
    with ``{request_id}``): by their client ID metadata document, or registered at
    ``/oauth/register``. They get tokens for ``resource_servers`` alone, with the
    company's own scopes, for 30 days, and nothing of the protocol: no Session, no
    default token. Off, nothing of this is offered.
    """
    if mcp_clients and not (consent_page and resource_servers):
        raise ValueError(
            "Other MCP clients sign in on a consent page, for its MCP address: "
            "give both, or leave them out"
        )
    if not company.enabled:
        raise ValueError("The Appspec does not enable pap.company")
    if not company.scopes:
        raise ValueError(
            "A company offers at least one scope of its own: the Appspec's pap.company.scopes is empty"
        )
    scopes = _scopes(company)
    return CompanyConfig(
        name=name,
        domain=domain,
        agent_description=agent_description(name, description),
        # The one PAP version a runtime speaks (the newest its SDK implements): poppy.json
        # is its document and nothing else is served; a request in another is refused.
        protocol_versions=(pap_protocol_version(),),
        scopes=scopes,
        # What each allows, published as auth.scopes, and the Maker's hints (§4.4).
        scope_descriptions={
            str(scope.name): str(scope.description) for scope in company.scopes
        },
        scope_hints=_scope_hints(company),
        excluded_tasks=_excluded_tasks(company),
        write_scopes=tuple(scope for scope in scopes if scope.endswith(":write")),
        device=True,
        # Direct Sign-In's authorization endpoint is what other MCP clients sign in at.
        direct=mcp_clients,
        public_clients=mcp_clients,
        client_registration=mcp_clients,
        # The company's own scopes, never `poppy:browser-sign-in` (a personal agent's).
        public_client_scopes=scopes if mcp_clients else None,
        public_client_refresh_lifetime=MCP_CLIENT_SIGN_IN_LIFETIME,
        consent_page=consent_page if mcp_clients else None,
        # `auth.disabled` (PAP 0.3 as published §3.2): it offers personal agents no sign-in.
        sign_in_disabled=bool(company.sign_in_disabled),
        # Its website (§6): a browser joins the person's Session there when it offers `web`.
        web=web,
        web_unscoped=bool(company.web_unscoped) and web,
        # `web.disabled` (PAP draft 0.4 §6): agents are asked to use its agent and APIs.
        web_disabled=bool(company.web_disabled),
        operations="operations" in company.extensions,
        device_page=device_page,
        resource_servers=tuple(resource_servers),
    )


class PapCompanyCapability:
    """An application, published as a PAP company at ``domain`` (served by :meth:`asgi`).

    ``company`` is the Appspec's ``pap.company`` (agentspecs ``AppPapCompany``);
    ``application`` reaches its A2A route; ``accounts`` is the host's account
    directory. The person approves a personal agent's Device Sign-In on the
    host's own page, which calls :meth:`approve_device`.
    """

    def __init__(
        self,
        *,
        name: str,
        domain: str,
        company: Any,
        application: A2AApplication,
        accounts: AccountDirectory,
        http_client: httpx.AsyncClient,
        device_page: str | None = None,
        plugins: Iterable[tuple[PluginManifest, object]] = (),
        address_resolver: Any = resolve_addresses,
        hosted: bool = False,
        operations: Any = None,
        description: str = "",
        resource_servers: Sequence[str] = (),
        mcp_clients: bool = False,
        consent_page: str | None = None,
        rate_limit: Any = None,
    ) -> None:
        """Configure the company's name, domain and application.

        ``mcp_clients``, ``consent_page``: other MCP clients sign in
        (:func:`company_config`). ``rate_limit``: the host's ``pap.company.rateLimit``,
        which the SDK asks before it registers a client or reads one's document.

        ``resource_servers``: its services at URLs of their own (its MCP server at
        its MCP address), which its issuer lists and issues tokens for (§4.5, §7).

        ``hosted``: the company at its agent's address (``{name}.agent.<domain>``),
        whose MCP, API and web servers answer beside it: every interface the
        Appspec lists is offered, its website among them.

        ``operations``: the agent at its addresses (``AddressedAgent``), whose
        ``openapi`` operations perform the PAP operations they carry (``x-pap``)
        through the call contract (:class:`OpenApiOperationExecutor`).
        """
        interfaces = {str(getattr(i, "value", i)) for i in company.interfaces}
        if not hosted and interfaces != {"agent"}:
            raise ValueError(
                "A local company offers the agent interface only (its A2A route); "
                f"the Appspec asks for {', '.join(sorted(interfaces))}"
            )
        self.company = company
        self.application = application
        self.accounts = accounts
        self.operations = operations
        self.rate_limit = rate_limit
        self.tickets = MemoryOperationTickets()
        self.config = company_config(
            name,
            domain,
            company,
            device_page=device_page,
            web=hosted and "web" in interfaces,
            description=description,
            resource_servers=resource_servers,
            mcp_clients=mcp_clients,
            consent_page=consent_page,
        )
        self.service: CompanyService = build_company(
            self.config,
            http_client=http_client,
            address_resolver=address_resolver,
            plugins=[
                (
                    PluginManifest(name="agent-runtimes.pap.company", version="1"),
                    _CompanyPlugin(self),
                ),
                *plugins,
            ],
        )

    def asgi(self) -> Any:
        """The company's ASGI application, answering at ``https://<domain>``."""
        return company_app(self.service)

    async def api_call(
        self,
        method: str,
        url: str,
        path: str,
        headers: Any,
        body: bytes,
        client_address: str | None = None,
    ) -> Any:
        """Answer a personal agent's call of the company's API made at an address of
        the API's own (``{name}.api.<domain>``), as the SDK answers one at its issuer.

        The SDK serves a company's API under its issuer (``/api/…``) and has no public
        entry for one served elsewhere, while a Session JWT is signed for the request's
        own method and URL (PAP §5.3). So the request is handed over as it came, its
        ``url`` the one the agent called, to the SDK's own handler of an API call
        (``CompanyService._api_call``: the Session, the access token, the approval, the
        idempotency key), and its refusals are answered as its dispatcher answers them.
        These are the SDK's internals, held to its ``0.37`` line by the dependency's
        bounds and by the test that drives a personal agent through an approval.

        Returns
        -------
        CompanyResponse
            The SDK's answer: a status, a JSON body and its headers.
        """
        from personal_agent_protocol.company import CompanyRequest
        from personal_agent_protocol.company import service as sdk
        from pydantic import ValidationError

        service = self.service
        request = CompanyRequest(
            method=method,
            url=url,
            headers=headers,
            body=body,
            client_address=client_address,
        )
        try:
            return await service._api_call(request, method.upper(), f"/api{path}")
        except sdk._RateLimitedError as limited:
            return service._rate_limited(limited.retry_after)
        except sdk._RefusedError as refused:
            return sdk._json_error(
                refused.status,
                refused.error,
                refused.headers,
                schemes=service.config.token_schemes,
                **refused.extra,
            )
        except (sdk.SessionError, sdk.ProofError) as error:
            if error.code in {"invalid_session", "session_ended"}:
                return sdk._json_error(400, error.code)
            return sdk._json_error(
                error.status_code or (401 if error.code == "invalid_client" else 400),
                error.code,
            )
        except (sdk.ProtocolValidationError, ValidationError):
            return sdk._json_error(400, "invalid_request")

    def runtime_plugin(self) -> tuple[PluginManifest, object]:
        """For the runtime's platform: its perform turns redeem this company's tickets."""
        return (
            PluginManifest(name="agent-runtimes.pap.local-company", version="1"),
            _TicketsPlugin(self.tickets),
        )

    async def approve_device(
        self, user_code: str, *, account_id: str, scopes: Sequence[str] | None = None
    ) -> tuple[str, ...]:
        """The person signed in on the host's page and approved the code: what they granted."""
        return await self.service.approve_device(
            user_code, account_id=account_id, scopes=scopes
        )


__all__ = [
    "A2AApplication",
    "ApplicationCompanyAgent",
    "ApplicationOperationExecutor",
    "ApprovedOperationsApi",
    "MemoryOperationTickets",
    "OpenApiOperationExecutor",
    "PapCompanyCapability",
    "RegisteredAgents",
    "a2a_data",
    "a2a_parts",
    "a2a_texts",
    "agent_description",
    "company_config",
]
