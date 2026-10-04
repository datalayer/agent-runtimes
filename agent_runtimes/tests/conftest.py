# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pytest configuration for agent_runtimes unit tests."""

import os

# Ensure AWS_DEFAULT_REGION is set so that agent specs referencing Bedrock
# models can be imported without raising pydantic_ai.exceptions.UserError
# during test collection.  The region is never used for actual API calls
# in unit tests.
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

# Same reason for OpenAI: building an agent from an `openai:` model string
# constructs the provider, which refuses to exist without a key. No unit test
# reaches the API, so a placeholder is all this needs.
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key-not-used")

from collections.abc import Iterator  # noqa: E402

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def _ai_inference_not_asked(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No test asks the real ai-inference which models it serves.

    The runtime asks once and keeps the answer; a test that needs an answer
    sets it (``set_inference_models``). Without this, a test reaching the
    config routes would ask whatever ``DATALAYER_AI_INFERENCE_URL`` names.

    Nor does a test call it with the token of the shell it runs in: none is
    given and none is in the environment; a test that routes through
    ai-inference gives one (``give_inference_token``).

    Parameters
    ----------
    monkeypatch : pytest.MonkeyPatch
        Clears the tokens of the environment for the test.

    Yields
    ------
    None
        While the test runs on the answer set here.
    """
    from agent_runtimes.models.offered import (
        InferenceModels,
        give_inference_token,
        set_inference_models,
    )

    monkeypatch.delenv("DATALAYER_AI_INFERENCE_API_KEY", raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    give_inference_token(None)
    set_inference_models(
        InferenceModels(
            served=None, url=None, note="ai-inference is not asked in tests."
        )
    )
    yield
    set_inference_models(None)
    give_inference_token(None)
