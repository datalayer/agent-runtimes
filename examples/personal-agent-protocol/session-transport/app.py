# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that demonstrates the Session header on PAP HTTP requests."""

from __future__ import annotations

from typing import Any

import httpx
from personal_agent_protocol import (
    SESSION_SIGNERS,
    AccessToken,
    SessionClient,
    SessionHttpClient,
    SessionJwtRequest,
    TransportError,
    build_pap_reactor,
)
from pydantic import SecretStr
from reactor import PluginManifest

from agent_runtimes.apps import Application


class RecordingSessionSigner:
    def __init__(self) -> None:
        self.requests: list[SessionJwtRequest] = []

    async def sign(self, request: SessionJwtRequest) -> SecretStr:
        self.requests.append(request)
        return SecretStr(f"host-only-session-jwt-{len(self.requests)}")


class TransportPlugin:
    def __init__(self, session_jwts: RecordingSessionSigner) -> None:
        self.session_jwts = session_jwts

    def provide_contributions(self, contributions: object) -> None:
        contributions.contribute(  # type: ignore[attr-defined]
            SESSION_SIGNERS,
            self.session_jwts,
            contribution_id="protected-session-signer",
        )


app = Application(
    id="pap-session-transport",
    name="PAP Session Transport",
    description="The Session header on every request: fresh JWTs, refused redirects.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_session_transport. Never request or expose an access token, "
        "Session JWT, Session ID, or protected header."
    ),
)


@app.tool(does="read")
async def explain_session_transport() -> dict[str, Any]:
    """Exercise a restart after `invalid_session`, a refused redirect, and protected headers."""

    calls = 0
    sent: list[httpx.Headers] = []

    def company(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        sent.append(request.headers)
        if calls == 1:
            return httpx.Response(400, json={"error": "invalid_session"})
        if calls == 2:
            return httpx.Response(200, json={"order_count": 2})
        # A redirect never gets the token, a Session JWT, or a body (§3): it is refused.
        return httpx.Response(307, headers={"Location": "/orders/current"})

    session_jwts = RecordingSessionSigner()
    token = AccessToken(
        access_token=SecretStr("host-only-access-token"), scope="orders:read"
    )
    async with httpx.AsyncClient(transport=httpx.MockTransport(company)) as http:
        reactor, _ = build_pap_reactor(http_client=http)
        reactor.register_plugin(
            PluginManifest(name="pap-session-transport-example", version="1"),
            TransportPlugin(session_jwts),
        )
        session = await SessionClient(reactor=reactor, http_client=http).start(
            client_id="https://assistant.example/agent.json",
            pairwise_user_id="usr_host_only_example",
            issuer="https://auth.shop.example",
            tenant_id="example-tenant",
        )
        started = session.sid
        transport = SessionHttpClient(reactor=reactor, http_client=http)
        response = await transport.request(
            "GET", "https://api.shop.example/orders", session=session, token=token
        )
        try:
            await transport.request(
                "GET", "https://api.shop.example/orders", session=session, token=token
            )
        except TransportError as refused:
            redirect_refused = refused.code == "redirect_refused"
        else:
            redirect_refused = False
        try:
            await transport.request(
                "GET",
                "https://api.shop.example/orders",
                session=session,
                token=token,
                headers={"Authorization": "Bearer model-controlled"},
            )
        except TransportError:
            protected_headers_rejected = True
        else:
            protected_headers_rejected = False
        reactor.stop()

    return {
        "status": response.status_code,
        "fresh_session_jwt_per_attempt": len(session_jwts.requests) == 3,
        "every_request_carried_the_session_header": all(
            "poppy-session" in h for h in sent
        ),
        "every_request_carried_the_access_token": all(
            h.get("authorization", "").startswith("Bearer ") for h in sent
        ),
        "every_session_jwt_covered_the_access_token": all(
            request.access_token == token.access_token
            for request in session_jwts.requests
        ),
        "new_session_after_invalid_session": session_jwts.requests[1].sid != started,
        "redirect_refused": redirect_refused,
        "protected_headers_rejected": protected_headers_rejected,
        "cross_origin_forwarding": False,
        "tokens_withheld": True,
        "session_jwts_withheld": True,
    }
