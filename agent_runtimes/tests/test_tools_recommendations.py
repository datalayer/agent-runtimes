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
