# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An agent's models: its ``model`` and ``model_additionals``.

Judged on what datalayer-ai-inference says it serves.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import Any

import httpx
import pytest

from agent_runtimes.models import offered
from agent_runtimes.models.offered import InferenceModels, set_inference_models

SONNET = "bedrock:us.anthropic.claude-sonnet-4-6"
QWEN = "alibaba:qwen-max"
OPUS = "bedrock:us.anthropic.claude-opus-5"
JEV = "cloudflare:wrk/typesafe/jev"

#: ai-inference's ``GET /api/ai-inference/v1/models`` on r1, 2026-10-04.
LIVE_PAYLOAD: dict[str, Any] = {
    "models": ["bedrock/us.anthropic.claude-sonnet-4-6"],
    "default_model": "bedrock/us.anthropic.claude-sonnet-4-6",
    "default_provider": "bedrock",
    "providers": ["bedrock", "azure", "cloudflare"],
    "bedrock_anthropic_models": ["bedrock/us.anthropic.claude-sonnet-4-6"],
    "cloudflare_models": [],
}


def _serve(monkeypatch: pytest.MonkeyPatch, handler: Any) -> list[httpx.Request]:
    """Serve ai-inference with ``handler``; return the requests it got."""
    seen: list[httpx.Request] = []
    real = httpx.AsyncClient

    def record(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(record), **kwargs),
    )
    return seen


def _load(
    monkeypatch: pytest.MonkeyPatch, url: str | None = "https://r1.example"
) -> InferenceModels:
    if url is None:
        monkeypatch.delenv("DATALAYER_AI_INFERENCE_URL", raising=False)
    else:
        monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", url)
    set_inference_models(None)
    return asyncio.run(offered.load_inference_models())


