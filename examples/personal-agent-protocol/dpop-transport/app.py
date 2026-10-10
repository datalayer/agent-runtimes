# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate proof-bound PAP HTTP transport without model-visible credentials."""

from __future__ import annotations

from typing import Any

import httpx
from personal_agent_protocol import (
    DPOP_PROOF_PROVIDERS,
    DpopHttpClient,
    DpopProofRequest,
    SessionToken,
    TransportError,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application


class RecordingProofProvider:
    def __init__(self) -> None:
        self.requests: list[DpopProofRequest] = []

    async def create(self, request: DpopProofRequest) -> SecretStr:
        self.requests.append(request)
        return SecretStr(f"host-only-proof-{len(self.requests)}")


class TransportPlugin:
    def __init__(self, proofs: RecordingProofProvider) -> None:
        self.proofs = proofs

    def provide_contributions(self, contributions: object) -> None:
        contributions.contribute(  # type: ignore[attr-defined]
            DPOP_PROOF_PROVIDERS, self.proofs, contribution_id="protected-dpop"
        )


app = Application(
    id="pap-dpop-transport",
    name="PAP DPoP Transport",
    description="Send proof-bound PAP requests through nonce retries and redirects safely.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_dpop_transport. Never request or expose a Session Token, "
        "DPoP proof, nonce, pairwise identity, or protected header."
    ),
)


@app.tool(does="read")
async def explain_dpop_transport() -> dict[str, Any]:
    """Exercise nonce retry and redirect proof regeneration."""

    calls = 0

    def company(_: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(
                401,
                headers={
                    "WWW-Authenticate": 'DPoP error="use_dpop_nonce"',
                    "DPoP-Nonce": "host-only-company-nonce",
                },
            )
        if calls == 2:
            return httpx.Response(307, headers={"Location": "/orders/current"})
        return httpx.Response(200, json={"order_count": 2})

    proofs = RecordingProofProvider()
    token = SessionToken(
        access_token=SecretStr("host-only-session-token"),
        token_type="DPoP",
        expires_in=300,
        scope="orders:read",
        session_id="ses_host_only",
        signed_in=True,
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="pap-dpop-transport-example", version="1"),
            TransportPlugin(proofs),
        )
        response = await DpopHttpClient(reactor=reactor, http_client=http).request(
            "GET",
            "https://api.shop.example/orders",
            token=token,
            tenant_id="example-tenant",
            pairwise_user_id="usr_host_only",
            issuer="https://auth.shop.example",
        )
        try:
            await DpopHttpClient(reactor=reactor, http_client=http).request(
                "GET",
                "https://api.shop.example/orders",
                token=token,
                tenant_id="example-tenant",
                pairwise_user_id="usr_host_only",
                issuer="https://auth.shop.example",
                headers={"Authorization": "Bearer model-controlled"},
            )
        except TransportError:
            protected_headers_rejected = True
        else:
            protected_headers_rejected = False
        reactor.stop()

    return {
        "status": response.status_code,
        "fresh_proof_per_attempt": len(proofs.requests) == 3,
        "nonce_retry": [request.nonce for request in proofs.requests]
        == [None, "host-only-company-nonce", None],
        "redirect_rebound_to_target": proofs.requests[-1].url.endswith(
            "/orders/current"
        ),
        "protected_headers_rejected": protected_headers_rejected,
        "cross_origin_forwarding": False,
        "tokens_withheld": True,
        "proofs_and_nonce_withheld": True,
    }
