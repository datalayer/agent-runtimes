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
        "id": "worker-marketer",
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
    # Kept under the agent's own id, its agentspec's, not its name here.
    assert backend.agent_id == "worker-marketer"


def test_factory_memory_is_the_agentspec_s_on_any_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Every cloud runtime names its agent `default`: a new runtime for the
    # same agent and user must reach the same memories, and another agent's
    # memories never.
    from agent_runtimes.memory import get_memory_backend

    monkeypatch.setenv("DATALAYER_USER_UID", "user-123")
    monkeypatch.delenv("AGENT_RUNTIMES_MEMORY_USER_ID", raising=False)

    def backend_of(spec_id: str) -> object:
        caps = build_capabilities_from_agent_spec(
            _spec(id=spec_id, memory="mem0"), agent_id="default"
        )
        [cap] = [c for c in caps if isinstance(c, MemoryCapability)]
        # The memory routes find it by the agent's name on the runtime.
        assert get_memory_backend("default") is cap.backend
        return cap.backend

    first, second = backend_of("worker-marketer"), backend_of("worker-marketer")
    assert (first.user_id, first.agent_id) == (second.user_id, second.agent_id)
    other = backend_of("worker-researcher")
    assert other.agent_id == "worker-researcher" != first.agent_id


def test_factory_refuses_memory_without_an_agentspec_id() -> None:
    with pytest.raises(ValueError, match="agentspec's id"):
        build_capabilities_from_agent_spec(_spec(id="", memory="mem0"), agent_id="a1")


def test_factory_skips_memory_for_ephemeral() -> None:
    caps = build_capabilities_from_agent_spec(_spec(memory="ephemeral"), agent_id="a1")
    assert not any(isinstance(c, MemoryCapability) for c in caps)
