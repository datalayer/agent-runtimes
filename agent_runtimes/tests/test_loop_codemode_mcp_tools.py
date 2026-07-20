# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for sourcing MCP tool names from codemode registries.

Under codemode the MCP servers are owned by each agent's ``CodemodeToolset``
(which has its own ``ToolRegistry``) rather than the MCP lifecycle manager, so
``loop.py`` must surface those tools for listing commands and the tool-selection
guardrail.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest


@dataclass
class _FakeTool:
    name: str
    description: str = ""
    server_name: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)
    defer_loading: bool = False


class _FakeRegistry:
    def __init__(self, tools: list[_FakeTool]) -> None:
        self._tools = tools

    def list_tools(self, include_deferred: bool = False) -> list[_FakeTool]:
        if include_deferred:
            return list(self._tools)
        return [t for t in self._tools if not t.defer_loading]


class _FakeCodemodeToolset:
    def __init__(self, registry: _FakeRegistry) -> None:
        self.registry = registry


class _FakeAdapter:
    def __init__(self, toolsets: list[Any]) -> None:
        self._non_mcp_toolsets = toolsets


@pytest.fixture()
def _register_codemode_agent(monkeypatch: pytest.MonkeyPatch) -> str:
    from agent_runtimes.routes import acp

    agent_id = "agent-cm"
    tools = [
        _FakeTool(
            name="tavily__tavily_extract",
            description="Extract content from URLs",
            server_name="tavily",
            defer_loading=True,
        ),
        _FakeTool(
            name="tavily__tavily_search",
            description="Search the web",
            server_name="tavily",
        ),
    ]
    toolset = _FakeCodemodeToolset(_FakeRegistry(tools))
    adapter = _FakeAdapter([toolset])
    monkeypatch.setitem(acp._agents, agent_id, (adapter, object()))
    return agent_id


def test_known_names_include_codemode_qualified_and_bare(
    _register_codemode_agent: str,
) -> None:
    from agent_runtimes.streams.loop import get_known_mcp_tool_names

    names = get_known_mcp_tool_names()
    assert "tavily__tavily_extract" in names
    assert "tavily_extract" in names
    assert "tavily__tavily_search" in names
    assert "tavily_search" in names


def test_enabled_names_default_to_codemode_tools(
    _register_codemode_agent: str,
) -> None:
    from agent_runtimes.streams.loop import get_agent_enabled_mcp_tool_names

    enabled = get_agent_enabled_mcp_tool_names(_register_codemode_agent)
    assert "tavily_extract" in enabled
    assert "tavily_search" in enabled


def test_detailed_listing_groups_by_server(
    _register_codemode_agent: str,
) -> None:
    from agent_runtimes.streams.loop import get_codemode_mcp_tools_detailed

    by_server = get_codemode_mcp_tools_detailed()
    assert "tavily" in by_server
    tool_names = {t["name"] for t in by_server["tavily"]}
    assert tool_names == {"tavily_extract", "tavily_search"}
    for tool in by_server["tavily"]:
        assert tool["enabled"] is True


def test_approval_persists_for_codemode_tool(
    _register_codemode_agent: str,
) -> None:
    from agent_runtimes.streams.loop import (
        get_agent_approved_mcp_tool_names,
        mark_agent_mcp_tool_approved,
    )

    agent_id = _register_codemode_agent
    assert get_agent_approved_mcp_tool_names(agent_id) == set()

    assert mark_agent_mcp_tool_approved(agent_id, "tavily_extract") is True
    approved = get_agent_approved_mcp_tool_names(agent_id)
    assert "tavily_extract" in approved
