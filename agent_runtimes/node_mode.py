# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Helpers for explicit Agent Node runtime mode."""

from __future__ import annotations

import os


def is_node_enabled() -> bool:
    """Return True when this server is explicitly running as an Agent Node."""
    return (os.getenv("AGENT_RUNTIMES_NODE") or "").strip().lower() == "true"


def set_node_enabled(enabled: bool) -> None:
    """Persist node mode in process environment for child components."""
    os.environ["AGENT_RUNTIMES_NODE"] = "true" if enabled else "false"
