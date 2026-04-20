# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""LLM context usage tracking capability for pydantic-ai lifecycle hooks.

Centralises per-run token usage collection that was previously duplicated
across every adapter (PydanticAI, Vercel AI, AG-UI).  The capability hooks
into ``before_run`` / ``after_run`` so usage is recorded consistently
regardless of which transport or adapter is in use.

Tracked data:
- Input / output / cache-read / cache-write tokens
- Request count and tool call count (with tool names)
- Per-request usage history with timestamps and durations
- Message-level token estimates (user / assistant)
- Serialised message history (for context snapshot rebuilds)
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability

logger = logging.getLogger(__name__)


@dataclass
class LLMContextUsageCapability(AbstractCapability[Any]):
    """Record per-run LLM token usage into the shared UsageTracker.

    This replaces the manual ``tracker.update_usage(…)`` calls that were
    scattered through every adapter's ``run`` / ``stream`` method.

    Parameters
    ----------
    agent_id : str
        Agent identifier used as storage key in the usage tracker.
    enabled : bool
        Master switch — when *False* the hooks are no-ops.
    """

    agent_id: str
    enabled: bool = True

    # ── private (not init) ──
    _run_started_at: float = field(default=0.0, init=False, repr=False)

    # ── helpers ──────────────────────────────────────────────────────────

    @staticmethod
    def _extract_tool_names(messages: Any) -> list[str]:
        """Walk pydantic-ai message parts and collect tool_name references."""
        tool_names: list[str] = []
        for msg in messages:
            for part in getattr(msg, "parts", []):
                tool_name = getattr(part, "tool_name", None)
                if tool_name:
                    tool_names.append(tool_name)
        return tool_names

    # ── hooks ────────────────────────────────────────────────────────────

    async def before_run(self, ctx: RunContext[Any]) -> None:
        if not self.enabled:
            return
        self._run_started_at = time.perf_counter()

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        if not self.enabled:
            return result

        from agent_runtimes.context.usage import get_usage_tracker

        tracker = get_usage_tracker()
        usage = ctx.usage
        duration_ms = (time.perf_counter() - self._run_started_at) * 1000

        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        cache_read_tokens = int(getattr(usage, "cache_read_tokens", 0) or 0)
        cache_write_tokens = int(getattr(usage, "cache_write_tokens", 0) or 0)
        requests = int(getattr(usage, "requests", 1) or 1)
        tool_calls = int(getattr(usage, "tool_calls", 0) or 0)

        # Extract tool names from the full message history.
        all_messages = []
        try:
            all_messages = result.all_messages()
        except Exception:
            all_messages = list(ctx.messages)
        tool_names = self._extract_tool_names(all_messages)

        tracker.update_usage(
            agent_id=self.agent_id,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
            requests=requests,
            tool_calls=tool_calls or len(tool_names),
            tool_names=tool_names if tool_names else None,
            duration_ms=duration_ms,
        )

        # Update message-level token estimates.
        stats = tracker.get_agent_stats(self.agent_id)
        if stats:
            stats.update_message_tokens(
                user_tokens=input_tokens,
                assistant_tokens=output_tokens,
            )
            # Persist the serialised message history so snapshot rebuilds
            # (ContextSnapshot / FullContextSnapshot) have fresh data.
            try:
                stats.store_messages(all_messages)
            except Exception as exc:
                logger.debug(
                    "[LLMContextUsageCapability] Could not store message history "
                    "for agent '%s': %s",
                    self.agent_id,
                    exc,
                )

        logger.debug(
            "[LLMContextUsageCapability] agent_id=%s in=%d out=%d reqs=%d "
            "tools=%d duration_ms=%.1f",
            self.agent_id,
            input_tokens,
            output_tokens,
            requests,
            tool_calls or len(tool_names),
            duration_ms,
        )

        return result
