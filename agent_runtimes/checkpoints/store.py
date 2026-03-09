# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Checkpoint store protocol and implementations.

Provides in-memory and file-based stores for conversation checkpoints.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class RewindRequested(Exception):
    """Raised when the agent requests a rewind to a checkpoint.

    The controlling application code should catch this, restore
    the message history from ``checkpoint``, and restart the agent loop.
    """

    def __init__(self, checkpoint: "ConversationCheckpoint"):
        self.checkpoint = checkpoint
        super().__init__(
            f"Rewind requested to checkpoint '{checkpoint.label}' "
            f"(turn {checkpoint.turn})"
        )


@dataclass
class ConversationCheckpoint:
    """Snapshot of conversation state at a point in time."""

    id: str
    label: str
    turn: int
    messages: list[dict[str, Any]]
    message_count: int
    created_at: str  # ISO format
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ConversationCheckpoint":
        return cls(**data)


class CheckpointStore(ABC):
    """Abstract checkpoint storage backend."""

    @abstractmethod
    async def save(self, checkpoint: ConversationCheckpoint) -> None:
        """Save a checkpoint."""

    @abstractmethod
    async def get(self, checkpoint_id: str) -> ConversationCheckpoint | None:
        """Retrieve a checkpoint by ID."""

    @abstractmethod
    async def list_all(self) -> list[ConversationCheckpoint]:
        """List all checkpoints, newest first."""

    @abstractmethod
    async def delete(self, checkpoint_id: str) -> None:
        """Delete a checkpoint."""

    @abstractmethod
    async def prune(self, max_count: int) -> int:
        """Remove oldest checkpoints to keep at most ``max_count``. Returns number removed."""

    async def create_checkpoint(
        self,
        label: str,
        turn: int,
        messages: list[dict[str, Any]],
        max_checkpoints: int = 20,
        metadata: dict[str, Any] | None = None,
    ) -> ConversationCheckpoint:
        """Create, save, and prune in one step."""
        checkpoint = ConversationCheckpoint(
            id=str(uuid.uuid4()),
            label=label,
            turn=turn,
            messages=[dict(m) for m in messages],  # Deep copy
            message_count=len(messages),
            created_at=datetime.now(timezone.utc).isoformat(),
            metadata=metadata or {},
        )
        await self.save(checkpoint)
        pruned = await self.prune(max_checkpoints)
        if pruned:
            logger.debug("Pruned %d old checkpoints (max=%d)", pruned, max_checkpoints)
        return checkpoint


class InMemoryCheckpointStore(CheckpointStore):
    """In-memory checkpoint store. Data lost on process restart."""

    def __init__(self):
        self._checkpoints: dict[str, ConversationCheckpoint] = {}

    async def save(self, checkpoint: ConversationCheckpoint) -> None:
        self._checkpoints[checkpoint.id] = checkpoint

    async def get(self, checkpoint_id: str) -> ConversationCheckpoint | None:
        return self._checkpoints.get(checkpoint_id)

    async def list_all(self) -> list[ConversationCheckpoint]:
        return sorted(
            self._checkpoints.values(),
            key=lambda c: c.created_at,
            reverse=True,
        )

    async def delete(self, checkpoint_id: str) -> None:
        self._checkpoints.pop(checkpoint_id, None)

    async def prune(self, max_count: int) -> int:
        all_checkpoints = await self.list_all()
        if len(all_checkpoints) <= max_count:
            return 0
        to_remove = all_checkpoints[max_count:]
        for cp in to_remove:
            del self._checkpoints[cp.id]
        return len(to_remove)


class FileCheckpointStore(CheckpointStore):
    """File-based checkpoint store. Persists to JSON files."""

    def __init__(self, directory: str = "/tmp/agent-checkpoints"):
        self._dir = Path(directory)
        self._dir.mkdir(parents=True, exist_ok=True)

    def _path(self, checkpoint_id: str) -> Path:
        return self._dir / f"{checkpoint_id}.json"

    async def save(self, checkpoint: ConversationCheckpoint) -> None:
        path = self._path(checkpoint.id)
        path.write_text(json.dumps(checkpoint.to_dict(), default=str), encoding="utf-8")

    async def get(self, checkpoint_id: str) -> ConversationCheckpoint | None:
        path = self._path(checkpoint_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return ConversationCheckpoint.from_dict(data)

    async def list_all(self) -> list[ConversationCheckpoint]:
        checkpoints = []
        for f in sorted(self._dir.glob("*.json"), key=os.path.getmtime, reverse=True):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                checkpoints.append(ConversationCheckpoint.from_dict(data))
            except (json.JSONDecodeError, KeyError):
                logger.warning("Skipping corrupt checkpoint file: %s", f)
        return checkpoints

    async def delete(self, checkpoint_id: str) -> None:
        path = self._path(checkpoint_id)
        if path.exists():
            path.unlink()

    async def prune(self, max_count: int) -> int:
        all_checkpoints = await self.list_all()
        if len(all_checkpoints) <= max_count:
            return 0
        to_remove = all_checkpoints[max_count:]
        for cp in to_remove:
            await self.delete(cp.id)
        return len(to_remove)


def create_checkpoint_store(store_type: str = "in_memory", **kwargs) -> CheckpointStore:
    """Factory to create a checkpoint store from config."""
    if store_type == "file":
        return FileCheckpointStore(directory=kwargs.get("file_dir", "/tmp/agent-checkpoints"))
    # Default: in-memory
    return InMemoryCheckpointStore()
