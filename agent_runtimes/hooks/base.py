# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Hook event types and data models."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class HookEvent(str, Enum):
    """Events that can trigger hooks."""

    PRE_TOOL_USE = "pre_tool_use"
    """Before tool execution. Can allow, deny, or modify arguments."""

    POST_TOOL_USE = "post_tool_use"
    """After successful execution. Can modify the result."""

    POST_TOOL_USE_FAILURE = "post_tool_use_failure"
    """After failed execution. For error reporting/recovery."""


@dataclass
class HookInput:
    """Input passed to a hook handler.

    Parameters
    ----------
    event : HookEvent
        The event that triggered this hook.
    tool_name : str
        Name of the tool being executed.
    tool_args : dict
        Tool call arguments (for PRE hooks, may be modified).
    tool_result : str | None
        Tool execution result (POST hooks only).
    error : Exception | None
        Tool execution error (POST_TOOL_USE_FAILURE only).
    agent_id : str | None
        The agent ID.
    user_id : str | None
        The requesting user ID.
    metadata : dict
        Additional context (turn number, token count, etc.).
    """

    event: HookEvent
    tool_name: str
    tool_args: dict[str, Any] = field(default_factory=dict)
    tool_result: str | None = None
    error: Exception | None = None
    agent_id: str | None = None
    user_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class HookResult:
    """Result returned from a hook handler.

    Parameters
    ----------
    allow : bool
        PRE_TOOL_USE: False → deny the tool call.
    reason : str | None
        Explanation (shown to agent if denied).
    modified_args : dict | None
        PRE: Replace tool arguments.
    modified_result : str | None
        POST: Replace tool output.
    """

    allow: bool = True
    reason: str | None = None
    modified_args: dict[str, Any] | None = None
    modified_result: str | None = None
