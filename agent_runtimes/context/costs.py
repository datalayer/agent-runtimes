# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Cost usage tracking for pydantic-ai agents.

Provides a lightweight in-memory store for per-agent cost totals,
model breakdowns, and per-run traceability records.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class ModelCostBreakdown:
    """Aggregated cost/tokens for a single model."""

    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    requests: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "model": self.model,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "costUsd": self.cost_usd,
            "requests": self.requests,
        }


@dataclass
class CostRunTrace:
    """Traceability record for one completed model run."""

    timestamp: str
    model: str
    input_tokens: int
    output_tokens: int
    run_cost_usd: float
    cumulative_cost_usd: float
    price_per_input_token: float | None
    price_per_output_token: float | None
    pricing_resolved: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "model": self.model,
            "inputTokens": self.input_tokens,
            "outputTokens": self.output_tokens,
            "runCostUsd": self.run_cost_usd,
            "cumulativeCostUsd": self.cumulative_cost_usd,
            "pricePerInputToken": self.price_per_input_token,
            "pricePerOutputToken": self.price_per_output_token,
            "pricingResolved": self.pricing_resolved,
        }


@dataclass
class AgentCostUsage:
    """Per-agent cost usage state."""

    agent_id: str
    current_run_cost_usd: float = 0.0
    cumulative_cost_usd: float = 0.0
    per_run_budget_usd: float | None = None
    cumulative_budget_usd: float | None = None
    request_count: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    model_breakdown: dict[str, ModelCostBreakdown] = field(default_factory=dict)
    runs: deque[CostRunTrace] = field(default_factory=lambda: deque(maxlen=100))
    last_updated: str = field(default_factory=_utc_now_iso)

    @property
    def total_tokens_used(self) -> int:
        return self.total_input_tokens + self.total_output_tokens

    def to_dict(self) -> dict[str, Any]:
        return {
            "agentId": self.agent_id,
            "lastTurnCostUsd": self.current_run_cost_usd,
            "cumulativeCostUsd": self.cumulative_cost_usd,
            "perRunBudgetUsd": self.per_run_budget_usd,
            "cumulativeBudgetUsd": self.cumulative_budget_usd,
            "requestCount": self.request_count,
            "totalTokensUsed": self.total_tokens_used,
            "modelBreakdown": [
                m.to_dict()
                for m in sorted(
                    self.model_breakdown.values(),
                    key=lambda item: item.cost_usd,
                    reverse=True,
                )
            ],
            "runs": [r.to_dict() for r in self.runs],
            "lastUpdated": self.last_updated,
        }


class AgentCostStore:
    """Global in-memory cost tracking state."""

    def __init__(self) -> None:
        self._agents: dict[str, AgentCostUsage] = {}

    def register_agent(
        self,
        agent_id: str,
        *,
        per_run_budget_usd: float | None = None,
        cumulative_budget_usd: float | None = None,
    ) -> AgentCostUsage:
        usage = self._agents.get(agent_id)
        if usage is None:
            usage = AgentCostUsage(
                agent_id=agent_id,
                per_run_budget_usd=per_run_budget_usd,
                cumulative_budget_usd=cumulative_budget_usd,
            )
            self._agents[agent_id] = usage
            return usage

        if per_run_budget_usd is not None:
            usage.per_run_budget_usd = per_run_budget_usd
        if cumulative_budget_usd is not None:
            usage.cumulative_budget_usd = cumulative_budget_usd
        return usage

    def get_agent_usage(self, agent_id: str) -> AgentCostUsage | None:
        return self._agents.get(agent_id)

    def get_agent_usage_dict(self, agent_id: str) -> dict[str, Any]:
        usage = self._agents.get(agent_id)
        if usage is None:
            return {
                "agentId": agent_id,
                "lastTurnCostUsd": 0.0,
                "cumulativeCostUsd": 0.0,
                "perRunBudgetUsd": None,
                "cumulativeBudgetUsd": None,
                "requestCount": 0,
                "totalTokensUsed": 0,
                "modelBreakdown": [],
                "runs": [],
                "lastUpdated": None,
            }
        return usage.to_dict()

    def record_run(
        self,
        *,
        agent_id: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        run_cost_usd: float,
        price_per_input_token: float | None,
        price_per_output_token: float | None,
        pricing_resolved: bool,
    ) -> AgentCostUsage:
        usage = self.register_agent(agent_id)

        usage.request_count += 1
        usage.total_input_tokens += max(0, int(input_tokens))
        usage.total_output_tokens += max(0, int(output_tokens))
        usage.current_run_cost_usd = max(0.0, float(run_cost_usd))
        usage.cumulative_cost_usd += usage.current_run_cost_usd
        usage.last_updated = _utc_now_iso()

        model_key = model or "unknown"
        breakdown = usage.model_breakdown.get(model_key)
        if breakdown is None:
            breakdown = ModelCostBreakdown(model=model_key)
            usage.model_breakdown[model_key] = breakdown
        breakdown.input_tokens += max(0, int(input_tokens))
        breakdown.output_tokens += max(0, int(output_tokens))
        breakdown.cost_usd += usage.current_run_cost_usd
        breakdown.requests += 1

        usage.runs.append(
            CostRunTrace(
                timestamp=usage.last_updated,
                model=model_key,
                input_tokens=max(0, int(input_tokens)),
                output_tokens=max(0, int(output_tokens)),
                run_cost_usd=usage.current_run_cost_usd,
                cumulative_cost_usd=usage.cumulative_cost_usd,
                price_per_input_token=price_per_input_token,
                price_per_output_token=price_per_output_token,
                pricing_resolved=pricing_resolved,
            )
        )
        return usage


_cost_store: AgentCostStore | None = None


def get_cost_store() -> AgentCostStore:
    global _cost_store
    if _cost_store is None:
        _cost_store = AgentCostStore()
    return _cost_store
