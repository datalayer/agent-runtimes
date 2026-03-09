# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Base classes for the guardrail system.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


class GuardrailViolation(Exception):
    """Raised when a guardrail check fails and the action should be blocked."""

    def __init__(self, message: str, guardrail_name: str = ""):
        self.guardrail_name = guardrail_name
        super().__init__(message)


@dataclass
class GuardrailResult:
    """Result of a guardrail check.

    Attributes
    ----------
    passed : bool
        Whether the check passed.
    warning : str | None
        Optional warning message (check passed but with a concern).
    action : str | None
        Optional action to take (e.g. ``"degrade_model"``).
    metadata : dict
        Additional metadata about the check.
    """

    passed: bool = True
    warning: str | None = None
    action: str | None = None
    metadata: dict = field(default_factory=dict)


class BaseGuardrail(ABC):
    """Abstract base class for all guardrails.

    Subclasses implement one or more of:
    - ``check_pre_tool`` — before tool execution
    - ``check_post_tool`` — after tool execution
    - ``check_post_request`` — after each LLM request
    """

    name: str = "base"

    async def check_pre_tool(
        self, tool_name: str, tool_args: dict
    ) -> GuardrailResult:
        """Called before tool execution. Override to enforce pre-tool checks."""
        return GuardrailResult(passed=True)

    async def check_post_tool(
        self, tool_name: str, result: Any
    ) -> GuardrailResult:
        """Called after tool execution. Override to enforce post-tool checks."""
        return GuardrailResult(passed=True)

    async def check_post_request(
        self, usage: dict, **kwargs: Any
    ) -> GuardrailResult:
        """Called after each LLM request. Override to enforce request-level checks.

        Parameters
        ----------
        usage : dict
            Token usage from the LLM request, with keys like
            ``total_tokens``, ``input_tokens``, ``output_tokens``.
        """
        return GuardrailResult(passed=True)

    @classmethod
    def from_spec(cls, config: dict) -> "BaseGuardrail":
        """Create a guardrail instance from AgentSpec config dict.

        Subclasses should override this to parse their specific config.
        """
        raise NotImplementedError(f"{cls.__name__}.from_spec() not implemented")
