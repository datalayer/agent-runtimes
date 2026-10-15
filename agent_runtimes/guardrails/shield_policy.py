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
- the gateway toolsets the Appspec connects are the ``team`` policy's
  ``mcp.allow`` list (SH-14): the package's ``mcpServers`` rewriting lends
  those and cuts every other server from ``session/new``;
- the ``session`` scope holds the platform's default (decision 5): read and
  edit inside the workspace done, delete and execute and anything outside
  asked, flagged commands asked with the command shown, fetch refused with
  no allow-list;
- above them all, on a managed runtime, the **organization's and the teams'
  documents from IAM** (``guardrails.managed_policies``, SH-50): pulled for
  the account, kept until they expire, refreshed while the runtime runs;
  with none readable and no unexpired copy, nothing is decided (decision 11).

ACP's tool ``kind`` is classed by :func:`agent_shield.policy.class_of`
(``KIND_CLASS``: ``other`` → write, fail closed); the table-driven test in
``test_acp_agent.py`` reads it both ways.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from agent_shield.policy import (
    ACTION_CLASSES,
    KIND_CLASS,
    Mcp,
    Policy,
    Rule,
    admits,
    class_of,
    credentials_rule,
    default_policy,
)
from agent_shield.saas import PolicyUnavailable

from agent_runtimes.guardrails.managed_policies import runtime_policies
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


def rules_policy(app: Any, lent: Sequence[str] = ()) -> Optional[Policy]:
    """The Appspec's Rules on classes as a ``team``-scope policy, or ``None`` with none.

    Parameters
    ----------
    app : AppSpec
        The application; its ``rules`` are read, each with its ``applies_to``
        classes and its ``behaviour``.
    lent : Sequence[str]
        The names of the gateway toolsets the application connects: the
        policy's ``mcp.allow`` list, the only servers the harness is lent.

    Returns
    -------
    Policy or None
        One rule per class the Rules name, in the Rules' order, and the
        allow-list; ``None`` when no Rule names a class the Shield decides and
        nothing is lent.
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
    if not rules and not lent:
        return None
    return Policy(scope="team", rules=rules, mcp=Mcp(allow=list(lent)))


def policies_of(
    app: Any = None,
    lent: Sequence[str] = (),
    *,
    managed: Optional[Sequence[Policy]] = None,
) -> List[Policy]:
    """The policies in force for a harness run by ``app``: IAM's, its Rules, then decision 5's default.

    Parameters
    ----------
    app : AppSpec, optional
        The application; none for an agent run outside one (``loop --harness``).
    lent : Sequence[str]
        The gateway toolsets it connects, by name (``mcp.allow``).
    managed : Sequence[Policy], optional
        IAM's documents for the account (the organization's, the teams'),
        placed first: the engine sorts by scope and keeps their order within
        one, so IAM's ``team`` document decides before the Appspec's.

    Returns
    -------
    list[Policy]
        Strictest first as the engine sorts them anyway: IAM's documents, the
        ``team`` policy of the Rules when any, and the ``session`` default.
    """
    policies: List[Policy] = list(managed or [])
    if app is not None or lent:
        own = rules_policy(app, lent)
        if own is not None:
            policies.append(own)
    policies.append(default_policy())
    return policies


def policies_in_force(
    app: Any = None, lent: Sequence[str] = (), *, token: Optional[str] = None
) -> List[Policy]:
    """The policies in force on this runtime now: IAM's pulled or kept, the Rules, the default.

    Raises
    ------
    PolicyUnavailable
        On a managed runtime whose documents cannot be read and hold no
        unexpired copy (decision 11): the caller refuses in the sentence.
    """
    return policies_of(app, lent, managed=runtime_policies().in_force(token))


def harness_refusal(policies: Sequence[Policy], harness_id: str) -> Optional[str]:
    """Why the policies in force refuse ``harness_id`` on this runtime, or ``None``.

    The ``harnesses`` section of the strictest scope that says anything: a
    harness not admitted, or a credentials rule this runtime cannot keep —
    a runtime lends a harness the account's own declared secret (decision
    3), never the platform's key, so ``platform`` refuses every harness
    here until that path exists.
    """
    refused = admits(policies, harness_id)
    if refused is not None:
        return f"The harness {harness_id!r} is refused: {refused}."
    rule = credentials_rule(policies)
    if rule == "platform":
        return (
            f"The harness {harness_id!r} is refused: the policy runs harnesses on the "
            "platform's credentials, and this runtime lends only the account's own "
            "declared secret (SHIELD decision 3)."
        )
    return None


__all__ = [
    "BEHAVIOUR_VERDICT",
    "KIND_CLASS",
    "SHARED_CLASSES",
    "VERDICT_BEHAVIOUR",
    "PolicyUnavailable",
    "class_of",
    "harness_refusal",
    "policies_in_force",
    "policies_of",
    "rules_policy",
]
