# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Voice over A2A (VO-28, VO-36).

An audio file part is heard through the speech service with the caller's
token before the task is made, and marked spoken; the agent card says it
is asked in audio; the voice of an agent whose answers may be heard, and
the lines it says aloud, are in its status messages' metadata.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest

from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.tests.test_a2a_harness_worker import _run, _statuses, _text
from agent_runtimes.transports.a2a import voice_say_message, voice_settings_message
from agent_runtimes.voice.protocol_audio import (
    A2A_INVALID_PARAMS,
    HEARD_TYPES,
    TRANSCRIPTIONS_PATH,
    AudioNotHeard,
    HearA2AAudio,
    hear_a2a_message,
)


@pytest.fixture
def state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SqliteProtocolStateStore:
    store = SqliteProtocolStateStore(tmp_path / "state.sqlite")
    monkeypatch.setattr(state_store, "_store", store)
    return store


SOUND = b"RIFF\x24\x00\x00\x00WAVEfmt the sound itself"
SAID = "What is the weather like in Paris today?"
VOICE = {
    "enabled": True,
    "output": "always",
    "voice": "kokoro-af-heart",
    "language": "en-US",
}


def audio_part(kind: str = "audio/wav", uri: bool = False) -> dict[str, Any]:
    file: dict[str, Any] = {"mimeType": kind}
    if uri:
        file["uri"] = "https://example.org/sound.wav"
    else:
        file["bytes"] = base64.b64encode(SOUND).decode()
    return {"kind": "file", "file": file}


def message(*parts: dict[str, Any], **fields: Any) -> dict[str, Any]:
    return {
        "role": "user",
        "kind": "message",
        "message_id": "m1",
        "context_id": "ctx-1",
        "parts": list(parts),
        **fields,
    }


def service(asked: list[httpx.Request], status: int = 200, said: Any = None):
    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(request)
        if status != 200:
            return httpx.Response(status, json={"detail": said})
        return httpx.Response(200, json={"text": f" {SAID} ", "language": "en"})

    return httpx.AsyncClient(transport=httpx.MockTransport(answer))


@pytest.mark.asyncio
async def test_an_audio_file_part_is_heard_with_the_caller_s_token_and_marked_spoken():
    asked: list[httpx.Request] = []
    pdf = {"kind": "file", "file": {"bytes": "JVBERg==", "mimeType": "application/pdf"}}
    sent = message(
        {"kind": "text", "text": "Listen:"}, audio_part(), pdf, metadata={"a": 1}
    )
    heard, spoken = await hear_a2a_message(
        sent,
        token="person-token",
        ai_agents_url="https://r1.example/",
        client=service(asked),
    )
    (request,) = asked
    assert str(request.url) == f"https://r1.example{TRANSCRIPTIONS_PATH}"
    assert request.headers["authorization"] == "Bearer person-token"
    assert request.headers["content-type"] == "audio/wav"
    assert request.content == SOUND
    assert heard["parts"] == [
        {"kind": "text", "text": "Listen:"},
        {"kind": "text", "text": SAID},
        pdf,
    ]
    assert heard["metadata"] == {
        "a": 1,
        "voice": {
            "input": "voice",
            "language": "en",
            "engine": "datalayer-speech",
            "where": "server",
        },
    }
    assert spoken is not None and spoken.where == "server"
    # The caller's message is not changed; no sound is kept in the heard one.
    assert sent["parts"][1]["kind"] == "file"
    assert "bytes" not in json.dumps(heard["parts"][:2])


@pytest.mark.asyncio
async def test_a_message_without_audio_is_left_as_it_is():
    sent = message({"kind": "text", "text": "Hello"})
    assert await hear_a2a_message(sent, token="t", ai_agents_url="x") == (sent, None)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "part, token, status, sentence",
    [
        (audio_part(uri=True), "t", 200, "fetches no address"),
        (audio_part(kind="audio/mpeg"), "t", 200, "not audio/mpeg"),
        (audio_part(), "", 200, "need the caller's token"),
        (
            {"kind": "file", "file": {"bytes": "%%%", "mimeType": "audio/wav"}},
            "t",
            200,
            "not base64",
        ),
        (audio_part(), "t", 429, "You have heard all the seconds of this hour."),
    ],
)
async def test_audio_that_cannot_be_heard_is_refused_in_a_sentence(
    part, token, status, sentence
):
    asked: list[httpx.Request] = []
    with pytest.raises(AudioNotHeard, match=sentence.replace(".", r"\.")):
        await hear_a2a_message(
            message(part),
            token=token,
            ai_agents_url="https://r1.example",
            client=service(asked, status=status, said=sentence),
        )


