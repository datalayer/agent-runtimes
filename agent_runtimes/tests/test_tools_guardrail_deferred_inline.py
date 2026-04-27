# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for inline deferred approval handling in ToolsGuardrailCapability."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic_ai import DeferredToolRequests
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDenied

from agent_runtimes.guardrails.tool_approvals import (
    ToolApprovalConfig,
    ToolsGuardrailCapability,
)
from agent_runtimes.routes.tool_approvals import (
    _APPROVALS,
    _APPROVALS_LOCK,
    ToolApprovalRecord,
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def _reset_approvals() -> None:
    async with _APPROVALS_LOCK:
        _APPROVALS.clear()


async def _put_record(record: ToolApprovalRecord) -> None:
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record


def _capability() -> ToolsGuardrailCapability:
    return ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="agent-1",
            tools_requiring_approval=["runtime-sensitive-echo"],
        )
    )


@pytest.mark.asyncio
async def test_inline_handle_uses_existing_approved_decision() -> None:
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-1",
                agent_id="agent-1",
                pod_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-1",
                status="approved",
                note=None,
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )

        capability = _capability()
        requests = DeferredToolRequests(
            approvals=[
                ToolCallPart(
                    tool_name="runtime_sensitive_echo",
                    args={"text": "hello"},
                    tool_call_id="tool-1",
                )
            ]
        )

        result = await capability.handle_deferred_tool_calls(
            None,
            requests=requests,
        )

        assert result is not None
        assert result.approvals == {"tool-1": True}
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_inline_handle_uses_existing_rejected_decision() -> None:
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-2",
                agent_id="agent-1",
                pod_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-2",
                status="rejected",
                note="Not allowed",
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )

        capability = _capability()
        requests = DeferredToolRequests(
            approvals=[
                ToolCallPart(
                    tool_name="runtime_sensitive_echo",
                    args={"text": "hello"},
                    tool_call_id="tool-2",
                )
            ]
        )

        result = await capability.handle_deferred_tool_calls(
            None,
            requests=requests,
        )

        assert result is not None
        denied = result.approvals["tool-2"]
        assert isinstance(denied, ToolDenied)
        assert denied.message == "Not allowed"
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_inline_handle_leaves_unresolved_requests_to_caller() -> None:
    await _reset_approvals()
    capability = _capability()
    requests = DeferredToolRequests(
        approvals=[
            ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args={"text": "hello"},
                tool_call_id="tool-3",
            )
        ]
    )

    result = await capability.handle_deferred_tool_calls(
        None,
        requests=requests,
    )

    assert result is None


@pytest.mark.asyncio
async def test_inline_handle_accepts_json_string_args() -> None:
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-4",
                agent_id="agent-1",
                pod_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello", "reason": "audit"},
                tool_call_id="tool-4",
                status="approved",
                note=None,
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )

        capability = _capability()
        requests = DeferredToolRequests(
            approvals=[
                ToolCallPart(
                    tool_name="runtime_sensitive_echo",
                    args='{"text":"hello","reason":"audit"}',
                    tool_call_id="tool-4",
                )
            ]
        )

        result = await capability.handle_deferred_tool_calls(
            None,
            requests=requests,
        )

        assert result is not None
        assert result.approvals == {"tool-4": True}
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_inline_handle_json_string_args_without_match_returns_none() -> None:
    await _reset_approvals()
    capability = _capability()
    requests = DeferredToolRequests(
        approvals=[
            ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args='{"text":"hello","reason":"audit"}',
                tool_call_id="tool-5",
            )
        ]
    )

    result = await capability.handle_deferred_tool_calls(
        None,
        requests=requests,
    )

    assert result is None
