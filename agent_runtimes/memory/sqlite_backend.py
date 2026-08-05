# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
SQLite memory backend.

Durable, self-contained conversational memory persisted to a local SQLite
database. Unlike ``Mem0Backend`` it requires no embedding model, vector store,
or LLM API key, so it works fully offline — ideal for local examples and
development. Retrieval uses case-insensitive substring matching over stored
content.

Memories are keyed by the composite ``(user_id, agent_id)``: the user is the
ownership boundary that memories never cross, and the agent uid namespaces
memories per agent within that user.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from .base import BaseMemoryBackend

logger = logging.getLogger(__name__)


def _resolve_db_path(
    user_id: str,
    agent_id: str | None,
    config: dict[str, Any] | None,
) -> str:
    """Resolve the SQLite database path (explicit config/env win)."""
    path: str | None = None
    if isinstance(config, dict):
        configured = config.get("path")
        if isinstance(configured, str) and configured.strip():
            path = configured.strip()

    if path is None:
        configured_env = os.environ.get(
            "AGENT_RUNTIMES_MEMORY_SQLITE_PATH", ""
        ).strip()
        if configured_env:
            path = configured_env

    if path is None:
        base_dir = os.environ.get(
            "AGENT_RUNTIMES_MEMORY_DIR", "/tmp/agent-runtimes-memory"
        )
        path = str(Path(base_dir) / "memory.db")

    # Ensure the parent directory exists regardless of the path source.
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    return path



class SqliteMemory(BaseMemoryBackend):
    """Durable memory backed by a local SQLite database.

    Parameters
    ----------
    user_id : str
        Effective user identifier (personal account); the ownership boundary.
    agent_id : str | None
        Agent uid; namespaces memories per agent within the user's account.
    config : dict | None
        Optional configuration. Supported keys: ``path`` (database file path).
    """

    def __init__(
        self,
        user_id: str = "default",
        agent_id: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> None:
        self.user_id = user_id
        self.agent_id = agent_id
        self._path = _resolve_db_path(user_id, agent_id, config)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()
        logger.info(
            "SQLite memory initialized at %s for user=%s, agent=%s",
            self._path,
            self.user_id,
            self.agent_id,
        )

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL,
                    agent_id TEXT,
                    role TEXT,
                    content TEXT NOT NULL,
                    metadata TEXT,
                    created_at REAL NOT NULL
                )
                """
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS memories_scope_idx
                ON memories (user_id, agent_id)
                """
            )
            self._conn.commit()

    def _agent_match(self) -> tuple[str, list[Any]]:
        """Build the agent scope predicate (NULL-safe)."""
        if self.agent_id is None:
            return "agent_id IS NULL", []
        return "agent_id = ?", [self.agent_id]

    async def add(
        self,
        messages: list[dict],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Persist messages to the SQLite database."""
        meta_json = json.dumps(metadata or {})
        now = time.time()
        rows = [
            (
                self.user_id,
                self.agent_id,
                msg.get("role", "user"),
                str(msg.get("content", "")),
                meta_json,
                now,
            )
            for msg in messages
            if str(msg.get("content", "")).strip()
        ]
        if not rows:
            return
        with self._lock:
            self._conn.executemany(
                """
                INSERT INTO memories
                    (user_id, agent_id, role, content, metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                rows,
            )
            self._conn.commit()
        logger.debug("Added %d messages to SQLite memory", len(rows))

    def _row_to_entry(self, row: sqlite3.Row) -> dict[str, Any]:
        try:
            metadata = json.loads(row["metadata"]) if row["metadata"] else {}
        except (TypeError, ValueError):
            metadata = {}
        return {
            "id": str(row["id"]),
            "content": row["content"],
            "role": row["role"],
            "user_id": row["user_id"],
            "agent_id": row["agent_id"],
            "metadata": metadata,
        }

    async def search(
        self,
        query: str,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """Token-based, case-insensitive search over stored content.

        The query is split into words and a memory matches when it contains any
        of them; results are ranked by how many query words they contain. This
        is more forgiving than whole-phrase matching (for example ``midnight
        blue`` still matches a stored ``favourite colour is midnight blue``).
        """
        query = query.strip()
        if not query:
            return []
        tokens = [t for t in query.lower().split() if t]
        if not tokens:
            return []
        agent_pred, agent_params = self._agent_match()
        # Over-fetch candidates matching any token, then rank in Python.
        like_clause = " OR ".join("content LIKE ? COLLATE NOCASE" for _ in tokens)
        like_params = [f"%{token}%" for token in tokens]
        with self._lock:
            cursor = self._conn.execute(
                f"""
                SELECT * FROM memories
                WHERE user_id = ? AND {agent_pred} AND ({like_clause})
                ORDER BY created_at DESC
                """,
                [self.user_id, *agent_params, *like_params],
            )
            rows = cursor.fetchall()

        scored: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            content_lower = (row["content"] or "").lower()
            matched = sum(1 for token in tokens if token in content_lower)
            if matched == 0:
                continue
            score = matched / len(tokens)
            scored.append((score, {**self._row_to_entry(row), "score": score}))
        # Highest overlap first; ties keep the recency order from the query.
        scored.sort(key=lambda item: item[0], reverse=True)
        return [entry for _, entry in scored[:limit]]


    async def list_all(self, limit: int = 50) -> list[dict[str, Any]]:
        """Return the most recent stored entries for this user/agent."""
        agent_pred, agent_params = self._agent_match()
        with self._lock:
            cursor = self._conn.execute(
                f"""
                SELECT * FROM memories
                WHERE user_id = ? AND {agent_pred}
                ORDER BY created_at DESC
                LIMIT ?
                """,
                [self.user_id, *agent_params, limit],
            )
            rows = cursor.fetchall()
        return [self._row_to_entry(row) for row in rows]

    async def close(self) -> None:
        """Close the database connection."""
        with self._lock:
            self._conn.close()
