# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Unit tests for tool hook behavior in ToolsGuardrailCapability."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.guardrails.tool_approvals import (
    ToolApprovalConfig,
    ToolApprovalRejectedError,
    ToolsGuardrailCapability,
)

_POST_HOOK_PAYLOADS: list[dict[str, Any]] = []


def mock_pre_allow_hook(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    return {"decision": "allow", "reason": "allowed by test hook"}


def mock_post_capture_hook(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
    _POST_HOOK_PAYLOADS.append(dict(payload))
    return {"ok": True}


class _FakeManager:
    def __init__(self, requires_approval: bool = True):
        self._requires_approval = requires_approval
        self.calls: list[tuple[str, dict[str, str], str | None]] = []

    def requires_approval(self, tool_name: str) -> bool:
        return self._requires_approval and tool_name == "runtime_sensitive_echo"

    async def request_and_wait(
        self,
        tool_name: str,
        safe_args: dict[str, str],
        tool_call_id: str | None,
    ) -> None:
        self.calls.append((tool_name, safe_args, tool_call_id))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        rows.append(json.loads(line))
    return rows


@pytest.fixture(autouse=True)
def _reset_post_hook_payloads() -> None:
    _POST_HOOK_PAYLOADS.clear()


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
    capability._manager = fake_manager

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
    capability._manager = fake_manager

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
    fake_manager = _FakeManager()
    capability._manager = fake_manager

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
    capability._manager = fake_manager

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
