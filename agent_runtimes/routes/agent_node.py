# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local Agent Node configuration endpoints.

Configuration (mode, billing entity, sharing) plus the central-service
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
    billing_entity_uid: str | None = None
    billing_entity_type: str | None = None
    billing_entity_handle: str | None = None
    sharing: dict[str, Any] = Field(default_factory=dict)
    # Id of the agent chosen from the gallery and launched on this node. The
    # tunnel routes incoming chat requests to this agent by default so remote
    # prompts (from the main UI) reach the agent the user selected.
    active_agent_id: str | None = None
    # Spacer document (notebook) uid used as the shared RTC collaboration room
    # for the ephemeral notebook. Provisioned once, after the node registers and
    # the user has signed in, so the node-local UI and the SaaS gallery view
    # join the same room. Owned/persisted by the node like ``node_uid``.
    collaboration_notebook_uid: str | None = None
    # Spacer *lexical* document uid used as the shared RTC collaboration room for
    # the ephemeral document (Lexical/Loro). Distinct from the notebook room
    # above and provisioned alongside it, so the node-local UI and the SaaS
    # gallery view join the same Loro room for rich-text editing.
    collaboration_document_uid: str | None = None
    # Deployment/runtime metadata propagated to the central runtimes registry.
    deployment_target: Literal["localhost", "aws", "other"] | None = None
    chat_access_mode: Literal["local_and_saas", "saas_only"] | None = None
    aws_account_id: str | None = None
    aws_region: str | None = None
    aws_identity_arn: str | None = None


def _state_path() -> Path:
    configured = (os.environ.get("AGENT_NODE_STATE_PATH") or "").strip()
    if configured:
        return Path(configured).expanduser()
    return Path.home() / ".datalayer" / "agent-node.json"


_LOCK = threading.Lock()
_MODE_CHANGE_CALLBACKS: list[Any] = []
_CREDENTIALS_CHANGE_CALLBACKS: list[Any] = []
_CONFIGURATION_CHANGE_CALLBACKS: list[Any] = []


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


def register_configuration_change_callback(callback: Any) -> None:
    """Register a callable invoked whenever persisted configuration changes."""
    _CONFIGURATION_CHANGE_CALLBACKS.append(callback)


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


