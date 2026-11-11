# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Recommendations an agent makes about what it read, each with its evidence.

``record_recommendation`` keeps one recommendation — a technical fix or a
cost saving — in the session's outputs: the application's record (under
``outputs``, when its ``record.include`` names them) and the session's list,
which ``list_recommendations`` reads for a report or a page.

A recommendation is refused, never kept, when it carries no evidence (the
calls and the numbers read, with when they were read), when its estimate does
not say how it was computed, or when its fix cannot be reviewed as it is
(no change, no rollback). The refusal is a sentence naming what is missing,
so the agent reads again or says it does not know.

Each recommendation recorded is shown as a card (an A2UI surface, drawn where
the tool's result lands when the agentspec binds ``record_recommendation`` to
the ``a2ui-surface`` renderer): the finding, its evidence, its estimate, the
change and its rollback, and two buttons, *Approve* and *Dismiss*. A press is
the A2UI form submission the transcript sends back as the person's next turn;
read from that turn (``decided_in``), it sets the recommendation's state and
is kept in the session's record — an ``approval`` entry, and the
recommendation again among its outputs with its new state. No tool writes to
the account: *Approve* means the person accepts it and is handed the change to
apply, as the card says.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import threading
import uuid
from typing import Any, Dict, Iterable, List, Literal, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

Kind = Literal["cost", "fix"]
Category = Literal[
    "idle",
    "oversized",
    "unattached",
    "pricing-model",
    "commitment",
    "security",
    "reliability",
    "quota",
    "upgrade",
]


class Resource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    arn: str = ""
    account: str = ""
    region: str = ""
    service: str = Field(min_length=1)
    tags: Dict[str, str] = Field(default_factory=dict)


class Evidence(BaseModel):
    """One read the recommendation rests on: where, which call, when, what it said."""

    model_config = ConfigDict(extra="forbid")

    source: str = Field(min_length=1, description="e.g. compute-optimizer, cloudwatch")
    call: str = Field(min_length=1, description="The API call or metric read")
    read_at: str = Field(min_length=1, description="When it was read, ISO 8601")
    values: Dict[str, Any] = Field(description="The numbers or facts read")

    @field_validator("values")
    @classmethod
    def _something_read(cls, values: Dict[str, Any]) -> Dict[str, Any]:
        if not values:
            raise ValueError("an evidence names the values it read")
        return values


class Estimate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    monthly_saving_usd: Optional[float] = Field(default=None, ge=0)
    risk: str = ""
    by: Literal["aws", "datalayer"]
    method: str = Field(min_length=1, description="How the estimate was computed")


class Fix(BaseModel):
    model_config = ConfigDict(extra="forbid")

    form: Literal[
        "cloudformation-change-set",
        "cli",
        "manifest-diff",
        "pull-request",
        "console-steps",
    ]
    change: str = Field(min_length=1, description="The change, reviewable as it is")
    rollback: str = Field(min_length=1, description="How to undo it")
    needs: Literal["write-role", "cluster-write", "none"]


class Recommendation(BaseModel):
    """A recommendation as it is kept."""

    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Kind
    category: Category
    resource: Resource
    finding: str = Field(min_length=1)
    evidence: List[Evidence] = Field(min_length=1)
    estimate: Estimate
    confidence: Literal["high", "medium", "low"]
    fix: Fix
    state: Literal["open", "approved", "applied", "dismissed", "expired"] = "open"
    recorded_at: str


_lock = threading.Lock()
#: The recommendations of each session on this runtime, in the order recorded.
_kept: Dict[str, List[Dict[str, Any]]] = {}


def _session() -> str:
    from agent_runtimes.apps.record import current_session

    return current_session() or "local"


def _refusal(error: ValidationError) -> str:
    missing = []
    for problem in error.errors():
        where = ".".join(str(part) for part in problem["loc"]) or "the recommendation"
        missing.append(f"{where}: {problem['msg']}")
    return "Refused, not recorded — " + "; ".join(missing[:8]) + "."


