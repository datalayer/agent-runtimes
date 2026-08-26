# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

from agent_runtimes.client.agent_client import extract_vercel_stream_usage
from agent_runtimes.evals.common import merge_run_usage


def test_extract_vercel_stream_usage_prefers_token_payload() -> None:
    raw = "\n".join(
        [
            'data: {"type":"start"}',
            'data: {"type":"message-metadata","messageMetadata":{"pydantic_ai":{"timestamp":"2026-06-24T12:00:00Z"}}}',
            'data: {"type":"message-metadata","messageMetadata":{"pydantic_ai":{"provider":"bedrock","model":"claude","usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17,"credits_consumed":0.00034}}}}',
            "data: [DONE]",
        ]
    )

    usage = extract_vercel_stream_usage(raw)

    assert usage["provider"] == "bedrock"
    assert usage["model"] == "claude"
    assert usage["prompt_tokens"] == 12
    assert usage["completion_tokens"] == 5
    assert usage["total_tokens"] == 17
    assert usage["credits_consumed"] == 0.00034


def test_merge_run_usage_normalizes_aliases_and_sums() -> None:
    aggregate: dict[str, object] = {}

    aggregate = merge_run_usage(
        aggregate,
        {
            "provider": "bedrock",
            "prompt_tokens": 10,
            "completion_tokens": 3,
            "credits_consumed": 0.0002,
        },
    )
    aggregate = merge_run_usage(
        aggregate,
        {
            "input_tokens": "4",
            "output_tokens": "2",
            "credits": "0.0003",
        },
    )

    assert aggregate["provider"] == "bedrock"
    assert aggregate["prompt_tokens"] == 14
    assert aggregate["completion_tokens"] == 5
    assert aggregate["total_tokens"] == 19
    assert aggregate["credits_consumed"] == 0.0005
