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
    """Normalize a decision string to a standard form.

    Parameters
    ----------
    raw : Any
        The raw decision input to normalize.
    fallback : str, default "approval_needed"
        The fallback decision if normalization fails.

    Returns
    -------
    str
        The normalized decision string.
    """
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
        # URL is provided by trusted runtime config (AGENT_SUDO_AUTHZ_URL) or explicit caller argument.
        with urllib.request.urlopen(req, timeout=timeout_seconds) as response:  # nosec B310
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


def authorize_tool_call_local(
    request_payload: dict[str, Any],
    gateway: Any,
) -> dict[str, Any]:
    """In-process tool authorization gateway for local Agent_Sudo policies."""
    import json

    from agent_sudo.models import Decision

    args_dict = request_payload.get("arguments") or {}
    payload_summary = json.dumps(args_dict, sort_keys=True)
    target = request_payload.get("resource") or str(args_dict)

    # Lazily import ActionRequest to ensure agent_sudo is present
    from agent_sudo.models import ActionRequest

    request = ActionRequest(
        actor=request_payload.get("actor") or "unknown",
        source=request_payload.get("agent_id") or "default",
        tool=request_payload.get("tool") or "unknown",
        action=request_payload.get("tool") or "unknown",
        target=target,
        payload_summary=payload_summary,
        risk_hints=[request_payload.get("risk_class")]
        if request_payload.get("risk_class")
        else [],
    )

    try:
        result = gateway.evaluate(request)
    except Exception as exc:
        return {"decision": "deny", "reason": f"policy_evaluation_crashed: {exc}"}

    if result.decision == Decision.ALLOW:
        return {"decision": "allow", "reason": result.reason}
    if result.decision == Decision.DENY:
        return {"decision": "deny", "reason": result.reason}
    if result.decision in {Decision.REQUIRE_APPROVAL, Decision.REQUIRE_STRONG_APPROVAL}:
        return {"decision": "approval-needed", "reason": result.reason}

    return {"decision": "approval-needed", "reason": "unrecognized_gateway_decision"}
