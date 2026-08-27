# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for local models: the provider table, discovery, routing and /models."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from agent_runtimes.models.local import (
    LOCAL_PROVIDERS,
    LOCAL_SANDBOX_VARIANT,
    build_local_model,
    capability_warning,
    discover_installed_models,
    get_local_provider,
    is_local_model,
    model_supports,
    split_model_id,
)
from agent_runtimes.types import AIModel


class TestProviderTable:
    def test_ollama_names_keep_their_colons(self) -> None:
        # `llama3.1:8b` is one model name, not a provider and a name.
        assert split_model_id("ollama:llama3.1:8b") == ("ollama", "llama3.1:8b")
        assert split_model_id("openai:gpt-4o") == ("openai", "gpt-4o")
        assert split_model_id("") == ("", "")

    def test_recognises_local_providers_only(self) -> None:
        assert is_local_model("ollama:llama3.1:8b") is True
        assert is_local_model("lmstudio:whatever") is True
        assert is_local_model("openai:gpt-4o") is False
        assert get_local_provider("bedrock:claude") is None

    def test_base_url_defaults_and_overrides(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        ollama = LOCAL_PROVIDERS["ollama"]
        monkeypatch.delenv("OLLAMA_HOST", raising=False)
        assert ollama.base_url() == "http://localhost:11434/v1"

        # OLLAMA_HOST is conventionally a host root, so /v1 is appended.
        monkeypatch.setenv("OLLAMA_HOST", "http://box:11434")
        assert ollama.base_url() == "http://box:11434/v1"

        # An override that already names the OpenAI base is left alone.
        monkeypatch.setenv("OLLAMA_HOST", "http://box:11434/v1/")
        assert ollama.base_url() == "http://box:11434/v1"

    def test_tags_url_is_the_runtime_native_listing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("OLLAMA_HOST", raising=False)
        # Ollama lists models on its own route; the others answer /v1/models.
        assert LOCAL_PROVIDERS["ollama"].tags_url() == "http://localhost:11434/api/tags"
        assert (
            LOCAL_PROVIDERS["lmstudio"].tags_url() == "http://localhost:1234/v1/models"
        )


class TestDiscovery:
    def test_reports_what_each_runtime_has_installed(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_get(url: str, timeout: float = 0) -> SimpleNamespace:
            if "11434" in url:
                return SimpleNamespace(
                    raise_for_status=lambda: None,
                    json=lambda: {"models": [{"name": "llama3.1:8b"}]},
                )
            raise ConnectionError("nothing listening")

        monkeypatch.setattr("httpx.get", fake_get)

        assert discover_installed_models() == {"ollama": ("llama3.1:8b",)}

    def test_a_runtime_that_is_down_is_simply_absent(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        def fake_get(url: str, timeout: float = 0):
            raise ConnectionError("nothing listening")

        monkeypatch.setattr("httpx.get", fake_get)

        # Discovery runs behind a prompt: nothing running is an empty answer,
        # never an exception.
        assert discover_installed_models() == {}

    def test_a_malformed_answer_is_ignored(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            "httpx.get",
            lambda url, timeout=0: SimpleNamespace(
                raise_for_status=lambda: None, json=lambda: {"models": "not a list"}
            ),
        )

        assert discover_installed_models() == {}


class TestCapabilities:
    def test_unstated_capabilities_are_not_treated_as_incapable(self) -> None:
        # Hosted models declare nothing; gating them would be a regression.
        hosted = AIModel(id="openai:gpt-4o", name="GPT-4o", provider="openai")
        assert model_supports(hosted, "tools") is True
        assert capability_warning(hosted) is None

    def test_a_declared_list_without_tools_means_no_tools(self) -> None:
        small = AIModel(
            id="ollama:gemma3:4b",
            name="Gemma 3 4B",
            provider="ollama",
            local=True,
            capabilities=["chat"],
        )
        assert model_supports(small, "tools") is False
        assert "tool calling" in (capability_warning(small) or "")

    def test_a_capable_local_model_does_not_warn(self) -> None:
        capable = AIModel(
            id="ollama:llama3.1:8b",
            name="Llama 3.1 8B",
            provider="ollama",
            local=True,
            capabilities=["chat", "tools", "codemode"],
        )
        assert capability_warning(capable) is None


class TestRouting:
    def test_builds_an_openai_compatible_model_for_a_local_id(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("OLLAMA_HOST", raising=False)
        model = build_local_model("ollama:llama3.1:8b")

        assert model is not None
        assert model.model_name == "llama3.1:8b"
        assert "11434" in str(model.client.base_url)

    def test_returns_none_for_a_hosted_id(self) -> None:
        assert build_local_model("openai:gpt-4o") is None

    def test_resolution_routes_local_and_leaves_hosted_alone(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.models.models import resolve_model_for_inference_provider

        monkeypatch.delenv("OLLAMA_HOST", raising=False)

        local = resolve_model_for_inference_provider("ollama:llama3.1:8b")
        assert local.model_name == "llama3.1:8b"

        # A hosted model keeps the string form pydantic-ai parses itself.
        assert resolve_model_for_inference_provider("openai:gpt-4o") == "openai:gpt-4o"

    def test_a_local_model_ignores_the_datalayer_gateway(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.models.models import resolve_model_for_inference_provider

        monkeypatch.delenv("OLLAMA_HOST", raising=False)

        # Sending an Ollama prompt to a hosted gateway is never what someone
        # choosing a local model asked for.
        routed = resolve_model_for_inference_provider(
            "ollama:llama3.1:8b", inference_provider="datalayer"
        )
        assert "11434" in str(routed.client.base_url)


class TestCatalogEndpoint:
    def _payload(self, monkeypatch: pytest.MonkeyPatch, installed: dict) -> dict:
        monkeypatch.setattr(
            "agent_runtimes.models.local.discover_installed_models",
            lambda *a, **k: installed,
        )
        from agent_runtimes.routes.configure import list_catalog_models

        return asyncio.run(list_catalog_models())

    def test_local_models_report_reachability_not_env_vars(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = self._payload(monkeypatch, {"ollama": ("llama3.1:8b",)})
        by_id = {m["id"]: m for m in payload["models"]}

        assert by_id["ollama:llama3.1:8b"]["reachable"] is True
        assert by_id["ollama:llama3.1:8b"]["available"] is True
        assert by_id["ollama:llama3.1:8b"]["required_env_vars"] == []

        # Runtime is up, this model is not pulled: a different answer from
        # "the runtime is not running", and the reason says which.
        not_pulled = by_id["ollama:qwen2.5-coder:7b"]
        assert not_pulled["reachable"] is False
        assert "not installed" in not_pulled["reason"]

    def test_a_runtime_that_is_down_says_so(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = self._payload(monkeypatch, {})
        by_id = {m["id"]: m for m in payload["models"]}

        assert by_id["ollama:llama3.1:8b"]["reason"] == "ollama is not running"
        assert payload["local_runtimes"]["ollama"]["reachable"] is False

    def test_an_installed_model_with_no_spec_is_reported_separately(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        payload = self._payload(monkeypatch, {"ollama": ("mystery-model:7b",)})

        # Never a silent option: agentspecs decides what is offerable.
        assert payload["uncatalogued_local"] == [
            {"provider": "ollama", "name": "mystery-model:7b"}
        ]
        assert "ollama:mystery-model:7b" not in {m["id"] for m in payload["models"]}

    def test_hosted_models_report_missing_env_vars(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        payload = self._payload(monkeypatch, {})
        gpt = next(m for m in payload["models"] if m["id"] == "openai:gpt-4o")

        assert gpt["available"] is False
        assert gpt["missing_env_vars"] == ["OPENAI_API_KEY"]
        assert gpt["reachable"] is None


class TestModelsCommand:
    def _tux(self, captured: list[dict]) -> SimpleNamespace:
        class FakeConsole:
            def print(self, *args, **kwargs) -> None:
                pass

        class FakeResponse:
            def __init__(self, payload: dict) -> None:
                self._payload = payload

            def raise_for_status(self) -> None:
                pass

            def json(self) -> dict:
                return self._payload

        class FakeClient:
            async def __aenter__(self) -> "FakeClient":
                return self

            async def __aexit__(self, *exc) -> None:
                return None

            async def get(self, url: str, timeout: float = 0) -> FakeResponse:
                return FakeResponse(
                    {"spec": {"id": "loop-base", "model": "openai:gpt-4o"}}
                )

            async def post(self, url: str, json: dict, timeout: float = 0):
                captured.append(json)
                return FakeResponse({})

        return SimpleNamespace(
            console=FakeConsole(),
            server_url="http://server",
            agent_id="loop-base",
            session=SimpleNamespace(model="openai:gpt-4o"),
            _client=FakeClient,
        )

    def _switch(self, monkeypatch: pytest.MonkeyPatch, model_id: str) -> dict:
        from agent_runtimes.chat.commands import models as models_cmd

        captured: list[dict] = []
        tux = self._tux(captured)
        monkeypatch.setattr("httpx.AsyncClient", tux._client)
        asyncio.run(models_cmd.execute(tux, model_id))
        assert captured, "the agent was never reconfigured"
        return captured[0]

    def test_switching_to_a_local_model_moves_the_sandbox_local(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        body = self._switch(monkeypatch, "ollama:llama3.1:8b")

        # D5: the code stays where the tokens do.
        assert body["agent_spec"]["model"] == "ollama:llama3.1:8b"
        assert body["agent_spec"]["sandbox_variant"] == LOCAL_SANDBOX_VARIANT

    def test_a_model_without_codemode_gets_codemode_turned_off(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        body = self._switch(monkeypatch, "ollama:gemma3:4b")

        assert body["agent_spec"]["codemode"] is False

    def test_an_unknown_model_reconfigures_nothing(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from agent_runtimes.chat.commands import models as models_cmd

        captured: list[dict] = []
        tux = self._tux(captured)
        monkeypatch.setattr("httpx.AsyncClient", tux._client)

        asyncio.run(models_cmd.execute(tux, "openai:does-not-exist"))

        assert captured == []
