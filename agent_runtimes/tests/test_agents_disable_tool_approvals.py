# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent that asked for no tool approvals gets none — defaults included."""

from __future__ import annotations

from agent_runtimes.capabilities import (
    ToolApprovalConfig,
    ToolsGuardrailCapability,
    build_default_choice_guardrails,
)
from agent_runtimes.routes.agents import _without_approval_capabilities


def test_default_guardrails_carry_approval_capabilities() -> None:
    names = {cap.__class__.__name__ for cap in build_default_choice_guardrails("a")}
    assert {"MCPToolsGuardrailCapability", "SkillsGuardrailCapability"} <= names


def test_stripping_removes_every_approval_capability_and_keeps_the_rest() -> None:
    class Other:
        pass

    other = Other()
    capabilities = [
        ToolsGuardrailCapability(config=ToolApprovalConfig.from_spec({})),
        other,
        *build_default_choice_guardrails("agent-1"),
    ]

    kept = _without_approval_capabilities(capabilities)

    assert kept == [other]
