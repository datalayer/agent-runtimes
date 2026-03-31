# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Async tool approval flow.

When a guardrail or AgentSpec configuration marks a tool as requiring
human approval, this module:

1. Creates a ToolApproval record in the ai-agents service.
2. Polls the ai-agents service until the approval is resolved
   (approved/rejected/expired).
3. Returns the decision to the caller so the tool can proceed or be blocked.

This module also provides a PydanticAI-compatible tool wrapper that
intercepts tool calls needing approval and injects the approval flow.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx
from datalayer_core.utils.urls import DatalayerURLs

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


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

    # URL of the ai-agents service
    ai_agents_url: str = ""
    # Auth token (injected from env)
    token: str = ""
    # Agent identifier
    agent_id: str = "default"
    # Pod name (for tracing)
    pod_name: str = ""
    # Tools that require approval (regex patterns)
    tools_requiring_approval: list[str] = field(default_factory=list)
    # Polling interval in seconds
    poll_interval: float = 2.0
    # Maximum wait time in seconds before expiring
    timeout: float = 300.0
    # Whether to auto-approve if ai-agents is unavailable/misconfigured.
    # Default is fail-closed for safety.
    fail_open_on_error: bool = False

    @classmethod
    def from_env(cls) -> "ToolApprovalConfig":
        urls = DatalayerURLs.from_environment()
        # Always resolve ai-agents approval backend from core URL config.
        # Intentionally ignore AI_AGENTS_URL and local AGENT_RUNTIMES_PORT
        # so approvals are created in the shared ai-agents backend visible to UI.
        ai_agents_url = urls.ai_agents_url
        if os.environ.get("AI_AGENTS_URL"):
            logger.info(
                "Ignoring AI_AGENTS_URL for tool approvals; using core-resolved ai-agents URL: %s",
                ai_agents_url,
            )
        else:
            logger.info(
                "Using core-resolved ai-agents URL for tool approvals: %s",
                ai_agents_url,
            )
        # Prefer the user JWT forwarded by the companion (identifies the
        # user so ai-agents can set requester_uid correctly) over the
        # platform-level DATALAYER_API_KEY.
        token = (
            os.environ.get("DATALAYER_USER_TOKEN")
            or os.environ.get("DATALAYER_API_KEY", "")
        )
        return cls(
            ai_agents_url=ai_agents_url,
            token=token,
            agent_id=os.environ.get("AGENT_ID", "default"),
            pod_name=os.environ.get("POD_NAME", ""),
            fail_open_on_error=_env_bool("TOOL_APPROVAL_FAIL_OPEN", False),
        )

    @classmethod
    def from_spec(cls, spec_config: dict) -> "ToolApprovalConfig":
        """Build from AgentSpec configuration.

        Expected structure::

            tool_approval:
              tools:
                - "deploy.*"
                - "send_email"
                - "write_file"
              timeout: 300
              poll_interval: 2
        """
        base = cls.from_env()
        base.tools_requiring_approval = spec_config.get("tools", [])
        base.timeout = _parse_timeout_hms(spec_config.get("timeout"), default=300.0)
        base.poll_interval = spec_config.get("poll_interval", 2.0)
        if "fail_open_on_error" in spec_config:
            base.fail_open_on_error = bool(spec_config.get("fail_open_on_error"))
        return base


# ============================================================================
# Approval Flow
# ============================================================================


class ToolApprovalTimeoutError(Exception):
    """Raised when the approval request times out."""

    pass


class ToolApprovalRejectedError(Exception):
    """Raised when the tool call is rejected by the human."""

    def __init__(self, tool_name: str, note: str | None = None):
        self.tool_name = tool_name
        self.note = note
        msg = f"Tool '{tool_name}' was rejected by human reviewer"
        if note:
            msg += f": {note}"
        super().__init__(msg)


