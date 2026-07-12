# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Shared, transport-agnostic helpers for the evals runners.

These helpers are pure functions used by both the in-process
:class:`agent_runtimes.evals.local.EvalRunner` (local) and the platform
orchestrator :func:`agent_runtimes.evals.remote.runner.execute_evalset_spec`
(remote). Keeping them here avoids duplicating prompt extraction, output text
coercion, and token-usage aggregation logic across runners.

@module agent_runtimes.evals.common
"""

from __future__ import annotations

import json
from typing import Any

__all__ = [
    "case_prompt",
    "compose_case_prompt",
    "extract_text",
    "extract_case_usage",
    "merge_run_usage",
    "usage_number",
    "usage_pick_number",
]


def case_prompt(case: dict[str, Any]) -> str:
    """Extract a prompt string from an evalset case's inputs.

    @param case - Evalset case dict with an ``inputs`` field.
    @returns The best prompt string found, or a JSON dump of the inputs.
    """
    inputs = case.get("inputs")
    if isinstance(inputs, dict):
        for key in ("prompt", "text", "query", "message"):
            value = inputs.get(key)
            if isinstance(value, str) and value.strip():
                return value
        return json.dumps(inputs, ensure_ascii=True)
    if isinstance(inputs, str):
        return inputs
    return ""


def compose_case_prompt(case: dict[str, Any], *, preamble: str = "") -> str:
    """Build the effective case prompt with an optional preamble.

    ``preamble`` lets a spec enforce task instructions (for example output
    format/constraints) without mutating every individual case input.

    @param case - Evalset case dict.
    @param preamble - Optional instruction text prepended to the case prompt.
    @returns The composed prompt string.
    """
    base_prompt = case_prompt(case)
    normalized_preamble = str(preamble or "").strip()
    if not normalized_preamble:
        return base_prompt
    if not base_prompt:
        return normalized_preamble
    return f"{normalized_preamble}\n\nInput:\n{base_prompt}"


def extract_text(payload: Any) -> str:
    """Coerce an agent output payload into a plain text answer.

    @param payload - Agent output (dict, str, or other).
    @returns A plain text representation of the payload.
    """
    if isinstance(payload, dict):
        text = payload.get("text")
        if isinstance(text, str):
            return text
        message = payload.get("message")
        if isinstance(message, str):
            return message
    if isinstance(payload, str):
        return payload
    return json.dumps(payload, ensure_ascii=True)


def usage_number(value: Any) -> float | None:
    """Coerce a usage value into a float, or ``None`` when not numeric.

    @param value - Candidate usage value.
    @returns The numeric value as a float, or ``None``.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except Exception:
            return None
    return None


def usage_pick_number(usage: dict[str, Any], *keys: str) -> float | None:
    """Return the first numeric value found among ``keys`` in ``usage``.

    @param usage - Usage mapping to inspect.
    @param keys - Candidate keys, checked in order.
    @returns The first numeric value found, or ``None``.
    """
    for key in keys:
        number = usage_number(usage.get(key))
        if number is not None:
            return number
    return None


def extract_case_usage(chat_result: dict[str, Any]) -> dict[str, Any]:
    """Extract a token-usage mapping from an agent chat result.

    @param chat_result - Result payload from an agent chat call.
    @returns A copy of the usage mapping, or an empty dict when absent.
    """
    direct = chat_result.get("usage")
    if isinstance(direct, dict) and direct:
        return dict(direct)
    output_raw = chat_result.get("output")
    output = output_raw if isinstance(output_raw, dict) else {}
    nested = output.get("pydantic_ai_usage") or output.get("usage")
    if isinstance(nested, dict) and nested:
        return dict(nested)
    return {}


def merge_run_usage(
    aggregate: dict[str, Any], case_usage: dict[str, Any]
) -> dict[str, Any]:
    """Merge a single case's usage into a run-level aggregate in place.

    Numeric token/credit fields are summed (credits kept as floats, token/
    request/duration fields rounded to ints). Descriptive fields (provider,
    model, account/requester identifiers, timestamps) are taken from the first
    case that provides them.

    @param aggregate - The run-level usage aggregate (mutated and returned).
    @param case_usage - The per-case usage mapping to merge in.
    @returns The updated ``aggregate`` mapping.
    """
    if not case_usage:
        return aggregate

    prompt_tokens = usage_pick_number(
        case_usage,
        "prompt_tokens",
        "promptTokens",
        "input_tokens",
        "inputTokens",
    )
    completion_tokens = usage_pick_number(
        case_usage,
        "completion_tokens",
        "completionTokens",
        "output_tokens",
        "outputTokens",
    )
    total_tokens = usage_pick_number(
        case_usage,
        "total_tokens",
        "totalTokens",
        "tokens_total",
        "token_total",
    )
    if (
        total_tokens is None
        and prompt_tokens is not None
        and completion_tokens is not None
    ):
        total_tokens = prompt_tokens + completion_tokens

    numeric_fields: list[tuple[str, float | None]] = [
        ("prompt_tokens", prompt_tokens),
        ("completion_tokens", completion_tokens),
        ("total_tokens", total_tokens),
        (
            "input_cached_tokens",
            usage_pick_number(
                case_usage,
                "input_cached_tokens",
                "inputCachedTokens",
                "cached_input_tokens",
                "cachedInputTokens",
            ),
        ),
        (
            "tool_calls",
            usage_pick_number(
                case_usage,
                "tool_calls",
                "toolCalls",
                "tool_call_count",
                "toolCallCount",
            ),
        ),
        (
            "requests",
            usage_pick_number(
                case_usage,
                "requests",
                "request_count",
                "requestCount",
            ),
        ),
        (
            "duration_ms",
            usage_pick_number(
                case_usage,
                "duration_ms",
                "durationMs",
                "latency_ms",
                "latencyMs",
            ),
        ),
        (
            "credits_consumed",
            usage_pick_number(
                case_usage,
                "credits_consumed",
                "creditsConsumed",
                "credits",
                "total_credits",
                "cost_credits",
            ),
        ),
    ]
    for key, value in numeric_fields:
        if value is None:
            continue
        current = usage_number(aggregate.get(key)) or 0.0
        summed = current + value
        if key in {"credits_consumed"}:
            aggregate[key] = round(summed, 6)
        else:
            aggregate[key] = int(round(summed))

    for key in (
        "source",
        "provider",
        "model",
        "billable_account_kind",
        "billable_account_uid",
        "requester_kind",
        "requester_uid",
        "captured_at",
        "timestamp",
    ):
        value = case_usage.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        aggregate.setdefault(key, value)
    return aggregate
