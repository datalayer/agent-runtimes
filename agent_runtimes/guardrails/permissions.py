# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Permission guardrail.

Enforces read/write/execute/access permission flags from the AgentSpec.
Maps tool invocations to required permissions and blocks unauthorized calls.
"""

from __future__ import annotations

import logging

from .base import BaseGuardrail, GuardrailResult, GuardrailViolation

logger = logging.getLogger(__name__)

# Default tool → permission mappings.
# Keys are regex-matched against tool names.
_DEFAULT_TOOL_PERMISSIONS: dict[str, list[str]] = {
    "read_file": ["read:data"],
    "write_file": ["write:data"],
    "execute_code": ["execute:code"],
    "run_python": ["execute:code"],
    "fetch": ["access:internet"],
    "http_request": ["access:internet"],
    "send_email": ["send:email"],
    "deploy": ["deploy:production"],
}


class PermissionGuardrail(BaseGuardrail):
    """Enforce permission flags on tool execution.

    Spec example::

        permissions:
          read:data: true
          write:data: false
          execute:code: true
          access:internet: false
          send:email: false
          deploy:production: false

    Parameters
    ----------
    permissions : dict[str, bool]
        Permission key → allowed mapping.
    tool_permission_map : dict[str, list[str]] | None
        Custom tool-name → required-permissions mapping.
    """

    name = "permission"

    def __init__(
        self,
        permissions: dict[str, bool],
        tool_permission_map: dict[str, list[str]] | None = None,
    ):
        self.permissions = permissions
        self.tool_permission_map = tool_permission_map or _DEFAULT_TOOL_PERMISSIONS

    async def check_pre_tool(self, tool_name: str, tool_args: dict) -> GuardrailResult:
        """Check whether the tool call satisfies all required permissions."""
        required_perms = self._classify_tool(tool_name, tool_args)
        denied = []
        for perm in required_perms:
            if not self.permissions.get(perm, True):
                denied.append(perm)
        if denied:
            raise GuardrailViolation(
                f"Permission denied: {', '.join(denied)} required by tool '{tool_name}'",
                guardrail_name=self.name,
            )
        return GuardrailResult(passed=True)

    def _classify_tool(self, tool_name: str, tool_args: dict) -> list[str]:
        """Map a tool invocation to its required permission keys.

        Uses the ``tool_permission_map``, falling back to substring matching
        against default mappings.
        """
        import re

        perms: list[str] = []
        for pattern, required in self.tool_permission_map.items():
            if re.search(pattern, tool_name, re.IGNORECASE):
                perms.extend(required)
        return list(set(perms))

    @classmethod
    def from_spec(cls, config: dict) -> "PermissionGuardrail":
        """Build from AgentSpec guardrail config."""
        permissions = {k: v for k, v in config.items() if isinstance(v, bool)}
        tool_map = config.get("tool_permission_map")
        return cls(permissions=permissions, tool_permission_map=tool_map)
