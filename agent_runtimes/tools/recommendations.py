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
from typing import Any, Dict, Iterable, List, Literal, Mapping, Optional, Tuple

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
    #: How soon the person should see it: ``high`` is told through the
    #: application's channels as it is recorded.
    severity: Literal["high", "medium", "low"] = "medium"
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


def keep_recommendation(
    kind: str,
    category: str,
    resource: Dict[str, Any],
    finding: str,
    evidence: List[Dict[str, Any]],
    estimate: Dict[str, Any],
    confidence: str,
    fix: Dict[str, Any],
    severity: str = "medium",
    *,
    written: bool = True,
) -> Any:
    """Keep one recommendation in the session and its record, with its card.

    What `record_recommendation` does before it asks the person and tells
    the channels: refused in a sentence when anything it rests on is missing.

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
            severity=severity,
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
    if recorder is not None and written:
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


async def record_recommendation(
    kind: str,
    category: str,
    resource: Dict[str, Any],
    finding: str,
    evidence: List[Dict[str, Any]],
    estimate: Dict[str, Any],
    confidence: str,
    fix: Dict[str, Any],
    severity: str = "medium",
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
        severity: ``high`` for what the person should see today (a security
            or reliability risk, a large waste), told through the
            application's channels as it is recorded; ``medium`` (default)
            or ``low`` otherwise.

    Returns:
        ``{"recorded": <id>, "recommendation": {...}, "waiting": {...}}`` —
        ``waiting`` says whether it waits for the person under *Waiting for
        you* — with ``notified`` for a high-severity one; or a sentence
        starting ``Refused`` naming what is missing: a refused recommendation
        is not kept and must not be shown.
    """
    answer = keep_recommendation(
        kind,
        category,
        resource,
        finding,
        evidence,
        estimate,
        confidence,
        fix,
        severity,
        written=False,
    )
    if isinstance(answer, str):
        return answer
    kept = answer["recommendation"]
    session = _session()
    answer["waiting"] = await ask_the_person(kept, session)
    if answer["waiting"].get("approval"):
        # Kept with it, so a session resumed elsewhere still decides that approval.
        with _lock:
            for item in _kept.get(session, []):
                if item["id"] == kept["id"]:
                    item["approval"] = answer["waiting"]["approval"]
                    kept = dict(item)
        answer["recommendation"] = kept
    from agent_runtimes.apps.record import recorder_of

    recorder = recorder_of(session)
    if recorder is not None:
        recorder.add(
            "output", f"Recommendation: {kept['finding']}", {"recommendation": kept}
        )
    if kept["severity"] == "high":
        answer["notified"] = await tell_high_severity(kept, session)
    return answer


#: The tool a recommendation waits under, among the person's approvals.
APPROVAL_TOOL = "approve_recommendation"
#: The pending approval each recommendation waits under at ai-agents, by session and id.
_approvals: Dict[Tuple[str, str], str] = {}


async def ask_the_person(
    recommendation: Mapping[str, Any], session: str
) -> Dict[str, Any]:
    """Put the recommendation where the person's other approvals wait (*Waiting for you*).

    Through the tool-approval path every question of an application goes
    through: a pending approval of `APPROVAL_TOOL` at ai-agents, naming the
    session, carrying the recommendation; decided there or on the card, the
    decision is kept in the session's record. Asked with the token the
    application writes its record with. Never raised: whether it was asked,
    and why not, is answered.
    """
    import datetime as _dt

    from agent_runtimes.apps.record import recorder_of, token_for
    from agent_runtimes.routes.tool_approvals import (
        ToolApprovalRecord,
        forward_approval_to_ai_agents,
    )

    recorder = recorder_of(session)
    token, why = token_for(recorder.deployment_uid if recorder is not None else "")
    if not token:
        return {"asked": False, "why": f"Not put among your approvals: {why}"}
    now = _dt.datetime.now(_dt.timezone.utc).isoformat()
    record = ToolApprovalRecord(
        id=str(uuid.uuid4()),
        agent_id=(recorder.app.id if recorder is not None else "") or "recommendations",
        tool_name=APPROVAL_TOOL,
        tool_args={
            "recommendation": dict(recommendation),
            "finding": recommendation.get("finding"),
            "monthly_saving_usd": (recommendation.get("estimate") or {}).get(
                "monthly_saving_usd"
            ),
            "change": (recommendation.get("fix") or {}).get("change"),
            "approve_means": APPROVE_MEANS,
        },
        tool_call_id=str(recommendation["id"]),
        created_at=now,
        updated_at=now,
    )
    remote = await forward_approval_to_ai_agents(record, token)
    if not remote:
        return {
            "asked": False,
            "why": "Not put among your approvals: ai-agents did not take it.",
        }
    with _lock:
        _approvals[(session, str(recommendation["id"]))] = remote
    return {"asked": True, "approval": remote}


