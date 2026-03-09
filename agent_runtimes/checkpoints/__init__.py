# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Conversation checkpointing for durable agents.

Provides application-level checkpoints — snapshots of the agent's
message history at key points so the agent (or user) can rewind
to any checkpoint if an approach fails.

Complementary to CRIU (container-level checkpoints) and DBOS
(transient failure durability). Conversation checkpoints handle
strategic failures — wrong approach, dead-end reasoning.
"""

from .config import CheckpointConfig
from .middleware import AutoCheckpointMiddleware
from .store import CheckpointStore, ConversationCheckpoint, FileCheckpointStore, InMemoryCheckpointStore, RewindRequested
from .tools import (
    list_checkpoints_tool_fn,
    rewind_to_tool_fn,
    save_checkpoint_tool_fn,
)

__all__ = [
    "CheckpointConfig",
    "CheckpointStore",
    "ConversationCheckpoint",
    "FileCheckpointStore",
    "InMemoryCheckpointStore",
    "RewindRequested",
    "AutoCheckpointMiddleware",
    "save_checkpoint_tool_fn",
    "list_checkpoints_tool_fn",
    "rewind_to_tool_fn",
]
