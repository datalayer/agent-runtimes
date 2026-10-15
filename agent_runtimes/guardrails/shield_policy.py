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
- a deployment's **spend limit** (its owner's, in credits a day, which
  ai-agents' keeper holds across the day) is a ``team`` document of its own
  with ``limits.spend``, soft at the keeper's warning share and hard at the
  limit: the Shield holds it for each session, the keeper for the day, and
  the sentence says which (:func:`deployment_said`, SH-32);
- above them all, on a managed runtime, the **organization's and the teams'
  documents from IAM** (``guardrails.managed_policies``, SH-50): pulled for
  the account, kept until they expire, refreshed while the runtime runs;
  with none readable and no unexpired copy, nothing is decided (decision 11).

ACP's tool ``kind`` is classed by :func:`agent_shield.policy.class_of`
(``KIND_CLASS``: ``other`` → write, fail closed); the table-driven test in
``test_acp_agent.py`` reads it both ways.
"""

from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional, Sequence

from agent_shield.policy import (
    ACTION_CLASSES,
    KIND_CLASS,
    Context,
    Limits,
    Mcp,
    Policy,
    Rule,
    Threshold,
    admits,
    class_of,
    credentials_rule,
    decide_budget,
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
                decision=verdict,
                classes=list(classes),
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
    spend_limit: float = 0.0,
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
    spend_limit : float
        The deployment's spend limit in credits a day (``app_instance.spend_limit``,
        handed by ai-agents' keeper); above zero, a ``team`` document holding
        each session to it (:func:`deployment_spend_policy`).

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
    if spend_limit > 0:
        policies.append(deployment_spend_policy(spend_limit))
    policies.append(datalayer_default())
    return policies


#: The share of a deployment's spend limit at which a session is asked first:
#: the keeper's warning share (ai-agents' ``app_keeper.WARNING_SHARE``), so the
#: owner hears of the day and the person of the session at the same point.
DEPLOYMENT_SPEND_SOFT_SHARE = 0.8


def deployment_spend_limit(app_instance: Optional[Mapping[str, Any]]) -> float:
    """The spend limit, in credits a day, of the deployment an agent serves; 0 for none.

    ai-agents' keeper hands it in the ``app_instance`` it launches the
    deployment's agent with (``kept_payload``'s ``spend_limit``): its owner's,
    or the default of a public application whose owner set none. A Preview, a
    test or an agent no deployment runs has none.
    """
    if not app_instance:
        return 0.0
    try:
        limit = float(app_instance.get("spend_limit") or 0.0)
    except (TypeError, ValueError):
        raise ValueError(
            f"The deployment's spend limit {app_instance.get('spend_limit')!r} is not a number of credits."
        ) from None
    if limit < 0:
        raise ValueError(f"The deployment's spend limit {limit} is below zero.")
    return limit


def deployment_spend_policy(spend_limit: float) -> Policy:
    """A deployment's spend limit as a ``team`` document: soft at the keeper's warning share, hard at the limit."""
    hard = int(spend_limit)
    return Policy(
        scope="team",
        limits=Limits(
            spend=Threshold(soft=int(hard * DEPLOYMENT_SPEND_SOFT_SHARE), hard=hard)
        ),
    )


def deployment_said(
    decision: Any,
    context: Context,
    *,
    tokens: int,
    cost: int,
    spend_limit: float,
) -> str:
    """The decision's sentence, with a deployment's spend limit told apart from the session's.

    The engine names the scope that decided (*in the team policy*); when the
    deployment's spend document alone decides the same, the sentence says it
    is the deployment's limit of so many credits a day, held here for this
    session, which its keeper holds across the day — so the person reads why
    this session stops while the deployment's computer runs on, and the
    owner what to raise under Ship.
    """
    sentence = str(decision.sentence)
    if spend_limit <= 0 or decision.rule != "spend" or decision.scope != "team":
        return sentence
    alone = decide_budget(
        context, [deployment_spend_policy(spend_limit)], tokens=tokens, cost=cost
    )
    if alone.verdict != decision.verdict or alone.sentence != sentence:
        return sentence
    hard = int(spend_limit)
    said = sentence.replace(
        " in the team policy",
        f" — the deployment's spend limit of {hard} credits a day, held here for this session;"
        f" its keeper holds the same {hard} across the day and stops its computer when a day's"
        " spending reaches it —",
        1,
    )
    return said.replace(
        "a wider spend limit or a person's word would let it go on",
        "the owner raising the limit under Ship, or a person's word, would let it go on",
        1,
    )


def datalayer_default() -> Policy:
    """Decision 5's default as Datalayer runs it (SHIELD §6.11): the classes the
    platform writes relationships for need the authorizer's allow beside the Rules."""
    from agent_runtimes.guardrails.shield_authorizer import DATALAYER_AUTHORIZE  # noqa: PLC0415

    document = default_policy()
    document.authorize = list(DATALAYER_AUTHORIZE)  # type: ignore[assignment]
    return document


def policies_in_force(
    app: Any = None,
    lent: Sequence[str] = (),
    *,
    token: Optional[str] = None,
    spend_limit: float = 0.0,
) -> List[Policy]:
    """The policies in force on this runtime now: IAM's pulled or kept, the Rules, the default.

    Raises
    ------
    PolicyUnavailable
        On a managed runtime whose documents cannot be read and hold no
        unexpired copy (decision 11): the caller refuses in the sentence.
    """
    policies = runtime_policies()
    managed = policies.in_force(token)
    # Every reader keeps the runtime watching: a pydantic-ai application's
    # budget reads the documents at each model request, and the poll keeps the
    # copy fresh for it as for a harness (a change reaches it within a minute).
    policies.ensure_watching()
    return policies_of(app, lent, managed=managed, spend_limit=spend_limit)


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
    "DEPLOYMENT_SPEND_SOFT_SHARE",
    "KIND_CLASS",
    "SHARED_CLASSES",
    "VERDICT_BEHAVIOUR",
    "PolicyUnavailable",
    "class_of",
    "deployment_said",
    "deployment_spend_limit",
    "deployment_spend_policy",
    "harness_refusal",
    "policies_in_force",
    "policies_of",
    "rules_policy",
]
