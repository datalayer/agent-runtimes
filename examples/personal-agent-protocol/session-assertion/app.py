# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Explain PAP Session assertion policy without exposing identifiers."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from personal_agent_protocol import (
    PAIRWISE_USER_ID_STORES,
    SqlitePairwiseUserIdStore,
    build_session_assertion_claims,
    resolve_pairwise_user_id,
)
from reactor import PluginManifest, PluginPlatform

from agent_runtimes.loop.apps import Application

PAIRWISE_DATABASE = Path(
    os.getenv(
        "PAP_PAIRWISE_DATABASE",
        "~/.local/state/pap-examples/pairwise-user-ids.sqlite3",
    )
).expanduser()
PAIRWISE_STORE = SqlitePairwiseUserIdStore(PAIRWISE_DATABASE)
TENANT_ID = os.getenv("PAP_TENANT_ID", "example-application")
LOCAL_USER_ID = os.getenv("PAP_LOCAL_USER_ID", "example-local-user")
COMPANY_ISSUER = os.getenv("PAP_COMPANY_ISSUER", "https://shop.example")
CLIENT_ID = os.getenv("PAP_CLIENT_ID", "https://assistant.example/agent.json")
TOKEN_ENDPOINT = os.getenv("PAP_TOKEN_ENDPOINT", "https://shop.example/oauth/token")


class HostPairwiseStorePlugin:
    """Expose host storage through PAP's Reactor contribution point."""

    def provide_contributions(self, contributions: object) -> None:
        contributions.contribute(  # type: ignore[attr-defined]
            PAIRWISE_USER_ID_STORES,
            PAIRWISE_STORE,
            contribution_id="example-sqlite",
        )


PAIRWISE_REACTOR = PluginPlatform(extension_group="pap_example.plugins")
PAIRWISE_REACTOR.register_plugin(
    PluginManifest(
        name="pap-example-pairwise-store",
        version="1",
        contribution_points=[PAIRWISE_USER_ID_STORES.id],
    ),
    HostPairwiseStorePlugin(),
)

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
async def explain_session_assertion() -> dict[str, Any]:
    """Build claims internally and return their non-identifying policy summary."""

    PAIRWISE_DATABASE.parent.mkdir(parents=True, exist_ok=True)
    pairwise_user_id = await resolve_pairwise_user_id(
        PAIRWISE_REACTOR,
        tenant_id=TENANT_ID,
        local_user_id=LOCAL_USER_ID,
        company_issuer=COMPANY_ISSUER,
    )
    claims = build_session_assertion_claims(
        client_id=CLIENT_ID,
        pairwise_user_id=pairwise_user_id,
        token_endpoint=TOKEN_ENDPOINT,
    )
    return {
        "issuer_bound_to_client_id": claims.iss == CLIENT_ID,
        "audience_bound_to_token_endpoint": claims.aud == TOKEN_ENDPOINT,
        "lifetime_seconds": claims.exp - claims.iat,
        "stable_pairwise_subject": True,
        "pairwise_subject_withheld": True,
        "unique_request_id_withheld": True,
        "requires_protected_signer": True,
    }
