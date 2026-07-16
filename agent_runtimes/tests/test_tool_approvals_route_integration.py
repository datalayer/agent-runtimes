# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Route-level integration test for the tool-approval consumption lifecycle.

Exercises the API-layer path end to end, with no external inference:

    create -> approve -> reserve (approved -> executing)
    -> tool stub returns "hello (reason: audit)"
    -> a ``tool-execution:<uuid>`` receipt is persisted
    -> the envelope reaches terminal ``consumed``
    -> the same envelope cannot authorize a second side effect.

The create/approve/reserve steps go through the ``routes.tool_approvals``
entry points (``_create_approval``, the websocket decision helper
``_decide_approval_via_ws`` -> ``_update_approval``, and
``_mark_approval_executing``); the receipt + consume step goes through the
guardrail's real ``after_tool_execute`` hook. No model is called, so the test
is independent of any inference provider or quota.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.guardrails.tool_approvals import (
    ToolApprovalConfig,
    ToolsGuardrailCapability,
)
from agent_runtimes.routes.tool_approvals import (
    _APPROVALS,
    _APPROVALS_LOCK,
    ToolApprovalCreateRequest,
    _create_approval,
    _decide_approval_via_ws,
    _mark_approval_consumed,
    _mark_approval_executing,
)

_AGENT_ID = "agent-1"
_TOOL = "runtime_sensitive_echo"
_TOOL_CALL_ID = "tool-route-1"
_ARGS = {"text": "hello", "reason": "audit"}
_STUB_RESULT = "hello (reason: audit)"


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


async def _reset_approvals() -> None:
    async with _APPROVALS_LOCK:
        _APPROVALS.clear()


@pytest.mark.asyncio
async def test_route_level_approve_execute_consume_persists_receipt(
    tmp_path: Path,
) -> None:
    """Full API-layer path: approve -> executing -> consumed + receipt, and a
    consumed envelope can no longer authorize a side effect. No inference."""
    await _reset_approvals()
    try:
        audit_path = tmp_path / "audit.jsonl"

        # 1. Create the pending approval through the route entry point.
        created = await _create_approval(
            ToolApprovalCreateRequest(
                agent_id=_AGENT_ID,
                tool_name=_TOOL,
                tool_args=_ARGS,
                tool_call_id=_TOOL_CALL_ID,
            )
        )
        assert created.status == "pending"

        # 2. Approve it through the websocket decision entry point (which calls
        #    ``_update_approval``). No JWT credentials are registered, so no
        #    relay/inference is attempted.
        approved = await _decide_approval_via_ws(
            created.id, approved=True, note="approved"
        )
        assert approved.status == "approved"

        # 3. Reserve the approved envelope (approved -> executing) atomically,
        #    the write-ahead step that precedes any side effect.
        reserved = await _mark_approval_executing(
            created.id,
            agent_id=_AGENT_ID,
            tool_name=_TOOL,
            tool_args=_ARGS,
            execution_tool_call_id=_TOOL_CALL_ID,
        )
        assert reserved is not None
        assert reserved.status == "executing"

        # 4. The tool runs and the stub returns the echoed value. Drive the
        #    guardrail's real post-execution hook, which writes the
        #    ``tool-execution:<uuid>`` receipt and marks the envelope consumed.
        capability = ToolsGuardrailCapability(
            config=ToolApprovalConfig(
                agent_id=_AGENT_ID,
                audit_log_path=str(audit_path),
                tools_requiring_approval=["runtime-sensitive-echo"],
            )
        )
        capability._remember_decision(
            tool_call_id=_TOOL_CALL_ID,
            decision="approval-needed",
            note="approved",
            request_payload={"tool": _TOOL},
        )
        returned = await capability.after_tool_execute(
            None,
            call=ToolCallPart(
                tool_name=_TOOL,
                args=_ARGS,
                tool_call_id=_TOOL_CALL_ID,
            ),
            tool_def=None,
            args=_ARGS,
            result=_STUB_RESULT,
        )
        assert returned == _STUB_RESULT

        # 5. Terminal state: consumed, with the execution receipt linked.
        async with _APPROVALS_LOCK:
            record = _APPROVALS[created.id]
            assert record.status == "consumed"
            assert record.consumed_at is not None
            assert record.execution_status == "success"
            assert record.execution_ref is not None
            assert record.execution_ref.startswith("tool-execution:")
            consumed_ref = record.execution_ref

        # 6. The receipt is durably persisted, is the one linked on the consumed
        #    envelope, and captured the stub's returned value.
        receipts = [
            event
            for event in _read_jsonl(audit_path)
            if event.get("event") == "tool-execution-result"
        ]
        assert receipts, "expected a persisted tool-execution receipt"
        assert receipts[-1]["execution_ref"] == consumed_ref
        assert receipts[-1]["execution_ref"].startswith("tool-execution:")
        assert receipts[-1]["status"] == "success"
        assert _STUB_RESULT in receipts[-1]["result"]

        # 7. The same envelope cannot authorize a second side effect: a consumed
        #    record can be neither re-reserved for execution nor consumed again.
        second_reserve = await _mark_approval_executing(
            created.id,
            agent_id=_AGENT_ID,
            tool_name=_TOOL,
            tool_args=_ARGS,
            execution_tool_call_id="tool-route-2",
        )
        assert second_reserve is None

        second_consume = await _mark_approval_consumed(
            agent_id=_AGENT_ID,
            tool_name=_TOOL,
            tool_args=_ARGS,
            tool_call_id=_TOOL_CALL_ID,
            execution_status="success",
            execution_ref="tool-execution:must-not-apply",
        )
        assert second_consume is None

        async with _APPROVALS_LOCK:
            final = _APPROVALS[created.id]
            assert final.status == "consumed"
            assert final.execution_ref == consumed_ref
    finally:
        await _reset_approvals()
