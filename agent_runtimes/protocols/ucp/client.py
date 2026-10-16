# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A UCP shopping client (AGENT_PROTOCOLS PR-30, PR-31): Universal Commerce Protocol ``2026-08-25``.

Discovery (``/.well-known/ucp``), catalog search, and the checkout lifecycle
over the REST binding, every response read through ``ucp-sdk`` 0.5.0's
Pydantic models (generated from the same schemas). A purchase is never one
call: :meth:`UcpClient.propose_completion` turns a ``ready_for_complete``
checkout into an exact, revisioned :class:`CheckoutProposal`; only an
approved proposal is completed, once (one approval model), and the
payment instrument comes from the host — never from the model.

Every request carries ``UCP-Agent: profile="<the agent's profile>"``, a
fresh ``Request-Id``, and on a state change an ``Idempotency-Key``; a host
that signs its agents' requests passes an ``httpx`` auth (Web Bot Auth,
:class:`~agent_runtimes.protocols.web_bot_auth.WebBotAuth`).
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
    InMemoryProposalStore,
    ProposalStore,
    digest,
)
from ..egress import MAX_METADATA_BYTES, Fetch, metadata_fetch

#: The UCP version implemented, as the specification dates it.
UCP_VERSION = "2026-08-25"
#: The shopping service and its root capability.
SHOPPING_SERVICE = "dev.ucp.shopping"
CHECKOUT_CAPABILITY = "dev.ucp.shopping.checkout"
#: Where a business publishes its profile.
PROFILE_PATH = "/.well-known/ucp"


class UcpError(RuntimeError):
    """A UCP business answered with an error, or a rule of the protocol was not met."""


@dataclass(frozen=True)
class BusinessProfile:
    """What a business publishes at ``/.well-known/ucp``, as this client uses it."""

    domain: str
    version: str
    endpoint: str
    capabilities: tuple[str, ...]
    payment_handlers: tuple[str, ...]
    document: Mapping[str, Any]


@runtime_checkable
class PaymentInstruments(Protocol):
    """Gives the payment instrument for an approved proposal (``ucp.paymentInstruments``).

    The host's: a token from custody, never one a model saw.
    """

    async def instrument(
        self, proposal: CheckoutProposal, handlers: Mapping[str, Any]
    ) -> Mapping[str, Any]: ...


def _total(checkout: Mapping[str, Any]) -> int:
    for total in checkout.get("totals", []):
        if total.get("type") == "total":
            return int(total["amount"])
    raise UcpError("the checkout says no total")


def revision_of(checkout: Mapping[str, Any]) -> str:
    """The revision of what a checkout buys."""
    what = {
        "id": checkout["id"],
        "currency": checkout["currency"],
        "line_items": [
            {
                "item": line["item"].get("id"),
                "price": line["item"].get("price"),
                "quantity": line["quantity"],
            }
            for line in checkout.get("line_items", [])
        ],
        "totals": [
            {"type": total["type"], "amount": total["amount"]}
            for total in checkout.get("totals", [])
        ],
    }
    return digest(what)


def _checkout(body: Mapping[str, Any]) -> dict[str, Any]:
    """A checkout as ``ucp-sdk`` reads it; an error envelope raises."""
    from ucp_sdk.models.schemas.shopping.checkout import Checkout

    if body.get("ucp", {}).get("status") == "error":
        messages = "; ".join(m.get("content", "") for m in body.get("messages", []))
        raise UcpError(f"the business refused: {messages}")
    Checkout.model_validate(body)
    return dict(body)


def _order(body: Mapping[str, Any]) -> dict[str, Any]:
    """An order as ``ucp-sdk`` reads it; an error envelope raises."""
    from ucp_sdk.models.schemas.shopping.order import Order

    if body.get("ucp", {}).get("status") == "error":
        messages = "; ".join(m.get("content", "") for m in body.get("messages", []))
        raise UcpError(f"the business refused: {messages}")
    Order.model_validate(body)
    return dict(body)


