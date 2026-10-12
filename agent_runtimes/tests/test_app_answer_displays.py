# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an answer shows is a display; its buttons press only what it offered (REACTOR_UI RU-2).

An answer's components reach the page as an ``AnswerShows`` display — an
``ACTIVITY_SNAPSHOT`` of ``reactor.ui``, never a fake tool call — and each
button it has offers its action with a token this session minted for that
display. A press is checked before anything runs: a token minted for another
display, another action or another session is a 403, a press of an action the
code has none of a 422, and a button naming no ``@app.action`` is refused when
the answer is sent.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

import pytest

from agent_runtimes.loop.apps import AppHost, Application, sessions
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.components import ANSWER_DISPLAY_TYPE, AnswerShows
from agent_runtimes.loop.apps.record import AppRecorder


async def _ignore(body: Dict[str, Any]) -> None:
    return None


async def hosted(uid: str) -> tuple[sessions.LiveSession, List[Any]]:
    application = Application(id="notes-assistant", agent="example-simple")
    pressed: List[Any] = []

    @application.action("again")
    async def again(session: Any, payload: dict) -> None:
        pressed.append(payload)
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
    live.session = await live.host.open(id=live.uid)
    return live, pressed


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


def button(session: Any, action: str) -> List[Any]:
    return [
        session.ui.button("go", child="go-label", action={"event": {"name": action}}),
        session.ui.text("go-label", text="Again"),
    ]


async def test_a_button_is_offered_with_a_token_for_its_display() -> None:
    live, _ = await hosted("session-ru2-1")
    queue = live._open_stream()
    sent = await live.session.send("Done.", show=button(live.session, "again"))

    (activity,) = [e for e in drained(queue) if e["type"] == "ACTIVITY_SNAPSHOT"]
    display = activity["content"]["display"]
    assert display["type"] == ANSWER_DISPLAY_TYPE
    assert display["data"]["message_id"] == sent.id
    (offer,) = display["actions"]
    assert offer["name"] == "again" and offer["token"]
    # The surface's own id is the display's: no `answer-` prefix to read.
    assert display["data"]["surface"]["surfaceId"] == display["id"]
    # The model reads the words, never the surface.
    shown = AnswerShows.from_wire(display)
    assert "surface" not in shown.model_view()["data"]
    assert shown.model_view()["text"] == "Notes assistant showed Button go, Text Again"


async def test_a_press_with_the_token_runs_the_action_once() -> None:
    live, pressed = await hosted("session-ru2-2")
    queue = live._open_stream()
    await live.session.send("Done.", show=button(live.session, "again"))
    (activity,) = [e for e in drained(queue) if e["type"] == "ACTIVITY_SNAPSHOT"]
    display = activity["content"]["display"]
    press = {
        "name": "again",
        "display_id": display["id"],
        "token": display["actions"][0]["token"],
        "payload": {"row": 2},
    }

    chunks = [
        chunk
        async for chunk in live.run_agui(
            {"runId": "r1", "messages": []}, loop={"action": press}, bearer=""
        )
    ]

    assert pressed == [{"row": 2}]
    assert "Again." in json.dumps(events_of(chunks))


@pytest.mark.parametrize(
    ("change", "status"),
    [
        ({"token": "forged"}, 403),
        ({"display_id": "another-display"}, 403),
        ({"name": "nobody-registered"}, 422),
        ({"token": None}, 422),
    ],
)
async def test_a_press_not_offered_is_refused_before_anything_runs(
    change: Dict[str, Any], status: int
) -> None:
    live, pressed = await hosted(f"session-ru2-{status}-{len(change)}")
    queue = live._open_stream()
    await live.session.send("Done.", show=button(live.session, "again"))
    (activity,) = [e for e in drained(queue) if e["type"] == "ACTIVITY_SNAPSHOT"]
    display = activity["content"]["display"]
    press = {
        "name": "again",
        "display_id": display["id"],
        "token": display["actions"][0]["token"],
        "payload": {},
        **change,
    }

    with pytest.raises(sessions.SessionRefused) as refused:
        live.run_agui(
            {"runId": "r1", "messages": []}, loop={"action": press}, bearer=""
        )

    assert refused.value.status == status
    assert pressed == []


async def test_a_token_of_another_session_is_refused() -> None:
    first, _ = await hosted("session-ru2-a")
    second, pressed = await hosted("session-ru2-b")
    queue = first._open_stream()
    await first.session.send("Done.", show=button(first.session, "again"))
    (activity,) = [e for e in drained(queue) if e["type"] == "ACTIVITY_SNAPSHOT"]
    display = activity["content"]["display"]

    with pytest.raises(sessions.SessionRefused) as refused:
        second.pressed(
            {
                "name": "again",
                "display_id": display["id"],
                "token": display["actions"][0]["token"],
            }
        )

    assert refused.value.status == 403 and pressed == []


async def test_a_button_for_an_action_the_code_has_not_is_refused_as_it_is_sent() -> (
    None
):
    live, _ = await hosted("session-ru2-c")
    live._open_stream()

    with pytest.raises(ValueError, match="no @app.action"):
        await live.session.send("Done.", show=button(live.session, "missing"))
