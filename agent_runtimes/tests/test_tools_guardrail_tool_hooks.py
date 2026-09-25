# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Unit tests for tool hook behavior in ToolsGuardrailCapability."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, cast

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.guardrails.tool_approvals import (
    _APPROVED_TOOL_GRANTS_BY_SCOPE,
    ToolApprovalConfig,
    ToolApprovalExecutionReservationError,
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolApprovalTimeoutError,
    ToolsGuardrailCapability,
)
from agent_runtimes.routes.tool_approvals import (
    _APPROVALS,
    _APPROVALS_LOCK,
    ToolApprovalRecord,
    _mark_approval_executing,
)

_POST_HOOK_PAYLOADS: list[dict[str, Any]] = []


def mock_pre_allow_hook(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return {"decision": "allow", "reason": "allowed by test hook"}


def mock_post_capture_hook(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    _POST_HOOK_PAYLOADS.append(dict(payload))
    return {"ok": True}


class _FakeManager:
    def __init__(self, requires_approval: bool = True, persist_approval: bool = False):
        self._requires_approval = requires_approval
        self._persist_approval = persist_approval
        self.calls: list[tuple[str, dict[str, str], str | None]] = []

    def requires_approval(self, tool_name: str) -> bool:
        return self._requires_approval and tool_name == "runtime_sensitive_echo"

    async def request_and_wait(
        self,
        tool_name: str,
        safe_args: dict[str, str],
        tool_call_id: str | None,
    ) -> dict[str, str]:
        self.calls.append((tool_name, safe_args, tool_call_id))
        approval_id = f"fake-approval-{tool_call_id or len(self.calls)}"
        if self._persist_approval:
            await _put_record(
                ToolApprovalRecord(
                    id=approval_id,
                    agent_id="agent-1",
                    runtime_name="",
                    tool_name=tool_name,
                    tool_args=safe_args,
                    tool_call_id=tool_call_id,
                    status="approved",
                    note=None,
                    created_at=_now_iso(),
                    updated_at=_now_iso(),
                )
            )
        return {"status": "approved", "id": approval_id, "tool_name": tool_name}


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rows.append(json.loads(line))
    return rows


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def _reset_approvals() -> None:
    async with _APPROVALS_LOCK:
        _APPROVALS.clear()


async def _put_record(record: ToolApprovalRecord) -> None:
    async with _APPROVALS_LOCK:
        _APPROVALS[record.id] = record


@pytest.fixture(autouse=True)
def _reset_post_hook_payloads() -> None:
    _POST_HOOK_PAYLOADS.clear()
    # Cross-turn grants are process-global; clear them so tests stay isolated.
    _APPROVED_TOOL_GRANTS_BY_SCOPE.clear()


@pytest.mark.asyncio
async def test_pre_tool_function_hook_allows_without_wait(tmp_path: Path) -> None:
    audit_path = tmp_path / "audit.jsonl"
    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="agent-1",
            audit_log_path=str(audit_path),
            tools_requiring_approval=["runtime-sensitive-echo"],
            tool_hooks={
                "before_tool_execute": [
                    {
                        "function": (
                            "agent_runtimes.tests.test_tools_guardrail_tool_hooks:"
                            "mock_pre_allow_hook"
                        )
                    }
                ]
            },
        )
    )
    fake_manager = _FakeManager()
    capability._manager = cast(ToolApprovalManager, fake_manager)

    args = {"text": "hello", "reason": "audit"}
    result = await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="runtime_sensitive_echo",
            args=args,
            tool_call_id="tool-allow-1",
        ),
        tool_def=None,
        args=args,
    )

    assert result == args
    assert fake_manager.calls == []
    assert capability._decision_by_tool_call["tool-allow-1"]["decision"] == "allow"

    events = _read_jsonl(audit_path)
    assert any(e.get("event") == "tool-authorization-decision" for e in events)


