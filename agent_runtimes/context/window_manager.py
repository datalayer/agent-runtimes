# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Context window manager.

Orchestrates summarization, eviction, and history archiving for
long-running durable agents. Hooks into the message processing
pipeline before each model request.
"""

from __future__ import annotations

import logging
from typing import Any

from .eviction import ToolOutputEviction
from .history_archive import HistoryArchive
from .summarization import ConversationSummarizer
from .window_config import ContextWindowConfig

logger = logging.getLogger(__name__)


class ContextWindowManager:
    """Manage the context window for long-running durable agents.

    Coordinates auto-summarization, tool output eviction, and history
    archiving. Designed to be used as a pre-processing step before each
    model request.

    Parameters
    ----------
    config : ContextWindowConfig
        Configuration for context management.
    """

    def __init__(self, config: ContextWindowConfig):
        self.config = config
        self.token_usage_pct: float = 0.0
        self._current_tokens: int = 0
        self._max_tokens: int = config.max_tokens

        # Sub-components
        self._summarizer = ConversationSummarizer(
            summarization_model=config.summarization_model,
        )
        self._eviction = (
            ToolOutputEviction(token_limit=config.eviction_token_limit)
            if config.eviction_token_limit
            else None
        )
        self._archive = HistoryArchive() if config.history_archive else None

    async def process_messages(
        self, messages: list[dict[str, Any]], model: str | None = None
    ) -> list[dict[str, Any]]:
        """Process messages before a model request.

        Steps:
        1. Archive new messages (for history search)
        2. Evict large tool outputs to files
        3. Check token usage percentage
        4. If above threshold, summarize older messages

        Parameters
        ----------
        messages : list[dict]
            The full message list.
        model : str | None
            The model name (for auto-detecting max_tokens).

        Returns
        -------
        list[dict]
            The processed message list (possibly with summarized older messages).
        """
        if not self.config.enabled:
            return messages

        # Auto-detect max_tokens from model if not configured
        if self._max_tokens == 0 and model:
            self._max_tokens = self._detect_max_tokens(model)

        if self._max_tokens == 0:
            self._max_tokens = 200_000  # Safe default

        # Step 1: Archive new messages
        if self._archive:
            self._archive.append_many(messages)

        # Step 2: Evict large tool outputs
        if self._eviction:
            messages = self._evict_large_outputs(messages)

        # Step 3: Estimate current token usage
        self._current_tokens = self._estimate_tokens(messages)
        self.token_usage_pct = self._current_tokens / self._max_tokens

        # Step 4: Summarize if above threshold
        if self.token_usage_pct >= self.config.compress_threshold:
            logger.info(
                "Context window at %.1f%% (%d/%d tokens) — triggering summarization",
                self.token_usage_pct * 100,
                self._current_tokens,
                self._max_tokens,
            )
            # Compress the older 60% of messages
            num_to_compress = int(len(messages) * 0.6)
            messages, _ = await self._summarizer.summarize_messages(
                messages, num_to_compress
            )
            # Re-estimate after compression
            self._current_tokens = self._estimate_tokens(messages)
            self.token_usage_pct = self._current_tokens / self._max_tokens

        return messages

    def process_tool_result(self, tool_name: str, result: Any) -> Any:
        """Process a tool result through the eviction system."""
        if self._eviction:
            return self._eviction.process_tool_result(tool_name, result)
        return result

    def get_usage_info(self) -> dict:
        """Return current context usage information."""
        return {
            "percentage": round(self.token_usage_pct, 4),
            "current_tokens": self._current_tokens,
            "max_tokens": self._max_tokens,
            "compress_threshold": self.config.compress_threshold,
            "archive_messages": (
                self._archive.get_total_messages() if self._archive else 0
            ),
        }

    def get_archive(self) -> HistoryArchive | None:
        """Return the history archive (if enabled)."""
        return self._archive

    def _evict_large_outputs(
        self, messages: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Evict large tool outputs in-place."""
        assert self._eviction is not None
        for msg in messages:
            if msg.get("role") == "tool":
                content = msg.get("content", "")
                if isinstance(content, str) and self._eviction.should_evict(content):
                    tool_name = msg.get("name", "unknown_tool")
                    msg["content"] = self._eviction.evict(tool_name, content)
        return messages

    @staticmethod
    def _estimate_tokens(messages: list[dict[str, Any]]) -> int:
        """Rough token estimate: 1 token ≈ 4 chars."""
        total_chars = 0
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                total_chars += len(content)
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        total_chars += len(str(part.get("text", "")))
        return total_chars // 4

    @staticmethod
    def _detect_max_tokens(model: str) -> int:
        """Auto-detect context window size from model name."""
        # Import from existing session module if available
        try:
            from .session import get_model_context_window

            return get_model_context_window(model)
        except ImportError:
            pass

        # Fallback: common model context windows
        model_lower = model.lower()
        if "claude" in model_lower:
            return 200_000
        if "gpt-4o" in model_lower:
            return 128_000
        if "gpt-4.1" in model_lower:
            return 1_000_000
        if "gemini" in model_lower:
            return 1_000_000
        return 200_000  # Safe default

    @classmethod
    def from_spec(cls, spec_context: dict | None) -> "ContextWindowManager":
        """Create from AgentSpec ``context_management`` config."""
        config = ContextWindowConfig.from_spec(spec_context)
        return cls(config)
