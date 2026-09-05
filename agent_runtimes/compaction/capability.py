# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""History compaction as a self-contained pydantic-ai capability.

The capability trims conversation history before each model request so the
input never grows past the model's declared ``tokens_limit``. When the
estimated history size crosses a fraction of that budget, older messages are
replaced by a single LLM-generated summary while recent messages, the leading
system prompts, and the first user message are preserved. Tool-call/tool-return
pairs are never split across the cut.

This module is intentionally dependency-free with respect to
``pydantic-ai-summarization`` and ``pydantic-ai-harness``: it reimplements the
minimal token-estimation, safe-cutoff, and summarization logic needed here.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    SystemPromptPart,
    TextPart,
    ThinkingPart,
    ToolCallPart,
    ToolReturnPart,
    UserPromptPart,
)

if TYPE_CHECKING:
    from pydantic_ai.models import Model, ModelRequestContext

logger = logging.getLogger(__name__)

_CHARS_PER_TOKEN = 4
"""Rough approximation: ~4 characters per token on average."""

_TOOL_PAIR_SEARCH_RANGE = 5
"""Messages to inspect around a cut when checking for orphaned tool pairs."""

_SUMMARY_PREFIX = "Summary of previous conversation:\n\n"
"""Marker prefixing a compaction summary so later passes can extend it."""

DEFAULT_SUMMARY_PROMPT = """\
You are a context summarization assistant. The conversation below will be \
replaced by your summary, so it must carry everything needed to continue the \
task.

Write the summary under these exact section headings, omitting a section only \
if it has no content:

## Intent
The user's overall goal and any standing constraints or preferences.

## Key decisions
Choices made and the reasoning, so they are not relitigated.

## Artifacts
Files, paths, identifiers, commands, and APIs touched -- quote exact names.

## Current state
What is done and what is in progress right now.

## Next steps
The immediate actions still required to finish the task.

## Open questions
Unresolved questions or blockers.

Focus on results, not a replay of completed actions. Respond ONLY with the \
summary -- no preamble, no markdown fences.

<messages>
{messages}
</messages>\
"""


# ---------------------------------------------------------------------------
# Token estimation
# ---------------------------------------------------------------------------


def _user_prompt_text(part: UserPromptPart) -> str:
    """Extract text content from a user prompt part."""
    if isinstance(part.content, str):
        return part.content
    texts: list[str] = []
    for item in part.content:
        if isinstance(item, str):
            texts.append(item)
        else:
            text = getattr(item, "content", None)
            if isinstance(text, str):
                texts.append(text)
    return " ".join(texts)


def _collect_text(messages: Sequence[ModelMessage]) -> list[str]:
    """Collect every text segment the provider would be sent for these messages."""
    segments: list[str] = []
    for msg in messages:
        if isinstance(msg, ModelRequest):
            for part in msg.parts:
                if isinstance(part, UserPromptPart):
                    segments.append(_user_prompt_text(part))
                elif isinstance(part, SystemPromptPart):
                    segments.append(part.content)
                else:
                    segments.append(str(getattr(part, "content", "")))
        elif isinstance(msg, ModelResponse):
            for part in msg.parts:
                if isinstance(part, TextPart):
                    segments.append(part.content)
                elif isinstance(part, ToolCallPart):
                    segments.append(part.tool_name)
                    segments.append(str(part.args))
                elif isinstance(part, ThinkingPart):
                    segments.append(part.content or "")
    return segments


def estimate_token_count(
    messages: Sequence[ModelMessage],
    tokenizer: Callable[[str], int] | None = None,
) -> int:
    """Approximate the token count for a sequence of messages.

    Uses ``tokenizer`` when given, otherwise a ~4 characters-per-token heuristic.
    """
    segments = _collect_text(messages)
    if tokenizer is not None:
        return sum(tokenizer(s) for s in segments)
    return sum(len(s) for s in segments) // _CHARS_PER_TOKEN


# ---------------------------------------------------------------------------
# Safe cutoff logic (preserves tool-call / tool-return pairs)
# ---------------------------------------------------------------------------


