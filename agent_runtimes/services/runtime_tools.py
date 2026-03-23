# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Runtime tools registry and Pydantic AI wiring.

This module maps generated tool specs to concrete Python callables and
registers them into a ``pydantic_ai.Agent`` instance.
"""

from __future__ import annotations

import logging
from typing import Callable, List

from agent_runtimes.specs.tools import get_tool_spec
from agent_runtimes.types import ToolSpec

from ..guardrails.tool_approval import (
    ToolApprovalConfig,
    ToolApprovalManager,
    wrap_tool_with_approval,
)

logger = logging.getLogger(__name__)


async def runtime_echo(text: str) -> str:
    """Echo input text back to the caller."""
    return text


async def runtime_sensitive_echo(text: str, reason: str | None = None) -> str:
    """Echo input text and optional reason after approval."""
    if reason:
        return f"{text} (reason: {reason})"
    return text


TOOL_IMPLEMENTATIONS: dict[str, Callable[..., object]] = {
    "runtime-echo": runtime_echo,
    "runtime-sensitive-echo": runtime_sensitive_echo,
}


def _tool_name_to_identifier(tool_name: str) -> str:
    """Convert spec tool IDs to Python identifiers used by tool_plain."""
    return tool_name.replace("-", "_")


def _build_approval_manager(tool_id: str) -> ToolApprovalManager:
    cfg = ToolApprovalConfig.from_spec({"tools": [tool_id]})
    return ToolApprovalManager(cfg)


def register_agent_tools(agent: object, tool_ids: List[str]) -> list[str]:
    """Register runtime tools on a pydantic_ai.Agent instance.

    Args:
        agent: Pydantic AI Agent instance exposing ``tool_plain``.
        tool_ids: Tool IDs from AgentSpec.

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

    for tool_id in tool_ids:
        spec: ToolSpec | None = get_tool_spec(tool_id)
        if spec is None:
            logger.warning("Tool '%s' not found in TOOL_CATALOG; skipping", tool_id)
            continue
        if not spec.enabled:
            logger.info("Tool '%s' is disabled; skipping", tool_id)
            continue

        impl = TOOL_IMPLEMENTATIONS.get(tool_id)
        if impl is None:
            logger.warning("No Python implementation for tool '%s'; skipping", tool_id)
            continue

        tool_fn = impl
        if spec.approval == "manual":
            manager = _build_approval_manager(tool_id)
            tool_fn = wrap_tool_with_approval(tool_fn, tool_id, manager)

        # Ensure function name is a valid Python identifier for pydantic_ai.
        tool_fn.__name__ = _tool_name_to_identifier(tool_id)

        tool_plain(tool_fn)
        registered.append(tool_fn.__name__)

    if registered:
        logger.info("Registered runtime tools: %s", registered)

    return registered