class TestWhatAiInferenceServes:
    def test_its_names_read_as_the_catalogue_names_them(self) -> None:
        assert offered.catalogue_id("bedrock/us.anthropic.claude-sonnet-4-6") == SONNET
        assert offered.catalogue_id("alibaba/qwen-max") == QWEN
        assert offered.catalogue_id("azure/gpt-4o-mini") == "azure-openai:gpt-4o-mini"
        assert offered.catalogue_id("cloudflare:wrk/openai/gpt-oss-120b") == (
            "cloudflare:wrk/openai/gpt-oss-120b"
        )
        assert offered.catalogue_id("bedrock/no-such-model") is None

    def test_the_three_providers_read_as_the_catalogue_names_them(self) -> None:
        """Bedrock, Model Studio and Workers AI — Jev through Workers AI."""
        payload = {
            **LIVE_PAYLOAD,
            "alibaba_models": ["alibaba/qwen-max"],
            "cloudflare_models": ["cloudflare:wrk/typesafe/jev"],
            "bedrock_anthropic_model_specs": [
                {"id": "bedrock/us.anthropic.claude-opus-5", "name": "Opus 5"}
            ],
        }
        assert sorted(offered.read_served(payload)) == sorted([SONNET, QWEN, JEV])

    def test_the_live_answer_reads_as_one_model(self) -> None:
        assert offered.read_served(LIVE_PAYLOAD) == [SONNET]

    def test_it_is_asked_once_with_the_runtime_s_token(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("DATALAYER_AI_INFERENCE_API_KEY", "the-key")
        seen = _serve(
            monkeypatch, lambda request: httpx.Response(200, json=LIVE_PAYLOAD)
        )
        state = _load(monkeypatch)
        asyncio.run(offered.load_inference_models())

        assert state.served == (SONNET,)
        assert state.note == (
            f"ai-inference at https://r1.example/api/ai-inference/v1 serves {SONNET}."
        )
        assert len(seen) == 1
        assert str(seen[0].url) == "https://r1.example/api/ai-inference/v1/models"
        assert seen[0].headers["authorization"] == "Bearer the-key"
        assert offered.models_source("datalayer") == ("ai-inference", state.note)

    def test_a_failure_is_said_and_the_local_configuration_decides(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _serve(monkeypatch, lambda request: httpx.Response(503, json={}))
        state = _load(monkeypatch)

        assert state.served is None
        assert state.note.startswith(
            "ai-inference at https://r1.example/api/ai-inference/v1 did not list its models ("
        )
        assert state.note.endswith(
            "the models offered are only those this runtime is configured for, "
            "unchecked against it."
        )
        assert offered.models_source("datalayer") == ("local", state.note)
        # Nothing is refused on an answer that never came.
        assert offered.inference_refusal(OPUS, "datalayer") is None

    def test_no_ai_inference_configured_is_said(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        state = _load(monkeypatch, url=None)
        assert state.served is None
        assert "DATALAYER_AI_INFERENCE_URL is unset" in state.note


class TestAvailability:
    def test_through_ai_inference_its_list_decides(self) -> None:
        set_inference_models(InferenceModels(served=(SONNET,), url="u", note="n"))
        assert offered.availability(SONNET, "datalayer") == (True, None)
        assert offered.availability(QWEN, "datalayer") == (
            False,
            "Not served by ai-inference",
        )
        assert offered.inference_refusal(QWEN, "datalayer") == (
            f"ai-inference does not serve {QWEN} (it serves {SONNET})"
        )

    def test_calling_providers_directly_their_keys_decide(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        set_inference_models(InferenceModels(served=(SONNET,), url="u", note="n"))
        monkeypatch.delenv("DASHSCOPE_API_KEY", raising=False)
        monkeypatch.delenv("ALIBABA_API_KEY", raising=False)
        assert offered.models_source("local")[0] == "local"
        assert offered.availability(OPUS, "local") == (
            False,
            "Not enabled for this deployment",
        )
        assert offered.inference_refusal(QWEN, "local") is None


class TestAnAgentsModels:
    @pytest.fixture
    def agent(self, monkeypatch: pytest.MonkeyPatch) -> str:
        from agent_runtimes.routes import agents

        monkeypatch.setitem(
            agents._agentspecs,
            "desk",
            {
                "model": SONNET,
                "inference_provider": "datalayer",
                "agent_spec_id": None,
                "agent_spec": {"model": SONNET, "model_additionals": [QWEN]},
            },
        )
        return "desk"

    def test_are_its_model_and_its_additionals(self, agent: str) -> None:
        assert offered.offered_model_ids(agent) == [SONNET, QWEN]
        assert offered.offered_model_ids("nobody") is None
        assert offered.agent_inference_provider(agent) == "datalayer"

    def test_a_switch_outside_them_or_to_one_not_served_is_refused(
        self, agent: str
    ) -> None:
        set_inference_models(InferenceModels(served=(SONNET,), url="u", note="n"))
        assert offered.model_refusal(agent, SONNET, "datalayer") is None
        assert offered.model_refusal(agent, OPUS, "datalayer") == (
            f"{OPUS} is not one of this agent's models ({SONNET}, {QWEN}): "
            "nothing was switched."
        )
        assert offered.model_refusal(agent, QWEN, "datalayer") == (
            f"ai-inference does not serve {QWEN} (it serves {SONNET}): "
            "nothing was switched."
        )

    def test_the_config_offers_them_and_says_who_decided(self, agent: str) -> None:
        from agent_runtimes.config import get_frontend_config

        set_inference_models(
            InferenceModels(
                served=(SONNET,), url="u", note="ai-inference at u serves it."
            )
        )
        config = asyncio.run(
            get_frontend_config(
                model_ids=offered.offered_model_ids(agent),
                inference_provider="datalayer",
            )
        )
        rows = {row.id: row for row in config.models}
        assert list(rows) == [SONNET, QWEN]
        assert rows[SONNET].is_available is True
        assert rows[QWEN].is_available is False
        assert rows[QWEN].unavailable_reason == "Not served by ai-inference"
        payload = config.model_dump(by_alias=True)
        assert payload["modelsSource"] == "ai-inference"
        assert payload["modelsNote"] == "ai-inference at u serves it."

    def test_the_catalogue_route_answers_for_the_agent(
        self, agent: str, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.routes.configure import list_catalog_models

        monkeypatch.setattr(
            "agent_runtimes.models.local.discover_installed_models",
            lambda *a, **k: {},
        )
        set_inference_models(InferenceModels(served=(SONNET,), url="u", note="said"))
        payload = asyncio.run(list_catalog_models(agent_id=agent))
        assert [(m["id"], m["available"]) for m in payload["models"]] == [
            (SONNET, True),
            (QWEN, False),
        ]
        assert payload["models"][1]["reason"] == "Not served by ai-inference"
        assert (payload["source"], payload["note"]) == ("ai-inference", "said")


class TestTheSpecField:
    def test_an_id_the_catalogue_does_not_know_is_refused(self) -> None:
        from pydantic import ValidationError

        from agent_runtimes.types import Agentspec

        spec = Agentspec(id="a", name="A", model=SONNET, model_additionals=[QWEN])
        assert spec.model_dump(by_alias=True)["modelAdditionals"] == [QWEN]
        with pytest.raises(ValidationError, match="does not know: openai:gpt-9"):
            Agentspec(
                id="a", name="A", model=SONNET, model_additionals=["openai:gpt-9"]
            )

    def test_the_generator_refuses_it_too(self) -> None:
        codegen = Path(__file__).resolve().parents[2] / "scripts" / "codegen"
        sys.path.insert(0, str(codegen))
        try:
            import generate_agents
        finally:
            sys.path.remove(str(codegen))

        known = {SONNET, QWEN}
        generate_agents.check_model_additionals(
            [("", {"id": "a", "model_additionals": [QWEN]})], known
        )
        with pytest.raises(SystemExit, match="a: model_additionals names models"):
            generate_agents.check_model_additionals(
                [("", {"id": "a", "model_additionals": ["openai:gpt-9"]})], known
            )


class TestTheInferenceModelsRoute:
    """``/configure/inference/models``: the runtime's answer, no list of its own."""

    def test_it_lists_what_ai_inference_serves(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.routes import configure

        monkeypatch.setitem(
            configure._inference_provider_override, "provider", "datalayer"
        )
        set_inference_models(
            InferenceModels(served=(SONNET, QWEN), url="u", note="serves both.")
        )
        assert asyncio.run(configure.list_inference_models()) == {
            "provider": "datalayer",
            "models": [SONNET, QWEN],
            "source": "ai-inference",
            "note": "serves both.",
        }

    def test_without_its_answer_it_lists_nothing_and_says_why(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.routes import configure

        monkeypatch.setitem(
            configure._inference_provider_override, "provider", "datalayer"
        )
        set_inference_models(
            InferenceModels(served=None, url="u", note="ai-inference did not answer.")
        )
        payload = asyncio.run(configure.list_inference_models())
        assert payload["models"] == []
        assert (payload["source"], payload["note"]) == (
            "local",
            "ai-inference did not answer.",
        )
