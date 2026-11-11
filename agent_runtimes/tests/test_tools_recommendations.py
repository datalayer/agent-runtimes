# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""record_recommendation: a recommendation kept with its evidence, in the
session's list and the application's record; one without evidence, without
its estimate's method or without a reviewable fix refused and never kept."""

from __future__ import annotations

import copy
from typing import Any, Dict

import pytest

from agent_runtimes.apps import record
from agent_runtimes.tools import recommendations


def _valid(**overrides: Any) -> Dict[str, Any]:
    given: Dict[str, Any] = {
        "kind": "cost",
        "category": "unattached",
        "resource": {
            "service": "ec2",
            "arn": "arn:aws:ec2:eu-west-1:123456789012:volume/vol-1",
            "account": "123456789012",
            "region": "eu-west-1",
        },
        "finding": "An EBS volume of 500 GiB has been unattached for 41 days.",
        "evidence": [
            {
                "source": "cost-optimization-hub",
                "call": "ListRecommendations",
                "read_at": "2026-11-11T07:00:12+00:00",
                "values": {"actionType": "Delete", "estimatedMonthlySavings": 40.0},
            }
        ],
        "estimate": {
            "monthly_saving_usd": 40.0,
            "by": "aws",
            "method": "Cost Optimization Hub's estimate",
        },
        "confidence": "high",
        "fix": {
            "form": "cli",
            "change": "aws ec2 create-snapshot --volume-id vol-1 && aws ec2 delete-volume --volume-id vol-1",
            "rollback": "Restore the volume from the snapshot taken first.",
            "needs": "write-role",
        },
    }
    given.update(overrides)
    return given


@pytest.fixture(autouse=True)
def _fresh():
    recommendations.forget_recommendations()
    yield
    recommendations.forget_recommendations()


def test_a_recommendation_with_its_evidence_is_kept_and_listed() -> None:
    answer = recommendations.record_recommendation(**_valid())
    assert answer["recorded"].startswith("rec-")
    kept = answer["recommendation"]
    assert kept["state"] == "open" and kept["recorded_at"]
    recommendations.record_recommendation(
        **_valid(
            kind="cost",
            category="oversized",
            estimate={
                "monthly_saving_usd": 120.0,
                "by": "datalayer",
                "method": "m5.2xlarge to m5.xlarge at on-demand price",
            },
        )
    )
    recommendations.record_recommendation(
        **_valid(
            kind="fix",
            category="security",
            estimate={
                "risk": "A public bucket",
                "by": "datalayer",
                "method": "Its ACL",
            },
        )
    )
    listed = recommendations.list_recommendations()
    assert listed["count"] == 3
    assert [
        item["estimate"].get("monthly_saving_usd") for item in listed["recommendations"]
    ] == [120.0, 40.0, None]
    assert listed["monthly_saving_usd"] == 160.0
    assert recommendations.list_recommendations(kind="fix")["count"] == 1
    assert recommendations.list_recommendations(state="applied")["count"] == 0


@pytest.mark.parametrize(
    ("change", "said"),
    [
        (lambda r: r.update(evidence=[]), "evidence"),
        (lambda r: r["evidence"][0].update(values={}), "values it read"),
        (lambda r: r["evidence"][0].pop("read_at"), "read_at"),
        (lambda r: r["estimate"].pop("method"), "estimate.method"),
        (lambda r: r["estimate"].update(method=""), "estimate.method"),
        (lambda r: r["fix"].pop("rollback"), "fix.rollback"),
        (lambda r: r.update(category="vibes"), "category"),
        (lambda r: r["estimate"].update(monthly_saving_usd=-5), "monthly_saving_usd"),
    ],
)
def test_a_recommendation_missing_what_it_rests_on_is_refused_and_not_kept(
    change, said: str
) -> None:
    given = copy.deepcopy(_valid())
    change(given)
    answer = recommendations.record_recommendation(**given)
    assert isinstance(answer, str) and answer.startswith("Refused, not recorded")
    assert said in answer
    assert recommendations.list_recommendations()["count"] == 0


