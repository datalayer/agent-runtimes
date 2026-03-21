# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Auto-checkpoint middleware.

Hooks into turn/tool events to automatically create checkpoints
based on the configured frequency.
"""

from __future__ import annotations

import logging
from typing import Any

from .config import CheckpointConfig
from .store import CheckpointStore, ConversationCheckpoint, create_checkpoint_store

logger = logging.getLogger(__name__)


class AutoCheckpointMiddleware:
    """Automatically create conversation checkpoints.

    Integrates with the agent run loop to save checkpoints
    at configurable intervals (every tool call, every turn,
    or manual-only).

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

    @property
    def enabled(self) -> bool:
        return self.config.enabled

    async def on_turn_start(
        self,
        messages: list[dict[str, Any]],
        metadata: dict[str, Any] | None = None,
    ) -> ConversationCheckpoint | None:
        """Called at the start of each model request turn.

        Creates a checkpoint if frequency is ``every_turn``.
        """
        if not self.config.enabled:
            return None

        self._turn_counter += 1

        if self.config.frequency != "every_turn":
            return None

        label = f"auto-turn-{self._turn_counter}"
        checkpoint = await self.store.create_checkpoint(
            label=label,
            turn=self._turn_counter,
            messages=messages,
            max_checkpoints=self.config.max_checkpoints,
            metadata=metadata or {"auto": True, "trigger": "turn_start"},
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
        """Manually save a named checkpoint (used by the agent tool)."""
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

    @classmethod
    def from_spec(
        cls,
        spec_checkpoints: dict | None,
    ) -> "AutoCheckpointMiddleware":
        """Create from AgentSpec."""
        config = CheckpointConfig.from_spec(spec_checkpoints)
        return cls(config)
