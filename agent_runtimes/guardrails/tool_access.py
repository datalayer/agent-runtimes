# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tool-access and permission guardrail capabilities."""

from __future__ import annotations

import inspect
import re
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from .common import GuardrailBlockedError


@dataclass
class ToolGuardCapability(AbstractCapability[Any]):
    """Block or require approval for tool calls."""

    blocked: list[str] = field(default_factory=list)
    require_approval: list[str] = field(default_factory=list)
    approval_callback: Any = None

    async def prepare_tools(
        self, ctx: RunContext[Any], tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition]:
        if not self.blocked:
            return tool_defs
        blocked = set(self.blocked)
        return [td for td in tool_defs if td.name not in blocked]

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        if call.tool_name not in self.require_approval:
            return args
        if self.approval_callback is None:
            raise GuardrailBlockedError(
                f"Tool '{call.tool_name}' requires approval but no callback is configured"
            )
        decision = self.approval_callback(call.tool_name, args)
        if inspect.isawaitable(decision):
            decision = await decision
        if not decision:
            raise GuardrailBlockedError(
                f"Tool '{call.tool_name}' denied by approval callback"
            )
        return args


@dataclass
class PermissionCapability(AbstractCapability[Any]):
    """Permission gate for tools based on spec permission flags."""

    permissions: dict[str, bool] = field(default_factory=dict)
    tool_permission_map: dict[str, list[str]] = field(default_factory=dict)

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        required = self._classify_tool(call.tool_name)
        denied = [perm for perm in required if not self.permissions.get(perm, True)]
        if denied:
            raise GuardrailBlockedError(
                f"Permission denied ({', '.join(denied)}) for tool '{call.tool_name}'"
            )
        return args

    def _classify_tool(self, tool_name: str) -> list[str]:
        perms: list[str] = []
        for pattern, required in self.tool_permission_map.items():
            if re.search(pattern, tool_name, re.IGNORECASE):
                perms.extend(required)
        return sorted(set(perms))


DEFAULT_TOOL_PERMISSION_MAP: dict[str, list[str]] = {
    "read_file": ["read:data"],
    "write_file": ["write:data"],
    "execute": ["execute:code"],
    "run_python": ["execute:code"],
    "http|fetch|request": ["access:internet"],
    "email": ["send:email"],
    "deploy": ["deploy:production"],
}
