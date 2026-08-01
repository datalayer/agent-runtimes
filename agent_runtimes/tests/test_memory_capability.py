# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the in-repo memory capability."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from agent_runtimes.memory import (
    EphemeralMemory,
    MemoryCapability,
    build_memory_capability,
    get_memory_backend,
)


def test_build_returns_none_for_ephemeral() -> None:
    assert build_memory_capability(None) is None
    assert build_memory_capability("ephemeral") is None


def test_build_returns_capability_for_mem0() -> None:
    cap = build_memory_capability("mem0", user_id="u1", agent_id="a1")
    assert isinstance(cap, MemoryCapability)


def test_capability_registers_backend_by_agent_id() -> None:
    backend = EphemeralMemory()
    MemoryCapability(backend=backend, agent_id="agent-mem-1")
    assert get_memory_backend("agent-mem-1") is backend


@pytest.mark.asyncio
async def test_list_all_returns_recent_entries() -> None:
    backend = EphemeralMemory()
    await backend.add([{"role": "user", "content": "first fact"}])
    await backend.add([{"role": "user", "content": "second fact"}])
    entries = await backend.list_all()
    contents = [entry["content"] for entry in entries]
    assert "first fact" in contents
    assert "second fact" in contents


@pytest.mark.asyncio
async def test_retrieval_injects_stored_memory() -> None:
    backend = EphemeralMemory()
    await backend.add([{"role": "user", "content": "the user prefers dark mode"}])
    cap = MemoryCapability(backend=backend)
    ctx = SimpleNamespace(prompt="dark mode", run_id="run-1")

    await cap.before_run(ctx)
    instructions = cap.get_instructions()
    text = await instructions(ctx)
    assert "dark mode" in text.lower()


@pytest.mark.asyncio
async def test_after_run_persists_turn_and_clears_cache() -> None:
    backend = EphemeralMemory()
    cap = MemoryCapability(backend=backend)
    ctx = SimpleNamespace(prompt="remember blue", run_id="run-2")

    await cap.before_run(ctx)
    result = SimpleNamespace(output="stored blue")
    returned = await cap.after_run(ctx, result=result)
    assert returned is result

    # The user prompt and assistant answer are now searchable.
    stored = await backend.search("blue")
    contents = " ".join(entry["content"] for entry in stored)
    assert "remember blue" in contents
    assert "stored blue" in contents

    # Cache for the run is cleared so later requests get no stale context.
    instructions = cap.get_instructions()
    assert await instructions(ctx) == ""


@pytest.mark.asyncio
async def test_no_persistence_when_auto_store_disabled() -> None:
    backend = EphemeralMemory()
    cap = MemoryCapability(backend=backend, auto_store=False)
    ctx = SimpleNamespace(prompt="do not store", run_id="run-3")

    result = SimpleNamespace(output="answer")
    await cap.after_run(ctx, result=result)

    assert await backend.search("store") == []


def test_tools_absent_when_disabled() -> None:
    cap = MemoryCapability(backend=EphemeralMemory(), expose_tools=False)
    assert cap.get_toolset() is None


def test_tools_present_when_enabled() -> None:
    cap = MemoryCapability(backend=EphemeralMemory())
    toolset = cap.get_toolset()
    assert toolset is not None
    tool_names = set(getattr(toolset, "tools", {}).keys())
    assert {"search_memory", "remember"} <= tool_names


def test_build_forwards_memory_config(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, object] = {}

    class FakeBackend(EphemeralMemory):
        pass

    def _fake_create(
        memory_type: str | None,
        user_id: str = "default",
        agent_id: str | None = None,
        config: dict[str, object] | None = None,
    ) -> FakeBackend:
        seen["memory_type"] = memory_type
        seen["user_id"] = user_id
        seen["agent_id"] = agent_id
        seen["config"] = config
        return FakeBackend()

    monkeypatch.setattr(
        "agent_runtimes.memory.capability.create_memory_backend", _fake_create
    )

    cfg = {"vector_store": {"provider": "sqlite", "config": {"path": "/tmp/mem.db"}}}
    cap = build_memory_capability("mem0", user_id="u2", agent_id="a2", config=cfg)
    assert isinstance(cap, MemoryCapability)
    assert seen["memory_type"] == "mem0"
    assert seen["user_id"] == "u2"
    assert seen["agent_id"] == "a2"
    assert seen["config"] == cfg