class Downstream:
    """The A2A app behind the middleware: what it was given."""

    def __init__(self) -> None:
        self.bodies: list[bytes] = []

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        event = await receive()
        self.bodies.append(event.get("body", b""))
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": b'{"ok": true}'})


def rpc(method: str, msg: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": 7, "method": method, "params": {"message": msg}}


@pytest.mark.asyncio
async def test_the_middleware_hears_a_message_before_the_task_is_made():
    asked: list[httpx.Request] = []
    downstream = Downstream()
    app = HearA2AAudio(
        downstream, ai_agents_url="https://r1.example", client=service(asked)
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://a2a"
    ) as http:
        answered = await http.post(
            "/",
            json=rpc("message/send", message(audio_part())),
            headers={"Authorization": "Bearer person-token"},
        )
        assert answered.json() == {"ok": True}
        given = json.loads(downstream.bodies[-1])
        assert given["params"]["message"]["parts"] == [{"kind": "text", "text": SAID}]
        assert given["params"]["message"]["metadata"]["voice"]["input"] == "voice"
        assert asked[-1].headers["authorization"] == "Bearer person-token"
        # A stream is heard the same way; a text message and a read pass as sent.
        await http.post(
            "/",
            json=rpc("message/stream", message(audio_part())),
            headers={"Authorization": "Bearer person-token"},
        )
        assert (
            json.loads(downstream.bodies[-1])["params"]["message"]["parts"][0]["text"]
            == SAID
        )
        plain = rpc("message/send", message({"kind": "text", "text": "Hi"}))
        await http.post("/", json=plain)
        assert json.loads(downstream.bodies[-1]) == plain
        get_task = {
            "jsonrpc": "2.0",
            "id": 8,
            "method": "tasks/get",
            "params": {"id": "t"},
        }
        await http.post("/", json=get_task)
        assert json.loads(downstream.bodies[-1]) == get_task
    assert len(asked) == 2


@pytest.mark.asyncio
async def test_the_middleware_refuses_what_it_cannot_hear_as_a_json_rpc_error():
    downstream = Downstream()
    app = HearA2AAudio(
        downstream, ai_agents_url="https://r1.example", client=service([])
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://a2a"
    ) as http:
        answered = await http.post(
            "/",
            json=rpc("message/send", message(audio_part(uri=True))),
            headers={"Authorization": "Bearer t"},
        )
        refused = answered.json()
        assert refused["id"] == 7
        assert refused["error"]["code"] == A2A_INVALID_PARAMS
        assert "fetches no address" in refused["error"]["message"]
        # No token: refused before the service is asked.
        answered = await http.post("/", json=rpc("message/send", message(audio_part())))
        assert "need the caller's token" in answered.json()["error"]["message"]
    assert downstream.bodies == []


@pytest.mark.asyncio
async def test_the_agent_card_says_it_is_asked_in_audio(monkeypatch):
    from fasta2a.broker import InMemoryBroker
    from fasta2a.storage import InMemoryStorage

    monkeypatch.setattr(a2a_routes, "_app", None)
    card = a2a_routes.A2AAgentCard(
        id="voice-card",
        name="Voice",
        description="Answers that may be heard",
        url="http://worker.test/api/v1/a2a/agents/voice-card",
    )
    a2a_routes.register_a2a_agent(
        SimpleNamespace(name="Voice"),
        card,
        broker=InMemoryBroker(),
        storage=InMemoryStorage(),
    )
    try:
        served = a2a_routes._a2a_agents["voice-card"].app
        async with (
            served.router.lifespan_context(served),
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=served), base_url="http://w"
            ) as http,
        ):
            published = None
            for path in ("/.well-known/agent-card.json", "/.well-known/agent.json"):
                answer = await http.get(path)
                if answer.status_code == 200:
                    published = answer.json()
                    break
        assert published is not None
        modes = published["defaultInputModes"]
        assert modes[0] == "application/json"
        assert set(HEARD_TYPES) <= set(modes)
    finally:
        a2a_routes.unregister_a2a_agent("voice-card")


def test_the_voice_and_a_line_said_are_the_messages_metadata():
    settings = voice_settings_message("ctx", VOICE)
    assert settings["metadata"] == {"voice": {"settings": VOICE}}
    assert settings["role"] == "agent" and settings["context_id"] == "ctx"
    said = voice_say_message("ctx", "One   moment, I am looking.", VOICE)
    assert said["metadata"] == {
        "voice": {
            "say": {
                "text": "One moment, I am looking.",
                "voice": "kokoro-af-heart",
                "language": "en-US",
            }
        }
    }
    assert said["parts"][0]["text"] == "One moment, I am looking."
    with pytest.raises(ValueError, match="at most 200"):
        voice_say_message("ctx", "x" * 201, VOICE)


