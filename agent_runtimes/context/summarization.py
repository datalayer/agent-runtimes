# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Automatic conversation summarization.

When the conversation approaches the model's token limit, older messages
are compressed into a concise summary using a dedicated (cheaper)
summarization model. The summary replaces the compressed messages,
preserving essential context while freeing token budget.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Summarization prompt template
_SUMMARIZE_PROMPT = """\
You are a conversation summarizer. Summarize the following conversation \
messages into a concise summary that preserves:
- Key decisions and conclusions
- Important facts and data points
- Tool outputs and their significance
- Action items and next steps

Be concise — aim for ~20% of the original length. Preserve exact \
values, file paths, code snippets, and technical details.

Messages to summarize:
{messages}

Summary:"""


class ConversationSummarizer:
    """Summarize conversation messages to free context window space.

    Parameters
    ----------
    summarization_model : str | None
        Model to use for summarization. If None, uses a default cheap model.
    max_summary_tokens : int
        Maximum tokens for the generated summary.
    """

    def __init__(
        self,
        summarization_model: str | None = None,
        max_summary_tokens: int = 2000,
    ):
        self.model = summarization_model or "openai:gpt-4.1-mini"
        self.max_summary_tokens = max_summary_tokens
        self._summary_count = 0

    async def summarize_messages(
        self, messages: list[dict[str, Any]], num_to_compress: int
    ) -> tuple[list[dict[str, Any]], str]:
        """Summarize the oldest ``num_to_compress`` messages.

        Parameters
        ----------
        messages : list[dict]
            The full message list.
        num_to_compress : int
            Number of messages from the start to compress.

        Returns
        -------
        tuple[list[dict], str]
            (new_messages, summary_text) — messages with older ones replaced
            by a summary message, and the raw summary text.
        """
        if num_to_compress <= 0 or num_to_compress >= len(messages):
            return messages, ""

        to_compress = messages[:num_to_compress]
        remaining = messages[num_to_compress:]

        # Format messages for the summarizer
        formatted = self._format_messages(to_compress)
        summary = await self._call_summarizer(formatted)

        if not summary:
            logger.warning("Summarization returned empty result — keeping original messages")
            return messages, ""

        self._summary_count += 1
        summary_message = {
            "role": "system",
            "content": (
                f"[Conversation summary #{self._summary_count} — "
                f"{num_to_compress} messages compressed]\n\n{summary}"
            ),
        }

        logger.info(
            "Compressed %d messages into summary #%d (%d chars)",
            num_to_compress,
            self._summary_count,
            len(summary),
        )

        return [summary_message] + remaining, summary

    def _format_messages(self, messages: list[dict[str, Any]]) -> str:
        """Format messages into a text block for the summarizer."""
        lines = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if isinstance(content, list):
                # Multi-part content
                content = " ".join(
                    part.get("text", str(part))
                    for part in content
                    if isinstance(part, dict)
                )
            # Truncate very long messages for the summarizer
            if len(content) > 5000:
                content = content[:2500] + "\n...[truncated]...\n" + content[-2500:]
            lines.append(f"[{role}]: {content}")
        return "\n\n".join(lines)

    async def _call_summarizer(self, text: str) -> str:
        """Call the summarization model.

        Uses pydantic-ai Agent for the call so it benefits from the
        same model configuration and instrumentation.
        """
        try:
            from pydantic_ai import Agent as PydanticAgent

            prompt = _SUMMARIZE_PROMPT.format(messages=text)
            agent = PydanticAgent(
                self.model,
                system_prompt="You are a precise conversation summarizer.",
            )
            result = await agent.run(prompt)
            return str(result.output) if result.output else ""
        except Exception as exc:
            logger.error("Summarization call failed: %s", exc)
            # Fallback: simple truncation
            return f"[Auto-summary — LLM call failed]\n{text[:1000]}..."
