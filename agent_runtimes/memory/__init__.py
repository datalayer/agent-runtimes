# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Memory backends for agent-runtimes.

Provides pluggable memory storage for durable agents:
- ``EphemeralMemory`` — in-memory dict (default, non-persistent)
- ``SqliteMemory`` — durable local SQLite store (offline, no API key)
- ``Mem0Backend`` — integration with the Mem0 memory framework

Other backends (memU, SimpleMem) are planned for future iterations.
"""

from .base import BaseMemoryBackend
from .capability import MemoryCapability, build_memory_capability
from .config import resolve_mem0_config
from .ephemeral import EphemeralMemory
from .identity import MemoryIdentity, resolve_memory_identity
from .mem0_backend import Mem0Backend
from .registry import (
    create_memory_backend,
    get_memory_backend,
    register_memory_backend,
    unregister_memory_backend,
)
from .sqlite_backend import SqliteMemory

__all__ = [
    "BaseMemoryBackend",
    "EphemeralMemory",
    "Mem0Backend",
    "SqliteMemory",
    "MemoryIdentity",
    "resolve_memory_identity",
    "resolve_mem0_config",
    "MemoryCapability",
    "build_memory_capability",
    "create_memory_backend",
    "get_memory_backend",
    "register_memory_backend",
    "unregister_memory_backend",
]
