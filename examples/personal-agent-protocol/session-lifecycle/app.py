# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that demonstrates PAP Session start and restart."""

from __future__ import annotations

from typing import Any

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from personal_agent_protocol import (
    SESSION_SIGNERS,
    DelegatedSessionSigner,
    InMemoryDelegatedKeys,
    JoseSigner,
    SessionClient,
    SessionHttpClient,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.apps import Application

ORDERS = "https://company.example/orders"


class RecordingSigner:
    """A key from the agent's `jwks_uri`, recording only what it signed for."""

    def __init__(self) -> None:
        self.key = JoseSigner(
            ec.generate_private_key(ec.SECP256R1()), key_id="agent-key"
        )
        self.purposes: list[str] = []

    async def sign(self, claims: dict[str, object], *, purpose: str) -> SecretStr:
        self.purposes.append(purpose)
        return await self.key.sign(claims, purpose=purpose)


class SessionSecurityPlugin:
    """Contribute the host-owned Session signer through Reactor.

    A delegated key per User ID signs each request's Session JWT. The private keys
    stay in the host's key custody.
    """

    def __init__(self, signer: RecordingSigner) -> None:
        self.session_signer = DelegatedSessionSigner(
            InMemoryDelegatedKeys(), signer=signer
        )

    def provide_contributions(self, contributions: object) -> None:
        contribute = contributions.contribute  # type: ignore[attr-defined]
        contribute(
            SESSION_SIGNERS,
            self.session_signer,
            contribution_id="example-session-signer",
        )


app = Application(
    id="pap-session-lifecycle",
    name="PAP Session Lifecycle",
    description="Start, retry, and renew a signed-out Session without exposing secrets.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_session_lifecycle to explain signed-out PAP Session start "
        "and restart. Never ask for or expose a subject, Session ID, Session JWT, "
        "delegation, key, or token."
    ),
)


@app.tool(does="read")
async def explain_session_lifecycle() -> dict[str, Any]:
    """Exercise SessionClient and return only lifecycle and safety evidence."""

    calls = 0
    jwts: list[dict[str, Any]] = []
    kids: list[str] = []
    authorization: list[str | None] = []

    def company(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        session_jwt = request.headers["poppy-session"]
        jwts.append(jwt.decode(session_jwt, options={"verify_signature": False}))
        kids.append(jwt.get_unverified_header(session_jwt)["kid"])
        authorization.append(request.headers.get("authorization"))
        if calls in (2, 4, 5):
            # The company no longer knows this Session, or refuses it (§5.3).
            return httpx.Response(400, json={"error": "invalid_session"})
        return httpx.Response(200, json={"orders": []})

    signer = RecordingSigner()
    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="pap-session-example-security", version="1"),
            SessionSecurityPlugin(signer),
        )
        # Starting a Session asks the company nothing: it is local, and signed out.
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id="https://assistant.example/agent.json",
            pairwise_user_id="usr_host_only_example",
            issuer="https://company.example",
            tenant_id="example-tenant",
        )
        requests_to_start = calls
        started = session.sid
        transport = SessionHttpClient(reactor=reactor, http_client=http)
        first = await transport.request("GET", ORDERS, session=session)
        # `invalid_session` starts a new Session once, and the request is sent again in it.
        restarted = await transport.request("GET", ORDERS, session=session)
        after_restart = session.sid
        # A second `invalid_session` in a row is the caller's to handle: the client stops.
        refused = await transport.request("GET", ORDERS, session=session)
        reactor.stop()

    return {
        "start_status": "created",
        "requests_to_start_a_session": requests_to_start,
        "signed_in": any(authorization),
        "first_request_status": first.status_code,
        "same_session_until_refused": jwts[0]["sid"] == jwts[1]["sid"] == started,
        "fresh_session_jwt_per_request": len({claims["jti"] for claims in jwts})
        == len(jwts),
        "restarted_after_invalid_session": after_restart != started,
        "request_resent_in_the_new_session": jwts[2]["sid"] == after_restart,
        "resent_request_status": restarted.status_code,
        "same_user_after_restart": len({claims["sub"] for claims in jwts}) == 1,
        "second_refusal_returned_to_the_caller": refused.status_code,
        "one_delegated_key_for_the_user": len(set(kids)) == 1,
        "delegated_key_signed_by_the_agent": signer.purposes == ["delegation"],
        "session_id_withheld": True,
        "session_jwts_withheld": True,
        "delegation_withheld": True,
        "keys_withheld": True,
    }
