# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What it sends says who wrote it (LOOP I-10).

A note filed or a message sent through a connection is written by the
account the connection acts as. The rules sign it: the argument the
catalogue says carries what a tool sends is closed with the application's
byline — the same sentence a page it saves ends with — naming the person it
acts for by name, never by uid, before the call is made or asked. What only
reads is never touched.
"""

import asyncio
import time
from typing import Any, Dict, List, Tuple

import jwt
import pytest
from pydantic_ai.messages import ToolCallPart

from agent_runtimes.loop.apps import sessions
from agent_runtimes.loop.apps.agent import app_capabilities
from agent_runtimes.loop.apps.callers import Caller, CallerVerifier, person_name
from agent_runtimes.loop.apps.enforcement import AppRulesCapability
from agent_runtimes.loop.apps.record import _SESSION, AppRecorder
from agent_runtimes.loop.apps.rules import Decision, signs_of
from agent_runtimes.loop.apps.saving import (
    AppSavingCapability,
    byline,
    signature,
    signed,
)
from agent_runtimes.specs.actions import SERVER_ACTIONS
from agent_runtimes.types import AppSpec, ServerActionsSpec

#: A connection of nobody's catalogue: an Odoo whose notes are read and filed.
NOTES = ServerActionsSpec(
    checked="2026-10-10",
    tools={
        "read_notes": ["read"],
        "post_note": ["send"],
        "log_*": ["write"],
        "archive_note": ["write"],
    },
    signs={"post_note": "body", "log_*": "text"},
)


@pytest.fixture(autouse=True)
def notes_server(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(SERVER_ACTIONS, "odoo-notes", NOTES)


def desk(**changes: Any) -> AppSpec:
    data: Dict[str, Any] = {
        "id": "help-desk",
        "name": "Help Desk",
        "emoji": "🧾",
        "kind": "chat",
        "agent": "cog-crawler:0.0.1",
        "connections": [
            {"server": "odoo-notes", "access": "write"},
            {"server": "slack", "access": "write"},
            {"server": "google-workspace", "access": "write"},
        ],
        "rules": [
            {
                "action": "Log a note",
                "applies_to": ["odoo-notes.log_call"],
                "behaviour": "do_it",
            }
        ],
    }
    data.update(changes)
    return AppSpec.model_validate(data)


class Run:
    """An application's rules as its agent runs them, with a person who approves."""

    def __init__(self, app: AppSpec, recorder: AppRecorder) -> None:
        self.asked: List[Tuple[str, Dict[str, Any]]] = []

        async def ask(tool: str, args: Dict[str, Any], decision: Decision) -> None:
            self.asked.append((tool, dict(args)))

        [rules] = [
            capability
            for capability in app_capabilities(app, recorder=recorder, ask_rule=ask)
            if isinstance(capability, AppRulesCapability)
        ]
        self.rules = rules
        self.rules.known_mcp_tools = lambda: set()

    def call(self, session: str, tool: str, args: Dict[str, Any]) -> Dict[str, Any]:
        async def calling() -> Dict[str, Any]:
            token = _SESSION.set(session)
            try:
                return await self.rules.before_tool_execute(
                    None, call=ToolCallPart(tool, args), tool_def=None, args=args
                )
            finally:
                _SESSION.reset(token)

        return asyncio.run(calling())


def recorder_for(app: AppSpec) -> AppRecorder:
    async def nothing(body: Dict[str, Any]) -> None:
        return None

    return AppRecorder(app=app, send=nothing)


def test_the_catalogue_says_which_argument_a_tool_sends_its_words_in() -> None:
    assert signs_of("google-workspace.send_gmail_message") == "body"
    assert signs_of("google-workspace:0.0.1.draft_gmail_message") == "body"
    assert signs_of("google-workspace.send_message") == "message_text"
    assert signs_of("slack.slack_post_message") == "text"
    assert signs_of("slack.slack_reply_to_thread") == "text"
    assert signs_of("odoo-notes.post_note") == "body"
    # A pattern answers as it answers for the tool's classes.
    assert signs_of("odoo-notes.log_call") == "text"
    # What reads, what says none, and a tool of no server sign nothing.
    for ref in (
        "google-workspace.search_gmail_messages",
        "slack.slack_add_reaction",
        "odoo-notes.read_notes",
        "odoo-notes.archive_note",
        "runtime-send-mail",
        "no-such-server.post",
    ):
        assert signs_of(ref) == "", ref


