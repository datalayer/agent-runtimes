# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Audio from a protocol client, heard through the speech service (VOICE.md VO-28)."""

import base64
import json
from typing import Any

import httpx
import pytest

from agent_runtimes.transports.agui import hear_client_audio
from agent_runtimes.voice import heard
from agent_runtimes.voice.protocol_audio import (
    TRANSCRIPTIONS_PATH,
    AudioNotHeard,
    hear_agui_messages,
)

SOUND = b"RIFF\x24\x00\x00\x00WAVEfmt the sound itself"
SAID = "What is the weather like in Paris today?"


def run(content: Any, forwarded: Any = None) -> dict[str, Any]:
    return {
        "threadId": "t1",
        "runId": "r1",
        "messages": [
            {"id": "u0", "role": "user", "content": "Hello"},
            {"id": "a0", "role": "assistant", "content": "Hi."},
            {"id": "u1", "role": "user", "content": content},
        ],
        "forwardedProps": forwarded,
    }


def audio(kind: str = "audio/wav", source: str = "data") -> dict[str, Any]:
    return {
        "type": "audio",
        "source": {
            "type": source,
            "value": base64.b64encode(SOUND).decode()
            if source == "data"
            else "https://example.org/sound.wav",
            "mime_type": kind,
        },
    }


def service(asked: list[httpx.Request], status: int = 200, said: Any = None):
    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(request)
        if status != 200:
            return httpx.Response(status, json={"detail": said})
        return httpx.Response(
            200, json={"text": f" {SAID} ", "language": "en", "segments": []}
        )

    return httpx.AsyncClient(transport=httpx.MockTransport(answer))


@pytest.mark.asyncio
async def test_a_user_message_s_audio_is_heard_and_becomes_its_transcript_marked_spoken():
    asked: list[httpx.Request] = []
    body = run([{"type": "text", "text": "Listen:"}, audio()], {"loop": {"a": 1}})
    heard_body, spoken = await hear_agui_messages(
        body,
        token="person-token",
        ai_agents_url="https://r1.example/",
        client=service(asked),
    )
    (request,) = asked
    assert str(request.url) == f"https://r1.example{TRANSCRIPTIONS_PATH}"
    assert request.headers["authorization"] == "Bearer person-token"
    assert request.headers["content-type"] == "audio/wav"
    assert request.content == SOUND
    assert heard_body["messages"][-1]["content"] == [
        {"type": "text", "text": "Listen:"},
        {"type": "text", "text": SAID},
    ]
    assert heard_body["forwardedProps"] == {
        "loop": {"a": 1},
        "voice": {
            "input": "voice",
            "language": "en",
            "engine": "datalayer-speech",
            "where": "server",
        },
    }
    assert spoken is not None and spoken.where == "server"
    # The client's body is not changed; no sound is kept in the heard one.
    assert body["messages"][-1]["content"][1]["type"] == "audio"
    assert "audio" not in json.dumps(heard_body["messages"])


@pytest.mark.asyncio
async def test_a_run_without_audio_is_left_as_it_is():
    body = run("Hello again")
    assert await hear_agui_messages(body, token="t", ai_agents_url="x") == (body, None)
    assert await hear_client_audio(body, "Bearer t") is None
    # Only the newest user message is heard: the earlier ones were, when sent.
    older = run("Hello")
    older["messages"][0]["content"] = [audio()]
    assert await hear_agui_messages(older, token="t", ai_agents_url="x") == (
        older,
        None,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "part, token, sentence",
    [
        (audio(source="url"), "t", "fetches no address"),
        (audio(kind="audio/mp4"), "t", "not audio/mp4"),
        (audio(), "", "need the caller's token"),
        (
            {
                "type": "audio",
                "source": {"type": "data", "value": "%%%", "mime_type": "audio/wav"},
            },
            "t",
            "not base64",
        ),
    ],
)
async def test_audio_that_cannot_be_heard_is_refused_in_a_sentence(
    part, token, sentence
):
    asked: list[httpx.Request] = []
    with pytest.raises(AudioNotHeard, match=sentence):
        await hear_agui_messages(
            run([part]),
            token=token,
            ai_agents_url="https://r1.example",
            client=service(asked),
        )
    assert asked == []


@pytest.mark.asyncio
async def test_the_speech_service_s_refusal_is_its_sentence():
    asked: list[httpx.Request] = []
    with pytest.raises(AudioNotHeard, match="all the listening offered"):
        await hear_agui_messages(
            run([audio()]),
            token="t",
            ai_agents_url="https://r1.example",
            client=service(
                asked,
                429,
                "You have used all the listening offered on Datalayer's servers for now.",
            ),
        )


@pytest.mark.asyncio
async def test_the_transport_refuses_unheard_audio_before_the_run(monkeypatch):
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://r1.example")
    refused = await hear_client_audio(run([audio(source="url")]), "Bearer t")
    assert refused is not None and not isinstance(refused, tuple)
    assert refused.status_code == 422
    assert "fetches no address" in json.loads(refused.body)["detail"]


@pytest.mark.asyncio
async def test_the_transport_marks_the_turn_spoken_for_the_record(monkeypatch):
    import agent_runtimes.voice.protocol_audio as protocol_audio

    async def heard_by_service(sound, kind, **_: Any):
        return protocol_audio.HeardAudio(text=SAID, language="en")

    monkeypatch.setattr(protocol_audio, "hear_audio", heard_by_service)
    result = await hear_client_audio(run([audio()]), "Bearer t")
    assert isinstance(result, tuple)
    heard_body, raw = result
    assert json.loads(raw) == heard_body
    assert heard_body["messages"][-1]["content"] == [{"type": "text", "text": SAID}]
    assert heard() is not None and heard().where == "server"
