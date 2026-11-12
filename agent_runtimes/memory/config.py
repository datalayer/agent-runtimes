# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Mem0 backend configuration helpers.

Provides environment-driven defaults for local and cloud memory storage:
- local: faiss-backed Mem0 store on local disk, embedded with the person's
  own provider key (mem0's defaults);
- cloud: pgvector-backed Mem0 store (PostgreSQL), embedded through
  ai-inference with the runtime's token (`through_ai_inference`).

On a Datalayer runtime (its inference routed through ai-inference) the
memories are kept in PostgreSQL, never on the pod's disk: they outlive the
runtime, so a paused agent resumed on a new runtime reads them back. A
runtime with no PostgreSQL configured, or no token to embed with, is
refused in a sentence (`MemoryNotConfigured`), never given a local store
that its pod's end would lose.

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
    "datalayer-postgresql-agent-memories-rw.datalayer-postgresql.svc.cluster.local"
)
_DEFAULT_PGVECTOR_PORT = 5432
_DEFAULT_PGVECTOR_DB = "mem0"
_DEFAULT_PGVECTOR_USER = "mem0"
_DEFAULT_PGVECTOR_COLLECTION = "agent_memories"

#: The embedding model memories are embedded with through ai-inference: its
#: vectors have the dimensions of the `agent_memories` table (1536).
DEFAULT_EMBEDDING_MODEL = "bedrock:amazon.titan-embed-text-v1"
EMBEDDING_DIMS = 1536


class MemoryNotConfigured(RuntimeError):
    """Why memories cannot be kept on this runtime, in a sentence."""


def _local_path(user_id: str, agent_id: str | None) -> str:
    configured = os.environ.get("AGENT_RUNTIMES_MEM0_LOCAL_PATH", "").strip()
    if configured:
        return configured

    # Backward-compatible fallback for older env var naming.
    configured = os.environ.get("AGENT_RUNTIMES_MEM0_SQLITE_PATH", "").strip()
    if configured:
        return configured

    safe_user = user_id.replace("/", "_") or "default"
    safe_agent = (agent_id or "shared").replace("/", "_")
    # Overridable default; the temp dir is only where an unconfigured dev run lands.
    base_dir = Path(os.environ.get("AGENT_RUNTIMES_MEM0_DIR", "/tmp/mem0"))  # nosec B108
    base_dir.mkdir(parents=True, exist_ok=True)
    return str(base_dir / "faiss")


def _faiss_config(user_id: str, agent_id: str | None) -> dict[str, object]:
    safe_user = user_id.replace("/", "_") or "default"
    safe_agent = (agent_id or "shared").replace("/", "_")
    return {
        "vector_store": {
            "provider": "faiss",
            "config": {
                "path": _local_path(user_id=user_id, agent_id=agent_id),
                "collection_name": f"{safe_user}_{safe_agent}",
            },
        }
    }


def _postgres_config() -> dict[str, object] | None:
    uri = os.environ.get("DATALAYER_POSTGRESQL_AGENT_MEMORIES_URI", "").strip()
    password = os.environ.get(
        "DATALAYER_POSTGRESQL_AGENT_MEMORIES_PASSWORD", ""
    ).strip()
    user = os.environ.get("DATALAYER_POSTGRESQL_AGENT_MEMORIES_USER", "").strip()
    host = os.environ.get("DATALAYER_POSTGRESQL_AGENT_MEMORIES_HOST", "").strip()
    dbname = os.environ.get("DATALAYER_POSTGRESQL_AGENT_MEMORIES_DATABASE", "").strip()
    collection = os.environ.get(
        "DATALAYER_POSTGRESQL_AGENT_MEMORIES_COLLECTION", _DEFAULT_PGVECTOR_COLLECTION
    ).strip()

    if uri:
        parsed = urlparse(uri)
        host = host or parsed.hostname or _DEFAULT_PGVECTOR_HOST
        port = parsed.port or _DEFAULT_PGVECTOR_PORT
        dbname = dbname or parsed.path.lstrip("/") or _DEFAULT_PGVECTOR_DB
        user = user or parsed.username or _DEFAULT_PGVECTOR_USER
        password = password or parsed.password or ""
    else:
        host = host or _DEFAULT_PGVECTOR_HOST
        port = int(
            os.environ.get(
                "DATALAYER_POSTGRESQL_AGENT_MEMORIES_PORT", _DEFAULT_PGVECTOR_PORT
            )
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
        "vector_store": {
            "provider": "pgvector",
            "config": {
                "host": host,
                "port": port,
                "dbname": dbname,
                "user": user,
                "password": password,
                "collection_name": collection,
                "embedding_model_dims": EMBEDDING_DIMS,
            },
        }
    }


