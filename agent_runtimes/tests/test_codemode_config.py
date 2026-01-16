# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for codemode configuration wiring in agent-runtimes."""

from types import SimpleNamespace

import pytest

from agent_runtimes.routes.agents import CreateAgentRequest, _build_codemode_toolset


class _DummyApp:
    def __init__(self, reranker=None):
        self.state = SimpleNamespace(codemode_tool_reranker=reranker)


class _DummyRequest:
    def __init__(self, reranker=None):
        self.app = _DummyApp(reranker=reranker)


@pytest.mark.asyncio
async def test_codemode_reranker_wiring():
    async def reranker(tools, query, server):
        return tools

    request = CreateAgentRequest(
        name="test-agent",
        enable_codemode=True,
        enable_tool_reranker=True,
    )
    toolset = _build_codemode_toolset(request, _DummyRequest(reranker=reranker))

    if toolset is None:
        pytest.skip("mcp-codemode not available")

    assert toolset.tool_reranker is reranker


@pytest.mark.asyncio
async def test_codemode_direct_call_override():
    request = CreateAgentRequest(
        name="test-agent",
        enable_codemode=True,
        allow_direct_tool_calls=True,
    )
    toolset = _build_codemode_toolset(request, _DummyRequest())

    if toolset is None:
        pytest.skip("mcp-codemode not available")

    assert toolset.allow_direct_tool_calls is True
