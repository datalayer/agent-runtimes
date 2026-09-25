# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests that the capability factory wires subagents and memory."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

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


def test_factory_memory_isolates_by_trusted_user_not_agent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The memory partition key must be the trusted runtime owner (personal
    # account), never the agent id, so two users sharing an agent id never
    # share memories.
    for name in (
        "AGENT_RUNTIMES_MEMORY_USER_ID",
        "DATALAYER_USER_HANDLE",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("DATALAYER_USER_UID", "user-123")

    caps = build_capabilities_from_agent_spec(_spec(memory="mem0"), agent_id="a1")
    memory_caps = [c for c in caps if isinstance(c, MemoryCapability)]
    assert memory_caps
    backend = memory_caps[0].backend
    assert backend.user_id == "user-123"
    assert backend.user_id != "a1"
    assert backend.agent_id == "a1"


def test_factory_skips_memory_for_ephemeral() -> None:
    caps = build_capabilities_from_agent_spec(_spec(memory="ephemeral"), agent_id="a1")
    assert not any(isinstance(c, MemoryCapability) for c in caps)
