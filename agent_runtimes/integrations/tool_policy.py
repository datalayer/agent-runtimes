# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local hook policy helpers for tool-call authorization demos."""

from __future__ import annotations

from typing import Any


def evaluate_tool_request(request_payload: dict[str, Any]) -> dict[str, Any]:
    """Simple built-in authorization policy for demo hook flows.

    Rules:
    - deny when the reason suggests destructive intent
    - delegated_allow for low-risk requests
    - approval_required otherwise
    """

    args = request_payload.get("arguments")
    reason = ""
    if isinstance(args, dict):
        reason = str(args.get("reason", "")).lower()

    if "delete" in reason or "drop" in reason or "destroy" in reason:
        return {
            "decision": "deny",
            "reason": "blocked_by_builtin_policy_destructive_reason",
        }

    if request_payload.get("risk_class") == "low":
        return {
            "decision": "delegated_allow",
            "reason": "builtin_policy_delegated_allow_low_risk",
        }

    return {
        "decision": "approval_required",
        "reason": "builtin_policy_requires_human_approval",
    }
