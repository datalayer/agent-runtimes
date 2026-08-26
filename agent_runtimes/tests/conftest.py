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
