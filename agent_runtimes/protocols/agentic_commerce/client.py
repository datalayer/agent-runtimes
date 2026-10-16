# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An Agentic Commerce Protocol client (PR-40 to PR-42), ``2026-04-17``.

Named ``agentic_commerce`` everywhere, never ``acp``: that is the Agent
Client Protocol of :mod:`agent_runtimes.transports.acp` (PR-40).

Discovery (``/.well-known/acp.json``) and checkout sessions over REST, every
answer read through the models generated from the specification's JSON
Schema (:mod:`.models`, PR-41). Completing a checkout is a purchase, and
goes as every purchase does (:mod:`agent_runtimes.protocols.commerce`): an
exact, revisioned :class:`~agent_runtimes.protocols.commerce.CheckoutProposal`
approved by the person, completed once, paid with a delegated payment token
the host holds — never one a model saw.

Every request carries ``Authorization: Bearer`` (the agent's credential with
the seller, from the host), ``API-Version: 2026-04-17``, and on every POST
an ``Idempotency-Key``.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Mapping, Optional, Protocol, runtime_checkable
from urllib.parse import urlsplit

import httpx

from ..commerce import (
    CheckoutApprover,
    CheckoutProposal,
    ProposalStore,
    digest,
)
from ..egress import MAX_METADATA_BYTES, Fetch, metadata_fetch

#: The version implemented (``API-Version``), as the specification dates it.
AGENTIC_COMMERCE_VERSION = "2026-04-17"
#: Where a seller publishes its discovery document.
DISCOVERY_PATH = "/.well-known/acp.json"


class AgenticCommerceError(RuntimeError):
    """A seller answered with an error, or a rule of the protocol was not met."""


@runtime_checkable
class SellerCredentials(Protocol):
    """The agent's bearer credential with one seller (``agentic_commerce.credentials``)."""

    async def bearer(self, seller: str) -> str: ...


@runtime_checkable
class PaymentData(Protocol):
    """The payment data of an approved proposal (``agentic_commerce.paymentData``).

    A delegated payment token (``spt``) from the host's custody, for one of
    the handlers the seller offers.
    """

    async def payment_data(
        self, proposal: CheckoutProposal, handlers: list[Mapping[str, Any]]
    ) -> Mapping[str, Any]: ...


@dataclass(frozen=True)
class SellerDiscovery:
    """What a seller publishes at ``/.well-known/acp.json``, as this client uses it."""

    domain: str
    api_base_url: str
    versions: tuple[str, ...]
    services: tuple[str, ...]
    extensions: tuple[str, ...]


def _total(session: Mapping[str, Any]) -> int:
    for total in session.get("totals", []):
        if total.get("type") == "total":
            return int(total["amount"])
    raise AgenticCommerceError("the session says no total")


def revision_of(session: Mapping[str, Any]) -> str:
    """The revision of what a checkout session buys."""
    return digest(
        {
            "id": session["id"],
            "currency": session["currency"],
            "line_items": [
                {
                    "item": line["item"].get("id"),
                    "price": line["item"].get("unit_amount"),
                    "quantity": line["quantity"],
                }
                for line in session.get("line_items", [])
            ],
            "totals": [
                {"type": total["type"], "amount": total["amount"]}
                for total in session.get("totals", [])
            ],
        }
    )


def _session(body: Mapping[str, Any]) -> dict[str, Any]:
    from .models import CheckoutSessionBase, CheckoutSessionWithOrder

    if "order" in body:
        CheckoutSessionWithOrder.model_validate(body)
    else:
        CheckoutSessionBase.model_validate(body)
    return dict(body)


def items_of(items: list[Mapping[str, Any]]) -> list[dict[str, str]]:
    """``line_items`` as the 2026-04-17 schema writes them: one ``Item`` per unit.

    The schema's ``Item`` has no ``quantity`` and forbids other fields, while
    the specification's examples send one: the schema is normative here, so
    a quantity of two is the item twice, and the seller counts them.
    """
    out: list[dict[str, str]] = []
    for item in items:
        out.extend({"id": str(item["id"])} for _ in range(int(item.get("quantity", 1))))
    return out