def _is_safe_cutoff(messages: list[ModelMessage], cutoff: int) -> bool:
    """Return True if cutting at ``cutoff`` does not orphan a tool-call pair."""
    if cutoff >= len(messages):
        return True

    start = max(0, cutoff - _TOOL_PAIR_SEARCH_RANGE)
    end = min(len(messages), cutoff + _TOOL_PAIR_SEARCH_RANGE)

    for i in range(start, end):
        msg = messages[i]
        if not isinstance(msg, ModelResponse):
            continue
        call_ids = {
            part.tool_call_id
            for part in msg.parts
            if isinstance(part, ToolCallPart) and part.tool_call_id
        }
        if not call_ids:
            continue
        for j in range(i + 1, len(messages)):
            later = messages[j]
            if not isinstance(later, ModelRequest):
                continue
            for rpart in later.parts:
                if (
                    isinstance(rpart, ToolReturnPart)
                    and rpart.tool_call_id in call_ids
                    and (i < cutoff) != (j < cutoff)
                ):
                    return False
    return True


def find_token_cutoff(
    messages: list[ModelMessage],
    target_tokens: int,
    tokenizer: Callable[[str], int] | None = None,
) -> int:
    """Cutoff index such that ``messages[cutoff:]`` fits in ``target_tokens``.

    Returns 0 when the whole history already fits. The result is adjusted
    backward so no tool-call pair is split.
    """
    if not messages or estimate_token_count(messages, tokenizer) <= target_tokens:
        return 0

    lo, hi = 0, len(messages)
    candidate = len(messages)
    while lo < hi:
        mid = (lo + hi) // 2
        if estimate_token_count(messages[mid:], tokenizer) <= target_tokens:
            candidate = mid
            hi = mid
        else:
            lo = mid + 1

    if candidate >= len(messages):
        candidate = max(0, len(messages) - 1)

    for idx in range(candidate, -1, -1):
        if _is_safe_cutoff(messages, idx):
            return idx
    return 0


def _extract_system_prompts(messages: list[ModelMessage]) -> list[SystemPromptPart]:
    """Collect the leading system-prompt parts from the conversation."""
    parts: list[SystemPromptPart] = []
    for msg in messages:
        if not isinstance(msg, ModelRequest):
            break
        for part in msg.parts:
            if isinstance(part, SystemPromptPart):
                parts.append(part)
            else:
                return parts
    return parts


def _extract_previous_summary(messages: list[ModelMessage]) -> str | None:
    """Return the text of a prior compaction summary, if one is present."""
    for msg in messages:
        if not isinstance(msg, ModelRequest):
            continue
        for part in msg.parts:
            if isinstance(part, SystemPromptPart) and part.content.startswith(
                _SUMMARY_PREFIX
            ):
                return part.content[len(_SUMMARY_PREFIX) :]
    return None


def _find_first_user_message(messages: list[ModelMessage]) -> ModelRequest | None:
    """Return the first request carrying a user prompt, or None."""
    for msg in messages:
        if isinstance(msg, ModelRequest) and any(
            isinstance(p, UserPromptPart) for p in msg.parts
        ):
            return msg
    return None


