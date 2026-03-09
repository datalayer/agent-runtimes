# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Guardrails for agent-runtimes.

Provides a composable guardrail system with five built-in types:
- ``TokenLimitGuardrail`` — enforce per-run/day/month token limits
- ``CostBudgetGuardrail`` — enforce per-run/cumulative USD cost limits
- ``PermissionGuardrail`` — enforce read/write/execute/access permissions
- ``DataScopeGuardrail`` — restrict accessible systems/objects/fields
- ``ContentSafetyGuardrail`` — detect prompt injection in tool outputs

All guardrails are composed via ``GuardrailPipeline`` and built from
AgentSpec config via ``GuardrailPipeline.from_spec()``.
"""

from .base import BaseGuardrail, GuardrailResult, GuardrailViolation
from .content_safety import ContentSafetyGuardrail
from .cost_budget import CostBudgetGuardrail
from .data_scope import DataScopeGuardrail
from .permissions import PermissionGuardrail
from .pipeline import GuardrailPipeline
from .registry import build_guardrail_pipeline
from .token_limit import TokenLimitGuardrail
from .tool_approval import (
    ToolApprovalConfig,
    ToolApprovalManager,
    ToolApprovalRejectedError,
    ToolApprovalTimeoutError,
    wrap_tool_with_approval,
)

__all__ = [
    "BaseGuardrail",
    "ContentSafetyGuardrail",
    "CostBudgetGuardrail",
    "DataScopeGuardrail",
    "GuardrailPipeline",
    "GuardrailResult",
    "GuardrailViolation",
    "PermissionGuardrail",
    "TokenLimitGuardrail",
    "ToolApprovalConfig",
    "ToolApprovalManager",
    "ToolApprovalRejectedError",
    "ToolApprovalTimeoutError",
    "build_guardrail_pipeline",
    "wrap_tool_with_approval",
]
