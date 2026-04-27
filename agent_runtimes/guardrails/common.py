# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Common guardrail primitives and helpers."""

from __future__ import annotations

from typing import Any


class GuardrailBlockedError(RuntimeError):
    """Raised when a capability guardrail blocks execution."""


def _parse_token_limit(value: Any, default: int) -> int:
    if value is None:
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        raw = value.strip().upper()
        if not raw:
            return default
        multiplier = 1
        if raw.endswith("K"):
            multiplier = 1_000
            raw = raw[:-1]
        elif raw.endswith("M"):
            multiplier = 1_000_000
            raw = raw[:-1]
        elif raw.endswith("B"):
            multiplier = 1_000_000_000
            raw = raw[:-1]
        try:
            return int(float(raw) * multiplier)
        except ValueError:
            return default
    return default


def _contains_any(value: str, patterns: list[str]) -> bool:
    lowered = value.lower()
    for pattern in patterns:
        if pattern and pattern.lower() in lowered:
            return True
    return False
