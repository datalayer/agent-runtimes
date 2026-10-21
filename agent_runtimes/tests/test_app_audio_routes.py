# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
``@app.audio`` and ``@app.interrupted`` reached over the session API (VO-46).

``POST /apps/sessions/{uid}/audio`` takes a turn's sound as its body — WAV,
FLAC, Ogg Opus or WebM, as its ``Content-Type`` says, at most a minute —
hears it, then runs the turn, streamed: its code's ``@app.audio`` with what
was heard, or, without code, the words sent to its agent marked spoken.
``POST /apps/sessions/{uid}/interrupt`` is the person speaking over the
agent: what runs is cancelled, the client reading the turn told
(``voice.interrupted``) before its stream ends, ``@app.interrupted`` run —
and, unlike Stop, the session stays open for what is said next. The hearing
is a stand-in on `voice.cli.Hearing`'s shape; nothing here needs a
microphone or a model.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Iterator, List, cast

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import (
    AppHost,
    Application,
    HeardSpeech,
    Session,
    mounting,
    sessions,
)
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.routes import apps as routes
from agent_runtimes.tests.test_app_audio import SAID, HereHearing, wav
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    answer_of,
    events_of,
    local,
    runtime,
    types_of,
)
from agent_runtimes.voice import VOICE_INTERRUPTED_EVENT
from agent_runtimes.voice import cli as voice_cli

pytest.importorskip("agentspecs.apps")


def listener() -> Application:
    """A Python application that answers what it hears, and is spoken over."""
    application = Application.from_spec(
        {
            "schema": "loop.app/v1",
            "id": "listener",
            "name": "Listener",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
        }
    )

    @application.audio
    async def on_audio(session: Session, heard: HeardSpeech) -> None:
        await session.send(f"You said: {heard.text} ({heard.where})")

    @application.interrupted
    async def on_interrupted(session: Session) -> None:
        session.state["interrupted"] = session.state.get("interrupted", 0) + 1

    return application


@pytest.fixture()
def here(monkeypatch: pytest.MonkeyPatch) -> HereHearing:
    """Heard on this machine, by the stand-in."""
    hearing = HereHearing()
    monkeypatch.setattr(voice_cli, "Hearing", lambda **_: hearing)
    return hearing


