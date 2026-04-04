# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Capability utilities for pydantic-ai agent construction.

This package provides:
- Spec-driven capability builders
- Guardrail capabilities aligned with pydantic-ai hooks
- Optional OTEL capability hooks
- Tool approval capability (async HTTP-based human approval)
"""

from .factory import build_capabilities_from_agent_spec, build_usage_limits_from_agent_spec
from .tool_approval import (
    ToolApprovalCapability,
    ToolApprovalConfig,
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolApprovalTimeoutError,
)

__all__ = [
    "ToolApprovalCapability",
    "ToolApprovalConfig",
    "ToolApprovalManager",
    "ToolApprovalRejectedError",
    "ToolApprovalTimeoutError",
    "build_capabilities_from_agent_spec",
    "build_usage_limits_from_agent_spec",
]
