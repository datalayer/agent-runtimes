# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""OAuth 2.1 for MCP servers: discovery, registration, PKCE, tokens.

The browser half of this already exists (`src/identity/dcr.ts`, `pkce.ts`). The
terminal cannot borrow it — a CLI has no page to run a redirect in — so the same
flow lives here, and both front-ends go through the server that implements it.

The shape follows what MCP servers actually advertise:

1. **Protected resource metadata** (RFC 9728) at
   ``/.well-known/oauth-protected-resource`` names the authorization server.
2. **Authorization server metadata** (RFC 8414) at
   ``/.well-known/oauth-authorization-server`` names the endpoints.
3. **Dynamic client registration** (RFC 7591) gets a client id without anyone
   pre-registering the CLI — the whole point for a client that discovers servers
   at runtime.
4. **PKCE** (RFC 7636, S256) is mandatory, because a public client cannot keep a
   secret and an intercepted code must be useless on its own.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlencode, urljoin, urlparse

import httpx

from agent_runtimes.mcp.auth.tokens import OAuthToken

logger = logging.getLogger(__name__)

#: What the CLI calls itself when registering dynamically.
CLIENT_NAME = "Datalayer LOOP"
CLIENT_URI = "https://datalayer.io"

#: Scopes asked for when a server does not say what it supports.
DEFAULT_SCOPES = ("openid", "profile", "offline_access")


class OAuthError(RuntimeError):
    """Something in the flow failed in a way worth showing a person."""


@dataclass
class ServerMetadata:
    """Where to send a user, and where to redeem what comes back."""

    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    registration_endpoint: Optional[str] = None
    revocation_endpoint: Optional[str] = None
    scopes_supported: tuple[str, ...] = ()
    #: The MCP server this authorization server protects (RFC 8707 `resource`).
    resource: Optional[str] = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any], resource: Optional[str] = None) -> "ServerMetadata":
        missing = [
            key
            for key in ("issuer", "authorization_endpoint", "token_endpoint")
            if not payload.get(key)
        ]
        if missing:
            raise OAuthError(
                f"The authorization server metadata is missing {', '.join(missing)}"
            )
        return cls(
            issuer=payload["issuer"],
            authorization_endpoint=payload["authorization_endpoint"],
            token_endpoint=payload["token_endpoint"],
            registration_endpoint=payload.get("registration_endpoint"),
            revocation_endpoint=payload.get("revocation_endpoint"),
            scopes_supported=tuple(payload.get("scopes_supported") or ()),
            resource=resource,
        )


@dataclass
class PendingFlow:
    """One authorization in flight, waiting for the user to come back."""

    server_id: str
    metadata: ServerMetadata
    code_verifier: str
    redirect_uri: str
    client_id: str
    client_secret: Optional[str] = None
    scope: str = ""
    created_at: float = field(default_factory=time.time)

    def is_stale(self, *, now: Optional[float] = None, ttl: float = 600.0) -> bool:
        """Ten minutes is long enough to log in and short enough to forget."""
        moment = now if now is not None else time.time()
        return self.created_at + ttl < moment


def generate_pkce() -> tuple[str, str]:
    """A PKCE verifier and its S256 challenge."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).decode().rstrip("=")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


def _well_known(url: str, suffix: str) -> str:
    """Build a `.well-known` URL against the origin of `url`."""
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return urljoin(origin + "/", f".well-known/{suffix.lstrip('/')}")


async def discover(server_url: str, *, timeout: float = 10.0) -> ServerMetadata:
    """Find the authorization server protecting an MCP server.

    Tries the protected-resource document first, because that is the one that
    names *which* authorization server to use; falls back to asking the MCP
    server's own origin, which is how single-tenant servers are usually set up.
    """
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        issuer_candidates: list[str] = []

        try:
            response = await client.get(_well_known(server_url, "oauth-protected-resource"))
            if response.status_code == 200:
                payload = response.json()
                issuer_candidates.extend(payload.get("authorization_servers") or [])
        except Exception as error:  # noqa: BLE001
            logger.debug("No protected-resource metadata for %s: %s", server_url, error)

        # Failing that, the MCP server's own origin is the authorization server.
        parsed = urlparse(server_url)
        issuer_candidates.append(f"{parsed.scheme}://{parsed.netloc}")

        for issuer in issuer_candidates:
            for suffix in ("oauth-authorization-server", "openid-configuration"):
                try:
                    response = await client.get(_well_known(issuer, suffix))
                    if response.status_code == 200:
                        return ServerMetadata.from_payload(
                            response.json(), resource=server_url
                        )
                except Exception as error:  # noqa: BLE001
                    logger.debug("No %s at %s: %s", suffix, issuer, error)

    raise OAuthError(
        f"{server_url} does not advertise an OAuth authorization server. "
        "It may not need authentication, or it may want a static token instead."
    )


async def register_client(
    metadata: ServerMetadata,
    redirect_uri: str,
    *,
    timeout: float = 10.0,
) -> tuple[str, Optional[str]]:
    """Register this client dynamically. Returns ``(client_id, client_secret)``.

    Dynamic registration is what lets someone connect a server nobody has
    pre-arranged anything with — the normal case for an MCP client that finds
    servers at runtime.
    """
    if not metadata.registration_endpoint:
        raise OAuthError(
            "This authorization server does not support dynamic client "
            "registration; a client id has to be configured by hand."
        )

    body = {
        "client_name": CLIENT_NAME,
        "client_uri": CLIENT_URI,
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",  # public client, PKCE instead
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(metadata.registration_endpoint, json=body)
    if response.status_code not in (200, 201):
        raise OAuthError(
            f"Dynamic client registration was refused ({response.status_code}): "
            f"{response.text[:200]}"
        )

    payload = response.json()
    client_id = payload.get("client_id")
    if not client_id:
        raise OAuthError("The registration response contained no client_id")
    return client_id, payload.get("client_secret")


def authorization_url(
    metadata: ServerMetadata,
    *,
    client_id: str,
    redirect_uri: str,
    code_challenge: str,
    state: str,
    scope: str = "",
) -> str:
    """The URL to send the user to."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    if scope:
        params["scope"] = scope
    if metadata.resource:
        # RFC 8707: say which resource the token is for, so an authorization
        # server that protects several cannot hand out one that works elsewhere.
        params["resource"] = metadata.resource
    return f"{metadata.authorization_endpoint}?{urlencode(params)}"


