# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Mem0 memory backend integration.

Provides long-term memory for agents using the Mem0 framework.
Mem0 supports vector search, auto-deduplication, and multi-user isolation.

Requires ``mem0ai`` package: ``pip install mem0ai``
"""

from __future__ import annotations

import asyncio
import copy
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Union

from .base import BaseMemoryBackend

logger = logging.getLogger(__name__)


class Mem0Backend(BaseMemoryBackend):
    """Memory backend powered by Mem0.

    Stored memories are keyed by the composite ``(user_id, agent_id)``: the
    user (personal account) is the ownership boundary that memories never
    cross, and the agent uid namespaces memories per agent within that user.

    Parameters
    ----------
    user_id : str
        Effective user identifier (personal account). It is the trusted
        ownership boundary for stored memories (derived from the runtime
        environment, never from the caller) and forms the persistence key
        together with ``agent_id``.
    config : dict | Callable[[], dict | None] | None
        Mem0 configuration (vector store, embedding model, etc.), or what
        reads it at each use: mem0 is built again when it changes (a
        runtime's token is given after it starts, and renewed). If None,
        uses Mem0 defaults.
    agent_id : str | None
        Agent id. Combined with ``user_id`` as the persistence key so each
        agent has its own memory namespace within the user's account. It is
        the agent's own (its agentspec's id), never the runtime's: a new
        runtime for the same agent and user reads the same memories.
    infer : bool
        Whether mem0 asks its LLM to extract facts from what is added. Off
        where the model already chose the fact (its ``remember`` tool) and
        mem0's LLM is not one to ask (through ai-inference).
    """

    def __init__(
        self,
        user_id: str,
        config: Union[dict[str, Any], Callable[[], dict[str, Any] | None], None] = None,
        agent_id: str | None = None,
        infer: bool = True,
    ):
        self.user_id = user_id
        self.agent_id = agent_id
        self.infer = infer
        self._memory: Any = None
        self._config = config
        self._built_with: dict[str, Any] | None = None

    def _current_config(self) -> dict[str, Any] | None:
        """The configuration mem0 is to run with now."""
        return self._config() if callable(self._config) else self._config

    def _ensure_initialized(self) -> Any:
        """Lazily init Mem0 on first use, and again when its config changed."""
        config = self._current_config()
        if self._memory is not None and config == self._built_with:
            return self._memory
        try:
            from mem0 import Memory
        except ImportError as error:
            raise ImportError(
                "Mem0 memory backend requires 'mem0ai'. "
                "Install with: pip install mem0ai"
            ) from error
        # Kept as it was given: mem0 may change what it is handed. A package the
        # configured store or embedder needs and lacks says its own name here,
        # never "requires mem0ai".
        built_with = copy.deepcopy(config)
        if config:
            self._memory = Memory.from_config(config)
        else:
            self._memory = Memory()
        self._built_with = built_with
        logger.info(
            "Mem0 memory initialized for user=%s, agent=%s",
            self.user_id,
            self.agent_id,
        )
        return self._memory

    def _scope(self) -> dict[str, Any]:
        """The memories this backend reads and writes: its user's, of its agent."""
        scope: dict[str, Any] = {"user_id": self.user_id}
        if self.agent_id:
            scope["agent_id"] = self.agent_id
        return scope

    async def add(
        self,
        messages: list[dict],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Add messages to Mem0 memory."""
        memory = self._ensure_initialized()
        scoped_metadata: dict[str, Any] = dict(metadata or {})
        scoped_metadata.setdefault("scope", "agent" if self.agent_id else "user")
        await asyncio.to_thread(
            memory.add,
            messages,
            metadata=scoped_metadata,
            infer=self.infer,
            **self._scope(),
        )
        logger.debug("Added %d messages to Mem0 (user=%s)", len(messages), self.user_id)

    async def search(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Search Mem0 memory for relevant entries.

        Mem0 2.x takes who the memories are of as ``filters``, never as
        arguments of their own: it refuses ``user_id`` and ``agent_id`` there.
        """
        memory = self._ensure_initialized()
        results = await asyncio.to_thread(
            memory.search, query, top_k=limit, filters=self._scope()
        )
        return [_normalized(item) for item in _results_of(results)]

    async def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        """Every memory of the user and agent, newest first, up to ``limit``."""
        memory = self._ensure_initialized()
        results = await asyncio.to_thread(
            memory.get_all, filters=self._scope(), top_k=limit
        )
        listed = [_normalized(item) for item in _results_of(results)]
        return sorted(listed, key=lambda entry: entry["created_at"] or "", reverse=True)

    async def forget(self, memory_id: str) -> bool:
        """Delete one memory of the user and agent; False when it is not theirs.

        Somebody else's memory, or another agent's, is not found rather than
        deleted: the id alone never reaches across the scope.
        """
        memory = self._ensure_initialized()
        found = await asyncio.to_thread(memory.get, memory_id)
        if not isinstance(found, dict) or any(
            found.get(key) != value for key, value in self._scope().items()
        ):
            return False
        await asyncio.to_thread(memory.delete, memory_id)
        return True

    async def correct(
        self, memory_id: str, text: str, corrected_by: str
    ) -> dict[str, Any] | None:
        """Correct one memory of the user and agent in its words; None when it is not theirs.

        mem0 updates it — its words, their embedding and the entities they
        name — keeping what else it was kept with, and the correction is
        kept beside it: who made it and when (``corrected_by``,
        ``corrected_at``). Somebody else's, or another agent's, is not found.
        """
        memory = self._ensure_initialized()
        found = await asyncio.to_thread(memory.get, memory_id)
        if not isinstance(found, dict) or any(
            found.get(key) != value for key, value in self._scope().items()
        ):
            return None
        metadata = {
            **(found.get("metadata") or {}),
            "corrected_by": corrected_by,
            "corrected_at": datetime.now(timezone.utc).isoformat(),
        }
        await asyncio.to_thread(memory.update, memory_id, text, metadata=metadata)
        return _normalized(await asyncio.to_thread(memory.get, memory_id))

    async def forget_all(self, batch: int = 500) -> int:
        """Delete every memory of the user and agent; answers how many."""
        memory = self._ensure_initialized()
        forgotten = 0
        while True:
            results = await asyncio.to_thread(
                memory.get_all, filters=self._scope(), top_k=batch
            )
            ids = [
                str(item.get("id")) for item in _results_of(results) if item.get("id")
            ]
            if not ids:
                return forgotten
            for memory_id in ids:
                await asyncio.to_thread(memory.delete, memory_id)
            forgotten += len(ids)

    async def close(self) -> None:
        """Release Mem0 resources."""
        self._memory = None
        self._built_with = None


def _results_of(results: Any) -> list[dict[str, Any]]:
    """Read mem0's answer as a list of its items."""
    if isinstance(results, dict):
        results = results.get("results", [])
    return [item for item in results or [] if isinstance(item, dict)]


def _normalized(item: dict[str, Any]) -> dict[str, Any]:
    """Answer one memory as every backend does, with when it was learned."""
    return {
        "id": str(item.get("id") or ""),
        "content": item.get("memory", item.get("content", "")),
        "score": item.get("score") or 0.0,
        "metadata": item.get("metadata") or {},
        "created_at": item.get("created_at"),
        "updated_at": item.get("updated_at"),
    }
