# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Token limit guardrail.

Enforces per-run, daily, and monthly token budgets. Aligned with
pydantic-ai's ``UsageLimits`` for native enforcement.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from .base import BaseGuardrail, GuardrailResult, GuardrailViolation

logger = logging.getLogger(__name__)


class TokenLimitGuardrail(BaseGuardrail):
    """Enforce token limits from the AgentSpec guardrail config.

    Aligns with pydantic-ai's ``UsageLimits`` (``request_limit``,
    ``total_tokens_limit``, ``tool_calls_limit``) plus daily/monthly
    accumulation windows.

    Spec example::

        token_limits:
          per_run: 100000
          per_day: 500000
          per_month: 5000000
          request_limit: 50
          tool_calls_limit: 200

    Parameters
    ----------
    per_run : int
        Maximum tokens per agent run.
    per_day : int
        Maximum tokens per calendar day.
    per_month : int
        Maximum tokens per calendar month.
    request_limit : int | None
        Maximum number of LLM requests per run.
    tool_calls_limit : int | None
        Maximum number of tool calls per run.
    """

    name = "token_limit"

    def __init__(
        self,
        per_run: int = 100_000,
        per_day: int = 500_000,
        per_month: int = 5_000_000,
        request_limit: int | None = None,
        tool_calls_limit: int | None = None,
    ):
        self.per_run = per_run
        self.per_day = per_day
        self.per_month = per_month
        self.request_limit = request_limit
        self.tool_calls_limit = tool_calls_limit
        now = datetime.now(timezone.utc)
        self._current_day = now.date().isoformat()
        self._current_month = f"{now.year:04d}-{now.month:02d}"
        self.counters = {
            "run_tokens": 0,
            "run_requests": 0,
            "run_tool_calls": 0,
            "day_tokens": 0,
            "month_tokens": 0,
        }

    def to_usage_limits(self) -> Any:
        """Convert to pydantic-ai ``UsageLimits`` for native enforcement.

        Returns
        -------
        UsageLimits
            A pydantic-ai UsageLimits instance.
        """
        try:
            from pydantic_ai.usage import UsageLimits

            return UsageLimits(
                request_limit=self.request_limit,
                total_tokens_limit=self.per_run,
                tool_calls_limit=self.tool_calls_limit,
            )
        except ImportError:
            logger.warning("pydantic_ai.usage.UsageLimits not available")
            return None

    async def check_post_request(self, usage: dict, **kwargs: Any) -> GuardrailResult:
        """Called after each LLM request. Raises if limit exceeded."""
        now = datetime.now(timezone.utc)
        today = now.date().isoformat()
        month = f"{now.year:04d}-{now.month:02d}"
        if today != self._current_day:
            self.counters["day_tokens"] = 0
            self._current_day = today
        if month != self._current_month:
            self.counters["month_tokens"] = 0
            self._current_month = month

        total_tokens = usage.get("total_tokens", 0)
        self.counters["run_tokens"] += total_tokens
        self.counters["run_requests"] += 1
        self.counters["day_tokens"] += total_tokens
        self.counters["month_tokens"] += total_tokens

        if self.counters["run_tokens"] > self.per_run:
            raise GuardrailViolation(
                f"Token limit exceeded: {self.counters['run_tokens']}/{self.per_run} tokens per run",
                guardrail_name=self.name,
            )
        if self.counters["day_tokens"] > self.per_day:
            raise GuardrailViolation(
                f"Daily token limit exceeded: {self.counters['day_tokens']}/{self.per_day}",
                guardrail_name=self.name,
            )
        if self.counters["month_tokens"] > self.per_month:
            raise GuardrailViolation(
                f"Monthly token limit exceeded: {self.counters['month_tokens']}/{self.per_month}",
                guardrail_name=self.name,
            )
        if (
            self.request_limit is not None
            and self.counters["run_requests"] > self.request_limit
        ):
            raise GuardrailViolation(
                f"Request limit exceeded: {self.counters['run_requests']}/{self.request_limit}",
                guardrail_name=self.name,
            )
        return GuardrailResult(passed=True)

    async def check_pre_tool(self, tool_name: str, tool_args: dict) -> GuardrailResult:
        """Track tool call count and enforce tool_calls_limit."""
        self.counters["run_tool_calls"] += 1
        if (
            self.tool_calls_limit is not None
            and self.counters["run_tool_calls"] > self.tool_calls_limit
        ):
            raise GuardrailViolation(
                f"Tool calls limit exceeded: {self.counters['run_tool_calls']}/{self.tool_calls_limit}",
                guardrail_name=self.name,
            )
        return GuardrailResult(passed=True)

    def reset_run_counters(self) -> None:
        """Reset per-run counters (called at the start of each agent run)."""
        self.counters["run_tokens"] = 0
        self.counters["run_requests"] = 0
        self.counters["run_tool_calls"] = 0

    @classmethod
    def from_spec(cls, config: dict) -> "TokenLimitGuardrail":
        """Build from AgentSpec guardrail config."""
        return cls(
            per_run=config.get("per_run", 100_000),
            per_day=config.get("per_day", 500_000),
            per_month=config.get("per_month", 5_000_000),
            request_limit=config.get("request_limit"),
            tool_calls_limit=config.get("tool_calls_limit"),
        )
