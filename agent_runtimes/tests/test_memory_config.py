# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for Mem0 backend configuration resolution."""

from __future__ import annotations

from agent_runtimes.memory import resolve_mem0_config


def test_resolve_mem0_config_uses_explicit_config() -> None:
    explicit = {'vector_store': {'provider': 'sqlite', 'config': {'path': '/tmp/x.db'}}}
    resolved = resolve_mem0_config('u1', 'a1', explicit_config=explicit)
    assert resolved == explicit


def test_resolve_mem0_config_auto_sqlite_without_postgres_env(monkeypatch) -> None:
    monkeypatch.delenv('DATALAYER_POSTGRESQL_MEMORY_URI', raising=False)
    monkeypatch.delenv('DATALAYER_POSTGRESQL_MEMORY_PASSWORD', raising=False)
    monkeypatch.setenv('AGENT_RUNTIMES_MEM0_BACKEND', 'auto')

    resolved = resolve_mem0_config('u1', 'a1')
    assert resolved is not None
    vector_store = resolved.get('vector_store', {})
    assert isinstance(vector_store, dict)
    assert vector_store.get('provider') == 'sqlite'


def test_resolve_mem0_config_auto_prefers_postgres_when_available(monkeypatch) -> None:
    monkeypatch.setenv(
        'DATALAYER_POSTGRESQL_MEMORY_URI',
        'postgres://mem0:secret@pg.example:5432/mem0',
    )
    monkeypatch.setenv('AGENT_RUNTIMES_MEM0_BACKEND', 'auto')

    resolved = resolve_mem0_config('u1', 'a1')
    assert resolved is not None
    vector_store = resolved.get('vector_store', {})
    assert isinstance(vector_store, dict)
    assert vector_store.get('provider') == 'pgvector'


def test_resolve_mem0_config_builds_uri_when_missing(monkeypatch) -> None:
    monkeypatch.delenv('DATALAYER_POSTGRESQL_MEMORY_URI', raising=False)
    monkeypatch.setenv('DATALAYER_POSTGRESQL_MEMORY_USER', 'mem0')
    monkeypatch.setenv('DATALAYER_POSTGRESQL_MEMORY_PASSWORD', 'secret')
    monkeypatch.setenv('DATALAYER_POSTGRESQL_MEMORY_HOST', 'pg.internal')
    monkeypatch.setenv('DATALAYER_POSTGRESQL_MEMORY_PORT', '5432')
    monkeypatch.setenv('DATALAYER_POSTGRESQL_MEMORY_DATABASE', 'mem0')
    monkeypatch.setenv('AGENT_RUNTIMES_MEM0_BACKEND', 'postgres')

    resolved = resolve_mem0_config('u1', 'a1')
    assert resolved is not None
    vector_store = resolved.get('vector_store', {})
    assert isinstance(vector_store, dict)
    assert vector_store.get('provider') == 'pgvector'