def record_recommendation(
    kind: str,
    category: str,
    resource: Dict[str, Any],
    finding: str,
    evidence: List[Dict[str, Any]],
    estimate: Dict[str, Any],
    confidence: str,
    fix: Dict[str, Any],
) -> Any:
    """Record one recommendation, with the evidence it rests on.

    Args:
        kind: ``cost`` (a saving) or ``fix`` (a technical fix).
        category: ``idle``, ``oversized``, ``unattached``, ``pricing-model``,
            ``commitment``, ``security``, ``reliability``, ``quota`` or
            ``upgrade``.
        resource: ``{service, arn, account, region, tags}`` — at least the
            service.
        finding: One sentence: what is wrong.
        evidence: At least one read: ``{source, call, read_at, values}``,
            exactly as the reading tool answered (its source, call and
            read_at) and the values it gave. Never a number you did not read.
        estimate: ``{monthly_saving_usd, risk, by, method}`` — ``by`` is
            ``aws`` when the number is AWS's own estimate, ``datalayer``
            when you computed it; ``method`` says how.
        confidence: ``high``, ``medium`` or ``low``.
        fix: ``{form, change, rollback, needs}`` — ``form`` is
            ``cloudformation-change-set``, ``cli``, ``manifest-diff``,
            ``pull-request`` or ``console-steps``; ``change`` the change as a
            person reviews it; ``rollback`` how to undo it; ``needs`` is
            ``write-role``, ``cluster-write`` or ``none``.

    Returns:
        ``{"recorded": <id>, "recommendation": {...}}``, or a sentence
        starting ``Refused`` naming what is missing; a refused recommendation
        is not kept and must not be shown.
    """
    try:
        recommendation = Recommendation(
            id=f"rec-{uuid.uuid4().hex[:12]}",
            kind=kind,
            category=category,
            resource=resource,
            finding=finding,
            evidence=evidence,
            estimate=estimate,
            confidence=confidence,
            fix=fix,
            recorded_at=dt.datetime.now(dt.timezone.utc).isoformat(),
        )
    except ValidationError as error:
        return _refusal(error)
    kept = recommendation.model_dump()
    session = _session()
    with _lock:
        _kept.setdefault(session, []).append(kept)
    from agent_runtimes.apps.record import recorder_of

    recorder = recorder_of(session)
    if recorder is not None:
        recorder.add(
            "output",
            f"Recommendation: {recommendation.finding}",
            {"recommendation": kept},
        )
    return {
        "recorded": recommendation.id,
        "recommendation": kept,
        **recommendation_card(kept),
    }


def list_recommendations(kind: str = "", state: str = "") -> Any:
    """List this session's recommendations, highest estimated saving first.

    Args:
        kind: ``cost`` or ``fix`` to keep one kind; empty for both.
        state: ``open``, ``approved``, ``applied``, ``dismissed`` or
            ``expired`` to keep one state; empty for all.

    Returns:
        ``{"recommendations": [...], "count", "monthly_saving_usd"}`` — the
        sum of the estimated savings listed.
    """
    with _lock:
        listed = [dict(item) for item in _kept.get(_session(), [])]
    if kind:
        listed = [item for item in listed if item["kind"] == kind]
    if state:
        listed = [item for item in listed if item["state"] == state]
    listed.sort(key=lambda item: -(item["estimate"].get("monthly_saving_usd") or 0.0))
    return {
        "recommendations": listed,
        "count": len(listed),
        "monthly_saving_usd": round(
            sum(item["estimate"].get("monthly_saving_usd") or 0.0 for item in listed), 2
        ),
    }


#: What the card says *Approve* means: no tool of the agent writes to the account.
APPROVE_MEANS = (
    "Approve accepts it: you are handed the change and its rollback to apply "
    "yourself. This agent has no write access and changes nothing in your account."
)
#: The action a card's buttons press: the A2UI form submission the transcript
#: sends back as the person's next turn.
SUBMIT_ACTION = "submit_a2ui_form"
#: The fence a form submission is sent in (the transcript's `a2ui-submission`).
_SUBMISSION = re.compile(r"```a2ui-submission\s*\n([\s\S]*?)\n```")
#: A person's decision, as a card's button says it, and as the record's
#: approvals say an answer.
DECISIONS = {"approved": "approved", "dismissed": "declined"}


def _money(value: Optional[float]) -> str:
    return f"${value:,.2f}" if value is not None else ""


