# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Unit and integration tests for agent_sudo_local tool hook handler in ToolsGuardrailCapability."""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast
from unittest import mock

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.guardrails.tool_approvals import (
    ToolApprovalConfig,
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolsGuardrailCapability,
)

try:
    import agent_sudo

    has_agent_sudo = True
except ImportError:
    has_agent_sudo = False


@pytest.fixture
def temp_policy_file(tmp_path: Path) -> Path:
    """Fixture to create a temporary Agent_Sudo policy file."""
    policy_content = """
safe:
  - echo_tool
  - safe_tool
sensitive:
  - sensitive_tool
blocked:
  - blocked_tool
"""
    file_path = tmp_path / "policy.yaml"
    file_path.write_text(policy_content, encoding="utf-8")
    return file_path


class _FakeManager:
    """Fake approval manager for testing."""

    def __init__(self) -> None:
        """Initialize the fake manager."""
        self.calls: list[tuple[str, dict[str, str], str | None]] = []

    def requires_approval(self, tool_name: str) -> bool:
        """Determine if tool requires approval."""
        return tool_name == "sensitive_tool"

    async def request_and_wait(
        self,
        tool_name: str,
        safe_args: dict[str, str],
        tool_call_id: str | None,
    ) -> dict[str, Any]:
        """Request approval and wait for response."""
        self.calls.append((tool_name, safe_args, tool_call_id))
        return {"status": "approved", "id": "test-approval-id", "tool_name": tool_name}


@pytest.mark.asyncio
@pytest.mark.skipif(not has_agent_sudo, reason="requires agent-sudo package")
async def test_agent_sudo_local_allow(tmp_path: Path, temp_policy_file: Path) -> None:
    """Test that a safe tool is allowed by Agent_Sudo local gateway."""
    audit_path = tmp_path / "audit.jsonl"
    pending_path = tmp_path / "pending_approvals.json"
    delegations_path = tmp_path / "delegations.json"

    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="test-agent",
            tools_requiring_approval=["safe_tool"],
            tool_hooks={
                "before_tool_execute": [
                    {
                        "handler": "agent_sudo_local",
                        "agent_sudo_policy_path": str(temp_policy_file),
                        "agent_sudo_audit_log_path": str(audit_path),
                        "agent_sudo_delegations_file": str(delegations_path),
                        "agent_sudo_pending_approvals_file": str(pending_path),
                    }
                ]
            },
        )
    )

    args = {"text": "hello"}
    # safe_tool is listed under safe: in the policy file, so Agent_Sudo should ALLOW it.
    result = await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="safe_tool",
            args=args,
            tool_call_id="call-allow-1",
        ),
        tool_def=None,
        args=args,
    )

    assert result == args


@pytest.mark.asyncio
@pytest.mark.skipif(not has_agent_sudo, reason="requires agent-sudo package")
async def test_agent_sudo_local_deny(tmp_path: Path, temp_policy_file: Path) -> None:
    """Test that a blocked tool is denied by Agent_Sudo local gateway."""
    audit_path = tmp_path / "audit.jsonl"
    pending_path = tmp_path / "pending_approvals.json"
    delegations_path = tmp_path / "delegations.json"

    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="test-agent",
            tools_requiring_approval=["blocked_tool"],
            tool_hooks={
                "before_tool_execute": [
                    {
                        "handler": "agent_sudo_local",
                        "agent_sudo_policy_path": str(temp_policy_file),
                        "agent_sudo_audit_log_path": str(audit_path),
                        "agent_sudo_delegations_file": str(delegations_path),
                        "agent_sudo_pending_approvals_file": str(pending_path),
                    }
                ]
            },
        )
    )

    args = {"text": "harmful"}
    # blocked_tool is listed under blocked: in the policy, so Agent_Sudo should DENY it, raising ToolApprovalRejectedError.
    with pytest.raises(ToolApprovalRejectedError):
        await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="blocked_tool",
                args=args,
                tool_call_id="call-deny-1",
            ),
            tool_def=None,
            args=args,
        )