def test_the_application_record_keeps_it_under_outputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    added = []

    class Recorder:
        def add(self, kind: str, summary: str, payload: Dict[str, Any]) -> None:
            added.append((kind, summary, payload))

    monkeypatch.setattr(record, "current_session", lambda: "session-1")
    monkeypatch.setattr(
        record,
        "recorder_of",
        lambda session: Recorder() if session == "session-1" else None,
    )
    answer = recommendations.record_recommendation(**_valid())
    assert added == [
        (
            "output",
            "Recommendation: " + _valid()["finding"],
            {"recommendation": answer["recommendation"]},
        )
    ]
    # Another session lists nothing of it.
    monkeypatch.setattr(record, "current_session", lambda: "session-2")
    assert recommendations.list_recommendations()["count"] == 0


# --- The card a person decides on, and their decision kept in the session ------------------


def _submission(rec_id: str, decision: str) -> str:
    """The turn the transcript sends when a card's button is pressed
    (`encodeFormSubmission`)."""
    import json

    body = {
        "title": "Recommendation",
        "surfaceId": rec_id,
        "values": {"recommendation": rec_id, "decision": decision},
    }
    return (
        'I just submitted "Recommendation".\n\n```a2ui-submission\n'
        + json.dumps(body, indent=2)
        + "\n```\n\nPlease confirm you received it and briefly say what happens next."
    )


class _Recorder:
    def __init__(self) -> None:
        self.added: list = []

    def add(self, kind: str, summary: str, payload: Dict[str, Any]) -> None:
        self.added.append((kind, summary, payload))


@pytest.fixture
def session(monkeypatch: pytest.MonkeyPatch) -> _Recorder:
    recorder = _Recorder()
    monkeypatch.setattr(record, "current_session", lambda: "session-1")
    monkeypatch.setattr(
        record, "recorder_of", lambda uid: recorder if uid == "session-1" else None
    )
    return recorder


