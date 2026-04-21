# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Build pydantic-ai capabilities from agent-runtimes AgentSpec."""

from __future__ import annotations

import os
from typing import Any

from pydantic_ai import UsageLimits

from .cost_monitoring import CostMonitoringCapability
from .guardrails import (
    DEFAULT_TOOL_PERMISSION_MAP,
    AsyncGuardrailCapability,
    BlockedKeywordsCapability,
    ContentSafetyCapability,
    CostBudgetCapability,
    DataScopeCapability,
    InputGuardCapability,
    MCPToolsGuardrailCapability,
    NoRefusalsCapability,
    PermissionCapability,
    PiiDetectorCapability,
    PromptInjectionCapability,
    SecretRedactionCapability,
    SkillsGuardrailCapability,
    TokenLimitCapability,
    ToolGuardCapability,
    _parse_token_limit,
)
from .llm_context_usage import LLMContextUsageCapability
from .monitoring import MonitoringCapability
from .otel import OTelHooksCapability
from .tool_approval import ToolApprovalCapability, ToolApprovalConfig


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_money(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (float, int)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.strip().lower()
        cleaned = cleaned.replace("$", "").replace("usd", "")
        cleaned = cleaned.replace("per run", "").strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def build_usage_limits_from_agent_spec(agent_spec: Any) -> UsageLimits | None:
    """Build native UsageLimits from guardrail token limits when available."""
    guardrails = list(getattr(agent_spec, "guardrails", None) or [])
    if not guardrails:
        return None

    per_run: int | None = None
    request_limit: int | None = None
    tool_calls_limit: int | None = None

    for entry in guardrails:
        if not isinstance(entry, dict):
            continue
        token_limits = entry.get("token_limits") or {}
        if isinstance(token_limits, dict):
            if per_run is None and token_limits.get("per_run") is not None:
                per_run = _parse_token_limit(token_limits.get("per_run"), 0)
            if request_limit is None and token_limits.get("request_limit") is not None:
                try:
                    request_limit = int(token_limits["request_limit"])
                except (TypeError, ValueError):
                    request_limit = None
            if (
                tool_calls_limit is None
                and token_limits.get("tool_calls_limit") is not None
            ):
                try:
                    tool_calls_limit = int(token_limits["tool_calls_limit"])
                except (TypeError, ValueError):
                    tool_calls_limit = None
        if (
            per_run is not None
            and request_limit is not None
            and tool_calls_limit is not None
        ):
            break

    if per_run is None and request_limit is None and tool_calls_limit is None:
        return None

    return UsageLimits(
        total_tokens_limit=per_run,
        request_limit=request_limit,
        tool_calls_limit=tool_calls_limit,
    )


def build_capabilities_from_agent_spec(
    agent_spec: Any, agent_id: str | None = None
) -> list[Any]:
    """Convert agent-runtimes AgentSpec guardrails into pydantic-ai capabilities."""
    capabilities: list[Any] = []
    guardrails = list(getattr(agent_spec, "guardrails", None) or [])
    explicit_capabilities = list(getattr(agent_spec, "capabilities", None) or [])
    advanced = getattr(agent_spec, "advanced", None) or {}
    monitoring_per_run_budget: float | None = None
    monitoring_cumulative_budget: float | None = None

    for entry in [*guardrails, *explicit_capabilities]:
        if not isinstance(entry, dict):
            continue

        # Existing guardrail sections
        token_limits = entry.get("token_limits") or {}
        if isinstance(token_limits, dict) and token_limits:
            capabilities.append(
                TokenLimitCapability(
                    per_run=_parse_token_limit(token_limits.get("per_run"), 100_000),
                    per_day=_parse_token_limit(token_limits.get("per_day"), 500_000),
                    per_month=_parse_token_limit(
                        token_limits.get("per_month"), 5_000_000
                    ),
                    request_limit=token_limits.get("request_limit"),
                    tool_calls_limit=token_limits.get("tool_calls_limit"),
                )
            )

        cost_budget = entry.get("cost_budget") or {}
        if isinstance(cost_budget, dict) and cost_budget:
            if monitoring_per_run_budget is None:
                monitoring_per_run_budget = _parse_money(cost_budget.get("per_run_usd"))
            if monitoring_cumulative_budget is None:
                monitoring_cumulative_budget = _parse_money(
                    cost_budget.get("cumulative_usd")
                )
            capabilities.append(
                CostBudgetCapability(
                    per_run_usd=_parse_money(cost_budget.get("per_run_usd")),
                    cumulative_usd=_parse_money(cost_budget.get("cumulative_usd")),
                    on_budget_exceeded=cost_budget.get("on_budget_exceeded", "stop"),
                    model_name=getattr(agent_spec, "model", None),
                )
            )

        permissions = entry.get("permissions") or {}
        if isinstance(permissions, dict) and permissions:
            capabilities.append(
                PermissionCapability(
                    permissions=permissions,
                    tool_permission_map=DEFAULT_TOOL_PERMISSION_MAP,
                )
            )

        data_scope = entry.get("data_scope") or {}
        data_handling = entry.get("data_handling") or {}
        if isinstance(data_scope, dict) and data_scope:
            capabilities.append(
                DataScopeCapability(
                    allowed_systems=list(data_scope.get("allowed_systems") or []),
                    allowed_objects=list(data_scope.get("allowed_objects") or []),
                    denied_objects=list(data_scope.get("denied_objects") or []),
                    denied_fields=list(data_scope.get("denied_fields") or []),
                    allow_row_level_output=bool(
                        data_handling.get("allow_row_level_output", True)
                    ),
                    max_rows_in_output=int(
                        data_handling.get("max_rows_in_output", 1000)
                    ),
                )
            )

        content_safety = entry.get("content_safety") or {}
        if isinstance(content_safety, dict) and content_safety:
            capabilities.append(
                ContentSafetyCapability(
                    treat_text_as_untrusted=bool(
                        content_safety.get("treat_crm_text_fields_as_untrusted", True)
                    ),
                    block_data_instructions=bool(
                        content_safety.get("do_not_follow_instructions_from_data", True)
                    ),
                )
            )

        # data_handling driven shields
        if isinstance(data_handling, dict) and data_handling.get("pii_detection"):
            pii_action = str(data_handling.get("pii_action", "block")).lower()
            capabilities.append(
                PiiDetectorCapability(
                    action="log" if pii_action in {"warn", "redact"} else "block"
                )
            )

        # Optional shield-style sections
        if entry.get("prompt_injection"):
            cfg = (
                entry["prompt_injection"]
                if isinstance(entry["prompt_injection"], dict)
                else {}
            )
            capabilities.append(
                PromptInjectionCapability(
                    sensitivity=cfg.get("sensitivity", "medium"),
                    categories=cfg.get("categories"),
                    custom_patterns=cfg.get("custom_patterns"),
                )
            )

        if entry.get("secret_redaction"):
            cfg = (
                entry["secret_redaction"]
                if isinstance(entry["secret_redaction"], dict)
                else {}
            )
            capabilities.append(
                SecretRedactionCapability(
                    detect=cfg.get("detect"),
                    custom_patterns=cfg.get("custom_patterns"),
                )
            )

        if entry.get("blocked_keywords"):
            cfg = (
                entry["blocked_keywords"]
                if isinstance(entry["blocked_keywords"], dict)
                else {}
            )
            capabilities.append(
                BlockedKeywordsCapability(
                    keywords=list(cfg.get("keywords") or []),
                    case_sensitive=bool(cfg.get("case_sensitive", False)),
                    whole_words=bool(cfg.get("whole_words", False)),
                    use_regex=bool(cfg.get("use_regex", False)),
                )
            )

        if entry.get("no_refusals"):
            cfg = entry["no_refusals"] if isinstance(entry["no_refusals"], dict) else {}
            capabilities.append(
                NoRefusalsCapability(
                    patterns=cfg.get("patterns"),
                    allow_partial=bool(cfg.get("allow_partial", False)),
                    min_response_length=int(cfg.get("min_response_length", 50)),
                )
            )

        if entry.get("tool_guard"):
            cfg = entry["tool_guard"] if isinstance(entry["tool_guard"], dict) else {}
            capabilities.append(
                ToolGuardCapability(
                    blocked=list(cfg.get("blocked") or []),
                    require_approval=list(cfg.get("require_approval") or []),
                )
            )

        if entry.get("async_guardrail"):
            cfg = (
                entry["async_guardrail"]
                if isinstance(entry["async_guardrail"], dict)
                else {}
            )
            nested_input = cfg.get("input_guard") or {}
            nested_guard = InputGuardCapability(guard=nested_input.get("guard"))
            capabilities.append(
                AsyncGuardrailCapability(
                    guard=nested_guard,
                    timing=cfg.get("timing", "concurrent"),
                    cancel_on_failure=bool(cfg.get("cancel_on_failure", True)),
                    timeout=cfg.get("timeout"),
                )
            )

        if entry.get("tool_approval"):
            cfg = (
                entry["tool_approval"]
                if isinstance(entry["tool_approval"], dict)
                else {}
            )
            approval_config = ToolApprovalConfig.from_spec(cfg)
            if agent_id:
                approval_config.agent_id = agent_id
            capabilities.append(ToolApprovalCapability(config=approval_config))

    # Advanced fallback for cost budget
    if isinstance(advanced, dict) and advanced.get("cost_limit"):
        cost_limit = _parse_money(advanced.get("cost_limit"))
        if cost_limit is not None:
            already_has_budget = any(
                isinstance(cap, CostBudgetCapability) for cap in capabilities
            )
            if not already_has_budget:
                capabilities.append(
                    CostBudgetCapability(
                        per_run_usd=cost_limit,
                        model_name=getattr(agent_spec, "model", None),
                    )
                )
            if monitoring_per_run_budget is None:
                monitoring_per_run_budget = cost_limit

    # Subagent delegation via subagents-pydantic-ai
    subagents_config = getattr(agent_spec, "subagents", None)
    if subagents_config is not None:
        try:
            from subagents_pydantic_ai import SubAgentCapability, SubAgentConfig

            sa_cfgs: list[SubAgentConfig] = []
            for sa in getattr(subagents_config, "subagents", []):
                sa_cfg: SubAgentConfig = {
                    "name": sa.name,
                    "description": sa.description,
                    "instructions": sa.instructions,
                }
                if sa.model is not None:
                    sa_cfg["model"] = sa.model
                if sa.can_ask_questions is not None:
                    sa_cfg["can_ask_questions"] = sa.can_ask_questions
                if sa.max_questions is not None:
                    sa_cfg["max_questions"] = sa.max_questions
                if sa.preferred_mode is not None:
                    sa_cfg["preferred_mode"] = sa.preferred_mode
                if sa.typical_complexity is not None:
                    sa_cfg["typical_complexity"] = sa.typical_complexity
                if sa.typically_needs_context is not None:
                    sa_cfg["typically_needs_context"] = sa.typically_needs_context
                sa_cfgs.append(sa_cfg)

            default_model = getattr(subagents_config, "default_model", None) or getattr(
                agent_spec, "model", "openai:gpt-4.1"
            )
            capabilities.append(
                SubAgentCapability(
                    subagents=sa_cfgs,
                    default_model=default_model,
                    include_general_purpose=getattr(
                        subagents_config, "include_general_purpose", True
                    ),
                    max_nesting_depth=getattr(subagents_config, "max_nesting_depth", 0),
                )
            )
        except ImportError:
            import logging

            logging.getLogger(__name__).warning(
                "subagents-pydantic-ai not installed — skipping SubAgentCapability"
            )

    if _env_bool("AGENT_RUNTIMES_ENABLE_CAPABILITY_COST_MONITORING", True) and agent_id:
        capabilities.append(
            CostMonitoringCapability(
                agent_id=agent_id,
                model_name=getattr(agent_spec, "model", None),
                per_run_budget_usd=monitoring_per_run_budget,
                cumulative_budget_usd=monitoring_cumulative_budget,
                service_name=os.environ.get(
                    "DATALAYER_OTEL_SERVICE_NAME",
                    "agent-runtimes",
                ),
                enabled=True,
            )
        )

    if _env_bool("AGENT_RUNTIMES_ENABLE_CAPABILITY_OTEL", True):
        capabilities.append(
            OTelHooksCapability(
                service_name=os.environ.get(
                    "DATALAYER_OTEL_SERVICE_NAME",
                    "agent-runtimes",
                ),
                enabled=True,
                emit_prompt_preview=_env_bool(
                    "AGENT_RUNTIMES_OTEL_PROMPT_PREVIEW",
                    False,
                ),
            )
        )

    # LLM context usage tracking (centralises per-run token recording).
    if (
        _env_bool("AGENT_RUNTIMES_ENABLE_CAPABILITY_LLM_CONTEXT_USAGE", True)
        and agent_id
    ):
        capabilities.append(
            LLMContextUsageCapability(
                agent_id=agent_id,
                enabled=True,
            )
        )

    # Monitoring snapshot broadcast (pushes to WebSocket after each run).
    if _env_bool("AGENT_RUNTIMES_ENABLE_CAPABILITY_MONITORING", True) and agent_id:
        capabilities.append(
            MonitoringCapability(
                agent_id=agent_id,
                enabled=True,
            )
        )

    # Always enforce user-selected skills and MCP tool toggles.
    capabilities.extend(build_default_choice_guardrails(agent_id=agent_id))

    return capabilities


def build_default_choice_guardrails(agent_id: str | None = None) -> list[Any]:
    """Build default guardrails that honor runtime user tool/skill selections."""
    return [
        SkillsGuardrailCapability(agent_id=agent_id),
        MCPToolsGuardrailCapability(agent_id=agent_id),
    ]
