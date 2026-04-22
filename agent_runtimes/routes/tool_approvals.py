# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local tool approval endpoints served by agent-runtimes.

These endpoints support the sync approval flow without requiring an external
ai-agents approval backend. A legacy route prefix is also exposed for
compatibility with existing callers.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, WebSocket
from pydantic import BaseModel, Field

from agent_runtimes.streams.loop import (
    publish_stream_event,
    stream_loop,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tool-approvals", tags=["tool-approvals"])
legacy_router = APIRouter(
    prefix="/api/ai-agents/v1/tool-approvals",
    tags=["tool-approvals"],
)
ws_router = APIRouter(
    prefix="/api/ai-agents/v1",
    tags=["tool-approvals"],
)


async def _decide_approval_via_ws(
    approval_id: str,
    approved: bool,
    note: str | None = None,
) -> ToolApprovalRecord:
    return await _update_approval(
        approval_id,
        status="approved" if approved else "rejected",
        note=note,
    )


async def _delete_approval_via_ws(approval_id: str) -> ToolApprovalRecord:
    return await _delete_approval(approval_id)


class ToolApprovalCreateRequest(BaseModel):
    """Payload to create a pending tool approval request."""

    agent_id: str = Field(default="default")
    pod_name: str = Field(default="")
    tool_name: str
    tool_args: dict[str, Any] = Field(default_factory=dict)
    tool_call_id: str | None = None


class ToolApprovalDecisionRequest(BaseModel):
    """Payload to approve or reject a pending request."""

    note: str | None = None


class ToolApprovalRecord(BaseModel):
    """Stored approval record."""

    id: str
    agent_id: str
    pod_name: str = ""
    tool_name: str
    tool_args: dict[str, Any] = Field(default_factory=dict)
    tool_call_id: str | None = None
    status: str = "pending"
    note: str | None = None
    created_at: str
    updated_at: str


_APPROVALS: dict[str, ToolApprovalRecord] = {}
_APPROVALS_LOCK = asyncio.Lock()

# ─── Inline approval event registry (asyncio.Event-based) ────────────────────

_PENDING_APPROVAL_EVENTS: dict[str, tuple[asyncio.Event, dict[str, Any]]] = {}


def register_pending_approval_event(
    approval_id: str,
) -> tuple[asyncio.Event, dict[str, Any]]:
    """Register an asyncio.Event for inline approval blocking.

    Returns (event, result_dict).  The caller should ``await event.wait()`` and
    then read ``result_dict["approved"]`` (bool) and optionally ``result_dict["note"]``
    after the event is set.
    """
    event = asyncio.Event()
    result: dict[str, Any] = {}
    _PENDING_APPROVAL_EVENTS[approval_id] = (event, result)
    return event, result


def signal_approval_event(
    approval_id: str, approved: bool, note: str | None = None
) -> bool:
    """Signal the asyncio.Event for *approval_id*, returning True if found."""
    entry = _PENDING_APPROVAL_EVENTS.get(approval_id)
    if not entry:
        return False
    event, result = entry
    result["approved"] = approved
    result["note"] = note
    event.set()
    return True


def remove_pending_approval_event(approval_id: str) -> None:
    """Remove the asyncio.Event entry for *approval_id* (cleanup after wait)."""
    _PENDING_APPROVAL_EVENTS.pop(approval_id, None)


async def _publish_approval_event(
    *,
    event_type: str,
    payload: dict[str, Any],
    agent_id: str | None,
) -> None:
    """Publish a tool-approval event through the generic stream."""
    await publish_stream_event(
        event_type=event_type,
        payload=payload,
        agent_id=agent_id,
        list_approvals=_list_approvals,
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def mirror_approval_to_local(data: dict) -> ToolApprovalRecord:
    """Mirror an approval record from an external backend (e.g. ai-agents)
    into the local in-memory store so the frontend can discover it.
    """
    now = _now_iso()
    record = ToolApprovalRecord(
        id=data.get("id", str(uuid4())),
        agent_id=data.get("agent_id", ""),
        pod_name=data.get("pod_name", ""),
        tool_name=data.get("tool_name", ""),
        tool_args=data.get("tool_args", {}),
        tool_call_id=data.get("tool_call_id"),
        status=data.get("status", "pending"),
        created_at=data.get("created_at", now),
        updated_at=data.get("updated_at", now),
    )
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record
    await _publish_approval_event(
        event_type="tool_approval_created",
        payload=record.model_dump(),
        agent_id=record.agent_id or None,
    )
    return record


async def get_local_approval_status(approval_id: str) -> str | None:
    """Check the status of an approval in the local in-memory store.
    Returns the status string or None if not found.
    """
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
    return record.status if record else None


async def update_local_approval_status(
    approval_id: str, status: str, note: str | None = None
) -> None:
    """Update the status of a local approval record and unblock any waiter.

    Called by the remote-bridge after it mirrors a decision from the
    datalayer-ai-agents backend.  Must signal the asyncio.Event so that
    ``ToolApprovalManager.request_and_wait`` is unblocked.
    """
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
        if record and record.status == "pending":
            updated = record.model_copy(
                update={"status": status, "note": note, "updated_at": _now_iso()}
            )
            _APPROVALS[approval_id] = updated
        else:
            updated = None
    if updated is not None:
        # Unblock any in-process coroutine waiting on this approval.
        signal_approval_event(approval_id, status == "approved", note)
        await _publish_approval_event(
            event_type=(
                "tool_approval_approved"
                if status == "approved"
                else "tool_approval_rejected"
            ),
            payload=updated.model_dump(),
            agent_id=updated.agent_id or None,
        )


async def forward_approval_to_ai_agents(
    record: "ToolApprovalRecord",
    user_jwt_token: str | None,
) -> str | None:
    """Best-effort forward a pending approval to the datalayer-ai-agents backend.

    Called from ``ToolApprovalManager.request_and_wait`` so that approvals
    created via the inline ``ToolApprovalCapability`` path are visible in
    remote UI panels (e.g. the ToolApprovals view in datalayer/ui) that poll
    the ai-agents service rather than the local agent-runtimes endpoints.
    """
    if not user_jwt_token:
        return None
    try:
        import httpx
        from datalayer_core.utils.urls import DatalayerURLs

        urls = DatalayerURLs.from_environment()
        ai_agents_url = getattr(urls, "ai_agents_url", None)
        if not ai_agents_url:
            return None
        ai_agents_url = ai_agents_url.rstrip("/")
        remote_approval_id: str | None = None
        async with httpx.AsyncClient(
            timeout=10.0,
            headers={"Authorization": f"Bearer {user_jwt_token}"},
        ) as client:
            resp = await client.post(
                f"{ai_agents_url}/api/ai-agents/v1/tool-approvals",
                json={
                    "agent_id": record.agent_id,
                    "pod_name": record.pod_name or "",
                    "tool_name": record.tool_name,
                    "tool_args": record.tool_args or {},
                    "tool_call_id": record.tool_call_id,
                },
            )
            resp.raise_for_status()
            try:
                payload = resp.json()
            except Exception:
                payload = None

            if isinstance(payload, dict):
                # ai-agents may return either top-level id/uid or nested data object.
                candidate = (
                    payload.get("id")
                    or payload.get("uid")
                    or (payload.get("data") or {}).get("id")
                    or (payload.get("data") or {}).get("uid")
                )
                if isinstance(candidate, str) and candidate:
                    remote_approval_id = candidate
        logger.info(
            "[tool-approval:forward] Synced approval %s (tool=%s) to ai-agents backend"
            " (remote_id=%s)",
            record.id,
            record.tool_name,
            remote_approval_id,
        )
        return remote_approval_id
    except Exception as exc:
        logger.debug(
            "[tool-approval:forward] Could not sync approval %s to ai-agents: %s",
            getattr(record, "id", "?"),
            exc,
        )
        return None


async def _create_approval(body: ToolApprovalCreateRequest) -> ToolApprovalRecord:
    if body.tool_call_id:
        async with _APPROVALS_LOCK:
            for record in _APPROVALS.values():
                if (
                    record.agent_id == body.agent_id
                    and record.tool_call_id == body.tool_call_id
                    and record.status == "pending"
                ):
                    return record

    now = _now_iso()
    record = ToolApprovalRecord(
        id=str(uuid4()),
        agent_id=body.agent_id,
        pod_name=body.pod_name,
        tool_name=body.tool_name,
        tool_args=body.tool_args or {},
        tool_call_id=body.tool_call_id,
        status="pending",
        created_at=now,
        updated_at=now,
    )
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record
    await _publish_approval_event(
        event_type="tool_approval_created",
        payload=record.model_dump(),
        agent_id=record.agent_id or None,
    )
    return record


async def _list_approvals(
    agent_id: str | None = None,
    status: str | None = None,
) -> list[ToolApprovalRecord]:
    async with _APPROVALS_LOCK:
        values = list(_APPROVALS.values())

    if agent_id is not None:
        values = [item for item in values if item.agent_id == agent_id]
    if status is not None:
        values = [item for item in values if item.status == status]
    return values


async def _get_approval(approval_id: str) -> ToolApprovalRecord:
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Tool approval not found")
    return record


async def _update_approval(
    approval_id: str,
    status: str,
    note: str | None,
) -> ToolApprovalRecord:
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Tool approval not found")

        if record.status != "pending":
            return record

        updated = record.model_copy(
            update={
                "status": status,
                "note": note,
                "updated_at": _now_iso(),
            }
        )
        _APPROVALS[approval_id] = updated

    # Signal any in-process coroutine waiting on this approval (e.g.
    # ToolApprovalCapability.before_tool_execute using asyncio.Event).
    signal_approval_event(approval_id, status == "approved", note)

    await _publish_approval_event(
        event_type=(
            "tool_approval_approved"
            if status == "approved"
            else "tool_approval_rejected"
        ),
        payload=updated.model_dump(),
        agent_id=updated.agent_id or None,
    )
    return updated


async def _delete_approval(approval_id: str) -> ToolApprovalRecord:
    async with _APPROVALS_LOCK:
        record = _APPROVALS.get(approval_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Tool approval not found")

        updated = record.model_copy(
            update={
                "status": "deleted",
                "updated_at": _now_iso(),
            }
        )
        _APPROVALS[approval_id] = updated

    await _publish_approval_event(
        event_type="tool_approval_deleted",
        payload=updated.model_dump(),
        agent_id=updated.agent_id or None,
    )
    return updated


# Public REST endpoints are intentionally removed. Tool-approval state is
# propagated and consumed over websocket streams only.


# ─── WebSocket endpoints ─────────────────────────────────────────────


@router.websocket("/ws")
async def tool_approvals_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await stream_loop(
        websocket,
        agent_id,
        list_approvals=_list_approvals,
        decide_approval=_decide_approval_via_ws,
        delete_approval=_delete_approval_via_ws,
    )


@legacy_router.websocket("/ws")
async def legacy_tool_approvals_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await stream_loop(
        websocket,
        agent_id,
        list_approvals=_list_approvals,
        decide_approval=_decide_approval_via_ws,
        delete_approval=_delete_approval_via_ws,
    )


@ws_router.websocket("/ws")
async def ai_agents_stream_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await stream_loop(
        websocket,
        agent_id,
        list_approvals=_list_approvals,
        decide_approval=_decide_approval_via_ws,
        delete_approval=_delete_approval_via_ws,
    )
