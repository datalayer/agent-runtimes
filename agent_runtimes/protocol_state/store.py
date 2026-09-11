# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Where a runtime keeps what its protocols promised (ORCHESTRATOR.md, O1-11).

An A2A task a client was given the id of, and an ACP session a client can
load again, outlive the process that served them: they are records here, not
entries of a dictionary. A restarted runtime finds the task a client polls
and the session a client loads, and runs again the work left running.

Where the records live follows the rule the memory backends already follow
(``memory/registry.py``): on Kubernetes, whose pod filesystem goes with the
pod, the shared agent-memories PostgreSQL; anywhere else, a SQLite file.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

#: The one table, in either database.
TABLE = "agent_runtime_protocol_state"

#: The SQLite file when ``AGENT_RUNTIMES_PROTOCOL_STATE_PATH`` names none.
DEFAULT_SQLITE_PATH = (
    Path.home() / ".datalayer" / "agent-runtimes" / "protocol-state.sqlite"
)


class ProtocolStateStore(ABC):
    """
    Records by kind and key: a JSON value, and when it last changed.

    Parameters are plain JSON documents, so an A2A task, an ACP session and a
    turn of its conversation are stored as they travel.
    """

    @abstractmethod
    async def put(self, kind: str, key: str, value: dict[str, Any]) -> None:
        """
        Write a record, replacing the one under the same kind and key.

        Parameters
        ----------
        kind : str
            What the record is, such as ``a2a.task``.
        key : str
            Its key within the kind.
        value : dict[str, Any]
            The record.
        """

    @abstractmethod
    async def get(self, kind: str, key: str) -> dict[str, Any] | None:
        """
        Read a record.

        Parameters
        ----------
        kind : str
            What the record is.
        key : str
            Its key within the kind.

        Returns
        -------
        dict[str, Any] | None
            The record, or ``None`` when there is none.
        """

    @abstractmethod
    async def list(self, kind: str, *, prefix: str = "") -> list[dict[str, Any]]:
        """
        Read every record of a kind whose key starts with ``prefix``.

        Parameters
        ----------
        kind : str
            What the records are.
        prefix : str
            The start of their keys; every record of the kind when empty.

        Returns
        -------
        list[dict[str, Any]]
            The records, the least recently changed first.
        """

    @abstractmethod
    async def delete(self, kind: str, key: str) -> None:
        """
        Remove a record; removing one that is not there does nothing.

        Parameters
        ----------
        kind : str
            What the record is.
        key : str
            Its key within the kind.
        """

    async def close(self) -> None:
        """Let go of what the store holds open."""
        return None


_SQLITE_TABLE = (
    f"CREATE TABLE IF NOT EXISTS {TABLE} ("
    "kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, "
    "updated_at REAL NOT NULL, PRIMARY KEY (kind, key))"
)


class SqliteProtocolStateStore(ProtocolStateStore):
    """
    The store in a SQLite file, for a runtime that is not on Kubernetes.

    A connection per call, off the event loop: two processes over one file —
    a runtime and the one that replaces it — see each other's writes, and a
    blocking write never stalls the protocols this runtime serves.

    Parameters
    ----------
    path : str | Path
        The database file; its directory is made when missing.
    """

    def __init__(self, path: str | Path) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)

    def _run(
        self, statement: str, parameters: tuple[Any, ...] = (), *, fetch: bool = False
    ) -> list[tuple[Any, ...]]:
        connection = sqlite3.connect(self._path, timeout=30)
        try:
            with connection:
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute(_SQLITE_TABLE)
                cursor = connection.execute(statement, parameters)
                return cursor.fetchall() if fetch else []
        finally:
            connection.close()

    async def put(self, kind: str, key: str, value: dict[str, Any]) -> None:
        await asyncio.to_thread(
            self._run,
            f"INSERT INTO {TABLE} (kind, key, value, updated_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(kind, key) DO UPDATE SET value = excluded.value, "
            "updated_at = excluded.updated_at",
            (kind, key, json.dumps(value, default=str), time.time()),
        )

    async def get(self, kind: str, key: str) -> dict[str, Any] | None:
        rows = await asyncio.to_thread(
            self._run,
            f"SELECT value FROM {TABLE} WHERE kind = ? AND key = ?",
            (kind, key),
            fetch=True,
        )
        return json.loads(rows[0][0]) if rows else None

    async def list(self, kind: str, *, prefix: str = "") -> list[dict[str, Any]]:
        rows = await asyncio.to_thread(
            self._run,
            f"SELECT value FROM {TABLE} WHERE kind = ? AND substr(key, 1, ?) = ? "
            "ORDER BY updated_at",
            (kind, len(prefix), prefix),
            fetch=True,
        )
        return [json.loads(row[0]) for row in rows]

    async def delete(self, kind: str, key: str) -> None:
        await asyncio.to_thread(
            self._run, f"DELETE FROM {TABLE} WHERE kind = ? AND key = ?", (kind, key)
        )