class SpeakingAgent:
    """An agent whose answers may be heard: it says a line aloud, then answers."""

    name = "Speaking"

    def __init__(self) -> None:
        self.heard: Any = "unset"

    async def stream(self, prompt: str, context: Any):
        from agent_runtimes.voice import heard

        self.heard = heard()
        yield SimpleNamespace(
            type="tool_call",
            data={
                "id": "c1",
                "name": "say_aloud",
                "arguments": {"line": "One moment."},
            },
        )
        yield SimpleNamespace(
            type="tool_result",
            data={"tool_call_id": "c1", "name": "say_aloud", "result": "Said aloud."},
        )
        yield SimpleNamespace(type="text", data="It is sunny.")
        yield SimpleNamespace(type="output", data="It is sunny.")

    async def cleanup(self) -> None:
        return None


@pytest.mark.asyncio
async def test_a_task_says_its_voice_and_its_line_and_its_spoken_message_is_marked(
    state, monkeypatch
):
    import agent_runtimes.voice as voice

    monkeypatch.setattr(voice, "voice_of_agent", lambda agent: dict(VOICE))
    agent = SpeakingAgent()
    spoken = {
        "role": "user",
        "parts": [{"text": SAID}],
        "message_id": "m-spoken",
        "context_id": "ctx-1",
        "metadata": {
            "voice": {
                "input": "voice",
                "language": "en",
                "engine": "datalayer-speech",
                "where": "server",
            }
        },
    }
    _, events, _ = await _run(state, agent, spoken)
    assert agent.heard is not None and agent.heard.where == "server"
    voiced = [
        status["message"]["metadata"]["voice"]
        for status in _statuses(events)
        if (status.get("message") or {}).get("metadata", {}).get("voice")
    ]
    assert voiced == [
        {"settings": VOICE},
        {
            "say": {
                "text": "One moment.",
                "voice": "kokoro-af-heart",
                "language": "en-US",
            }
        },
    ]
    assert _text(_statuses(events)[-1]["message"]) == "It is sunny."


@pytest.mark.asyncio
async def test_a_card_that_names_what_it_is_asked_in_keeps_it_and_hears_no_audio(
    monkeypatch,
):
    """An application's card says text: it is not given audio to hear."""
    from fasta2a.broker import InMemoryBroker
    from fasta2a.storage import InMemoryStorage

    monkeypatch.setattr(a2a_routes, "_app", None)
    card = a2a_routes.A2AAgentCard(
        id="text-card",
        name="Text",
        description="Asked in text",
        url="http://worker.test/api/v1/a2a/agents/text-card",
        default_input_modes=["text/plain"],
    )
    a2a_routes.register_a2a_agent(
        SimpleNamespace(name="Text"),
        card,
        broker=InMemoryBroker(),
        storage=InMemoryStorage(),
    )
    try:
        assert a2a_routes._a2a_agents["text-card"].card.default_input_modes == [
            "text/plain"
        ]
    finally:
        a2a_routes.unregister_a2a_agent("text-card")


@pytest.mark.asyncio
async def test_a_real_agent_s_task_says_its_voice_and_its_line(state):
    """The worker holds the runtime's adapter, not the pydantic agent: its voice is still found (VO-36)."""
    from pydantic_ai import Agent
    from pydantic_ai.models.test import TestModel

    from agent_runtimes.adapters.pydantic_ai_adapter import PydanticAIAdapter
    from agent_runtimes.voice import VoiceCapability

    agent = Agent(
        TestModel(call_tools=["say_aloud"], custom_output_text="It is sunny."),
        capabilities=[VoiceCapability(language="en-US", settings=dict(VOICE))],
    )
    adapter = PydanticAIAdapter(agent, name="speaking")
    asked = {
        "role": "user",
        "parts": [{"text": "Weather?"}],
        "message_id": "m-real",
        "context_id": "ctx-1",
    }
    _, events, _ = await _run(state, adapter, asked)
    voiced = [
        status["message"]["metadata"]["voice"]
        for status in _statuses(events)
        if (status.get("message") or {}).get("metadata", {}).get("voice")
    ]
    assert voiced[0] == {"settings": VOICE}
    [said] = [v["say"] for v in voiced[1:]]
    assert said["voice"] == "kokoro-af-heart" and said["language"] == "en-US"
    assert said["text"]
    assert _text(_statuses(events)[-1]["message"]) == "It is sunny."
