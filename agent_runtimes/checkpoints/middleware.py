# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Auto-checkpoint middleware.

Follows an agent's turns and tool calls and snapshots the conversation at
the configured moments; keeps the one rewind the agent asked for until the
turn that asked for it is over.
"""

from __future__ import annotations

import logging
from typing import Any

from .config import CheckpointConfig
from .store import CheckpointStore, ConversationCheckpoint, create_checkpoint_store

logger = logging.getLogger(__name__)


class AutoCheckpointMiddleware:
    """Automatically create conversation checkpoints.

    Integrates with the agent run loop to save checkpoints at configurable
    moments: after every turn (the conversation as it stands once the agent
    has answered), before every tool call, or only when asked.

    Parameters
    ----------
    config : CheckpointConfig
        Checkpoint configuration.
    store : CheckpointStore | None
        Pre-built store; if None one is created from config.
    """

    def __init__(
        self,
        config: CheckpointConfig,
        store: CheckpointStore | None = None,
    ):
        self.config = config
        self.store = store or create_checkpoint_store(
            config.store, file_dir=config.file_dir
        )
        self._turn_counter: int = 0
        self._tool_counter: int = 0
        # The conversation as the current turn found it: what a manual save
        # made in the middle of a turn snapshots.
        self._current_messages: list[dict[str, Any]] = []
        # The conversation as the last turn left it: what a save made between
        # turns snapshots.
        self.last_messages: list[dict[str, Any]] = []
        # The rewind the agent asked for during this turn, applied once the
        # turn is over so the run that asked can still finish cleanly.
        self._pending_rewind: ConversationCheckpoint | None = None

    @property
    def enabled(self) -> bool:
        return self.config.enabled

    @property
    def turn(self) -> int:
        """Turns seen so far."""
        return self._turn_counter

    async def on_turn_start(
        self,
        messages: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Called at the start of each model request turn.

        Counts the turn and keeps the conversation as it stands, for a
        manual save made while the turn runs.
        """
        if not self.config.enabled:
            return
        self._turn_counter += 1
        self._current_messages = list(messages)

    async def on_turn_end(
        self,
        messages: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> ConversationCheckpoint | None:
        """Called once the turn is over, with the conversation as it stands.

        Creates the checkpoint when frequency is ``every_turn``: a point
        after an answer, which is where a rewind wants to land.
        """
        if not self.config.enabled:
            return None
        self.last_messages = list(messages)
        if self.config.frequency != "every_turn":
            return None

        label = f"turn-{self._turn_counter}"
        checkpoint = await self.store.create_checkpoint(
            label=label,
            turn=self._turn_counter,
            messages=messages,
            max_checkpoints=self.config.max_checkpoints,
            metadata=metadata or {"auto": True, "trigger": "turn_end"},
        )
        logger.debug("Auto-checkpoint created: %s (turn %d)", label, self._turn_counter)
        return checkpoint

    async def on_tool_call(
        self,
        tool_name: str,
        messages: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> ConversationCheckpoint | None:
        """Called before each tool execution.

        Creates a checkpoint if frequency is ``every_tool``.
        """
        if not self.config.enabled:
            return None

        self._tool_counter += 1

        if self.config.frequency != "every_tool":
            return None

        label = f"auto-tool-{self._tool_counter}-{tool_name}"
        checkpoint = await self.store.create_checkpoint(
            label=label,
            turn=self._turn_counter,
            messages=messages,
            max_checkpoints=self.config.max_checkpoints,
            metadata={
                "auto": True,
                "trigger": "tool_call",
                "tool": tool_name,
                **(metadata or {}),
            },
        )
        logger.debug("Auto-checkpoint created: %s (tool %s)", label, tool_name)
        return checkpoint

    async def save_manual(
        self,
        label: str,
        messages: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> ConversationCheckpoint:
        """Manually save a named checkpoint (used by the agent tool and the API)."""
        return await self.store.create_checkpoint(
            label=label,
            turn=self._turn_counter,
            messages=messages,
            max_checkpoints=self.config.max_checkpoints,
            metadata={"auto": False, **(metadata or {})},
        )

    async def list_checkpoints(self) -> list[ConversationCheckpoint]:
        """List all available checkpoints."""
        return await self.store.list_all()

    async def get_checkpoint(self, checkpoint_id: str) -> ConversationCheckpoint | None:
        """Retrieve a specific checkpoint."""
        return await self.store.get(checkpoint_id)

    async def delete_checkpoint(self, checkpoint_id: str) -> None:
        """Drop a checkpoint."""
        await self.store.delete(checkpoint_id)

    def request_rewind(self, checkpoint: ConversationCheckpoint) -> None:
        """Ask for the conversation to be rewound once this turn is over."""
        self._pending_rewind = checkpoint

    def take_pending_rewind(self) -> ConversationCheckpoint | None:
        """The rewind asked for during this turn, if any — and forget it."""
        pending, self._pending_rewind = self._pending_rewind, None
        return pending

    @classmethod
    def from_spec(
        cls,
        spec_checkpoints: dict | None,
    ) -> "AutoCheckpointMiddleware":
        """Create from Agentspec."""
        config = CheckpointConfig.from_spec(spec_checkpoints)
        return cls(config)
