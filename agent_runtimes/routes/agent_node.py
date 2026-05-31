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

from fastapi import APIRouter
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


def register_mode_change_callback(callback: Any) -> None:
    """Register a callable invoked whenever the persisted mode changes.

    The callback receives the new mode string. Errors are swallowed so a
    misbehaving subscriber cannot break the configuration update path.
    """
    _MODE_CHANGE_CALLBACKS.append(callback)


def _notify_mode_change(new_mode: str) -> None:
    for callback in list(_MODE_CHANGE_CALLBACKS):
        try:
            callback(new_mode)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Mode change callback failed: %s", exc)


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
