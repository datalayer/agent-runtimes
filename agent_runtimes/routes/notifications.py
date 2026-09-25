# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's notifications, from outside its runs.

The agent sends notifications through its tools; these routes let a page
list them, configure the channels, send a test one, and mark them read.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..notifications import CHANNELS, ensure_notification_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["notifications"])


class ChannelUpdate(BaseModel):
    """Turn a channel on or off, and say where it delivers."""

    channel: Literal["in-app", "email", "slack"]
    enabled: bool | None = None
    target: str | None = Field(default=None, max_length=500)


class TestNotificationRequest(BaseModel):
    """What the test notification says; both have a default."""

    title: str = Field(default="Test notification", max_length=200)
    body: str = Field(
        default="Sent from the notifications example to check the channels.",
        max_length=2000,
    )
    level: Literal["info", "warning", "critical"] = "info"


@router.get("/agents/{agent_id}/notifications")
async def list_notifications(
    agent_id: str,
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[dict[str, Any]]:
    """The agent's notifications, newest first."""
    store = ensure_notification_store(agent_id)
    return [n.to_dict() for n in store.list(unread_only=unread_only)[:limit]]


@router.get("/agents/{agent_id}/notifications/channels")
async def list_channels(agent_id: str) -> list[dict[str, Any]]:
    """The agent's channels: on or off, and their targets."""
    return [c.to_dict() for c in ensure_notification_store(agent_id).channels()]


@router.put("/agents/{agent_id}/notifications/channels")
async def update_channel(agent_id: str, body: ChannelUpdate) -> list[dict[str, Any]]:
    """Configure one channel; answers with all of them."""
    store = ensure_notification_store(agent_id)
    try:
        store.configure(body.channel, enabled=body.enabled, target=body.target)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [c.to_dict() for c in store.channels()]


@router.post(
    "/agents/{agent_id}/notifications/test", status_code=status.HTTP_201_CREATED
)
async def send_test_notification(
    agent_id: str, body: TestNotificationRequest | None = None
) -> dict[str, Any]:
    """Send a test notification through every enabled channel."""
    request = body or TestNotificationRequest()
    store = ensure_notification_store(agent_id)
    records = await store.notify(
        request.title, request.body, level=request.level, metadata={"source": "test"}
    )
    return {
        "agent_id": agent_id,
        "channels": [c for c in CHANNELS if c in {r.channel for r in records}],
        "notifications": [r.to_dict() for r in records],
    }


@router.post("/agents/{agent_id}/notifications/read-all")
async def mark_all_notifications_read(agent_id: str) -> dict[str, Any]:
    """Mark every notification read."""
    count = ensure_notification_store(agent_id).mark_all_read()
    return {"agent_id": agent_id, "marked": count}


@router.post("/agents/{agent_id}/notifications/{notification_id}/read")
async def mark_notification_read(agent_id: str, notification_id: str) -> dict[str, Any]:
    """Mark one notification read."""
    record = ensure_notification_store(agent_id).mark_read(notification_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return record.to_dict()
