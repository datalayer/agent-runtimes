# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Memory backend registry — creates backends from Agentspec config.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseMemoryBackend
from .config import resolve_mem0_config
from .ephemeral import EphemeralMemory

logger = logging.getLogger(__name__)

# Active memory backends keyed by agent id, so routes can inspect an agent's
# memory without reaching into the running capability instance.
_MEMORY_BACKENDS: dict[str, BaseMemoryBackend] = {}


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
        The memory backend type (``"mem0"``, ``"ephemeral"``, or None).
        ``None`` and ``"ephemeral"`` both return ``EphemeralMemory``.
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

    if memory_type == "mem0":
        try:
            from .mem0_backend import Mem0Backend

            resolved_config = resolve_mem0_config(
                user_id=user_id,
                agent_id=agent_id,
                explicit_config=config,
            )
            logger.info("Using Mem0 memory backend for user=%s", user_id)
            return Mem0Backend(
                user_id=user_id,
                agent_id=agent_id,
                config=resolved_config,
            )
        except ImportError:
            logger.warning(
                "Mem0 not available (pip install mem0ai) — falling back to ephemeral"
            )
            return EphemeralMemory(user_id=user_id, agent_id=agent_id)

    # Unknown backend types fall back to ephemeral
    logger.warning(
        "Unknown memory backend type '%s' — falling back to ephemeral", memory_type
    )
    return EphemeralMemory(user_id=user_id, agent_id=agent_id)