@pytest.mark.asyncio
@pytest.mark.skipif(not has_agent_sudo, reason="requires agent-sudo package")
async def test_agent_sudo_local_approval_needed(
    tmp_path: Path, temp_policy_file: Path
) -> None:
    """Test that a sensitive tool requires approval."""
    audit_path = tmp_path / "audit.jsonl"
    pending_path = tmp_path / "pending_approvals.json"
    delegations_path = tmp_path / "delegations.json"

    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="test-agent",
            tools_requiring_approval=["sensitive_tool"],
            tool_hooks={
                "before_tool_execute": [
                    {
                        "handler": "agent_sudo_local",
                        "agent_sudo_policy_path": str(temp_policy_file),
                        "agent_sudo_audit_log_path": str(audit_path),
                        "agent_sudo_delegations_file": str(delegations_path),
                        "agent_sudo_pending_approvals_file": str(pending_path),
                    }
                ]
            },
        )
    )

    # Mock the manager so we can simulate the approval flow unblocking.
    fake_manager = _FakeManager()
    capability._manager = cast(ToolApprovalManager, fake_manager)

    args = {"text": "sensitive data"}
    # sensitive_tool is listed under sensitive: in policy.
    # Agent_Sudo evaluate will return REQUIRE_APPROVAL.
    # The adapter maps REQUIRE_APPROVAL to "approval-needed" which triggers request_and_wait.
    result = await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="sensitive_tool",
            args=args,
            tool_call_id="call-approval-1",
        ),
        tool_def=None,
        args=args,
    )

    assert result == args
    assert len(fake_manager.calls) == 1
    assert fake_manager.calls[0][0] == "sensitive_tool"


@pytest.mark.asyncio
async def test_agent_sudo_local_missing_package_error(tmp_path: Path) -> None:
    """Test that missing agent-sudo package raises ImportError when configured."""
    # Temporarily hide agent_sudo package to simulate it not being installed.
    with mock.patch.dict("sys.modules", {"agent_sudo": None}):
        with pytest.raises(
            ImportError, match="The 'agent-sudo' package is required but not installed"
        ):
            ToolsGuardrailCapability(
                config=ToolApprovalConfig(
                    agent_id="test-agent",
                    tool_hooks={
                        "before_tool_execute": [
                            {
                                "handler": "agent_sudo_local",
                            }
                        ]
                    },
                )
            )


@pytest.mark.asyncio
@pytest.mark.skipif(not has_agent_sudo, reason="requires agent-sudo package")
async def test_agent_sudo_local_policy_crash_fail_closed(
    tmp_path: Path, temp_policy_file: Path
) -> None:
    """Test that policy gateway crashes result in fail-closed behavior."""
    audit_path = tmp_path / "audit.jsonl"
    pending_path = tmp_path / "pending_approvals.json"
    delegations_path = tmp_path / "delegations.json"

    capability = ToolsGuardrailCapability(
        config=ToolApprovalConfig(
            agent_id="test-agent",
            tools_requiring_approval=["safe_tool"],
            tool_hooks={
                "before_tool_execute": [
                    {
                        "handler": "agent_sudo_local",
                        "agent_sudo_policy_path": str(temp_policy_file),
                        "agent_sudo_audit_log_path": str(audit_path),
                        "agent_sudo_delegations_file": str(delegations_path),
                        "agent_sudo_pending_approvals_file": str(pending_path),
                    }
                ]
            },
        )
    )

    args = {"text": "hello"}

    # Mock gateway evaluate to throw an exception to simulate a crash
    class MockGateway:
        """Mock gateway that crashes on evaluate."""

        def evaluate(self, request: Any) -> Any:
            """Simulate a crash during evaluation."""
            raise RuntimeError("Corrupt policy database")

    # Manually assign mock gateway
    capability._sudo_gateway = MockGateway()

    # The crash must result in a DENY (fail-closed), raising ToolApprovalRejectedError with crash reason
    with pytest.raises(
        ToolApprovalRejectedError,
        match="policy_evaluation_crashed: Corrupt policy database",
    ):
        await capability.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="safe_tool",
                args=args,
                tool_call_id="call-crash-1",
            ),
            tool_def=None,
            args=args,
        )
