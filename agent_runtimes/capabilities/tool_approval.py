# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Capability-native async tool approval flow.

When an AgentSpec marks tools as requiring human approval, this module
provides:

1. ``ToolApprovalConfig`` — configuration for the approval flow.
2. ``ToolApprovalManager`` — manages approval records locally and waits for
   human decisions via asyncio.Event (in-process signaling over WebSocket).
3. ``ToolApprovalCapability`` — a pydantic-ai ``AbstractCapability`` that
   intercepts tool calls needing approval via ``before_tool_execute``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlencode

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from .guardrails import GuardrailBlockedError

logger = logging.getLogger(__name__)


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

    def _resolve_ai_agents_ws_url(self, base_url: str, token: str | None = None) -> str:
        """Resolve ai-agents websocket URL from an HTTP(S) base URL."""
        stripped = base_url.rstrip("/")
        suffix = "/api/ai-agents/v1"
        if stripped.endswith(suffix):
            stripped = stripped[: -len(suffix)]

        if stripped.startswith("https://"):
            ws_base = "wss://" + stripped[len("https://") :]
        elif stripped.startswith("http://"):
            ws_base = "ws://" + stripped[len("http://") :]
        elif stripped.startswith("wss://") or stripped.startswith("ws://"):
            ws_base = stripped
        else:
            ws_base = "wss://" + stripped

        params = {}
        if token:
            params["token"] = token
        if self_agent_id := (self.config.agent_id or "").strip():
            params["agent_id"] = self_agent_id

        query = f"?{urlencode(params)}" if params else ""
        return f"{ws_base}/api/ai-agents/v1/ws{query}"

    async def _bridge_remote_decision_from_ai_agents(
        self,
        *,
        approval_id: str,
        remote_approval_id: str | None,
        tool_call_id: str | None,
    ) -> None:
        """Listen for remote approval decisions and mirror them locally.

        This allows request_and_wait() to resume when approvals are actioned
        from the datalayer-ai-agents UI rather than the local runtime socket.
        """
        if not self.config.user_jwt_token:
            return

        try:
            from datalayer_core.utils.urls import DatalayerURLs
            from websockets.asyncio.client import connect as ws_connect

            from agent_runtimes.routes.tool_approvals import (
                update_local_approval_status,
            )

            urls = DatalayerURLs.from_environment()
            ai_agents_url = getattr(urls, "ai_agents_url", None)
            if not ai_agents_url:
                return

            ws_url = self._resolve_ai_agents_ws_url(
                str(ai_agents_url), self.config.user_jwt_token
            )
            logger.info(
                "[tool-approval:bridge] Connecting to ai-agents WS for approval_id=%s "
                "remote_approval_id=%s tool_call_id=%s",
                approval_id,
                remote_approval_id,
                tool_call_id,
            )
            async with ws_connect(ws_url, close_timeout=10.0) as websocket:
                logger.info(
                    "[tool-approval:bridge] Connected to ai-agents WS, waiting for decision on approval_id=%s",
                    approval_id,
                )
                # Prime with a full snapshot in case approval already happened.
                await websocket.send(json.dumps({"type": "tool-approvals-history"}))

                while True:
                    raw_message = await websocket.recv()
                    if not isinstance(raw_message, str):
                        continue

                    payload: dict[str, Any] | None = None
                    try:
                        parsed_payload = json.loads(raw_message)
                    except json.JSONDecodeError:
                        logger.debug(
                            "[tool-approval:bridge] Ignoring non-JSON websocket message"
                        )
                    else:
                        if isinstance(parsed_payload, dict):
                            payload = parsed_payload

                    if payload is None:
                        continue

                    msg_type = payload.get("type")
                    msg_event = payload.get("event")

                    records: list[dict[str, Any]] = []
                    if msg_type == "tool-approvals-history":
                        data = payload.get("data") or {}
                        approvals = data.get("approvals")
                        if isinstance(approvals, list):
                            records = [r for r in approvals if isinstance(r, dict)]
                    elif isinstance(msg_event, str) and msg_event.startswith(
                        "tool_approval_"
                    ):
                        data = payload.get("data") or payload.get("payload")
                        if isinstance(data, dict):
                            records = [data]

                    if not records:
                        continue

                    for record in records:
                        record_id = record.get("id")
                        record_tool_call_id = record.get("tool_call_id") or record.get(
                            "toolCallId"
                        )
                        status = str(record.get("status") or "").lower()
                        note = record.get("note")
                        note_value = note if isinstance(note, str) else None

                        matched_by_local_id = (
                            isinstance(record_id, str) and record_id == approval_id
                        )
                        matched_by_remote_id = (
                            isinstance(record_id, str)
                            and isinstance(remote_approval_id, str)
                            and remote_approval_id
                            and record_id == remote_approval_id
                        )
                        matched_by_tool_call = (
                            isinstance(record_tool_call_id, str)
                            and isinstance(tool_call_id, str)
                            and tool_call_id
                            and record_tool_call_id == tool_call_id
                        )
                        if not (
                            matched_by_local_id
                            or matched_by_remote_id
                            or matched_by_tool_call
                        ):
                            continue

                        if status == "approved":
                            await update_local_approval_status(
                                approval_id,
                                status="approved",
                                note=note_value,
                            )
                            logger.info(
                                "[tool-approval:bridge] Mirrored remote APPROVED decision "
                                "for approval_id=%s remote_approval_id=%s tool_call_id=%s",
                                approval_id,
                                remote_approval_id,
                                tool_call_id,
                            )
                            return

                        if status == "rejected":
                            await update_local_approval_status(
                                approval_id,
                                status="rejected",
                                note=note_value,
                            )
                            logger.info(
                                "[tool-approval:bridge] Mirrored remote REJECTED decision "
                                "for approval_id=%s remote_approval_id=%s tool_call_id=%s",
                                approval_id,
                                remote_approval_id,
                                tool_call_id,
                            )
                            return
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(
                "[tool-approval:bridge] Remote ai-agents bridge stopped for approval_id=%s: %s",
                approval_id,
                exc,
            )

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
            ToolApprovalCreateRequest,
            _create_approval,
            forward_approval_to_ai_agents,
            register_pending_approval_event,
            remove_pending_approval_event,
        )

        req = ToolApprovalCreateRequest(
            agent_id=self.config.agent_id,
            pod_name=self.config.pod_name,
            tool_name=tool_name,
            tool_args=tool_args,
            tool_call_id=tool_call_id,
        )
        record = await _create_approval(req)
        approval_id = record.id

        # Register waiter first so any mirrored decision can immediately unblock.
        event, result = register_pending_approval_event(approval_id)

        remote_approval_id: str | None = None
        if self.config.user_jwt_token:
            # Sync creation to ai-agents first so we can correlate future decisions
            # by its remote approval id even when tool_call_id is missing.
            remote_approval_id = await forward_approval_to_ai_agents(
                record, self.config.user_jwt_token
            )

        remote_bridge_task: asyncio.Task[None] | None = None
        if self.config.user_jwt_token:
            remote_bridge_task = asyncio.create_task(
                self._bridge_remote_decision_from_ai_agents(
                    approval_id=approval_id,
                    remote_approval_id=remote_approval_id,
                    tool_call_id=tool_call_id,
                )
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
            if remote_bridge_task is not None:
                remote_bridge_task.cancel()
                try:
                    await remote_bridge_task
                except asyncio.CancelledError:
                    pass
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
class ToolApprovalCapability(AbstractCapability[Any]):
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
        tool_call_id = getattr(call, "tool_call_id", None)
        if tool_call_id:
            from agent_runtimes.routes.tool_approvals import (
                _APPROVALS,
                _APPROVALS_LOCK,
            )

            async with _APPROVALS_LOCK:
                for approval in _APPROVALS.values():
                    if (
                        approval.tool_call_id == tool_call_id
                        and approval.status == "approved"
                    ):
                        logger.info(
                            "Tool '%s' already approved via deferred continuation "
                            "(approval_id=%s, tool_call_id=%s) — skipping re-approval",
                            call.tool_name,
                            approval.id,
                            tool_call_id,
                        )
                        return args

        safe_args: dict[str, str] = {}
        for k, v in args.items():
            try:
                safe_args[k] = str(v)[:500]
            except Exception:
                safe_args[k] = "<non-serializable>"

        await manager.request_and_wait(
            call.tool_name,
            safe_args,
            tool_call_id,
        )
        return args