def on_datalayer_runtime() -> bool:
    """Whether this runtime routes its inference through ai-inference."""
    from agent_runtimes.models.models import effective_inference_provider

    return effective_inference_provider().strip().lower() == "datalayer"


def through_ai_inference() -> dict[str, object]:
    """Give Mem0's embedder and LLM, both called through ai-inference.

    OpenAI-compatible, at ai-inference's v1 root, with the token the runtime
    holds now: never a provider's key of the account's. Memories are added
    as the model said them (``infer=False`` in `Mem0Backend`), so the LLM is
    configured for mem0 to start and never asked.
    """
    from agent_runtimes.models.models import _normalize_ai_inference_base_url
    from agent_runtimes.models.offered import inference_token
    from agent_runtimes.specs.models import DEFAULT_MODEL

    token = inference_token()
    if not token:
        raise MemoryNotConfigured(
            "Memories cannot be kept yet: this runtime has no ai-inference token "
            "to embed them with."
        )
    base_url = _normalize_ai_inference_base_url(os.getenv("DATALAYER_AI_INFERENCE_URL"))
    model = (
        os.environ.get("AGENT_RUNTIMES_MEM0_EMBEDDING_MODEL", "").strip()
        or DEFAULT_EMBEDDING_MODEL
    )
    return {
        "embedder": {
            "provider": "openai",
            "config": {
                "model": model,
                "api_key": token,
                "openai_base_url": base_url,
                "embedding_dims": EMBEDDING_DIMS,
            },
        },
        "llm": {
            "provider": "openai",
            "config": {
                "model": DEFAULT_MODEL.value,
                "api_key": token,
                "openai_base_url": base_url,
            },
        },
    }


def datalayer_mem0_config() -> dict[str, object]:
    """The Mem0 configuration of a Datalayer runtime: PostgreSQL, through ai-inference.

    Read at each use (`Mem0Backend` rebuilds mem0 when it changes): the
    runtime's token is given after a pooled runtime starts, and renewed.
    """
    postgres = _postgres_config()
    if postgres is None:
        raise MemoryNotConfigured(
            "Memories cannot be kept on this runtime: no PostgreSQL is configured "
            "for them (DATALAYER_POSTGRESQL_AGENT_MEMORIES_*), and a pod's own "
            "disk would lose them when it stops."
        )
    # mem0's own history of changes sits beside the memories in SQLite: on
    # a pod's disk it would end with the pod, so it is kept in memory.
    return {**postgres, **through_ai_inference(), "history_db_path": ":memory:"}


#: The user id of a runtime nobody was named the owner of (`memory.identity`).
UNOWNED_USER_ID = "default"


def resolve_mem0_config(
    user_id: str,
    agent_id: str | None,
    explicit_config: dict[str, object] | None = None,
) -> dict[str, object] | None:
    """Resolve the effective Mem0 configuration.

    Priority:
    1) explicit config argument
    2) on a Datalayer runtime, `datalayer_mem0_config` (or a refusal)
    3) AGENT_RUNTIMES_MEM0_CONFIG_JSON
    4) mode-driven defaults (auto/faiss/postgres)
    """
    if explicit_config:
        return explicit_config
    if on_datalayer_runtime():
        if user_id == UNOWNED_USER_ID:
            # Every user's memories would meet under one id: never kept so.
            raise MemoryNotConfigured(
                "Memories cannot be kept on this runtime: it was not told whose "
                "it is, and memories are kept under the person whose runtime it is."
            )
        return datalayer_mem0_config()

    raw_json = os.environ.get("AGENT_RUNTIMES_MEM0_CONFIG_JSON", "").strip()
    if raw_json:
        try:
            parsed = json.loads(raw_json)
            if isinstance(parsed, dict):
                return parsed
            logger.warning("AGENT_RUNTIMES_MEM0_CONFIG_JSON is not an object; ignoring")
        except json.JSONDecodeError as exc:
            logger.warning("Invalid AGENT_RUNTIMES_MEM0_CONFIG_JSON: %s", exc)

    mode = os.environ.get("AGENT_RUNTIMES_MEM0_BACKEND", "auto").strip().lower()
    if mode in {"sqlite", "faiss"}:
        return _faiss_config(user_id=user_id, agent_id=agent_id)
    if mode == "postgres":
        return _postgres_config()

    postgres = _postgres_config()
    if postgres is not None:
        return postgres
    return _faiss_config(user_id=user_id, agent_id=agent_id)
