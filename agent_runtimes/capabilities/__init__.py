# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Capability utilities for pydantic-ai agent construction.

This package provides:
- Spec-driven capability builders
- Guardrail capabilities aligned with pydantic-ai hooks
- Optional OTEL capability hooks
- Tool approval capability (async HTTP-based human approval)
"""

from .factory import (
    build_capabilities_from_agent_spec,
    build_default_choice_guardrails,
    build_usage_limits_from_agent_spec,
)
from .graph_telemetry import (
    clear_graph_telemetry,
    get_graph_telemetry,
    get_graph_telemetry_dict,
    run_beta_graph_with_telemetry,
    run_graph_with_telemetry,
)
from .llm_context_usage import LLMContextUsageCapability
from .monitoring import MonitoringCapability
from .tool_approval import (
    ToolApprovalCapability,
    ToolApprovalConfig,
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolApprovalTimeoutError,
)

__all__ = [
    "LLMContextUsageCapability",
    "MonitoringCapability",
    "ToolApprovalCapability",
    "ToolApprovalConfig",
    "ToolApprovalManager",
    "ToolApprovalRejectedError",
    "ToolApprovalTimeoutError",
    "build_capabilities_from_agent_spec",
    "build_default_choice_guardrails",
    "build_usage_limits_from_agent_spec",
    "clear_graph_telemetry",
    "get_graph_telemetry",
    "get_graph_telemetry_dict",
    "run_beta_graph_with_telemetry",
    "run_graph_with_telemetry",
]
