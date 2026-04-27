# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Capability-native async tool approval flow.

When an AgentSpec marks tools as requiring human approval, this module
provides:

1. ``ToolApprovalConfig`` — configuration for the approval flow.
2. ``ToolApprovalManager`` — manages approval records locally and waits for
   human decisions via asyncio.Event (in-process signaling over WebSocket).
3. ``ToolsGuardrailCapability`` — a pydantic-ai ``AbstractCapability`` that
   intercepts tool calls needing approval via ``before_tool_execute``.
"""

from __future__ import annotations

import asyncio
import json as json_mod
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from pydantic_ai import DeferredToolRequests, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import DeferredToolResults, ToolDefinition, ToolDenied

from .common import GuardrailBlockedError

logger = logging.getLogger(__name__)


def _normalize_tool_args_for_match(raw_args: Any) -> dict[str, str]:
    """Normalize tool arguments into a stable dict[str, str] shape.

    Deferred tool call args can arrive as a dict or as a JSON string depending
    on transport/protocol framing. This helper keeps matching logic resilient.
    """
    parsed_args = raw_args
    if isinstance(raw_args, str):
        try:
            parsed_args = json_mod.loads(raw_args)
        except Exception:
            parsed_args = {}

    if not isinstance(parsed_args, dict):
        return {}

    normalized: dict[str, str] = {}
    for k, v in parsed_args.items():
        try:
            normalized[str(k)] = str(v)[:500]
        except Exception:
            normalized[str(k)] = "<non-serializable>"
    return normalized


def _parse_timeout_hms(value: Any, *, default: float) -> float:
    """Parse timeout values from duration format into seconds.

    Accepts:
    - float/int seconds
    - string durations with optional month/day/hour/minute/second tokens
        (e.g. 1mo2d3h4m5s, 2d6h, 0h5m0s)

    Notes:
    - "mo" means months (treated as 30 days)
    - "m" means minutes
    """
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return default
        token_pattern = re.compile(r"(?i)(\d+)(mo|d|h|m|s)")
        pos = 0
        totals = {"mo": 0, "d": 0, "h": 0, "m": 0, "s": 0}
        for match in token_pattern.finditer(raw):
            if match.start() != pos:
                break
            amount = int(match.group(1))
            unit = match.group(2).lower()
            totals[unit] += amount
            pos = match.end()
        if pos == len(raw) and any(totals.values()):
            months = totals["mo"]
            days = totals["d"]
            hours = totals["h"]
            minutes = totals["m"]
            seconds = totals["s"]
            return float(
                months * 30 * 86400
                + days * 86400
                + hours * 3600
                + minutes * 60
                + seconds
            )
    raise ValueError(
        f"Invalid timeout '{value}'. Expected duration format like '0h5m0s', '2d6h', or '1mo2d3h4m5s', or numeric seconds."
    )


# ============================================================================
# Configuration
# ============================================================================


@dataclass
class ToolApprovalConfig:
    """Configuration for the tool-approval flow."""

    agent_id: str = "default"
    pod_name: str = ""
    tools_requiring_approval: list[str] = field(default_factory=list)
    timeout: float = 300.0
    # JWT token used to authenticate requests to the datalayer-ai-agents backend
    # so that newly-created approvals are broadcast to remote UI panels.
    user_jwt_token: str | None = field(default=None)

    @classmethod
    def from_env(cls) -> ToolApprovalConfig:
        import os

        pod_name = (
            os.environ.get("POD_NAME")
            or os.environ.get("DATALAYER_RUNTIME_ID")
            or os.environ.get("HOSTNAME")
            or ""
        )

        return cls(
            agent_id=os.environ.get("AGENT_ID", "default"),
            pod_name=pod_name,
            # DATALAYER_USER_TOKEN is populated by the configure-from-spec endpoint
            # so that the approval manager can authenticate against ai-agents.
            user_jwt_token=os.environ.get("DATALAYER_USER_TOKEN") or None,
        )

    @classmethod
    def from_spec(cls, spec_config: dict) -> ToolApprovalConfig:
        """Build from AgentSpec configuration.

        Expected structure::

            tool_approval:
              tools:
                - "deploy.*"
                - "send_email"
                - "write_file"
              timeout: 300
        """
        base = cls.from_env()
        base.tools_requiring_approval = spec_config.get("tools", [])
        base.timeout = _parse_timeout_hms(spec_config.get("timeout"), default=300.0)
        return base


# ============================================================================
# Exceptions
# ============================================================================


class ToolApprovalTimeoutError(GuardrailBlockedError):
    """Raised when the approval request times out."""


class ToolApprovalRejectedError(GuardrailBlockedError):
    """Raised when the tool call is rejected by the human."""

    def __init__(self, tool_name: str, note: str | None = None):
        self.tool_name = tool_name
        self.note = note
        msg = f"Tool '{tool_name}' was rejected by human reviewer"
        if note:
            msg += f": {note}"
        super().__init__(msg)


# ============================================================================
# Approval Manager
# ============================================================================


class ToolApprovalManager:
    """Manages tool approval requests using in-process asyncio.Event signaling.

    When a tool call needs approval, an approval record is created in the
    local in-memory store (visible to WebSocket clients via snapshots).
    The manager then blocks on an asyncio.Event until a WebSocket
    ``tool_approval_decision`` message signals a decision.  No HTTP polling
    is required — the event is signaled entirely in-process.
    """

    def __init__(self, config: ToolApprovalConfig):
        self.config = config

    async def close(self) -> None:
        """Compatibility no-op for adapter cleanup paths.

        Some adapter flows call ``await approval_manager.close()`` after
        approval rounds. This manager currently owns no external resources,
        so shutdown is intentionally a no-op.
        """
        return None

    def requires_approval(self, tool_name: str) -> bool:
        """Check whether a tool requires human approval."""
        tool_name_variants = {
            tool_name,
            tool_name.replace("-", "_"),
            tool_name.replace("_", "-"),
        }
        for pattern in self.config.tools_requiring_approval:
            if any(
                re.search(pattern, variant, re.IGNORECASE)
                for variant in tool_name_variants
            ):
                return True
        return False

    async def request_and_wait(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        tool_call_id: str | None = None,
    ) -> dict[str, Any]:
        """Create a local approval record and block until a decision arrives.

        The decision is delivered by ``signal_approval_event`` which is called
        from the WebSocket stream loop when a ``tool_approval_decision`` message
        is received from the frontend.
        """
        from agent_runtimes.routes.tool_approvals import (
            _APPROVALS,
            _APPROVALS_LOCK,
            ToolApprovalCreateRequest,
            _create_approval,
            forward_approval_to_ai_agents,
            register_approval_credentials,
            register_pending_approval_event,
            register_remote_approval_mapping,
            remove_pending_approval_event,
        )

        # Dedup against any recently-approved record for the same tool BEFORE
        # creating a new approval. This catches the case where multiple
        # capabilities (e.g. ToolsGuardrailCapability + MCPToolsGuardrailCapability)
        # both intercept the same tool call and would otherwise each create
        # an independent approval record causing the user to approve twice.
        recent_window_seconds = 120.0
        now = datetime.now(timezone.utc)
        async with _APPROVALS_LOCK:
            for approval in _APPROVALS.values():
                if approval.status != "approved":
                    continue
                if approval.tool_name != tool_name:
                    continue
                if tool_call_id and approval.tool_call_id == tool_call_id:
                    logger.info(
                        "[tool-approval:request_and_wait] Tool '%s' already approved "
                        "(approval_id=%s, tool_call_id=%s) — skipping",
                        tool_name,
                        approval.id,
                        tool_call_id,
                    )
                    return {
                        "status": "approved",
                        "id": approval.id,
                        "tool_name": tool_name,
                    }
                try:
                    ts = datetime.fromisoformat(
                        approval.updated_at.replace("Z", "+00:00")
                    )
                    age = (now - ts).total_seconds()
                except Exception:
                    age = 0.0
                if 0 <= age <= recent_window_seconds:
                    logger.info(
                        "[tool-approval:request_and_wait] Tool '%s' already approved "
                        "recently (approval_id=%s, age=%.2fs) — skipping",
                        tool_name,
                        approval.id,
                        age,
                    )
                    return {
                        "status": "approved",
                        "id": approval.id,
                        "tool_name": tool_name,
                    }

        req = ToolApprovalCreateRequest(
            agent_id=self.config.agent_id,
            pod_name=self.config.pod_name,
            tool_name=tool_name,
            tool_args=tool_args,
            tool_call_id=tool_call_id,
        )
        record = await _create_approval(req)
        approval_id = record.id

        # Fast-path: if the record was already decided (e.g. continuation turn
        # returned an existing approved/rejected record), skip the wait.
        if record.status == "approved":
            logger.info(
                "Tool '%s' already approved (approval_id=%s) — skipping wait",
                tool_name,
                approval_id,
            )
            return {"status": "approved", "id": approval_id, "tool_name": tool_name}
        if record.status == "rejected":
            logger.info(
                "Tool '%s' already rejected (approval_id=%s) — skipping wait",
                tool_name,
                approval_id,
            )
            raise ToolApprovalRejectedError(tool_name, record.note)

        # Register waiter first so any mirrored decision can immediately unblock.
        event, result = register_pending_approval_event(approval_id)

        # Resolve the user JWT token: prefer per-request context (set by transports
        # like vercel_ai/agui/acp) and fall back to the static config token loaded
        # from env. This ensures MCP and skill capabilities — which build their own
        # ToolApprovalManager via ToolApprovalConfig.from_env() and would otherwise
        # have no token — still forward approvals to the ai-agents backend so the
        # SaaS UI sees them.
        try:
            from ..context.identities import get_request_user_jwt

            request_jwt = get_request_user_jwt()
        except Exception:
            request_jwt = None
        effective_user_jwt = request_jwt or self.config.user_jwt_token

        remote_approval_id: str | None = None
        if effective_user_jwt:
            # Always remember the JWT so that even if the upfront forward
            # fails or ai-agents is momentarily unavailable, the eventual
            # decision can still be relayed (lazily forwarding on decision
            # if needed) so all observers see the outcome.
            register_approval_credentials(approval_id, effective_user_jwt)
            # Sync creation to ai-agents first so we can correlate future decisions
            # by its remote approval id even when tool_call_id is missing.
            remote_approval_id = await forward_approval_to_ai_agents(
                record, effective_user_jwt
            )
            if remote_approval_id:
                # Store the local→remote mapping so that a WS decision arriving
                # on the runtime-local socket is relayed back to the ai-agents
                # backend and becomes visible in the main UI tool-approvals view.
                register_remote_approval_mapping(
                    approval_id, remote_approval_id, effective_user_jwt
                )

        logger.info(
            "Waiting for human approval of tool '%s' (approval_id=%s, timeout=%ss)",
            tool_name,
            approval_id,
            self.config.timeout,
        )
        try:
            await asyncio.wait_for(event.wait(), timeout=self.config.timeout)
        except asyncio.TimeoutError:
            raise ToolApprovalTimeoutError(
                f"Approval for tool '{tool_name}' timed out after {self.config.timeout}s"
            )
        finally:
            remove_pending_approval_event(approval_id)

        if result.get("approved"):
            logger.info("Tool '%s' approved (approval_id=%s)", tool_name, approval_id)
            return {"status": "approved", "id": approval_id, "tool_name": tool_name}

        note = result.get("note")
        logger.info(
            "Tool '%s' rejected (approval_id=%s, note=%s)",
            tool_name,
            approval_id,
            note,
        )
        raise ToolApprovalRejectedError(tool_name, note)


# ============================================================================
# Capability
# ============================================================================


@dataclass
class ToolsGuardrailCapability(AbstractCapability[Any]):
    """Capability that gates tool execution behind async human approval.

    When a tool requires approval, an in-memory approval record is created and
    broadcast to WebSocket clients via snapshot.  Execution is suspended on an
    asyncio.Event until the frontend sends a ``tool_approval_decision`` message,
    which signals the event and resumes (or rejects) the tool call.
    """

    config: ToolApprovalConfig = field(default_factory=ToolApprovalConfig)
    _manager: ToolApprovalManager | None = field(default=None, init=False, repr=False)

    def _get_manager(self) -> ToolApprovalManager:
        if self._manager is None:
            self._manager = ToolApprovalManager(self.config)
        return self._manager

    async def handle_deferred_tool_calls(
        self,
        ctx: RunContext[Any],
        *,
        requests: DeferredToolRequests,
    ) -> DeferredToolResults | None:
        """Inline-handle deferred approvals that already have a local decision.

        This lets pydantic-ai continue the run in a single call when the
        corresponding approval was already approved/rejected (e.g. from a recent
        turn or a mirrored WS decision), while unresolved approvals still bubble
        out as DeferredToolRequests for the stop-the-world flow.
        """
        if not requests.approvals:
            return None

        manager = self._get_manager()
        approvals: dict[str, bool | ToolDenied] = {}
        now = datetime.now(timezone.utc)
        recent_window_seconds = 120.0

        from agent_runtimes.routes.tool_approvals import (
            _APPROVALS,
            _APPROVALS_LOCK,
        )

        async with _APPROVALS_LOCK:
            records = list(_APPROVALS.values())

        for call in requests.approvals:
            if not manager.requires_approval(call.tool_name):
                continue

            call_tool_id = getattr(call, "tool_call_id", None)
            call_safe_args = _normalize_tool_args_for_match(getattr(call, "args", {}))

            matched = None

            # Strong match: same tool_call_id (+ same tool name when present).
            if call_tool_id:
                for approval in records:
                    if approval.status in {"deleted", "pending"}:
                        continue
                    if approval.tool_call_id != call_tool_id:
                        continue
                    if approval.tool_name != call.tool_name:
                        continue
                    matched = approval
                    break

            # Fallback: recent approved/rejected decision for same tool name.
            if matched is None:
                for approval in records:
                    if approval.status not in {"approved", "rejected"}:
                        continue
                    if approval.tool_name != call.tool_name:
                        continue
                    if approval.tool_args != call_safe_args:
                        continue
                    try:
                        ts = datetime.fromisoformat(
                            approval.updated_at.replace("Z", "+00:00")
                        )
                        age_seconds = (now - ts).total_seconds()
                    except Exception:
                        age_seconds = 0.0
                    if 0 <= age_seconds <= recent_window_seconds:
                        matched = approval
                        break

            if matched is None:
                continue

            # pydantic-ai result maps are keyed by tool_call_id.
            if not call_tool_id:
                continue

            if matched.status == "approved":
                approvals[call_tool_id] = True
            elif matched.status == "rejected":
                approvals[call_tool_id] = ToolDenied(
                    matched.note or "Tool call denied by reviewer"
                )

        if not approvals:
            return None

        if hasattr(requests, "build_results"):
            return requests.build_results(approvals=approvals)

        return DeferredToolResults(approvals=approvals)

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        manager = self._get_manager()
        if not manager.requires_approval(call.tool_name):
            return args

        # If this tool call was already approved (DeferredToolRequests continuation),
        # skip the approval gate so the tool executes without creating a new record.
        #
        # In some continuation paths, pydantic-ai can re-emit the same logical
        # approval turn with a different tool_call_id. To avoid duplicate prompts,
        # we also allow a narrow fallback: same tool_name + same safe_args that
        # was approved very recently.
        tool_call_id = getattr(call, "tool_call_id", None)
        from agent_runtimes.routes.tool_approvals import (
            _APPROVALS,
            _APPROVALS_LOCK,
        )

        safe_args: dict[str, str] = {}
        for k, v in args.items():
            try:
                safe_args[k] = str(v)[:500]
            except Exception:
                safe_args[k] = "<non-serializable>"

        recent_window_seconds = 120.0
        now = datetime.now(timezone.utc)

        logger.info(
            "[tool-approval] before_tool_execute entered tool='%s' "
            "tool_call_id=%s (checking dedupe against %d existing records)",
            call.tool_name,
            tool_call_id,
            len(_APPROVALS),
        )

        async with _APPROVALS_LOCK:
            for approval in _APPROVALS.values():
                # Log every candidate for diagnostics
                logger.info(
                    "[tool-approval:dedup-scan] candidate id=%s tool_name=%s "
                    "status=%s tool_call_id=%s updated_at=%s",
                    approval.id,
                    approval.tool_name,
                    approval.status,
                    approval.tool_call_id,
                    approval.updated_at,
                )

                if approval.status not in ("approved", "pending"):
                    # Skip rejected/deleted
                    continue

                if tool_call_id and approval.tool_call_id == tool_call_id:
                    if approval.status == "approved":
                        logger.info(
                            "Tool '%s' already approved via deferred continuation "
                            "(approval_id=%s, tool_call_id=%s) — skipping re-approval",
                            call.tool_name,
                            approval.id,
                            tool_call_id,
                        )
                        return args
                    # tool_call_id matches but still pending — this is the
                    # original outstanding approval for this very call. Bail
                    # out of the loop and go wait on it rather than creating
                    # a new duplicate record.
                    logger.info(
                        "Tool '%s' has a pending approval already "
                        "(approval_id=%s, tool_call_id=%s) — waiting on existing",
                        call.tool_name,
                        approval.id,
                        tool_call_id,
                    )
                    break

                if approval.status != "approved":
                    continue

                # Fallback dedupe for continuation turns where tool_call_id is
                # regenerated by the framework.  Match by tool_name + recent
                # time window only — args comparison is unreliable because the
                # stored record has stringified values and the continuation may
                # have different formatting or extra keys.
                if approval.tool_name != call.tool_name:
                    continue

                updated_at = approval.updated_at
                try:
                    ts = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                except Exception as parse_exc:
                    logger.warning(
                        "[tool-approval:dedup] Could not parse updated_at='%s' "
                        "for approval_id=%s: %s",
                        updated_at,
                        approval.id,
                        parse_exc,
                    )
                    # Be lenient — if we cannot parse the timestamp but the
                    # name matches and status is approved, treat as a match.
                    logger.info(
                        "Tool '%s' already approved recently (fallback match, "
                        "approval_id=%s) — skipping re-approval",
                        call.tool_name,
                        approval.id,
                    )
                    return args
                age_seconds = (now - ts).total_seconds()
                if 0 <= age_seconds <= recent_window_seconds:
                    logger.info(
                        "Tool '%s' already approved recently "
                        "(approval_id=%s, age=%.2fs) — skipping re-approval",
                        call.tool_name,
                        approval.id,
                        age_seconds,
                    )
                    return args
                else:
                    logger.info(
                        "[tool-approval:dedup] candidate approval_id=%s tool='%s' "
                        "outside window (age=%.2fs > %.2fs) — not deduping",
                        approval.id,
                        approval.tool_name,
                        age_seconds,
                        recent_window_seconds,
                    )

        logger.info(
            "[tool-approval] No dedupe match for tool='%s' tool_call_id=%s — "
            "requesting new approval",
            call.tool_name,
            tool_call_id,
        )
        await manager.request_and_wait(
            call.tool_name,
            safe_args,
            tool_call_id,
        )
        return args
