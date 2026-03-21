# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Base class for memory backends.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseMemoryBackend(ABC):
    """Abstract memory backend.

    Memory backends provide persistent context for agents across
    conversations. They support adding memories, searching them,
    and auto-capturing conversation context.
    """

    @abstractmethod
    async def add(
        self,
        messages: list[dict],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Add messages to memory.

        Parameters
        ----------
        messages : list[dict]
            Conversation messages (``{"role": ..., "content": ...}``).
        metadata : dict | None
            Optional metadata (topic, tools used, outcome, etc.).
        """
        ...

    @abstractmethod
    async def search(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search memory for relevant entries.

        Parameters
        ----------
        query : str
            Search query text.
        limit : int
            Maximum number of results to return.

        Returns
        -------
        list[dict]
            Matching memory entries with ``content`` and ``score`` keys.
        """
        ...

    async def get_relevant_context(self, query: str, max_tokens: int = 2000) -> str:
        """Get relevant memory context for system prompt injection.

        Parameters
        ----------
        query : str
            The current user message or task description.
        max_tokens : int
            Approximate maximum tokens for the returned context.

        Returns
        -------
        str
            Formatted memory context for injection into the system prompt.
        """
        results = await self.search(query, limit=5)
        if not results:
            return ""

        lines = ["## Relevant memories from previous interactions:"]
        for entry in results:
            content = entry.get("content", entry.get("memory", ""))
            if content:
                lines.append(f"- {content}")

        return "\n".join(lines)

    async def close(self) -> None:
        """Close the memory backend and release resources."""
        pass