@dataclass
class UcpClient:
    """A platform's client of one business."""

    business: str
    #: The agent's own UCP profile URL (``UCP-Agent``).
    agent_profile: str
    http: httpx.AsyncClient = field(
        default_factory=lambda: httpx.AsyncClient(timeout=15.0)
    )
    #: How its public metadata is read: the PAP SDK's single egress path
    #: (AGENT_PROTOCOLS PI-13), or ``egress.client_fetch`` for a local test one.
    metadata: Fetch = field(
        default_factory=lambda: metadata_fetch(
            accept="application/json", max_bytes=MAX_METADATA_BYTES
        )
    )
    profile: Optional[BusinessProfile] = None

    def _headers(self, idempotency_key: Optional[str] = None) -> dict[str, str]:
        headers = {
            "UCP-Agent": f'profile="{self.agent_profile}"',
            "Request-Id": str(uuid.uuid4()),
            "Content-Type": "application/json",
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return headers

    async def discover(self) -> BusinessProfile:
        """Read and check the business's profile: version, shopping over REST, checkout."""
        from ucp_sdk.models.schemas.profile import BusinessSchema

        status, _, body = await self.metadata(
            f"{self.business.rstrip('/')}{PROFILE_PATH}"
        )
        if status != 200:
            raise UcpError(f"{PROFILE_PATH} answered {status}")
        document = json.loads(body)
        BusinessSchema.model_validate(document)
        ucp = document["ucp"]
        supported = {ucp["version"], *ucp.get("supported_versions", {}).keys()}
        if UCP_VERSION not in supported:
            raise UcpError(
                f"the business speaks UCP {sorted(supported)}, not {UCP_VERSION}"
            )
        rest = [
            service
            for service in ucp.get("services", {}).get(SHOPPING_SERVICE, [])
            if service.get("transport") == "rest" and service.get("endpoint")
        ]
        if not rest:
            raise UcpError("the business offers no shopping service over REST")
        capabilities = tuple(sorted(ucp.get("capabilities", {})))
        if CHECKOUT_CAPABILITY not in capabilities:
            raise UcpError("the business offers no checkout")
        self.profile = BusinessProfile(
            domain=urlsplit(self.business).hostname or self.business,
            version=ucp["version"],
            endpoint=rest[0]["endpoint"].rstrip("/"),
            capabilities=capabilities,
            payment_handlers=tuple(sorted(ucp.get("payment_handlers", {}))),
            document=document,
        )
        return self.profile

    async def _profile(self) -> BusinessProfile:
        return self.profile or await self.discover()

    async def _call(
        self,
        method: str,
        path: str,
        body: Any = None,
        idempotency_key: Optional[str] = None,
    ) -> dict[str, Any]:
        profile = await self._profile()
        answer = await self.http.request(
            method,
            f"{profile.endpoint}{path}",
            headers=self._headers(idempotency_key),
            content=None if body is None else json.dumps(body),
        )
        if answer.status_code == 409:
            raise UcpError("the idempotency key was reused with another request")
        if answer.status_code >= 400:
            raise UcpError(f"{method} {path} answered {answer.status_code}")
        return answer.json()

    async def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Search the products matching a query (``read``)."""
        body = await self._call(
            "POST", "/catalog/search", {"query": query, "pagination": {"limit": limit}}
        )
        return list(body.get("products", []))

    async def create_checkout(
        self,
        line_items: list[Mapping[str, Any]],
        buyer: Optional[Mapping[str, Any]] = None,
    ) -> dict[str, Any]:
        """Start a checkout (``write``: a session the business can cancel)."""
        request: dict[str, Any] = {
            "line_items": [
                {"item": {"id": line["id"]}, "quantity": int(line.get("quantity", 1))}
                for line in line_items
            ]
        }
        if buyer:
            request["buyer"] = dict(buyer)
        return _checkout(
            await self._call("POST", "/checkout-sessions", request, str(uuid.uuid4()))
        )

    async def update_checkout(
        self, checkout_id: str, update: Mapping[str, Any]
    ) -> dict[str, Any]:
        return _checkout(
            await self._call(
                "PUT",
                f"/checkout-sessions/{checkout_id}",
                dict(update),
                str(uuid.uuid4()),
            )
        )

    async def get_checkout(self, checkout_id: str) -> dict[str, Any]:
        return _checkout(await self._call("GET", f"/checkout-sessions/{checkout_id}"))

    async def cancel_checkout(self, checkout_id: str) -> dict[str, Any]:
        return _checkout(
            await self._call(
                "POST",
                f"/checkout-sessions/{checkout_id}/cancel",
                {},
                str(uuid.uuid4()),
            )
        )

    async def get_order(self, order_id: str) -> dict[str, Any]:
        """After the sale: an order the business placed, its lines and how far each is fulfilled (``read``)."""
        return _order(await self._call("GET", f"/orders/{order_id}"))

    async def propose_completion(self, checkout_id: str) -> CheckoutProposal:
        """The exact purchase a ``ready_for_complete`` checkout would make (``read``)."""
        checkout = await self.get_checkout(checkout_id)
        if checkout["status"] != "ready_for_complete":
            raise UcpError(
                f"the checkout is {checkout['status']}, not ready_for_complete"
            )
        profile = await self._profile()
        return CheckoutProposal(
            id=str(uuid.uuid4()),
            merchant=profile.domain,
            checkout_id=checkout["id"],
            revision=revision_of(checkout),
            currency=checkout["currency"],
            total=_total(checkout),
            lines=tuple(
                (
                    line["item"].get("title") or line["item"]["id"],
                    int(line["quantity"]),
                    int(line["item"].get("price", 0)),
                )
                for line in checkout["line_items"]
            ),
            expires_at=checkout.get("expires_at"),
        )

    async def complete(
        self,
        proposal: CheckoutProposal,
        *,
        approver: CheckoutApprover,
        instruments: PaymentInstruments,
        store: ProposalStore,
    ) -> dict[str, Any]:
        """Complete an approved proposal, once (``buy``).

        Refused when the person did not approve, when the proposal was spent
        already, when the checkout changed since it was proposed, or when it
        expired. The proposal's id is the ``Idempotency-Key``, so a retry
        after a lost answer is the same request.
        """
        if proposal.expires_at and datetime.fromisoformat(
            proposal.expires_at.replace("Z", "+00:00")
        ) <= datetime.now(timezone.utc):
            raise UcpError("the proposal has expired")
        # Spent before the person is asked: a proposal is put to them once,
        # and a declined one is proposed again, never retried.
        if not await store.take(proposal.id):
            raise UcpError("this proposal was used already")
        if not await approver.approve(proposal):
            raise UcpError("the person did not approve this purchase")
        checkout = await self.get_checkout(proposal.checkout_id)
        if checkout["status"] != "ready_for_complete":
            raise UcpError(
                f"the checkout is {checkout['status']}, not ready_for_complete"
            )
        if revision_of(checkout) != proposal.revision:
            raise UcpError(
                "the checkout changed since it was proposed: propose it again"
            )
        handlers = checkout.get("ucp", {}).get("payment_handlers", {})
        instrument = dict(await instruments.instrument(proposal, handlers))
        completed = _checkout(
            await self._call(
                "POST",
                f"/checkout-sessions/{proposal.checkout_id}/complete",
                {"payment": {"instruments": [instrument]}},
                proposal.id,
            )
        )
        return completed


def checkout_summary(checkout: Mapping[str, Any]) -> dict[str, Any]:
    """What an agent may see of a checkout: no payment credential, no token."""
    summary: dict[str, Any] = {
        "id": checkout["id"],
        "status": checkout["status"],
        "currency": checkout["currency"],
        "lines": [
            {
                "title": line["item"].get("title") or line["item"]["id"],
                "quantity": line["quantity"],
                "price": line["item"].get("price"),
            }
            for line in checkout.get("line_items", [])
        ],
        "totals": {t["type"]: t["amount"] for t in checkout.get("totals", [])},
        "messages": [m.get("content", "") for m in checkout.get("messages") or []],
    }
    if checkout.get("order"):
        summary["order"] = {
            key: checkout["order"][key]
            for key in ("id", "permalink_url")
            if key in checkout["order"]
        }
    if checkout.get("continue_url"):
        summary["continue_url"] = checkout["continue_url"]
    return summary


def order_summary(order: Mapping[str, Any]) -> dict[str, Any]:
    """What an agent may see of an order: its lines, how far each is fulfilled, its totals and link."""
    return {
        "id": order["id"],
        "checkout_id": order["checkout_id"],
        "permalink_url": order["permalink_url"],
        "currency": order["currency"],
        "lines": [
            {
                "title": line["item"].get("title") or line["item"]["id"],
                "quantity": line["quantity"]["total"],
                "fulfilled": line["quantity"]["fulfilled"],
                "status": line["status"],
            }
            for line in order.get("line_items", [])
        ],
        "totals": {t["type"]: t["amount"] for t in order.get("totals", [])},
        "events": [
            event.get("type", "")
            for event in (order.get("fulfillment") or {}).get("events") or []
        ],
        "messages": [m.get("content", "") for m in order.get("messages") or []],
    }


__all__ = [
    "CHECKOUT_CAPABILITY",
    "BusinessProfile",
    "CheckoutApprover",
    "CheckoutProposal",
    "InMemoryProposalStore",
    "PROFILE_PATH",
    "PaymentInstruments",
    "ProposalStore",
    "SHOPPING_SERVICE",
    "UCP_VERSION",
    "UcpClient",
    "UcpError",
    "checkout_summary",
    "order_summary",
    "revision_of",
]
