# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Loop application as a PAP company, through the SDK's reference company (AGENT_PROTOCOLS PR-04).

``PapCompanyCapability`` assembles ``personal_agent_protocol.company`` for an
application whose Appspec enables ``pap.company``. Its Reactor points:

- ``pap.company.agent`` is the application, asked over its A2A route (R-03)
  with the message marked ``metadata.pap`` — the turn the runtime reads in
  :mod:`agent_runtimes.loop.apps.pap_company`: a declared operation's tool
  call is proposed rather than made, returned as a ``pap_operation`` data
  part, and the Maker's sentence with the terms is what the person sees;
- ``pap.company.operationExecutor``, one per declared operation, is the
  application again: once the person confirmed the exact revision, a one-use
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

import secrets
import time
import uuid
from collections.abc import Awaitable, Callable, Iterable, Sequence
from typing import Any

import httpx
from personal_agent_protocol.company import (
    CLIENT_POLICIES,
    COMPANY_ACCOUNTS,
    COMPANY_AGENTS,
    OPERATION_EXECUTORS,
    AccountDirectory,
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
from personal_agent_protocol.models import Operation, OperationResult
from personal_agent_protocol.reactor import resolve_addresses
from reactor import PluginManifest

from agent_runtimes.loop.apps.pap_company import PAP_META_KEY, summary_of
from agent_runtimes.protocols.pap import OPERATION_TICKETS

#: How long a perform turn's ticket can be redeemed.
TICKET_LIFETIME_SECONDS = 300.0


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
    """Return the company's scopes, or the default read scope."""
    return tuple(str(scope) for scope in company.scopes) or ("poppy:read",)


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
        """Answer a turn, asking to sign in when needed."""
        scopes = list(_scopes(self.company))
        if turn.account_id is None and not self.company.signed_out:
            return [Reply(authorization=("sign_in_required", " ".join(scopes)))]
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
        # What it proposed, as its Appspec declares it: the wording and whether
        # only the person may confirm are the Maker's, never the model's.
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
                    user_approval_required=bool(declared.user_approval_required),
                )
            )
        if not proposed:
            return [Reply(text=text)]
        if turn.account_id is None:
            # Nothing is done for nobody: the personal agent signs in first.
            return [
                Reply(text=text),
                Reply(authorization=("sign_in_required", " ".join(scopes))),
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

    async def perform(self, operation: Operation, account_id: str) -> OperationResult:
        """Perform the operation for the account with a ticket."""
        ticket = self.tickets.issue(
            {
                "action": self.action,
                "tool": self.tool,
                "terms": dict(operation.terms or {}),
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
                OperationResult(
                    summary=said or "Nothing was done: the call was not made."
                )
            )
        if state not in (None, "completed"):
            raise OperationOutcomeUnknown(f"the application's turn ended {state}")
        return OperationResult(summary=said or "Done.")


class RegisteredAgents:
    """``pap.company.clientPolicy``: only the personal agents the Appspec registers."""

    def __init__(self, client_ids: Iterable[str]) -> None:
        """Accept the given client ids."""
        self.client_ids = frozenset(client_ids)

    async def allows(self, client_id: str) -> bool:
        """Tell whether ``client_id`` is registered."""
        return client_id in self.client_ids


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
                RegisteredAgents(company.registered_agents),
                contribution_id="registered",
                order=10,
            )
        for declared in company.operations:
            contribute(
                OPERATION_EXECUTORS,
                ApplicationOperationExecutor(
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
    ) -> None:
        """Configure the company's name, domain and application."""
        if not company.enabled:
            raise ValueError("The Appspec does not enable pap.company")
        interfaces = {str(getattr(i, "value", i)) for i in company.interfaces}
        if interfaces != {"agent"}:
            raise ValueError(
                "A local company offers the agent interface only (its A2A route); "
                f"the Appspec asks for {', '.join(sorted(interfaces))}"
            )
        giving = [o.action for o in company.operations if o.allows is not None]
        if giving:
            # Recorded as the person's approval in advance, which only Datalayer
            # keeps (PAP_DATALAYER R-07): a company in this process has nowhere to.
            raise ValueError(
                f"A local company gives no standing permission: {giving[0]} is given "
                "only by the application shipped on Datalayer"
            )
        self.company = company
        self.application = application
        self.accounts = accounts
        self.tickets = MemoryOperationTickets()
        scopes = _scopes(company)
        self.config = CompanyConfig(
            name=name,
            domain=domain,
            scopes=scopes,
            write_scopes=tuple(scope for scope in scopes if scope.endswith(":write")),
            device=True,
            direct=False,
            operations="operations" in company.extensions,
            device_page=device_page,
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
    "MemoryOperationTickets",
    "PapCompanyCapability",
    "RegisteredAgents",
    "a2a_data",
    "a2a_parts",
    "a2a_texts",
]
