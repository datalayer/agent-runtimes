# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Memory backends for agent-runtimes.

Provides pluggable memory storage for durable agents:
- ``EphemeralMemory`` — in-memory dict (default, non-persistent)
- ``Mem0Backend`` — integration with the Mem0 memory framework

Other backends (memU, SimpleMem) are planned for future iterations.
"""

from .base import BaseMemoryBackend
from .ephemeral import EphemeralMemory
from .mem0_backend import Mem0Backend
from .registry import create_memory_backend

__all__ = [
    "BaseMemoryBackend",
    "EphemeralMemory",
    "Mem0Backend",
    "create_memory_backend",
]
