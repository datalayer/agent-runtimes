# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Mem0 backend configuration helpers.

Provides environment-driven defaults for local and cloud memory storage:
- local: sqlite-backed Mem0 store
- cloud: pgvector-backed Mem0 store (PostgreSQL)

Explicit config passed by the caller always wins.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from urllib.parse import quote, urlparse

logger = logging.getLogger(__name__)

_DEFAULT_PGVECTOR_HOST = (
    'datalayer-postgresql-agent-memories-rw.datalayer-postgresql.svc.cluster.local'
)
_DEFAULT_PGVECTOR_PORT = 5432
_DEFAULT_PGVECTOR_DB = 'mem0'
_DEFAULT_PGVECTOR_USER = 'mem0'
_DEFAULT_PGVECTOR_COLLECTION = 'agent_memories'


def _sqlite_path(user_id: str, agent_id: str | None) -> str:
    configured = os.environ.get('AGENT_RUNTIMES_MEM0_SQLITE_PATH', '').strip()
    if configured:
        return configured

    safe_user = user_id.replace('/', '_') or 'default'
    safe_agent = (agent_id or 'shared').replace('/', '_')
    base_dir = Path(os.environ.get('AGENT_RUNTIMES_MEM0_DIR', '/tmp/mem0'))
    base_dir.mkdir(parents=True, exist_ok=True)
    return str(base_dir / f'{safe_user}_{safe_agent}.db')


def _sqlite_config(user_id: str, agent_id: str | None) -> dict[str, object]:
    return {
        'vector_store': {
            'provider': 'sqlite',
            'config': {'path': _sqlite_path(user_id=user_id, agent_id=agent_id)},
        }
    }


def _postgres_config() -> dict[str, object] | None:
    uri = os.environ.get('DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI', '').strip()
    password = os.environ.get('DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD', '').strip()
    user = os.environ.get('DATALAYER_POSTGRESQL_AGENT_MEMORIES_USER', '').strip()
    host = os.environ.get('DATALAYER_POSTGRESQL_AGENT_MEMORIES_HOST', '').strip()
    dbname = os.environ.get('DATALAYER_POSTGRESQL_AGENT_MEMORIES_DATABASE', '').strip()
    collection = os.environ.get(
        'DATALAYER_POSTGRESQL_AGENT_MEMORIES_COLLECTION', _DEFAULT_PGVECTOR_COLLECTION
    ).strip()

    if uri:
        parsed = urlparse(uri)
        host = host or parsed.hostname or _DEFAULT_PGVECTOR_HOST
        port = parsed.port or _DEFAULT_PGVECTOR_PORT
        dbname = dbname or parsed.path.lstrip('/') or _DEFAULT_PGVECTOR_DB
        user = user or parsed.username or _DEFAULT_PGVECTOR_USER
        password = password or parsed.password or ''
    else:
        host = host or _DEFAULT_PGVECTOR_HOST
        port = int(
            os.environ.get('DATALAYER_POSTGRESQL_AGENT_MEMORIES_PORT', _DEFAULT_PGVECTOR_PORT)
        )
        dbname = dbname or _DEFAULT_PGVECTOR_DB
        user = user or _DEFAULT_PGVECTOR_USER

    if not uri and user and password:
        uri = (
            f"postgres://{quote(user, safe='')}:{quote(password, safe='')}"
            f"@{host}:{port}/{dbname}"
        )

    if not password and not uri:
        return None

    return {
        'vector_store': {
            'provider': 'pgvector',
            'config': {
                'host': host,
                'port': port,
                'dbname': dbname,
                'user': user,
                'password': password,
                'collection_name': collection,
            },
        }
    }


def resolve_mem0_config(
    user_id: str,
    agent_id: str | None,
    explicit_config: dict[str, object] | None = None,
) -> dict[str, object] | None:
    """Resolve the effective Mem0 configuration.

    Priority:
    1) explicit config argument
    2) AGENT_RUNTIMES_MEM0_CONFIG_JSON
    3) mode-driven defaults (auto/sqlite/postgres)
    """
    if explicit_config:
        return explicit_config

    raw_json = os.environ.get('AGENT_RUNTIMES_MEM0_CONFIG_JSON', '').strip()
    if raw_json:
        try:
            parsed = json.loads(raw_json)
            if isinstance(parsed, dict):
                return parsed
            logger.warning(
                'AGENT_RUNTIMES_MEM0_CONFIG_JSON is not an object; ignoring'
            )
        except json.JSONDecodeError as exc:
            logger.warning('Invalid AGENT_RUNTIMES_MEM0_CONFIG_JSON: %s', exc)

    mode = os.environ.get('AGENT_RUNTIMES_MEM0_BACKEND', 'auto').strip().lower()
    if mode == 'sqlite':
        return _sqlite_config(user_id=user_id, agent_id=agent_id)
    if mode == 'postgres':
        return _postgres_config()

    postgres = _postgres_config()
    if postgres is not None:
        return postgres
    return _sqlite_config(user_id=user_id, agent_id=agent_id)
