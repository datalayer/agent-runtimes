# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the record keeps of a person's answers, and for how long (LOOP R-07).

An approval's outcome is an entry of its own — approved, declined, or not
answered in time — whether a rule or a Gate asked. An application that names
a Track keeps its record as the Track says.
"""

import asyncio
from typing import Any

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.guardrails.tool_approvals import ToolApprovalTimeoutError
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.loop.apps.guards import (
    AppCheckBlockedError,
    AppChecks,
    AppChecksCapability,
    Verdict,
)
from agent_runtimes.loop.apps.record import (
    _SESSION,
    AppRecorder,
    keep_days_of,
    kept_of,
)
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.specs.apps import APP_CATALOGUE
from agent_runtimes.tests.test_apps_enforcement import Harness
from agent_runtimes.types import AppSpec

TRIAGE = APP_CATALOGUE["inbox-triage"]
SEND = "google-workspace__send_gmail_message"


def recorder_of_triage(include: list[str]) -> AppRecorder:
    spec = AppSpec.model_validate(
        {
            **TRIAGE.model_dump(),
            "record": {"keep_for": "90_days", "include": include},
        }
    )
    recorder = AppRecorder(app=spec, app_uid="app-1")
    _SESSION.set("s-1")
    return recorder


def approvals(recorder: AppRecorder) -> list[dict[str, Any]]:
    return [e for e in recorder._pending.get("s-1", []) if e["kind"] == "approval"]


@pytest.mark.asyncio
async def test_an_approval_given_is_an_entry_of_its_own() -> None:
    recorder = recorder_of_triage(["approvals", "decisions"])
    harness = Harness(recorder.app, answered=recorder.answered)
    await harness.call(SEND, {"to": "marta@example.com"})
    [entry] = approvals(recorder)
    assert entry["summary"] == f"{SEND}: approved"
    assert entry["payload"]["outcome"] == "approved"
    assert "Send a message" in entry["payload"]["asked_under"]


@pytest.mark.asyncio
async def test_an_approval_declined_is_kept_and_the_call_refused() -> None:
    recorder = recorder_of_triage(["approvals"])
    harness = Harness(recorder.app, approve=False, answered=recorder.answered)
    with pytest.raises(AppRuleBlockedError):
        await harness.call(SEND, {})
    assert [e["payload"]["outcome"] for e in approvals(recorder)] == ["declined"]


@pytest.mark.asyncio
async def test_a_question_nobody_answered_in_time_says_so() -> None:
    recorder = recorder_of_triage(["approvals"])
    harness = Harness(recorder.app, answered=recorder.answered)

    async def late(tool: str, args: dict, decision: Decision) -> None:
        raise ToolApprovalTimeoutError(f"Approval for tool '{tool}' timed out after 1s")

    harness.capability.ask = late
    with pytest.raises(ToolApprovalTimeoutError):
        await harness.call(SEND, {})
    [entry] = approvals(recorder)
    assert entry["summary"] == f"{SEND}: not answered in time"


@pytest.mark.asyncio
async def test_no_approval_is_kept_unless_approvals_are() -> None:
    recorder = recorder_of_triage(["decisions"])
    harness = Harness(recorder.app, answered=recorder.answered)
    await harness.call(SEND, {})
    assert approvals(recorder) == []


@pytest.mark.asyncio
async def test_a_gate_that_asks_keeps_the_answer_too() -> None:
    recorder = recorder_of_triage(["approvals", "checks"])
    checks = AppChecks.of(recorder.app)
    checks.verdict_at = lambda stage, seen: Verdict(  # type: ignore[method-assign]
        "ask", "Confidence is low: a person decides.", "gate-low-confidence"
    )

    async def decline(tool: str, args: dict, sentence: str) -> None:
        raise AppCheckBlockedError(sentence)

    capability = AppChecksCapability(
        checks=checks, ask=decline, answered=recorder.answered
    )
    with pytest.raises(AppCheckBlockedError):
        await capability.before_tool_execute(
            None, call=ToolCallPart("search", {}), tool_def=None, args={}
        )
    [entry] = approvals(recorder)
    assert entry["payload"] == {
        "tool": "search",
        "outcome": "declined",
        "asked_under": "Confidence is low: a person decides.",
        "note": "",
    }


# --- the Track ----------------------------------------------------------------


def test_an_application_without_a_track_keeps_its_record_as_it_says() -> None:
    recorder = recorder_of_triage(["conversations"])
    assert keep_days_of(recorder.app) == 90
    assert recorder.kept("turn") and not recorder.kept("approval")


def test_an_application_naming_a_track_keeps_its_record_as_the_track_says() -> None:
    report = APP_CATALOGUE["pipeline-report"]
    assert report.checks.track.startswith("financial-reporting")
    kept = kept_of(report)
    assert (keep_days_of(report), kept.track) == (2555, "financial-reporting")
    recorder = AppRecorder(app=report, app_uid="app-2")
    # Its Track keeps approvals, checks and the rules' decisions, whatever
    # its own `record.include` leaves out.
    assert all(recorder.kept(kind) for kind in ("approval", "check", "decision"))


def test_a_run_starts_in_the_record_at_once() -> None:
    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    async def run() -> None:
        recorder = AppRecorder(app=recorder_of_triage([]).app, send=send)
        recorder.start("s-2")
        recorder.ran("s-2")
        await asyncio.sleep(0)
        await asyncio.sleep(0)

    asyncio.run(run())
    assert [e["kind"] for e in sent[0]["entries"]] == ["session", "run"]
    assert sent[0]["entries"][1]["summary"] == "Inbox Triage is working"