def test_its_signature_is_the_byline_of_the_page_it_saves() -> None:
    app = desk()
    for on_its_own, name in ((False, "Ana Lopez"), (False, ""), (True, "Ana Lopez")):
        assert (
            byline(app, on_its_own=on_its_own, for_name=name)
            == f"*{signature(app, on_its_own=on_its_own, for_name=name)}*"
        )
    assert (
        signature(app, on_its_own=False, for_name="Ana Lopez")
        == "Written by 🧾 Help Desk, for Ana Lopez."
    )
    sentence = "Written by 🧾 Help Desk."
    assert signed("Call back at 3.", sentence) == f"Call back at 3.\n\n{sentence}"
    # Signed once: a draft sent as it was drafted keeps one byline.
    assert signed(f"Call back at 3.\n\n{sentence}\n", sentence) == (
        f"Call back at 3.\n\n{sentence}\n"
    )


def test_a_note_it_files_names_the_application_and_the_person_by_name() -> None:
    app = desk()
    recorder = recorder_for(app)
    recorder.opened("s-ana", "u-ana", name="Ana Lopez")
    run = Run(app, recorder)
    args = {"record_id": 7, "body": "The customer asked for a refund."}
    sent = run.call("s-ana", "odoo-notes__post_note", args)
    assert sent == {
        "record_id": 7,
        "body": "The customer asked for a refund.\n\n"
        "Written by 🧾 Help Desk, for Ana Lopez.",
    }
    # The person approves what goes out, as it goes out.
    assert run.asked == [("odoo-notes__post_note", sent)]
    # Nothing of the uid is in the words.
    assert "u-ana" not in sent["body"]


def test_a_call_its_rules_do_without_asking_is_signed_too() -> None:
    app = desk()
    recorder = recorder_for(app)
    recorder.opened("s-ana", "u-ana", name="Ana Lopez")
    run = Run(app, recorder)
    sent = run.call("s-ana", "odoo-notes__log_call", {"text": "Called twice."})
    assert sent == {"text": "Called twice.\n\nWritten by 🧾 Help Desk, for Ana Lopez."}
    assert run.asked == []


def test_a_message_through_call_tool_is_signed_in_its_arguments() -> None:
    app = desk()
    recorder = recorder_for(app)
    run = Run(app, recorder)
    sent = run.call(
        "s-nobody-named",
        "call_tool",
        {
            "tool_name": "slack__slack_post_message",
            "arguments": {"channel_id": "C1", "text": "Deploy done."},
        },
    )
    # Nobody known by name: the application alone, never a uid.
    assert sent["arguments"] == {
        "channel_id": "C1",
        "text": "Deploy done.\n\nWritten by 🧾 Help Desk.",
    }


def test_a_mail_it_sends_on_its_own_says_so() -> None:
    app = desk(
        rules=[
            {
                "action": "Send mail",
                "applies_to": ["google-workspace.send_gmail_message"],
                "behaviour": "do_it",
            }
        ]
    )
    recorder = recorder_for(app)
    recorder.opened("s-tick", "u-ana", name="Ana Lopez")
    recorder.woken_by = {"kind": "schedule", "trigger": "weekly"}
    run = Run(app, recorder)
    sent = run.call(
        "s-tick",
        "google-workspace__send_gmail_message",
        {"to": "team@example.com", "subject": "Digest", "body": "Three things."},
    )
    assert sent["body"] == "Three things.\n\nWritten by 🧾 Help Desk, on its own."


