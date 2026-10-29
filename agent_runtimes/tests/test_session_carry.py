# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The `session.carry` point and its default policy (MH-F05).

What a swap carries and drops, with the sentence whose last clause follows
the old harness's `resume` capability; what a clone carries, its mode reset
and its `allow_always` answers left behind; a stricter policy contributed
first is the one read.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List

from reactor import PluginManifest, PluginPlatform, hookimpl

from agent_runtimes.apps.session_carry import (
    DEFAULT_CARRY,
    carry_policy,
    swap_sentence,
)
from agent_runtimes.guardrails.session_rules import session_rules
from agent_runtimes.plugins import host
from agent_runtimes.plugins.points import SESSION_CARRY, Carried


@dataclass
class Fake:
    uid: str = "session-c001"
    agent_spec: str = "shield-mvp-claude-code"
    agent_name: str = "Claude Code"
    capabilities: Dict[str, Any] = field(
        default_factory=lambda: {"resume": "load", "fork_history": "replay"}
    )
    messages: List[Dict[str, Any]] = field(
        default_factory=lambda: (
            [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]
            * 4
        )
    )
    files: List[Dict[str, Any]] = field(default_factory=lambda: [{"name": "a.csv"}])
    settings: Dict[str, Any] = field(default_factory=lambda: {"tone": "Warm"})
    model: str = "anthropic:claude-sonnet-4-6"


def test_the_swap_sentence_follows_the_old_harness_resume_capability() -> None:
    assert swap_sentence(
        old_name="Claude Code",
        new_name="Codex",
        at_turn=4,
        old_resume="load",
        new_resume="load",
    ) == (
        "This conversation was with Claude Code until turn 4; from here it is with Codex. "
        "What was said stays; what Claude Code kept for itself waits for a swap back."
    )
    assert swap_sentence(
        old_name="Gemini CLI",
        new_name="Codex",
        at_turn=2,
        old_resume="none",
        new_resume="none",
    ) == (
        "This conversation was with Gemini CLI until turn 2; from here it is with Codex. "
        "What was said stays; what Gemini CLI kept for itself is gone. A swap back to Codex later will start it over."
    )


def test_the_default_policy_says_what_a_swap_carries_and_drops(
    monkeypatch: Any,
) -> None:
    session = Fake()
    from agent_runtimes.guardrails.session_rules import Rule

    rules = session_rules()
    rules._rules[session.uid] = [
        Rule(name="no-delete", decision="deny", classes=["delete"]),
        Rule(name="always:edit", decision="allow", classes=["write"]),
    ]
    try:
        carried = DEFAULT_CARRY.swap(
            session,
            {
                "agent": "shield-mvp-codex",
                "name": "Codex",
                "harness": "codex",
                "capabilities": {"resume": "load"},
            },
        )
    finally:
        rules.clear()
    assert isinstance(carried, Carried)
    assert carried.carried == {
        "turns": 4,
        "files": 1,
        "rules": 1,
        "settings": ["tone"],
        "workspace": True,
    }
    assert carried.dropped == {
        "allow_always": 1,
        "harness_state": "kept for a swap back",
        "model": "anthropic:claude-sonnet-4-6",
    }
    assert carried.said.startswith(
        "This conversation was with Claude Code until turn 4; from here it is with Codex."
    )


def test_the_default_policy_resets_a_clones_mode_and_tells_a_start_over() -> None:
    session = Fake()
    same = DEFAULT_CARRY.clone(
        session,
        {
            "agent": session.agent_spec,
            "name": "Claude Code",
            "at_turn": 2,
            "capabilities": {"fork_history": "replay"},
        },
    )
    assert same.said == "" and same.mode == "" and same.carried["turns"] == 2
    assert same.dropped == {
        "allow_always": 0,
        "mode": "reset to the application's default",
        "harness_state": "gone",
    }
    other = DEFAULT_CARRY.clone(
        session,
        {
            "agent": "shield-mvp-codex",
            "name": "Codex",
            "at_turn": 2,
            "capabilities": {"fork_history": "none"},
        },
    )
    assert other.said == (
        "This conversation was with Claude Code until turn 2; from here, cloned, it is with Codex. "
        "What was said stays; nothing of what the harness kept for itself carries into a clone. "
        "Codex carries no history into a clone: it starts over, and the earlier turns were not replayed to it."
    )


def test_a_policy_contributed_first_is_the_one_swap_reads() -> None:
    platform = PluginPlatform(extension_group="agent-runtimes.tests.extensions")

    class DropsFiles:
        def swap(self, session: Any, target: Any) -> Carried:
            carried = DEFAULT_CARRY.swap(session, target)
            return Carried(
                carried={**carried.carried, "files": 0},
                dropped={**carried.dropped, "files": carried.carried["files"]},
                said=carried.said,
            )

        def clone(self, session: Any, target: Any) -> Carried:
            return DEFAULT_CARRY.clone(session, target)

    class Contributing:
        @hookimpl
        def provide_contributions(self, contributions: Any) -> None:
            contributions.contribute(
                SESSION_CARRY, DropsFiles(), contribution_id="stricter", order=-1
            )

    platform.register_plugin(
        PluginManifest(name="stricter-carry", version="0.0.1"), Contributing()
    )
    host.session_platform(platform, discover_installed=False)
    policy = carry_policy(platform)
    assert isinstance(policy, DropsFiles)
    carried = policy.swap(Fake(), {"agent": "x", "name": "X", "capabilities": {}})
    assert carried.carried["files"] == 0 and carried.dropped["files"] == 1
    assert [c.id for c in host.accepted(platform, SESSION_CARRY)] == [
        "stricter",
        "default",
    ]
