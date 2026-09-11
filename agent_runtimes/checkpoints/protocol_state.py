# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Checkpoints that outlive their process, kept per execution (ORCHESTRATOR.md, O2-05).

The in-memory and file stores keep a conversation's checkpoints for the process
that made them. An execution that is paused and resumed — by another process of
the same runtime, after a restart — needs its checkpoint where every process of
that runtime reads: the runtime's protocol state store, SQLite locally and the
agent-memories PostgreSQL on Kubernetes, which already keeps its A2A tasks and
ACP sessions. Checkpoints are keyed by their scope, the execution they belong
to, so two executions of one agent never read each other's, and the capability,
the middleware and the tools use them through the same `CheckpointStore` port.
"""

from __future__ import annotations

from ..protocol_state.store import ProtocolStateStore, protocol_state_store
from .store import CheckpointStore, ConversationCheckpoint

__all__ = ["CHECKPOINT", "ProtocolStateCheckpointStore"]

#: The kind a checkpoint is kept under in the protocol state store.
CHECKPOINT = "checkpoint"


class ProtocolStateCheckpointStore(CheckpointStore):
    """
    The checkpoints of one execution, in the runtime's protocol state store.

    Parameters
    ----------
    scope : str
        The execution the checkpoints belong to.
    store : ProtocolStateStore | None
        The store; this process's, made on first use, when none is given.
    """

    def __init__(self, scope: str, store: ProtocolStateStore | None = None) -> None:
        if not scope or "/" in scope:
            raise ValueError(
                f"'{scope}' names no execution: a durable checkpoint belongs to one, "
                "and its name has no '/'."
            )
        self._scope = scope
        self._store = store

    @property
    def scope(self) -> str:
        """The execution these checkpoints belong to."""
        return self._scope

    def _backing(self) -> ProtocolStateStore:
        return self._store or protocol_state_store()

    def _key(self, checkpoint_id: str) -> str:
        return f"{self._scope}/{checkpoint_id}"

    async def save(self, checkpoint: ConversationCheckpoint) -> None:
        await self._backing().put(CHECKPOINT, self._key(checkpoint.id), checkpoint.to_dict())

    async def get(self, checkpoint_id: str) -> ConversationCheckpoint | None:
        record = await self._backing().get(CHECKPOINT, self._key(checkpoint_id))
        return None if record is None else ConversationCheckpoint.from_dict(record)

    async def list_all(self) -> list[ConversationCheckpoint]:
        records = await self._backing().list(CHECKPOINT, prefix=f"{self._scope}/")
        return sorted(
            (ConversationCheckpoint.from_dict(record) for record in records),
            key=lambda checkpoint: checkpoint.created_at,
            reverse=True,
        )

    async def delete(self, checkpoint_id: str) -> None:
        await self._backing().delete(CHECKPOINT, self._key(checkpoint_id))

    async def prune(self, max_count: int) -> int:
        checkpoints = await self.list_all()
        if len(checkpoints) <= max_count:
            return 0
        for checkpoint in checkpoints[max_count:]:
            await self.delete(checkpoint.id)
        return len(checkpoints) - max_count
