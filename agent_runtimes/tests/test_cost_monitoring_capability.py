# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from __future__ import annotations

from dataclasses import dataclass

from agent_runtimes.capabilities.cost_monitoring import CostMonitoringCapability
from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.context.costs import AgentCostStore


@dataclass
class _Spec:
    model: str = "openai:gpt-4o-mini"
    guardrails: list[dict] | None = None
    capabilities: list[dict] | None = None
    advanced: dict | None = None


def test_cost_store_records_run() -> None:
    store = AgentCostStore()
    store.register_agent("agent-1", per_run_budget_usd=0.5, cumulative_budget_usd=2.0)

    store.record_run(
        agent_id="agent-1",
        model="openai:gpt-4o-mini",
        input_tokens=100,
        output_tokens=50,
        run_cost_usd=0.0123,
        price_per_input_token=0.00001,
        price_per_output_token=0.00003,
        pricing_resolved=True,
    )

    data = store.get_agent_usage_dict("agent-1")
    assert data["requestCount"] == 1
    assert data["totalTokensUsed"] == 150
    assert data["lastTurnCostUsd"] == 0.0123
    assert data["cumulativeCostUsd"] == 0.0123
    assert data["perRunBudgetUsd"] == 0.5
    assert data["cumulativeBudgetUsd"] == 2.0
    assert len(data["modelBreakdown"]) == 1
    assert len(data["runs"]) == 1


def test_cost_store_default_usage_is_stable() -> None:
    store = AgentCostStore()

    data = store.get_agent_usage_dict("missing-agent")

    assert data["requestCount"] == 0
    assert data["lastUpdated"] is None


def test_factory_adds_cost_monitoring_capability() -> None:
    spec = _Spec(
        guardrails=[
            {
                "cost_budget": {
                    "per_run_usd": 0.25,
                    "cumulative_usd": 1.5,
                }
            }
        ]
    )

    capabilities = build_capabilities_from_agent_spec(spec, agent_id="agent-xyz")
    monitors = [c for c in capabilities if isinstance(c, CostMonitoringCapability)]

    assert len(monitors) == 1
    assert monitors[0].agent_id == "agent-xyz"
    assert monitors[0].per_run_budget_usd == 0.25
    assert monitors[0].cumulative_budget_usd == 1.5
