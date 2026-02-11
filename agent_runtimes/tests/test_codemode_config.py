# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for codemode configuration wiring in agent-runtimes."""

from types import SimpleNamespace
from typing import Any, Callable, Optional

import pytest

from agent_runtimes.routes.agents import CreateAgentRequest, _build_codemode_toolset


class _DummyApp:
    def __init__(self, reranker: Optional[Callable[..., Any]] = None) -> None:
        self.state = SimpleNamespace(codemode_tool_reranker=reranker)


class _DummyRequest:
    def __init__(self, reranker: Optional[Callable[..., Any]] = None) -> None:
        self.app = _DummyApp(reranker=reranker)


@pytest.mark.asyncio
async def test_codemode_reranker_wiring() -> None:
    """Test that codemode toolset is created successfully.

    Note: The tool_reranker feature is no longer wired through the factory.
    This test now just verifies basic toolset creation.
    """
    request = CreateAgentRequest(
        name="test-agent",
        enable_codemode=True,
        enable_tool_reranker=True,
    )
    toolset = _build_codemode_toolset(request, _DummyRequest(), sandbox=None)

    if toolset is None:
        pytest.skip("agent-codemode not available")

    # Verify toolset was created (tool_reranker no longer part of factory pattern)
    assert toolset is not None


@pytest.mark.asyncio
async def test_codemode_direct_call_override() -> None:
    request = CreateAgentRequest(
        name="test-agent",
        enable_codemode=True,
        allow_direct_tool_calls=True,
    )
    toolset = _build_codemode_toolset(request, _DummyRequest(), sandbox=None)

    if toolset is None:
        pytest.skip("agent-codemode not available")

    assert toolset.allow_direct_tool_calls is True
