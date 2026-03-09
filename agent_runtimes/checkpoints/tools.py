# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent tools for conversation checkpointing.

Provides tool factory functions that return PydanticAI-compatible
tool definitions so the agent can save, list, and rewind checkpoints.
"""

from __future__ import annotations

import logging
from typing import Any

from .store import RewindRequested

logger = logging.getLogger(__name__)


def save_checkpoint_tool_fn(middleware: Any):
    """Create a ``save_checkpoint`` tool bound to the middleware.

    Returns a dict describing the tool for PydanticAI registration.
    """

    async def save_checkpoint(label: str) -> str:
        """Save a named checkpoint of the current conversation state.

        Call this before attempting risky operations (large refactors,
        irreversible actions, experimental approaches).

        Args:
            label: A short, descriptive label for this checkpoint
                   (e.g. "before-refactor", "working-baseline").

        Returns:
            Confirmation message with the checkpoint ID.
        """
        # The middleware's save_manual needs the current messages,
        # which are injected by the run loop before calling the tool.
        # Here we use a placeholder — the actual message list is passed
        # by the integration layer.
        cp = await middleware.save_manual(
            label=label,
            messages=getattr(middleware, "_current_messages", []),
        )
        return (
            f"Checkpoint saved: '{cp.label}' (id={cp.id}, "
            f"turn={cp.turn}, messages={cp.message_count})"
        )

    return {
        "name": "save_checkpoint",
        "description": (
            "Save a named checkpoint of the current conversation. "
            "Use before risky operations so you can rewind if needed."
        ),
        "function": save_checkpoint,
        "parameters": {
            "label": {
                "type": "string",
                "description": "Short descriptive label for this checkpoint",
                "required": True,
            },
        },
    }


def list_checkpoints_tool_fn(middleware: Any):
    """Create a ``list_checkpoints`` tool bound to the middleware."""

    async def list_checkpoints() -> str:
        """List all available conversation checkpoints.

        Shows checkpoint IDs, labels, turn numbers, and message counts
        so you can choose a restore point.

        Returns:
            Formatted list of available checkpoints.
        """
        checkpoints = await middleware.list_checkpoints()
        if not checkpoints:
            return "No checkpoints available."

        lines = ["Available checkpoints (newest first):"]
        for cp in checkpoints:
            lines.append(
                f"  - [{cp.id[:8]}..] '{cp.label}' "
                f"(turn {cp.turn}, {cp.message_count} msgs, {cp.created_at})"
            )
        return "\n".join(lines)

    return {
        "name": "list_checkpoints",
        "description": (
            "List all available conversation checkpoints with their "
            "IDs, labels, and turn numbers."
        ),
        "function": list_checkpoints,
        "parameters": {},
    }


def rewind_to_tool_fn(middleware: Any):
    """Create a ``rewind_to`` tool bound to the middleware.

    When the agent calls this tool, a ``RewindRequested`` exception
    propagates out of the agent run loop. The controlling application
    code catches this, restores the message history from the checkpoint,
    and restarts the agent.
    """

    async def rewind_to(checkpoint_id: str, reason: str = "") -> str:
        """Rewind the conversation to a previous checkpoint.

        This discards all messages after the checkpoint and restarts
        the agent loop. Use when the current approach has failed or
        reached a dead end.

        Args:
            checkpoint_id: The checkpoint ID to rewind to (from list_checkpoints).
            reason: Why you're rewinding (logged for observability).

        Returns:
            Never returns — raises RewindRequested exception.
        """
        checkpoint = await middleware.get_checkpoint(checkpoint_id)
        if checkpoint is None:
            return f"Checkpoint '{checkpoint_id}' not found. Use list_checkpoints to see available checkpoints."

        logger.info(
            "Agent requested rewind to checkpoint '%s' (turn %d). Reason: %s",
            checkpoint.label,
            checkpoint.turn,
            reason or "not specified",
        )
        raise RewindRequested(checkpoint)

    return {
        "name": "rewind_to",
        "description": (
            "Rewind the conversation to a previous checkpoint, discarding "
            "all messages after that point. Use when your current approach "
            "has failed or you want to try a different strategy."
        ),
        "function": rewind_to,
        "parameters": {
            "checkpoint_id": {
                "type": "string",
                "description": "The ID of the checkpoint to rewind to",
                "required": True,
            },
            "reason": {
                "type": "string",
                "description": "Why you are rewinding (for logs/observability)",
                "required": False,
            },
        },
    }
