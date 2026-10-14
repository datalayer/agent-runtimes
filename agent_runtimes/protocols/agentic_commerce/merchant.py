# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A local Agentic Commerce test seller, *Example Outfitters* (AGENT_PROTOCOLS PR-43, EX-05).

The REST binding of the Agentic Commerce Protocol ``2026-04-17``: its
discovery document at ``/.well-known/acp.json``, and checkout sessions —
``not_ready_for_payment`` until the buyer's email is given, then
``ready_for_payment``; ``completed`` with an order once paid with a delegated
token (``spt_test_…``); ``canceled``. It holds an agent to the headers the
specification requires (``Authorization: Bearer``, ``API-Version``, an
``Idempotency-Key`` on every POST: the same key and body answer the first
result, another body ``409``), and offers the discount extension to an agent
that declares it. Every answer is validated by the generated models before
it is sent. For tests and examples only.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .client import AGENTIC_COMMERCE_VERSION

#: The bearer an agent is given by this seller (a test credential).
TEST_BEARER = "acp_test_agent_key"
HANDLER_ID = "test_spt_handler"

CATALOG = {
    "jacket": {"name": "Rain jacket", "unit_amount": 12900},
    "socks": {"name": "Wool socks", "unit_amount": 1500},
}


def discovery(base: str) -> dict[str, Any]:
    return {
        "protocol": {
            "name": "acp",
            "version": AGENTIC_COMMERCE_VERSION,
            "supported_versions": [AGENTIC_COMMERCE_VERSION],
        },
        "api_base_url": f"{base}/acp",
        "transports": ["rest"],
        "capabilities": {
            "services": ["checkout"],
            "extensions": [{"name": "discount"}],
            "supported_currencies": ["usd"],
        },
    }