def _components(answer: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    [update] = [m for m in answer["messages"] if "updateComponents" in m]
    return {node["id"]: node for node in update["updateComponents"]["components"]}


def test_a_recorded_recommendation_is_shown_as_a_card_with_approve_and_dismiss() -> (
    None
):
    answer = recommendations.record_recommendation(**_valid())
    rec_id = answer["recorded"]
    # What the a2ui-surface renderer reads: a surface of the recommendation's id.
    assert answer["surfaceId"] == rec_id
    assert answer["messages"][0]["createSurface"]["surfaceId"] == rec_id
    nodes = _components(answer)
    assert nodes["root"]["component"] == "Card"
    texts = " ".join(n["text"] for n in nodes.values() if n["component"] == "Text")
    # The finding, its evidence, the estimate and who made it, the change and its rollback.
    for said in (
        _valid()["finding"],
        "cost-optimization-hub ListRecommendations",
        "$40.00 a month",
        "AWS's estimate",
        "aws ec2 delete-volume",
        "Rollback: Restore the volume",
    ):
        assert said in texts
    # What Approve means, said on the card: nothing is changed by the agent.
    assert recommendations.APPROVE_MEANS in texts
    assert "changes nothing in your account" in recommendations.APPROVE_MEANS
    for decision, label in (("approved", "Approve"), ("dismissed", "Dismiss")):
        button = nodes[f"{decision}-button"]
        assert nodes[button["child"]]["text"] == label
        assert button["action"]["event"] == {
            "name": "submit_a2ui_form",
            "context": {"recommendation": rec_id, "decision": decision},
        }


def test_approve_on_the_card_is_kept_in_the_session(session: _Recorder) -> None:
    rec_id = recommendations.record_recommendation(**_valid())["recorded"]
    session.added.clear()

    decided = recommendations.decided_in(_submission(rec_id, "approved"), "session-1")

    assert (
        decided is not None and decided["state"] == "approved" and decided["decided_at"]
    )
    [approval, output] = session.added
    assert approval[0] == "approval"
    assert approval[2]["recommendation"] == rec_id
    assert approval[2]["outcome"] == "approved"
    assert approval[2]["tool"] == "record_recommendation"
    # The recommendation among the outputs with its new state: what a report reads.
    assert output[0] == "output" and output[2]["recommendation"]["state"] == "approved"
    assert recommendations.list_recommendations(state="approved")["count"] == 1
    # The same press twice is kept once.
    recommendations.decided_in(_submission(rec_id, "approved"), "session-1")
    assert len(session.added) == 2


def test_dismiss_is_kept_as_declined(session: _Recorder) -> None:
    rec_id = recommendations.record_recommendation(**_valid())["recorded"]
    session.added.clear()

    recommendations.decided_in(_submission(rec_id, "dismissed"), "session-1")

    assert session.added[0][2]["outcome"] == "declined"
    assert recommendations.list_recommendations(state="dismissed")["count"] == 1


@pytest.mark.parametrize(
    "text",
    [
        "Approve rec-123 please",  # words, not a press
        _submission("rec-unknown", "approved"),  # not this session's
        "```a2ui-submission\nnot json\n```",
    ],
)
def test_a_turn_that_is_no_press_on_a_card_of_this_session_decides_nothing(
    session: _Recorder, text: str
) -> None:
    recommendations.record_recommendation(**_valid())
    session.added.clear()

    assert recommendations.decided_in(text, "session-1") is None
    assert session.added == []
    assert recommendations.list_recommendations(state="open")["count"] == 1


def test_a_decision_that_is_neither_decides_nothing(session: _Recorder) -> None:
    rec_id = recommendations.record_recommendation(**_valid())["recorded"]
    assert (
        recommendations.decided_in(_submission(rec_id, "applied"), "session-1") is None
    )
    # Another session's press does not reach this one.
    assert (
        recommendations.decided_in(_submission(rec_id, "approved"), "session-2") is None
    )


def test_a_resumed_session_holds_its_recommendations_as_decided(
    session: _Recorder,
) -> None:
    first = recommendations.record_recommendation(**_valid())
    second = recommendations.record_recommendation(**_valid(category="idle"))
    recommendations.decided_in(_submission(first["recorded"], "approved"), "session-1")
    entries = [
        {"kind": kind, "summary": summary, "payload": payload}
        for kind, summary, payload in session.added
    ]
    # A new runtime holds nothing until the session is resumed from its record.
    recommendations.forget_recommendations()

    assert recommendations.restore_recommendations("session-1", entries) == 2

    states = {
        item["id"]: item["state"]
        for item in recommendations.list_recommendations()["recommendations"]
    }
    assert states == {first["recorded"]: "approved", second["recorded"]: "open"}
    # And a press after the resume is this session's.
    assert recommendations.decided_in(
        _submission(second["recorded"], "dismissed"), "session-1"
    )


@pytest.mark.asyncio
async def test_the_record_keeps_the_press_before_the_agent_reads_the_turn(
    session: _Recorder,
) -> None:
    """The application's record capability reads the person's turn as a run
    starts: a press on a card is kept then, whatever the agent does after."""
    from types import SimpleNamespace

    rec_id = recommendations.record_recommendation(**_valid())["recorded"]
    session.added.clear()

    class Recorder(_Recorder):
        app = SimpleNamespace(id="aws-account-agent")

        def start(self, uid: str) -> None:
            pass

        def ran(self, uid: str) -> None:
            pass

    capability = record.AppRecordCapability(recorder=Recorder())  # type: ignore[arg-type]
    ctx = SimpleNamespace(
        conversation_id="session-1",
        run_id="run-1",
        prompt=_submission(rec_id, "approved"),
        messages=[],
    )
    await capability.before_run(ctx)

    assert [kind for kind, _, _ in session.added] == ["approval", "output"]
    assert recommendations.list_recommendations(state="approved")["count"] == 1


def test_the_page_fixture_is_the_card_this_tool_draws() -> None:
    """`src/apps/__tests__/recommendation-card.test.ts` reads this card: kept
    to what `recommendation_card` writes."""
    import json
    from pathlib import Path

    fixture = json.loads(
        (
            Path(__file__).resolve().parents[2]
            / "src/apps/__tests__/fixtures/recommendationCard.json"
        ).read_text()
    )
    card = recommendations.recommendation_card(fixture["recommendation"])
    assert {key: fixture[key] for key in card} == card