_POSTGRES_TABLE = (
    f"CREATE TABLE IF NOT EXISTS {TABLE} ("
    "kind TEXT NOT NULL, key TEXT NOT NULL, value JSONB NOT NULL, "
    "updated_at DOUBLE PRECISION NOT NULL, PRIMARY KEY (kind, key))"
)


class PostgresProtocolStateStore(ProtocolStateStore):
    """
    The store in the agent-memories PostgreSQL, for a runtime on Kubernetes.

    Parameters
    ----------
    conninfo : str
        The libpq connection string of the database.
    """

    def __init__(self, conninfo: str) -> None:
        self._conninfo = conninfo
        self._connection: Any = None
        self._lock = asyncio.Lock()

    async def _execute(
        self, statement: str, parameters: tuple[Any, ...] = (), *, fetch: bool = False
    ) -> list[tuple[Any, ...]]:
        import psycopg  # noqa: PLC0415 - only a runtime on Kubernetes connects

        async with self._lock:
            if self._connection is None or self._connection.closed:
                self._connection = await psycopg.AsyncConnection.connect(
                    self._conninfo, autocommit=True
                )
                await self._connection.execute(_POSTGRES_TABLE)
            cursor = await self._connection.execute(statement, parameters)
            return list(await cursor.fetchall()) if fetch else []

    async def put(self, kind: str, key: str, value: dict[str, Any]) -> None:
        await self._execute(
            f"INSERT INTO {TABLE} (kind, key, value, updated_at) "
            "VALUES (%s, %s, %s::jsonb, %s) ON CONFLICT (kind, key) DO UPDATE "
            "SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at",
            (kind, key, json.dumps(value, default=str), time.time()),
        )

    async def get(self, kind: str, key: str) -> dict[str, Any] | None:
        rows = await self._execute(
            f"SELECT value FROM {TABLE} WHERE kind = %s AND key = %s",
            (kind, key),
            fetch=True,
        )
        return dict(rows[0][0]) if rows else None

    async def list(self, kind: str, *, prefix: str = "") -> list[dict[str, Any]]:
        rows = await self._execute(
            f"SELECT value FROM {TABLE} WHERE kind = %s AND starts_with(key, %s) "
            "ORDER BY updated_at",
            (kind, prefix),
            fetch=True,
        )
        return [dict(row[0]) for row in rows]

    async def delete(self, kind: str, key: str) -> None:
        await self._execute(
            f"DELETE FROM {TABLE} WHERE kind = %s AND key = %s", (kind, key)
        )

    async def close(self) -> None:
        if self._connection is not None and not self._connection.closed:
            await self._connection.close()


def _agent_memories_conninfo() -> str | None:
    """
    The agent-memories PostgreSQL, as the memory backends resolve it.

    Returns
    -------
    str | None
        Its connection string, or ``None`` when it is not configured.
    """
    from psycopg.conninfo import make_conninfo  # noqa: PLC0415

    from ..memory.config import _postgres_config  # noqa: PLC0415

    config = _postgres_config()
    if config is None:
        return None
    database: dict[str, Any] = config["vector_store"]["config"]  # type: ignore[index]
    return make_conninfo(
        host=str(database["host"]),
        port=str(database["port"]),
        dbname=str(database["dbname"]),
        user=str(database["user"]),
        password=str(database["password"]),
    )


def create_protocol_state_store() -> ProtocolStateStore:
    """
    Return the store this process keeps its protocols' state in.

    Returns
    -------
    ProtocolStateStore
        The agent-memories PostgreSQL on Kubernetes when it is configured, and
        a SQLite file otherwise.
    """
    from ..memory.registry import _running_on_kubernetes  # noqa: PLC0415

    if _running_on_kubernetes():
        conninfo = _agent_memories_conninfo()
        if conninfo is not None:
            logger.info(
                "Kubernetes detected: A2A tasks and ACP sessions are kept in the "
                "agent-memories PostgreSQL"
            )
            return PostgresProtocolStateStore(conninfo)
        logger.warning(
            "Kubernetes detected but the agent-memories PostgreSQL is not "
            "configured: A2A tasks and ACP sessions are kept in a SQLite file, "
            "which does not survive the pod"
        )
    path = os.environ.get("AGENT_RUNTIMES_PROTOCOL_STATE_PATH", "").strip()
    return SqliteProtocolStateStore(path or DEFAULT_SQLITE_PATH)


_store: ProtocolStateStore | None = None


def protocol_state_store() -> ProtocolStateStore:
    """
    Return this process's store, made on first use.

    Returns
    -------
    ProtocolStateStore
        The store.
    """
    global _store
    if _store is None:
        _store = create_protocol_state_store()
    return _store


def use_protocol_state_store(store: ProtocolStateStore | None) -> None:
    """
    Install the store this process uses — for the tests.

    Parameters
    ----------
    store : ProtocolStateStore | None
        The store; ``None`` makes the configured one again on next use.
    """
    global _store
    _store = store