@pytest.mark.asyncio
async def test_pre_tool_inline_python_hook_can_deny(tmp_path: Path) -> None:
    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="agent-1",
            audit_log_path=str(tmp_path / "audit.jsonl"),
            tools_requiring_approval=["runtime-sensitive-echo"],
            tool_hooks={
                "before_tool_execute": [
                    {
                        "python": (
                            "hook_result = {'decision': 'deny', "
                            "'reason': 'blocked in test'}"
                        )
                    }
                ]
            },
        )
    )
    fake_manager = _FakeManager()
    capability._manager = cast(ToolApprovalManager, fake_manager)

    with pytest.raises(ToolApprovalRejectedError, match="blocked in test"):
        await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args={"text": "danger"},
                tool_call_id="tool-deny-1",
            ),
            tool_def=None,
            args={"text": "danger"},
        )

    assert fake_manager.calls == []


@pytest.mark.asyncio
async def test_pre_tool_approval_needed_requests_wait(tmp_path: Path) -> None:
    await _reset_approvals()
    try:
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id="agent-1",
                audit_log_path=str(tmp_path / "audit.jsonl"),
                tools_requiring_approval=["runtime-sensitive-echo"],
                tool_hooks={
                    "before_tool_execute": [
                        {"python": ("hook_result = {'decision': 'approval_required'}")}
                    ]
                },
            )
        )
        fake_manager = _FakeManager(persist_approval=True)
        capability._manager = cast(ToolApprovalManager, fake_manager)

        args = {"text": "hello", "reason": "audit"}
        result = await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args=args,
                tool_call_id="tool-approval-1",
            ),
            tool_def=None,
            args=args,
        )

        assert result == args
        assert len(fake_manager.calls) == 1
        assert fake_manager.calls[0][0] == "runtime_sensitive_echo"
        async with _APPROVALS_LOCK:
            approval = _APPROVALS["fake-approval-tool-approval-1"]
            assert approval.status == "executing"
            assert approval.execution_started_at is not None
            assert approval.execution_tool_call_id == "tool-approval-1"
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_pre_tool_blocks_when_approval_cannot_be_reserved(
    tmp_path: Path,
) -> None:
    """A manager response without a reservable record must fail closed."""
    await _reset_approvals()
    try:
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id="agent-1",
                audit_log_path=str(tmp_path / "audit.jsonl"),
                tools_requiring_approval=["runtime-sensitive-echo"],
            )
        )
        capability._manager = cast(ToolApprovalManager, _FakeManager())

        with pytest.raises(ToolApprovalExecutionReservationError):
            await capability.before_tool_execute(
                None,
                call=ToolCallPart(
                    tool_name="runtime_sensitive_echo",
                    args={"text": "hello"},
                    tool_call_id="tool-unreserved",
                ),
                tool_def=None,
                args={"text": "hello"},
            )
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_execution_reservation_is_atomic() -> None:
    """Only one concurrent execution can reserve an approved envelope."""
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-race",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-race-original",
                status="approved",
                note=None,
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )

        results = await asyncio.gather(
            _mark_approval_executing(
                "approval-race",
                agent_id="agent-1",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                execution_tool_call_id="tool-race-a",
            ),
            _mark_approval_executing(
                "approval-race",
                agent_id="agent-1",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                execution_tool_call_id="tool-race-b",
            ),
        )

        assert sum(result is not None for result in results) == 1
        async with _APPROVALS_LOCK:
            assert _APPROVALS["approval-race"].status == "executing"
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_pre_tool_reuses_recent_approval_for_matching_args(
    tmp_path: Path,
) -> None:
    """Recent same-envelope approval skips a duplicate prompt."""
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-reuse-match",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-reuse-original",
                status="approved",
                note=None,
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id="agent-1",
                audit_log_path=str(tmp_path / "audit.jsonl"),
                tools_requiring_approval=["runtime-sensitive-echo"],
            )
        )
        fake_manager = _FakeManager()
        capability._manager = cast(ToolApprovalManager, fake_manager)

        args = {"text": "hello"}
        result = await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args=args,
                tool_call_id="tool-reuse-continuation",
            ),
            tool_def=None,
            args=args,
        )

        assert result == args
        assert fake_manager.calls == []
        async with _APPROVALS_LOCK:
            approval = _APPROVALS["approval-reuse-match"]
            assert approval.status == "executing"
            assert approval.execution_started_at is not None
            assert approval.execution_tool_call_id == "tool-reuse-continuation"
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_pre_tool_does_not_reuse_recent_approval_for_changed_args(
    tmp_path: Path,
) -> None:
    """Changed args must request approval instead of reusing a recent one."""
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-reuse-changed",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-reuse-original",
                status="approved",
                note=None,
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id="agent-1",
                audit_log_path=str(tmp_path / "audit.jsonl"),
                tools_requiring_approval=["runtime-sensitive-echo"],
            )
        )
        fake_manager = _FakeManager(persist_approval=True)
        capability._manager = cast(ToolApprovalManager, fake_manager)

        args = {"text": "danger"}
        result = await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args=args,
                tool_call_id="tool-reuse-continuation",
            ),
            tool_def=None,
            args=args,
        )

        assert result == args
        assert fake_manager.calls == [
            ("runtime_sensitive_echo", {"text": "danger"}, "tool-reuse-continuation")
        ]
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_manager_reuses_recent_approval_for_matching_args() -> None:
    """The manager reuses only matching recent approval envelopes."""
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-manager-match",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-manager-original",
                status="approved",
                note=None,
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )
        manager = ToolApprovalManager(
            ToolApprovalConfig(agent_id="agent-1", timeout=0.01)
        )

        result = await manager.request_and_wait(
            "runtime_sensitive_echo",
            {"text": "hello"},
            "tool-manager-continuation",
        )

        assert result == {
            "status": "approved",
            "id": "approval-manager-match",
            "tool_name": "runtime_sensitive_echo",
        }
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_manager_does_not_reuse_recent_approval_for_changed_args() -> None:
    """The manager waits for a new approval when args changed."""
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-manager-changed",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-manager-original",
                status="approved",
                note=None,
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )
        manager = ToolApprovalManager(
            ToolApprovalConfig(agent_id="agent-1", timeout=0.01)
        )

        with pytest.raises(ToolApprovalTimeoutError):
            await manager.request_and_wait(
                "runtime_sensitive_echo",
                {"text": "danger"},
                "tool-manager-continuation",
            )

        async with _APPROVALS_LOCK:
            assert any(
                record.status == "pending"
                and record.tool_args == {"text": "danger"}
                and record.tool_call_id == "tool-manager-continuation"
                for record in _APPROVALS.values()
            )
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_pydantic_before_tool_execute_alias_is_supported(
    tmp_path: Path,
) -> None:
    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="agent-1",
            audit_log_path=str(tmp_path / "audit.jsonl"),
            tools_requiring_approval=["runtime-sensitive-echo"],
            tool_hooks={
                "before_tool_execute": [
                    {
                        "function": (
                            "agent_runtimes.tests.test_tools_guardrail_tool_hooks:"
                            "mock_pre_allow_hook"
                        ),
                        "tools": ["runtime_sensitive_echo"],
                    }
                ]
            },
        )
    )

    fake_manager = _FakeManager()
    capability._manager = cast(ToolApprovalManager, fake_manager)

    args = {"text": "hello", "reason": "audit"}
    result = await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="runtime_sensitive_echo",
            args=args,
            tool_call_id="tool-alias-1",
        ),
        tool_def=None,
        args=args,
    )

    assert result == args
    assert fake_manager.calls == []