@pytest.fixture()
def mounted(
    runtime: Runtime,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[TestClient]:
    async def create(app: Any, payload: Dict[str, Any], api_prefix: str) -> None:
        runtime.make(
            payload["name"], payload["app_spec"], payload.get("app_instance") or {}
        )

    monkeypatch.setattr(mounting, "create_agent", create)
    api = FastAPI()

    def visit_token(request: Request) -> str:
        return "visit-token"

    listener().mount(api, path="/listener", app_uid="app-43", token=visit_token)
    with TestClient(api, client=("127.0.0.1", 50000)) as client:
        yield client


def _open(client: TestClient, session: str) -> None:
    events_of(
        client.post(
            "/listener/api/v1/apps/sessions",
            json={"agent": "listener", "session": session},
        )
    )


def test_a_turn_said_is_heard_and_given_to_app_audio_streamed(
    mounted: TestClient, here: HereHearing
) -> None:
    _open(mounted, "session-a-001")
    sound = wav()
    answered = events_of(
        mounted.post(
            "/listener/api/v1/apps/sessions/session-a-001/audio?language=en-US",
            content=sound,
            headers={"Content-Type": "audio/wav"},
        )
    )
    assert types_of(answered)[:2] == ["CUSTOM:loop.session", "RUN_STARTED"]
    assert types_of(answered)[-1] == "RUN_FINISHED"
    assert answer_of(answered) == f"You said: {SAID} (device)"
    # The WAV's samples were heard, its header read.
    assert here.heard == [sound[44:]]


@pytest.mark.parametrize(
    "kind, body, status, sentence",
    [
        ("text/plain", b"hello", 415, "not text/plain"),
        ("", b"hello", 415, "not unsaid"),
    ],
)
def test_a_body_that_is_not_a_turn_s_sound_is_refused_in_a_sentence(
    mounted: TestClient,
    here: HereHearing,
    kind: str,
    body: bytes,
    status: int,
    sentence: str,
) -> None:
    _open(mounted, "session-a-002")
    refused = mounted.post(
        "/listener/api/v1/apps/sessions/session-a-002/audio",
        content=body,
        headers={"Content-Type": kind} if kind else {},
    )
    assert refused.status_code == status
    assert sentence in refused.json()["detail"]
    assert here.heard == []


def test_more_than_a_turn_of_sound_is_refused(
    mounted: TestClient, here: HereHearing, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(routes, "AUDIO_TURN_BYTES", 1000)
    _open(mounted, "session-a-003")
    refused = mounted.post(
        "/listener/api/v1/apps/sessions/session-a-003/audio",
        content=wav(),
        headers={"Content-Type": "audio/wav"},
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        413,
        "A turn is at most a minute of sound: say it in shorter turns.",
    )
    assert here.heard == []


def test_what_cannot_be_heard_is_said_on_the_stream(
    mounted: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(voice_cli, "Hearing", lambda **_: HereHearing(text=""))
    _open(mounted, "session-a-004")
    answered = events_of(
        mounted.post(
            "/listener/api/v1/apps/sessions/session-a-004/audio",
            content=wav(),
            headers={"Content-Type": "audio/wav"},
        )
    )
    [error] = [e for e in answered if e["type"] == "RUN_ERROR"]
    assert error["message"] == "Nothing was heard: say it again, or type."
    # The session goes on: the next turn is heard.
    monkeypatch.setattr(voice_cli, "Hearing", lambda **_: HereHearing())
    again = events_of(
        mounted.post(
            "/listener/api/v1/apps/sessions/session-a-004/audio",
            content=wav(),
            headers={"Content-Type": "audio/wav"},
        )
    )
    assert answer_of(again) == f"You said: {SAID} (device)"


def test_an_application_without_code_sends_the_words_to_its_agent_marked_spoken(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: TestClient,  # noqa: F811 - the fixture
    here: HereHearing,
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    events_of(
        local.post(
            "/api/v1/apps/sessions",
            json={"agent": "notes-assistant", "session": "session-a-005"},
        )
    )
    answered = events_of(
        local.post(
            "/api/v1/apps/sessions/session-a-005/audio?language=en-US",
            content=wav(),
            headers={"Content-Type": "audio/wav"},
        )
    )
    assert "RUN_FINISHED" in types_of(answered)
    # Its agent was asked the words heard.
    thread = local.get("/api/v1/apps/sessions/session-a-005/messages").json()
    asked = [m for m in thread["messages"] if m["role"] == "user"]
    # The words heard, with its settings in words as a typed message has them.
    assert asked[-1]["content"].startswith(SAID)
    # And the record keeps the turn as said, never the sound (VO-29).
    spoken = [
        r
        for r in runtime.records
        if "voice" in json.dumps(r) and "spoken" in json.dumps(r)
    ]
    assert spoken, runtime.records
    assert "RIFF" not in json.dumps(runtime.records)


def test_a_message_said_on_the_page_reaches_app_audio_as_heard_there(
    mounted: TestClient,
) -> None:
    """The page hears what is said — in the browser or by the speech
    service — and sends the words marked spoken: an application whose code
    has ``@app.audio`` is given them as what was heard, the sound staying
    where it was heard (VO-46). A typed message is not.
    """
    run = {
        "threadId": "session-a-008",
        "runId": "run-1",
        "state": None,
        "messages": [{"id": "m1", "role": "user", "content": SAID}],
        "tools": [],
        "context": [],
        "forwardedProps": {
            "voice": {
                "input": "voice",
                "language": "en-US",
                "engine": "moonshine-tiny-en",
                "where": "device",
            }
        },
    }
    answered = events_of(
        mounted.post("/listener/api/v1/apps/agents/listener/ag-ui/", json=run)
    )
    assert answer_of(answered) == f"You said: {SAID} (device)"


def test_interrupt_keeps_the_session_open_and_reaches_app_interrupted(
    mounted: TestClient,
) -> None:
    _open(mounted, "session-a-006")
    told = mounted.post("/listener/api/v1/apps/sessions/session-a-006/interrupt")
    assert told.status_code == 200
    assert told.json()["state"] == "open"
    live = sessions._SESSIONS["session-a-006"]
    assert live.session is not None
    assert live.session.state["interrupted"] == 1
    # Stopped is another thing: it waits to be resumed, and is not spoken over.
    mounted.post("/listener/api/v1/apps/sessions/session-a-006/stop")
    refused = mounted.post("/listener/api/v1/apps/sessions/session-a-006/interrupt")
    assert (refused.status_code, refused.json()["detail"]) == (
        409,
        "Session session-a-006 is paused: resume it before going on.",
    )


async def _nothing(_body: Any = None) -> None:
    return None


@pytest.mark.asyncio
async def test_spoken_over_the_turn_s_reader_is_told_then_its_stream_ends() -> None:
    application = listener()
    started = asyncio.Event()

    @application.message
    async def on_message(session: Session, text: str) -> None:
        started.set()
        await asyncio.sleep(30)
        await session.send("never said")

    app = application.spec
    live = sessions.LiveSession(
        uid="session-a-007",
        agent_id="listener",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=_nothing),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    sessions._SESSIONS[live.uid] = live
    try:
        stream = live.message("Tell me a long story")
        read: List[str] = []

        async def reader() -> None:
            async for chunk in stream:
                read.append(chunk)

        reading = asyncio.ensure_future(reader())
        await asyncio.wait_for(started.wait(), 5)
        await live.interrupt()
        await asyncio.wait_for(reading, 5)
        events = [
            json.loads(line[len("data:") :])
            for chunk in read
            for line in chunk.splitlines()
            if line.startswith("data:")
        ]
        names = [e.get("name") for e in events if e["type"] == "CUSTOM"]
        assert VOICE_INTERRUPTED_EVENT in names
        assert "never said" not in json.dumps(events)
        assert live.state == "open"
        assert live.session is not None and live.session.state["interrupted"] == 1
    finally:
        sessions._SESSIONS.pop(live.uid, None)


@pytest.mark.asyncio
async def test_at_the_terminal_voice_gives_the_sound_to_app_audio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``loop`` running an application whose code hears (VO-46, VO-15):
    ``/voice`` twice, and the turn's sound goes to ``@app.audio``, heard
    where ``loop --voice`` hears — not to the prompt line.
    """
    from rich.console import Console

    from agent_runtimes.loop.apps.terminal import AppTux
    from agent_runtimes.tests.test_loop_voice import Stream

    monkeypatch.setattr(
        voice_cli, "microphone_problem", lambda query_devices=None: None
    )
    application = listener()
    tux = AppTux(
        application,
        agent_url="http://runtime/api/v1/ag-ui/default/",
        server_url="http://runtime",
        agent_id="default",
    )
    tux.console = tux.channel.console = Console(record=True, width=400)
    hearing = HereHearing()
    tux._voice_session = voice_cli.VoiceSession(
        hearing=cast(Any, hearing),
        listener=voice_cli.Listener(open_stream=Stream),
    )
    tux.app_session = await tux.host.open()
    assert tux.hears_audio()
    assert await tux.run_line("/voice") is True
    assert await tux.run_line("/voice") is True
    said = tux.console.export_text()
    assert f"You said: {SAID} (device)" in said
    # Its sound was heard, a second of it; nothing waits on the prompt line.
    assert len(hearing.heard) == 1 and len(hearing.heard[0]) == voice_cli.RATE * 2
    assert tux._voice_session.take_prefill() is None
