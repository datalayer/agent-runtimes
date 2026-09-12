# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for the durable SQLite memory backend."""

from __future__ import annotations

from pathlib import Path

import pytest

from agent_runtimes.memory import SqliteMemory, create_memory_backend


def _db_path(tmp_path: Path) -> str:
    return str(tmp_path / "memory.db")


def test_create_memory_backend_returns_sqlite(tmp_path: Path) -> None:
    backend = create_memory_backend(
        "sqlite",
        user_id="u1",
        agent_id="a1",
        config={"path": _db_path(tmp_path)},
    )
    assert isinstance(backend, SqliteMemory)


@pytest.mark.asyncio
async def test_add_and_search(tmp_path: Path) -> None:
    backend = SqliteMemory(
        user_id="u1", agent_id="a1", config={"path": _db_path(tmp_path)}
    )
    await backend.add([{"role": "user", "content": "I love blue"}])
    results = await backend.search("blue")
    assert len(results) == 1
    assert results[0]["content"] == "I love blue"
    assert results[0]["score"] == 1.0
    await backend.close()


@pytest.mark.asyncio
async def test_search_is_case_insensitive(tmp_path: Path) -> None:
    backend = SqliteMemory(
        user_id="u1", agent_id="a1", config={"path": _db_path(tmp_path)}
    )
    await backend.add([{"role": "user", "content": "My name is Alice"}])
    assert len(await backend.search("alice")) == 1
    await backend.close()


@pytest.mark.asyncio
async def test_search_matches_any_query_word(tmp_path: Path) -> None:
    backend = SqliteMemory(
        user_id="u1", agent_id="a1", config={"path": _db_path(tmp_path)}
    )
    await backend.add(
        [{"role": "user", "content": "favourite colour is midnight blue"}]
    )
    # Multi-word query where only some words appear still matches.
    results = await backend.search("midnight blue")
    assert len(results) == 1
    assert results[0]["score"] == 1.0
    partial = await backend.search("bright midnight")
    assert len(partial) == 1
    assert partial[0]["score"] == 0.5
    await backend.close()


@pytest.mark.asyncio
async def test_search_ranks_by_word_overlap(tmp_path: Path) -> None:
    backend = SqliteMemory(
        user_id="u1", agent_id="a1", config={"path": _db_path(tmp_path)}
    )
    await backend.add([{"role": "user", "content": "midnight blue is nice"}])
    await backend.add([{"role": "user", "content": "midnight snack"}])
    results = await backend.search("midnight blue")
    assert results[0]["content"] == "midnight blue is nice"
    assert results[0]["score"] > results[1]["score"]
    await backend.close()


@pytest.mark.asyncio
async def test_persists_across_instances(tmp_path: Path) -> None:
    path = _db_path(tmp_path)
    first = SqliteMemory(user_id="u1", agent_id="a1", config={"path": path})
    await first.add([{"role": "user", "content": "durable fact"}])
    await first.close()

    second = SqliteMemory(user_id="u1", agent_id="a1", config={"path": path})
    memories = await second.list_all()
    assert any(m["content"] == "durable fact" for m in memories)
    await second.close()


@pytest.mark.asyncio
async def test_scope_isolation_by_user_and_agent(tmp_path: Path) -> None:
    path = _db_path(tmp_path)
    a1 = SqliteMemory(user_id="u1", agent_id="a1", config={"path": path})
    a2 = SqliteMemory(user_id="u1", agent_id="a2", config={"path": path})
    other_user = SqliteMemory(user_id="u2", agent_id="a1", config={"path": path})

    await a1.add([{"role": "user", "content": "agent one fact"}])
    assert len(await a1.list_all()) == 1
    assert len(await a2.list_all()) == 0
    assert len(await other_user.list_all()) == 0

    for backend in (a1, a2, other_user):
        await backend.close()


@pytest.mark.asyncio
async def test_empty_content_is_skipped(tmp_path: Path) -> None:
    backend = SqliteMemory(
        user_id="u1", agent_id="a1", config={"path": _db_path(tmp_path)}
    )
    await backend.add([{"role": "user", "content": "   "}])
    assert await backend.list_all() == []
    await backend.close()


@pytest.mark.asyncio
async def test_list_all_is_recent_first(tmp_path: Path) -> None:
    backend = SqliteMemory(
        user_id="u1", agent_id="a1", config={"path": _db_path(tmp_path)}
    )
    await backend.add([{"role": "user", "content": "first"}])
    await backend.add([{"role": "user", "content": "second"}])
    memories = await backend.list_all()
    assert memories[0]["content"] == "second"
    await backend.close()


def test_sqlite_stays_local_off_kubernetes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST", raising=False)
    backend = create_memory_backend(
        "sqlite",
        user_id="u1",
        agent_id="a1",
        config={"path": _db_path(tmp_path)},
    )
    assert isinstance(backend, SqliteMemory)


def test_sqlite_routes_to_pgvector_on_kubernetes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")
    monkeypatch.setenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD", "secret")
    from agent_runtimes.memory.mem0_backend import Mem0Backend

    backend = create_memory_backend(
        "sqlite",
        user_id="u1",
        agent_id="a1",
        config={"path": _db_path(tmp_path)},
    )
    assert isinstance(backend, Mem0Backend)


def test_sqlite_falls_back_local_when_pgvector_unconfigured(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "10.0.0.1")
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD", raising=False)
    monkeypatch.delenv("DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI", raising=False)
    monkeypatch.setenv("AGENT_RUNTIMES_MEM0_BACKEND", "auto")
    backend = create_memory_backend(
        "sqlite",
        user_id="u1",
        agent_id="a1",
        config={"path": _db_path(tmp_path)},
    )
    assert isinstance(backend, SqliteMemory)
