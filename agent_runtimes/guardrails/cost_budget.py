# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Cost budget guardrail.

Enforces per-run and cumulative USD cost limits using model-specific
pricing. Supports ``stop``, ``notify``, and ``degrade`` actions when
the budget is exceeded.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseGuardrail, GuardrailResult, GuardrailViolation

logger = logging.getLogger(__name__)

# Approximate pricing per 1M tokens (input/output) for common models.
# Used as fallback when no explicit pricing is provided.
_DEFAULT_PRICING: dict[str, dict[str, float]] = {
    "anthropic:claude-sonnet-4-5": {"input": 3.0, "output": 15.0},
    "anthropic:claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "openai:gpt-4.1": {"input": 2.0, "output": 8.0},
    "openai:gpt-4.1-mini": {"input": 0.4, "output": 1.6},
    "openai:gpt-4o": {"input": 2.5, "output": 10.0},
    "openai:gpt-4o-mini": {"input": 0.15, "output": 0.6},
    "google:gemini-2.5-pro": {"input": 1.25, "output": 10.0},
    "google:gemini-2.5-flash": {"input": 0.15, "output": 0.6},
}


class CostBudgetGuardrail(BaseGuardrail):
    """Enforce monetary cost limits.

    Spec example::

        cost_budget:
          per_run_usd: 5.00
          cumulative_usd: 100.00
          on_budget_exceeded: notify   # "stop" | "notify" | "degrade"

    Parameters
    ----------
    per_run_usd : float | None
        Maximum USD cost per agent run.
    cumulative_usd : float | None
        Maximum cumulative USD cost across all runs.
    on_budget_exceeded : str
        Action when budget is exceeded: ``"stop"`` (raise), ``"notify"``
        (warn), or ``"degrade"`` (fall back to cheaper model).
    """

    name = "cost_budget"

    def __init__(
        self,
        per_run_usd: float | None = None,
        cumulative_usd: float | None = None,
        on_budget_exceeded: str = "stop",
    ):
        self.per_run_usd = per_run_usd
        self.cumulative_usd = cumulative_usd
        self.on_budget_exceeded = on_budget_exceeded
        self.run_cost_usd: float = 0.0
        self.cumulative_cost_usd: float = 0.0

    async def check_post_request(self, usage: dict, **kwargs: Any) -> GuardrailResult:
        """Calculate cost from token usage and enforce budget limits."""
        model = kwargs.get("model", "")
        model_pricing = kwargs.get("model_pricing") or _DEFAULT_PRICING.get(
            model, {"input": 1.0, "output": 4.0}
        )
        request_cost = self._calculate_cost(usage, model_pricing)
        self.run_cost_usd += request_cost
        self.cumulative_cost_usd += request_cost

        if self.per_run_usd and self.run_cost_usd > self.per_run_usd:
            return self._handle_exceeded(
                f"Run cost ${self.run_cost_usd:.4f} exceeds ${self.per_run_usd:.2f}"
            )
        if self.cumulative_usd and self.cumulative_cost_usd > self.cumulative_usd:
            return self._handle_exceeded(
                f"Cumulative cost ${self.cumulative_cost_usd:.4f} exceeds ${self.cumulative_usd:.2f}"
            )
        return GuardrailResult(passed=True)

    def _calculate_cost(self, usage: dict, pricing: dict) -> float:
        """Calculate USD cost from token usage and pricing."""
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)
        input_cost = (input_tokens / 1_000_000) * pricing.get("input", 1.0)
        output_cost = (output_tokens / 1_000_000) * pricing.get("output", 4.0)
        return input_cost + output_cost

    def _handle_exceeded(self, message: str) -> GuardrailResult:
        """Handle a budget exceeded event based on the configured action."""
        if self.on_budget_exceeded == "stop":
            raise GuardrailViolation(message, guardrail_name=self.name)
        elif self.on_budget_exceeded == "notify":
            logger.warning("Cost budget warning: %s", message)
            return GuardrailResult(passed=True, warning=message)
        elif self.on_budget_exceeded == "degrade":
            logger.warning("Cost budget degrade: %s", message)
            return GuardrailResult(passed=True, action="degrade_model", warning=message)
        else:
            raise GuardrailViolation(message, guardrail_name=self.name)

    def reset_run_counters(self) -> None:
        """Reset per-run cost (called at the start of each agent run)."""
        self.run_cost_usd = 0.0

    def get_cost_summary(self) -> dict:
        """Return current cost summary."""
        return {
            "run_cost_usd": round(self.run_cost_usd, 6),
            "cumulative_cost_usd": round(self.cumulative_cost_usd, 6),
            "per_run_limit_usd": self.per_run_usd,
            "cumulative_limit_usd": self.cumulative_usd,
        }

    @classmethod
    def from_spec(cls, config: dict) -> "CostBudgetGuardrail":
        """Build from AgentSpec guardrail config."""
        return cls(
            per_run_usd=config.get("per_run_usd"),
            cumulative_usd=config.get("cumulative_usd"),
            on_budget_exceeded=config.get("on_budget_exceeded", "stop"),
        )
