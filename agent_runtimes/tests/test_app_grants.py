# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""*Do it if I asked*, decided from what the person approved in advance (LOOP U-25)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.loop.apps.enforcement import (
    AppRulesCapability,
    Enforced,
    approval_marks,
)
from agent_runtimes.loop.apps.grants import (
    Approval,
    StandingApprovals,
    covers,
    reaches,
    recipients_of,
)
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.rules import Decision
from agent_runtimes.types import AppSpec

APP_UID = "01J9APP"
SEND = "google-workspace__send_gmail_message"


def _until(days: float = 3) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def _approval(**changes: Any) -> dict:
    raw = {
        "uid": "g1",
        "app_uid": APP_UID,
        "action": "send",
        "to": ["@example.com"],
        "words": "send replies to my team",
        "until": _until(),
        "state": "standing",
    }
    raw.update(changes)
    return raw


def _decision(*classes: str) -> Decision:
    return Decision(
        "if_asked",
        "google-workspace.send_gmail_message",
        classes,
        "rule_on_class",
        "Send",
    )


def _app() -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "connections": [{"server": "google-workspace", "access": "write"}],
            "rules": [
                {"action": "Send", "applies_to": ["send"], "behaviour": "if_asked"}
            ],
        }
    )


# --- what covers a call ------------------------------------------------------------


def test_recipients_are_read_from_the_arguments_that_name_them() -> None:
    assert recipients_of(
        {
            "to": "Ana <ana@example.com>, bo@example.com",
            "cc": ["cy@other.org"],
            "subject": "ana@nowhere.org",
            "attendees": [{"email": "di@example.com"}],
        }
    ) == ["ana@example.com", "bo@example.com", "cy@other.org", "di@example.com"]
    assert recipients_of(None) == []


def test_a_recipient_is_reached_by_its_address_its_domain_or_its_channel() -> None:
    assert reaches("ana@example.com", "ana@example.com")
    assert reaches("ana@example.com", "@example.com")
    assert not reaches("ana@example.com.evil.org", "@example.com")
    assert not reaches("ana@sub.example.com", "@example.com")
    assert reaches("#support", "#support") and reaches("support", "#support")
    assert not reaches("ana@example.com", "#support")


def test_an_approval_covers_its_action_to_its_recipients_until_it_ends() -> None:
    approval = Approval.of(_approval())
    assert covers(approval, _decision("send"), {"to": "ana@example.com"})
    # Reading beside it needs no approval.
    assert covers(approval, _decision("read", "send"), {"to": "ana@example.com"})
    # Somebody it does not name, or nobody named at all: not covered.
    assert not covers(
        approval, _decision("send"), {"to": "ana@example.com, x@other.org"}
    )
    assert not covers(approval, _decision("send"), {})
    # Another action, or one more beside it.
    assert not covers(approval, _decision("delete"), {"to": "ana@example.com"})
    assert not covers(approval, _decision("send", "delete"), {"to": "ana@example.com"})
    # Ended.
    ended = Approval.of(_approval(until=_until(-1)))
    assert not covers(ended, _decision("send"), {"to": "ana@example.com"})


def test_an_approval_naming_nobody_reaches_anyone() -> None:
    approval = Approval.of(_approval(to=[]))
    assert covers(approval, _decision("send"), {})
    assert covers(approval, _decision("send"), {"to": "x@other.org"})


# --- decided at the tool call ------------------------------------------------------


class Harness:
    def __init__(self, approvals: list[dict] | Exception) -> None:
        self.asked: list[str] = []
        self.recorded: list[Enforced] = []
        self.reads = 0
        self.unread: list[str] = []

        async def read(app_uid: str, deployment_uid: str) -> list[dict]:
            self.reads += 1
            assert app_uid == APP_UID and deployment_uid == "dep-1"
            if isinstance(approvals, Exception):
                raise approvals
            return approvals

        async def ask(tool: str, args: dict, decision: Decision) -> None:
            self.asked.append(tool)

        self.capability = AppRulesCapability(
            app=_app(),
            app_uid=APP_UID,
            ask=ask,
            record=self.recorded.append,
            known_mcp_tools=lambda: {SEND},
            granted=StandingApprovals(
                app_uid=APP_UID,
                deployment_uid="dep-1",
                read=read,
                unread=self.unread.append,
            ).granted,
        )

    async def call(self, args: dict) -> dict:
        return await self.capability.before_tool_execute(
            None, call=ToolCallPart(SEND, args), tool_def=None, args=args
        )


@pytest.mark.asyncio
async def test_a_call_approved_in_advance_runs_without_asking_and_is_recorded_so() -> (
    None
):
    harness = Harness([_approval()])
    args = {"to": "ana@example.com"}
    assert await harness.call(args) == args
    assert harness.asked == []
    assert harness.recorded[0].approved is not None
    assert harness.recorded[0].approved.uid == "g1"


@pytest.mark.asyncio
async def test_a_call_no_approval_covers_asks_the_person() -> None:
    harness = Harness([_approval()])
    await harness.call({"to": "x@other.org"})
    assert harness.asked == [SEND]
    assert harness.recorded[0].approved is None


@pytest.mark.asyncio
async def test_another_application_s_approval_covers_nothing() -> None:
    harness = Harness([_approval(app_uid="another")])
    await harness.call({"to": "ana@example.com"})
    assert harness.asked == [SEND]


@pytest.mark.asyncio
async def test_approvals_that_cannot_be_read_are_none_and_the_person_is_asked() -> None:
    harness = Harness(RuntimeError("IAM answered 503."))
    await harness.call({"to": "ana@example.com"})
    assert harness.asked == [SEND]
    assert harness.unread == ["IAM answered 503."]


@pytest.mark.asyncio
async def test_approvals_are_read_again_only_after_a_few_seconds() -> None:
    harness = Harness([_approval()])
    await harness.call({"to": "ana@example.com"})
    await harness.call({"to": "bo@example.com"})
    assert harness.reads == 1


@pytest.mark.asyncio
async def test_ask_first_is_never_decided_by_an_approval() -> None:
    harness = Harness([_approval()])
    harness.capability.app = AppSpec.model_validate(
        {
            **_app().model_dump(by_alias=True, exclude_none=True),
            "rules": [
                {"action": "Send", "applies_to": ["send"], "behaviour": "ask_first"}
            ],
        }
    )
    await harness.call({"to": "ana@example.com"})
    assert harness.asked == [SEND]
    assert harness.reads == 0


def test_the_record_says_what_was_approved_in_advance(monkeypatch) -> None:
    recorder = AppRecorder(app=_app(), app_uid=APP_UID)
    added: list[tuple] = []
    monkeypatch.setattr(recorder, "add", lambda *entry: added.append(entry))
    approved = Approval.of(_approval())
    recorder.decided(Enforced(SEND, _decision("send"), approved=approved))
    kind, summary, payload = added[0]
    assert kind == "decision" and "approved in advance" in summary
    assert payload["approved_in_advance"] == "g1"
    assert payload["approved_words"] == "send replies to my team"


def test_an_approval_asked_names_its_application_and_its_rule() -> None:
    assert approval_marks("desk", APP_UID, "Your rule “Send”: ask you first.") == {
        "_rule": "Your rule “Send”: ask you first.",
        "_app": "desk",
        "_app_uid": APP_UID,
    }
    assert "_app_uid" not in approval_marks("desk", "", "s")
