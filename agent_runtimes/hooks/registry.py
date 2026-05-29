# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Hook registration from agentspec config and built-in handlers."""

from __future__ import annotations

import logging
import re
from typing import Any, Awaitable, Callable

from .base import HookEvent, HookInput, HookResult
from .middleware import HookRegistration, HooksMiddleware

logger = logging.getLogger(__name__)

# Type alias
HookHandler = Callable[[HookInput], Awaitable[HookResult]]

# Global registry of named handlers
_HANDLER_REGISTRY: dict[str, HookHandler] = {}


def register_handler(name: str, handler: HookHandler) -> None:
    """Register a named handler in the global registry.

    Named handlers can be referenced in agentspec YAML::

        hooks:
          - event: pre_tool_use
            handler: security_check  # ← references this name
    """
    _HANDLER_REGISTRY[name] = handler
    logger.debug("Registered hook handler: %s", name)


def get_handler(name: str) -> HookHandler | None:
    """Look up a named handler."""
    return _HANDLER_REGISTRY.get(name)


# ---- Built-in handlers ----


async def _audit_log_handler(hook_input: HookInput) -> HookResult:
    """Built-in handler: log tool calls for audit."""
    logger.info(
        "AUDIT [%s] agent=%s tool=%s args=%s result_len=%s",
        hook_input.event.value,
        hook_input.agent_id or "?",
        hook_input.tool_name,
        list(hook_input.tool_args.keys()) if hook_input.tool_args else "{}",
        len(hook_input.tool_result) if hook_input.tool_result else 0,
    )
    return HookResult(allow=True)


async def _security_check_handler(hook_input: HookInput) -> HookResult:
    """Built-in handler: basic security screening for tool arguments.

    Blocks tool calls containing shell injection patterns in arguments.
    """
    if hook_input.event != HookEvent.PRE_TOOL_USE:
        return HookResult(allow=True)

    dangerous_patterns = [
        r";\s*(rm|dd|mkfs|shutdown|reboot)\b",
        r"\|.*\b(bash|sh|zsh)\b",
        r"\$\(.*\)",  # Command substitution
        r"`.*`",  # Backtick command substitution
    ]
    args_str = str(hook_input.tool_args)
    for pattern in dangerous_patterns:
        if re.search(pattern, args_str, re.IGNORECASE):
            return HookResult(
                allow=False,
                reason=f"Security check blocked: suspicious pattern in tool arguments (matched: {pattern})",
            )
    return HookResult(allow=True)


_AGENT_SUDO_LOCK = None
_AGENT_SUDO_GATEWAY = None


