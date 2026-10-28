# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
``@app.audio`` (P-22, VO-46).

A turn's sound comes in chunks and is heard by the engines a page's and
``loop --voice``'s are — here, else by Datalayer's speech service — then
``@app.audio`` runs with what was heard, or the words are the person's
message, marked spoken. ``session.say(text)`` says a line aloud with the
application's voice, and the person speaking over the agent stops what runs
and reaches ``@app.interrupted``. The hearing is a stand-in on the real
shapes; nothing here needs a microphone or a model.
"""

from __future__ import annotations

import asyncio
import io
import wave
from typing import Any, List

import pytest

from agent_runtimes.apps import (
    AppHost,
    Application,
    HeardSpeech,
    Interrupted,
    MemoryChannel,
    Said,
    sessions,
)
from agent_runtimes.apps.callers import Caller
from agent_runtimes.apps.record import AppRecorder
from agent_runtimes.voice import VOICE_INTERRUPTED_EVENT, VOICE_SAY_EVENT, heard
from agent_runtimes.voice import cli as voice_cli
from agent_runtimes.voice.protocol_audio import AudioNotHeard

pytest.importorskip("agentspecs.apps")

SAID = "What is the weather like in Paris today?"


def wav(seconds: float = 0.5, rate: int = 16_000, channels: int = 1) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as sound:
        sound.setnchannels(channels)
        sound.setsampwidth(2)
        sound.setframerate(rate)
        sound.writeframes(b"\x10\x00" * int(seconds * rate) * channels)
    return buffer.getvalue()


class HereHearing:
    """`voice.cli.Hearing` on this machine: what was said, from 16 kHz PCM."""

    def __init__(self, text: str = SAID) -> None:
        self.text = text
        self.heard: List[bytes] = []

    def problem(self) -> None:
        return None

    def hear(self, pcm16: bytes, language: str = "") -> voice_cli.Heard:
        self.heard.append(pcm16)
        return voice_cli.Heard(
            text=self.text,
            language=language or "en",
            engine="whisper-small",
            where="local",
        )


async def _nothing(_body: Any = None) -> None:
    return None


def talker(voice: bool = True) -> Application:
    application = Application(id="talker", kind="chat", agent="example-simple")
    if voice:
        application.spec.interface.voice = application.spec.interface.voice.model_copy(
            update={"enabled": True, "output": "always", "voice": "kokoro-af-heart"}
        )
    return application


def host(application: Application) -> tuple[AppHost, MemoryChannel]:
    channel = MemoryChannel()
    return (
        AppHost(
            application,
            channel,
            recorder=AppRecorder(app=application.spec, send=_nothing),
        ),
        channel,
    )


@pytest.mark.asyncio
async def test_a_turn_in_chunks_is_heard_here_and_given_to_app_audio():
    application = talker()
    given: List[HeardSpeech] = []

    @application.audio
    async def on_audio(session, speech: HeardSpeech) -> None:
        given.append(speech)
        await session.send(f"You said: {speech.text}")

    hosting, channel = host(application)
    session = await hosting.open()
    sound = wav()
    hearing = HereHearing()
    chunks = [sound[:100], sound[100:3000], sound[3000:]]
    heard_speech = await hosting.audio(session, chunks, hearing=hearing)
    assert heard_speech == HeardSpeech(
        text=SAID, language="en", engine="whisper-small", where="device"
    )
    assert given == [heard_speech]
    # The WAV's samples, joined from its chunks: its header read, not heard.
    assert hearing.heard == [sound[44:]]
    assert channel.messages[-1].text == f"You said: {SAID}"


@pytest.mark.asyncio
async def test_without_app_audio_the_words_are_the_message_marked_spoken():
    application = talker()
    seen: List[Any] = []

    @application.message
    async def on_message(session, text: str) -> None:
        seen.append((text, heard()))

    hosting, _ = host(application)
    session = await hosting.open()

    async def chunks():
        yield wav()

    await hosting.audio(session, chunks(), hearing=HereHearing(), language="en-US")
    ((text, spoken),) = seen
    assert text == SAID
    assert spoken is not None
    assert (spoken.language, spoken.engine, spoken.where) == (
        "en-US",
        "whisper-small",
        "device",
    )


@pytest.mark.asyncio
async def test_another_type_is_heard_by_the_speech_service_with_the_token(monkeypatch):
    from agent_runtimes.voice import protocol_audio

    asked: List[Any] = []

    async def hear_audio(sound: bytes, kind: str, **kwargs: Any):
        asked.append((sound, kind, kwargs["token"]))
        return protocol_audio.HeardAudio(text=SAID, language="en")

    monkeypatch.setattr(protocol_audio, "hear_audio", hear_audio)
    application = talker()
    got: List[HeardSpeech] = []
    application.audio(lambda session, speech: got.append(speech))
    hosting, _ = host(application)
    session = await hosting.open()
    await hosting.audio(
        session, [b"\x1aE\xdf\xa3", b"webm"], content_type="audio/webm", token="t0k"
    )
    assert asked == [(b"\x1aE\xdf\xa3webm", "audio/webm", "t0k")]
    assert got[0].where == "server" and got[0].engine == "datalayer-speech"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "chunks, hearing, sentence",
    [
        ([], HereHearing(), "holds no sound"),
        ([wav(rate=48_000)], HereHearing(), "16-bit mono WAV at 16 kHz"),
        ([wav(channels=2)], HereHearing(), "16-bit mono WAV at 16 kHz"),
        ([wav()], HereHearing(text=""), "Nothing was heard"),
    ],
)
async def test_what_cannot_be_heard_is_refused_in_a_sentence(chunks, hearing, sentence):
    application = talker()
    called: List[Any] = []
    application.audio(lambda session, speech: called.append(speech))
    hosting, _ = host(application)
    session = await hosting.open()
    with pytest.raises(AudioNotHeard, match=sentence):
        await hosting.audio(session, chunks, hearing=hearing)
    assert called == []


@pytest.mark.asyncio
async def test_session_say_says_a_line_with_the_application_s_voice():
    application = talker()
    hosting, channel = host(application)
    session = await hosting.open()
    said = await session.say("One   moment, I am looking that up.")
    assert said == Said(
        session.uid,
        "One moment, I am looking that up.",
        voice="kokoro-af-heart",
        language="en-US",
    )
    assert said in channel.events
    with pytest.raises(ValueError, match="at most 200"):
        await session.say("x" * 201)
    silent = talker(voice=False)
    hosting, _ = host(silent)
    quiet = await hosting.open()
    with pytest.raises(ValueError, match="has no voice"):
        await quiet.say("Hello.")


@pytest.mark.asyncio
async def test_speaking_over_the_agent_stops_what_runs_and_reaches_app_interrupted():
    application = talker()
    reached: List[str] = []
    started = asyncio.Event()

    @application.message
    async def on_message(session, text: str) -> None:
        started.set()
        await asyncio.sleep(30)
        reached.append("finished")

    @application.interrupted
    async def on_interrupted(session) -> None:
        reached.append("interrupted")

    hosting, channel = host(application)
    session = await hosting.open()
    running = asyncio.ensure_future(hosting.message(session, "Tell me a long story"))
    await started.wait()
    await hosting.interrupt(session)
    await asyncio.wait_for(running, 5)
    assert reached == ["interrupted"]
    assert Interrupted(session.uid) in channel.events


@pytest.mark.asyncio
async def test_a_page_hears_the_line_said_and_the_interruption_as_voice_events():
    application = talker()
    app = application.spec
    live = sessions.LiveSession(
        uid="session-voice",
        agent_id="talker",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=_nothing),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    live.session = await live.host.open(uid=live.uid)
    queue = live._open_stream()
    await live.session.say("One moment.")
    await live.host.interrupt(live.session)
    import json

    events = []
    while not queue.empty():
        chunk = queue.get_nowait()
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    custom = [(e["name"], e["value"]) for e in events if e["type"] == "CUSTOM"]
    assert custom == [
        (
            VOICE_SAY_EVENT,
            {"text": "One moment.", "voice": "kokoro-af-heart", "language": "en-US"},
        ),
        (VOICE_INTERRUPTED_EVENT, {}),
    ]


def test_audio_and_interrupted_are_contribution_points_of_the_platform():
    from agent_runtimes.apps.plugins import REACTION_POINTS

    assert {"audio", "interrupted"} <= set(REACTION_POINTS)
    assert REACTION_POINTS["audio"].id == "loop.app.audio"
