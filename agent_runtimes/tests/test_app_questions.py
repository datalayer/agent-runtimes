# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an application's code asks is a display; a press of it answers it
(RU-4).

``session.ask(...)`` says the question in words in the conversation and
shows a ``QuestionShown`` display under them with an ``ask`` op on the
session's ui socket — its choices as buttons, its words as a field, a form as
its fields — offering ``reactor.answer`` with a token this session minted for
it. The run ends on it, its result ``{asking}``. The answer comes up the socket
as a press, and the run that names it gives it to the code — checked against
what was asked first (422), never for a question no longer asked (409); a
message typed in the chat is not an answer (409). A rule's prompt is a choice
of Allow and Refuse: two buttons.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

import pytest
from reactor.ui import ANSWER_ACTION, UiAction, UiActionError

from agent_runtimes.loop.apps import AppHost, Application, sessions
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.session import (
    ALLOW,
    REFUSE,
    ChoiceQuestion,
    FileQuestion,
    FormQuestion,
    TextQuestion,
)

ADA = Caller(kind="person", uid="ada")


async def _ignore(body: Dict[str, Any]) -> None:
    return None


def events_of(chunks: List[str]) -> List[Dict[str, Any]]:
    return [
        json.loads(line[len("data:") :])
        for chunk in chunks
        for line in chunk.splitlines()
        if line.startswith("data:")
    ]


async def asking(
    uid: str, question: Any
) -> Tuple[sessions.LiveSession, List[Any], List[Dict[str, Any]]]:
    """A session whose code asks ``question`` in its turn, waiting for it."""
    application = Application(id="notes-assistant", agent="example-simple")
    live = sessions.LiveSession(
        uid=uid,
        agent_id="notes-assistant",
        app=application.spec,
        instance={},
        opened_by=ADA,
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=application.spec, send=_ignore),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    session = await live.host.open(id=live.uid)
    live.session = session
    got: List[Any] = []

    async def work() -> None:
        if question == "rule":
            got.append(await session._allowed("Send the mail to Bob?"))
        else:
            got.append(await session.ask(question))

    chunks = [chunk async for chunk in live._start_turn(work, wraps_run=True)]
    return live, got, events_of(chunks)


def asked_display(live: sessions.LiveSession) -> Dict[str, Any]:
    (frame,) = [f for f in sessions.UI_HUB.ops(live.uid) if f.op.op == "ask"]
    return frame.op.body.model_dump(mode="json")


def press(display: Dict[str, Any], value: Any, key: str) -> UiAction:
    return UiAction(
        action=ANSWER_ACTION,
        display_id=display["id"],
        token=display["actions"][0]["token"],
        payload={"value": value},
        idempotency_id=key,
    )


async def answered(live: sessions.LiveSession, key: str) -> List[Dict[str, Any]]:
    return events_of(
        [
            chunk
            async for chunk in live.run_agui(
                {"runId": f"run-{key}", "messages": []},
                loop={"press": key},
                bearer="",
            )
        ]
    )


async def test_a_choice_is_shown_with_buttons_and_a_press_answers_it() -> None:
    live, got, events = await asking(
        "session-ask-1", ChoiceQuestion("May this be recorded?", ("Yes", "No"))
    )
    assert live.turn == "waiting" and got == []
    # The run ends on the question, its result saying what it asks.
    assert events[-1]["type"] == "RUN_FINISHED"
    assert events[-1]["result"]["asking"]["kind"] == "choice"
    assert "loop.ask" not in json.dumps(events)
    display = asked_display(live)
    assert display["type"] == sessions.QUESTION_DISPLAY_TYPE
    assert display["text"] == "May this be recorded?"
    message_id = display["data"]["message_id"]
    assert display["id"] == f"{message_id}-ask"
    assert [m["content"] for m in live.messages if m["id"] == message_id] == [
        "May this be recorded? (Yes or No)"
    ]
    assert (display["data"]["kind"], display["data"]["options"]) == (
        "choice",
        ["Yes", "No"],
    )
    (offer,) = display["actions"]
    assert offer["name"] == ANSWER_ACTION

    assert live.press_up(ADA, press(display, "Yes", "a-1")) == {"press": "a-1"}
    went_on = await answered(live, "a-1")

    assert got == ["Yes"]
    assert went_on[0]["type"] == "RUN_STARTED"
    assert live.state == "open"
    # The person's words are the conversation's; the question says what
    # answered it, and offers nothing any more.
    assert live.messages[-1] == {
        "id": live.messages[-1]["id"],
        "role": "user",
        "content": "Yes",
    }
    patch = sessions.UI_HUB.ops(live.uid)[-1].op.model_dump(mode="json")
    assert (patch["op"], patch["id"]) == ("patch", display["id"])
    assert patch["body"] == [
        {"op": "replace", "path": "/data/answered", "value": "Yes"},
        {"op": "replace", "path": "/actions", "value": []},
    ]


async def test_an_answer_not_among_what_was_asked_is_refused_and_it_still_waits() -> (
    None
):
    live, got, _ = await asking(
        "session-ask-2", ChoiceQuestion("Which plan?", ("Team", "Solo"))
    )
    display = asked_display(live)
    live.press_up(ADA, press(display, "Enterprise", "a-2"))
    with pytest.raises(sessions.SessionRefused) as refused:
        await answered(live, "a-2")
    assert refused.value.status == 422
    assert "Team, Solo" in refused.value.reason
    assert got == [] and live.turn == "waiting"
    # A message typed in the chat is not an answer.
    with pytest.raises(sessions.SessionRefused) as typed:
        live.run_agui(
            {
                "runId": "r",
                "messages": [{"id": "u", "role": "user", "content": "Team"}],
            },
            loop={},
            bearer="",
        )
    assert typed.value.status == 409
    # The right answer then goes on.
    live.press_up(ADA, press(display, "Team", "a-3"))
    await answered(live, "a-3")
    assert got == ["Team"]


