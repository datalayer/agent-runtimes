# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A model with no provider named follows this process's own setting."""

import pytest

from agent_runtimes.models import models


def test_a_model_with_no_provider_follows_the_process(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "datalayer")
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
    monkeypatch.setenv("DATALAYER_API_KEY", "key")
    resolved = models.resolve_model_for_inference_provider(
        "bedrock:us.anthropic.claude-sonnet-4-6", None
    )
    assert not isinstance(resolved, str)
    assert "/api/ai-inference/v1" in str(resolved.client.base_url)


def test_the_process_wins_over_a_spec_that_says_local(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", "datalayer")
    monkeypatch.setenv("DATALAYER_AI_INFERENCE_URL", "https://r1.example")
    monkeypatch.setenv("DATALAYER_API_KEY", "key")
    resolved = models.resolve_model_for_inference_provider(
        "bedrock:us.anthropic.claude-sonnet-4-6", "local"
    )
    assert not isinstance(resolved, str)
    assert "/api/ai-inference/v1" in str(resolved.client.base_url)


def test_with_no_setting_a_provider_named_holds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE", raising=False)
    resolved = models.resolve_model_for_inference_provider(
        "bedrock:us.anthropic.claude-sonnet-4-6", "local"
    )
    assert resolved == "bedrock:us.anthropic.claude-sonnet-4-6"
