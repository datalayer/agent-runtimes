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


class HistoryUpsertRequest(BaseModel):
    """Request payload for injecting/restoring conversation history."""

    messages: list[dict[str, Any]]
    replace: bool = True


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


def _chat_message_to_internal(message: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a chat-format message into internal usage-tracker structure."""
    role = str(message.get("role") or "").lower()
    created_at = (
        str(message.get("createdAt"))
        if message.get("createdAt")
        else datetime.now(timezone.utc).isoformat()
    )

    if role == "assistant":
        parts: list[dict[str, Any]] = []
        content = message.get("content", "")
        if isinstance(content, list):
            content = json.dumps(content, ensure_ascii=False)
        parts.append({"part_kind": "text", "content": str(content)})
        for tool_call in message.get("toolCalls") or []:
            if not isinstance(tool_call, dict):
                continue
            parts.append(
                {
                    "part_kind": "tool-call",
                    "tool_name": tool_call.get("toolName"),
                    "tool_call_id": tool_call.get("toolCallId"),
                    "args": json.dumps(tool_call.get("args") or {}, ensure_ascii=False),
                }
            )
        return {
            "kind": "response",
            "timestamp": created_at,
            "parts": parts,
        }

    if role in {"user", "system", "tool"}:
        part_kind = {
            "user": "user-prompt",
            "system": "system-prompt",
            "tool": "tool-return",
        }[role]
        content = message.get("content", "")
        if isinstance(content, list):
            content = json.dumps(content, ensure_ascii=False)
        part: dict[str, Any] = {
            "part_kind": part_kind,
            "content": str(content),
        }
        if role == "tool":
            metadata = message.get("metadata") or {}
            if isinstance(metadata, dict):
                part["tool_call_id"] = metadata.get("toolCallId")
                part["tool_name"] = metadata.get("toolName")
        return {
            "kind": "request",
            "timestamp": created_at,
            "parts": [part],
        }

    return None


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


@router.post("/history", response_model=dict)
async def upsert_conversation_history(
    body: HistoryUpsertRequest,
    agent_id: str = Query(
        default="default", description="Agent ID to restore history for"
    ),
) -> dict[str, Any]:
    """Inject/restore conversation history for an agent."""
    tracker = get_usage_tracker()
    stats = tracker.register_agent(agent_id)

    converted = [
        internal
        for internal in (_chat_message_to_internal(msg) for msg in body.messages)
        if internal is not None
    ]

    if body.replace:
        stats.message_history = converted
    else:
        stats.message_history = list(stats.message_history) + converted
    stats.last_updated = datetime.now(timezone.utc)

    logger.info(
        "Restored %d messages for agent '%s' (replace=%s)",
        len(converted),
        agent_id,
        body.replace,
    )
    return {
        "success": True,
        "agent_id": agent_id,
        "messages": len(converted),
        "replace": body.replace,
    }


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
