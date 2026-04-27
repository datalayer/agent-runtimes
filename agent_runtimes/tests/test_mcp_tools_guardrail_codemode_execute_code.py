# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Regression tests for MCP tool approvals in codemode execute_code payloads."""

from __future__ import annotations

from typing import Any, cast

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.guardrails.common import GuardrailBlockedError
from agent_runtimes.guardrails.mcp_tools import MCPToolsGuardrailCapability


class _ApprovalManager:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    async def request_and_wait(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        tool_call_id: str | None = None,
    ) -> dict[str, str]:
        del tool_call_id
        self.calls.append((tool_name, tool_args))
        return {"status": "approved", "id": "approval-1", "tool_name": tool_name}


@pytest.mark.asyncio
async def test_execute_code_import_resolves_qualified_tool_and_requests_approval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = MCPToolsGuardrailCapability(agent_id="agent-1")
    manager = _ApprovalManager()

    capability._approval_manager = manager
    monkeypatch.setattr(
        capability,
        "_known_mcp_tool_names",
        lambda: {"tavily__tavily_extract"},
    )
    monkeypatch.setattr(
        capability,
        "_enabled_tool_names",
        lambda: {"tavily__tavily_extract"},
    )
    monkeypatch.setattr(capability, "_approved_tool_names", lambda: set())

    code = """
from generated.mcp.tavily import tavily_extract
about_datalayer = await tavily_extract(urls=[\"https://datalayer.ai\"])
"""

    await capability.before_tool_execute(
        cast(Any, None),
        call=ToolCallPart(
            tool_name="execute_code",
            args={"code": code},
            tool_call_id="tool-1",
        ),
        tool_def=cast(Any, None),
        args={"code": code},
    )

    assert len(manager.calls) == 1
    tool_name, _tool_args = manager.calls[0]
    assert tool_name == "tavily__tavily_extract"


@pytest.mark.asyncio
async def test_execute_code_import_blocks_disabled_qualified_tool(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = MCPToolsGuardrailCapability(agent_id="agent-1")

    monkeypatch.setattr(
        capability,
        "_known_mcp_tool_names",
        lambda: {"tavily__tavily_extract"},
    )
    monkeypatch.setattr(capability, "_enabled_tool_names", lambda: set())
    monkeypatch.setattr(capability, "_approved_tool_names", lambda: set())

    code = """
from generated.mcp.tavily import tavily_extract
about_datalayer = await tavily_extract(urls=[\"https://datalayer.ai\"])
"""

    with pytest.raises(
        GuardrailBlockedError,
        match="disabled by user selection",
    ):
        await capability.before_tool_execute(
            cast(Any, None),
            call=ToolCallPart(
                tool_name="execute_code",
                args={"code": code},
                tool_call_id="tool-2",
            ),
            tool_def=cast(Any, None),
            args={"code": code},
        )


@pytest.mark.asyncio
async def test_execute_code_import_skips_request_when_tool_already_approved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    capability = MCPToolsGuardrailCapability(agent_id="agent-1")
    manager = _ApprovalManager()

    capability._approval_manager = manager
    monkeypatch.setattr(
        capability,
        "_known_mcp_tool_names",
        lambda: {"tavily__tavily_extract"},
    )
    monkeypatch.setattr(
        capability,
        "_enabled_tool_names",
        lambda: {"tavily__tavily_extract"},
    )
    monkeypatch.setattr(
        capability,
        "_approved_tool_names",
        lambda: {"tavily__tavily_extract"},
    )

    code = """
from generated.mcp.tavily import tavily_extract
about_datalayer = await tavily_extract(urls=[\"https://datalayer.ai\"])
"""

    await capability.before_tool_execute(
        cast(Any, None),
        call=ToolCallPart(
            tool_name="execute_code",
            args={"code": code},
            tool_call_id="tool-3",
        ),
        tool_def=cast(Any, None),
        args={"code": code},
    )

    assert manager.calls == []
