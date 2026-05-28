# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from __future__ import annotations

from dataclasses import dataclass
from typing import cast

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.context.costs import AgentCostStore
from agent_runtimes.guardrails.tool_approvals import (
    ToolApprovalManager,
    ToolsGuardrailCapability,
)
from agent_runtimes.monitoring.cost_monitoring import CostMonitoringCapability


@dataclass
class _Spec:
    model: str = "openai:gpt-4o-mini"
    guardrails: list[dict] | None = None
    capabilities: list[dict] | None = None
    advanced: dict | None = None


def _mock_factory_pre_allow_hook(payload: dict, **kwargs: object) -> dict:
    return {"decision": "allow", "reason": "allowed by factory test hook"}


class _FactoryFakeApprovalManager:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, str], str | None]] = []

    def requires_approval(self, tool_name: str) -> bool:
        return tool_name == "runtime_sensitive_echo"

    async def request_and_wait(
        self,
        tool_name: str,
        safe_args: dict[str, str],
        tool_call_id: str | None,
    ) -> None:
        self.calls.append((tool_name, safe_args, tool_call_id))


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


@pytest.mark.asyncio
async def test_factory_wires_tool_hooks_and_capability_executes_local_hook() -> None:
    spec = _Spec(
        guardrails=[
            {
                "tool_approval": {
                    "enabled": True,
                    "tools_requiring_approval": ["runtime-sensitive-echo"],
                    "tool_hooks": {
                        "before_tool_execute": [
                            {
                                "function": (
                                    "agent_runtimes.tests.test_cost_monitoring_capability:"
                                    "_mock_factory_pre_allow_hook"
                                )
                            }
                        ]
                    },
                }
            }
        ]
    )

    capabilities = build_capabilities_from_agent_spec(spec, agent_id="agent-xyz")
    tool_caps = [c for c in capabilities if isinstance(c, ToolsGuardrailCapability)]

    assert len(tool_caps) == 1
    capability = tool_caps[0]
    assert capability.config.agent_id == "agent-xyz"
    assert isinstance(capability.config.tool_hooks, dict)
    assert isinstance(capability.config.tool_hooks.get("before_tool_execute"), list)

    fake_manager = _FactoryFakeApprovalManager()
    capability._manager = cast(ToolApprovalManager, fake_manager)
    args = {"text": "hello", "reason": "audit"}

    result = await capability.before_tool_execute(
        None,
        call=ToolCallPart(
            tool_name="runtime_sensitive_echo",
            args=args,
            tool_call_id="factory-tool-1",
        ),
        tool_def=None,
        args=args,
    )

    assert result == args
    assert fake_manager.calls == []