async def test_a_press_of_a_question_no_longer_asked_is_refused() -> None:
    live, got, _ = await asking("session-ask-3", TextQuestion("Your name?"))
    old = asked_display(live)
    live.press_up(ADA, press(old, "Ada", "a-4"))
    await answered(live, "a-4")
    assert got == ["Ada"]
    # Its token still checks on the socket; the run finds nothing asked.
    live.press_up(ADA, press(old, "Grace", "a-5"))
    with pytest.raises(sessions.SessionRefused) as refused:
        await answered(live, "a-5")
    assert refused.value.status == 409


async def test_a_rules_prompt_is_two_buttons_allow_and_refuse() -> None:
    live, got, _ = await asking("session-ask-4", "rule")
    display = asked_display(live)
    assert display["data"]["options"] == [ALLOW, REFUSE]
    assert display["data"]["prompt"] == "Send the mail to Bob?"
    live.press_up(ADA, press(display, REFUSE, "a-6"))
    await answered(live, "a-6")
    assert got == [False]


async def test_a_form_is_answered_with_its_values_checked() -> None:
    schema = {
        "type": "object",
        "properties": {"seats": {"type": "integer", "minimum": 1, "title": "Seats"}},
        "required": ["seats"],
    }
    live, got, _ = await asking("session-ask-5", FormQuestion("How many?", schema))
    display = asked_display(live)
    assert display["data"]["form"] == schema
    live.press_up(ADA, press(display, {"seats": 0}, "a-7"))
    with pytest.raises(sessions.SessionRefused) as refused:
        await answered(live, "a-7")
    assert refused.value.status == 422
    live.press_up(ADA, press(display, {"seats": 3}, "a-8"))
    await answered(live, "a-8")
    assert got == [{"seats": 3}]
    # Values are not the conversation's words: nothing said for them.
    assert all(m.get("role") != "user" for m in live.messages)
    patch = sessions.UI_HUB.ops(live.uid)[-1].op.model_dump(mode="json")
    assert patch["body"][0]["value"] == "Seats: 3"


async def test_a_file_is_answered_by_the_ref_its_upload_answered() -> None:
    """RU-6: a file question offers reactor.answer as any other; its
    value is the ref the upload answered, read back for whoever uploaded it in
    this conversation, held to the question's kinds."""
    live, got, _ = await asking("session-ask-6", FileQuestion("Which file?", (".csv",)))
    display = asked_display(live)
    assert [offer["name"] for offer in display["actions"]] == [ANSWER_ACTION]
    owner = sessions.owner_of(ADA)
    csv = sessions.UI_FILES.put(
        "session-ask-6", owner, "orders.csv", "text/csv", b"a\n1\n"
    )
    png = sessions.UI_FILES.put("session-ask-6", owner, "a.png", "image/png", b"x")
    bobs = sessions.UI_FILES.put(
        "session-ask-6",
        sessions.owner_of(Caller(kind="person", uid="bob")),
        "b.csv",
        "text/csv",
        b"b",
    )
    # Bytes in the press, another's file, a kind it did not ask: refused, still waiting.
    for value, status in (
        ({"name": "x.csv", "data_url": "data:text/csv;base64,eA=="}, 422),
        (bobs.model_dump(), 404),
        (png.model_dump(), 422),
    ):
        live.press_up(ADA, press(display, value, f"k-{status}"))
        with pytest.raises(sessions.SessionRefused) as refused:
            await answered(live, f"k-{status}")
        assert refused.value.status == status
        assert live.turn == "waiting"
    live.press_up(ADA, press(display, csv.model_dump(), "k-ok"))
    events = await answered(live, "k-ok")
    assert events[0]["type"] == "RUN_STARTED"
    [file] = got
    assert (file.name, file.media_type, file.content) == (
        "orders.csv",
        "text/csv",
        b"a\n1\n",
    )
    assert live.describe()["files"][-1]["name"] == "orders.csv"
    patch = sessions.UI_HUB.ops(live.uid)[-1].op.model_dump(mode="json")
    assert patch["body"][1] == {"op": "replace", "path": "/actions", "value": []}


async def test_a_question_asked_is_said_on_the_record_by_its_kind_only() -> None:
    """M-023: the record says the application waits for an answer, whatever
    `record.include` keeps, and ai-agents tells whoever opened the session; the
    question's words stay in the conversation."""
    sent: List[Dict[str, Any]] = []

    async def send(body: Dict[str, Any]) -> None:
        sent.append(body)

    application = Application(id="notes-assistant", agent="example-simple")
    live = sessions.LiveSession(
        uid="session-ask-record",
        agent_id="notes-assistant",
        app=application.spec,
        instance={},
        opened_by=ADA,
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=application.spec, send=send),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    session = await live.host.open(id=live.uid)
    live.session = session

    async def work() -> None:
        await session.ask(ChoiceQuestion("May this be recorded?", ("Yes", "No")))

    [chunk async for chunk in live._start_turn(work, wraps_run=True)]
    await live.recorder.settled(live.uid)
    asked = [
        e for body in sent for e in body.get("entries", []) if e.get("kind") == "asked"
    ]
    assert len(asked) == 1
    assert asked[0]["payload"]["kind"] == "choice" and asked[0]["payload"]["asked_at"]
    assert "May this be recorded" not in json.dumps(asked)
