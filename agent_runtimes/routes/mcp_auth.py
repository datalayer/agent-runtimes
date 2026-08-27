# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Authentication endpoints for MCP servers.

One implementation, three front-ends. The terminal cannot host a redirect and
the browser cannot reach an OS keychain, so neither of them runs the flow: they
both drive these endpoints, and the server holds the pieces that must not be
duplicated — the PKCE verifier, the client registration, the tokens.
"""

from __future__ import annotations

import logging
import os
import secrets
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from agent_runtimes.mcp.auth import (
    OAuthError,
    PendingFlow,
    authorization_url,
    choose_scope,
    discover,
    exchange_code,
    get_token_store,
    refresh_token,
    register_client,
    revoke,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["mcp-auth"])

#: Authorizations in flight, by `state`. In memory because a verifier must not
#: outlive the flow it belongs to.
_pending: dict[str, PendingFlow] = {}

#: Set once by the app so callback URLs point back at this server.
_public_base_url = ""


def set_public_base_url(url: str) -> None:
    """Tell this router where it is reachable, for redirect URIs."""
    global _public_base_url
    _public_base_url = url.rstrip("/")


def _callback_url() -> str:
    base = _public_base_url or os.getenv("AGENT_RUNTIMES_PUBLIC_URL") or ""
    if not base:
        raise OAuthError(
            "This server does not know its own public URL, so it cannot receive "
            "an OAuth redirect. Set AGENT_RUNTIMES_PUBLIC_URL."
        )
    return f"{base.rstrip('/')}/api/v1/mcp/auth/callback"


def _store():
    return get_token_store()


def _purge_stale() -> None:
    for state in [s for s, flow in _pending.items() if flow.is_stale()]:
        _pending.pop(state, None)


class StartAuthRequest(BaseModel):
    """Where the MCP server lives, when the catalogue does not say."""

    server_url: str = Field(default="", description="MCP server URL to authenticate to")


class StartAuthResponse(BaseModel):
    authorization_url: str
    state: str
    store: str = Field(description="Which tier will hold the credentials")


class AuthStatusResponse(BaseModel):
    server_id: str
    status: str = Field(description="connected, needs_auth, expired or error")
    scope: str = ""
    expires_at: Optional[float] = None
    store: str = ""
    detail: str = ""


def _server_url(server_id: str, override: str = "") -> str:
    """Resolve an MCP server's URL from the catalogue, or an override."""
    if override:
        return override
    try:
        from agent_runtimes.mcp.catalog_mcp_servers import MCP_SERVER_CATALOG

        server = MCP_SERVER_CATALOG.get(server_id)
        url = getattr(server, "url", "") if server else ""
        if url:
            return str(url)
    except Exception as error:  # noqa: BLE001
        logger.debug("Catalogue lookup failed for %s: %s", server_id, error)
    raise HTTPException(
        status_code=400,
        detail=f"No URL known for MCP server {server_id!r}; pass server_url",
    )


@router.get("/servers/{server_id}/auth", response_model=AuthStatusResponse)
async def auth_status(server_id: str) -> AuthStatusResponse:
    """Whether we hold usable credentials for a server."""
    store = _store()
    token = store.get(server_id)
    if token is None:
        return AuthStatusResponse(
            server_id=server_id, status="needs_auth", store=store.name
        )
    return AuthStatusResponse(
        server_id=server_id,
        status="expired" if token.is_expired() else "connected",
        scope=token.scope,
        expires_at=token.expires_at,
        store=store.name,
    )


@router.post("/servers/{server_id}/auth/start", response_model=StartAuthResponse)
async def start_auth(server_id: str, body: StartAuthRequest) -> StartAuthResponse:
    """Begin an authorization: discover, register, and build the URL."""
    _purge_stale()
    url = _server_url(server_id, body.server_url)

    try:
        redirect_uri = _callback_url()
        metadata = await discover(url)
        client_id, client_secret = await register_client(metadata, redirect_uri)
    except OAuthError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    from agent_runtimes.mcp.auth import generate_pkce

    verifier, challenge = generate_pkce()
    state = secrets.token_urlsafe(24)
    scope = choose_scope(metadata)

    _pending[state] = PendingFlow(
        server_id=server_id,
        metadata=metadata,
        code_verifier=verifier,
        redirect_uri=redirect_uri,
        client_id=client_id,
        client_secret=client_secret,
        scope=scope,
    )

    return StartAuthResponse(
        authorization_url=authorization_url(
            metadata,
            client_id=client_id,
            redirect_uri=redirect_uri,
            code_challenge=challenge,
            state=state,
            scope=scope,
        ),
        state=state,
        store=_store().name,
    )


@router.get("/auth/callback")
async def auth_callback(
    code: str = "", state: str = "", error: str = ""
) -> HTMLResponse:
    """Where the authorization server sends the user back."""
    if error:
        return HTMLResponse(_page("Authorization refused", error), status_code=400)

    flow = _pending.pop(state, None)
    if flow is None or flow.is_stale():
        # Unknown, replayed or expired all get the same answer: there is nothing
        # useful to tell apart for someone holding a bad state.
        return HTMLResponse(
            _page("This login link is no longer valid", "Run /mcp auth again."),
            status_code=400,
        )

    try:
        token = await exchange_code(flow, code)
        _store().put(flow.server_id, token)
    except (OAuthError, RuntimeError) as failure:
        return HTMLResponse(_page("Could not complete the login", str(failure)), status_code=400)

    logger.info("Stored credentials for MCP server %s", flow.server_id)
    return HTMLResponse(
        _page(f"Connected to {flow.server_id}", "You can close this tab.")
    )


@router.post("/servers/{server_id}/auth/refresh", response_model=AuthStatusResponse)
async def refresh_auth(server_id: str) -> AuthStatusResponse:
    """Renew an access token from its refresh token."""
    store = _store()
    token = store.get(server_id)
    if token is None:
        raise HTTPException(status_code=404, detail=f"Not connected to {server_id}")

    try:
        renewed = await refresh_token(token)
    except OAuthError as error:
        return AuthStatusResponse(
            server_id=server_id, status="needs_auth", store=store.name, detail=str(error)
        )

    store.put(server_id, renewed)
    return AuthStatusResponse(
        server_id=server_id,
        status="connected",
        scope=renewed.scope,
        expires_at=renewed.expires_at,
        store=store.name,
    )


@router.delete("/servers/{server_id}/auth")
async def logout(server_id: str) -> dict[str, Any]:
    """Revoke the credentials, then forget them.

    In that order: forgetting a token we never revoked leaves something valid
    in the world that we can no longer withdraw.
    """
    store = _store()
    token = store.get(server_id)
    if token is None:
        return {"server_id": server_id, "revoked": False, "forgotten": False}

    revoked = await revoke(token)
    store.delete(server_id)
    return {"server_id": server_id, "revoked": revoked, "forgotten": True}


def _page(title: str, message: str) -> str:
    """A minimal page for the browser the user was sent to."""
    return (
        "<!doctype html><meta charset='utf-8'>"
        "<style>body{font:16px system-ui;margin:4rem auto;max-width:32rem;color:#1b1f23}"
        "h1{font-size:1.25rem}p{color:#57606a}</style>"
        f"<h1>{title}</h1><p>{message}</p>"
    )
