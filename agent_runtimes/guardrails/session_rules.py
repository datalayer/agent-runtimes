# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Rules a person adds to a running session (SH-54: a person's rules last as long as the session).

From the session panel — the page's Rules card, the phone's, the terminal — a
person **adds or tightens** a rule on a session while it runs: in force at
once, gone with the session, never written to the deployment. A rule is the
Shield's :class:`agent_shield.policy.Rule` — a name, a decision, the classes
or kinds it names, where, paths, commands — and it may only tighten: one that
would permit more than the organization's documents say is refused with the
sentences of :func:`agent_shield.policy.check_tightens`, and one that would
permit more than the **application's own Rules** (the Appspec's ``rules``,
read as :func:`agent_runtimes.guardrails.shield_policy.rules_policy`) is
refused when it is added, in a sentence naming the application's rule it
conflicts with — never accepted to be overruled later at decision time. The
application's **implicit default** is part of that ceiling (decided by the
user, 21 October 2026): on a class its Rules do not name, reading is done
and anything else asks first, so *do it* on such a class is refused in a
sentence naming the default (:data:`IMPLICIT_DEFAULT`).

One registry per runtime, by session uid, read at every decision:

- a **harness** session reads it through the Shield's own ``SessionState``
  (``rules_from``), so the package's engine decides with it as with any
  session rule;
- a **pydantic-ai** session reads it in ``AppRulesCapability.decide``, where
  the strictest of the application's behaviour and the session's rules on
  the call's classes wins (:func:`tightened`).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence, Tuple

from agent_shield.policy import (
    VERDICT_WORDS,
    Policy,
    PolicyWidens,
    Rule,
    check_tightens,
    overlaps,
)
from pydantic import ValidationError

from agent_runtimes.guardrails.managed_policies import runtime_policies

__all__ = [
    "IMPLICIT_DEFAULT",
    "SessionRuleRefused",
    "application_widening",
    "SessionRules",
    "rule_from",
    "session_rules",
    "tightened",
]

#: The Shield's verdict as the application's behaviour, for the pydantic-ai path.
_BEHAVIOUR_OF_VERDICT = {"allow": "do_it", "ask": "ask_first", "deny": "leave_to_me"}
_STRICTNESS = ("do_it", "if_asked", "ask_first", "leave_to_me")
#: How much a verdict permits: *do it* the most, *leave it to me* the least.
_PERMITS = {"allow": 2, "ask": 1, "deny": 0}


class SessionRuleRefused(ValueError):
    """A rule that cannot be added, said in a sentence."""


def rule_from(data: Any) -> Rule:
    """A rule from what the panel sent, or a refusal naming the field."""
    if not isinstance(data, dict):
        raise SessionRuleRefused(
            "A session rule is a mapping: name, decision, classes or kinds."
        )
    try:
        return Rule.model_validate(data)
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first["loc"]) or "the rule"
        raise SessionRuleRefused(
            f"The session rule is refused: {where}: {first['msg']}."
        ) from None


class SessionRules:
    """The rules of every running session of this runtime, by session uid."""

    def __init__(self) -> None:
        self._rules: Dict[str, List[Rule]] = {}

    def of(self, session: str) -> List[Rule]:
        return list(self._rules.get(session, ()))

    def add(
        self,
        session: str,
        rule: Rule,
        *,
        application: Optional[Policy],
        above: Optional[Sequence[Policy]] = None,
    ) -> List[Rule]:
        """Add or replace (by name) a rule of ``session``; refused when it loosens the application's Rules or the organization's.

        ``application`` is the application's own Rules as a policy
        (``rules_policy(app)``), ``None`` for an application with none: a
        session rule permitting more than one of them is refused at once.
        ``above`` is the organization's documents to tighten under; unsaid,
        the runtime's managed documents (IAM's), which a managed runtime
        must be able to read.
        """
        loosened = application_widening(rule, application)
        if loosened:
            raise SessionRuleRefused(
                "The session rule is refused, it would permit more than the application's Rules: "
                + "; ".join(loosened)
                + "."
            )
        ceiling = (
            list(above)
            if above is not None
            else [p for p in runtime_policies().in_force() if p.scope == "organization"]
        )
        try:
            check_tightens(Policy(scope="session", rules=[rule]), ceiling)
        except PolicyWidens as widens:
            raise SessionRuleRefused(
                "The session rule is refused, it would permit more than the organization's policy: "
                + "; ".join(widens.sentences)
                + "."
            ) from None
        kept = [item for item in self._rules.get(session, []) if item.name != rule.name]
        kept.append(rule)
        # What a person tightens decides before what they allowed.
        kept.sort(key=lambda item: 0 if item.decision != "allow" else 1)
        self._rules[session] = kept
        return list(kept)

    def remove(self, session: str, name: str) -> List[Rule]:
        kept = [item for item in self._rules.get(session, []) if item.name != name]
        if len(kept) == len(self._rules.get(session, [])):
            raise SessionRuleRefused(f"The session has no rule named {name!r}.")
        self._rules[session] = kept
        return list(kept)

    def forget(self, session: str) -> None:
        """Gone with the session."""
        self._rules.pop(session, None)

    def clear(self) -> None:
        self._rules.clear()

    def as_values(self, session: str) -> List[Dict[str, Any]]:
        return [
            json.loads(rule.model_dump_json(exclude_none=True))
            for rule in self.of(session)
        ]