def _format_messages(messages: Sequence[ModelMessage]) -> str:
    """Render messages into a human-readable transcript for summarization."""
    lines: list[str] = []
    for msg in messages:
        if isinstance(msg, ModelRequest):
            for part in msg.parts:
                if isinstance(part, UserPromptPart):
                    lines.append(f"User: {_user_prompt_text(part)}")
                elif isinstance(part, SystemPromptPart):
                    lines.append(f"System: {part.content}")
                elif isinstance(part, ToolReturnPart):
                    content = str(part.content)
                    if len(content) > 500:
                        content = content[:500] + "..."
                    lines.append(f"Tool [{part.tool_name}]: {content}")
        elif isinstance(msg, ModelResponse):
            for part in msg.parts:
                if isinstance(part, TextPart):
                    lines.append(f"Assistant: {part.content}")
                elif isinstance(part, ToolCallPart):
                    lines.append(f"Tool Call [{part.tool_name}]: {part.args}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Capability
# ---------------------------------------------------------------------------


@dataclass
class CompactionCapability(AbstractCapability[Any]):
    """Summarize old history so the input stays under the model's token budget.

    Parameters
    ----------
    max_tokens : int | None
        Token ceiling for the history (typically the model's ``tokens_limit``).
        When ``None``, the budget is resolved per request from the model spec
        via ``request_context.model_id``; if that also fails the capability is a
        no-op.
    trigger_fraction : float
        Compaction runs when the estimated history exceeds this fraction of the
        budget.
    keep_fraction : float
        After compaction the preserved tail targets this fraction of the budget.
    keep_messages : int
        Minimum number of tail messages to preserve regardless of token math.
    min_messages : int
        Never compact a history shorter than this.
    model : str | Model | None
        Model used to generate summaries. Defaults to the request's model.
    summary_prompt : str
        Prompt template; must contain a ``{messages}`` placeholder.
    tokenizer : Callable[[str], int] | None
        Optional exact token counter; defaults to a ~4 chars/token heuristic.
    preserve_first_user_message : bool
        Keep the first user prompt after compaction (task anchoring).
    incremental : bool
        Feed any prior summary into the next summarization so it is extended
        rather than regenerated.
    """

    max_tokens: int | None = None
    trigger_fraction: float = 0.85
    keep_fraction: float = 0.5
    keep_messages: int = 20
    min_messages: int = 4
    model: str | Model | None = None
    summary_prompt: str = DEFAULT_SUMMARY_PROMPT
    tokenizer: Callable[[str], int] | None = None
    preserve_first_user_message: bool = True
    incremental: bool = True
    agent_id: str | None = None
    _compaction_count: int = field(default=0, init=False, repr=False)

    @classmethod
    def get_serialization_name(cls) -> str:
        return "CompactionCapability"

    def __post_init__(self) -> None:
        if not 0 < self.trigger_fraction <= 1:
            raise ValueError("trigger_fraction must be in (0, 1].")
        if not 0 < self.keep_fraction < 1:
            raise ValueError("keep_fraction must be in (0, 1).")
        if self.keep_fraction >= self.trigger_fraction:
            raise ValueError("keep_fraction must be below trigger_fraction.")
        if self.keep_messages < 0:
            raise ValueError("keep_messages must be non-negative.")
        if self.max_tokens is not None and self.max_tokens < 1:
            raise ValueError("max_tokens must be positive.")

    @property
    def compaction_count(self) -> int:
        """Number of times history was actually compacted."""
        return self._compaction_count

    def _resolve_budget(self, request_context: ModelRequestContext) -> int | None:
        """Token budget for this request, or None when it cannot be resolved."""
        if self.max_tokens is not None:
            return self.max_tokens
        model_id = getattr(request_context, "model_id", None)
        if not model_id:
            return None
        from ..specs.models import get_model

        spec = get_model(str(model_id))
        tokens_limit = getattr(spec, "tokens_limit", None) if spec is not None else None
        if tokens_limit:
            return int(tokens_limit)
        return None

    async def before_model_request(
        self,
        ctx: RunContext[Any],
        request_context: ModelRequestContext,
    ) -> ModelRequestContext:
        """Compact older history when it exceeds the trigger threshold."""
        budget = self._resolve_budget(request_context)
        if budget is None:
            return request_context

        messages: list[ModelMessage] = list(request_context.messages)
        if len(messages) <= self.min_messages:
            return request_context

        tokens = estimate_token_count(messages, self.tokenizer)
        if tokens <= int(budget * self.trigger_fraction):
            return request_context

        started = time.monotonic()
        before_messages = len(messages)
        self._emit_compaction_event(
            "start",
            budget=budget,
            beforeTokens=tokens,
            beforeMessages=before_messages,
        )
        compacted = await self._compact(messages, ctx, budget)
        reduced = compacted is not messages and len(compacted) < len(messages)
        if reduced:
            self._compaction_count += 1
            request_context.messages = compacted
        after_tokens = (
            estimate_token_count(compacted, self.tokenizer) if reduced else tokens
        )
        self._emit_compaction_event(
            "end",
            budget=budget,
            beforeTokens=tokens,
            afterTokens=after_tokens,
            beforeMessages=before_messages,
            afterMessages=len(compacted) if reduced else before_messages,
            durationMs=round((time.monotonic() - started) * 1000, 1),
            compactionCount=self._compaction_count,
            reduced=reduced,
        )
        return request_context

    async def _compact(
        self,
        messages: list[ModelMessage],
        ctx: RunContext[Any],
        budget: int,
    ) -> list[ModelMessage]:
        """Replace older messages with a summary, preserving the recent tail."""
        keep_target = max(1, int(budget * self.keep_fraction))
        cutoff = find_token_cutoff(messages, keep_target, self.tokenizer)

        # Honor keep_messages as a floor on preserved tail length.
        if self.keep_messages:
            floor_cutoff = max(0, len(messages) - self.keep_messages)
            cutoff = min(cutoff, floor_cutoff)
            while cutoff > 0 and not _is_safe_cutoff(messages, cutoff):
                cutoff -= 1

        if cutoff <= 0:
            return messages

        system_parts = _extract_system_prompts(messages)
        to_summarize = messages[:cutoff]
        preserved = messages[cutoff:]

        previous_summary = (
            _extract_previous_summary(messages) if self.incremental else None
        )
        try:
            summary = await self._summarize(to_summarize, ctx, previous_summary)
        except Exception:
            logger.exception("Compaction summary generation failed; keeping history")
            return messages

        summary_part = SystemPromptPart(content=f"{_SUMMARY_PREFIX}{summary}")
        summary_message = ModelRequest(parts=[*system_parts, summary_part])

        first_user: list[ModelMessage] = []
        if self.preserve_first_user_message:
            first = _find_first_user_message(messages)
            if first is not None:
                idx = messages.index(first)
                if idx < cutoff and first not in preserved:
                    first_user = [first]

        return [summary_message, *first_user, *preserved]

    def _emit_compaction_event(self, phase: str, **payload: Any) -> None:
        """Publish a compaction activity event on the agent's monitoring stream.

        Failures are swallowed: streaming telemetry must never break the run.
        """
        agent_id = self.agent_id
        if not agent_id:
            return
        try:
            from ..streams import AgentStreamMessage, enqueue_stream_message

            message = AgentStreamMessage.create(
                type="agent.compaction",
                payload={"phase": phase, **payload},
                agent_id=agent_id,
            )
            enqueue_stream_message(agent_id, message)
        except Exception:  # noqa: BLE001 - telemetry must not break the run
            logger.debug("Failed to emit compaction event", exc_info=True)

    async def _summarize(
        self,
        messages: list[ModelMessage],
        ctx: RunContext[Any],
        previous_summary: str | None,
    ) -> str:
        """Generate a summary of ``messages`` using the configured model."""
        formatted = _format_messages(messages)
        prompt = self.summary_prompt.format(messages=formatted)
        if previous_summary is not None:
            prompt = (
                f"{prompt}\n\n<previous_summary>\n"
                f"{previous_summary}\n</previous_summary>"
            )

        model = self.model if self.model is not None else ctx.model
        agent: Agent[None, str] = Agent(
            model,
            instructions=(
                "You are a context summarization assistant. Extract the most "
                "important information from conversations."
            ),
        )
        result = await agent.run(prompt, usage=ctx.usage)
        return result.output.strip()


def build_compaction_capability(
    model_id: str | None,
    *,
    summarizer_model: str | Model | None = None,
    trigger_fraction: float = 0.85,
    keep_fraction: float = 0.5,
    keep_messages: int = 20,
    max_tokens_override: int | None = None,
    agent_id: str | None = None,
) -> CompactionCapability | None:
    """Build a ``CompactionCapability`` budgeted from a model spec's ``tokens_limit``.

    Returns ``None`` when ``model_id`` has no resolvable ``tokens_limit`` so the
    caller can skip adding a no-op capability. ``summarizer_model`` defaults to
    the run's own model when left as ``None``.

    ``max_tokens_override`` caps the history budget below the model's
    ``tokens_limit`` (never above it) so a smaller ceiling can be exercised on
    demand; when set, the tail-message floor is lowered so the token budget --
    rather than the message count -- governs when compaction runs. ``agent_id``
    links emitted compaction events to the runtime's monitoring stream.
    """
    if not model_id:
        return None
    from ..specs.models import get_model

    spec = get_model(model_id)
    tokens_limit = getattr(spec, "tokens_limit", None) if spec is not None else None
    if not tokens_limit:
        return None

    budget = int(tokens_limit)
    effective_keep_messages = keep_messages
    min_messages = 4
    if max_tokens_override is not None:
        budget = max(1, min(int(max_tokens_override), budget))
        # Let the token budget drive compaction instead of the message floor.
        effective_keep_messages = min(keep_messages, 2)
        min_messages = 2

    return CompactionCapability(
        max_tokens=budget,
        trigger_fraction=trigger_fraction,
        keep_fraction=keep_fraction,
        keep_messages=effective_keep_messages,
        min_messages=min_messages,
        model=summarizer_model,
        agent_id=agent_id,
    )
