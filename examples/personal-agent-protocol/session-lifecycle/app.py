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
    InMemorySessionKeys,
    JoseDpopProofProvider,
    SessionClient,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.apps import Application


class RecordingSigner:
    def __init__(self) -> None:
        self.purposes: list[str] = []

    async def sign(self, _: dict[str, object], *, purpose: str) -> SecretStr:
        self.purposes.append(purpose)
        return SecretStr(f"host-only-{purpose}-{len(self.purposes)}")


class RecordingDpopProvider:
    """Real Session Keys and proofs, recording which key each proof used.

    Each Session gets its own key; its JWK thumbprint, the Session Key, names the
    Session. The private halves stay in the host's key custody.
    """

    def __init__(self) -> None:
        self.proofs = JoseDpopProofProvider(InMemorySessionKeys())
        self.requests: list[DpopProofRequest] = []

    async def new_session_key(self, *, tenant_id: str, issuer: str) -> str:
        return await self.proofs.new_session_key(tenant_id=tenant_id, issuer=issuer)

    async def discard_session_key(
        self, *, tenant_id: str, issuer: str, session_key: str
    ) -> None:
        await self.proofs.discard_session_key(
            tenant_id=tenant_id, issuer=issuer, session_key=session_key
        )

    async def create(self, request: DpopProofRequest) -> SecretStr:
        self.requests.append(request)
        return await self.proofs.create(request)


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
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_session_lifecycle to explain signed-out Session start and "
        "renewal. Never ask for or expose a subject, Session Key, assertion, "
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
        # No Session ID, no `signed_in`, no `scope`: the proof's key names the
        # Session, the grant (JWT bearer) makes it signed out, and a signed-out
        # Session has no scopes.
        return httpx.Response(
            200,
            json={
                "access_token": f"host-only-session-token-{calls}",
                "token_type": "DPoP",
                "expires_in": 300,
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
        # Starting a Session makes a new Session Key; renewing proves the same key.
        started = await client.start(**options)
        renewed = await client.renew(**options, session_key=started.session_key)
        reactor.stop()

    return {
        "start_status": "created",
        "renew_status": "renewed",
        "signed_in": renewed.signed_in,
        "token_type": renewed.token_type,
        "scopes": renewed.scopes,
        "same_session": started.session_key == renewed.session_key,
        "renewal_proved_with_the_session_key": (
            dpop.requests[-1].session_key == started.session_key
        ),
        "no_session_id_on_the_wire": all("session_id" not in form for form in forms),
        "nonce_retry": [request.nonce for request in dpop.requests]
        == [None, "host-only-company-nonce", None],
        "fresh_assertions": len(signer.purposes) == 6,
        "fresh_proofs": len(dpop.requests) == 3,
        "session_key_withheld": True,
        "assertions_withheld": True,
        "proofs_withheld": True,
        "tokens_withheld": True,
    }