async def tell_high_severity(recommendation: Mapping[str, Any], session: str) -> Any:
    """Tell the application's channels of a high-severity recommendation, as it asks before it acts."""
    from agent_runtimes.apps import notifications
    from agent_runtimes.apps.notifications import AppNotifier
    from agent_runtimes.apps.record import recorder_of

    recorder = recorder_of(session)
    if recorder is None:
        return {
            "notified": False,
            "why": "No application records this session: nobody to tell.",
        }
    app = recorder.app.name.strip() or "Datalayer Steward for AWS"
    saving = _money((recommendation.get("estimate") or {}).get("monthly_saving_usd"))
    outcomes = await AppNotifier(
        app=recorder.app,
        recorder=recorder,
        app_uid=recorder.app_uid,
        deployment_uid=recorder.deployment_uid,
        send=notifications.send_to_ai_agents,
    ).notify(
        HIGH_SEVERITY,
        title=f"{app}: {recommendation.get('finding')}"[:200],
        message=(
            f"{recommendation.get('finding')}"
            + (f" Estimated saving: {saving} a month." if saving else "")
            + " It waits for you under Tool Approvals, on Datalayer: approve it to be handed the change."
        ),
    )
    return {
        "notified": any(o.get("delivery") == "sent" for o in outcomes),
        "channels": outcomes,
    }


#: The event a high-severity recommendation is told as, through the application's channels.
HIGH_SEVERITY = "recommendation.high_severity"
#: The event the week's report is sent as.
WEEKLY_REPORT = "recommendations.weekly"


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


async def decided_in(text: str, session: str = "") -> Optional[Dict[str, Any]]:
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
    # Where it waits among the person's approvals, decided there too: ai-agents
    # keeps the decision in the session's record, once.
    if await _decided_at_ai_agents(session, rec_id, decision):
        return decided
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


async def _decided_at_ai_agents(session: str, rec_id: str, decision: str) -> bool:
    """The approval the recommendation waits under, decided at ai-agents with
    the person's own token (the turn's); whether it was."""
    with _lock:
        approval = _approvals.get((session, rec_id))
    if not approval:
        return False
    try:
        import httpx
        from datalayer_core.utils.urls import DatalayerURLs

        from agent_runtimes.context.identities import get_request_user_jwt

        token = get_request_user_jwt()
        url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
        if not token or not url:
            return False
        verb = "approve" if decision == "approved" else "reject"
        async with httpx.AsyncClient(timeout=15.0) as client:
            answered = await client.post(
                f"{url.rstrip('/')}/api/ai-agents/v1/tool-approvals/{approval}/{verb}",
                json={"note": "Decided on the recommendation's card."},
                headers={"Authorization": f"Bearer {token}"},
            )
    except Exception:  # noqa: BLE001 - kept here instead, below
        return False
    if answered.status_code >= 300:
        return False
    with _lock:
        _approvals.pop((session, rec_id), None)
    return True


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
            for rec_id, item in restored.items():
                if item.get("approval") and item.get("state") == "open":
                    _approvals[(session, rec_id)] = str(item["approval"])
    return len(restored)


async def _deployment_recommendations(
    deployment_uid: str, days: int
) -> List[Dict[str, Any]]:
    """The deployment's recommendations of the last ``days``, each as its record last kept it."""
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.apps.record import token_for

    token, why = token_for(deployment_uid)
    if not token:
        raise LookupError(f"The week's recommendations are not read: {why}")
    url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
    if not url:
        raise LookupError(
            "The week's recommendations are not read: no ai-agents to read them from."
        )
    async with httpx.AsyncClient(timeout=30.0) as client:
        answered = await client.get(
            f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments/{deployment_uid}/recommendations",
            params={"days": days},
            headers={"Authorization": f"Bearer {token}"},
        )
    if answered.status_code >= 300:
        raise LookupError(
            f"The week's recommendations are not read: ai-agents answered "
            f"{answered.status_code}: {answered.text[:200]}"
        )
    return list(answered.json().get("recommendations") or [])


