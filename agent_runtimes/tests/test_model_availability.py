# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Which models the server says are available, and which one it opens on.

The case behind it: `alibaba:qwen-max` lists no environment variables — its
credentials live in datalayer-ai-inference — so a runtime calling providers
directly offered it as ready and pydantic-ai answered "Set the
`ALIBABA_API_KEY` environment variable". And two specs claimed the default,
one of them unavailable, so `DEFAULT_MODEL` pointed at a model nobody could
call.

Launch:
```
$ pytest agent_runtimes/tests/test_model_availability.py -v
```
"""

from __future__ import annotations

import pytest

from agent_runtimes.models import models as service
from agent_runtimes.specs.models import AI_MODEL_CATALOGUE, DEFAULT_MODEL

ALIBABA = AI_MODEL_CATALOGUE["alibaba:qwen-max"]
BEDROCK = AI_MODEL_CATALOGUE[DEFAULT_MODEL.value]

AWS = {
    "AWS_ACCESS_KEY_ID": "id",
    "AWS_SECRET_ACCESS_KEY": "secret",
    "AWS_DEFAULT_REGION": "us-east-1",
}


@pytest.fixture
def clean_env(monkeypatch):
    """No provider credentials at all, and the local inference provider."""
    for name in (
        "ALIBABA_API_KEY",
        "DASHSCOPE_API_KEY",
        "AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE",
        *AWS,
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(service, "effective_inference_provider", lambda: "local")
    return monkeypatch


class TestCredentialsReady:
    def test_a_provider_the_spec_is_silent_about_still_needs_its_key_locally(
        self, clean_env
    ) -> None:
        assert ALIBABA.required_env_vars == []
        assert service.credentials_ready(ALIBABA, "local") is False

    def test_any_one_of_the_alternatives_is_enough(self, clean_env) -> None:
        clean_env.setenv("DASHSCOPE_API_KEY", "key")
        assert service.credentials_ready(ALIBABA, "local") is True

    def test_the_inference_service_holds_the_keys_when_routing_through_it(
        self, clean_env
    ) -> None:
        assert service.credentials_ready(ALIBABA, "datalayer") is True

    def test_the_spec_s_own_variables_are_still_required(self, clean_env) -> None:
        assert service.credentials_ready(BEDROCK, "local") is False
        for name, value in AWS.items():
            clean_env.setenv(name, value)
        assert service.credentials_ready(BEDROCK, "local") is True


class TestWhatTheConfigOffers:
    def test_only_entitled_models_with_credentials_are_available(
        self, clean_env
    ) -> None:
        for name, value in AWS.items():
            clean_env.setenv(name, value)

        available = {m.id for m in service.create_default_models([]) if m.is_available}

        assert DEFAULT_MODEL.value in available
        assert "alibaba:qwen-max" not in available
        # Entitled but not ready: the reason says which.
        by_id = {m.id: m for m in service.create_default_models([])}
        assert by_id["alibaba:qwen-max"].unavailable_reason == "Missing API key"

    def test_the_default_model_is_one_this_deployment_may_call(self) -> None:
        # Two specs claimed the default and the generator took the first, which
        # was marked unavailable. The generator now prefers an available one;
        # this is what that guarantees.
        assert BEDROCK.available is True
        assert BEDROCK.provider == "bedrock"
        assert "sonnet" in BEDROCK.id
