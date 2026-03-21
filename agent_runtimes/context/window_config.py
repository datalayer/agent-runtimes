# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Context window management configuration.

Determines how the context window is managed for long-running
durable agents — auto-summarization, eviction, and history archive.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ContextWindowConfig:
    """Configuration for context window management.

    Spec example::

        context_management:
          enabled: true
          max_tokens: 200000
          compress_threshold: 0.9
          summarization_model: "openai:gpt-4.1-mini"
          eviction_token_limit: 20000

    Attributes
    ----------
    enabled : bool
        Whether automatic context management is active.
    max_tokens : int
        Maximum context window size in tokens (auto-detected from model if 0).
    compress_threshold : float
        Fraction of max_tokens at which summarization triggers (default 0.9).
    summarization_model : str | None
        Model to use for summarization (cheaper than the agent model).
    eviction_token_limit : int | None
        Tool outputs larger than this are evicted to files.
    history_archive : bool
        Whether to persist the full conversation history for search.
    """

    enabled: bool = False
    max_tokens: int = 0  # 0 = auto-detect from model
    compress_threshold: float = 0.9
    summarization_model: str | None = None
    eviction_token_limit: int | None = None
    history_archive: bool = True

    @classmethod
    def from_spec(cls, spec_context: dict[str, Any] | None) -> "ContextWindowConfig":
        """Build from AgentSpec ``context_management`` dict."""
        if not spec_context:
            return cls()
        return cls(
            enabled=spec_context.get("enabled", False),
            max_tokens=spec_context.get("max_tokens", 0),
            compress_threshold=spec_context.get("compress_threshold", 0.9),
            summarization_model=spec_context.get("summarization_model"),
            eviction_token_limit=spec_context.get("eviction_token_limit"),
            history_archive=spec_context.get("history_archive", True),
        )

    @classmethod
    def from_env(cls) -> "ContextWindowConfig":
        """Build from environment variables."""
        enabled = os.environ.get("AGENT_CONTEXT_MGMT_ENABLED", "").lower() == "true"
        eviction_limit = os.environ.get("AGENT_CONTEXT_EVICTION_LIMIT")
        return cls(
            enabled=enabled,
            max_tokens=int(os.environ.get("AGENT_CONTEXT_MAX_TOKENS", "0")),
            compress_threshold=float(
                os.environ.get("AGENT_CONTEXT_COMPRESS_THRESHOLD", "0.9")
            ),
            summarization_model=os.environ.get("AGENT_CONTEXT_SUMMARIZATION_MODEL"),
            eviction_token_limit=int(eviction_limit) if eviction_limit else None,
        )