#: What an application says of a class its Rules do not name — its implicit
#: default, part of the ceiling a session rule tightens under (decided by the
#: user, 21 October 2026): reading is done, anything else asks first.
IMPLICIT_DEFAULT: Dict[str, str] = {
    "read": "allow",
    "write": "ask",
    "send": "ask",
    "buy": "ask",
    "delete": "ask",
    "execute": "ask",
}


def _classes_of(rule: Rule) -> List[str]:
    """The classes a rule names, or every class when it names none (a rule on kinds names theirs)."""
    if rule.classes:
        return list(rule.classes)
    if rule.kinds:
        from agent_shield.policy import class_of

        found = {cls for cls in (class_of(kind) for kind in rule.kinds) if cls}
        return sorted(found)
    return list(IMPLICIT_DEFAULT)


def application_widening(rule: Rule, application: Optional[Policy]) -> List[str]:
    """Every rule of the application that ``rule`` would loosen, in sentences; empty when it only tightens.

    The application's implicit default is part of its ceiling: on a class its
    Rules do not name, reading is done and anything else asks first, so a
    session rule saying *do it* on writing, sending, buying, deleting or
    running a command the application said nothing of is refused in a
    sentence naming that default.
    """
    found: List[str] = []
    named: set[str] = set()
    for ceiling in application.rules if application is not None else []:
        named.update(ceiling.classes or [])
        if _PERMITS[rule.decision] > _PERMITS[ceiling.decision] and overlaps(
            rule, ceiling
        ):
            found.append(
                f"the session rule '{rule.name}' says {VERDICT_WORDS[rule.decision]} where the "
                f"application's rule '{ceiling.name}' says {VERDICT_WORDS[ceiling.decision]}; "
                "a session rule may only tighten the application's Rules"
            )
    for cls in _classes_of(rule):
        if cls in named:
            continue
        default = IMPLICIT_DEFAULT.get(cls, "ask")
        if _PERMITS[rule.decision] > _PERMITS[default]:
            found.append(
                f"the session rule '{rule.name}' says {VERDICT_WORDS[rule.decision]} on {cls}, "
                f"of which the application's Rules say nothing, so its default holds: "
                f"{VERDICT_WORDS[default]}; a session rule may only tighten the application's Rules"
            )
    return found


_RULES = SessionRules()


def session_rules() -> SessionRules:
    """The runtime's one registry of session rules."""
    return _RULES


def tightened(
    session: str, classes: Sequence[str], behaviour: str
) -> Tuple[str, Optional[str]]:
    """The application's behaviour on a call, tightened by the session's rules on its classes.

    Returns the strictest behaviour and the name of the session rule that
    tightened it, or the behaviour given and ``None`` when no rule did. A
    session rule naming no class names every class; a rule that would
    loosen (``allow`` below *ask me first*) never does here: the panel adds
    or tightens, and *do it* for a class is the application's to say.
    """
    if not session:
        return behaviour, None
    strictest, by = behaviour, None
    for rule in _RULES.of(session):
        if rule.classes and not (set(rule.classes) & set(classes)):
            continue
        if rule.kinds or rule.paths or rule.commands or rule.where != "any":
            # A rule on a harness's kinds, paths or commands names nothing a
            # tool call of an application carries: it decides the harness's
            # actions through the Shield, not these.
            continue
        wanted = _BEHAVIOUR_OF_VERDICT[rule.decision]
        if _STRICTNESS.index(wanted) > _STRICTNESS.index(strictest):
            strictest, by = wanted, rule.name
    return strictest, by