def test_what_only_reads_or_names_no_words_is_never_touched() -> None:
    app = desk()
    recorder = recorder_for(app)
    recorder.opened("s-ana", "u-ana", name="Ana Lopez")
    run = Run(app, recorder)
    for tool, args in (
        ("odoo-notes__read_notes", {"body": "a query that looks like words"}),
        ("odoo-notes__archive_note", {"note_id": 3, "body": "kept as it is"}),
        ("odoo-notes__post_note", {"record_id": 7}),
        ("odoo-notes__post_note", {"record_id": 7, "body": "   "}),
        ("odoo-notes__post_note", {"record_id": 7, "body": ["not", "text"]}),
    ):
        assert run.call("s-ana", tool, dict(args)) == args, tool


def test_a_person_is_named_from_the_token_iam_accepted_and_never_by_uid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    claims = {"sub": "u-ana", "user": {"firstName": "Ana", "lastName": "Lopez"}}
    assert person_name(claims) == "Ana Lopez"
    assert person_name({"sub": "u-ana", "user": {"firstName": "Ana"}}) == "Ana"
    assert person_name({"sub": "u-ana", "user": {"handle": "ana"}}) == ""
    assert person_name({"sub": "u-ana"}) == ""

    async def iam(url: str, bearer: str) -> int:
        return 200

    token = jwt.encode(
        {"exp": int(time.time()) + 3600, **claims}, "s" * 32, algorithm="HS256"
    )
    monkeypatch.setenv("DATALAYER_IAM_URL", "http://iam")
    caller = asyncio.run(CallerVerifier(fetch=iam).verify(token))
    assert (caller.kind, caller.uid, caller.name) == ("person", "u-ana", "Ana Lopez")


def test_the_session_it_opens_keeps_who_opened_it_by_name() -> None:
    app = desk()
    live = sessions.new_session(
        agent_id="help-desk-i10",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="u-ana", name="Ana Lopez"),
        acts_as={"kind": "person", "uid": "u-ana"},
    )
    try:
        assert live.recorder.opener(live.uid) == "u-ana"
        assert live.recorder.acts_for(live.uid) == "Ana Lopez"
    finally:
        sessions._SESSIONS.pop(live.uid, None)
    # An embed's visitor is nobody known, by uid or by name.
    visit = sessions.new_session(
        agent_id="help-desk-i10",
        app=app,
        instance={},
        opened_by=Caller(kind="embed", uid="v-1", name="Somebody"),
        acts_as={"kind": "person", "uid": "owner"},
    )
    try:
        assert visit.recorder.acts_for(visit.uid) == ""
    finally:
        sessions._SESSIONS.pop(visit.uid, None)


def test_the_host_s_user_comes_first_then_who_opened_it() -> None:
    recorder = recorder_for(desk())
    recorder.opened("s-1", "u-ana", name="Ana Lopez")
    assert recorder.acts_for("s-1") == "Ana Lopez"
    recorder.signed("s-1", {"sub": "ext-9", "name": "Ana at Acme"})
    assert recorder.acts_for("s-1") == "Ana at Acme"
    # A person with no name in their token is named by nothing.
    recorder.opened("s-2", "u-bo")
    assert recorder.acts_for("s-2") == ""
    recorder.opened("s-2", "")
    assert recorder.acts_for("s-2") == ""


def test_a_page_it_saves_names_the_person_it_wrote_for() -> None:
    app = desk(
        permissions={"spaces": [{"space": "sp-notes", "access": "write"}]},
    )
    recorder = recorder_for(app)
    recorder.opened("s-ana", "u-ana", name="Ana Lopez")
    [saving] = [
        capability
        for capability in app_capabilities(app, recorder=recorder)
        if isinstance(capability, AppSavingCapability)
    ]
    pages: List[Dict[str, Any]] = []

    async def write(
        space: str, title: str, state: Dict[str, Any], key: str, about: Dict[str, Any]
    ) -> Dict[str, Any]:
        pages.append(state)
        return {"document": {"uid": "doc-1"}, "space": {}}

    saving.write = write

    async def save() -> str:
        token = _SESSION.set("s-ana")
        try:
            return await saving.save_to_space("Refunds", "One refund asked.")
        finally:
            _SESSION.reset(token)

    asyncio.run(save())
    from agent_runtimes.orchestration.documents import markdown_document

    assert pages == [
        markdown_document(
            "Refunds", "One refund asked.\n\n*Written by 🧾 Help Desk, for Ana Lopez.*"
        )
    ]
