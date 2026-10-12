# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A local UCP test merchant, *Example Store* (AGENT_PROTOCOLS PR-32, EX-04).

A Starlette application of the REST binding of UCP ``2026-08-25``, shaped
after the specification's own examples: its profile at ``/.well-known/ucp``,
``/catalog/search``, and the checkout lifecycle (``incomplete`` until the
buyer's email is given, then ``ready_for_complete``; ``completed`` with an
order; ``canceled``). It checks what a business checks of a platform:
``UCP-Agent`` as a Dictionary with ``profile``, ``Request-Id``, an
``Idempotency-Key`` on every change (the same key and body answer the first
result, another body ``409``). Every answer it gives is validated by
``ucp-sdk``'s models before it is sent. For tests and examples only.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import http_sfv
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from .client import CHECKOUT_CAPABILITY, SHOPPING_SERVICE, UCP_VERSION

#: Its payment handler: a test token, ``tok_test_…``, is accepted.
TEST_HANDLER = "com.example.test_pay"
TEST_HANDLER_ID = "test_pay_1"

CATALOG = {
    "tea_sencha": {"title": "Sencha green tea, 100 g", "price": 1250},
    "tea_assam": {"title": "Assam black tea, 250 g", "price": 1800},
    "mug": {"title": "Stoneware mug", "price": 2400},
}


def _meta(**extra: Any) -> dict[str, Any]:
    return {
        "version": UCP_VERSION,
        "capabilities": {CHECKOUT_CAPABILITY: [{"version": UCP_VERSION}]},
        "payment_handlers": {
            TEST_HANDLER: [
                {
                    "id": TEST_HANDLER_ID,
                    "version": UCP_VERSION,
                    "available_instruments": [{"type": "card"}],
                    "config": {},
                }
            ]
        },
        **extra,
    }


def profile(base: str) -> dict[str, Any]:
    """The store's business profile."""
    spec = f"https://ucp.dev/{UCP_VERSION}"
    return {
        "ucp": {
            "version": UCP_VERSION,
            "services": {
                SHOPPING_SERVICE: [
                    {
                        "version": UCP_VERSION,
                        "spec": f"{spec}/specification/overview",
                        "transport": "rest",
                        "schema": f"{spec}/services/shopping/rest.openapi.json",
                        "endpoint": f"{base}/ucp/v1",
                    }
                ]
            },
            "capabilities": {
                CHECKOUT_CAPABILITY: [
                    {
                        "version": UCP_VERSION,
                        "spec": f"{spec}/specification/shopping/checkout",
                        "schema": f"{spec}/schemas/shopping/checkout.json",
                    }
                ]
            },
            "payment_handlers": _meta()["payment_handlers"],
        }
    }


def _refuse(status: int, code: str, content: str) -> JSONResponse:
    return JSONResponse(
        {
            "ucp": {"version": UCP_VERSION, "status": "error"},
            "messages": [
                {
                    "type": "error",
                    "code": code,
                    "content": content,
                    "severity": "unrecoverable",
                }
            ],
        },
        status_code=status,
    )


