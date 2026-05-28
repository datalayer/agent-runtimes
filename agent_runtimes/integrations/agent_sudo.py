# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent_Sudo integration helpers.

This module exposes a simple function hook callable from tool_hooks:

function: agent_runtimes.integrations.agent_sudo:authorize_tool_call
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def _normalize_decision(raw: Any, fallback: str = "approval_needed") -> str:
    if not isinstance(raw, str):
        return fallback
    value = raw.strip().lower()
    if value in {"allow", "deny", "approval_required", "delegated_allow"}:
        return value
    if value in {"approval-needed", "approval_needed"}:
        return "approval_required"
    if value in {"delegated-allow", "delegated_allow"}:
        return "delegated_allow"
    return fallback


def authorize_tool_call(
    request_payload: dict[str, Any],
    *,
    endpoint: str | None = None,
    timeout_seconds: float = 5.0,
    fallback_decision: str = "approval_required",
) -> dict[str, Any]:
    """Authorize a tool call via Agent_Sudo-compatible endpoint.

    Returns a dict with decision in:
    - allow
    - deny
    - approval_required
    - delegated_allow
    """

    target = endpoint or os.environ.get("AGENT_SUDO_AUTHZ_URL")
    if not target:
        return {
            "decision": _normalize_decision(fallback_decision, "approval_required"),
            "reason": "agent_sudo_endpoint_not_configured",
        }

    body = json.dumps(request_payload).encode("utf-8")
    req = urllib.request.Request(
        target,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        return {
            "decision": _normalize_decision(fallback_decision, "approval_required"),
            "reason": f"agent_sudo_http_error:{exc.code}",
        }
    except Exception as exc:  # pragma: no cover - defensive fallback
        return {
            "decision": _normalize_decision(fallback_decision, "approval_required"),
            "reason": f"agent_sudo_error:{type(exc).__name__}",
        }

    decision = _normalize_decision(
        payload.get("decision") or payload.get("action"),
        _normalize_decision(fallback_decision, "approval_required"),
    )

    result: dict[str, Any] = {
        "decision": decision,
        "reason": payload.get("reason") or payload.get("message"),
    }

    if "delegation" in payload:
        result["delegation"] = payload.get("delegation")

    if "risk_class" in payload:
        result["risk_class"] = payload.get("risk_class")

    return result
