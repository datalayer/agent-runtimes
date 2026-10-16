# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Audio over ACP (VO-28).

The runtime says ``promptCapabilities.audio: true``; an ``AudioContentBlock``
in a ``session/prompt`` is heard by the speech service with the connection's
token before the turn, and the agent is given its transcript, marked
spoken. What cannot be heard is a JSON-RPC error in a sentence, and no turn
runs. The speech service is a stand-in on its real shape; the sound is the
repository's fixture.
"""

from __future__ import annotations

import base64
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.adapters.base import AgentContext, BaseAgent, StreamEvent
from agent_runtimes.protocol_state import store as state_store
from agent_runtimes.protocol_state.store import SqliteProtocolStateStore
from agent_runtimes.routes.acp import AgentInfo, register_agent, unregister_agent
from agent_runtimes.routes.acp import router as acp_router
from agent_runtimes.tests.test_acp_route_notebook_client import TOKEN
from agent_runtimes.tests.test_acp_route_pause_and_steer import Wire
from agent_runtimes.transports.acp import ACPTransport
from agent_runtimes.voice import protocol_audio

FIXTURE = (
    Path(__file__).resolve().parents[2] / "e2e" / "fixtures" / "weather-in-paris.wav"
)
SAID = "What is the weather like in Paris today?"


class EchoAgent(BaseAgent):
    """Answers with what it was asked, and whether it was said."""

    def __init__(self) -> None:
        self.prompts: list[str] = []
        self.spoken: list[Any] = []

    async def run(self, prompt: str, context: AgentContext) -> Any:  # pragma: no cover
        raise NotImplementedError

    async def stream(
        self, prompt: str, context: AgentContext
    ) -> AsyncIterator[StreamEvent]:
        from agent_runtimes.voice import heard

        self.prompts.append(prompt)
        self.spoken.append(heard())
        yield StreamEvent(type="text", data=f"You asked: {prompt}")
        yield StreamEvent(type="done", data=None)

    def get_tools(self) -> list[Any]:
        return []

    @property
    def name(self) -> str:
        return "Echo"

    @property
    def description(self) -> str:
        return "Echoes"

    @property
    def version(self) -> str:
        return "1.0.0"


@pytest.fixture
def speech(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    """The speech service on its real shape: it hears the fixture as what it says."""
    asked: list[httpx.Request] = []
    real = protocol_audio.hear_audio

    async def hear_audio(sound: bytes, content_type: str, **kwargs: Any) -> Any:
        def answer(request: httpx.Request) -> httpx.Response:
            asked.append(request)
            return httpx.Response(200, json={"text": f" {SAID} ", "language": "en"})

        kwargs["client"] = httpx.AsyncClient(transport=httpx.MockTransport(answer))
        kwargs["ai_agents_url"] = "https://r1.example"
        return await real(sound, content_type, **kwargs)

    monkeypatch.setattr(protocol_audio, "hear_audio", hear_audio)
    return asked


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    monkeypatch.setattr(
        state_store, "_store", SqliteProtocolStateStore(tmp_path / "state.sqlite")
    )
    app = FastAPI()
    app.include_router(acp_router, prefix="/api/v1")
    with TestClient(app) as test_client:
        yield test_client


def audio_block(kind: str = "audio/wav") -> dict[str, Any]:
    return {
        "type": "audio",
        "data": base64.b64encode(FIXTURE.read_bytes()).decode(),
        "mimeType": kind,
    }


def test_the_route_says_audio_and_hears_the_fixture_with_the_connection_s_token(
    client: TestClient, speech: list[httpx.Request]
) -> None:
    agent = EchoAgent()
    register_agent(agent, AgentInfo(id="echo-voice", name="Echo"))
    try:
        with client.websocket_connect("/api/v1/acp/ws/echo-voice") as websocket:
            wire = Wire(websocket)
            _, initialized = wire.request("initialize", {"protocolVersion": 1})
            capabilities = initialized["result"]["agentCapabilities"]
            assert capabilities["promptCapabilities"]["audio"] is True
            wire.request(
                "authenticate", {"methodId": "bearer", "_meta": {"token": TOKEN}}
            )
            _, created = wire.request("session/new", {"cwd": "/", "mcpServers": []})
            session_id = created["result"]["sessionId"]
            updates, answer = wire.request(
                "session/prompt",
                {
                    "sessionId": session_id,
                    "prompt": [{"type": "text", "text": "Listen:"}, audio_block()],
                },
            )
            assert answer["result"]["stopReason"] == "end_turn"
            # Another type is refused in a sentence, and no turn runs.
            _, refused = wire.request(
                "session/prompt",
                {"sessionId": session_id, "prompt": [audio_block("audio/mpeg")]},
            )
            wire.request("shutdown", {})
    finally:
        unregister_agent("echo-voice")
    (request,) = speech
    assert request.headers["authorization"] == f"Bearer {TOKEN}"
    assert request.headers["content-type"] == "audio/wav"
    assert request.content == FIXTURE.read_bytes()
    assert agent.prompts == [f"Listen:\n{SAID}"]
    assert agent.spoken[0] is not None and agent.spoken[0].where == "server"
    assert "not audio/mpeg" in refused["error"]["message"]


@pytest.mark.asyncio
async def test_the_sdk_transport_says_audio_and_hears_the_session_s_prompt(
    speech: list[httpx.Request],
) -> None:
    from acp.schema import NewSessionRequest, PromptRequest

    agent = EchoAgent()
    transport = ACPTransport(agent)
    assert transport.capabilities.prompt_capabilities.audio is True
    created = await transport.handle_new_session(
        NewSessionRequest(cwd="/", mcp_servers=[])
    )
    transport._sessions[created.session_id].context = AgentContext(
        session_id=created.session_id, metadata={"user_token": TOKEN}
    )
    said = [
        event
        async for event in transport.handle_prompt(
            PromptRequest(session_id=created.session_id, prompt=[audio_block()])
        )
    ]
    assert agent.prompts == [SAID]
    assert said[-1].stop_reason == "end_turn"
    assert speech[-1].headers["authorization"] == f"Bearer {TOKEN}"
