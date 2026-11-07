# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A direct provider's model is called by the agent itself, wherever the runtime
routes its inference (the user, 7 November 2026): OpenRouter goes from the agent to
openrouter.ai with the person's OPENROUTER_API_KEY, never through ai-inference, which
holds no account with it; Cloudflare keeps going through ai-inference on Datalayer.

Launch:

```
$ pytest agent_runtimes/tests/test_models_direct_providers.py -v
```
"""

from __future__ import annotations

import pytest

from agent_runtimes.models import models as service
from agent_runtimes.models import offered
from agent_runtimes.specs.model_providers import MODEL_PROVIDER_CATALOGUE
from agent_runtimes.specs.models import AI_MODEL_CATALOGUE

OPENROUTER = "openrouter:anthropic/claude-opus-5.5"
CLOUDFLARE = "cloudflare:wrk/openai/gpt-oss-120b"


@pytest.fixture
def on_datalayer(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """A Datalayer runtime: every call through ai-inference, with its token."""
    monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "datalayer")
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
    monkeypatch.setenv("DATALAYER_API_KEY", "key")
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    return monkeypatch


def test_the_catalogue_says_how_each_provider_is_reached() -> None:
    assert MODEL_PROVIDER_CATALOGUE["openrouter"].via == "direct"
    assert MODEL_PROVIDER_CATALOGUE["cloudflare"].via == "ai-inference"
    assert MODEL_PROVIDER_CATALOGUE["bedrock"].via == "ai-inference"
    assert service.called_directly(OPENROUTER) is True
    assert service.called_directly(CLOUDFLARE) is False
    assert service.called_directly("nowhere:x") is False
    assert AI_MODEL_CATALOGUE[OPENROUTER].required_env_vars == ["OPENROUTER_API_KEY"]


def test_a_direct_model_needs_its_key_on_datalayer_too(on_datalayer) -> None:
    assert (
        service.credentials_ready(AI_MODEL_CATALOGUE[OPENROUTER], "datalayer") is False
    )
    on_datalayer.setenv("OPENROUTER_API_KEY", "sk-or")
    assert (
        service.credentials_ready(AI_MODEL_CATALOGUE[OPENROUTER], "datalayer") is True
    )
    # ai-inference holds the Cloudflare account: nothing needed here.
    assert (
        service.credentials_ready(AI_MODEL_CATALOGUE[CLOUDFLARE], "datalayer") is True
    )


def test_a_direct_model_goes_from_the_agent_to_the_provider(on_datalayer) -> None:
    on_datalayer.setenv("OPENROUTER_API_KEY", "sk-or")
    resolved = service.resolve_model_for_inference_provider(OPENROUTER, "datalayer")
    assert not isinstance(resolved, str)
    assert "openrouter.ai" in str(resolved.client.base_url)
    assert "ai-inference" not in str(resolved.client.base_url)
    # Cloudflare still goes through ai-inference.
    through = service.resolve_model_for_inference_provider(CLOUDFLARE, "datalayer")
    assert "/api/ai-inference/v1" in str(through.client.base_url)


def test_a_direct_call_without_the_key_is_refused_in_a_sentence(on_datalayer) -> None:
    with pytest.raises(RuntimeError, match="OPENROUTER_API_KEY"):
        service.resolve_model_for_inference_provider(OPENROUTER, "datalayer")


def test_a_direct_model_is_offered_by_its_key_not_by_what_ai_inference_serves(
    on_datalayer, monkeypatch: pytest.MonkeyPatch
) -> None:
    served = offered.InferenceModels(
        served=(CLOUDFLARE,), url="https://r1.example", note="served"
    )
    monkeypatch.setattr(offered, "_state", served)
    monkeypatch.setattr(offered, "inference_token_refusal", lambda: None)
    assert offered.availability(OPENROUTER, "datalayer") == (False, "Missing API key")
    on_datalayer.setenv("OPENROUTER_API_KEY", "sk-or")
    assert offered.availability(OPENROUTER, "datalayer") == (True, None)
    assert offered.listed(OPENROUTER, "datalayer") is True
    # A direct model the catalogue does not offer (Anthropic's own API, off) is not listed.
    assert offered.listed("anthropic:claude-opus-4-20250514", "datalayer") is False
    # A model ai-inference does not serve, of a provider reached through it, stays off the list.
    assert offered.listed("bedrock:us.anthropic.claude-opus-5", "datalayer") is False
