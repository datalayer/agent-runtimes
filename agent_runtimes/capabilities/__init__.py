# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Capability utilities for pydantic-ai agent construction.

This package provides:
- Spec-driven capability builders
- Guardrail capabilities aligned with pydantic-ai hooks
- Optional OTEL capability hooks
- Tool approval capability (async HTTP-based human approval)
"""

from ..guardrails.tool_approvals import (
    ToolApprovalConfig,
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolApprovalTimeoutError,
    ToolsGuardrailCapability,
)
from ..monitoring import (
    LLMContextUsageCapability,
    MonitoringCapability,
    clear_graph_telemetry,
    get_graph_telemetry,
    get_graph_telemetry_dict,
    run_beta_graph_with_telemetry,
    run_graph_with_telemetry,
)
from .factory import (
    build_capabilities_from_agent_spec,
    build_default_choice_guardrails,
    build_usage_limits_from_agent_spec,
)

__all__ = [
    "LLMContextUsageCapability",
    "MonitoringCapability",
    "ToolApprovalConfig",
    "ToolApprovalManager",
    "ToolApprovalRejectedError",
    "ToolApprovalTimeoutError",
    "ToolsGuardrailCapability",
    "build_capabilities_from_agent_spec",
    "build_default_choice_guardrails",
    "build_usage_limits_from_agent_spec",
    "clear_graph_telemetry",
    "get_graph_telemetry",
    "get_graph_telemetry_dict",
    "run_beta_graph_with_telemetry",
    "run_graph_with_telemetry",
]
