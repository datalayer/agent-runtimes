# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Runtime tools registry and Pydantic AI wiring.

This module maps generated tool specs to concrete Python callables and
registers them into a ``pydantic_ai.Agent`` instance.
"""

from __future__ import annotations

import importlib
import logging
import os
from typing import Callable, List

from agent_runtimes.specs.tools import ToolSpec, get_tool_spec

from ..guardrails.tool_approval import (
    ToolApprovalConfig,
    ToolApprovalManager,
    wrap_tool_with_approval,
)

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _tool_name_to_identifier(tool_name: str) -> str:
    """Convert spec tool IDs to Python identifiers used by tool_plain."""
    return tool_name.replace("-", "_")


def _build_approval_manager(
    tool_id: str,
    agent_id: str | None = None,
    pod_name: str | None = None,
) -> ToolApprovalManager:
    cfg = ToolApprovalConfig.from_spec({"tools": [tool_id]})
    if agent_id:
        cfg.agent_id = agent_id
    if pod_name:
        cfg.pod_name = pod_name
    return ToolApprovalManager(cfg)


def _resolve_python_tool(spec: ToolSpec) -> Callable[..., object] | None:
    runtime = getattr(spec, "runtime", None)
    if runtime is None:
        logger.warning("Tool '%s' does not define runtime metadata; skipping", spec.id)
        return None

    if runtime.language != "python":
        logger.info(
            "Tool '%s' uses unsupported runtime language '%s' for backend registration",
            spec.id,
            runtime.language,
        )
        return None

    try:
        module = importlib.import_module(runtime.package)
    except Exception as exc:  # pragma: no cover - defensive error path
        logger.warning(
            "Failed to import Python package '%s' for tool '%s': %s",
            runtime.package,
            spec.id,
            exc,
        )
        return None

    impl = getattr(module, runtime.method, None)
    if impl is None or not callable(impl):
        logger.warning(
            "Python method '%s' not found/callable in package '%s' for tool '%s'",
            runtime.method,
            runtime.package,
            spec.id,
        )
        return None

    return impl


def tools_requiring_approval_ids(tool_ids: List[str]) -> list[str]:
    """Return enabled tool IDs that require approval."""
    required: list[str] = []
    for tool_id in tool_ids:
        spec: ToolSpec | None = get_tool_spec(tool_id)
        if spec is None or not spec.enabled:
            continue
        if bool(getattr(spec, "requires_approval", False) or spec.approval == "manual"):
            required.append(tool_id)
    return required


def tools_require_approval(tool_ids: List[str]) -> bool:
    """Return True if any enabled tool in ``tool_ids`` requires approval."""
    return bool(tools_requiring_approval_ids(tool_ids))


def register_agent_tools(
    agent: object,
    tool_ids: List[str],
    agent_id: str | None = None,
    pod_name: str | None = None,
) -> list[str]:
    """Register runtime tools on a pydantic_ai.Agent instance.

    Args:
        agent: Pydantic AI Agent instance exposing ``tool_plain``.
        tool_ids: Tool IDs from AgentSpec.
        agent_id: Runtime agent identifier used in approval records.
        pod_name: Optional pod name used in approval records.

    Returns:
        List of registered tool names.
    """
    if not tool_ids:
        return []

    if not hasattr(agent, "tool_plain"):
        logger.warning("Agent does not support tool_plain; skipping runtime tools")
        return []

    registered: list[str] = []
    tool_plain = getattr(agent, "tool_plain")
    use_deferred_tool_approval = _env_bool(
        "AGENT_RUNTIMES_USE_PYDANTIC_DEFERRED_APPROVAL", False
    )
    logger.info(
        "Tool approval mode: %s",
        "pydantic-deferred" if use_deferred_tool_approval else "ai-agents-wrapper",
    )

    for tool_id in tool_ids:
        spec: ToolSpec | None = get_tool_spec(tool_id)
        if spec is None:
            logger.warning("Tool '%s' not found in TOOL_CATALOG; skipping", tool_id)
            continue
        if not spec.enabled:
            logger.info("Tool '%s' is disabled; skipping", tool_id)
            continue

        impl = _resolve_python_tool(spec)
        if impl is None:
            logger.warning(
                "No Python implementation resolved for tool '%s'; skipping", tool_id
            )
            continue

        tool_fn = impl
        requires_approval = bool(
            getattr(spec, "requires_approval", False) or spec.approval == "manual"
        )

        if requires_approval and not use_deferred_tool_approval:
            manager = _build_approval_manager(
                tool_id,
                agent_id=agent_id,
                pod_name=pod_name,
            )
            tool_fn = wrap_tool_with_approval(tool_fn, tool_id, manager)

        # Ensure function name is a valid Python identifier for pydantic_ai.
        # Use spec.id (unversioned) rather than tool_id which may contain
        # a version suffix like ":0.0.1" that is invalid for LLM APIs.
        tool_fn.__name__ = _tool_name_to_identifier(spec.id)

        try:
            if use_deferred_tool_approval:
                tool_plain(tool_fn, requires_approval=requires_approval)
            else:
                tool_plain(tool_fn)
        except TypeError:
            # Backward compatibility with older pydantic-ai versions that do
            # not support requires_approval in tool_plain.
            if requires_approval and use_deferred_tool_approval:
                manager = _build_approval_manager(
                    tool_id,
                    agent_id=agent_id,
                    pod_name=pod_name,
                )
                tool_fn = wrap_tool_with_approval(tool_fn, tool_id, manager)
                tool_fn.__name__ = _tool_name_to_identifier(spec.id)
            tool_plain(tool_fn)
        registered.append(tool_fn.__name__)

    if registered:
        logger.info("Registered runtime tools: %s", registered)

    return registered
