# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A per-agent sandbox proxy follows the agent's sandbox across a switch."""

from __future__ import annotations

from types import SimpleNamespace

from agent_runtimes.services.code_sandbox_manager import ManagedSandbox


class _Manager:
    variant = "jupyter-server"

    def __init__(self) -> None:
        self.agent_sandboxes: dict[str, SimpleNamespace] = {}
        self.created: list[tuple[str, str]] = []
        self.global_sandbox = SimpleNamespace(variant="global", is_executing=False)

    def get_agent_sandbox(self, agent_id: str):
        return self.agent_sandboxes.get(agent_id)

    def create_agent_sandbox(self, agent_id: str, variant: str = "eval", **_: object):
        self.created.append((agent_id, variant))
        made = SimpleNamespace(variant=variant, is_executing=False)
        self.agent_sandboxes[agent_id] = made
        return made

    def get_sandbox(self):
        return self.global_sandbox


def test_agent_proxy_resolves_the_agent_sandbox_of_the_moment() -> None:
    manager = _Manager()
    first = manager.create_agent_sandbox("a1", "jupyter-server")
    proxy = ManagedSandbox(manager, agent_id="a1")  # type: ignore[arg-type]

    assert proxy._sandbox() is first
    assert proxy.variant == "jupyter-server"

    # Switched: the proxy now stands for the replacement, untouched.
    replacement = manager.create_agent_sandbox("a1", "eval")
    assert proxy._sandbox() is replacement
    assert proxy.variant == "eval"


def test_agent_proxy_has_a_sandbox_made_when_the_agent_lost_it() -> None:
    manager = _Manager()
    proxy = ManagedSandbox(manager, agent_id="a2")  # type: ignore[arg-type]

    made = proxy._sandbox()

    assert manager.created == [("a2", "jupyter-server")]
    assert manager.get_agent_sandbox("a2") is made


def test_global_proxy_still_takes_the_global_sandbox() -> None:
    manager = _Manager()
    proxy = ManagedSandbox(manager)  # type: ignore[arg-type]
    assert proxy._sandbox() is manager.global_sandbox
    assert manager.created == []
