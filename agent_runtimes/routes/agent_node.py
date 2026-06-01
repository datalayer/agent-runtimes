# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local Agent Node configuration endpoints.

Configuration (mode, billable account, sharing) plus the central-service
issued ``node_uid`` (ULID) are persisted locally so they survive restarts.
The ``node_uid`` is *never* minted locally — the central
``datalayer-runtimes`` service assigns it on first ``/register`` and the
local node persists whatever id the service returns.
"""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agent-node", tags=["agent-node"])

AgentNodeMode = Literal["private", "shared", "sleep"]


class AgentNodeConfiguration(BaseModel):
    mode: AgentNodeMode = "sleep"
    node_uid: str | None = None
    billable_account_uid: str | None = None
    billable_account_type: str | None = None
    billable_account_handle: str | None = None
    sharing: dict[str, Any] = Field(default_factory=dict)


def _state_path() -> Path:
    configured = (os.environ.get("AGENT_NODE_STATE_PATH") or "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".datalayer" / "agent-node.json"


_LOCK = threading.Lock()
_MODE_CHANGE_CALLBACKS: list[Any] = []
_CREDENTIALS_CHANGE_CALLBACKS: list[Any] = []


# In-process credentials supplied by the Agent Node UI after the user signs in.
# These act as a fallback for ``DATALAYER_API_KEY`` / ``DATALAYER_RUNTIMES_URL``
# so the background sync (register + heartbeat + health) can talk to the
# central runtimes service even when the node was started without env vars.
_RUNTIME_CREDENTIALS: dict[str, str | None] = {
    "token": None,
    "runtimes_url": None,
}


def register_mode_change_callback(callback: Any) -> None:
    """Register a callable invoked whenever the persisted mode changes.

    The callback receives the new mode string. Errors are swallowed so a
    misbehaving subscriber cannot break the configuration update path.
    """
    _MODE_CHANGE_CALLBACKS.append(callback)


def register_credentials_change_callback(callback: Any) -> None:
    """Register a callable invoked whenever the UI-supplied credentials change."""
    _CREDENTIALS_CHANGE_CALLBACKS.append(callback)


def _notify_mode_change(new_mode: str) -> None:
    for callback in list(_MODE_CHANGE_CALLBACKS):
        try:
            callback(new_mode)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Mode change callback failed: %s", exc)


def _notify_credentials_change() -> None:
    for callback in list(_CREDENTIALS_CHANGE_CALLBACKS):
        try:
            callback()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Credentials change callback failed: %s", exc)


def get_runtime_credentials() -> dict[str, str | None]:
    """Return UI-supplied runtimes credentials (token, runtimes_url)."""
    with _LOCK:
        return dict(_RUNTIME_CREDENTIALS)


def set_runtime_credentials(
    token: str | None, runtimes_url: str | None
) -> dict[str, str | None]:
    """Persist UI-supplied credentials so the sync loop can pick them up."""
    cleaned_token = (token or "").strip() or None
    cleaned_url = (runtimes_url or "").strip().rstrip("/") or None
    changed = False
    with _LOCK:
        if (
            _RUNTIME_CREDENTIALS["token"] != cleaned_token
            or _RUNTIME_CREDENTIALS["runtimes_url"] != cleaned_url
        ):
            _RUNTIME_CREDENTIALS["token"] = cleaned_token
            _RUNTIME_CREDENTIALS["runtimes_url"] = cleaned_url
            changed = True
        snapshot = dict(_RUNTIME_CREDENTIALS)
    if changed:
        _notify_credentials_change()
    return snapshot


def _read_from_disk() -> AgentNodeConfiguration | None:
    path = _state_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to read agent-node state at %s: %s", path, exc)
        return None
    try:
        return AgentNodeConfiguration.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Invalid agent-node state at %s: %s", path, exc)
        return None


def _write_to_disk(configuration: AgentNodeConfiguration) -> None:
    path = _state_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(configuration.model_dump(), indent=2))
    except Exception as exc:  # noqa: BLE001
        logger.warning("Unable to persist agent-node state to %s: %s", path, exc)


def _initial_configuration() -> AgentNodeConfiguration:
    persisted = _read_from_disk()
    if persisted is not None:
        return persisted
    return AgentNodeConfiguration(
        mode=(os.environ.get("AGENT_NODE_MODE") or "sleep").strip().lower() or "sleep"
    )


_CURRENT_CONFIGURATION: AgentNodeConfiguration = _initial_configuration()


def get_agent_node_configuration() -> AgentNodeConfiguration:
    return _CURRENT_CONFIGURATION


def set_agent_node_configuration(
    configuration: AgentNodeConfiguration,
) -> AgentNodeConfiguration:
    """Replace the current configuration, preserving the existing ``node_uid``.

    The ``node_uid`` is owned by the central service; UI updates must not
    overwrite it. Use :func:`set_agent_node_uid` when the service assigns one.
    """
    global _CURRENT_CONFIGURATION
    with _LOCK:
        merged = configuration.model_copy(
            update={"node_uid": _CURRENT_CONFIGURATION.node_uid}
        )
        previous_mode = _CURRENT_CONFIGURATION.mode
        _CURRENT_CONFIGURATION = merged
        _write_to_disk(merged)
        mode_changed = merged.mode != previous_mode
    if mode_changed:
        _notify_mode_change(merged.mode)
    return _CURRENT_CONFIGURATION


def set_agent_node_uid(node_uid: str) -> AgentNodeConfiguration:
    """Persist the ULID assigned by the central datalayer-runtimes service."""
    global _CURRENT_CONFIGURATION
    cleaned = (node_uid or "").strip()
    if not cleaned:
        return _CURRENT_CONFIGURATION
    with _LOCK:
        if _CURRENT_CONFIGURATION.node_uid == cleaned:
            return _CURRENT_CONFIGURATION
        _CURRENT_CONFIGURATION = _CURRENT_CONFIGURATION.model_copy(
            update={"node_uid": cleaned}
        )
        _write_to_disk(_CURRENT_CONFIGURATION)
    return _CURRENT_CONFIGURATION


@router.get("/configuration")
def get_configuration_endpoint() -> dict[str, Any]:
    return {
        "success": True,
        "message": "Agent node configuration loaded",
        "configuration": get_agent_node_configuration().model_dump(),
    }


@router.post("/configuration")
def set_configuration_endpoint(body: AgentNodeConfiguration) -> dict[str, Any]:
    updated = set_agent_node_configuration(body)
    return {
        "success": True,
        "message": "Agent node configuration updated",
        "configuration": updated.model_dump(),
    }


class AgentNodeCredentialsBody(BaseModel):
    token: str | None = None
    runtimes_url: str | None = None


def _extract_bearer_token(request: Request) -> str:
    """Return bearer token from Authorization header or empty string."""
    auth_header = (request.headers.get("authorization") or "").strip()
    if not auth_header.lower().startswith("bearer "):
        return ""
    return auth_header[7:].strip()


@router.post("/credentials")
def set_credentials_endpoint(
    body: AgentNodeCredentialsBody,
    request: Request,
) -> dict[str, Any]:
    """Receive the user's bearer token + runtimes base URL from the UI.

    The background sync loop uses these as a fallback when ``DATALAYER_API_KEY``
    and ``DATALAYER_RUNTIMES_URL`` env vars are not set, so the node can
    register and send heartbeats/health once the user signs in.

    Security: this endpoint requires an Authorization bearer token to prevent
    unauthenticated callers from overriding in-memory runtime credentials.
    """
    request_token = _extract_bearer_token(request)
    if not request_token:
        raise HTTPException(
            status_code=401,
            detail="Authorization bearer token is required",
        )

    body_token = (body.token or "").strip()
    if body_token and body_token != request_token:
        raise HTTPException(
            status_code=403,
            detail="Authorization token does not match payload token",
        )

    creds = set_runtime_credentials(body.token, body.runtimes_url)
    return {
        "success": True,
        "message": "Agent node credentials updated",
        "has_token": bool(creds.get("token")),
        "runtimes_url": creds.get("runtimes_url"),
    }


@router.get("/sharing")
def get_sharing_endpoint() -> dict[str, Any]:
    """Return the sharing payload in the shape expected by ShareAccessComponent."""
    sharing = dict(get_agent_node_configuration().sharing or {})
    if "access" not in sharing or not isinstance(sharing.get("access"), dict):
        sharing = {"access": {}}
    return {
        "success": True,
        "message": "Agent node sharing loaded",
        "sharing": sharing,
        "owners": [],
    }


@router.put("/sharing")
def set_sharing_endpoint(body: dict[str, Any]) -> dict[str, Any]:
    """Replace the sharing portion of the configuration (auto-saved by UI)."""
    current = get_agent_node_configuration()
    sharing = body if isinstance(body, dict) else {}
    updated = current.model_copy(update={"sharing": sharing})
    set_agent_node_configuration(updated)
    return {
        "success": True,
        "message": "Agent node sharing updated",
        "sharing": sharing,
    }


# Cache the env-API-key → session-token exchange so the UI can skip the auth
# screen without re-hitting the central IAM service on every page load.
_BOOTSTRAP_CACHE: dict[str, Any] = {"key": None, "result": None}


def _bootstrap_run_url() -> str:
    return (
        os.environ.get("DATALAYER_RUN_URL")
        or "https://prod1.datalayer.run"
    ).rstrip("/")


async def _exchange_api_key(api_key: str, run_url: str) -> dict[str, Any] | None:
    """Exchange a personal API key for a session token via central IAM."""
    import httpx  # local import to keep module import cheap

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{run_url}/api/iam/v1/login",
                json={"token": api_key},
                headers={"Content-Type": "application/json"},
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Bootstrap API-key exchange failed: %s", exc)
        return None
    if not isinstance(data, dict) or not data.get("success") or not data.get("token"):
        return None
    user = data.get("user") or {}
    handle = (
        user.get("handle_s")
        or user.get("handle")
        or "api-key-user"
    )
    return {
        "token": str(data["token"]),
        "handle": str(handle),
        "run_url": run_url,
    }


@router.get("/auth/bootstrap")
async def auth_bootstrap_endpoint() -> dict[str, Any]:
    """Return a session token derived from the env-supplied ``DATALAYER_API_KEY``.

    When ``DATALAYER_API_KEY`` is set in the container environment, the UI
    uses this endpoint to skip the sign-in screen. When it is not set (or the
    exchange fails), the response carries ``has_key=false`` and the UI shows
    its normal sign-in flow.
    """
    api_key = (os.environ.get("DATALAYER_API_KEY") or "").strip()
    if not api_key:
        return {"success": True, "has_key": False}
    run_url = _bootstrap_run_url()
    cache_key = f"{api_key}@{run_url}"
    cached = _BOOTSTRAP_CACHE.get("result")
    if cached and _BOOTSTRAP_CACHE.get("key") == cache_key:
        return {"success": True, "has_key": True, **cached}
    result = await _exchange_api_key(api_key, run_url)
    if not result:
        return {"success": True, "has_key": False}
    _BOOTSTRAP_CACHE["key"] = cache_key
    _BOOTSTRAP_CACHE["result"] = result
    return {"success": True, "has_key": True, **result}
