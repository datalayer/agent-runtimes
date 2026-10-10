# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate PAP signed-out Session start and renewal safely."""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qs

import httpx
from personal_agent_protocol import (
    DPOP_PROOF_PROVIDERS,
    SIGNERS,
    DpopProofRequest,
    SessionClient,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.loop.apps import Application


class RecordingSigner:
    def __init__(self) -> None:
        self.purposes: list[str] = []

    async def sign(self, _: dict[str, object], *, purpose: str) -> SecretStr:
        self.purposes.append(purpose)
        return SecretStr(f"host-only-{purpose}-{len(self.purposes)}")


class RecordingDpopProvider:
    def __init__(self) -> None:
        self.requests: list[DpopProofRequest] = []

    async def create(self, request: DpopProofRequest) -> SecretStr:
        self.requests.append(request)
        return SecretStr(f"host-only-proof-{len(self.requests)}")


class SessionSecurityPlugin:
    def __init__(self, signer: RecordingSigner, dpop: RecordingDpopProvider) -> None:
        self.signer = signer
        self.dpop = dpop

    def provide_contributions(self, contributions: object) -> None:
        contribute = contributions.contribute  # type: ignore[attr-defined]
        contribute(SIGNERS, self.signer, contribution_id="example-signer")
        contribute(DPOP_PROOF_PROVIDERS, self.dpop, contribution_id="example-dpop")


app = Application(
    id="pap-session-lifecycle",
    name="PAP Session Lifecycle",
    description="Start, retry, and renew a signed-out Session without exposing secrets.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_session_lifecycle to explain signed-out Session start and "
        "renewal. Never ask for or expose a subject, session ID, assertion, "
        "proof, nonce, key, or token."
    ),
)


@app.tool(does="read")
async def explain_session_lifecycle() -> dict[str, Any]:
    """Exercise SessionClient and return only lifecycle and safety evidence."""

    calls = 0
    forms: list[dict[str, list[str]]] = []

    def company(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        forms.append(parse_qs(request.content.decode()))
        if calls == 1:
            return httpx.Response(
                400,
                json={"error": "use_dpop_nonce"},
                headers={"DPoP-Nonce": "host-only-company-nonce"},
            )
        return httpx.Response(
            200,
            json={
                "access_token": f"host-only-session-token-{calls}",
                "token_type": "DPoP",
                "expires_in": 300,
                "scope": "poppy:read",
                "session_id": "ses_example",
                "signed_in": False,
            },
        )

    signer = RecordingSigner()
    dpop = RecordingDpopProvider()
    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="pap-session-example-security", version="1"),
            SessionSecurityPlugin(signer, dpop),
        )
        client = SessionClient(reactor=reactor, http_client=http)
        options = {
            "client_id": "https://assistant.example/agent.json",
            "pairwise_user_id": "usr_host_only_example",
            "issuer": "https://company.example",
            "token_endpoint": "https://company.example/oauth/token",
            "tenant_id": "example-tenant",
        }
        started = await client.start(**options)
        renewed = await client.renew(**options, session_id=started.session_id)
        reactor.stop()

    return {
        "start_status": "created",
        "renew_status": "renewed",
        "signed_in": renewed.signed_in,
        "token_type": renewed.token_type,
        "scopes": renewed.scopes,
        "same_session": started.session_id == renewed.session_id,
        "nonce_retry": [request.nonce for request in dpop.requests]
        == [None, "host-only-company-nonce", None],
        "fresh_assertions": len(signer.purposes) == 6,
        "fresh_proofs": len(dpop.requests) == 3,
        "renewal_bound_to_session": "session_id" in forms[-1],
        "session_id_withheld": True,
        "assertions_withheld": True,
        "proofs_withheld": True,
        "tokens_withheld": True,
    }