@pytest.mark.asyncio
async def test_post_tool_hook_runs_on_success_and_clears_cache(tmp_path: Path) -> None:
    audit_path = tmp_path / "audit.jsonl"
    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="agent-1",
            audit_log_path=str(audit_path),
            tools_requiring_approval=["runtime-sensitive-echo"],
            tool_hooks={
                "after_tool_execute": [
                    {
                        "function": (
                            "agent_runtimes.tests.test_tools_guardrail_tool_hooks:"
                            "mock_post_capture_hook"
                        )
                    }
                ]
            },
        )
    )

    capability._remember_decision(
        tool_call_id="tool-success-1",
        decision="allow",
        note="ok",
        request_payload={"tool": "runtime_sensitive_echo"},
    )

    result = await capability.after_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="runtime_sensitive_echo",
            args={"text": "hello"},
            tool_call_id="tool-success-1",
        ),
        tool_def=None,
        args={"text": "hello"},
        result={"ok": True},
    )

    assert result == {"ok": True}
    assert "tool-success-1" not in capability._decision_by_tool_call
    assert _POST_HOOK_PAYLOADS and _POST_HOOK_PAYLOADS[-1]["status"] == "success"

    events = _read_jsonl(audit_path)
    assert any(
        e.get("event") == "tool-execution-result" and e.get("status") == "success"
        for e in events
    )


