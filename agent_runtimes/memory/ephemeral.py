# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Ephemeral (in-memory) memory backend.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseMemoryBackend

logger = logging.getLogger(__name__)


class EphemeralMemory(BaseMemoryBackend):
    """In-memory dict-based memory (non-persistent).

    Suitable for development and testing. Data is lost when the
    process restarts. For persistent memory, use ``Mem0Backend``.
    """

    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []

    async def add(
        self,
        messages: list[dict],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Store messages in memory."""
        for msg in messages:
            entry = {
                "content": msg.get("content", ""),
                "role": msg.get("role", "user"),
                "metadata": metadata or {},
            }
            self._entries.append(entry)
        logger.debug("Added %d messages to ephemeral memory", len(messages))

    async def search(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Simple substring search over stored entries."""
        query_lower = query.lower()
        scored = []
        for entry in self._entries:
            content = entry.get("content", "")
            if query_lower in content.lower():
                scored.append({"content": content, "score": 1.0, **entry})
        # Return most recent matches first, capped at limit
        return scored[-limit:]

    async def close(self) -> None:
        """Clear memory."""
        self._entries.clear()
