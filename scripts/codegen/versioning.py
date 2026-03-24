# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Helpers for versioned spec IDs and generated symbol names."""

from __future__ import annotations

from typing import Any, Tuple

DEFAULT_SPEC_VERSION = "0.0.1"


def ensure_spec_version(spec: dict[str, Any], *, default: str = DEFAULT_SPEC_VERSION) -> str:
    """Ensure a spec dict has a version and return it."""
    version = str(spec.get("version") or default)
    spec["version"] = version
    return version


def split_spec_ref(ref: str | None, *, default: str = DEFAULT_SPEC_VERSION) -> Tuple[str, str]:
    """Split a ref like ``name:0.0.1`` into ``(name, 0.0.1)``.

    Uses rsplit so values that include ``:`` (e.g. model IDs) are preserved.
    """
    value = (ref or "").strip()
    if not value:
        return "", default
    base, sep, version = value.rpartition(":")
    if sep and version and _looks_like_version(version):
        return base, version
    return value, default


def versioned_ref(ref: str, version: str) -> str:
    """Build ``name:version`` references."""
    return f"{ref}:{version}"


def version_suffix(version: str) -> str:
    """Build symbol-safe suffix (e.g. 0.0.1 -> _0_0_1)."""
    normalized = version.replace(".", "_").replace("-", "_")
    return f"_{normalized}"


def _looks_like_version(value: str) -> bool:
    parts = value.split(".")
    if not parts:
        return False
    return all(part.isdigit() for part in parts)