@pytest.mark.asyncio
async def test_post_tool_success_consumes_matching_approval(tmp_path: Path) -> None:
    """After execution, the same approved envelope cannot authorize another side effect."""
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-consume-success",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-consume-1",
                status="executing",
                note=None,
                execution_started_at=_now_iso(),
                execution_tool_call_id="tool-consume-1",
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id="agent-1",
                audit_log_path=str(tmp_path / "audit.jsonl"),
                tools_requiring_approval=["runtime-sensitive-echo"],
            )
        )
        capability._remember_decision(
            tool_call_id="tool-consume-1",
            decision="approval-needed",
            note="approved",
            request_payload={"tool": "runtime_sensitive_echo"},
        )

        await capability.after_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args={"text": "hello"},
                tool_call_id="tool-consume-1",
            ),
            tool_def=None,
            args={"text": "hello"},
            result={"ok": True},
        )

        async with _APPROVALS_LOCK:
            consumed = _APPROVALS["approval-consume-success"]
            assert consumed.status == "consumed"
            assert consumed.consumed_at is not None
            assert consumed.execution_status == "success"
            assert consumed.execution_ref is not None
            assert consumed.execution_ref != "tool-consume-1"

        execution_events = [
            event
            for event in _read_jsonl(tmp_path / "audit.jsonl")
            if event.get("event") == "tool-execution-result"
        ]
        assert execution_events[-1]["execution_ref"] == consumed.execution_ref

        fake_manager = _FakeManager(persist_approval=True)
        capability._manager = cast(ToolApprovalManager, fake_manager)
        args = {"text": "hello"}
        result = await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args=args,
                tool_call_id="tool-consume-2",
            ),
            tool_def=None,
            args=args,
        )

        assert result == args
        assert fake_manager.calls == [
            ("runtime_sensitive_echo", {"text": "hello"}, "tool-consume-2")
        ]
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_post_tool_hook_runs_on_error_and_clears_cache(tmp_path: Path) -> None:
    audit_path = tmp_path / "audit.jsonl"
    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="agent-1",
            audit_log_path=str(audit_path),
            tools_requiring_approval=["runtime-sensitive-echo"],
            tool_hooks={
                "on_tool_execute_error": [
                    {
                        "function": (
                            "agent_runtimes.tests.test_tools_guardrail_tool_hooks:"
                            "mock_post_capture_hook"
                        )
                    }
                ]
            },
        )
    )

    capability._remember_decision(
        tool_call_id="tool-error-1",
        decision="delegated-allow",
        note="ok",
        request_payload={"tool": "runtime_sensitive_echo"},
    )

    error = ValueError("boom")
    returned = await capability.on_tool_execute_error(
        None,
        call=ToolCallPart(
            tool_name="runtime_sensitive_echo",
            args={"text": "hello"},
            tool_call_id="tool-error-1",
        ),
        tool_def=None,
        args={"text": "hello"},
        error=error,
    )

    assert returned is error
    assert "tool-error-1" not in capability._decision_by_tool_call
    assert _POST_HOOK_PAYLOADS and _POST_HOOK_PAYLOADS[-1]["status"] == "error"

    events = _read_jsonl(audit_path)
    assert any(
        e.get("event") == "tool-execution-result" and e.get("status") == "error"
        for e in events
    )


