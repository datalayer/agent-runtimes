# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Explain PAP Session assertion policy without exposing identifiers."""

from __future__ import annotations

from typing import Any

from personal_agent_protocol import (
    build_session_assertion_claims,
    generate_pairwise_user_id,
)

from agent_runtimes.loop.apps import Application

app = Application(
    id="pap-session-assertion",
    name="PAP Session Assertion",
    description="Explain the safe shape of a short-lived PAP Session assertion.",
    kind="chat",
    agent="example-blank:0.0.1",
    instructions=(
        "Use explain_session_assertion to explain Session assertion safety. "
        "Never ask for or claim to expose an assertion, key, subject, or token."
    ),
)


@app.tool(does="read")
async def explain_session_assertion(
    client_id: str, token_endpoint: str
) -> dict[str, Any]:
    """Build claims internally and return their non-identifying policy summary."""

    claims = build_session_assertion_claims(
        client_id=client_id,
        pairwise_user_id=generate_pairwise_user_id(),
        token_endpoint=token_endpoint,
    )
    return {
        "issuer_bound_to_client_id": claims.iss == client_id,
        "audience_bound_to_token_endpoint": claims.aud == token_endpoint,
        "lifetime_seconds": claims.exp - claims.iat,
        "pairwise_subject_withheld": True,
        "unique_request_id_withheld": True,
        "requires_protected_signer": True,
    }
