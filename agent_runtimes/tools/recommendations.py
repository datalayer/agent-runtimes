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
"""

from __future__ import annotations

import datetime as dt
import threading
import uuid
from typing import Any, Dict, List, Literal, Optional

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
    return {"recorded": recommendation.id, "recommendation": kept}


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


def forget_recommendations() -> None:
    """Drop every session's list (a test's)."""
    with _lock:
        _kept.clear()


__all__ = [
    "Recommendation",
    "forget_recommendations",
    "list_recommendations",
    "record_recommendation",
]