def weekly_summary(listed: List[Mapping[str, Any]], days: int = 7) -> Dict[str, Any]:
    """The report of a period's recommendations: counted by state, their savings, the largest open."""

    def saving(item: Mapping[str, Any]) -> float:
        return float((item.get("estimate") or {}).get("monthly_saving_usd") or 0.0)

    by_state: Dict[str, List[Mapping[str, Any]]] = {}
    for item in listed:
        by_state.setdefault(str(item.get("state") or "open"), []).append(item)
    open_ones = sorted(by_state.get("open", []), key=lambda item: -saving(item))
    return {
        "days": days,
        "count": len(listed),
        "by_state": {state: len(items) for state, items in sorted(by_state.items())},
        "approved_monthly_saving_usd": round(
            sum(saving(i) for i in by_state.get("approved", [])), 2
        ),
        "open_monthly_saving_usd": round(sum(saving(i) for i in open_ones), 2),
        "dismissed_monthly_saving_usd": round(
            sum(saving(i) for i in by_state.get("dismissed", [])), 2
        ),
        "largest_open": [
            {
                "id": i.get("id"),
                "finding": i.get("finding"),
                "monthly_saving_usd": saving(i),
            }
            for i in open_ones[:5]
        ],
    }


def _report_text(summary: Mapping[str, Any]) -> str:
    states = summary["by_state"]
    lines = [
        f"{summary['count']} recommendation(s) in the last {summary['days']} days: "
        f"{states.get('approved', 0)} approved, {states.get('dismissed', 0)} dismissed, "
        f"{states.get('open', 0)} open.",
        f"Approved: {_money(summary['approved_monthly_saving_usd']) or '$0.00'} a month estimated; "
        f"still open: {_money(summary['open_monthly_saving_usd']) or '$0.00'} a month.",
    ]
    for item in summary["largest_open"]:
        lines.append(
            f"- {item['finding']} ({_money(item['monthly_saving_usd'])} a month)"
        )
    lines.append(
        "Approving hands you the change to apply; nothing was changed in your account."
    )
    return "\n".join(lines)


async def recommendations_report(days: int = 7, send: bool = True) -> Any:
    """Report the deployment's recommendations of the last days — decided and open — and send it.

    Read from the deployment's record, every session of the period (each
    recommendation as last kept: open, approved or dismissed), counted by
    state with the estimated monthly savings approved and still open and the
    largest open ones; sent through the application's channels when ``send``.

    Args:
        days: The period, in days (default 7: the week).
        send: Send it through the application's channels (default true).

    Returns:
        ``{report, text, sent}``, or a sentence saying why it could not be read.
    """
    from agent_runtimes.apps import notifications
    from agent_runtimes.apps.notifications import AppNotifier
    from agent_runtimes.apps.record import recorder_of

    recorder = recorder_of(_session())
    if recorder is None or not recorder.deployment_uid:
        return "The report reads a deployment's record: this session is not a deployment's."
    period = max(1, min(int(days), 31))
    try:
        listed = await _deployment_recommendations(recorder.deployment_uid, period)
    except LookupError as refused:
        return str(refused)
    summary = weekly_summary(listed, period)
    text = _report_text(summary)
    sent: List[Dict[str, Any]] = []
    if send:
        app = recorder.app.name.strip() or "Datalayer Steward for AWS"
        sent = await AppNotifier(
            app=recorder.app,
            recorder=recorder,
            app_uid=recorder.app_uid,
            deployment_uid=recorder.deployment_uid,
            send=notifications.send_to_ai_agents,
        ).notify(WEEKLY_REPORT, title=f"{app}: the last {period} days", message=text)
    return {"report": summary, "text": text, "sent": sent}


def forget_recommendations() -> None:
    """Drop every session's list (a test's)."""
    with _lock:
        _kept.clear()
        _approvals.clear()


__all__ = [
    "APPROVE_MEANS",
    "Recommendation",
    "ask_the_person",
    "decided_in",
    "keep_recommendation",
    "recommendations_report",
    "weekly_summary",
    "tell_high_severity",
    "forget_recommendations",
    "list_recommendations",
    "recommendation_card",
    "record_recommendation",
    "restore_recommendations",
]
