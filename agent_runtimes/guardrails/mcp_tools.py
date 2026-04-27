# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""MCP tool-selection and approval guardrail capability."""

from __future__ import annotations

import ast
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

    def _tool_name_candidates(self, raw_tool_name: str) -> set[str]:
        stripped = raw_tool_name.strip()
        if not stripped:
            return set()
        normalized = self._normalize_mcp_tool_name(stripped)
        candidates = {stripped, normalized}

        # Expand with known aliases (e.g. prefixed ``server__tool`` names)
        # so codemode imports such as ``from generated.mcp.tavily import
        # tavily_extract`` can be matched reliably.
        for known in self._known_mcp_tool_names():
            if self._normalize_mcp_tool_name(known) == normalized:
                candidates.add(known)

        return {name for name in candidates if name}

    def _resolve_mcp_tool_name(
        self,
        raw_tool_name: str,
        *,
        server_hint: str | None = None,
    ) -> str:
        stripped = raw_tool_name.strip()
        if not stripped:
            return raw_tool_name

        known = self._known_mcp_tool_names()
        if stripped in known:
            return stripped

        normalized = self._normalize_mcp_tool_name(stripped)
        if server_hint:
            hinted = f"{server_hint}__{normalized}"
            if hinted in known:
                return hinted

        aliases = {
            name for name in known if self._normalize_mcp_tool_name(name) == normalized
        }
        if len(aliases) == 1:
            return next(iter(aliases))
        if normalized in known:
            return normalized
        return stripped

    def _is_mcp_tool_name(self, tool_name: str) -> bool:
        known_aliases: set[str] = set()
        for name in self._known_mcp_tool_names():
            known_aliases.add(name)
            known_aliases.add(self._normalize_mcp_tool_name(name))
        return bool(self._tool_name_candidates(tool_name) & known_aliases)

    def _assert_allowed_mcp_tool(self, raw_tool_name: str) -> None:
        enabled_aliases: set[str] = set()
        for name in self._enabled_tool_names():
            enabled_aliases.add(name)
            enabled_aliases.add(self._normalize_mcp_tool_name(name))

        if not (self._tool_name_candidates(raw_tool_name) & enabled_aliases):
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
        approved_aliases: set[str] = set()
        for name in self._approved_tool_names():
            approved_aliases.add(name)
            approved_aliases.add(self._normalize_mcp_tool_name(name))

        if self._tool_name_candidates(raw_tool_name) & approved_aliases:
            return
        manager = self._get_approval_manager()
        await manager.request_and_wait(
            tool_name=raw_tool_name,
            tool_args={k: str(v)[:500] for k, v in args.items()},
        )

    @staticmethod
    def _extract_mcp_references_from_code(code: str) -> set[tuple[str, str | None]]:
        """Extract MCP tool references from execute_code payload.

        Returns tuples of ``(tool_name, server_hint)`` where ``server_hint`` is
        available for ``generated.mcp.<server>`` imports.
        """
        extracted: set[tuple[str, str | None]] = set()

        try:
            tree = ast.parse(code)
        except SyntaxError:
            tree = None

        if tree is not None:
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.ImportFrom)
                    and isinstance(node.module, str)
                    and node.module.startswith("generated.mcp.")
                ):
                    parts = node.module.split(".")
                    server_hint = parts[2] if len(parts) >= 3 else None
                    for alias in node.names:
                        imported_name = alias.name.strip()
                        if imported_name and imported_name != "*":
                            extracted.add((imported_name, server_hint))

                if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                    if node.func.id != "call_tool" or not node.args:
                        continue
                    first = node.args[0]
                    if isinstance(first, ast.Constant) and isinstance(first.value, str):
                        raw = first.value.strip()
                        if raw:
                            extracted.add((raw, None))

            return extracted

        # Regex fallback for syntactically incomplete snippets.
        for match in re.finditer(
            r"from\s+generated\.mcp\.([A-Za-z0-9_\-]+)\s+import\s+([A-Za-z0-9_\-,\s]+)",
            code,
        ):
            server_hint = match.group(1)
            chunk = match.group(2)
            for part in chunk.split(","):
                name = part.strip()
                if name:
                    extracted.add((name, server_hint))

        for raw in re.findall(r"call_tool\s*\(\s*['\"]([^'\"]+)['\"]", code):
            stripped = raw.strip()
            if stripped:
                extracted.add((stripped, None))

        return extracted

    async def _enforce_execute_code_payload(self, args: dict[str, Any]) -> None:
        code = args.get("code")
        if not isinstance(code, str) or not code.strip():
            return

        requested: set[str] = set()
        for raw_name, server_hint in sorted(
            self._extract_mcp_references_from_code(code)
        ):
            resolved_name = self._resolve_mcp_tool_name(
                raw_name,
                server_hint=server_hint,
            )

            # ``generated.mcp.<server>`` imports should always be treated as
            # MCP tool references in codemode, even if the known-tools cache
            # is temporarily empty.
            from_generated_import = server_hint is not None
            if not from_generated_import and not self._is_mcp_tool_name(resolved_name):
                continue
            self._assert_allowed_mcp_tool(resolved_name)
            requested.add(resolved_name)

        for tool_name in sorted(requested):
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
