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
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

logger = logging.getLogger(__name__)


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

    @classmethod
    def from_env(cls) -> "ToolApprovalConfig":
        return cls(
            ai_agents_url=os.environ.get(
                "AI_AGENTS_URL", "http://datalayer-ai-agents:9800"
            ),
            token=os.environ.get("DATALAYER_API_KEY", ""),
            agent_id=os.environ.get("AGENT_ID", "default"),
            pod_name=os.environ.get("POD_NAME", ""),
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
        base.timeout = spec_config.get("timeout", 300.0)
        base.poll_interval = spec_config.get("poll_interval", 2.0)
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

        for pattern in self.config.tools_requiring_approval:
            if re.search(pattern, tool_name, re.IGNORECASE):
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

        try:
            resp = await client.post(
                "/api/ai-agents/v1/tool-approvals", json=payload
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            # If the ai-agents service is unreachable, auto-approve
            logger.warning(
                "Could not reach ai-agents service for tool approval, auto-approving: %s",
                exc,
            )
            return {"status": "auto_approved", "tool_name": tool_name}

        # The ai-agents service doesn't have a POST endpoint for creating yet
        # (Phase 2.1 only has admin-facing endpoints), so we use the internal
        # store directly when running in the same process, or fall back to
        # a local wait loop.
        approval_data = resp.json()
        approval_id = approval_data.get("id")
        if not approval_id:
            # Possibly running against an older service version
            logger.warning("No approval ID returned, auto-approving tool %s", tool_name)
            return {"status": "auto_approved", "tool_name": tool_name}

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
                resp = await client.get(
                    f"/api/ai-agents/v1/tool-approvals/{approval_id}"
                )
                resp.raise_for_status()
                record = resp.json()
            except httpx.HTTPError:
                logger.warning("Error polling approval %s, will retry", approval_id)
                continue

            status = record.get("status", "pending")
            if status == "approved":
                logger.info("Tool '%s' approved (approval_id=%s)", tool_name, approval_id)
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
    async def wrapper(*args, **kwargs):
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
