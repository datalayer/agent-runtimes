# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local tool approval endpoints served by agent-runtimes.

These endpoints support the sync approval flow without requiring an external
ai-agents approval backend. A legacy route prefix is also exposed for
compatibility with existing callers.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from agent_runtimes.context.costs import get_cost_store
from agent_runtimes.streams import AgentMonitoringSnapshotPayload, AgentStreamMessage

router = APIRouter(prefix="/tool-approvals", tags=["tool-approvals"])
legacy_router = APIRouter(
    prefix="/api/ai-agents/v1/tool-approvals",
    tags=["tool-approvals"],
)
ws_router = APIRouter(
    prefix="/api/ai-agents/v1",
    tags=["tool-approvals"],
)


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
_STREAM_SUBSCRIBERS: dict[str, set[asyncio.Queue[AgentStreamMessage]]] = {}


def _stream_key(agent_id: str | None) -> str:
    return agent_id or "__global__"


def _subscribe_stream(agent_id: str | None) -> asyncio.Queue[AgentStreamMessage]:
    key = _stream_key(agent_id)
    queue: asyncio.Queue[AgentStreamMessage] = asyncio.Queue(maxsize=32)
    _STREAM_SUBSCRIBERS.setdefault(key, set()).add(queue)
    return queue


def _unsubscribe_stream(agent_id: str | None, queue: asyncio.Queue[AgentStreamMessage]) -> None:
    key = _stream_key(agent_id)
    subscribers = _STREAM_SUBSCRIBERS.get(key)
    if not subscribers:
        return
    subscribers.discard(queue)
    if not subscribers:
        _STREAM_SUBSCRIBERS.pop(key, None)


def _enqueue_stream_message(agent_id: str | None, message: AgentStreamMessage) -> None:
    keys = [_stream_key(agent_id)]
    if keys[0] != "__global__":
        keys.append("__global__")
    for key in keys:
        subscribers = _STREAM_SUBSCRIBERS.get(key)
        if not subscribers:
            continue
        for queue in list(subscribers):
            if queue.full():
                continue
            queue.put_nowait(message)


def _build_context_snapshot(agent_id: str) -> dict[str, Any] | None:
    from agent_runtimes.context.session import get_agent_context_snapshot

    snapshot = get_agent_context_snapshot(agent_id)
    if snapshot is None:
        return None
    data = snapshot.to_dict()
    data["costUsage"] = get_cost_store().get_agent_usage_dict(agent_id)
    return data


async def _build_monitoring_snapshot_payload(
    agent_id: str | None,
) -> AgentMonitoringSnapshotPayload:
    approvals = await _list_approvals(agent_id=agent_id, status="pending")
    context_snapshot: dict[str, Any] | None = None
    cost_usage: dict[str, Any] | None = None
    if agent_id:
        context_snapshot = _build_context_snapshot(agent_id)
        cost_usage = get_cost_store().get_agent_usage_dict(agent_id)

    return AgentMonitoringSnapshotPayload(
        agentId=agent_id,
        approvals=[a.model_dump() for a in approvals],
        pendingApprovalCount=len(approvals),
        contextSnapshot=context_snapshot,
        costUsage=cost_usage,
    )