class ExampleStore:
    """The store's state and its routes."""

    def __init__(self, base: str = "https://store.example") -> None:
        self.base = base
        self.checkouts: dict[str, dict[str, Any]] = {}
        self.orders: list[dict[str, Any]] = []
        self._replies: dict[str, tuple[str, int, dict[str, Any]]] = {}

    def _check_agent(self, request: Request) -> JSONResponse | None:
        header = request.headers.get("ucp-agent")
        if not header:
            return _refuse(400, "missing_ucp_agent", "UCP-Agent is required")
        dictionary = http_sfv.Dictionary()
        try:
            dictionary.parse(header.encode())
        except ValueError:
            return _refuse(400, "invalid_ucp_agent", "UCP-Agent is a Dictionary")
        if "profile" not in dictionary or not str(
            dictionary["profile"].value
        ).startswith("https://"):
            return _refuse(
                400, "invalid_ucp_agent", "UCP-Agent names its profile over https"
            )
        if not request.headers.get("request-id"):
            return _refuse(400, "missing_request_id", "Request-Id is required")
        return None

    async def _idempotent(self, request: Request, handler: Any) -> JSONResponse:
        refused = self._check_agent(request)
        if refused:
            return refused
        key = request.headers.get("idempotency-key")
        if not key:
            return _refuse(
                400, "missing_idempotency_key", "Idempotency-Key is required"
            )
        body = await request.body()
        fingerprint = hashlib.sha256(request.url.path.encode() + body).hexdigest()
        if key in self._replies:
            seen, status, reply = self._replies[key]
            if seen != fingerprint:
                return _refuse(
                    409, "idempotency_conflict", "the key was used for another request"
                )
            return JSONResponse(reply, status_code=status)
        status, reply = handler(json.loads(body or b"{}"), request)
        self._replies[key] = (fingerprint, status, reply)
        return JSONResponse(reply, status_code=status)

    def _render(self, checkout: dict[str, Any]) -> dict[str, Any]:
        from ucp_sdk.models.schemas.shopping.checkout import Checkout

        lines = []
        subtotal = 0
        for index, line in enumerate(checkout["lines"]):
            product = CATALOG[line["id"]]
            amount = product["price"] * line["quantity"]
            subtotal += amount
            lines.append(
                {
                    "id": f"li_{index + 1}",
                    "item": {
                        "id": line["id"],
                        "title": product["title"],
                        "price": product["price"],
                    },
                    "quantity": line["quantity"],
                    "totals": [
                        {"type": "subtotal", "amount": amount},
                        {"type": "total", "amount": amount},
                    ],
                }
            )
        tax = round(subtotal * 0.08)
        messages = []
        status = checkout["status"]
        if status in ("incomplete", "ready_for_complete"):
            if not checkout.get("buyer", {}).get("email"):
                status = "incomplete"
                messages.append(
                    {
                        "type": "error",
                        "code": "missing",
                        "path": "$.buyer.email",
                        "content": "Buyer email is required",
                        "severity": "recoverable",
                    }
                )
            else:
                status = "ready_for_complete"
            checkout["status"] = status
        rendered: dict[str, Any] = {
            "ucp": _meta(status="success"),
            "id": checkout["id"],
            "status": status,
            "currency": "USD",
            "line_items": lines,
            "totals": [
                {"type": "subtotal", "amount": subtotal},
                {"type": "tax", "amount": tax},
                {"type": "total", "amount": subtotal + tax},
            ],
            "links": [{"type": "terms_of_service", "url": f"{self.base}/terms"}],
            "expires_at": checkout["expires_at"],
        }
        if messages:
            rendered["messages"] = messages
        if checkout.get("buyer"):
            rendered["buyer"] = checkout["buyer"]
        if checkout.get("order"):
            rendered["order"] = checkout["order"]
        Checkout.model_validate(rendered)
        return rendered

    def _create(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        lines = []
        for line in body.get("line_items", []):
            item = line.get("item", {}).get("id")
            if item not in CATALOG:
                return 200, {
                    "ucp": {"version": UCP_VERSION, "status": "error"},
                    "messages": [
                        {
                            "type": "error",
                            "code": "not_found",
                            "content": f"No product {item}",
                            "severity": "unrecoverable",
                        }
                    ],
                }
            lines.append({"id": item, "quantity": int(line.get("quantity", 1))})
        checkout = {
            "id": f"chk_{uuid.uuid4().hex[:12]}",
            "status": "incomplete",
            "lines": lines,
            "buyer": body.get("buyer") or {},
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        }
        self.checkouts[checkout["id"]] = checkout
        return 201, self._render(checkout)

    def _update(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        checkout = self.checkouts[request.path_params["id"]]
        if checkout["status"] not in ("incomplete", "ready_for_complete"):
            return 409, self._render(checkout)
        if "buyer" in body:
            checkout["buyer"] = body["buyer"]
        if "line_items" in body:
            checkout["lines"] = [
                {"id": line["item"]["id"], "quantity": int(line.get("quantity", 1))}
                for line in body["line_items"]
            ]
        return 200, self._render(checkout)

    def _complete(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        checkout = self.checkouts[request.path_params["id"]]
        if checkout["status"] != "ready_for_complete":
            return 200, self._render(checkout)
        [instrument] = body.get("payment", {}).get("instruments", [{}])
        token = instrument.get("credential", {}).get("token", "")
        if instrument.get("handler_id") != TEST_HANDLER_ID or not token.startswith(
            "tok_test_"
        ):
            return 402, {
                "ucp": {"version": UCP_VERSION, "status": "error"},
                "messages": [
                    {
                        "type": "error",
                        "code": "payment_declined",
                        "content": "The payment was declined",
                        "severity": "recoverable",
                    }
                ],
            }
        order = {
            "id": f"ord_{uuid.uuid4().hex[:10]}",
            "permalink_url": f"{self.base}/orders/{checkout['id']}",
        }
        checkout["status"] = "completed"
        checkout["order"] = order
        self.orders.append({"order": order["id"], "checkout": checkout["id"]})
        return 200, self._render(checkout)

    def _cancel(
        self, body: dict[str, Any], request: Request
    ) -> tuple[int, dict[str, Any]]:
        checkout = self.checkouts[request.path_params["id"]]
        if checkout["status"] != "completed":
            checkout["status"] = "canceled"
        return 200, self._render(checkout)

    def app(self) -> Starlette:
        async def well_known(request: Request) -> JSONResponse:
            return JSONResponse(profile(self.base))

        async def search(request: Request) -> JSONResponse:
            from ucp_sdk.models.schemas.shopping.catalog_search import SearchResponse

            refused = self._check_agent(request)
            if refused:
                return refused
            query = str((await request.json()).get("query") or "").lower()
            products = [
                {
                    "id": product_id,
                    "title": product["title"],
                    "description": {"plain": product["title"]},
                    "price_range": {
                        "min": {"amount": product["price"], "currency": "USD"},
                        "max": {"amount": product["price"], "currency": "USD"},
                    },
                    "variants": [
                        {
                            "id": product_id,
                            "title": product["title"],
                            "description": {"plain": product["title"]},
                            "price": {"amount": product["price"], "currency": "USD"},
                        }
                    ],
                }
                for product_id, product in CATALOG.items()
                if all(word in product["title"].lower() for word in query.split())
            ]
            reply = {
                "ucp": {"version": UCP_VERSION, "status": "success"},
                "products": products,
            }
            SearchResponse.model_validate(reply)
            return JSONResponse(reply)

        async def get(request: Request) -> JSONResponse:
            refused = self._check_agent(request)
            if refused:
                return refused
            checkout = self.checkouts.get(request.path_params["id"])
            if checkout is None:
                return _refuse(404, "not_found", "No such checkout")
            return JSONResponse(self._render(checkout))

        async def create(request: Request) -> JSONResponse:
            return await self._idempotent(request, self._create)

        async def update(request: Request) -> JSONResponse:
            return await self._idempotent(request, self._update)

        async def complete(request: Request) -> JSONResponse:
            return await self._idempotent(request, self._complete)

        async def cancel(request: Request) -> JSONResponse:
            return await self._idempotent(request, self._cancel)

        prefix = "/ucp/v1"
        return Starlette(
            routes=[
                Route("/.well-known/ucp", well_known),
                Route(f"{prefix}/catalog/search", search, methods=["POST"]),
                Route(f"{prefix}/checkout-sessions", create, methods=["POST"]),
                Route(f"{prefix}/checkout-sessions/{{id}}", get, methods=["GET"]),
                Route(f"{prefix}/checkout-sessions/{{id}}", update, methods=["PUT"]),
                Route(
                    f"{prefix}/checkout-sessions/{{id}}/complete",
                    complete,
                    methods=["POST"],
                ),
                Route(
                    f"{prefix}/checkout-sessions/{{id}}/cancel",
                    cancel,
                    methods=["POST"],
                ),
            ]
        )


__all__ = ["CATALOG", "ExampleStore", "TEST_HANDLER", "TEST_HANDLER_ID", "profile"]
