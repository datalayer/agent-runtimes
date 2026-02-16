# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""FastAPI routes for conversation history."""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from agent_runtimes.context.usage import get_usage_tracker

logger = logging.getLogger(__name__)

router = APIRouter(tags=["history"])


# =========================================================================
# History Response Models
# =========================================================================


class HistoryMessage(BaseModel):
    """Message in the conversation history."""

    id: str
    role: str  # "user", "assistant", "system", "tool"
    content: str | list[dict[str, Any]]
    createdAt: str  # ISO timestamp
    agentName: str | None = None
    metadata: dict[str, Any] | None = None
    toolCalls: list[dict[str, Any]] | None = None


class HistoryResponse(BaseModel):
    """Response containing conversation history."""

    messages: list[HistoryMessage]


# =========================================================================
# Helper Functions
# =========================================================================


def _convert_to_chat_messages(
    message_history: list[dict[str, Any]], agent_id: str
) -> list[HistoryMessage]:
    """
    Convert internal message history to ChatMessage format.

    Internal format (from pydantic-ai):
    {
        "kind": "request" | "response",
        "timestamp": "...",
        "parts": [
            {
                "part_kind": "user-prompt" | "text" | "tool-call" | "tool-return",
                "content": "...",
                "tool_name": "...",
                "tool_call_id": "...",
                "args": "..."
            }
        ]
    }

    Frontend ChatMessage format:
    {
        "id": "unique-id",
        "role": "user" | "assistant" | "system" | "tool",
        "content": "..." | [...parts],
        "createdAt": "ISO timestamp",
        "toolCalls": [...]
    }
    """
    messages: list[HistoryMessage] = []

    for msg in message_history:
        kind = msg.get("kind")
        timestamp = msg.get("timestamp", datetime.now(timezone.utc).isoformat())
        parts = msg.get("parts", [])

        if kind == "request":
            # Request messages contain user prompts and tool returns
            for part in parts:
                part_kind = part.get("part_kind")
                content = part.get("content", "")

                if part_kind == "user-prompt":
                    messages.append(
                        HistoryMessage(
                            id=str(uuid.uuid4()),
                            role="user",
                            content=content,
                            createdAt=timestamp,
                            agentName=agent_id,
                        )
                    )
                elif part_kind == "tool-return":
                    # Tool return - create a tool message
                    messages.append(
                        HistoryMessage(
                            id=str(uuid.uuid4()),
                            role="tool",
                            content=content,
                            createdAt=timestamp,
                            agentName=agent_id,
                            metadata={
                                "toolCallId": part.get("tool_call_id"),
                                "toolName": part.get("tool_name"),
                            },
                        )
                    )
                elif part_kind == "system-prompt":
                    messages.append(
                        HistoryMessage(
                            id=str(uuid.uuid4()),
                            role="system",
                            content=content,
                            createdAt=timestamp,
                            agentName=agent_id,
                        )
                    )

        elif kind == "response":
            # Response messages contain assistant text and tool calls
            text_content = ""
            tool_calls: list[dict[str, Any]] = []

            for part in parts:
                part_kind = part.get("part_kind")

                if part_kind == "text":
                    text_content += part.get("content", "")
                elif part_kind == "tool-call":
                    # Format tool calls as ToolCallContentPart for the frontend
                    raw_args = part.get("args", "{}")
                    # args may be a JSON string or already a dict
                    if isinstance(raw_args, str):
                        try:
                            parsed_args = json.loads(raw_args)
                        except (json.JSONDecodeError, TypeError):
                            parsed_args = {}
                    else:
                        parsed_args = raw_args if isinstance(raw_args, dict) else {}
                    tool_calls.append(
                        {
                            "type": "tool-call",
                            "toolCallId": part.get("tool_call_id", str(uuid.uuid4())),
                            "toolName": part.get("tool_name"),
                            "args": parsed_args,
                            "status": "completed",
                        }
                    )

            # Only add if there's content or tool calls
            if text_content or tool_calls:
                messages.append(
                    HistoryMessage(
                        id=str(uuid.uuid4()),
                        role="assistant",
                        content=text_content if text_content else "",
                        createdAt=timestamp,
                        agentName=agent_id,
                        toolCalls=tool_calls if tool_calls else None,
                    )
                )

    return messages


# =========================================================================
# History Routes
# =========================================================================


@router.get("/history", response_model=HistoryResponse)
async def get_conversation_history(
    agent_id: str = Query(default="default", description="Agent ID to get history for"),
) -> HistoryResponse:
    """
    Get the conversation history for an agent.

    Returns messages in the format expected by the frontend ChatMessage interface.
    """
    tracker = get_usage_tracker()
    stats = tracker.get_agent_stats(agent_id)

    if not stats:
        logger.debug(f"No usage stats found for agent '{agent_id}'")
        return HistoryResponse(messages=[])

    if not stats.message_history:
        logger.debug(f"No message history for agent '{agent_id}'")
        return HistoryResponse(messages=[])

    messages = _convert_to_chat_messages(stats.message_history, agent_id)
    logger.debug(f"Returning {len(messages)} messages for agent '{agent_id}'")

    return HistoryResponse(messages=messages)


@router.delete("/history", response_model=dict)
async def clear_conversation_history(
    agent_id: str = Query(
        default="default", description="Agent ID to clear history for"
    ),
) -> dict[str, Any]:
    """
    Clear the conversation history for an agent.

    This resets the message history but preserves usage statistics.
    """
    tracker = get_usage_tracker()
    stats = tracker.get_agent_stats(agent_id)

    if stats:
        stats.message_history = []
        logger.info(f"Cleared message history for agent '{agent_id}'")
        return {"status": "ok", "message": f"History cleared for agent '{agent_id}'"}

    return {"status": "ok", "message": f"No history found for agent '{agent_id}'"}
