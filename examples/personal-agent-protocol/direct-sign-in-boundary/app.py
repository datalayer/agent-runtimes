# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Demonstrate that Direct Sign-In secrets never become agent output."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import build_direct_sign_in_request

from agent_runtimes.loop.apps import Application

app = Application(
    id="pap-direct-sign-in-boundary",
    name="PAP Direct Sign-In Boundary",
    description="Explain PAP Direct Sign-In without exposing authorization material.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_direct_sign_in to describe the trusted browser boundary. "
        "Never request a callback URL, authorization code, verifier, proof, or token."
    ),
)


@app.tool(does="read")
async def explain_direct_sign_in(
    authorization_endpoint: str,
    issuer: str,
    client_id: str,
    redirect_uri: str,
    scopes: list[str],
) -> dict[str, Any]:
    """Build a protected request internally and return safe security properties."""

    request = build_direct_sign_in_request(
        authorization_endpoint=authorization_endpoint,
        issuer=issuer,
        client_id=client_id,
        redirect_uri=redirect_uri,
        scopes=scopes,
    )
    return {
        "requested_scopes": request.scopes,
        "pkce_method": "S256",
        "random_state": True,
        "user_owned_browser_required": True,
        "authorization_url_withheld": True,
        "state_withheld": True,
        "code_verifier_withheld": True,
    }
