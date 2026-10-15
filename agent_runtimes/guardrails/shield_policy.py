# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Rules of an application, read into the Shield's policy (SHIELD §4.5, §6.2, §6.3).

The engine is the ``agent-shield`` package's — ``agent_shield.policy``: the
document, the classes, *first decision wins*, the stateful limits — and
agent-runtimes never keeps a second table of it. What agent-runtimes owns is
the reading of an Appspec's Rules (the Maker's level) into that document, and
the platform's default policy of decision 5 beneath them:

- the Appspec's Rules on **classes** — *do it*, *ask me first*, *leave it to
  me* on read, write, send, buy, delete — become a ``team``-scope policy, one
  rule per class, so they decide before the platform's default; a Rule on a
  named tool (``server.tool``) is for the lent MCP tools and the gateway
  decides it there (SH-14), never here;
- ``if_asked`` (*do it if you asked*) is read as **ask me first**: the harness
  acts on its own plan within a turn, and nothing here can tell whether the
  person asked for that one action, so it fails closed (R-05);
- the ``session`` scope holds the platform's default (decision 5): read and
  edit inside the workspace done, delete and execute and anything outside
  asked, flagged commands asked with the command shown, fetch refused with
  no allow-list.

ACP's tool ``kind`` is classed by :func:`agent_shield.policy.class_of`
(``KIND_CLASS``: ``other`` → write, fail closed); the table-driven test in
``test_acp_agent.py`` reads it both ways.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from agent_shield.policy import (
    ACTION_CLASSES,
    KIND_CLASS,
    Policy,
    Rule,
    class_of,
    default_policy,
)

from agent_runtimes.loop.apps.rules import (
    ASK_FIRST,
    DEFAULT_BEHAVIOURS,
    DO_IT,
    IF_ASKED,
    LEAVE_TO_ME,
)

#: An application's behaviour, as the Shield's verdict.
BEHAVIOUR_VERDICT: Dict[str, str] = {
    DO_IT: "allow",
    IF_ASKED: "ask",
    ASK_FIRST: "ask",
    LEAVE_TO_ME: "deny",
}

#: The Shield's verdict, as the record's behaviour word (LOOP R-07).
VERDICT_BEHAVIOUR: Dict[str, str] = {
    "allow": DO_IT,
    "ask": ASK_FIRST,
    "deny": LEAVE_TO_ME,
}

#: The classes an application's Rules name that the Shield classes too
#: (``publish`` is a class of the gateway's tools, not of a harness's action).
SHARED_CLASSES: tuple[str, ...] = tuple(
    item for item in ACTION_CLASSES if item in DEFAULT_BEHAVIOURS
)


def rules_policy(app: Any) -> Optional[Policy]:
    """The Appspec's Rules on classes as a ``team``-scope policy, or ``None`` with none.

    Parameters
    ----------
    app : AppSpec
        The application; its ``rules`` are read, each with its ``applies_to``
        classes and its ``behaviour``.

    Returns
    -------
    Policy or None
        One rule per class the Rules name, in the Rules' order; ``None`` when
        no Rule names a class the Shield decides.
    """
    rules: List[Rule] = []
    seen: set[str] = set()
    for spec in getattr(app, "rules", None) or []:
        verdict = BEHAVIOUR_VERDICT.get(spec.behaviour)
        if verdict is None:
            raise ValueError(
                f"The rule {spec.action!r} says {spec.behaviour!r}, which is not "
                f"one of {', '.join(BEHAVIOUR_VERDICT)}."
            )
        classes = [
            item
            for item in spec.applies_to
            if item in SHARED_CLASSES and item not in seen
        ]
        if not classes:
            continue
        seen.update(classes)
        rules.append(
            Rule(
                name=spec.action,
                decision=verdict,  # type: ignore[arg-type]
                classes=list(classes),  # type: ignore[arg-type]
                reason=(
                    "the application's rule; read as ask me first"
                    if spec.behaviour == IF_ASKED
                    else "the application's rule"
                ),
            )
        )
    if not rules:
        return None
    return Policy(scope="team", rules=rules)


def policies_of(app: Any = None) -> List[Policy]:
    """The policies in force for a harness run by ``app``: its Rules, then decision 5's default.

    Parameters
    ----------
    app : AppSpec, optional
        The application; none for an agent run outside one (``loop --harness``).

    Returns
    -------
    list[Policy]
        Strictest first as the engine sorts them anyway: the ``team`` policy
        of the Rules when any, and the ``session`` default.
    """
    policies: List[Policy] = []
    if app is not None:
        own = rules_policy(app)
        if own is not None:
            policies.append(own)
    policies.append(default_policy())
    return policies


__all__ = [
    "BEHAVIOUR_VERDICT",
    "KIND_CLASS",
    "SHARED_CLASSES",
    "VERDICT_BEHAVIOUR",
    "class_of",
    "policies_of",
    "rules_policy",
]