def _notify_configuration_change() -> None:
    for callback in list(_CONFIGURATION_CHANGE_CALLBACKS):
        try:
            callback()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Configuration change callback failed: %s", exc)


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
    deployment_target = (
        (os.environ.get("AGENT_NODE_DEPLOYMENT_TARGET") or "localhost").strip().lower()
    )
    if deployment_target not in ("localhost", "aws", "other"):
        deployment_target = "localhost"
    chat_access_mode = (
        (os.environ.get("AGENT_NODE_CHAT_ACCESS_MODE") or "").strip().lower()
    )
    if chat_access_mode not in ("local_and_saas", "saas_only"):
        chat_access_mode = (
            "saas_only" if deployment_target == "aws" else "local_and_saas"
        )
    return AgentNodeConfiguration(
        mode=(os.environ.get("AGENT_NODE_MODE") or "sleep").strip().lower() or "sleep",
        deployment_target=deployment_target,
        chat_access_mode=chat_access_mode,
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
        previous = _CURRENT_CONFIGURATION
        merged = configuration.model_copy(
            update={
                "node_uid": _CURRENT_CONFIGURATION.node_uid,
                "collaboration_notebook_uid": (
                    _CURRENT_CONFIGURATION.collaboration_notebook_uid
                ),
                "collaboration_document_uid": (
                    _CURRENT_CONFIGURATION.collaboration_document_uid
                ),
                "deployment_target": _CURRENT_CONFIGURATION.deployment_target,
                "chat_access_mode": _CURRENT_CONFIGURATION.chat_access_mode,
                "aws_account_id": _CURRENT_CONFIGURATION.aws_account_id,
                "aws_region": _CURRENT_CONFIGURATION.aws_region,
                "aws_identity_arn": _CURRENT_CONFIGURATION.aws_identity_arn,
            }
        )
        previous_mode = _CURRENT_CONFIGURATION.mode
        _CURRENT_CONFIGURATION = merged
        _write_to_disk(merged)
        configuration_changed = merged != previous
        mode_changed = merged.mode != previous_mode
    if mode_changed:
        _notify_mode_change(merged.mode)
    if configuration_changed:
        _notify_configuration_change()
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


def set_agent_node_aws_identity(
    *,
    aws_account_id: str | None,
    aws_region: str | None,
    aws_identity_arn: str | None,
) -> AgentNodeConfiguration:
    """Persist detected AWS identity metadata when it changes."""
    global _CURRENT_CONFIGURATION
    cleaned_account = (aws_account_id or "").strip() or None
    if cleaned_account and (
        not cleaned_account.isdigit() or len(cleaned_account) != 12
    ):
        cleaned_account = None
    cleaned_region = (aws_region or "").strip() or None
    cleaned_arn = (aws_identity_arn or "").strip() or None
    with _LOCK:
        if (
            _CURRENT_CONFIGURATION.aws_account_id == cleaned_account
            and _CURRENT_CONFIGURATION.aws_region == cleaned_region
            and _CURRENT_CONFIGURATION.aws_identity_arn == cleaned_arn
        ):
            return _CURRENT_CONFIGURATION
        _CURRENT_CONFIGURATION = _CURRENT_CONFIGURATION.model_copy(
            update={
                "aws_account_id": cleaned_account,
                "aws_region": cleaned_region,
                "aws_identity_arn": cleaned_arn,
            }
        )
        _write_to_disk(_CURRENT_CONFIGURATION)
    _notify_configuration_change()
    return _CURRENT_CONFIGURATION


def set_collaboration_notebook_uid(notebook_uid: str) -> AgentNodeConfiguration:
    """Persist the spacer notebook uid used as the RTC collaboration room.

    Provisioned once after the node registers and credentials are available.
    A no-op when the uid is unchanged so repeated sync ticks do not rewrite
    the on-disk state.
    """
    global _CURRENT_CONFIGURATION
    cleaned = (notebook_uid or "").strip()
    if not cleaned:
        return _CURRENT_CONFIGURATION
    with _LOCK:
        if _CURRENT_CONFIGURATION.collaboration_notebook_uid == cleaned:
            return _CURRENT_CONFIGURATION
        _CURRENT_CONFIGURATION = _CURRENT_CONFIGURATION.model_copy(
            update={"collaboration_notebook_uid": cleaned}
        )
        _write_to_disk(_CURRENT_CONFIGURATION)
    return _CURRENT_CONFIGURATION


def set_collaboration_document_uid(document_uid: str) -> AgentNodeConfiguration:
    """Persist the spacer lexical uid used as the RTC document collaboration room.

    Provisioned once, alongside the notebook room, after the node registers and
    credentials are available. A no-op when the uid is unchanged so repeated
    sync ticks do not rewrite the on-disk state.
    """
    global _CURRENT_CONFIGURATION
    cleaned = (document_uid or "").strip()
    if not cleaned:
        return _CURRENT_CONFIGURATION
    with _LOCK:
        if _CURRENT_CONFIGURATION.collaboration_document_uid == cleaned:
            return _CURRENT_CONFIGURATION
        _CURRENT_CONFIGURATION = _CURRENT_CONFIGURATION.model_copy(
            update={"collaboration_document_uid": cleaned}
        )
        _write_to_disk(_CURRENT_CONFIGURATION)
    return _CURRENT_CONFIGURATION


def set_active_agent_id(agent_id: str | None) -> AgentNodeConfiguration:
    """Persist the id of the agent chosen from the gallery on this node.

    The tunnel routes remote chat requests to this agent by default, so
    updating it re-points prompts coming from the main UI to the newly
    launched agent without rewriting the rest of the configuration.
    """
    global _CURRENT_CONFIGURATION
    cleaned = (agent_id or "").strip() or None
    with _LOCK:
        if _CURRENT_CONFIGURATION.active_agent_id == cleaned:
            return _CURRENT_CONFIGURATION
        _CURRENT_CONFIGURATION = _CURRENT_CONFIGURATION.model_copy(
            update={"active_agent_id": cleaned}
        )
        _write_to_disk(_CURRENT_CONFIGURATION)
    _notify_configuration_change()
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


class AgentNodeActiveAgentBody(BaseModel):
    agent_id: str | None = None


@router.get("/active-agent")
def get_active_agent_endpoint() -> dict[str, Any]:
    return {
        "success": True,
        "message": "Active agent loaded",
        "active_agent_id": get_agent_node_configuration().active_agent_id,
    }


@router.post("/active-agent")
def set_active_agent_endpoint(body: AgentNodeActiveAgentBody) -> dict[str, Any]:
    updated = set_active_agent_id(body.agent_id)
    return {
        "success": True,
        "message": "Active agent updated",
        "active_agent_id": updated.active_agent_id,
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


def _bootstrap_iam_url() -> str:
    return (
        os.environ.get("DATALAYER_IAM_URL") or "https://prod1.datalayer.run"
    ).rstrip("/")


async def _exchange_api_key(api_key: str, iam_url: str) -> dict[str, Any] | None:
    """Exchange a personal API key for a session token via central IAM."""
    import httpx  # local import to keep module import cheap

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                f"{iam_url}/api/iam/v1/login",
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
    handle = user.get("handle_s") or user.get("handle") or "api-key-user"
    return {
        "token": str(data["token"]),
        "handle": str(handle),
        "iam_url": iam_url,
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
    iam_url = _bootstrap_iam_url()
    cache_key = f"{api_key}@{iam_url}"
    cached = _BOOTSTRAP_CACHE.get("result")
    if cached and _BOOTSTRAP_CACHE.get("key") == cache_key:
        return {"success": True, "has_key": True, **cached}
    result = await _exchange_api_key(api_key, iam_url)
    if not result:
        return {"success": True, "has_key": False}
    _BOOTSTRAP_CACHE["key"] = cache_key
    _BOOTSTRAP_CACHE["result"] = result
    return {"success": True, "has_key": True, **result}
