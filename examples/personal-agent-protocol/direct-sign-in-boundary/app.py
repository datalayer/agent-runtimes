# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate that Direct Sign-In secrets never become agent output."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlsplit

from personal_agent_protocol import (
    InMemorySessionKeys,
    JoseDpopProofProvider,
    build_direct_sign_in_request,
)

from agent_runtimes.loop.apps import Application


@dataclass(frozen=True)
class DirectSignInHostConfig:
    """Trusted registration and discovery values that never enter tool input."""

    authorization_endpoint: str
    issuer: str
    client_id: str
    redirect_uri: str
    scopes: tuple[str, ...]


HOST_CONFIG = DirectSignInHostConfig(
    authorization_endpoint=os.getenv(
        "PAP_AUTHORIZATION_ENDPOINT", "https://shop.example/oauth/authorize"
    ),
    issuer=os.getenv("PAP_COMPANY_ISSUER", "https://shop.example"),
    client_id=os.getenv("PAP_CLIENT_ID", "https://assistant.example/agent.json"),
    redirect_uri=os.getenv(
        "PAP_REDIRECT_URI", "https://assistant.example/oauth/callback"
    ),
    # The company's own scopes, from its discovery document (`auth.scopes`).
    scopes=tuple(os.getenv("PAP_SCOPES", "orders:read").split()),
)
TENANT_ID = os.getenv("PAP_TENANT_ID", "example-application")

app = Application(
    id="pap-direct-sign-in-boundary",
    name="PAP Direct Sign-In Boundary",
    description="Explain PAP Direct Sign-In without exposing authorization material.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_direct_sign_in to describe the trusted browser boundary. "
        "Never request a callback URL, authorization code, verifier, Session Key, "
        "proof, or token."
    ),
)


@app.tool(does="read")
async def explain_direct_sign_in() -> dict[str, Any]:
    """Build a protected request internally and return safe security properties."""

    # The Session to sign in is named by its Session Key: the thumbprint of the key
    # that signs its DPoP proofs. Here a fresh one, as starting a Session makes.
    proofs = JoseDpopProofProvider(InMemorySessionKeys())
    session_key = await proofs.new_session_key(
        tenant_id=TENANT_ID, issuer=HOST_CONFIG.issuer
    )
    request = build_direct_sign_in_request(
        authorization_endpoint=HOST_CONFIG.authorization_endpoint,
        issuer=HOST_CONFIG.issuer,
        client_id=HOST_CONFIG.client_id,
        redirect_uri=HOST_CONFIG.redirect_uri,
        scopes=HOST_CONFIG.scopes,
        session_key=session_key,
    )
    query = parse_qs(urlsplit(request.authorization_url.get_secret_value()).query)
    return {
        "requested_scopes": request.scopes,
        "pkce_method": "S256",
        "random_state": True,
        # `dpop_jkt` binds the authorization code to the Session Key: only a proof
        # with that key can redeem it, and it signs in that Session and no other.
        "code_bound_to_the_session_key": query.get("dpop_jkt") == [session_key],
        "user_owned_browser_required": True,
        "authorization_url_withheld": True,
        "state_withheld": True,
        "code_verifier_withheld": True,
        "session_key_withheld": True,
    }
