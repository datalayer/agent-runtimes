# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an answer shows is a display; its buttons press only what it offered
(RU-2, RU-W).

An answer's components reach the page as an ``AnswerShows`` display — a
``show`` op on the session's ui socket, never a fake tool call — and each
button it has offers its action with a token this session minted for that
display. A press comes up the socket and is checked before anything runs: a
token minted for another display, another action or another session is a
403, a press of an action the code has none of a 422; checked, it waits for
the run that names it (``forwardedProps.loop.press``), once. A run carrying a
display's press itself is refused, and a button naming no ``@app.action`` is
refused when the answer is sent.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest
from pydantic import BaseModel
from reactor.ui import UiAction, UiActionError

from agent_runtimes.apps import AppHost, Application, sessions
from agent_runtimes.apps.callers import Caller
from agent_runtimes.apps.components import ANSWER_DISPLAY_TYPE, AnswerShows
from agent_runtimes.apps.record import AppRecorder
from agent_runtimes.apps.session import Session


class Row(BaseModel):
    """What the button presses with: the row it was on (RU-5)."""

    row: int = 0


async def _ignore(body: Dict[str, Any]) -> None:
    return None


async def hosted(uid: str) -> tuple[sessions.LiveSession, List[Any]]:
    application = Application(id="notes-assistant", agent="example-simple")
    pressed: List[Any] = []

    @application.action("again", payload=Row)
    async def again(session: Any, payload: Row) -> None:
        pressed.append(payload.model_dump())
        await session.send("Again.")

    live = sessions.LiveSession(
        uid=uid,
        agent_id="notes-assistant",
        app=application.spec,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=application.spec, send=_ignore),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    live.session = await live.host.open(uid=live.uid)
    return live, pressed


def opened(live: sessions.LiveSession) -> Session:
    """The session a live session holds, once it is open."""
    assert live.session is not None
    return live.session


def events_of(chunks: List[str]) -> List[Dict[str, Any]]:
    return [
        json.loads(line[len("data:") :])
        for chunk in chunks
        for line in chunk.splitlines()
        if line.startswith("data:")
    ]


def drained(queue: Any) -> List[Dict[str, Any]]:
    chunks: List[str] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        chunks.append(chunk)
    return events_of(chunks)


def shown(uid: str) -> Dict[str, Any]:
    """The one display the session showed, as its socket sends it."""
    (frame,) = [f for f in sessions.UI_HUB.ops(uid) if f.op.op == "show"]
    return frame.op.body.model_dump(mode="json")


def button(session: Any, action: str) -> List[Any]:
    return [
        session.ui.button("go", child="go-label", action={"event": {"name": action}}),
        session.ui.text("go-label", text="Again"),
    ]


ADA = Caller(kind="person", uid="ada")


def press_of(display: Dict[str, Any], **change: Any) -> UiAction:
    return UiAction.model_validate(
        {
            "action": "again",
            "display_id": display["id"],
            "token": display["actions"][0]["token"],
            "payload": {"row": 2},
            **change,
        }
    )


async def test_a_button_is_offered_with_a_token_for_its_display() -> None:
    sessions.forget_sessions()
    live, _ = await hosted("session-ru2-1")
    queue = live._open_stream()
    sent = await opened(live).send("Done.", show=button(opened(live), "again"))

    # Nothing of it on the run stream: the text only.
    assert {e["type"] for e in drained(queue)} <= {
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
    }
    display = shown(live.uid)
    assert display["type"] == ANSWER_DISPLAY_TYPE
    assert display["data"]["message_id"] == sent.id
    (offer,) = display["actions"]
    assert offer["name"] == "again" and offer["token"]
    # The surface's own id is the display's: no `answer-` prefix to read.
    assert display["data"]["surface"]["surfaceId"] == display["id"]
    # The model reads the words, never the surface.
    answer = AnswerShows.from_wire(display)
    assert "surface" not in answer.model_view()["data"]
    assert answer.model_view()["text"] == "Notes assistant showed Button go, Text Again"


async def test_a_press_checked_on_the_socket_runs_once_in_the_run_naming_it() -> None:
    sessions.forget_sessions()
    live, pressed = await hosted("session-ru2-2")
    live._open_stream()
    await opened(live).send("Done.", show=button(opened(live), "again"))
    live._end_stream()
    waiting = live.press_up(ADA, press_of(shown(live.uid), idempotency_id="p-1"))
    assert waiting == {"press": "p-1"}
    assert pressed == []

    chunks = [
        chunk
        async for chunk in live.run_agui(
            {"runId": "r1", "messages": []}, loop={"press": "p-1"}, bearer=""
        )
    ]

    assert pressed == [{"row": 2}]
    assert "Again." in json.dumps(events_of(chunks))
    # Once: the run that names it again finds nothing waiting.
    with pytest.raises(sessions.SessionRefused) as again:
        live.run_agui({"runId": "r2", "messages": []}, loop={"press": "p-1"}, bearer="")
    assert again.value.status == 422


@pytest.mark.parametrize(
    ("change", "status"),
    [
        ({"token": "forged"}, 403),
        ({"display_id": "another-display"}, 403),
        ({"action": "nobody-registered"}, 422),
    ],
)
async def test_a_press_not_offered_is_refused_before_anything_runs(
    change: Dict[str, Any], status: int
) -> None:
    sessions.forget_sessions()
    live, pressed = await hosted(f"session-ru2-{status}-{len(change)}")
    live._open_stream()
    await opened(live).send("Done.", show=button(opened(live), "again"))

    with pytest.raises(UiActionError) as refused:
        live.press_up(ADA, press_of(shown(live.uid), **change))

    assert refused.value.status_code == status
    assert pressed == [] and live._presses == {}


async def test_a_press_by_somebody_else_or_of_another_session_is_refused() -> None:
    sessions.forget_sessions()
    first, _ = await hosted("session-ru2-a")
    second, pressed = await hosted("session-ru2-b")
    first._open_stream()
    await opened(first).send("Done.", show=button(opened(first), "again"))
    press = press_of(shown(first.uid))

    with pytest.raises(UiActionError) as other_session:
        second.press_up(ADA, press)
    with pytest.raises(UiActionError) as somebody_else:
        first.press_up(Caller(kind="person", uid="bob"), press)

    assert other_session.value.status_code == 403
    assert somebody_else.value.status_code == 403
    assert pressed == []


async def test_a_run_carrying_a_displays_press_itself_is_refused() -> None:
    sessions.forget_sessions()
    live, pressed = await hosted("session-ru2-d")
    live._open_stream()
    await opened(live).send("Done.", show=button(opened(live), "again"))
    display = shown(live.uid)
    for loop in (
        {
            "action": {
                "name": "again",
                "display_id": display["id"],
                "token": display["actions"][0]["token"],
            }
        },
        {"press": "never-checked"},
        {"press": 3},
    ):
        with pytest.raises(sessions.SessionRefused) as refused:
            live.run_agui({"runId": "r1", "messages": []}, loop=loop, bearer="")
        assert refused.value.status == 422
    assert pressed == []


async def test_a_button_for_an_action_the_code_has_not_is_refused_as_it_is_sent() -> (
    None
):
    live, _ = await hosted("session-ru2-c")
    live._open_stream()

    with pytest.raises(ValueError, match="no @app.action"):
        await opened(live).send("Done.", show=button(opened(live), "missing"))