def _counted(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Items as the schema sends them, one per unit, counted into lines."""
    counts: dict[str, int] = {}
    for item in items:
        counts[item["id"]] = counts.get(item["id"], 0) + 1
    return [
        {"id": item_id, "quantity": quantity} for item_id, quantity in counts.items()
    ]


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        {"type": "invalid_request", "code": code, "message": message},
        status_code=status,
    )


class ExampleOutfitters:
    """The seller's state and its routes."""

    def __init__(self, base: str = "https://outfitters.example") -> None:
        self.base = base
        self.sessions: dict[str, dict[str, Any]] = {}
        self.orders: list[str] = []
        self._replies: dict[str, tuple[str, int, dict[str, Any]]] = {}

    def _check(self, request: Request) -> JSONResponse | None:
        if request.headers.get("authorization") != f"Bearer {TEST_BEARER}":
            return _error(
                401, "unauthorized", "a bearer this seller issued is required"
            )
        if request.headers.get("api-version") != AGENTIC_COMMERCE_VERSION:
            return _error(
                400,
                "unsupported_version",
                f"API-Version {AGENTIC_COMMERCE_VERSION} is spoken here",
            )
        return None

    def _render(self, session: dict[str, Any]) -> dict[str, Any]:
        from .models import CheckoutSessionBase, CheckoutSessionWithOrder

        lines, subtotal = [], 0
        for index, line in enumerate(session["lines"]):
            product = CATALOG[line["id"]]
            amount = product["unit_amount"] * line["quantity"]
            subtotal += amount
            lines.append(
                {
                    "id": f"li_{index + 1}",
                    "item": {
                        "id": line["id"],
                        "name": product["name"],
                        "unit_amount": product["unit_amount"],
                    },
                    "quantity": line["quantity"],
                    "name": product["name"],
                    "totals": [
                        {
                            "type": "subtotal",
                            "display_text": "Subtotal",
                            "amount": amount,
                        },
                        {"type": "total", "display_text": "Total", "amount": amount},
                    ],
                }
            )
        discount = (
            round(subtotal * 0.1) if "WELCOME10" in session.get("codes", []) else 0
        )
        tax = round((subtotal - discount) * 0.08)
        messages = []
        if session["status"] in ("not_ready_for_payment", "ready_for_payment"):
            if session.get("buyer", {}).get("email"):
                session["status"] = "ready_for_payment"
            else:
                session["status"] = "not_ready_for_payment"
                messages.append(
                    {
                        "type": "error",
                        "code": "missing",
                        "param": "$.buyer.email",
                        "content_type": "plain",
                        "content": "Buyer email is required",
                    }
                )
        totals = [{"type": "subtotal", "display_text": "Subtotal", "amount": subtotal}]
        if discount:
            totals.append(
                {"type": "discount", "display_text": "WELCOME10", "amount": discount}
            )
        totals += [
            {"type": "tax", "display_text": "Tax", "amount": tax},
            {
                "type": "total",
                "display_text": "Total",
                "amount": subtotal - discount + tax,
            },
        ]
        rendered: dict[str, Any] = {
            "id": session["id"],
            "capabilities": {
                "payment": {
                    "handlers": [
                        {
                            "id": HANDLER_ID,
                            "name": "dev.acp.tokenized.card",
                            "version": AGENTIC_COMMERCE_VERSION,
                            "spec": "https://acp.dev/handlers/tokenized.card",
                            "requires_delegate_payment": True,
                            "requires_pci_compliance": False,
                            "psp": "test",
                            "config_schema": "https://acp.dev/schemas/tokenized.card/config.json",
                            "instrument_schemas": [
                                "https://acp.dev/schemas/tokenized.card/instrument.json"
                            ],
                            "config": {},
                        }
                    ]
                },
                **(
                    {"extensions": [{"name": "discount"}]}
                    if "discount" in session["extensions"]
                    else {}
                ),
            },
            "status": session["status"],
            "currency": "usd",
            "line_items": lines,
            "fulfillment_options": [],
            "totals": totals,
            "messages": messages,
            "links": [{"type": "terms_of_use", "url": f"{self.base}/terms"}],
            "expires_at": session["expires_at"],
        }
        if session.get("buyer"):
            rendered["buyer"] = session["buyer"]
        if session.get("order"):
            rendered["order"] = session["order"]
            CheckoutSessionWithOrder.model_validate(rendered)
        else:
            CheckoutSessionBase.model_validate(rendered)
        return rendered

    async def _post(self, request: Request, handler: Any) -> JSONResponse:
        refused = self._check(request)
        if refused:
            return refused
        key = request.headers.get("idempotency-key")
        if not key:
            return _error(
                400,
                "idempotency_key_required",
                "Idempotency-Key is required on every POST",
            )
        body = await request.body()
        fingerprint = hashlib.sha256(request.url.path.encode() + body).hexdigest()
        if key in self._replies:
            seen, status, reply = self._replies[key]
            if seen != fingerprint:
                return _error(
                    409, "idempotency_conflict", "the key was used for another request"
                )
            return JSONResponse(reply, status_code=status)
        status, reply = handler(json.loads(body or b"{}"), request)
        self._replies[key] = (fingerprint, status, reply)
        return JSONResponse(reply, status_code=status)

    def _create(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        from .models import CheckoutSessionCreateRequest

        CheckoutSessionCreateRequest.model_validate(body)
        for line in body["line_items"]:
            if line["id"] not in CATALOG:
                return 400, {
                    "type": "invalid_request",
                    "code": "not_found",
                    "message": f"No product {line['id']}",
                }
        declared = set((body.get("capabilities") or {}).get("extensions") or [])
        session: dict[str, Any] = {
            "id": f"cs_{uuid.uuid4().hex[:12]}",
            "status": "not_ready_for_payment",
            "lines": _counted(body["line_items"]),
            "buyer": body.get("buyer") or {},
            "extensions": declared & {"discount"},
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        }
        self.sessions[session["id"]] = session
        return 201, self._render(session)

    def _update(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        session = self.sessions[request.path_params["id"]]
        if "buyer" in body:
            session["buyer"] = body["buyer"]
        if "line_items" in body:
            session["lines"] = _counted(body["line_items"])
        if "discount" in session["extensions"] and body.get("discounts", {}).get(
            "codes"
        ):
            session["codes"] = list(body["discounts"]["codes"])
        return 200, self._render(session)

    def _complete(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        from .models import CheckoutSessionCompleteRequest

        CheckoutSessionCompleteRequest.model_validate(body)
        session = self.sessions[request.path_params["id"]]
        if session["status"] != "ready_for_payment":
            return 400, {
                "type": "invalid_request",
                "code": "not_ready",
                "message": "the session is not ready for payment",
            }
        data = body["payment_data"]
        token = data.get("instrument", {}).get("credential", {}).get("token", "")
        if data.get("handler_id") != HANDLER_ID or not token.startswith("spt_test_"):
            return 402, {
                "type": "payment_declined",
                "code": "declined",
                "message": "the payment was declined",
            }
        session["status"] = "completed"
        session["order"] = {
            "id": f"ord_{uuid.uuid4().hex[:10]}",
            "checkout_session_id": session["id"],
            "permalink_url": f"{self.base}/orders/{session['id']}",
        }
        self.orders.append(session["order"]["id"])
        return 200, self._render(session)

    def _cancel(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        session = self.sessions[request.path_params["id"]]
        if session["status"] != "completed":
            session["status"] = "canceled"
        return 200, self._render(session)

    def app(self) -> Starlette:
        async def well_known(request: Request) -> JSONResponse:
            return JSONResponse(discovery(self.base))

        async def get(request: Request) -> JSONResponse:
            refused = self._check(request)
            if refused:
                return refused
            session = self.sessions.get(request.path_params["id"])
            if session is None:
                return _error(404, "not_found", "No such session")
            return JSONResponse(self._render(session))

        async def create(request: Request) -> JSONResponse:
            return await self._post(request, self._create)

        async def update(request: Request) -> JSONResponse:
            return await self._post(request, self._update)

        async def complete(request: Request) -> JSONResponse:
            return await self._post(request, self._complete)

        async def cancel(request: Request) -> JSONResponse:
            return await self._post(request, self._cancel)

        return Starlette(
            routes=[
                Route("/.well-known/acp.json", well_known),
                Route("/acp/checkout_sessions", create, methods=["POST"]),
                Route("/acp/checkout_sessions/{id}", get, methods=["GET"]),
                Route("/acp/checkout_sessions/{id}", update, methods=["POST"]),
                Route(
                    "/acp/checkout_sessions/{id}/complete", complete, methods=["POST"]
                ),
                Route("/acp/checkout_sessions/{id}/cancel", cancel, methods=["POST"]),
            ]
        )


__all__ = ["CATALOG", "ExampleOutfitters", "HANDLER_ID", "TEST_BEARER", "discovery"]