class ToolApprovalManager:
    """Manages tool approval requests against the ai-agents service.

    Usage::

        manager = ToolApprovalManager(config)
        # Before running the tool, request approval
        await manager.request_and_wait("deploy_to_production", {"env": "prod"})
        # If we get here, approval was granted (else an exception was raised)
    """

    def __init__(self, config: ToolApprovalConfig):
        self.config = config
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            headers: dict[str, str] = {}
            if self.config.token:
                headers["Authorization"] = f"Bearer {self.config.token}"
            self._client = httpx.AsyncClient(
                base_url=self.config.ai_agents_url,
                headers=headers,
                timeout=30.0,
            )
        return self._client

    def requires_approval(self, tool_name: str) -> bool:
        """Check whether a tool requires human approval."""
        import re

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
        self, tool_name: str, tool_args: dict[str, Any]
    ) -> dict[str, Any]:
        """Create an approval request and poll until resolved.

        Returns
        -------
        dict
            The resolved approval record.

        Raises
        ------
        ToolApprovalTimeoutError
            If the approval times out.
        ToolApprovalRejectedError
            If a human rejects the tool call.
        """
        client = await self._get_client()

        # 1. Create the approval request
        payload = {
            "agent_id": self.config.agent_id,
            "pod_name": self.config.pod_name,
            "tool_name": tool_name,
            "tool_args": tool_args,
        }

        approval_path = "/api/ai-agents/v1/tool-approvals"

        try:
            resp = await client.post(approval_path, json=payload)
            resp.raise_for_status()
            approval_data = resp.json()
        except httpx.HTTPError as exc:
            if self.config.fail_open_on_error:
                logger.warning(
                    "Tool approval backend unavailable at %s, auto-approving due to fail-open policy: %s",
                    self.config.ai_agents_url,
                    exc,
                )
                return {"status": "auto_approved", "tool_name": tool_name}
            raise RuntimeError(
                "Manual approval required, but tool-approval service is unavailable. "
                "Set TOOL_APPROVAL_FAIL_OPEN=true to bypass in non-production setups."
            ) from exc
        approval_id = approval_data.get("id")
        if not approval_id:
            if self.config.fail_open_on_error:
                logger.warning(
                    "No approval ID returned for tool '%s', auto-approving due to fail-open policy",
                    tool_name,
                )
                return {"status": "auto_approved", "tool_name": tool_name}
            raise RuntimeError(
                "Manual approval required, but ai-agents did not return an approval ID."
            )

        logger.info(
            "Waiting for human approval of tool '%s' (approval_id=%s, timeout=%ss)",
            tool_name,
            approval_id,
            self.config.timeout,
        )

        # 2. Poll until resolved or timed out
        elapsed = 0.0
        while elapsed < self.config.timeout:
            await asyncio.sleep(self.config.poll_interval)
            elapsed += self.config.poll_interval

            try:
                resp = await client.get(f"{approval_path}/{approval_id}")
                resp.raise_for_status()
                record = resp.json()
            except httpx.HTTPError:
                logger.warning("Error polling approval %s, will retry", approval_id)
                continue

            status = record.get("status", "pending")
            if status == "approved":
                logger.info(
                    "Tool '%s' approved (approval_id=%s)", tool_name, approval_id
                )
                return record
            elif status == "rejected":
                note = record.get("note")
                logger.info(
                    "Tool '%s' rejected (approval_id=%s, note=%s)",
                    tool_name,
                    approval_id,
                    note,
                )
                raise ToolApprovalRejectedError(tool_name, note)
            elif status == "expired":
                raise ToolApprovalTimeoutError(
                    f"Approval for tool '{tool_name}' expired server-side"
                )

        # Timed out locally
        raise ToolApprovalTimeoutError(
            f"Approval for tool '{tool_name}' timed out after {self.config.timeout}s"
        )

    async def close(self) -> None:
        """Shutdown the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None


# ============================================================================
# PydanticAI Tool Wrapper
# ============================================================================


def wrap_tool_with_approval(
    tool_fn: Callable,
    tool_name: str,
    approval_manager: ToolApprovalManager,
) -> Callable:
    """Wrap a PydanticAI tool function with an approval gate.

    Before the tool function is called, the wrapper checks if the tool
    requires approval.  If so, it creates a request and waits for
    the human decision before proceeding.

    This is designed to be used with ``pydantic_ai.Agent.tool()``
    or ``pydantic_ai.Tool()``.
    """
    import functools

    @functools.wraps(tool_fn)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        if approval_manager.requires_approval(tool_name):
            # Build a serializable snapshot of the arguments
            safe_args = {}
            for k, v in kwargs.items():
                try:
                    safe_args[k] = str(v)[:500]
                except Exception:
                    safe_args[k] = "<non-serializable>"

            await approval_manager.request_and_wait(tool_name, safe_args)

        # Approval passed (or was not required)
        return await tool_fn(*args, **kwargs)

    return wrapper
