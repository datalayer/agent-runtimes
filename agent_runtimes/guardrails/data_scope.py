# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Data scope guardrail.

Restricts which systems, objects, and fields the agent can access
through its tools. Inspects tool arguments and results to enforce
allow/deny lists.
"""

from __future__ import annotations

import fnmatch
import logging
from typing import Any

from .base import BaseGuardrail, GuardrailResult, GuardrailViolation

logger = logging.getLogger(__name__)


class DataScopeGuardrail(BaseGuardrail):
    """Enforce data scope restrictions.

    Spec example::

        data_scope:
          allowed_systems: [salesforce]
          allowed_objects: [Opportunity, Account, User]
          denied_objects: [Contact, Lead, EmailMessage]
          denied_fields: ["Account.Phone", "*SSN*", "*Bank*"]

    Parameters
    ----------
    allowed_systems : list[str]
        Only these systems may be accessed (empty = all allowed).
    allowed_objects : list[str]
        Only these objects/tables may be queried (empty = all allowed).
    denied_objects : list[str]
        These objects/tables are explicitly blocked.
    denied_fields : list[str]
        Glob patterns for field names that must not appear in results.
    """

    name = "data_scope"

    def __init__(
        self,
        allowed_systems: list[str] | None = None,
        allowed_objects: list[str] | None = None,
        denied_objects: list[str] | None = None,
        denied_fields: list[str] | None = None,
    ):
        self.allowed_systems = set(allowed_systems or [])
        self.allowed_objects = set(allowed_objects or [])
        self.denied_objects = set(denied_objects or [])
        self.denied_field_patterns = denied_fields or []

    async def check_pre_tool(self, tool_name: str, tool_args: dict) -> GuardrailResult:
        """Inspect tool arguments for system/object references and enforce scope."""
        # Extract references from common argument patterns
        system = tool_args.get("system") or tool_args.get("datasource") or ""
        obj = (
            tool_args.get("object")
            or tool_args.get("table")
            or tool_args.get("collection")
            or ""
        )
        query = tool_args.get("query", "")

        # Check system scope
        if self.allowed_systems and system and system not in self.allowed_systems:
            raise GuardrailViolation(
                f"Data scope: system '{system}' not in allowed list {self.allowed_systems}",
                guardrail_name=self.name,
            )

        # Check object scope
        if obj:
            if self.denied_objects and obj in self.denied_objects:
                raise GuardrailViolation(
                    f"Data scope: object '{obj}' is in denied list",
                    guardrail_name=self.name,
                )
            if self.allowed_objects and obj not in self.allowed_objects:
                raise GuardrailViolation(
                    f"Data scope: object '{obj}' not in allowed list {self.allowed_objects}",
                    guardrail_name=self.name,
                )

        return GuardrailResult(passed=True)

    async def check_post_tool(self, tool_name: str, result: Any) -> GuardrailResult:
        """Inspect tool results to ensure no denied fields leak through."""
        if not self.denied_field_patterns:
            return GuardrailResult(passed=True)

        result_str = str(result)
        for pattern in self.denied_field_patterns:
            # Check if any denied field pattern matches in the result
            if fnmatch.fnmatch(result_str, f"*{pattern}*"):
                logger.warning(
                    "Data scope: denied field pattern '%s' found in tool '%s' result",
                    pattern,
                    tool_name,
                )
                raise GuardrailViolation(
                    f"Data scope: result contains denied field pattern '{pattern}'",
                    guardrail_name=self.name,
                )

        return GuardrailResult(passed=True)

    @classmethod
    def from_spec(cls, config: dict) -> "DataScopeGuardrail":
        """Build from AgentSpec guardrail config."""
        return cls(
            allowed_systems=config.get("allowed_systems"),
            allowed_objects=config.get("allowed_objects"),
            denied_objects=config.get("denied_objects"),
            denied_fields=config.get("denied_fields"),
        )
