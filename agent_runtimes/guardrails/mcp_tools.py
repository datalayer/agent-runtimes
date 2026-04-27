# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""MCP tool-selection and approval guardrail capability."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from .common import GuardrailBlockedError


@dataclass
class MCPToolsGuardrailCapability(AbstractCapability[Any]):
    """Ensure disabled MCP tools cannot be invoked even when prompted."""

    agent_id: str | None = None
    _approval_manager: Any = field(default=None, init=False, repr=False)

    def _enabled_tool_names(self) -> set[str]:
        try:
            from agent_runtimes.streams.loop import get_agent_enabled_mcp_tool_names

            return get_agent_enabled_mcp_tool_names(self.agent_id)
        except Exception:
            return set()

    def _approved_tool_names(self) -> set[str]:
        try:
            from agent_runtimes.streams.loop import get_agent_approved_mcp_tool_names

            return get_agent_approved_mcp_tool_names(self.agent_id)
        except Exception:
            return set()

    def _known_mcp_tool_names(self) -> set[str]:
        try:
            from agent_runtimes.streams.loop import get_known_mcp_tool_names

            return get_known_mcp_tool_names()
        except Exception:
            return set()

    @staticmethod
    def _normalize_mcp_tool_name(name: str) -> str:
        # codemode-style fully qualified name: "server__tool"
        if "__" in name:
            return name.split("__", 1)[1]
        return name

    def _is_mcp_tool_name(self, tool_name: str) -> bool:
        known = self._known_mcp_tool_names()
        normalized = self._normalize_mcp_tool_name(tool_name)
        return tool_name in known or normalized in known

    def _assert_allowed_mcp_tool(self, raw_tool_name: str) -> None:
        enabled = self._enabled_tool_names()
        normalized = self._normalize_mcp_tool_name(raw_tool_name)
        if normalized not in enabled:
            raise GuardrailBlockedError(
                f"MCP tool '{raw_tool_name}' is disabled by user selection"
            )

    def _get_approval_manager(self) -> Any:
        if self._approval_manager is None:
            from .tool_approvals import ToolApprovalConfig, ToolApprovalManager

            config = ToolApprovalConfig.from_env()
            config.agent_id = self.agent_id or config.agent_id
            self._approval_manager = ToolApprovalManager(config)
        return self._approval_manager

    async def _request_tool_approval(
        self,
        raw_tool_name: str,
        args: dict[str, Any],
    ) -> None:
        normalized = self._normalize_mcp_tool_name(raw_tool_name)
        if normalized in self._approved_tool_names():
            return
        manager = self._get_approval_manager()
        await manager.request_and_wait(
            tool_name=raw_tool_name,
            tool_args={k: str(v)[:500] for k, v in args.items()},
        )

    async def _enforce_execute_code_payload(self, args: dict[str, Any]) -> None:
        code = args.get("code")
        if not isinstance(code, str) or not code.strip():
            return

        imported_tools = set(
            re.findall(
                r"generated\.mcp\.[A-Za-z0-9_\-]+\s+import\s+([A-Za-z0-9_\-,\s]+)",
                code,
            )
        )
        extracted: set[str] = set()
        for chunk in imported_tools:
            for part in chunk.split(","):
                name = part.strip()
                if name:
                    extracted.add(name)

        call_tool_refs = set(re.findall(r"call_tool\s*\(\s*['\"]([^'\"]+)['\"]", code))
        extracted |= call_tool_refs

        for tool_name in sorted(extracted):
            if self._is_mcp_tool_name(tool_name):
                self._assert_allowed_mcp_tool(tool_name)
                await self._request_tool_approval(
                    tool_name,
                    {"source_tool": "execute_code", "tool_name": tool_name},
                )

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        tool_name = call.tool_name

        if tool_name == "call_tool":
            requested = args.get("tool_name") or args.get("tool")
            if isinstance(requested, str) and requested.strip():
                raw_tool_name = requested.strip()
                self._assert_allowed_mcp_tool(raw_tool_name)
                await self._request_tool_approval(raw_tool_name, args)
            return args

        if self._is_mcp_tool_name(tool_name):
            self._assert_allowed_mcp_tool(tool_name)
            await self._request_tool_approval(tool_name, args)
            return args

        if tool_name == "execute_code":
            await self._enforce_execute_code_payload(args)

        return args
