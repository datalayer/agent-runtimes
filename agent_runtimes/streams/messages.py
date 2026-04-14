# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Structured websocket stream message models.

Provides a versioned envelope for agent-runtime stream events so frontend
clients can consume heterogeneous updates through one websocket channel.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class AgentStreamMessage(BaseModel):
    """Versioned stream envelope for websocket events."""

    version: str = "1.0"
    type: str
    agent_id: str | None = Field(default=None, alias="agentId")
    timestamp: str = Field(default_factory=_utc_now_iso)
    payload: dict[str, Any] = Field(default_factory=dict)
    # Legacy compatibility with existing websocket consumers.
    event: str | None = None
    data: dict[str, Any] | None = None

    @classmethod
    def create(
        cls,
        *,
        type: str,
        payload: dict[str, Any],
        agent_id: str | None = None,
    ) -> "AgentStreamMessage":
        return cls(
            type=type,
            payload=payload,
            agentId=agent_id,
            event=type,
            data=payload,
        )


class AgentMonitoringSnapshotPayload(BaseModel):
    """Snapshot payload sent over the unified agent stream.

    This is the single source of truth for all client-facing state.
    Previously, parts of this data were served by separate REST endpoints
    that clients polled every few seconds.  Now everything is pushed
    over the WebSocket so the REST endpoints can be removed.
    """

    agent_id: str | None = Field(default=None, alias="agentId")
    approvals: list[dict[str, Any]] = Field(default_factory=list)
    pending_approval_count: int = Field(default=0, alias="pendingApprovalCount")
    context_snapshot: dict[str, Any] | None = Field(
        default=None,
        alias="contextSnapshot",
    )
    cost_usage: dict[str, Any] | None = Field(default=None, alias="costUsage")
    mcp_status: dict[str, Any] | None = Field(default=None, alias="mcpStatus")
    codemode_status: dict[str, Any] | None = Field(default=None, alias="codemodeStatus")
    full_context: dict[str, Any] | None = Field(default=None, alias="fullContext")
