# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An application that explains the Direct Sign-In boundary."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlsplit

from personal_agent_protocol import build_direct_sign_in_request

from agent_runtimes.apps import Application


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

app = Application(
    id="pap-direct-sign-in-boundary",
    name="PAP Direct Sign-In Boundary",
    description="Explain PAP Direct Sign-In without exposing authorization material.",
    kind="chat",
    # Its interface: the Reactor plugins of agentspecs/ui it is drawn with.
    ui=[{"plugin": "chat"}],
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_direct_sign_in to explain the trusted browser boundary. "
        "Never request or expose an authorization URL, state, verifier, code, or token."
    ),
)


@app.tool(does="read")
async def explain_direct_sign_in() -> dict[str, Any]:
    """Create protected authorization material and return safe policy only."""

    request = build_direct_sign_in_request(
        authorization_endpoint=HOST_CONFIG.authorization_endpoint,
        issuer=HOST_CONFIG.issuer,
        client_id=HOST_CONFIG.client_id,
        redirect_uri=HOST_CONFIG.redirect_uri,
        scopes=HOST_CONFIG.scopes,
    )
    query = parse_qs(urlsplit(request.authorization_url.get_secret_value()).query)
    return {
        "requested_scopes": request.scopes,
        "pkce_method": "S256",
        "random_state": True,
        # Plain OAuth: the sign-in names no Session, and any of the User's Sessions uses
        # the tokens it returns.
        "names_no_session": "sid" not in query,
        "user_owned_browser_required": True,
        "authorization_url_withheld": True,
        "state_withheld": True,
        "code_verifier_withheld": True,
    }