def recommendation_card(recommendation: Mapping[str, Any]) -> Dict[str, Any]:
    """A recommendation as the card a person decides on: an A2UI surface.

    Returns:
        ``{surfaceId, catalogId, title, messages}``, the surface's id the
        recommendation's.
    """
    from agent_runtimes.apps.components import answer_components, answer_surface

    rec_id = str(recommendation["id"])
    resource = recommendation.get("resource") or {}
    estimate = recommendation.get("estimate") or {}
    fix = recommendation.get("fix") or {}
    saving = _money(estimate.get("monthly_saving_usd"))
    by = "AWS's estimate" if estimate.get("by") == "aws" else "Datalayer's estimate"
    where = " · ".join(
        str(part)
        for part in (
            recommendation.get("kind"),
            recommendation.get("category"),
            resource.get("service"),
            resource.get("region"),
            resource.get("arn"),
        )
        if part
    )
    texts = [
        ("finding", "h3", str(recommendation.get("finding") or "")),
        ("where", "caption", where),
        (
            "estimate",
            None,
            (f"Estimated saving: {saving} a month" if saving else "")
            + (f" — risk: {estimate['risk']}" if estimate.get("risk") else "")
            + f" ({by}: {estimate.get('method') or ''}). "
            + f"Confidence: {recommendation.get('confidence') or ''}.",
        ),
        *(
            (
                f"evidence-{index}",
                "caption",
                f"{item.get('source')} {item.get('call')}, read {item.get('read_at')}: "
                + json.dumps(item.get("values") or {}, default=str)[:300],
            )
            for index, item in enumerate(recommendation.get("evidence") or [])
        ),
        (
            "change",
            None,
            f"The change ({fix.get('form') or ''}): {fix.get('change') or ''}",
        ),
        ("rollback", None, f"Rollback: {fix.get('rollback') or ''}"),
        ("means", "caption", APPROVE_MEANS),
    ]
    nodes: List[Dict[str, Any]] = [
        {
            "id": node_id,
            "component": "Text",
            "text": text,
            **({"variant": variant} if variant else {}),
        }
        for node_id, variant, text in texts
        if text
    ]
    for decision, label, variant in (
        ("approved", "Approve", "primary"),
        ("dismissed", "Dismiss", "default"),
    ):
        nodes.append({"id": f"{decision}-label", "component": "Text", "text": label})
        nodes.append(
            {
                "id": f"{decision}-button",
                "component": "Button",
                "variant": variant,
                "child": f"{decision}-label",
                "action": {
                    "event": {
                        "name": SUBMIT_ACTION,
                        "context": {"recommendation": rec_id, "decision": decision},
                    }
                },
            }
        )
    nodes.append(
        {
            "id": "decide",
            "component": "Row",
            "children": ["approved-button", "dismissed-button"],
        }
    )
    nodes.append(
        {
            "id": "body",
            "component": "Column",
            "children": [
                node["id"]
                for node in nodes
                if node["component"] == "Text" and not node["id"].endswith("-label")
            ]
            + ["decide"],
        }
    )
    nodes.insert(0, {"id": "root", "component": "Card", "child": "body"})
    title = f"Recommendation: {recommendation.get('finding') or rec_id}"[:200]
    # Checked as any answer's components are: the catalog's, each by its schema.
    return answer_surface(rec_id, title, answer_components(nodes))


def _submission_of(text: str) -> Optional[Dict[str, Any]]:
    match = _SUBMISSION.search(text or "")
    if not match:
        return None
    try:
        parsed = json.loads(match.group(1))
    except ValueError:
        return None
    if not isinstance(parsed, dict) or not isinstance(parsed.get("values"), dict):
        return None
    return parsed


def decided_in(text: str, session: str = "") -> Optional[Dict[str, Any]]:
    """A person's decision on a recommendation's card, read from their turn.

    The turn is the form submission the card's *Approve* or *Dismiss* sends:
    its values name the recommendation and the decision. A recommendation of
    this session gets the decision as its state, and the session's record
    keeps it: an ``approval`` entry (approved, or declined for a dismissal)
    and the recommendation among its outputs with its new state. The same
    decision twice is kept once.

    Returns:
        The recommendation as decided, or ``None`` when the turn decides
        nothing of this session's — any other turn, a recommendation it does
        not hold, a decision that is neither.
    """
    submission = _submission_of(text)
    if submission is None:
        return None
    values = submission["values"]
    rec_id = str(values.get("recommendation") or "")
    decision = str(values.get("decision") or "")
    if decision not in DECISIONS or not rec_id:
        return None
    session = session or _session()
    with _lock:
        held = next(
            (item for item in _kept.get(session, []) if item["id"] == rec_id), None
        )
        if held is None:
            return None
        if held["state"] == decision:
            return dict(held)
        held["state"] = decision
        held["decided_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        decided = dict(held)
    from agent_runtimes.apps.record import recorder_of

    recorder = recorder_of(session)
    if recorder is not None:
        recorder.add(
            "approval",
            f"{rec_id}: {DECISIONS[decision]} — {decided['finding']}",
            {
                "tool": "record_recommendation",
                "recommendation": rec_id,
                "outcome": DECISIONS[decision],
                "asked_under": "the recommendation's card",
                "note": "",
            },
        )
        recorder.add(
            "output",
            f"Recommendation {decision}: {decided['finding']}",
            {"recommendation": decided},
        )
    return decided


def restore_recommendations(session: str, entries: Iterable[Mapping[str, Any]]) -> int:
    """A session's recommendations given back from its record, as resumed on a
    runtime that did not hold it: each the last time its outputs kept it (its
    state as decided). How many.
    """
    restored: Dict[str, Dict[str, Any]] = {}
    for entry in entries:
        payload = entry.get("payload") or {}
        if entry.get("kind") != "output" or not isinstance(payload, Mapping):
            continue
        recommendation = payload.get("recommendation")
        if isinstance(recommendation, Mapping) and recommendation.get("id"):
            restored[str(recommendation["id"])] = dict(recommendation)
    if restored:
        with _lock:
            _kept[session] = list(restored.values())
    return len(restored)


def forget_recommendations() -> None:
    """Drop every session's list (a test's)."""
    with _lock:
        _kept.clear()


__all__ = [
    "APPROVE_MEANS",
    "Recommendation",
    "decided_in",
    "forget_recommendations",
    "list_recommendations",
    "recommendation_card",
    "record_recommendation",
    "restore_recommendations",
]
