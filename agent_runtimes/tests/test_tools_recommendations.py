# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""record_recommendation: a recommendation kept with its evidence, in the
session's list and the application's record; one without evidence, without
its estimate's method or without a reviewable fix refused and never kept."""

from __future__ import annotations

import copy
import json
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
    answer = recommendations.keep_recommendation(**_valid())
    assert answer["recorded"].startswith("rec-")
    kept = answer["recommendation"]
    assert kept["state"] == "open" and kept["recorded_at"]
    recommendations.keep_recommendation(
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
    recommendations.keep_recommendation(
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
    answer = recommendations.keep_recommendation(**given)
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
    answer = recommendations.keep_recommendation(**_valid())
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
    answer = recommendations.keep_recommendation(**_valid())
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


@pytest.mark.asyncio
async def test_approve_on_the_card_is_kept_in_the_session(session: _Recorder) -> None:
    rec_id = recommendations.keep_recommendation(**_valid())["recorded"]
    session.added.clear()

    decided = await recommendations.decided_in(
        _submission(rec_id, "approved"), "session-1"
    )

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
    await recommendations.decided_in(_submission(rec_id, "approved"), "session-1")
    assert len(session.added) == 2


@pytest.mark.asyncio
async def test_dismiss_is_kept_as_declined(session: _Recorder) -> None:
    rec_id = recommendations.keep_recommendation(**_valid())["recorded"]
    session.added.clear()

    await recommendations.decided_in(_submission(rec_id, "dismissed"), "session-1")

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
@pytest.mark.asyncio
async def test_a_turn_that_is_no_press_on_a_card_of_this_session_decides_nothing(
    session: _Recorder, text: str
) -> None:
    recommendations.keep_recommendation(**_valid())
    session.added.clear()

    assert await recommendations.decided_in(text, "session-1") is None
    assert session.added == []
    assert recommendations.list_recommendations(state="open")["count"] == 1


@pytest.mark.asyncio
async def test_a_decision_that_is_neither_decides_nothing(session: _Recorder) -> None:
    rec_id = recommendations.keep_recommendation(**_valid())["recorded"]
    assert (
        await recommendations.decided_in(_submission(rec_id, "applied"), "session-1")
        is None
    )
    # Another session's press does not reach this one.
    assert (
        await recommendations.decided_in(_submission(rec_id, "approved"), "session-2")
        is None
    )


@pytest.mark.asyncio
async def test_a_resumed_session_holds_its_recommendations_as_decided(
    session: _Recorder,
) -> None:
    first = recommendations.keep_recommendation(**_valid())
    second = recommendations.keep_recommendation(**_valid(category="idle"))
    await recommendations.decided_in(
        _submission(first["recorded"], "approved"), "session-1"
    )
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
    assert await recommendations.decided_in(
        _submission(second["recorded"], "dismissed"), "session-1"
    )


@pytest.mark.asyncio
async def test_the_record_keeps_the_press_before_the_agent_reads_the_turn(
    session: _Recorder,
) -> None:
    """The application's record capability reads the person's turn as a run
    starts: a press on a card is kept then, whatever the agent does after."""
    from types import SimpleNamespace

    rec_id = recommendations.keep_recommendation(**_valid())["recorded"]
    session.added.clear()

    class Recorder(_Recorder):
        app = SimpleNamespace(id="steward-aws")

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


# --- Waiting for you, the high-severity notification, the week's report -------------------


class _AppRecorder(_Recorder):
    """A recorder of a deployed application that names its notifications."""

    def __init__(self) -> None:
        super().__init__()
        from agent_runtimes.types import AppSpec

        self.app = AppSpec.model_validate(
            {
                "id": "steward-aws",
                "name": "Datalayer Steward for AWS",
                "kind": "worker",
                "agent": "worker-steward-aws:0.0.1",
                "emoji": "☁️",
                "notifications": ["email"],
            }
        )
        self.app_uid = "app-1"
        self.deployment_uid = "dep-1"
        #: What woke the session; empty when a person opened it.
        self.woken_by: Dict[str, Any] = {}

    def woken(self, session: str) -> Dict[str, Any]:
        return self.woken_by

    def opener(self, session: str) -> str:
        return "" if self.woken_by else "user-1"

    def signed_user(self, session: str) -> Dict[str, Any]:
        return {}

    def acts_for(self, session: str) -> str:
        return "" if self.woken_by else "Ana Lopez"


@pytest.fixture
def deployed(monkeypatch: pytest.MonkeyPatch) -> dict:
    """A deployment's session: its recorder, the token it writes with, ai-agents' answers."""
    from agent_runtimes.apps import notifications
    from agent_runtimes.routes import tool_approvals

    world: dict = {"recorder": _AppRecorder(), "forwarded": [], "sent": []}
    monkeypatch.setattr(record, "current_session", lambda: "session-1")
    monkeypatch.setattr(
        record,
        "recorder_of",
        lambda uid: world["recorder"] if uid == "session-1" else None,
    )
    monkeypatch.setattr(
        record,
        "token_for",
        lambda dep: ("principal-token", "") if dep == "dep-1" else (None, "no token."),
    )

    async def forward(approval: Any, token: Any) -> str:
        world["forwarded"].append((approval, token))
        return "approval-1"

    monkeypatch.setattr(tool_approvals, "forward_approval_to_ai_agents", forward)

    async def sent(body: dict) -> list:
        world["sent"].append(body)
        return [
            {"channel": channel, "delivery": "sent", "detail": ""}
            for channel in body["channels"]
        ]

    monkeypatch.setattr(notifications, "send_to_ai_agents", sent)
    return world


@pytest.mark.asyncio
async def test_a_recorded_recommendation_waits_for_you_among_your_approvals(
    deployed: dict,
) -> None:
    answer = await recommendations.record_recommendation(**_valid())

    assert answer["waiting"] == {"asked": True, "approval": "approval-1"}
    [(approval, token)] = deployed["forwarded"]
    # As the deployment writes its record: its principal's token.
    assert token == "principal-token"
    assert approval.tool_name == recommendations.APPROVAL_TOOL
    assert approval.tool_args["recommendation"]["id"] == answer["recorded"]
    assert approval.tool_args["approve_means"] == recommendations.APPROVE_MEANS
    # Kept with the approval it waits under, so a resumed session still decides it.
    [(kind, _, payload)] = deployed["recorder"].added
    assert kind == "output" and payload["recommendation"]["approval"] == "approval-1"
    # A medium one tells nobody.
    assert "notified" not in answer and deployed["sent"] == []


@pytest.mark.asyncio
async def test_without_a_token_it_is_kept_and_said_not_asked(deployed: dict) -> None:
    deployed["recorder"].deployment_uid = "dep-unknown"
    answer = await recommendations.record_recommendation(**_valid())
    assert answer["waiting"]["asked"] is False
    assert "no token" in answer["waiting"]["why"]
    assert recommendations.list_recommendations()["count"] == 1


@pytest.mark.asyncio
async def test_a_high_severity_recommendation_is_told_through_the_applications_channels(
    deployed: dict,
) -> None:
    answer = await recommendations.record_recommendation(**_valid(severity="high"))

    assert answer["notified"]["notified"] is True
    [body] = deployed["sent"]
    assert body["event"] == recommendations.HIGH_SEVERITY
    assert body["channels"] == ["email"] and body["deployment_uid"] == "dep-1"
    assert (
        _valid()["finding"] in body["message"] and "$40.00 a month" in body["message"]
    )
    # Each channel's outcome in the record, as every notification's.
    assert any(kind == "notification" for kind, _, _ in deployed["recorder"].added)


@pytest.mark.asyncio
async def test_a_severity_that_is_none_of_three_is_refused(deployed: dict) -> None:
    refused = await recommendations.record_recommendation(**_valid(severity="urgent"))
    assert (
        isinstance(refused, str)
        and refused.startswith("Refused")
        and "severity" in refused
    )


@pytest.mark.asyncio
async def test_a_press_on_the_card_decides_its_approval_at_ai_agents_which_keeps_it(
    deployed: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    rec_id = (await recommendations.record_recommendation(**_valid()))["recorded"]
    deployed["recorder"].added.clear()
    decided_at: list = []

    async def at_ai_agents(session: str, rec: str, decision: str) -> bool:
        decided_at.append((session, rec, decision))
        return True

    monkeypatch.setattr(recommendations, "_decided_at_ai_agents", at_ai_agents)
    decided = await recommendations.decided_in(
        _submission(rec_id, "approved"), "session-1"
    )

    assert decided["state"] == "approved"
    assert decided_at == [("session-1", rec_id, "approved")]
    # ai-agents keeps the decision in the record: nothing written twice here.
    assert deployed["recorder"].added == []


@pytest.mark.asyncio
async def test_the_card_press_decides_the_approval_with_the_persons_token(
    deployed: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    import httpx

    from agent_runtimes.context import identities

    rec_id = (await recommendations.record_recommendation(**_valid()))["recorded"]
    asked: list = []

    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(
            (
                str(request.url),
                request.headers["authorization"],
                json.loads(request.content),
            )
        )
        return httpx.Response(200, json={"success": True})

    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kw: real(transport=httpx.MockTransport(answer), **kw),
    )
    monkeypatch.setattr(identities, "get_request_user_jwt", lambda: "persons-token")
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://agents.test")

    assert await recommendations._decided_at_ai_agents("session-1", rec_id, "dismissed")
    [(url, authorization, body)] = asked
    assert (
        url == "https://agents.test/api/ai-agents/v1/tool-approvals/approval-1/reject"
    )
    assert authorization == "Bearer persons-token"
    assert body == {"note": "Decided on the recommendation's card."}
    # Decided once: a second press finds no approval waiting.
    assert not await recommendations._decided_at_ai_agents(
        "session-1", rec_id, "dismissed"
    )


def test_the_weeks_summary_counts_decided_and_open() -> None:
    def item(rec_id: str, state: str, saving: float) -> dict:
        return {
            "id": rec_id,
            "state": state,
            "finding": f"{rec_id} wastes",
            "estimate": {"monthly_saving_usd": saving},
        }

    summary = recommendations.weekly_summary(
        [
            item("a", "approved", 40.0),
            item("b", "open", 3.07),
            item("c", "open", 89.06),
            item("d", "dismissed", 1.0),
        ]
    )
    assert summary["count"] == 4
    assert summary["by_state"] == {"approved": 1, "dismissed": 1, "open": 2}
    assert summary["approved_monthly_saving_usd"] == 40.0
    assert summary["open_monthly_saving_usd"] == 92.13
    assert [i["id"] for i in summary["largest_open"]] == ["c", "b"]


@pytest.mark.asyncio
async def test_the_weeks_report_is_read_from_the_deployment_and_sent(
    deployed: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    read: list = []

    async def of_deployment(deployment: str, days: int) -> list:
        read.append((deployment, days))
        return [
            {
                "id": "a",
                "state": "approved",
                "finding": "An idle instance.",
                "estimate": {"monthly_saving_usd": 3.07},
            }
        ]

    monkeypatch.setattr(recommendations, "_deployment_recommendations", of_deployment)
    report = await recommendations.recommendations_report()

    assert read == [("dep-1", 7)]
    assert report["report"]["by_state"] == {"approved": 1}
    assert "1 approved, 0 dismissed, 0 open" in report["text"]
    assert "nothing was changed in your account" in report["text"]
    [body] = deployed["sent"]
    assert (
        body["event"] == recommendations.WEEKLY_REPORT
        and body["message"] == report["text"]
    )


@pytest.mark.asyncio
async def test_the_report_of_a_session_no_deployment_runs_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(record, "recorder_of", lambda uid: None)
    said = await recommendations.recommendations_report()
    assert isinstance(said, str) and "deployment" in said


# --- The week's report as a document of the editor --------------------------------------------


def _example() -> Dict[str, Any]:
    from pathlib import Path

    return json.loads(
        (
            Path(__file__).resolve().parents[2]
            / "src/apps/__tests__/fixtures/stewardReport.json"
        ).read_text()
    )


def _document(listed: list, **given: Any) -> list:
    import datetime as dt

    given.setdefault("start", dt.date(2026, 11, 9))
    state = recommendations.recommendations_report_document(listed, **given)
    assert set(state) == {"root"} and state["root"]["type"] == "root"
    return state["root"]["children"]


def _words(node: Dict[str, Any]) -> str:
    if node["type"] == "text":
        return node["text"]
    return "".join(_words(child) for child in node["children"])


def test_the_report_document_is_the_editors_nodes_in_reading_order() -> None:
    example = _example()
    title, summary, savings, table, fixes, bullets, closing = _document(
        example["recommendations"], signed=example["signed"]
    )

    assert (title["type"], title["tag"]) == ("heading", "h1")
    assert _words(title) == "Your AWS account: the week of 9 November"
    # The counts and the two sums in bold, the rest plain.
    assert summary["type"] == "paragraph"
    assert [(run["text"], run["format"]) for run in summary["children"]] == [
        ("6 recommendations", 1),
        (" this week: 1 approved, 1 dismissed, 4 open. Approved: ", 0),
        ("$84 a month", 1),
        (" estimated; still open: ", 0),
        ("$1,530 a month", 1),
        (".", 0),
    ]
    assert (savings["tag"], _words(savings)) == ("h2", "Largest savings still open")
    assert table["type"] == "table"
    head, *rows = table["children"]
    assert all(row["type"] == "tablerow" for row in table["children"])
    assert [(cell["type"], cell["headerState"]) for cell in head["children"]] == [
        ("tablecell", 1)
    ] * 4
    assert [_words(cell) for cell in head["children"]] == [
        "Finding",
        "Evidence",
        "A month",
        "State",
    ]
    assert all(cell["headerState"] == 0 for row in rows for cell in row["children"])
    # Still to act on — open, or approved and not applied — largest first; the
    # dismissed one and the fixes are not savings to list.
    assert [[_words(cell) for cell in row["children"]][2:] for row in rows] == [
        ["$920", "Open"],
        ["$610", "Open"],
        ["$84", "Approved"],
    ]
    # A cell holds a paragraph, as the editor writes a table.
    assert rows[0]["children"][0]["children"][0]["type"] == "paragraph"
    assert (fixes["tag"], _words(fixes)) == ("h2", "Fixes to plan")
    assert (bullets["type"], bullets["listType"], bullets["tag"]) == (
        "list",
        "bullet",
        "ul",
    )
    # Most severe first, each with its evidence's sources and its severity.
    assert [_words(item) for item in bullets["children"]] == [
        "A security group open to the internet on port 22 (security-hub, high)",
        "Elastic IPs at 85% of their quota in eu-west-1 (service-quotas, medium)",
    ]
    [last] = closing["children"]
    assert closing["type"] == "paragraph" and last["format"] == 2
    assert last["text"] == (
        "Approving hands you the change to apply; nothing was changed in your "
        "account. Written by ☁️ Datalayer Steward for AWS, on its own."
    )
    # Nobody's blocks are locked: the page is its readers' to edit.
    assert all("$" not in block for block in (title, summary, table, bullets, closing))


def test_the_reports_evidence_is_each_recommendations_own() -> None:
    kept = recommendations.keep_recommendation(**_valid())["recommendation"]
    _, _, _, table, *_ = _document([kept])
    [finding, evidence, amount, state] = [
        _words(cell) for cell in table["children"][1]["children"]
    ]
    assert finding == kept["finding"]
    assert evidence == (
        "cost-optimization-hub, ListRecommendations: "
        "actionType Delete, estimatedMonthlySavings 40.0"
    )
    assert (amount, state) == ("$40", "Open")
    # Two reads are both said; a long one is cut, never rewritten.
    twice = copy.deepcopy(kept)
    twice["evidence"].append(
        {
            "source": "cloudwatch",
            "call": "GetMetricStatistics",
            "read_at": "2026-11-11T07:00:13+00:00",
            "values": {"note": "x" * 400, "points": [1, 2]},
        }
    )
    _, _, _, table, *_ = _document([twice])
    said = _words(table["children"][1]["children"][1])
    first, second = said.split("; ")
    assert first == evidence
    assert second.startswith("cloudwatch, GetMetricStatistics: note xxx")
    assert len(second) == 160 and second.endswith("…")
    # No estimate, no amount: none is made up.
    unknown = copy.deepcopy(kept)
    unknown["estimate"]["monthly_saving_usd"] = None
    _, _, _, table, *_ = _document([unknown])
    assert _words(table["children"][1]["children"][2]) == ""


def test_an_empty_section_says_so_in_a_sentence() -> None:
    title, summary, _, savings, _, fixes, closing = _document([], days=14)
    assert _words(title) == "Your AWS account: the 14 days from 9 November"
    assert _words(summary) == (
        "0 recommendations in the last 14 days: 0 approved, 0 dismissed, 0 open. "
        "Approved: $0 a month estimated; still open: $0 a month."
    )
    assert (savings["type"], _words(savings)) == (
        "paragraph",
        "No saving is open in the last 14 days.",
    )
    assert (fixes["type"], _words(fixes)) == (
        "paragraph",
        "No fix is to plan in the last 14 days.",
    )
    # Unsigned, it closes with the sentence alone.
    assert _words(closing) == recommendations.REPORT_CLOSING
    # Decided and gone, a recommendation is counted and not listed.
    done = recommendations.keep_recommendation(**_valid())["recommendation"]
    done["state"] = "applied"
    _, summary, _, savings, *_ = _document([done])
    assert "0 open, 1 applied." in _words(summary)
    assert savings["type"] == "paragraph"


def test_the_deck_example_is_the_document_this_tool_builds() -> None:
    """The landing's deck draws `document` (its `stewardReportExample.ts`):
    kept to what `recommendations_report_document` writes of `recommendations`."""
    import datetime as dt

    example = _example()
    assert (
        recommendations.recommendations_report_document(
            example["recommendations"],
            start=dt.date.fromisoformat(example["start"]),
            days=example["days"],
            signed=example["signed"],
        )
        == example["document"]
    )
    # Each of them one the tool would keep: nothing here it would refuse.
    for item in example["recommendations"]:
        recommendations.Recommendation.model_validate(item)


class _Spacer:
    """Spacer as the report writes to it: one page per idempotency key."""

    def __init__(self) -> None:
        self.calls: list = []
        self.pages: Dict[str, str] = {}
        self.refuses = ""

    async def __call__(
        self,
        space: str,
        title: str,
        state: Dict[str, Any],
        key: str,
        about: Dict[str, Any],
        *,
        token: str,
    ) -> Dict[str, Any]:
        from agent_runtimes.apps.saving import NotSaved

        self.calls.append(
            {
                "space": space,
                "title": title,
                "state": state,
                "key": key,
                "about": about,
                "token": token,
            }
        )
        if self.refuses:
            raise NotSaved(self.refuses)
        uid = self.pages.setdefault(key, f"doc-{len(self.pages) + 1}")
        return {
            "document": {"uid": uid},
            "space": {"uid": space, "handle_s": "finops", "owner_handle_s": "acme"},
        }


@pytest.fixture
def reporting(deployed: dict, monkeypatch: pytest.MonkeyPatch) -> dict:
    """A deployment granted a Space to write, a week of recommendations, Spacer."""
    import datetime as dt

    from agent_runtimes.apps import saving
    from agent_runtimes.types import AppSpaceGrantSpec

    deployed["recorder"].app.permissions.spaces = [
        AppSpaceGrantSpec(space="sp-wiki", access="read"),
        AppSpaceGrantSpec(space="sp-finops", access="write"),
    ]
    deployed["recorder"].woken_by = {"kind": "schedule"}
    deployed["spacer"] = _Spacer()
    monkeypatch.setattr(saving, "write_on_spacer", deployed["spacer"])
    deployed["today"] = dt.date(2026, 11, 16)
    monkeypatch.setattr(
        recommendations,
        "report_period",
        lambda days, today=None, real=recommendations.report_period: real(
            days, today or deployed["today"]
        ),
    )

    async def of_deployment(deployment: str, days: int) -> list:
        return _example()["recommendations"]

    monkeypatch.setattr(recommendations, "_deployment_recommendations", of_deployment)
    return deployed


@pytest.mark.asyncio
async def test_the_weeks_report_is_written_as_a_page_of_the_space_it_may_write(
    reporting: dict,
) -> None:
    report = await recommendations.recommendations_report()

    [written] = reporting["spacer"].calls
    # In the Space granted to write, never the one it only reads; as itself.
    assert written["space"] == "sp-finops" and written["token"] == "principal-token"
    assert written["title"] == "Your AWS account: the week of 9 November"
    assert written["state"] == _example()["document"]
    # Who wrote it: the application, on its own, for nobody — and which report.
    about = written["about"]
    assert about["saved_by"] == "loop.app" and about["app"]["id"] == "steward-aws"
    assert (about["deployment"], about["on_its_own"], about["for"]) == (
        "dep-1",
        True,
        "",
    )
    assert about["report"] == {
        "event": recommendations.WEEKLY_REPORT,
        "from": "2026-11-09",
        "days": 7,
    }
    assert report["document"] == {
        "uid": "doc-1",
        "link": "/acme/finops/documents/doc-1",
    }
    assert "no_document" not in report
    # The channels are told where it is.
    [body] = reporting["sent"]
    assert body["message"].startswith(report["text"])
    assert body["message"].endswith(": /acme/finops/documents/doc-1")


@pytest.mark.asyncio
async def test_the_same_week_reported_again_is_the_same_page(reporting: dict) -> None:
    first = await recommendations.recommendations_report()
    again = await recommendations.recommendations_report()
    one, two = reporting["spacer"].calls
    assert one["key"] == two["key"] and one["key"].startswith(
        "loop:app-1:report:dep-1:"
    )
    assert again["document"] == first["document"]
    # Another week is another page.
    reporting["today"] += __import__("datetime").timedelta(days=7)
    later = await recommendations.recommendations_report()
    assert reporting["spacer"].calls[-1]["key"] != one["key"]
    assert reporting["spacer"].calls[-1]["title"].endswith("the week of 16 November")
    assert later["document"]["uid"] == "doc-2"


@pytest.mark.asyncio
async def test_opened_by_a_person_the_report_is_signed_for_them(
    reporting: dict,
) -> None:
    reporting["recorder"].woken_by = {}
    await recommendations.recommendations_report()
    [written] = reporting["spacer"].calls
    assert (written["about"]["on_its_own"], written["about"]["for"]) == (
        False,
        "user-1",
    )
    closing = written["state"]["root"]["children"][-1]
    assert _words(closing).endswith(
        "Written by ☁️ Datalayer Steward for AWS, for Ana Lopez."
    )


@pytest.mark.asyncio
async def test_with_no_space_to_write_the_report_is_text_and_says_so(
    reporting: dict,
) -> None:
    reporting["recorder"].app.permissions.spaces = [
        reporting["recorder"].app.permissions.spaces[0]
    ]
    report = await recommendations.recommendations_report()

    assert reporting["spacer"].calls == []
    assert "document" not in report
    assert report["no_document"] == recommendations.NO_SPACE
    assert "No Space is granted" in report["no_document"]
    # Sent as it was before there was a document.
    [body] = reporting["sent"]
    assert body["message"] == report["text"]


@pytest.mark.asyncio
async def test_a_report_spacer_refuses_is_sent_as_text_and_said(
    reporting: dict,
) -> None:
    reporting["spacer"].refuses = "the Space sp-finops cannot be reached: 403."
    report = await recommendations.recommendations_report()
    assert "document" not in report
    assert report["no_document"] == (
        "The report was not written as a document: "
        "the Space sp-finops cannot be reached: 403."
    )
    assert reporting["sent"][0]["message"] == report["text"]
    # Without a token, nothing is tried.
    reporting["spacer"].calls.clear()
    reporting["recorder"].deployment_uid = "dep-unknown"
    report = await recommendations.recommendations_report()
    assert reporting["spacer"].calls == [] and "no token" in report["no_document"]


@pytest.mark.asyncio
async def test_only_counting_writes_and_sends_nothing(reporting: dict) -> None:
    report = await recommendations.recommendations_report(send=False)
    assert report["report"]["count"] == 6 and report["sent"] == []
    assert reporting["spacer"].calls == [] and reporting["sent"] == []
    assert "document" not in report and "no_document" not in report


def test_writing_the_report_is_what_the_tool_says_it_does_and_its_rule_decides() -> (
    None
):
    """The report's page is written without asking only by the tool that says
    it writes, under a rule naming it; `save_to_space` is asked whatever the
    rules say, as before."""
    from agent_runtimes.apps.plugins import rules_for
    from agent_runtimes.apps.rules import (
        ASK_FIRST,
        DO_IT,
        LEAVE_TO_ME,
        RULE_ON_TOOL,
        classes_of,
    )
    from agent_runtimes.apps.saving import APPROVE_AND_SAVE, SAVE_TOOL
    from agent_runtimes.specs.apps import get_app
    from agent_runtimes.types import AppSpec

    assert classes_of("recommendations-report") == ["read", "write"]
    # The Steward's own rule names the tool: done alone, by that rule.
    steward = get_app("steward-aws")
    assert steward is not None
    decided = rules_for(steward).decide("recommendations_report", {}).decision
    assert (decided.behaviour, decided.because) == (DO_IT, RULE_ON_TOOL)
    assert "write" in decided.classes

    def app(rules: list) -> AppSpec:
        return AppSpec.model_validate(
            {
                "id": "another",
                "name": "Another",
                "kind": "worker",
                "agent": "worker-steward-aws:0.0.1",
                "permissions": {"spaces": [{"space": "sp-1", "access": "write"}]},
                "rules": rules,
            }
        )

    # No rule names it: it writes, so the person is asked first — by default,
    # or as its rule on writing says.
    unnamed = rules_for(app([])).decide("recommendations_report", {}).decision
    assert unnamed.behaviour == ASK_FIRST
    never = [{"action": "Write", "applies_to": ["write"], "behaviour": "leave_to_me"}]
    assert (
        rules_for(app(never)).decide("recommendations_report", {}).decision.behaviour
        == LEAVE_TO_ME
    )
    # Naming the report's tool lets nothing else write alone: a save is still shown first.
    named = [
        {
            "action": "Report",
            "applies_to": ["recommendations-report"],
            "behaviour": "do_it",
        }
    ]
    saved = rules_for(app(named)).decide(SAVE_TOOL, {"title": "t", "content": "c"})
    assert (saved.decision.behaviour, saved.decision.because) == (
        ASK_FIRST,
        APPROVE_AND_SAVE,
    )
