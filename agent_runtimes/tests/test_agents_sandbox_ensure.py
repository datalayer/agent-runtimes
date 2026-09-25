# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``/agents/{id}/sandbox/ensure``: idempotent bare, a switch with a variant."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes.agents import (
    EnsureAgentSandboxRequest,
    ensure_agent_sandbox,
)


class _Manager:
    def __init__(self, existing: str | None) -> None:
        self.sandboxes: dict[str, SimpleNamespace] = {}
        if existing:
            self.sandboxes["a1"] = SimpleNamespace(variant=existing)
        self.stopped: list[str] = []
        self.created: list[tuple[str, str]] = []

    def get_agent_sandbox(self, agent_id: str):
        return self.sandboxes.get(agent_id)

    def stop_agent_sandbox(self, agent_id: str) -> None:
        self.stopped.append(agent_id)
        self.sandboxes.pop(agent_id, None)

    def create_agent_sandbox(self, agent_id: str, variant: str = "eval", **_: object):
        self.created.append((agent_id, variant))
        self.sandboxes[agent_id] = SimpleNamespace(variant=variant)
        return self.sandboxes[agent_id]

    def get_status(self) -> dict:
        sandbox = self.sandboxes.get("a1")
        return {
            "variant": sandbox.variant if sandbox else "eval",
            "sandbox_running": sandbox is not None,
            "agent_sandboxes": list(self.sandboxes),
        }


@pytest.fixture
def manager(monkeypatch: pytest.MonkeyPatch):
    holder: dict[str, _Manager] = {}

    def install(existing: str | None) -> _Manager:
        holder["m"] = _Manager(existing)
        monkeypatch.setattr(
            "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
            lambda: holder["m"],
        )
        return holder["m"]

    return install


@pytest.mark.asyncio
async def test_bare_call_creates_a_jupyter_sandbox_once(manager) -> None:
    m = manager(None)
    await ensure_agent_sandbox("a1")
    await ensure_agent_sandbox("a1")
    assert m.created == [("a1", "jupyter-server")]
    assert m.stopped == []


@pytest.mark.asyncio
async def test_same_variant_leaves_the_sandbox_alone(manager) -> None:
    m = manager("jupyter-server")
    await ensure_agent_sandbox(
        "a1", EnsureAgentSandboxRequest(variant="jupyter-server")
    )
    assert m.stopped == [] and m.created == []


@pytest.mark.asyncio
async def test_another_variant_replaces_the_sandbox(manager) -> None:
    m = manager("jupyter-server")
    status = await ensure_agent_sandbox("a1", EnsureAgentSandboxRequest(variant="eval"))
    assert m.stopped == ["a1"]
    assert m.created == [("a1", "eval")]
    assert status.variant == "eval"


@pytest.mark.asyncio
async def test_restart_makes_a_fresh_one_of_the_same_variant(manager) -> None:
    m = manager("eval")
    await ensure_agent_sandbox(
        "a1", EnsureAgentSandboxRequest(variant="eval", restart=True)
    )
    assert m.stopped == ["a1"]
    assert m.created == [("a1", "eval")]


def test_variant_is_read_from_the_sandbox_itself() -> None:
    assert (
        agents_route._agent_sandbox_variant(SimpleNamespace(variant="eval")) == "eval"
    )
    assert agents_route._agent_sandbox_variant(SimpleNamespace()) is None