@pytest.mark.asyncio
async def test_post_tool_error_consumes_executing_approval(tmp_path: Path) -> None:
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-consume-error",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-error-consume",
                status="executing",
                note=None,
                execution_started_at=_now_iso(),
                execution_tool_call_id="tool-error-consume",
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id="agent-1",
                audit_log_path=str(tmp_path / "audit.jsonl"),
                tools_requiring_approval=["runtime-sensitive-echo"],
            )
        )

        error = RuntimeError("execution failed")
        returned = await capability.on_tool_execute_error(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args={"text": "hello"},
                tool_call_id="tool-error-consume",
            ),
            tool_def=None,
            args={"text": "hello"},
            error=error,
        )

        assert returned is error
        async with _APPROVALS_LOCK:
            consumed = _APPROVALS["approval-consume-error"]
            assert consumed.status == "consumed"
            assert consumed.execution_status == "error"
            assert consumed.execution_ref is not None
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_terminal_transition_failure_leaves_approval_non_reusable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _reset_approvals()
    try:
        await _put_record(
            ToolApprovalRecord(
                id="approval-stuck-executing",
                agent_id="agent-1",
                runtime_name="",
                tool_name="runtime_sensitive_echo",
                tool_args={"text": "hello"},
                tool_call_id="tool-stuck",
                status="executing",
                note=None,
                execution_started_at=_now_iso(),
                execution_tool_call_id="tool-stuck",
                created_at=_now_iso(),
                updated_at=_now_iso(),
            )
        )

        async def _fail_consumption(**kwargs: Any) -> None:
            raise RuntimeError("storage unavailable")

        monkeypatch.setattr(
            "agent_runtimes.routes.tool_approvals._mark_approval_consumed",
            _fail_consumption,
        )
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id="agent-1",
                audit_log_path=str(tmp_path / "audit.jsonl"),
                tools_requiring_approval=["runtime-sensitive-echo"],
            )
        )

        await capability.after_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="runtime_sensitive_echo",
                args={"text": "hello"},
                tool_call_id="tool-stuck",
            ),
            tool_def=None,
            args={"text": "hello"},
            result={"ok": True},
        )

        async with _APPROVALS_LOCK:
            assert _APPROVALS["approval-stuck-executing"].status == "executing"
        assert "Failed to mark approval consumed" in caplog.text
    finally:
        await _reset_approvals()


@pytest.mark.asyncio
async def test_pydantic_after_and_error_hook_aliases_are_supported(
    tmp_path: Path,
) -> None:
    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="agent-1",
            audit_log_path=str(tmp_path / "audit.jsonl"),
            tools_requiring_approval=["runtime-sensitive-echo"],
            tool_hooks={
                "after_tool_execute": [
                    {
                        "function": (
                            "agent_runtimes.tests.test_tools_guardrail_tool_hooks:"
                            "mock_post_capture_hook"
                        )
                    }
                ],
                "on_tool_execute_error": [
                    {
                        "function": (
                            "agent_runtimes.tests.test_tools_guardrail_tool_hooks:"
                            "mock_post_capture_hook"
                        )
                    }
                ],
            },
        )
    )

    capability._remember_decision(
        tool_call_id="tool-alias-success",
        decision="allow",
        note="ok",
        request_payload={"tool": "runtime_sensitive_echo"},
    )

    success = await capability.after_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="runtime_sensitive_echo",
            args={"text": "hello"},
            tool_call_id="tool-alias-success",
        ),
        tool_def=None,
        args={"text": "hello"},
        result={"ok": True},
    )
    assert success == {"ok": True}

    capability._remember_decision(
        tool_call_id="tool-alias-error",
        decision="allow",
        note="ok",
        request_payload={"tool": "runtime_sensitive_echo"},
    )
    error = RuntimeError("hook alias test")
    returned_error = await capability.on_tool_execute_error(
        None,
        call=ToolCallPart(
            tool_name="runtime_sensitive_echo",
            args={"text": "hello"},
            tool_call_id="tool-alias-error",
        ),
        tool_def=None,
        args={"text": "hello"},
        error=error,
    )

    assert returned_error is error
    statuses = [item.get("status") for item in _POST_HOOK_PAYLOADS]
    assert "success" in statuses
    assert "error" in statuses