async def _publish_stream_event(
    *,
    event_type: str,
    payload: dict[str, Any],
    agent_id: str | None,
) -> None:
    message = AgentStreamMessage.create(
        type=event_type,
        payload=payload,
        agent_id=agent_id,
    )
    _enqueue_stream_message(agent_id, message)

    snapshot_payload = (
        await _build_monitoring_snapshot_payload(agent_id)
    ).model_dump(by_alias=True)
    snapshot = AgentStreamMessage.create(
        type="agent.snapshot",
        payload=snapshot_payload,
        agent_id=agent_id,
    )
    _enqueue_stream_message(agent_id, snapshot)


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
    await _publish_stream_event(
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
    """Update the status of a local approval record."""
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
        await _publish_stream_event(
            event_type=(
                "tool_approval_approved"
                if status == "approved"
                else "tool_approval_rejected"
            ),
            payload=updated.model_dump(),
            agent_id=updated.agent_id or None,
        )


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
    await _publish_stream_event(
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

    await _publish_stream_event(
        event_type=(
            "tool_approval_approved" if status == "approved" else "tool_approval_rejected"
        ),
        payload=updated.model_dump(),
        agent_id=updated.agent_id or None,
    )
    return updated


async def _stream_loop(websocket: WebSocket, agent_id: str | None) -> None:
    await websocket.accept()
    queue = _subscribe_stream(agent_id)
    try:
        initial_payload = (
            await _build_monitoring_snapshot_payload(agent_id)
        ).model_dump(by_alias=True)
        await websocket.send_json(
            AgentStreamMessage.create(
                type="agent.snapshot",
                payload=initial_payload,
                agent_id=agent_id,
            ).model_dump(by_alias=True)
        )

        last_snapshot = initial_payload
        while True:
            recv_task = asyncio.create_task(websocket.receive_text())
            msg_task = asyncio.create_task(queue.get())
            try:
                done, pending = await asyncio.wait(
                    {recv_task, msg_task},
                    timeout=2.0,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()

                if not done:
                    next_snapshot = (
                        await _build_monitoring_snapshot_payload(agent_id)
                    ).model_dump(by_alias=True)
                    if next_snapshot != last_snapshot:
                        last_snapshot = next_snapshot
                        await websocket.send_json(
                            AgentStreamMessage.create(
                                type="agent.snapshot",
                                payload=next_snapshot,
                                agent_id=agent_id,
                            ).model_dump(by_alias=True)
                        )
                    continue

                if recv_task in done:
                    # Allow ping/keepalive from clients.
                    _ = recv_task.result()

                if msg_task in done:
                    message = msg_task.result()
                    await websocket.send_json(message.model_dump(by_alias=True))
            finally:
                if not recv_task.done():
                    recv_task.cancel()
                if not msg_task.done():
                    msg_task.cancel()
    except WebSocketDisconnect:
        return
    finally:
        _unsubscribe_stream(agent_id, queue)


@router.post("", response_model=ToolApprovalRecord)
@legacy_router.post("", response_model=ToolApprovalRecord)
async def create_tool_approval(body: ToolApprovalCreateRequest) -> ToolApprovalRecord:
    return await _create_approval(body)


@router.get("", response_model=list[ToolApprovalRecord])
@legacy_router.get("", response_model=list[ToolApprovalRecord])
async def list_tool_approvals(
    agent_id: str | None = None,
    status: str | None = None,
) -> list[ToolApprovalRecord]:
    return await _list_approvals(agent_id=agent_id, status=status)


@router.get("/{approval_id}", response_model=ToolApprovalRecord)
@legacy_router.get("/{approval_id}", response_model=ToolApprovalRecord)
async def get_tool_approval(approval_id: str) -> ToolApprovalRecord:
    return await _get_approval(approval_id)


@router.post("/{approval_id}/approve", response_model=ToolApprovalRecord)
@legacy_router.post("/{approval_id}/approve", response_model=ToolApprovalRecord)
async def approve_tool_approval(
    approval_id: str,
    body: ToolApprovalDecisionRequest,
) -> ToolApprovalRecord:
    return await _update_approval(approval_id, status="approved", note=body.note)


@router.post("/{approval_id}/reject", response_model=ToolApprovalRecord)
@legacy_router.post("/{approval_id}/reject", response_model=ToolApprovalRecord)
async def reject_tool_approval(
    approval_id: str,
    body: ToolApprovalDecisionRequest,
) -> ToolApprovalRecord:
    return await _update_approval(approval_id, status="rejected", note=body.note)


@router.websocket("/ws")
async def tool_approvals_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await _stream_loop(websocket, agent_id)


@legacy_router.websocket("/ws")
async def legacy_tool_approvals_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await _stream_loop(websocket, agent_id)


@ws_router.websocket("/ws")
async def ai_agents_stream_ws(
    websocket: WebSocket,
    agent_id: str | None = Query(default=None),
) -> None:
    await _stream_loop(websocket, agent_id)
