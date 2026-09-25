# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Conversation checkpoints of an agent, from outside its runs.

The agent takes its own checkpoints as it runs (see
``agent_runtimes.checkpoints``); these routes let a person see them, take
one between turns, rewind to one and drop one.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from ..checkpoints import CheckpointsCapability, apply_rewind, get_checkpoints
from ..checkpoints.store import ConversationCheckpoint

logger = logging.getLogger(__name__)

router = APIRouter(tags=["checkpoints"])


class SaveCheckpointRequest(BaseModel):
    """A checkpoint taken from outside the run, with the label it goes by."""

    label: str = Field(min_length=1, max_length=120)


def _summary(checkpoint: ConversationCheckpoint) -> dict[str, Any]:
    return {
        "id": checkpoint.id,
        "label": checkpoint.label,
        "turn": checkpoint.turn,
        "message_count": checkpoint.message_count,
        "created_at": checkpoint.created_at,
        "auto": bool(checkpoint.metadata.get("auto")),
        "metadata": checkpoint.metadata,
    }


def _capability_or_404(agent_id: str) -> CheckpointsCapability:
    capability = get_checkpoints(agent_id)
    if capability is None:
        raise HTTPException(
            status_code=404,
            detail=f"Agent '{agent_id}' has no conversation checkpoints enabled",
        )
    return capability


async def _checkpoint_or_404(
    capability: CheckpointsCapability, checkpoint_id: str
) -> ConversationCheckpoint:
    checkpoint = await capability.middleware.get_checkpoint(checkpoint_id)
    if checkpoint is None:
        raise HTTPException(
            status_code=404, detail=f"Checkpoint '{checkpoint_id}' not found"
        )
    return checkpoint


@router.get("/agents/{agent_id}/checkpoints")
async def list_conversation_checkpoints(agent_id: str) -> dict[str, Any]:
    """The agent's checkpoint configuration and its checkpoints, newest first.

    An agent without checkpoints answers too, with ``enabled`` false, so a
    sidebar can say so rather than fail.
    """
    capability = get_checkpoints(agent_id)
    if capability is None:
        return {"agent_id": agent_id, "enabled": False, "turn": 0, "checkpoints": []}
    config = capability.middleware.config
    checkpoints = await capability.middleware.list_checkpoints()
    return {
        "agent_id": agent_id,
        "enabled": config.enabled,
        "frequency": config.frequency,
        "max_checkpoints": config.max_checkpoints,
        "store": config.store,
        "turn": capability.middleware.turn,
        "checkpoints": [_summary(checkpoint) for checkpoint in checkpoints],
    }


@router.post("/agents/{agent_id}/checkpoints", status_code=status.HTTP_201_CREATED)
async def save_conversation_checkpoint(
    agent_id: str, body: SaveCheckpointRequest
) -> dict[str, Any]:
    """Take a checkpoint of the conversation as the last turn left it."""
    capability = _capability_or_404(agent_id)
    messages = capability.middleware.last_messages
    if not messages:
        from ..context.usage import get_usage_tracker

        stats = get_usage_tracker().get_agent_stats(agent_id)
        messages = list(stats.message_history) if stats else []
    checkpoint = await capability.middleware.save_manual(
        body.label.strip(), messages, metadata={"source": "api"}
    )
    return _summary(checkpoint)


@router.get("/agents/{agent_id}/checkpoints/{checkpoint_id}")
async def get_conversation_checkpoint(
    agent_id: str, checkpoint_id: str
) -> dict[str, Any]:
    """One checkpoint, messages included."""
    capability = _capability_or_404(agent_id)
    checkpoint = await _checkpoint_or_404(capability, checkpoint_id)
    return {**_summary(checkpoint), "messages": checkpoint.messages}


@router.post("/agents/{agent_id}/checkpoints/{checkpoint_id}/rewind")
async def rewind_conversation_to_checkpoint(
    agent_id: str, checkpoint_id: str
) -> dict[str, Any]:
    """Set the conversation back to a checkpoint."""
    capability = _capability_or_404(agent_id)
    checkpoint = await _checkpoint_or_404(capability, checkpoint_id)
    message_count = apply_rewind(agent_id, checkpoint)
    capability.middleware.last_messages = [dict(m) for m in checkpoint.messages]
    return {
        "agent_id": agent_id,
        "checkpoint": _summary(checkpoint),
        "message_count": message_count,
    }


@router.delete("/agents/{agent_id}/checkpoints/{checkpoint_id}")
async def delete_conversation_checkpoint(
    agent_id: str, checkpoint_id: str
) -> dict[str, Any]:
    """Drop a checkpoint."""
    capability = _capability_or_404(agent_id)
    checkpoint = await _checkpoint_or_404(capability, checkpoint_id)
    await capability.middleware.delete_checkpoint(checkpoint.id)
    return {"agent_id": agent_id, "deleted": checkpoint.id}