def choose_scope(metadata: ServerMetadata) -> str:
    """Ask for what the server says it supports, or a sensible default."""
    if metadata.scopes_supported:
        return " ".join(metadata.scopes_supported)
    return " ".join(DEFAULT_SCOPES)


def _token_from_payload(
    payload: dict[str, Any],
    metadata: ServerMetadata,
    *,
    client_id: str,
    client_secret: Optional[str],
    now: Optional[float] = None,
    previous_refresh: Optional[str] = None,
) -> OAuthToken:
    access_token = payload.get("access_token")
    if not access_token:
        raise OAuthError("The token response contained no access_token")

    expires_in = payload.get("expires_in")
    moment = now if now is not None else time.time()
    return OAuthToken(
        access_token=access_token,
        token_type=payload.get("token_type") or "Bearer",
        # An authorization server may omit the refresh token on refresh, which
        # means "keep using the one you have", not "you no longer have one".
        refresh_token=payload.get("refresh_token") or previous_refresh,
        expires_at=(moment + float(expires_in)) if expires_in else None,
        scope=payload.get("scope") or "",
        client_id=client_id,
        client_secret=client_secret,
        token_endpoint=metadata.token_endpoint,
        revocation_endpoint=metadata.revocation_endpoint,
    )


async def exchange_code(
    flow: PendingFlow,
    code: str,
    *,
    timeout: float = 10.0,
    now: Optional[float] = None,
) -> OAuthToken:
    """Turn an authorization code into tokens."""
    body = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": flow.redirect_uri,
        "client_id": flow.client_id,
        "code_verifier": flow.code_verifier,
    }
    if flow.client_secret:
        body["client_secret"] = flow.client_secret
    if flow.metadata.resource:
        body["resource"] = flow.metadata.resource

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(flow.metadata.token_endpoint, data=body)
    if response.status_code != 200:
        raise OAuthError(
            f"The token exchange failed ({response.status_code}): {response.text[:200]}"
        )

    return _token_from_payload(
        response.json(),
        flow.metadata,
        client_id=flow.client_id,
        client_secret=flow.client_secret,
        now=now,
    )


async def refresh_token(
    token: OAuthToken,
    *,
    timeout: float = 10.0,
    now: Optional[float] = None,
) -> OAuthToken:
    """Exchange a refresh token for a fresh access token."""
    if not token.refresh_token or not token.token_endpoint:
        raise OAuthError("This login cannot be refreshed; authenticate again")

    body = {
        "grant_type": "refresh_token",
        "refresh_token": token.refresh_token,
        "client_id": token.client_id or "",
    }
    if token.client_secret:
        body["client_secret"] = token.client_secret

    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(token.token_endpoint, data=body)
    if response.status_code != 200:
        raise OAuthError(
            f"The refresh was refused ({response.status_code}): {response.text[:200]}"
        )

    metadata = ServerMetadata(
        issuer="",
        authorization_endpoint="",
        token_endpoint=token.token_endpoint,
        revocation_endpoint=token.revocation_endpoint,
    )
    return _token_from_payload(
        response.json(),
        metadata,
        client_id=token.client_id or "",
        client_secret=token.client_secret,
        now=now,
        previous_refresh=token.refresh_token,
    )


async def revoke(token: OAuthToken, *, timeout: float = 10.0) -> bool:
    """Ask the authorization server to invalidate the token.

    Returns whether the server was asked at all. Forgetting a token locally is
    not revoking it: a credential we drop but the server still honours is a
    credential someone else can still use.
    """
    if not token.revocation_endpoint:
        return False

    body = {"token": token.refresh_token or token.access_token}
    if token.client_id:
        body["client_id"] = token.client_id
    if token.client_secret:
        body["client_secret"] = token.client_secret

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            await client.post(token.revocation_endpoint, data=body)
        return True
    except Exception as error:  # noqa: BLE001
        logger.warning("Revocation call failed: %s", error)
        return False
