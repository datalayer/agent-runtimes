# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A Datalayer runtime calls its models through ai-inference, with its user's token.

The platform starts a runtime with ``AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE``
set to ``datalayer``, so every agent routes through ai-inference whatever its
agentspec says, and gives it, as it is assigned, its user's token narrowed to
ai-inference (``PUT /configure/inference/token``). Until then the runtime says
so in a sentence and calls no model.
"""

from __future__ import annotations

import asyncio
import base64
import json
import time
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel

from agent_runtimes.models import offered
from agent_runtimes.models.models import (
    effective_inference_provider,
    resolve_model_for_inference_provider,
)
from agent_runtimes.models.offered import (
    NO_TOKEN_NOTE,
    InferenceModels,
    InferenceTokenMissing,
    give_inference_token,
    set_inference_models,
)
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes import configure as configure_route
from agent_runtimes.subagents.capability import _routed
from agent_runtimes.transports.vercel_ai import _resolve_effective_inference_provider

SONNET = "bedrock:us.anthropic.claude-sonnet-4-6"
QWEN = "alibaba:qwen-max"
URL = "https://r1.example"

#: ai-inference's ``/models``: Sonnet on Bedrock and Qwen on Model Studio.
SERVED: dict[str, Any] = {
    "models": ["bedrock/us.anthropic.claude-sonnet-4-6", "alibaba/qwen-max"],
    "bedrock_anthropic_models": ["bedrock/us.anthropic.claude-sonnet-4-6"],
    "alibaba_models": ["alibaba/qwen-max"],
}

ANSWER: dict[str, Any] = {
    "id": "c",
    "object": "chat.completion",
    "created": 0,
    "model": SONNET,
    "choices": [
        {
            "index": 0,
            "finish_reason": "stop",
            "message": {"role": "assistant", "content": "ok"},
        }
    ],
}


def _jwt(exp: float) -> str:
    """A token shaped as IAM mints it; only its expiry is read here."""

    def part(value: dict[str, Any]) -> str:
        raw = json.dumps(value).encode()
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()

    claims = {"sub": "01USER", "aud": "datalayer:ai-inference", "exp": int(exp)}
    return f"{part({'alg': 'HS256'})}.{part(claims)}.signature"


@pytest.fixture
def datalayer_runtime(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    """A runtime the platform started, ai-inference answering; the requests it got."""
    monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "datalayer")
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", URL)
    monkeypatch.setitem(configure_route._inference_provider_override, "provider", None)
    set_inference_models(None)
    seen: list[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json=SERVED)
        return httpx.Response(200, json=ANSWER)

    class Answered(httpx.AsyncClient):
        """A client ai-inference answers: still an ``httpx.AsyncClient``."""

        def __init__(self, **kwargs: Any) -> None:
            super().__init__(transport=httpx.MockTransport(answer), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", Answered)
    return seen


def _call(model: OpenAIChatModel) -> Any:
    return asyncio.run(
        model.client.chat.completions.create(
            model=SONNET, messages=[{"role": "user", "content": "hi"}]
        )
    )


def _app() -> FastAPI:
    app = FastAPI()
    app.include_router(configure_route.router, prefix="/api/v1")
    return app


class TestTheProvider:
    def test_on_datalayer_every_agent_goes_through_ai_inference(
        self, datalayer_runtime: list[httpx.Request], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # example-simple's agentspec says `local`; the runtime decides.
        monkeypatch.setattr(
            agents_route, "_agentspecs", {"chat": {"inference_provider": "local"}}
        )
        monkeypatch.setattr(agents_route, "is_node_enabled", lambda: False)

        assert effective_inference_provider() == "datalayer"
        assert agents_route._agent_node_inference_provider_override() == "datalayer"
        assert offered.agent_inference_provider("chat") == "datalayer"
        assert _resolve_effective_inference_provider("chat") == (
            "datalayer",
            "runtime-override",
        )

    def test_elsewhere_the_agentspec_decides(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", raising=False)
        monkeypatch.setitem(
            configure_route._inference_provider_override, "provider", None
        )
        monkeypatch.setattr(
            agents_route, "_agentspecs", {"chat": {"inference_provider": "local"}}
        )
        monkeypatch.setattr(agents_route, "is_node_enabled", lambda: False)

        assert agents_route._agent_node_inference_provider_override() is None
        assert offered.agent_inference_provider("chat") == "local"

    def test_a_subagent_named_by_its_id_goes_the_same_way(
        self, datalayer_runtime: list[httpx.Request], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        assert isinstance(_routed(SONNET, None), OpenAIChatModel)
        monkeypatch.delenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE")
        assert _routed(SONNET, None) == SONNET


class TestBeforeTheTokenArrives:
    def test_the_runtime_says_so_and_asks_nothing(
        self, datalayer_runtime: list[httpx.Request]
    ) -> None:
        state = asyncio.run(offered.load_inference_models())

        assert state.note == NO_TOKEN_NOTE
        assert datalayer_runtime == []
        assert offered.models_source("datalayer") == ("ai-inference", NO_TOKEN_NOTE)
        assert offered.availability(SONNET, "datalayer") == (
            False,
            "No ai-inference token",
        )

    def test_a_model_call_is_refused_in_a_sentence_and_never_made(
        self, datalayer_runtime: list[httpx.Request]
    ) -> None:
        model = resolve_model_for_inference_provider(SONNET, "datalayer")

        with pytest.raises(InferenceTokenMissing, match="no ai-inference token yet"):
            _call(model)
        # Through an agent's run, the sentence is what the run fails with.
        with pytest.raises(InferenceTokenMissing, match="no ai-inference token yet"):
            Agent(model).run_sync("hi")
        assert datalayer_runtime == []

    def test_no_key_of_the_runtime_s_own_is_used(
        self, datalayer_runtime: list[httpx.Request], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("OPENAI_API_KEY", "the-runtime-s-own")
        model = resolve_model_for_inference_provider(SONNET, "datalayer")

        with pytest.raises(InferenceTokenMissing):
            _call(model)
        assert datalayer_runtime == []


class TestTheTokenGiven:
    def test_only_the_pod_gives_it(
        self, datalayer_runtime: list[httpx.Request]
    ) -> None:
        response = TestClient(_app()).put(
            "/api/v1/configure/inference/token", json={"token": _jwt(time.time() + 600)}
        )

        assert response.status_code == 403
        assert offered.inference_token() is None

    def test_it_reaches_ai_inference_on_models_and_on_every_call(
        self, datalayer_runtime: list[httpx.Request]
    ) -> None:
        # The agent's model is built at startup, before the runtime has a user.
        model = resolve_model_for_inference_provider(SONNET, "datalayer")
        asyncio.run(offered.load_inference_models())
        token = _jwt(time.time() + 3600)

        response = TestClient(_app(), client=("127.0.0.1", 50000)).put(
            "/api/v1/configure/inference/token", json={"token": token}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["provider"] == "datalayer"
        assert body["models"] == [SONNET, QWEN]
        assert body["source"] == "ai-inference"
        assert body["expiresAt"] == pytest.approx(time.time() + 3600, abs=5)
        models_request = datalayer_runtime[0]
        assert models_request.url.path == "/api/ai-inference/v1/models"
        assert models_request.headers["authorization"] == f"Bearer {token}"
        assert offered.availability(QWEN, "datalayer") == (True, None)

        _call(model)
        chat_request = datalayer_runtime[-1]
        assert chat_request.url.path == "/api/ai-inference/v1/chat/completions"
        assert chat_request.headers["authorization"] == f"Bearer {token}"

    def test_the_runtime_s_own_provider_keys_are_not_asked_for(
        self, datalayer_runtime: list[httpx.Request], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # On Datalayer the keys are ai-inference's: a runtime without AWS keys
        # is not told it misses them.
        for name in (
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_DEFAULT_REGION",
        ):
            monkeypatch.delenv(name, raising=False)
        offered.give_inference_token(_jwt(time.time() + 3600))
        asyncio.run(offered.load_inference_models())

        response = TestClient(_app()).get("/api/v1/configure/models")

        assert response.status_code == 200
        sonnet = next(m for m in response.json()["models"] if m["id"] == SONNET)
        assert sonnet["missing_env_vars"] == []

    def test_an_expired_one_is_said_and_calls_nothing(
        self, datalayer_runtime: list[httpx.Request]
    ) -> None:
        give_inference_token(_jwt(time.time() - 60))
        model = resolve_model_for_inference_provider(SONNET, "datalayer")

        refusal = offered.inference_token_refusal()
        assert refusal is not None and "expired at" in refusal
        assert offered.models_source("datalayer") == ("ai-inference", refusal)
        with pytest.raises(InferenceTokenMissing, match="expired at"):
            _call(model)
        assert datalayer_runtime == []

    def test_the_answer_kept_is_replaced(
        self, datalayer_runtime: list[httpx.Request]
    ) -> None:
        set_inference_models(InferenceModels(served=None, url=URL, note=NO_TOKEN_NOTE))
        give_inference_token(_jwt(time.time() + 600))

        state = asyncio.run(offered.load_inference_models(refresh=True))

        assert state.served == (SONNET, QWEN)