@dataclass
class AgenticCommerceClient:
    """An agent's client of one seller."""

    seller: str
    credentials: SellerCredentials
    #: The extensions this agent understands, sent as ``capabilities.extensions``.
    extensions: tuple[str, ...] = ()
    http: httpx.AsyncClient = field(
        default_factory=lambda: httpx.AsyncClient(timeout=15.0)
    )
    #: How its public metadata is read: the PAP SDK's single egress path
    #: (PI-13), or ``egress.client_fetch`` for a local test one.
    metadata: Fetch = field(
        default_factory=lambda: metadata_fetch(
            accept="application/json", max_bytes=MAX_METADATA_BYTES
        )
    )
    discovery: Optional[SellerDiscovery] = None

    async def discover(self) -> SellerDiscovery:
        """Read and check the seller's discovery document: the version, REST, checkout."""
        from .models import DiscoveryResponse

        status, _, body = await self.metadata(
            f"{self.seller.rstrip('/')}{DISCOVERY_PATH}"
        )
        if status != 200:
            raise AgenticCommerceError(f"{DISCOVERY_PATH} answered {status}")
        document = json.loads(body)
        DiscoveryResponse.model_validate(document)
        protocol = document["protocol"]
        if (
            protocol["name"] != "acp"
            or AGENTIC_COMMERCE_VERSION not in protocol["supported_versions"]
        ):
            raise AgenticCommerceError(
                f"the seller supports {protocol['supported_versions']}, not {AGENTIC_COMMERCE_VERSION}"
            )
        if "rest" not in document["transports"]:
            raise AgenticCommerceError("the seller offers no REST transport")
        services = tuple(document["capabilities"]["services"])
        if "checkout" not in services:
            raise AgenticCommerceError("the seller offers no checkout")
        self.discovery = SellerDiscovery(
            domain=urlsplit(self.seller).hostname or self.seller,
            api_base_url=str(document["api_base_url"]).rstrip("/"),
            versions=tuple(protocol["supported_versions"]),
            services=services,
            extensions=tuple(
                e["name"] for e in document["capabilities"].get("extensions", [])
            ),
        )
        return self.discovery

    async def _call(
        self, method: str, path: str, body: Any = None, key: Optional[str] = None
    ) -> dict[str, Any]:
        discovery = self.discovery or await self.discover()
        headers = {
            "Authorization": f"Bearer {await self.credentials.bearer(discovery.domain)}",
            "API-Version": AGENTIC_COMMERCE_VERSION,
            "Content-Type": "application/json",
            "Request-Id": str(uuid.uuid4()),
        }
        if method == "POST":
            headers["Idempotency-Key"] = key or str(uuid.uuid4())
        answer = await self.http.request(
            method, f"{discovery.api_base_url}{path}", headers=headers, json=body
        )
        if answer.status_code == 409:
            raise AgenticCommerceError(
                "the idempotency key was reused with another request"
            )
        if answer.status_code >= 400:
            said = answer.json().get("message", "") if answer.content else ""
            raise AgenticCommerceError(
                f"{method} {path} answered {answer.status_code} {said}".strip()
            )
        return answer.json()

    async def create_checkout(
        self,
        items: list[Mapping[str, Any]],
        currency: str,
        buyer: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Any]:
        """Open a checkout session (``write``), declaring the extensions this agent understands."""
        request: dict[str, Any] = {
            "line_items": items_of(items),
            "currency": currency,
            "capabilities": {"extensions": list(self.extensions)}
            if self.extensions
            else {},
        }
        if buyer:
            request["buyer"] = dict(buyer)
        return _session(await self._call("POST", "/checkout_sessions", request))

    async def update_checkout(
        self, session_id: str, update: Mapping[str, Any]
    ) -> dict[str, Any]:
        body = dict(update)
        if "line_items" in body:
            body["line_items"] = items_of(body["line_items"])
        return _session(
            await self._call("POST", f"/checkout_sessions/{session_id}", body)
        )

    async def get_checkout(self, session_id: str) -> dict[str, Any]:
        return _session(await self._call("GET", f"/checkout_sessions/{session_id}"))

    async def cancel_checkout(self, session_id: str) -> dict[str, Any]:
        return _session(
            await self._call("POST", f"/checkout_sessions/{session_id}/cancel", {})
        )

    async def propose_completion(self, session_id: str) -> CheckoutProposal:
        """The exact purchase a ``ready_for_payment`` session would make (``read``)."""
        session = await self.get_checkout(session_id)
        if session["status"] != "ready_for_payment":
            raise AgenticCommerceError(
                f"the session is {session['status']}, not ready_for_payment"
            )
        discovery = self.discovery or await self.discover()
        return CheckoutProposal(
            id=str(uuid.uuid4()),
            merchant=discovery.domain,
            checkout_id=session["id"],
            revision=revision_of(session),
            currency=session["currency"].upper(),
            total=_total(session),
            lines=tuple(
                (
                    line.get("name") or line["item"].get("name") or line["item"]["id"],
                    int(line["quantity"]),
                    int(line["item"].get("unit_amount") or 0),
                )
                for line in session["line_items"]
            ),
            expires_at=session.get("expires_at"),
        )

    async def complete(
        self,
        proposal: CheckoutProposal,
        *,
        approver: CheckoutApprover,
        payment: PaymentData,
        store: ProposalStore,
    ) -> dict[str, Any]:
        """Complete an approved proposal, once (``buy``); refused as UCP's is (spent, declined, changed, expired)."""
        if proposal.expires_at and datetime.fromisoformat(
            proposal.expires_at.replace("Z", "+00:00")
        ) <= datetime.now(timezone.utc):
            raise AgenticCommerceError("the proposal has expired")
        if not await store.take(proposal.id):
            raise AgenticCommerceError("this proposal was used already")
        if not await approver.approve(proposal):
            raise AgenticCommerceError("the person did not approve this purchase")
        session = await self.get_checkout(proposal.checkout_id)
        if session["status"] != "ready_for_payment":
            raise AgenticCommerceError(
                f"the session is {session['status']}, not ready_for_payment"
            )
        if revision_of(session) != proposal.revision:
            raise AgenticCommerceError(
                "the session changed since it was proposed: propose it again"
            )
        handlers = list(
            (session.get("capabilities", {}).get("payment") or {}).get("handlers", [])
        )
        data = dict(await payment.payment_data(proposal, handlers))
        return _session(
            await self._call(
                "POST",
                f"/checkout_sessions/{proposal.checkout_id}/complete",
                {"payment_data": data},
                proposal.id,
            )
        )


def session_summary(session: Mapping[str, Any]) -> dict[str, Any]:
    """What an agent may see of a checkout session: no payment token."""
    summary: dict[str, Any] = {
        "id": session["id"],
        "status": session["status"],
        "currency": session["currency"],
        "lines": [
            {
                "title": line.get("name")
                or line["item"].get("name")
                or line["item"]["id"],
                "quantity": line["quantity"],
                "price": line["item"].get("unit_amount"),
            }
            for line in session.get("line_items", [])
        ],
        "totals": {
            total["type"]: total["amount"] for total in session.get("totals", [])
        },
        "messages": [
            message.get("content", "") for message in session.get("messages", [])
        ],
        "extensions": [
            e["name"] for e in (session.get("capabilities") or {}).get("extensions", [])
        ],
    }
    if session.get("order"):
        summary["order"] = {
            key: session["order"][key] for key in ("id", "permalink_url")
        }
    return summary


__all__ = [
    "AGENTIC_COMMERCE_VERSION",
    "AgenticCommerceClient",
    "AgenticCommerceError",
    "DISCOVERY_PATH",
    "PaymentData",
    "SellerCredentials",
    "SellerDiscovery",
    "revision_of",
    "session_summary",
]
