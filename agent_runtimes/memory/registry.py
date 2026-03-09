# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Memory backend registry — creates backends from AgentSpec config.
"""

from __future__ import annotations

import logging
from typing import Any

from .base import BaseMemoryBackend
from .ephemeral import EphemeralMemory

logger = logging.getLogger(__name__)


def create_memory_backend(
    memory_type: str | None,
    user_id: str = "default",
    agent_id: str | None = None,
    config: dict[str, Any] | None = None,
) -> BaseMemoryBackend:
    """Create a memory backend from AgentSpec ``memory`` field.

    Parameters
    ----------
    memory_type : str | None
        The memory backend type (``"mem0"``, ``"ephemeral"``, or None).
        ``None`` and ``"ephemeral"`` both return ``EphemeralMemory``.
    user_id : str
        User identifier for memory isolation.
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
        return EphemeralMemory()

    if memory_type == "mem0":
        try:
            from .mem0_backend import Mem0Backend

            logger.info("Using Mem0 memory backend for user=%s", user_id)
            return Mem0Backend(user_id=user_id, agent_id=agent_id, config=config)
        except ImportError:
            logger.warning(
                "Mem0 not available (pip install mem0ai) — falling back to ephemeral"
            )
            return EphemeralMemory()

    # Unknown backend types fall back to ephemeral
    logger.warning(
        "Unknown memory backend type '%s' — falling back to ephemeral", memory_type
    )
    return EphemeralMemory()
