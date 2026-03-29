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

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/tool-approvals", tags=["tool-approvals"])
legacy_router = APIRouter(
    prefix="/api/ai-agents/v1/tool-approvals",
    tags=["tool-approvals"],
)


class ToolApprovalCreateRequest(BaseModel):
    """Payload to create a pending tool approval request."""

    agent_id: str = Field(default="default")
    pod_name: str = Field(default="")
    tool_name: str
    tool_args: dict[str, Any] = Field(default_factory=dict)


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
    status: str = "pending"
    note: str | None = None
    created_at: str
    updated_at: str


_APPROVALS: dict[str, ToolApprovalRecord] = {}
_APPROVALS_LOCK = asyncio.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def mirror_approval_to_local(data: dict) -> ToolApprovalRecord:
    """Mirror an approval record from an external backend (e.g. ai-agents)
    into the local in-memory store so the frontend can discover it."""
    now = _now_iso()
    record = ToolApprovalRecord(
        id=data.get("id", str(uuid4())),
        agent_id=data.get("agent_id", ""),
        pod_name=data.get("pod_name", ""),
        tool_name=data.get("tool_name", ""),
        tool_args=data.get("tool_args", {}),
        status=data.get("status", "pending"),
        created_at=data.get("created_at", now),
        updated_at=data.get("updated_at", now),
    )
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record
    return record


async def get_local_approval_status(approval_id: str) -> str | None:
    """Check the status of an approval in the local in-memory store.
    Returns the status string or None if not found."""
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
            _APPROVALS[approval_id] = record.model_copy(
                update={"status": status, "note": note, "updated_at": _now_iso()}
            )


async def _create_approval(body: ToolApprovalCreateRequest) -> ToolApprovalRecord:
    now = _now_iso()
    record = ToolApprovalRecord(
        id=str(uuid4()),
        agent_id=body.agent_id,
        pod_name=body.pod_name,
        tool_name=body.tool_name,
        tool_args=body.tool_args or {},
        status="pending",
        created_at=now,
        updated_at=now,
    )
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record
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
        return updated


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
