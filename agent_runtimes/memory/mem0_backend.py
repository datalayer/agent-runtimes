# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Mem0 memory backend integration.

Provides long-term memory for agents using the Mem0 framework.
Mem0 supports vector search, auto-deduplication, and multi-user isolation.

Requires ``mem0ai`` package: ``pip install mem0ai``
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseMemoryBackend

logger = logging.getLogger(__name__)


class Mem0Backend(BaseMemoryBackend):
    """Memory backend powered by Mem0.

    Parameters
    ----------
    user_id : str
        User identifier for memory isolation.
    config : dict | None
        Mem0 configuration (vector store, embedding model, etc.).
        If None, uses Mem0 defaults.
    agent_id : str | None
        Optional agent identifier for agent-specific memories.
    """

    def __init__(
        self,
        user_id: str,
        config: dict[str, Any] | None = None,
        agent_id: str | None = None,
    ):
        self.user_id = user_id
        self.agent_id = agent_id
        self._memory = None
        self._config = config

    def _ensure_initialized(self) -> Any:
        """Lazily init Mem0 on first use."""
        if self._memory is not None:
            return self._memory
        try:
            from mem0 import Memory

            if self._config:
                self._memory = Memory.from_config(self._config)
            else:
                self._memory = Memory()
            logger.info(
                "Mem0 memory initialized for user=%s, agent=%s",
                self.user_id,
                self.agent_id,
            )
            return self._memory
        except ImportError:
            raise ImportError(
                "Mem0 memory backend requires 'mem0ai'. "
                "Install with: pip install mem0ai"
            )

    async def add(
        self,
        messages: list[dict],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Add messages to Mem0 memory."""
        memory = self._ensure_initialized()
        try:
            kwargs: dict[str, Any] = {"user_id": self.user_id}
            if self.agent_id:
                kwargs["agent_id"] = self.agent_id
            if metadata:
                kwargs["metadata"] = metadata
            memory.add(messages, **kwargs)
            logger.debug(
                "Added %d messages to Mem0 (user=%s)", len(messages), self.user_id
            )
        except Exception as exc:
            logger.error("Mem0 add failed: %s", exc)

    async def search(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search Mem0 memory for relevant entries."""
        memory = self._ensure_initialized()
        try:
            kwargs: dict[str, Any] = {"user_id": self.user_id, "limit": limit}
            if self.agent_id:
                kwargs["agent_id"] = self.agent_id
            results = memory.search(query, **kwargs)
            # Normalize results to list of dicts with 'content' and 'score'
            normalized = []
            if isinstance(results, dict) and "results" in results:
                results = results["results"]
            for item in results:
                if isinstance(item, dict):
                    normalized.append(
                        {
                            "content": item.get("memory", item.get("content", "")),
                            "score": item.get("score", 0.0),
                            "id": item.get("id", ""),
                            "metadata": item.get("metadata", {}),
                        }
                    )
            return normalized
        except Exception as exc:
            logger.error("Mem0 search failed: %s", exc)
            return []

    async def close(self) -> None:
        """Release Mem0 resources."""
        self._memory = None
