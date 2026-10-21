# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``session.carry`` point's default policy (MH-F05): what a swap or a
clone carries, what it drops, and the sentence the new agent is told.

Swap and clone never decide on their own: they ask the policy read through
the point (:func:`carry_policy`), so an organization's Shield document may
narrow it later by contributing a stricter one.

**On a swap** (§2 of the session model): the conversation, the files, the
session's Rules and the settings carry (the settings only when the target
application's inputs accept them — else the swap is refused, not here); the
harness's own state, the model and effort picks, and the ``allow_always``
answers given to the old harness's tools do not. The new agent is told in a
sentence: *This conversation was with Claude Code until turn 4; from here it
is with Codex. What was said stays; what Claude Code kept for itself waits
for a swap back.* — the last clause *is gone* when the old harness's
``resume`` capability is ``none``, since nothing of it can be loaded again;
a target whose ``resume`` is ``none`` is warned that a swap back to it will
start over.

**On a clone** (MH-09): the conversation up to the turn, the files and the
Rules carry; the mode is reset to the application's default (a
``bypassPermissions`` source is not inherited), ``allow_always`` answers are
not copied, the harness's own session never is (a clone starts the harness
anew and replays); a clone with another agent is told as a swap is, and a
clone on a harness whose ``fork_history`` is ``none`` is told the start-over.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping

from agent_runtimes.plugins.points import SESSION_CARRY, Carried

#: The rules a person answered *always* with: a harness's tool's, re-asked after a swap.
ALWAYS_PREFIX = "always:"


def _name(target: Mapping[str, Any], fallback: str = "the agent") -> str:
    return str(target.get("name") or target.get("agent") or fallback)


def _rules_of(session: Any) -> List[Dict[str, Any]]:
    from agent_runtimes.guardrails.session_rules import session_rules

    return session_rules().as_values(str(session.uid))


def _always(rules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        rule for rule in rules if str(rule.get("name") or "").startswith(ALWAYS_PREFIX)
    ]


def swap_sentence(
    *,
    old_name: str,
    new_name: str,
    at_turn: int,
    old_resume: str,
    new_resume: str,
) -> str:
    """The sentence of §2, its last clause by the old harness's ``resume`` capability."""
    said = (
        f"This conversation was with {old_name} until turn {at_turn}; from here it is with {new_name}. "
        "What was said stays; "
    )
    if old_resume == "none":
        said += f"what {old_name} kept for itself is gone."
    else:
        said += f"what {old_name} kept for itself waits for a swap back."
    if new_resume == "none":
        said += f" A swap back to {new_name} later will start it over."
    return said


def clone_sentence(
    *, old_name: str, new_name: str, at_turn: int, fork_history: str
) -> str:
    """What a clone's agent is told: the swap sentence when it differs, the start-over when nothing carries."""
    said = ""
    if old_name != new_name:
        said = (
            f"This conversation was with {old_name} until turn {at_turn}; from here, cloned, it is with {new_name}. "
            "What was said stays; nothing of what the harness kept for itself carries into a clone."
        )
    if fork_history == "none":
        said = (said + " " if said else "") + (
            f"{new_name} carries no history into a clone: it starts over, and the earlier turns were not replayed to it."
        )
    return said


@dataclass
class DefaultCarry:
    """The default policy of §2."""

    def swap(self, session: Any, target: Mapping[str, Any]) -> Carried:
        """``target``: ``{agent, name, harness, capabilities: {resume, …}, model}``."""
        rules = _rules_of(session)
        always = _always(rules)
        old_capabilities = dict(getattr(session, "capabilities", None) or {})
        new_capabilities = dict(target.get("capabilities") or {})
        turns = sum(
            1 for m in getattr(session, "messages", []) if m.get("role") == "user"
        )
        said = swap_sentence(
            old_name=str(getattr(session, "agent_name", "") or session.agent_spec),
            new_name=_name(target),
            at_turn=turns,
            old_resume=str(old_capabilities.get("resume") or "none"),
            new_resume=str(new_capabilities.get("resume") or "none"),
        )
        carried = {
            "turns": turns,
            "files": len(getattr(session, "files", [])),
            "rules": len(rules) - len(always),
            "settings": sorted(dict(getattr(session, "settings", {}) or {})),
            "workspace": True,
        }
        dropped: Dict[str, Any] = {
            "allow_always": len(always),
            "harness_state": "kept for a swap back"
            if old_capabilities.get("resume", "none") != "none"
            else "gone",
        }
        model = getattr(session, "model", None) or target.get("from_model")
        if model:
            dropped["model"] = str(model)
        return Carried(carried=carried, dropped=dropped, said=said)

    def clone(self, session: Any, target: Mapping[str, Any]) -> Carried:
        """``target``: as for ``swap``, with ``at_turn`` and ``fork_history`` in its capabilities."""
        rules = _rules_of(session)
        always = _always(rules)
        at_turn = int(target.get("at_turn") or 0)
        capabilities = dict(target.get("capabilities") or {})
        said = clone_sentence(
            old_name=str(getattr(session, "agent_name", "") or session.agent_spec),
            new_name=_name(target),
            at_turn=at_turn,
            fork_history=str(capabilities.get("fork_history") or "replay"),
        )
        return Carried(
            carried={
                "turns": at_turn,
                "files": len(getattr(session, "files", [])),
                "rules": len(rules) - len(always),
                "settings": sorted(dict(getattr(session, "settings", {}) or {})),
            },
            dropped={
                "allow_always": len(always),
                "mode": "reset to the application's default",
                "harness_state": "gone",
            },
            said=said,
            mode="",
        )


#: The default policy.
DEFAULT_CARRY = DefaultCarry()


def carry_policy(platform: Any = None) -> Any:
    """The policy swap and clone read: the first contributed (the default unless a stricter one comes first)."""
    from agent_runtimes.plugins.host import accepted, session_platform

    policies = accepted(session_platform(platform), SESSION_CARRY)
    if not policies:
        raise LookupError(
            "No session.carry policy is contributed: nothing decides what a swap carries."
        )
    return policies[0].value


__all__ = [
    "ALWAYS_PREFIX",
    "DEFAULT_CARRY",
    "DefaultCarry",
    "carry_policy",
    "clone_sentence",
    "swap_sentence",
]
