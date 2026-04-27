# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Usage and budget guardrail capabilities."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from .common import GuardrailBlockedError


@dataclass
class TokenLimitCapability(AbstractCapability[Any]):
    """Token/request/tool-call limits using capability hooks."""

    per_run: int = 100_000
    per_day: int = 500_000
    per_month: int = 5_000_000
    request_limit: int | None = None
    tool_calls_limit: int | None = None

    _run_tokens: int = field(default=0, init=False, repr=False)
    _run_requests: int = field(default=0, init=False, repr=False)
    _run_tool_calls: int = field(default=0, init=False, repr=False)
    _day_tokens: int = field(default=0, init=False, repr=False)
    _month_tokens: int = field(default=0, init=False, repr=False)
    _current_day: str = field(default="", init=False, repr=False)
    _current_month: str = field(default="", init=False, repr=False)

    def __post_init__(self) -> None:
        now = datetime.now(timezone.utc)
        self._current_day = now.date().isoformat()
        self._current_month = f"{now.year:04d}-{now.month:02d}"

    def _rollover_windows(self) -> None:
        now = datetime.now(timezone.utc)
        day = now.date().isoformat()
        month = f"{now.year:04d}-{now.month:02d}"
        if day != self._current_day:
            self._day_tokens = 0
            self._current_day = day
        if month != self._current_month:
            self._month_tokens = 0
            self._current_month = month

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_tokens = 0
        self._run_requests = 0
        self._run_tool_calls = 0
        self._rollover_windows()

    async def before_model_request(self, ctx: RunContext[Any], request: Any) -> Any:
        self._run_requests += 1
        if self.request_limit is not None and self._run_requests > self.request_limit:
            raise GuardrailBlockedError(
                f"Request limit exceeded: {self._run_requests}/{self.request_limit}"
            )
        return request

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        self._run_tool_calls += 1
        if (
            self.tool_calls_limit is not None
            and self._run_tool_calls > self.tool_calls_limit
        ):
            raise GuardrailBlockedError(
                f"Tool call limit exceeded: {self._run_tool_calls}/{self.tool_calls_limit}"
            )
        return args

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        self._rollover_windows()
        usage = ctx.usage
        run_tokens = int(getattr(usage, "total_tokens", 0) or 0)
        self._run_tokens += run_tokens
        self._day_tokens += run_tokens
        self._month_tokens += run_tokens

        if self._run_tokens > self.per_run:
            raise GuardrailBlockedError(
                f"Per-run token limit exceeded: {self._run_tokens}/{self.per_run}"
            )
        if self._day_tokens > self.per_day:
            raise GuardrailBlockedError(
                f"Daily token limit exceeded: {self._day_tokens}/{self.per_day}"
            )
        if self._month_tokens > self.per_month:
            raise GuardrailBlockedError(
                f"Monthly token limit exceeded: {self._month_tokens}/{self.per_month}"
            )
        return result


@dataclass
class CostBudgetCapability(AbstractCapability[Any]):
    """Cost budget guardrail with cumulative tracking."""

    per_run_usd: float | None = None
    cumulative_usd: float | None = None
    on_budget_exceeded: Literal["stop", "notify", "degrade"] = "stop"
    model_name: str | None = None

    _run_cost_usd: float = field(default=0.0, init=False, repr=False)
    _cumulative_cost_usd: float = field(default=0.0, init=False, repr=False)
    _price_input: float | None = field(default=None, init=False, repr=False)
    _price_output: float | None = field(default=None, init=False, repr=False)
    _resolved_prices: bool = field(default=False, init=False, repr=False)

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_cost_usd = 0.0
        if not self._resolved_prices:
            self._resolve_prices(getattr(ctx.model, "model_id", None))
        if (
            self.cumulative_usd is not None
            and self._cumulative_cost_usd > self.cumulative_usd
        ):
            self._handle_exceeded(
                f"Cumulative cost ${self._cumulative_cost_usd:.4f} exceeds ${self.cumulative_usd:.4f}"
            )

    def _resolve_prices(self, model_id: Any = None) -> None:
        model_name = str(model_id) if model_id else self.model_name
        if not model_name:
            self._resolved_prices = True
            return
        try:
            from genai_prices import get_model_prices

            short_name = (
                model_name.split(":", 1)[1] if ":" in model_name else model_name
            )
            prices = get_model_prices(short_name)
            if prices:
                self._price_input = prices.get("input", 0.0)
                self._price_output = prices.get("output", 0.0)
        except Exception:
            pass
        self._resolved_prices = True

    def _calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        if self._price_input is None or self._price_output is None:
            return 0.0
        return input_tokens * self._price_input + output_tokens * self._price_output

    def _handle_exceeded(self, message: str) -> None:
        if self.on_budget_exceeded == "notify":
            return
        if self.on_budget_exceeded == "degrade":
            return
        raise GuardrailBlockedError(message)

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        usage = ctx.usage
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        run_cost = self._calculate_cost(input_tokens, output_tokens)

        self._run_cost_usd += run_cost
        self._cumulative_cost_usd += run_cost

        if self.per_run_usd is not None and self._run_cost_usd > self.per_run_usd:
            self._handle_exceeded(
                f"Run cost ${self._run_cost_usd:.4f} exceeds ${self.per_run_usd:.4f}"
            )
        if (
            self.cumulative_usd is not None
            and self._cumulative_cost_usd > self.cumulative_usd
        ):
            self._handle_exceeded(
                f"Cumulative cost ${self._cumulative_cost_usd:.4f} exceeds ${self.cumulative_usd:.4f}"
            )
        return result
