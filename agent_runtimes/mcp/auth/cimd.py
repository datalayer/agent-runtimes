# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""This client's own Client ID Metadata Document.

A client *is* an HTTPS URL, and the document at that URL is its
registration — `draft-ietf-oauth-client-id-metadata-document`, which the MCP
specification names as the preferred path and which authorization servers
SHOULD support. Datalayer's IAM reads one; until now nothing on this side
published one, so every connection fell back to dynamic registration and
minted a fresh client id per authorization server, none of which said who
the client was in a way anybody could check.

**The URL is the identity, so it is never guessed.** IAM validates a
document by comparing its `client_id` to the URL it fetched it from, string
against string. A document served here that named some other URL would be a
claim to an identity this deployment does not hold, and one built from a
guessed hostname would simply fail that comparison. So the document exists
only when the deployment has been told its own public URL — the same
`AGENT_RUNTIMES_PUBLIC_URL` the OAuth redirect already depends on — and
`register_client` falls back to dynamic registration when it has not.

What the document must *not* carry is as load-bearing as what it must: no
`client_secret`, no `client_secret_expires_at`, and no symmetric
`token_endpoint_auth_method`. A CIMD client is public — anybody can fetch
the document, so a secret in it is a secret no longer — or confidential
through `private_key_jwt` with a `jwks`/`jwks_uri`. This client is public
and authenticates with PKCE, which is what `"none"` says.
"""

from __future__ import annotations

import os
from typing import Any, Optional

#: Where this deployment serves its document, appended to its public URL.
#: The same base the OAuth callback uses, so the two cannot disagree about
#: which host this client is.
CLIENT_DOCUMENT_PATH = "/api/v1/mcp/client"

#: A secret in a document anybody may fetch is not a secret, and a symmetric
#: authentication method implies one. Refused rather than trimmed: a caller
#: that put one there meant something by it, and publishing the document
#: without it would answer a question nobody asked.
FORBIDDEN_CLAIMS = ("client_secret", "client_secret_expires_at")
SYMMETRIC_AUTH = ("client_secret_basic", "client_secret_post", "client_secret_jwt")


def public_base_url(override: Optional[str] = None) -> Optional[str]:
    """This deployment's public URL, or `None` when it has not been told."""
    base = (override or os.getenv("AGENT_RUNTIMES_PUBLIC_URL") or "").strip()
    return base.rstrip("/") or None


def client_id_metadata_url(override: Optional[str] = None) -> Optional[str]:
    """The URL that *is* this client's identity, or `None` when unknown.

    `None` rather than a guess: a wrong `client_id` does not fail closed, it
    claims to be somebody else.
    """
    base = public_base_url(override)
    return f"{base}{CLIENT_DOCUMENT_PATH}" if base else None


def client_id_metadata_document(
    *,
    client_name: str,
    client_uri: str,
    redirect_uris: tuple[str, ...],
    base_url: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """The document to serve, or `None` when this deployment has no URL."""
    client_id = client_id_metadata_url(base_url)
    if client_id is None or not redirect_uris:
        return None
    return {
        "client_id": client_id,
        "client_name": client_name,
        "client_uri": client_uri,
        "redirect_uris": list(redirect_uris),
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        # Public client: PKCE, never a secret. See the module docstring.
        "token_endpoint_auth_method": "none",
    }


def refuse_if_unpublishable(document: dict[str, Any], fetched_from: str) -> None:
    """Raise unless this document could survive the reader IAM implements.

    Checked here rather than trusted, because every rule below is one an
    authorization server applies *after* the document has been published to
    the internet. Finding out there means finding out from a refusal on
    somebody's login.
    """
    if document.get("client_id") != fetched_from:
        raise ValueError(
            f"a document served at {fetched_from} must name it as its client_id, "
            f"not {document.get('client_id')!r}"
        )
    for claim in FORBIDDEN_CLAIMS:
        if claim in document:
            raise ValueError(f"a Client ID Metadata Document must not carry {claim!r}")
    if document.get("token_endpoint_auth_method") in SYMMETRIC_AUTH:
        raise ValueError(
            f"{document['token_endpoint_auth_method']!r} needs a client secret, and a "
            f"document anybody may fetch cannot hold one"
        )
    for required in ("client_name", "redirect_uris"):
        if not document.get(required):
            raise ValueError(f"a Client ID Metadata Document must carry {required!r}")
