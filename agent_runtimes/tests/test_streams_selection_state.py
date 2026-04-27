# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for per-agent stream selection state (skills + MCP tools)."""

from __future__ import annotations

import pytest

from agent_runtimes.streams import loop


class TestStreamSkillsState:
    def test_set_agent_enabled_skills_defaults_to_enabled(self) -> None:
        agent_id = "skills-default-enabled"
        loop.purge_agent_stream_state(agent_id)
        try:
            snapshot = loop.set_agent_enabled_skills(agent_id, ["alpha", "beta"])
            by_id = {entry["id"]: entry for entry in snapshot}

            assert by_id["alpha"]["status"] == "enabled"
            assert by_id["beta"]["status"] == "enabled"
            assert loop.get_agent_enabled_skill_ids(agent_id) == {"alpha", "beta"}
        finally:
            loop.purge_agent_stream_state(agent_id)

    def test_set_agent_turn_enabled_skills_preserves_tracked_scope(self) -> None:
        agent_id = "skills-turn-enablement"
        loop.purge_agent_stream_state(agent_id)
        try:
            loop.set_agent_enabled_skills(agent_id, ["alpha", "beta"])
            snapshot = loop.set_agent_turn_enabled_skills(agent_id, ["alpha"])
            by_id = {entry["id"]: entry for entry in snapshot}

            assert set(by_id.keys()) == {"alpha", "beta"}
            assert by_id["alpha"]["status"] == "enabled"
            assert by_id["beta"]["status"] == "available"
            assert loop.get_agent_enabled_skill_ids(agent_id) == {"alpha"}
        finally:
            loop.purge_agent_stream_state(agent_id)

    def test_set_agent_enabled_skills_uses_catalog_metadata_when_missing(self) -> None:
        agent_id = "skills-catalog-fallback"
        loop.purge_agent_stream_state(agent_id)
        try:
            snapshot = loop.set_agent_enabled_skills(
                agent_id,
                ["text-summarizer:0.0.1"],
            )
            by_id = {entry["id"]: entry for entry in snapshot}

            assert by_id["text-summarizer"]["name"] == "Text Summarizer Skill"
            assert by_id["text-summarizer"]["status"] == "enabled"
        finally:
            loop.purge_agent_stream_state(agent_id)


class TestStreamMCPState:
    def test_set_agent_enabled_mcp_tool_names_projects_by_server(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        agent_id = "mcp-turn-enablement"
        loop.purge_agent_stream_state(agent_id)
        try:
            monkeypatch.setattr(
                loop,
                "_build_all_mcp_tools_by_server",
                lambda: {
                    "server-a": {"search_docs", "list_docs"},
                    "server-b": {"fetch_url"},
                },
            )

            result = loop.set_agent_enabled_mcp_tool_names(
                agent_id,
                ["list_docs", "fetch_url", "unknown"],
            )

            assert result == {
                "server-a": ["list_docs"],
                "server-b": ["fetch_url"],
            }
            assert loop.get_agent_enabled_mcp_tool_names(agent_id) == {
                "list_docs",
                "fetch_url",
            }
        finally:
            loop.purge_agent_stream_state(agent_id)

    def test_set_agent_enabled_mcp_tool_names_matches_normalized_aliases(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        agent_id = "mcp-normalized-aliases"
        loop.purge_agent_stream_state(agent_id)
        try:
            monkeypatch.setattr(
                loop,
                "_build_all_mcp_tools_by_server",
                lambda: {
                    "tavily": {"tavily__tavily_extract", "tavily__tavily_search"},
                },
            )

            result = loop.set_agent_enabled_mcp_tool_names(
                agent_id,
                ["tavily_extract"],
            )

            assert result == {
                "tavily": ["tavily__tavily_extract"],
            }
            assert loop.get_agent_enabled_mcp_tool_names(agent_id) == {
                "tavily__tavily_extract",
            }
        finally:
            loop.purge_agent_stream_state(agent_id)

    def test_set_agent_enabled_mcp_tool_names_ignores_non_mcp_selection(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        agent_id = "mcp-ignore-non-mcp"
        loop.purge_agent_stream_state(agent_id)
        try:
            monkeypatch.setattr(
                loop,
                "_build_all_mcp_tools_by_server",
                lambda: {
                    "server-a": {"search_docs", "list_docs"},
                },
            )

            # Establish explicit prior state.
            loop.set_agent_enabled_mcp_tool_names(agent_id, ["search_docs"])

            result = loop.set_agent_enabled_mcp_tool_names(
                agent_id,
                ["web_search_preview"],
            )

            assert result == {
                "server-a": ["search_docs"],
            }
            assert loop.get_agent_enabled_mcp_tool_names(agent_id) == {
                "search_docs",
            }
        finally:
            loop.purge_agent_stream_state(agent_id)
