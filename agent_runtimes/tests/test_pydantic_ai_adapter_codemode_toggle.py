# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for codemode toggle behavior in PydanticAIAdapter."""

from typing import Any

from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter


class _FakeAgent:
    def __init__(self) -> None:
        self.model = "test:model"
        self._tools: dict[str, Any] = {}


class _DummyCodemodeToolset:
    def __init__(self, discovery_enabled: bool) -> None:
        self._agent_runtimes_discovery_enabled = discovery_enabled


def test_disable_codemode_keeps_execute_code_toolset() -> None:
    calls: list[bool] = []

    def _builder(_servers: list[Any], enable_discovery_tools: bool = True) -> Any:
        calls.append(enable_discovery_tools)
        return _DummyCodemodeToolset(enable_discovery_tools)

    adapter = PydanticAIAdapter(
        _FakeAgent(),
        name="toggle-test",
        agent_id="toggle-test",
        non_mcp_toolsets=[_DummyCodemodeToolset(True)],
        codemode_builder=_builder,
    )

    assert adapter.codemode_enabled is True

    assert adapter.set_codemode_enabled(False) is True
    assert adapter.codemode_enabled is False

    codemode_toolsets = [
        ts for ts in adapter._non_mcp_toolsets if "CodemodeToolset" in type(ts).__name__
    ]
    assert len(codemode_toolsets) == 1
    assert (
        getattr(codemode_toolsets[0], "_agent_runtimes_discovery_enabled", True)
        is False
    )
    assert calls[-1] is False


def test_enable_codemode_replaces_sandbox_only_toolset() -> None:
    calls: list[bool] = []

    def _builder(_servers: list[Any], enable_discovery_tools: bool = True) -> Any:
        calls.append(enable_discovery_tools)
        return _DummyCodemodeToolset(enable_discovery_tools)

    adapter = PydanticAIAdapter(
        _FakeAgent(),
        name="toggle-test",
        agent_id="toggle-test",
        non_mcp_toolsets=[_DummyCodemodeToolset(False)],
        codemode_builder=_builder,
    )

    assert adapter.codemode_enabled is False

    assert adapter.set_codemode_enabled(True) is True
    assert adapter.codemode_enabled is True

    codemode_toolsets = [
        ts for ts in adapter._non_mcp_toolsets if "CodemodeToolset" in type(ts).__name__
    ]
    assert len(codemode_toolsets) == 1
    assert (
        getattr(codemode_toolsets[0], "_agent_runtimes_discovery_enabled", False)
        is True
    )
    assert calls[-1] is True
