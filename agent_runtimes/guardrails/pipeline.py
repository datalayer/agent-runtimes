# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Guardrail pipeline.

Composes multiple guardrails and runs pre-tool, post-tool, and
post-request checks in sequence.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseGuardrail, GuardrailResult

logger = logging.getLogger(__name__)


class GuardrailPipeline:
    """Run all configured guardrails in sequence.

    Parameters
    ----------
    guardrails : list[BaseGuardrail]
        Ordered list of guardrails to execute.
    """

    def __init__(self, guardrails: list[BaseGuardrail] | None = None):
        self.guardrails = guardrails or []

    def add(self, guardrail: BaseGuardrail) -> None:
        """Add a guardrail to the pipeline."""
        self.guardrails.append(guardrail)
        logger.debug("Added guardrail '%s' to pipeline", guardrail.name)

    async def check_pre_tool(
        self, tool_name: str, tool_args: dict
    ) -> list[GuardrailResult]:
        """Run pre-tool checks on all guardrails.

        Raises ``GuardrailViolation`` on first failure.
        """
        results: list[GuardrailResult] = []
        for guardrail in self.guardrails:
            result = await guardrail.check_pre_tool(tool_name, tool_args)
            results.append(result)
        return results

    async def check_post_tool(
        self, tool_name: str, result: Any
    ) -> list[GuardrailResult]:
        """Run post-tool checks on all guardrails.

        Raises ``GuardrailViolation`` on first failure.
        """
        results: list[GuardrailResult] = []
        for guardrail in self.guardrails:
            gr = await guardrail.check_post_tool(tool_name, result)
            results.append(gr)
        return results

    async def check_post_request(
        self, usage: dict, **kwargs: Any
    ) -> list[GuardrailResult]:
        """Run post-request checks on all guardrails.

        Raises ``GuardrailViolation`` on first failure.
        """
        results: list[GuardrailResult] = []
        for guardrail in self.guardrails:
            gr = await guardrail.check_post_request(usage, **kwargs)
            results.append(gr)
        return results

    def reset_run_counters(self) -> None:
        """Reset per-run counters on all guardrails that support it."""
        for guardrail in self.guardrails:
            if hasattr(guardrail, "reset_run_counters"):
                guardrail.reset_run_counters()

    def get_warnings(self, results: list[GuardrailResult]) -> list[str]:
        """Extract warning messages from a list of guardrail results."""
        return [r.warning for r in results if r.warning]

    def get_actions(self, results: list[GuardrailResult]) -> list[str]:
        """Extract action strings from a list of guardrail results."""
        return [r.action for r in results if r.action]

    @classmethod
    def from_spec(cls, spec_guardrails: list[dict] | None) -> "GuardrailPipeline":
        """Build a pipeline from AgentSpec guardrail config.

        Parameters
        ----------
        spec_guardrails : list[dict] | None
            The ``guardrails`` list from an ``AgentSpec``.
            Each dict maps a guardrail type key to its config.

        Returns
        -------
        GuardrailPipeline
            A pipeline with all configured guardrails.
        """
        from .content_safety import ContentSafetyGuardrail
        from .cost_budget import CostBudgetGuardrail
        from .data_scope import DataScopeGuardrail
        from .permissions import PermissionGuardrail
        from .token_limit import TokenLimitGuardrail

        if not spec_guardrails:
            return cls()

        guardrails: list[BaseGuardrail] = []
        for entry in spec_guardrails:
            if "token_limits" in entry:
                guardrails.append(TokenLimitGuardrail.from_spec(entry["token_limits"]))
            if "cost_budget" in entry:
                guardrails.append(CostBudgetGuardrail.from_spec(entry["cost_budget"]))
            if "permissions" in entry:
                guardrails.append(PermissionGuardrail.from_spec(entry["permissions"]))
            if "data_scope" in entry:
                guardrails.append(DataScopeGuardrail.from_spec(entry["data_scope"]))
            if "content_safety" in entry:
                guardrails.append(
                    ContentSafetyGuardrail.from_spec(entry["content_safety"])
                )

        pipeline = cls(guardrails)
        logger.info(
            "Built guardrail pipeline with %d guardrails: %s",
            len(guardrails),
            [g.name for g in guardrails],
        )
        return pipeline

    def __len__(self) -> int:
        return len(self.guardrails)

    def __bool__(self) -> bool:
        return len(self.guardrails) > 0
