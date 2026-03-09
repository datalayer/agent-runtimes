# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
History archive — persists the full conversation history for search.

The full conversation history (before compression) is continuously
saved to a JSON file. A ``search_conversation_history`` tool allows
the agent to look up specific details from compressed messages.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DEFAULT_ARCHIVE_PATH = "/tmp/agent-history/conversation.jsonl"


class HistoryArchive:
    """Persist and search the full conversation history.

    Parameters
    ----------
    archive_path : str
        Path to the JSONL archive file.
    """

    def __init__(self, archive_path: str = _DEFAULT_ARCHIVE_PATH):
        self.archive_path = archive_path
        os.makedirs(os.path.dirname(archive_path), exist_ok=True)

    def append(self, message: dict[str, Any]) -> None:
        """Append a message to the archive."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **message,
        }
        with open(self.archive_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str) + "\n")

    def append_many(self, messages: list[dict[str, Any]]) -> None:
        """Append multiple messages to the archive."""
        for msg in messages:
            self.append(msg)

    def search(self, query: str, max_results: int = 10) -> list[dict[str, Any]]:
        """Search the archive for messages matching the query.

        Uses simple case-insensitive substring matching.

        Parameters
        ----------
        query : str
            Search text.
        max_results : int
            Maximum number of results.

        Returns
        -------
        list[dict]
            Matching archived messages (most recent first).
        """
        if not os.path.exists(self.archive_path):
            return []

        query_lower = query.lower()
        matches: list[dict[str, Any]] = []

        with open(self.archive_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    content = str(entry.get("content", ""))
                    if query_lower in content.lower():
                        matches.append(entry)
                except json.JSONDecodeError:
                    continue

        # Return most recent matches first, capped at max_results
        return matches[-max_results:][::-1]

    def get_total_messages(self) -> int:
        """Return the total number of archived messages."""
        if not os.path.exists(self.archive_path):
            return 0
        with open(self.archive_path, "r", encoding="utf-8") as f:
            return sum(1 for line in f if line.strip())


def search_conversation_history_tool_fn(
    archive: HistoryArchive,
) -> dict:
    """Create a tool definition for the agent to search conversation history.

    Returns a dict with ``name``, ``description``, ``parameters`` and ``handler``
    suitable for registration as a PydanticAI tool.
    """

    async def handler(query: str, max_results: int = 10) -> str:
        """Search through the full conversation history, including messages
        that were compressed away to save context space.

        When to use:
        - Need exact details from earlier in the conversation
        - Summary doesn't have enough detail for the current task
        - Need specific code, file paths, or decisions from before compression
        """
        results = archive.search(query, max_results)
        if not results:
            return "No matching messages found in conversation history."

        lines = [f"Found {len(results)} matching messages:"]
        for entry in results:
            ts = entry.get("timestamp", "")
            role = entry.get("role", "")
            content = str(entry.get("content", ""))[:500]
            lines.append(f"\n[{ts}] ({role}): {content}")
        return "\n".join(lines)

    return {
        "name": "search_conversation_history",
        "description": (
            "Search through the full conversation history, including messages "
            "that were compressed away to save context space."
        ),
        "handler": handler,
    }