async def _agent_sudo_local_handler(hook_input: HookInput) -> HookResult:
    """Built-in handler: in-process Agent_Sudo local policy check."""
    global _AGENT_SUDO_LOCK, _AGENT_SUDO_GATEWAY

    try:
        import agent_sudo  # noqa: F401
    except ImportError as exc:
        raise ImportError(
            "The 'agent-sudo' package is required but not installed because "
            "'agent_sudo_local' handler is configured."
        ) from exc

    if _AGENT_SUDO_LOCK is None:
        import asyncio

        _AGENT_SUDO_LOCK = asyncio.Lock()

    # Map hook_input to authorize_tool_call_local payload shape
    payload = {
        "actor": hook_input.user_id or "unknown",
        "agent_id": hook_input.agent_id or "default",
        "tool": hook_input.tool_name,
        "arguments": hook_input.tool_args,
        "resource": hook_input.tool_args.get("resource")
        or hook_input.tool_args.get("path")
        or f"tool://{hook_input.tool_name}",
        "risk_class": "medium",  # default
    }

    async with _AGENT_SUDO_LOCK:
        if _AGENT_SUDO_GATEWAY is None:
            import os
            from pathlib import Path

            from agent_sudo.approvals import ApprovalProvider
            from agent_sudo.audit import AuditLogger
            from agent_sudo.delegations import DelegationStore
            from agent_sudo.gateway import PermissionGateway
            from agent_sudo.pending_approvals import PendingApprovalStore
            from agent_sudo.policy import load_default_policy, load_policy

            policy_path = os.environ.get("AGENT_SUDO_POLICY_PATH")
            policy = (
                load_policy(Path(policy_path)) if policy_path else load_default_policy()
            )

            audit_log_path = os.environ.get("AGENT_SUDO_AUDIT_LOG_PATH")
            audit_logger = (
                AuditLogger(Path(audit_log_path))
                if audit_log_path
                else AuditLogger(Path(".agent-sudo/audit.jsonl"))
            )

            delegations_file = os.environ.get("AGENT_SUDO_DELEGATIONS_FILE")
            delegation_store = (
                DelegationStore(Path(delegations_file))
                if delegations_file
                else DelegationStore()
            )

            pending_approvals_file = os.environ.get("AGENT_SUDO_PENDING_APPROVALS_FILE")
            if pending_approvals_file:
                pending_approval_store = PendingApprovalStore(
                    Path(pending_approvals_file), audit_logger=audit_logger
                )
            else:
                pending_approval_store = PendingApprovalStore(audit_logger=audit_logger)

            approvals = ApprovalProvider(stdin_is_tty=lambda: False)
            _AGENT_SUDO_GATEWAY = PermissionGateway(
                policy=policy,
                approvals=approvals,
                audit_logger=audit_logger,
                delegation_store=delegation_store,
                pending_approval_store=pending_approval_store,
            )

        import asyncio

        from agent_runtimes.plugins.agent_sudo import authorize_tool_call_local

        try:
            res = await asyncio.wait_for(
                asyncio.to_thread(
                    authorize_tool_call_local, payload, _AGENT_SUDO_GATEWAY
                ),
                timeout=5.0,
            )
        except Exception as exc:
            res = {"decision": "deny", "reason": f"policy_evaluation_crashed: {exc}"}

    decision = res.get("decision", "deny")
    reason = res.get("reason", "unknown")
    if decision == "allow":
        return HookResult(allow=True, reason=reason)
    elif decision == "deny":
        return HookResult(allow=False, reason=reason)
    else:
        return HookResult(allow=False, reason=f"approval-needed: {reason}")


# Register built-in handlers
register_handler("audit_log", _audit_log_handler)
register_handler("security_check", _security_check_handler)

try:
    import agent_sudo  # noqa: F401

    _has_agent_sudo = True
except ImportError:
    _has_agent_sudo = False

if _has_agent_sudo:
    register_handler("agent_sudo_local", _agent_sudo_local_handler)


def build_hooks_middleware(spec_hooks: list[dict[str, Any]] | None) -> HooksMiddleware:
    """Build a HooksMiddleware from agentspec ``hooks`` config.

    Example spec_hooks::

        [
            {
                "event": "pre_tool_use",
                "matcher": "execute|write_file",
                "handler": "security_check",
                "timeout": 30,
            },
            {
                "event": "post_tool_use",
                "matcher": ".*",
                "handler": "audit_log",
                "background": true,
            },
        ]
    """
    middleware = HooksMiddleware()

    if not spec_hooks:
        return middleware

    for hook_spec in spec_hooks:
        event_str = hook_spec.get("event", "")
        try:
            event = HookEvent(event_str)
        except ValueError:
            logger.warning("Unknown hook event: %s — skipping", event_str)
            continue

        matcher_str = hook_spec.get("matcher", ".*")
        try:
            matcher = re.compile(matcher_str)
        except re.error:
            logger.warning("Invalid hook matcher regex: %s — skipping", matcher_str)
            continue

        handler_name = hook_spec.get("handler", "")
        handler = get_handler(handler_name)
        if handler is None:
            logger.warning(
                "Unknown hook handler: '%s' — skipping (registered: %s)",
                handler_name,
                list(_HANDLER_REGISTRY.keys()),
            )
            continue

        registration = HookRegistration(
            event=event,
            matcher=matcher,
            handler=handler,
            timeout=float(hook_spec.get("timeout", 30)),
            background=bool(hook_spec.get("background", False)),
            name=f"{handler_name}@{event_str}",
        )
        middleware.register(registration)

    return middleware
