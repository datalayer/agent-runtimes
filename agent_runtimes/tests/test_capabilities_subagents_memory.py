# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests that the capability factory wires subagents and memory."""

from __future__ import annotations

from types import SimpleNamespace

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.memory import MemoryCapability
from agent_runtimes.subagents import SubagentsCapability
from agent_runtimes.types import SubAgentsConfig, SubAgentspecConfig


def _spec(**overrides: object) -> SimpleNamespace:
    base: dict[str, object] = {
        "model": "openai:gpt-4.1",
        "guardrails": None,
        "capabilities": None,
        "advanced": None,
        "subagents": None,
        "memory": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_factory_adds_subagents_capability() -> None:
    cfg = SubAgentsConfig(
        subagents=[
            SubAgentspecConfig(name="r", description="d", instructions="i"),
        ],
        include_general_purpose=False,
    )
    caps = build_capabilities_from_agent_spec(_spec(subagents=cfg), agent_id="a1")
    assert any(isinstance(c, SubagentsCapability) for c in caps)


def test_factory_adds_memory_capability_for_mem0() -> None:
    caps = build_capabilities_from_agent_spec(_spec(memory="mem0"), agent_id="a1")
    assert any(isinstance(c, MemoryCapability) for c in caps)


def test_factory_skips_memory_for_ephemeral() -> None:
    caps = build_capabilities_from_agent_spec(_spec(memory="ephemeral"), agent_id="a1")
    assert not any(isinstance(c, MemoryCapability) for c in caps)
