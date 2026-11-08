# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Memory backend registry — creates backends from Agentspec config.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from .base import BaseMemoryBackend
from .config import MemoryNotConfigured, resolve_mem0_config
from .ephemeral import EphemeralMemory

logger = logging.getLogger(__name__)

# Active memory backends keyed by agent id, so routes can inspect an agent's
# memory without reaching into the running capability instance.
_MEMORY_BACKENDS: dict[str, BaseMemoryBackend] = {}


def _running_on_kubernetes() -> bool:
    """Detect whether the process runs inside a Kubernetes pod."""
    return bool(os.environ.get("KUBERNETES_SERVICE_HOST"))


def _pgvector_config(user_id: str, agent_id: str | None) -> dict[str, Any] | None:
    """Return a resolved pgvector Mem0 config, or None if not available."""
    resolved = resolve_mem0_config(
        user_id=user_id, agent_id=agent_id, explicit_config=None
    )
    if isinstance(resolved, dict):
        vector_store = resolved.get("vector_store")
        if (
            isinstance(vector_store, dict)
            and vector_store.get("provider") == "pgvector"
        ):
            return resolved
    return None


def register_memory_backend(agent_id: str, backend: BaseMemoryBackend) -> None:
    """Register an agent's memory backend for later lookup."""
    _MEMORY_BACKENDS[agent_id] = backend


def get_memory_backend(agent_id: str) -> BaseMemoryBackend | None:
    """Return the registered memory backend for an agent, if any."""
    return _MEMORY_BACKENDS.get(agent_id)


def unregister_memory_backend(agent_id: str) -> None:
    """Remove an agent's memory backend from the registry."""
    _MEMORY_BACKENDS.pop(agent_id, None)


def create_memory_backend(
    memory_type: str | None,
    user_id: str = "default",
    agent_id: str | None = None,
    config: dict[str, Any] | None = None,
) -> BaseMemoryBackend:
    """Create a memory backend from Agentspec ``memory`` field.

    Parameters
    ----------
    memory_type : str | None
        The memory backend type (``"mem0"``, ``"sqlite"``, ``"ephemeral"``, or
        None). ``None`` and ``"ephemeral"`` both return ``EphemeralMemory``.
    user_id : str
        Effective user identifier (personal account) for memory isolation.
    agent_id : str | None
        Optional agent identifier.
    config : dict | None
        Backend-specific configuration.

    Returns
    -------
    BaseMemoryBackend
        An initialized memory backend.
    """
    if not memory_type or memory_type == "ephemeral":
        logger.info("Using ephemeral (in-memory) memory backend")
        return EphemeralMemory(user_id=user_id, agent_id=agent_id)

    if memory_type == "sqlite":
        # On Kubernetes the pod filesystem is ephemeral, so route durable
        # memory to the shared agent-memories PostgreSQL (pgvector) service
        # instead of a pod-local SQLite file.
        if _running_on_kubernetes():
            pg_config = _pgvector_config(user_id=user_id, agent_id=agent_id)
            if pg_config is not None:
                try:
                    from .mem0_backend import Mem0Backend

                    logger.info(
                        "Kubernetes detected: routing 'sqlite' memory to the "
                        "pgvector agent-memories database for user=%s",
                        user_id,
                    )
                    return Mem0Backend(
                        user_id=user_id,
                        agent_id=agent_id,
                        config=pg_config,
                    )
                except ImportError:
                    logger.warning(
                        "Mem0 not available (pip install mem0ai) — falling back "
                        "to local SQLite memory backend"
                    )
            else:
                logger.warning(
                    "Kubernetes detected but pgvector agent-memories config is "
                    "unavailable — falling back to local SQLite memory backend"
                )
        from .sqlite_backend import SqliteMemory

        logger.info("Using SQLite memory backend for user=%s", user_id)
        return SqliteMemory(user_id=user_id, agent_id=agent_id, config=config)

    if memory_type == "mem0":
        try:
            from .config import on_datalayer_runtime
            from .mem0_backend import Mem0Backend

            logger.info("Using Mem0 memory backend for user=%s", user_id)
            if config:
                return Mem0Backend(user_id=user_id, agent_id=agent_id, config=config)
            # Read at each use: on a Datalayer runtime the token mem0 embeds
            # with is given after the agent is made, and renewed; a runtime
            # that cannot keep memories says why at the first use.
            return Mem0Backend(
                user_id=user_id,
                agent_id=agent_id,
                config=lambda: resolve_mem0_config(user_id=user_id, agent_id=agent_id),
                infer=not on_datalayer_runtime(),
            )
        except ImportError:
            # Never an ephemeral memory in its place: what the agent is told
            # would be forgotten when its runtime stops.
            raise MemoryNotConfigured(
                "This agent remembers with mem0, which is not installed here: "
                "pip install 'agent-runtimes[memory]'."
            ) from None

    # Unknown backend types fall back to ephemeral
    logger.warning(
        "Unknown memory backend type '%s' — falling back to ephemeral", memory_type
    )
    return EphemeralMemory(user_id=user_id, agent_id=agent_id)
