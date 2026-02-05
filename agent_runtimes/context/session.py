# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Comprehensive agent usage tracking and context management.

This module provides real-time monitoring and rich display capabilities for AI agents:

**Usage Tracking:**
- Turn-by-turn token usage (input/output tokens, tool calls, duration)
- Session-wide cumulative metrics across multiple turns
- Per-step detailed tracking with tool names and timing
- Support for both codemode and MCP tool monitoring

**Context Management:**
- System prompts and tool definitions analysis
- Message history processing for context window estimation
- Token counting with tiktoken integration and fallback estimation
- Context window utilization calculations

**Rich Display:**
- Rich tables for CLI display with turn, step, and session breakdowns
- Real-time duration tracking with millisecond precision
- Per-step tool execution details with actual token distributions
- Context snapshot creation for comprehensive usage analysis

**Export & Analytics:**
- CSV export of detailed step-by-step execution data
- Structured usage data for integration with external analytics
- Support for both real-time monitoring and post-execution analysis

The core workflow involves:
1. UsageTracker collects real usage data from agent runs
2. StepRecord captures individual request/response cycles with timing
3. ContextSnapshot provides rich display formatting with actual metrics
4. Rich tables display comprehensive usage breakdowns for CLI interfaces
"""

import json
import logging
import os
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, Callable, Sequence

if TYPE_CHECKING:
    from rich.table import Table

logger = logging.getLogger(__name__)


# Model context window sizes (in tokens)
# Sources: Official documentation for each provider
MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    # Anthropic Claude models
    "claude-3-opus": 200000,
    "claude-3-sonnet": 200000,
    "claude-3-haiku": 200000,
    "claude-3.5-sonnet": 200000,
    "claude-3.5-haiku": 200000,
    "claude-sonnet-4": 200000,
    "claude-sonnet-4-0": 200000,
    "claude-opus-4": 200000,
    "claude-4-sonnet": 200000,
    "claude-4-opus": 200000,
    # OpenAI GPT models
    "gpt-4": 8192,
    "gpt-4-32k": 32768,
    "gpt-4-turbo": 128000,
    "gpt-4-turbo-preview": 128000,
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4.1": 1000000,
    "gpt-4.1-mini": 1000000,
    "gpt-4.1-nano": 1000000,
    "o1": 200000,
    "o1-mini": 128000,
    "o1-preview": 128000,
    "o3": 200000,
    "o3-mini": 200000,
    "o4-mini": 200000,
    # Google Gemini models
    "gemini-pro": 32000,
    "gemini-1.5-pro": 2000000,
    "gemini-1.5-flash": 1000000,
    "gemini-2.0-flash": 1000000,
    "gemini-2.5-pro": 1000000,
    "gemini-2.5-flash": 1000000,
    # Mistral models
    "mistral-tiny": 32000,
    "mistral-small": 32000,
    "mistral-medium": 32000,
    "mistral-large": 128000,
    # Groq models (context varies by model)
    "llama-3.1-70b": 131072,
    "llama-3.1-8b": 131072,
    "llama-3.2-90b": 131072,
    "mixtral-8x7b": 32768,
    # AWS Bedrock Claude models
    "anthropic.claude-3-opus": 200000,
    "anthropic.claude-3-sonnet": 200000,
    "anthropic.claude-3-haiku": 200000,
    "anthropic.claude-3.5-sonnet": 200000,
    "anthropic.claude-sonnet-4": 200000,
    "us.anthropic.claude-sonnet-4": 200000,
    "us.anthropic.claude-sonnet-4-5": 200000,
}


def get_model_context_window(model: str) -> int:
    """
    Get context window size for a model.

    Args:
        model: Model identifier (e.g., "anthropic:claude-sonnet-4-0", "openai:gpt-4o")

    Returns:
        Context window size in tokens. Defaults to 128000 if model not found.
    """
    # Strip provider prefix (e.g., "anthropic:", "openai:", "bedrock:")
    model_name = model
    if ":" in model:
        model_name = model.split(":", 1)[1]

    # Direct match
    if model_name in MODEL_CONTEXT_WINDOWS:
        return MODEL_CONTEXT_WINDOWS[model_name]

    # Try partial matching (for versioned models like claude-sonnet-4-5-20250929-v1:0)
    model_lower = model_name.lower()
    for key, value in MODEL_CONTEXT_WINDOWS.items():
        if key in model_lower or model_lower.startswith(key):
            return value

    # Default fallback
    logger.debug("Unknown model '%s', using default context window of 128000", model)
    return 128000


# Token counting with tiktoken (accurate) or fallback to estimation
_tokenizer: Callable[[str], int] | None = None
_tokenizer_initialized = False


def _init_tokenizer() -> None:
    """Initialize the tokenizer (tiktoken if available, else estimation)."""
    global _tokenizer, _tokenizer_initialized
    if _tokenizer_initialized:
        return
    _tokenizer_initialized = True

    try:
        import tiktoken

        # Use cl100k_base encoding (used by GPT-4, Claude, and most modern models)
        encoding = tiktoken.get_encoding("cl100k_base")

        def _tokenizer(text: str) -> int:
            """Count tokens using tiktoken cl100k_base encoding."""
            return len(encoding.encode(text)) if text else 0

        logger.debug("Using tiktoken for accurate token counting")
    except ImportError:
        logger.debug("tiktoken not available, using character-based estimation")
        _tokenizer = None


def count_tokens(text: str) -> int:
    """
    Count tokens in text using tiktoken if available, else estimate.

    Uses cl100k_base encoding (GPT-4/Claude compatible) when tiktoken is available.
    Falls back to ~4 chars per token estimation otherwise.
    """
    if not text:
        return 0

    _init_tokenizer()

    if _tokenizer is not None:
        try:
            return _tokenizer(text)
        except Exception:
            pass

    # Fallback: ~4 characters per token for English text
    return len(text) // 4


def count_tokens_json(obj: Any) -> int:
    """Count tokens for a JSON-serializable object."""
    try:
        return count_tokens(json.dumps(obj, default=str))
    except Exception:
        return count_tokens(str(obj))


@dataclass
class ToolSnapshot:
    """Snapshot of a tool definition."""

    name: str
    description: str | None
    parameters_tokens: int
    total_tokens: int


@dataclass
class ToolDetailSnapshot:
    """Detailed snapshot of a tool including full schema."""

    name: str
    description: str | None
    parameters_schema: dict[str, Any]
    parameters_tokens: int
    total_tokens: int
    # Tool metadata
    source_type: str = "unknown"  # "function", "mcp", "codemode", etc.
    is_async: bool = False
    requires_approval: bool = False
    # Optional source code (if available from function tools)
    source_code: str | None = None


@dataclass
class MessageDetailSnapshot:
    """Detailed snapshot of a message with in_context tracking."""

    role: str  # "user", "assistant", "system", "tool"
    content: str
    estimated_tokens: int
    timestamp: str | None = None
    in_context: bool = True  # Whether this message is in the current context window
    # Additional metadata
    tool_name: str | None = None  # For tool calls/results
    tool_call_id: str | None = None
    is_tool_call: bool = False
    is_tool_result: bool = False


@dataclass
class MessageSnapshot:
    """Snapshot of a single message."""

    role: str  # "user", "assistant", "system"
    content: str
    estimated_tokens: int
    timestamp: str | None = None


@dataclass
class RequestUsageSnapshot:
    """Snapshot of a single model request's usage."""

    request_num: int  # 1-indexed request number
    input_tokens: int
    output_tokens: int
    tool_names: list[str] = field(default_factory=list)  # Tools called in this request
    timestamp: str | None = None  # ISO format timestamp
    turn_id: int | None = None  # Which turn this step belongs to
    duration_ms: float = 0.0  # Duration in milliseconds


@dataclass
class TurnUsage:
    """Usage statistics for a single turn (user prompt + agent response)."""

    input_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0
    tool_names: list[str] = field(default_factory=list)
    duration_seconds: float = 0.0  # Duration in seconds


@dataclass
class SessionUsage:
    """Cumulative usage statistics across all turns in a session."""

    input_tokens: int = 0
    output_tokens: int = 0
    requests: int = 0
    tool_calls: int = 0
    turns: int = 0
    duration_seconds: float = 0.0  # Total duration in seconds


# ============================================================================
# Usage extraction utilities
# ============================================================================


def usage_to_dict(usage: object) -> dict[str, object]:
    """Convert a usage object (from pydantic-ai) to a dictionary."""
    if usage is None:
        return {}
    if isinstance(usage, dict):
        return usage
    if hasattr(usage, "model_dump"):
        try:
            return usage.model_dump()
        except Exception:
            pass
    if hasattr(usage, "dict"):
        try:
            return usage.dict()
        except Exception:
            pass
    if hasattr(usage, "__dict__"):
        return usage.__dict__
    return {}


class UsageTracker:
    """
    Tracks usage statistics across a session.

    This class encapsulates the logic for tracking token usage, tool calls,
    and other metrics across multiple turns in a conversation.

    Usage:
        tracker = UsageTracker()

        # After each turn:
        tracker.record_turn(run_usage, codemode_counts)

        # Get current stats:
        turn_usage = tracker.get_turn_usage()
        session_usage = tracker.get_session_usage()
    """

    def __init__(self, codemode: bool = False, session_id: str | None = None):
        """Initialize the usage tracker.

        Args:
            codemode: Whether this is a codemode session (affects tool call tracking)
            session_id: Optional session identifier for CSV export
        """
        import uuid

        self.codemode = codemode
        self.session_id = session_id or f"session_{uuid.uuid4().hex[:8]}"
        self.turn_count = 0

        # Timing tracking
        self._turn_start_time: float = 0.0

        # Session-level accumulators
        self._session: dict[str, float] = {
            "input_tokens": 0.0,
            "output_tokens": 0.0,
            "total_tokens": 0.0,
            "requests": 0.0,
            "cached_tokens": 0.0,
            "billable_tokens": 0.0,
            "codemode_tool_calls": 0.0,
            "mcp_tool_calls": 0.0,
        }

        # Session duration tracking
        self._session_duration_ms: float = 0.0

        # Previous counts for computing deltas
        self._previous_counts: dict[str, int] = {
            "codemode_tool_calls": 0,
            "mcp_tool_calls": 0,
        }

        # Current turn data (reset each turn)
        self._turn_data: dict[str, object] = {}

    def start_turn(self) -> None:
        """Mark the start of a new turn."""
        import time

        self._turn_start_time = time.time()

    def record_turn(
        self,
        run_usage: object,
        codemode_counts: dict[str, int] | None = None,
        turn_duration: float | None = None,
    ) -> dict[str, object]:
        """
        Record usage from a completed turn.

        Args:
            run_usage: Usage object from agent run (run.usage())
            codemode_counts: Optional dict with codemode/mcp tool call counts
            turn_duration: Optional turn duration in seconds (auto-calculated if not provided)

        Returns:
            Dictionary with this turn's usage data
        """
        import time

        self.turn_count += 1

        # Calculate turn duration
        if turn_duration is not None:
            turn_duration_ms = turn_duration * 1000
        else:
            turn_duration_ms = (
                (time.time() - self._turn_start_time) * 1000
                if self._turn_start_time > 0
                else 0.0
            )

        usage_data = usage_to_dict(run_usage)

        # Accumulate session totals
        for key in self._session:
            if key in usage_data and isinstance(usage_data[key], (int, float)):
                self._session[key] += float(usage_data[key])  # type: ignore[arg-type]
            elif key in usage_data:
                try:
                    self._session[key] += float(usage_data[key])  # type: ignore[arg-type]
                except Exception:
                    pass

        # Build turn data
        self._turn_data = dict(usage_data)
        self._turn_data["duration_ms"] = turn_duration_ms

        # Accumulate session duration
        self._session_duration_ms += turn_duration_ms

        # Handle codemode tool call tracking
        if self.codemode and codemode_counts:
            self._turn_data["codemode_tool_calls"] = (
                codemode_counts.get("codemode_tool_calls", 0)
                - self._previous_counts["codemode_tool_calls"]
            )
            self._turn_data["mcp_tool_calls"] = (
                codemode_counts.get("mcp_tool_calls", 0)
                - self._previous_counts["mcp_tool_calls"]
            )
            self._previous_counts["codemode_tool_calls"] = codemode_counts.get(
                "codemode_tool_calls", 0
            )
            self._previous_counts["mcp_tool_calls"] = codemode_counts.get(
                "mcp_tool_calls", 0
            )
            self._session["codemode_tool_calls"] += float(
                self._turn_data["codemode_tool_calls"]  # type: ignore[arg-type]
            )
            self._session["mcp_tool_calls"] += float(self._turn_data["mcp_tool_calls"])  # type: ignore[arg-type]
        elif not self.codemode:
            # Non-codemode: track MCP tool calls
            if (
                "tool_calls" in self._turn_data
                and "mcp_tool_calls" not in self._turn_data
            ):
                self._turn_data["mcp_tool_calls"] = self._turn_data["tool_calls"]
            self._turn_data.pop("tool_calls", None)
            self._turn_data.setdefault("mcp_tool_calls", 0)
            self._turn_data["codemode_tool_calls"] = "N/A"
            if "tool_calls" in usage_data and isinstance(
                usage_data["tool_calls"], (int, float)
            ):
                self._session["mcp_tool_calls"] += float(usage_data["tool_calls"])

        # Clean up tool_calls key
        self._turn_data.pop("tool_calls", None)

        return self._turn_data

    def get_turn_data(self) -> dict[str, object]:
        """Get the current turn's usage data."""
        data = dict(self._turn_data)
        # Convert duration_ms to duration_seconds for display
        if "duration_ms" in data:
            data["duration_seconds"] = round(float(data["duration_ms"]) / 1000, 2)  # type: ignore[arg-type]
        return data

    def get_session_data(self) -> dict[str, object]:
        """Get the session's cumulative usage data."""
        data: dict[str, object] = dict(self._session)
        if not self.codemode:
            data["codemode_tool_calls"] = "N/A"
        # Add session duration in seconds (sum of all turns)
        if hasattr(self, "_session_duration_ms"):
            data["duration_seconds"] = round(self._session_duration_ms / 1000, 2)
        else:
            data["duration_seconds"] = "-"
        return data

    def get_turn_usage(self) -> TurnUsage:
        """Build TurnUsage dataclass from current turn data."""
        data = self._turn_data

        input_tokens = int(data.get("input_tokens", 0) or 0)  # type: ignore[call-overload]
        output_tokens = int(data.get("output_tokens", 0) or 0)  # type: ignore[call-overload]
        requests = int(data.get("requests", 1) or 1)  # type: ignore[call-overload]

        # Get tool calls based on mode
        if self.codemode:
            tool_calls_val = data.get("codemode_tool_calls", 0)
        else:
            tool_calls_val = data.get("mcp_tool_calls", 0)
        tool_calls = (
            int(tool_calls_val) if isinstance(tool_calls_val, (int, float)) else 0
        )

        return TurnUsage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            requests=requests,
            tool_calls=tool_calls,
            tool_names=[],  # Populated later from snapshot
            duration_seconds=round(float(data.get("duration_ms", 0) or 0) / 1000, 2),  # type: ignore[arg-type]
        )

    def get_session_usage(self) -> SessionUsage:
        """Build SessionUsage dataclass from session data."""
        if self.codemode:
            tool_calls = int(self._session.get("codemode_tool_calls", 0))
        else:
            tool_calls = int(self._session.get("mcp_tool_calls", 0))

        return SessionUsage(
            input_tokens=int(self._session.get("input_tokens", 0)),
            output_tokens=int(self._session.get("output_tokens", 0)),
            requests=int(self._session.get("requests", 0)),
            tool_calls=tool_calls,
            turns=self.turn_count,
            duration_seconds=round(getattr(self, "_session_duration_ms", 0) / 1000, 2),
        )


@dataclass
class ContextSnapshot:
    """Complete snapshot of agent context."""

    agent_id: str

    # System prompts
    system_prompts: list[str] = field(default_factory=list)
    system_prompt_tokens: int = 0

    # Tool definitions (schemas sent in context)
    tools: list[ToolSnapshot] = field(default_factory=list)
    tool_tokens: int = 0

    # Tool usage (calls and returns during conversation)
    history_tool_call_tokens: int = 0  # Tool calls from previous turns
    history_tool_return_tokens: int = 0  # Tool returns from previous turns
    current_tool_call_tokens: int = 0  # Tool calls from current turn
    current_tool_return_tokens: int = 0  # Tool returns from current turn
    # Aggregate fields
    tool_call_tokens: int = 0  # Total tool call tokens
    tool_return_tokens: int = 0  # Total tool return tokens

    # Message history (previous turns) - broken down by role
    messages: list[MessageSnapshot] = field(default_factory=list)
    history_user_tokens: int = 0  # User messages from previous turns
    history_assistant_tokens: int = 0  # Assistant messages from previous turns

    # Current turn messages
    current_user_tokens: int = 0  # Current user message
    current_assistant_tokens: int = 0  # Current assistant response

    # Legacy/aggregate fields for backward compatibility
    history_tokens: int = (
        0  # Total history: history_user_tokens + history_assistant_tokens
    )
    current_message_tokens: int = 0  # Alias for current_user_tokens
    assistant_message_tokens: int = (
        0  # Total assistant: history_assistant + current_assistant
    )
    user_message_tokens: int = 0  # Total user: history_user + current_user

    # Total context
    total_tokens: int = 0  # Our estimate based on tiktoken
    model_input_tokens: int | None = (
        None  # Model's reported input tokens (authoritative, from result.usage)
    )
    model_output_tokens: int | None = None  # Model's reported output tokens
    sum_response_input_tokens: int = (
        0  # Sum of input_tokens from all ModelResponse.usage
    )
    sum_response_output_tokens: int = (
        0  # Sum of output_tokens from all ModelResponse.usage
    )
    per_request_usage: list[RequestUsageSnapshot] = field(
        default_factory=list
    )  # Per-request token usage
    context_window: int = 128000  # Default context window

    # Turn and session usage (set by caller)
    turn_usage: TurnUsage | None = None
    session_usage: SessionUsage | None = None

    def get_context_total(self) -> int:
        """Get total context tokens (what's in the context window)."""
        history_total = (
            self.history_user_tokens
            + self.history_assistant_tokens
            + self.history_tool_call_tokens
            + self.history_tool_return_tokens
        )
        return (
            self.system_prompt_tokens
            + self.tool_tokens
            + history_total
            + self.current_user_tokens
        )

    def get_context_percentage(self) -> float:
        """Get context usage as percentage of context window."""
        if self.context_window == 0:
            return 0.0
        return (self.get_context_total() / self.context_window) * 100

    def get_history_total(self) -> int:
        """Get total history tokens (including tool usage from previous turns)."""
        return (
            self.history_user_tokens
            + self.history_assistant_tokens
            + self.history_tool_call_tokens
            + self.history_tool_return_tokens
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "agentId": self.agent_id,
            "systemPrompts": self.system_prompts,
            "systemPromptTokens": self.system_prompt_tokens,
            "tools": [
                {
                    "name": t.name,
                    "description": t.description,
                    "parametersTokens": t.parameters_tokens,
                    "totalTokens": t.total_tokens,
                }
                for t in self.tools
            ],
            "toolTokens": self.tool_tokens,
            "historyToolCallTokens": self.history_tool_call_tokens,
            "historyToolReturnTokens": self.history_tool_return_tokens,
            "currentToolCallTokens": self.current_tool_call_tokens,
            "currentToolReturnTokens": self.current_tool_return_tokens,
            "toolCallTokens": self.tool_call_tokens,
            "toolReturnTokens": self.tool_return_tokens,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content[:200] + "..."
                    if len(m.content) > 200
                    else m.content,
                    "estimatedTokens": m.estimated_tokens,
                    "timestamp": m.timestamp,
                }
                for m in self.messages
            ],
            "historyUserTokens": self.history_user_tokens,
            "historyAssistantTokens": self.history_assistant_tokens,
            "currentUserTokens": self.current_user_tokens,
            "currentAssistantTokens": self.current_assistant_tokens,
            # Aggregate fields
            "historyTokens": self.history_tokens,
            "currentMessageTokens": self.current_message_tokens,
            "userMessageTokens": self.user_message_tokens,
            "assistantMessageTokens": self.assistant_message_tokens,
            "totalTokens": self.total_tokens,
            "modelInputTokens": self.model_input_tokens,
            "modelOutputTokens": self.model_output_tokens,
            "sumResponseInputTokens": self.sum_response_input_tokens,
            "sumResponseOutputTokens": self.sum_response_output_tokens,
            "perRequestUsage": [
                {
                    "requestNum": r.request_num,
                    "inputTokens": r.input_tokens,
                    "outputTokens": r.output_tokens,
                    "toolNames": r.tool_names,
                    "timestamp": r.timestamp,
                    "turnId": r.turn_id,
                }
                for r in self.per_request_usage
            ],
            "contextWindow": self.context_window,
            # Turn and session usage
            "turnUsage": {
                "inputTokens": self.turn_usage.input_tokens if self.turn_usage else 0,
                "outputTokens": self.turn_usage.output_tokens if self.turn_usage else 0,
                "requests": self.turn_usage.requests if self.turn_usage else 0,
                "toolCalls": self.turn_usage.tool_calls if self.turn_usage else 0,
                "toolNames": self.turn_usage.tool_names if self.turn_usage else [],
            }
            if self.turn_usage
            else None,
            "sessionUsage": {
                "inputTokens": self.session_usage.input_tokens
                if self.session_usage
                else 0,
                "outputTokens": self.session_usage.output_tokens
                if self.session_usage
                else 0,
                "requests": self.session_usage.requests if self.session_usage else 0,
                "toolCalls": self.session_usage.tool_calls if self.session_usage else 0,
            }
            if self.session_usage
            else None,
            # Distribution data for treemap
            "distribution": self._build_distribution(),
        }

    def to_table(self, show_context: bool = True) -> "Table":
        """
        Generate a Rich Table for CLI display.

        Args:
            show_context: Whether to show the CONTEXT section. Defaults to True.

        Returns a 2 or 3-section table:
        - CONTEXT: System prompts, tool definitions, history, current user (with % of context window)
        - THIS TURN: Tool calls, requests, input/output tokens for current turn
        - SESSION: Cumulative totals across all turns
        """
        from rich import box
        from rich.table import Table

        table = Table(show_header=True, box=box.ROUNDED, padding=(0, 1))
        table.add_column("", style="dim", width=20)
        table.add_column("#", justify="right", width=24)
        table.add_column("", width=40)

        # CONTEXT section - these are estimates (tiktoken may differ from model's tokenizer)
        if show_context:
            table.add_row(
                "[bold cyan]═══ CONTEXT ═══[/]", "[dim]Tokens[/]", "[dim](estimated)[/]"
            )
            table.add_row("  System Prompts", str(self.system_prompt_tokens), "")
            table.add_row("  Tool Definitions", str(self.tool_tokens), "")
            table.add_row("  History", str(self.get_history_total()), "")
            table.add_row("  User", str(self.current_user_tokens), "")

            context_total = self.get_context_total()
            context_pct = self.get_context_percentage()
            window_str = (
                f"{self.context_window // 1000}K" if self.context_window else "?"
            )
            table.add_row(
                "  [bold]→ Total[/]",
                f"[bold]{context_total}[/]",
                f"[dim]{context_pct:.1f}% of {window_str}[/]",
            )

            # Separator
            table.add_section()

        # THIS TURN section - these are from the model (authoritative)
        table.add_row("[bold yellow]═══ TURN ═══[/]", "[dim]Count[/]", "")
        if self.turn_usage:
            tool_names_str = (
                ", ".join(self.turn_usage.tool_names)
                if self.turn_usage.tool_names
                else ""
            )
            table.add_row(
                "  Tool Calls",
                str(self.turn_usage.tool_calls),
                f"[dim]{tool_names_str}[/]",
            )
            table.add_row("  Steps", str(self.turn_usage.requests), "")
            # Always show duration, even if 0
            duration_seconds = getattr(self.turn_usage, "duration_seconds", 0) or 0
            table.add_row("  Duration", f"{duration_seconds:.2f}s", "")
            table.add_row("", "[dim]Tokens[/]", "")

            # Show per-request breakdown if there are multiple requests
            if self.per_request_usage and len(self.per_request_usage) > 0:
                # Get requests for this turn (last N where N = turn_usage.requests)
                turn_requests = (
                    self.per_request_usage[-self.turn_usage.requests :]
                    if self.turn_usage.requests > 0
                    else []
                )

                # Show individual steps if we have step data (even for single steps to show tool names)
                if len(turn_requests) > 0:
                    # Show individual requests with turn-relative numbering (starting at 1)
                    for step_num, req in enumerate(turn_requests, start=1):
                        tools_str = (
                            f"[dim]{', '.join(req.tool_names)}[/]"
                            if req.tool_names
                            else ""
                        )

                        # Format tokens with real duration if available
                        tokens_str = f"{req.input_tokens} in / {req.output_tokens} out"
                        if hasattr(req, "duration_ms") and req.duration_ms > 0:
                            duration_s = req.duration_ms / 1000
                            tokens_str += f" • {duration_s:.2f}s"

                        table.add_row(f"    Step {step_num}", tokens_str, tools_str)
                    # Show totals only if multiple steps
                    if len(turn_requests) > 1:
                        table.add_row(
                            "  [bold]Total Input[/]",
                            f"[bold]{self.turn_usage.input_tokens}[/]",
                            "",
                        )
                        table.add_row(
                            "  [bold]Total Output[/]",
                            f"[bold]{self.turn_usage.output_tokens}[/]",
                            "",
                        )
                else:
                    # No step data, just show totals
                    table.add_row(
                        "  Total Input", str(self.turn_usage.input_tokens), ""
                    )
                    table.add_row(
                        "  Total Output", str(self.turn_usage.output_tokens), ""
                    )
            else:
                table.add_row("  Total Input", str(self.turn_usage.input_tokens), "")
                table.add_row("  Total Output", str(self.turn_usage.output_tokens), "")
        else:
            table.add_row("  [dim]No usage data[/]", "", "")

        # Separator
        table.add_section()

        # SESSION section
        table.add_row("[bold green]═══ SESSION ═══[/]", "[dim]Count[/]", "")
        if self.session_usage:
            table.add_row("  Turns", str(self.session_usage.turns), "")
            table.add_row("  Tool Calls", str(self.session_usage.tool_calls), "")
            table.add_row("  Steps", str(self.session_usage.requests), "")
            # No duration display for session
            table.add_row("", "[dim]Tokens[/]", "")
            table.add_row("  Total Input", str(self.session_usage.input_tokens), "")
            table.add_row("  Total Output", str(self.session_usage.output_tokens), "")
        else:
            table.add_row("  [dim]No session data[/]", "", "")

        return table

    def _build_distribution(self) -> dict[str, Any]:
        """Build distribution data for treemap visualization."""
        children = []

        # System prompts category
        if self.system_prompt_tokens > 0:
            children.append(
                {
                    "name": "System Prompts",
                    "value": self.system_prompt_tokens,
                }
            )

        # Tools category (definitions)
        if self.tool_tokens > 0:
            children.append(
                {
                    "name": "Tool Definitions",
                    "value": self.tool_tokens,
                }
            )

        # User messages - prefer granular fields, fall back to aggregate
        user_tokens = self.history_user_tokens + self.current_user_tokens
        if user_tokens == 0 and self.user_message_tokens > 0:
            user_tokens = self.user_message_tokens
        if user_tokens > 0:
            children.append(
                {
                    "name": "User Messages",
                    "value": user_tokens,
                }
            )

        # Assistant messages - prefer granular fields, fall back to aggregate
        assistant_tokens = self.history_assistant_tokens + self.current_assistant_tokens
        if assistant_tokens == 0 and self.assistant_message_tokens > 0:
            assistant_tokens = self.assistant_message_tokens
        if assistant_tokens > 0:
            children.append(
                {
                    "name": "Assistant Messages",
                    "value": assistant_tokens,
                }
            )

        # Tool usage (calls and returns)
        tool_usage = (
            self.history_tool_call_tokens
            + self.history_tool_return_tokens
            + self.current_tool_call_tokens
            + self.current_tool_return_tokens
        )
        if tool_usage > 0:
            children.append(
                {
                    "name": "Tool Usage",
                    "value": tool_usage,
                }
            )

        return {
            "name": "Context",
            "value": self.total_tokens,
            "children": children,
        }


@dataclass
class FullContextSnapshot:
    """
    Complete detailed snapshot of agent context with all configuration.

    This includes everything needed to understand what's in the context window:
    - Model configuration (name, context window, settings)
    - System prompts (full text)
    - Tool definitions (full schemas, source code if available)
    - Message history (complete with in_context flags)
    - Memory blocks (if available)
    """

    agent_id: str

    # Model configuration
    model_name: str | None = None
    context_window: int = 128000
    model_settings: dict[str, Any] = field(default_factory=dict)

    # System prompts (full text)
    system_prompts: list[str] = field(default_factory=list)
    system_prompt_tokens: int = 0

    # Tool definitions with full details
    tools: list[ToolDetailSnapshot] = field(default_factory=list)
    tool_tokens: int = 0

    # Complete message history with in_context flags
    messages: list[MessageDetailSnapshot] = field(default_factory=list)

    # Memory blocks (for agents with memory)
    memory_blocks: list[dict[str, Any]] = field(default_factory=list)
    memory_tokens: int = 0

    # Environment variables visible to tools
    tool_environment: dict[str, str] = field(default_factory=dict)

    # Tool rules / constraints
    tool_rules: list[dict[str, Any]] = field(default_factory=list)

    # Token counts
    history_tokens: int = 0
    current_tokens: int = 0
    total_tokens: int = 0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "agentId": self.agent_id,
            "modelConfiguration": {
                "modelName": self.model_name,
                "contextWindow": self.context_window,
                "settings": self.model_settings,
            },
            "systemPrompts": [
                {
                    "content": prompt,
                    "tokens": count_tokens(prompt),
                }
                for prompt in self.system_prompts
            ],
            "systemPromptTokens": self.system_prompt_tokens,
            "tools": [
                {
                    "name": t.name,
                    "description": t.description,
                    "parametersSchema": t.parameters_schema,
                    "parametersTokens": t.parameters_tokens,
                    "totalTokens": t.total_tokens,
                    "sourceType": t.source_type,
                    "isAsync": t.is_async,
                    "requiresApproval": t.requires_approval,
                    "sourceCode": t.source_code,
                }
                for t in self.tools
            ],
            "toolTokens": self.tool_tokens,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "estimatedTokens": m.estimated_tokens,
                    "timestamp": m.timestamp,
                    "inContext": m.in_context,
                    "toolName": m.tool_name,
                    "toolCallId": m.tool_call_id,
                    "isToolCall": m.is_tool_call,
                    "isToolResult": m.is_tool_result,
                }
                for m in self.messages
            ],
            "memoryBlocks": self.memory_blocks,
            "memoryTokens": self.memory_tokens,
            "toolEnvironment": self.tool_environment,
            "toolRules": self.tool_rules,
            "tokenSummary": {
                "systemPrompts": self.system_prompt_tokens,
                "tools": self.tool_tokens,
                "memory": self.memory_tokens,
                "history": self.history_tokens,
                "current": self.current_tokens,
                "total": self.total_tokens,
                "contextWindow": self.context_window,
                "usagePercent": round(
                    (self.total_tokens / self.context_window) * 100, 1
                )
                if self.context_window > 0
                else 0,
            },
        }


def _extract_message_content(part: Any) -> str:
    """Extract text content from a message part."""
    # Handle different part types from pydantic-ai messages
    if hasattr(part, "content"):
        content = part.content
        if isinstance(content, str):
            return content
        elif hasattr(content, "__str__"):
            return str(content)
    if hasattr(part, "text"):
        return part.text or ""
    return str(part) if part else ""


async def list_available_tools(
    toolsets: Sequence[Any],
) -> list[tuple[str, str | None, dict[str, Any]]]:
    """
    List all available tools from toolsets.

    This is the preferred async method for extracting tool definitions.
    It properly handles CodemodeToolset's registry discovery.

    Args:
        toolsets: Sequence of pydantic-ai toolsets.

    Returns:
        List of (name, description, parameters_schema) tuples.
    """
    tools: list[tuple[str, str | None, dict[str, Any]]] = []

    for toolset in toolsets:
        toolset_class_name = toolset.__class__.__name__
        logger.debug("Processing toolset: %s", toolset_class_name)

        # Handle CodemodeToolset - use registry for proper discovery
        if toolset_class_name == "CodemodeToolset":
            registry = getattr(toolset, "registry", None)
            if registry is not None:
                # Ensure tools are discovered
                if not registry.list_tools():
                    await registry.discover_all()

                for tool in registry.list_tools(include_deferred=True):
                    # Get tool schema from registry
                    schema = (
                        getattr(tool, "input_schema", {})
                        or getattr(tool, "parameters", {})
                        or {}
                    )
                    tools.append((tool.name, tool.description, schema))
                continue

        # Handle MCP servers with async tools() method
        if hasattr(toolset, "tools") and callable(toolset.tools):
            try:
                import inspect

                if inspect.iscoroutinefunction(toolset.tools):
                    mcp_tools = await toolset.tools()
                    for tool in mcp_tools:
                        tools.append(
                            (
                                tool.name,
                                getattr(tool, "description", None),
                                getattr(tool, "inputSchema", {}) or {},
                            )
                        )
                    continue
            except Exception as e:
                logger.debug("Could not get tools from async tools() method: %s", e)

        # Handle FunctionToolset which has _tools attribute
        if hasattr(toolset, "_tools"):
            for tool in toolset._tools.values():
                if hasattr(tool, "definition"):
                    tool_def = tool.definition
                    tools.append(
                        (
                            getattr(tool_def, "name", str(tool)),
                            getattr(tool_def, "description", None),
                            getattr(tool_def, "parameters_json_schema", {}),
                        )
                    )
                elif hasattr(tool, "name"):
                    tools.append(
                        (
                            tool.name,
                            getattr(tool, "description", None),
                            getattr(tool, "parameters_json_schema", {}),
                        )
                    )

        # Handle MCP servers with cached tools
        if hasattr(toolset, "_cached_tools") and toolset._cached_tools is not None:
            cached = toolset._cached_tools
            if isinstance(cached, list):
                for tool in cached:
                    name = getattr(tool, "name", None)
                    if name:
                        tools.append(
                            (
                                name,
                                getattr(tool, "description", None),
                                getattr(tool, "inputSchema", {}),
                            )
                        )

    return tools


def _extract_tool_definitions_from_toolsets(
    toolsets: Sequence[Any],
) -> list[tuple[str, str | None, dict[str, Any]]]:
    """
    Extract tool definitions from pydantic-ai toolsets (sync version).

    This is a synchronous fallback. Prefer using `list_available_tools()` async
    function when possible for better CodemodeToolset support.

    Returns list of (name, description, parameters_json_schema) tuples.
    """
    tools: list[tuple[str, str | None, dict[str, Any]]] = []

    for toolset in toolsets:
        toolset_class_name = toolset.__class__.__name__
        logger.debug("Processing toolset: %s", toolset_class_name)

        # Handle CodemodeToolset - try registry first
        if toolset_class_name == "CodemodeToolset":
            registry = getattr(toolset, "registry", None)
            if registry is not None:
                # Use already-discovered tools from registry
                for tool in registry.list_tools(include_deferred=True):
                    schema = (
                        getattr(tool, "input_schema", {})
                        or getattr(tool, "parameters", {})
                        or {}
                    )
                    tools.append((tool.name, tool.description, schema))
                if tools:
                    continue

            # Fallback: try TOOL_SCHEMAS from agent_codemode
            try:
                from agent_codemode.tool_definitions import TOOL_SCHEMAS

                allow_discovery = getattr(toolset, "allow_discovery_tools", True)
                allow_direct = getattr(toolset, "allow_direct_tool_calls", False)

                for name, schema in TOOL_SCHEMAS.items():
                    # execute_code is always included
                    if name == "execute_code":
                        tools.append(
                            (
                                name,
                                schema.get("description"),
                                schema.get("parameters", {}),
                            )
                        )
                    # call_tool requires allow_direct
                    elif name == "call_tool" and allow_direct:
                        tools.append(
                            (
                                name,
                                schema.get("description"),
                                schema.get("parameters", {}),
                            )
                        )
                    # Other tools are discovery tools
                    elif allow_discovery and name not in ("execute_code", "call_tool"):
                        tools.append(
                            (
                                name,
                                schema.get("description"),
                                schema.get("parameters", {}),
                            )
                        )
            except ImportError:
                pass
            continue

        # Handle FunctionToolset which has _tools attribute
        if hasattr(toolset, "_tools"):
            for tool in toolset._tools.values():
                if hasattr(tool, "definition"):
                    tool_def = tool.definition
                    tools.append(
                        (
                            getattr(tool_def, "name", str(tool)),
                            getattr(tool_def, "description", None),
                            getattr(tool_def, "parameters_json_schema", {}),
                        )
                    )
                elif hasattr(tool, "name"):
                    tools.append(
                        (
                            tool.name,
                            getattr(tool, "description", None),
                            getattr(tool, "parameters_json_schema", {}),
                        )
                    )

        # Handle MCP servers with cached tools
        if hasattr(toolset, "_cached_tools") and toolset._cached_tools is not None:
            cached = toolset._cached_tools
            if isinstance(cached, list):
                for tool in cached:
                    name = getattr(tool, "name", None)
                    if name:
                        tools.append(
                            (
                                name,
                                getattr(tool, "description", None),
                                getattr(tool, "inputSchema", {}),
                            )
                        )
            elif isinstance(cached, dict):
                for tool_name, tool_data in cached.items():
                    if hasattr(tool_data, "tool_def"):
                        tool_def = tool_data.tool_def
                        tools.append(
                            (
                                tool_def.name,
                                tool_def.description,
                                getattr(tool_def, "parameters_json_schema", {}),
                            )
                        )

        # Handle stored tools dict/list
        if hasattr(toolset, "tools") and isinstance(toolset.tools, (list, dict)):
            stored_tools: list[Any] | dict[Any, Any] = toolset.tools
            if isinstance(stored_tools, dict):
                stored_tools = list(stored_tools.values())
            for tool in stored_tools:
                if hasattr(tool, "name"):
                    tools.append(
                        (
                            tool.name,
                            getattr(tool, "description", None),
                            getattr(tool, "parameters_json_schema", {}),
                        )
                    )

    return tools


def extract_context_snapshot(
    agent: Any,
    agent_id: str,
    context_window: int = 128000,
    message_history: Sequence[Any] | None = None,
    model_input_tokens: int | None = None,
    model_output_tokens: int | None = None,
    turn_usage: TurnUsage | None = None,
    session_usage: SessionUsage | None = None,
    tool_definitions: list[tuple[str, str | None, dict[str, Any]]] | None = None,
    turn_start_time: float | None = None,
) -> ContextSnapshot:
    """
    Extract context snapshot from a pydantic-ai agent.

    Args:
        agent: The BaseAgent wrapper or pydantic_ai.Agent instance.
        agent_id: The agent identifier.
        context_window: The context window size for the model.
        message_history: Optional message history from the agent run.
        model_input_tokens: Optional model-reported input tokens (from result.usage).
        model_output_tokens: Optional model-reported output tokens (from result.usage).
        turn_usage: Optional turn usage data for current request.
        session_usage: Optional cumulative session usage data.
        tool_definitions: Optional pre-fetched tool definitions as list of (name, description, params_schema) tuples.
            Use this when MCP server tools are cached during the run but cleared after.

    Returns:
        ContextSnapshot with extracted information.
    """
    snapshot = ContextSnapshot(
        agent_id=agent_id,
        context_window=context_window,
        model_input_tokens=model_input_tokens,
        model_output_tokens=model_output_tokens,
        turn_usage=turn_usage,
        session_usage=session_usage,
    )

    # Get the underlying pydantic-ai Agent
    pydantic_agent = None
    if hasattr(agent, "_agent"):
        pydantic_agent = agent._agent
    elif hasattr(agent, "__class__") and agent.__class__.__name__ == "Agent":
        pydantic_agent = agent
    # Also accept duck-typed objects that have the expected attributes
    elif hasattr(agent, "toolsets") and hasattr(agent, "_system_prompts"):
        pydantic_agent = agent
    # Fallback: if it has toolsets property, try to use it anyway
    elif hasattr(agent, "toolsets"):
        pydantic_agent = agent

    if pydantic_agent is None:
        logger.warning("Could not extract pydantic-ai agent from %s", type(agent))
        return snapshot

    # Extract system prompts
    try:
        if hasattr(pydantic_agent, "_system_prompts"):
            for prompt in pydantic_agent._system_prompts:
                if isinstance(prompt, str):
                    snapshot.system_prompts.append(prompt)
                    # System prompts have minimal overhead, just the text
                    snapshot.system_prompt_tokens += count_tokens(prompt)
    except Exception as e:
        logger.debug("Could not extract system prompts: %s", e)

    # Extract tool definitions - prefer passed tool_definitions, else extract from toolsets
    tool_defs: list[tuple[str, str | None, dict[str, Any]]] = []
    if tool_definitions:
        tool_defs = tool_definitions
        logger.debug("Using %d passed tool definitions", len(tool_defs))
    else:
        try:
            # First try pydantic-ai agent's toolsets
            if hasattr(pydantic_agent, "toolsets"):
                toolsets = pydantic_agent.toolsets
                logger.debug("Agent has %d toolsets", len(toolsets))
                tool_defs = _extract_tool_definitions_from_toolsets(toolsets)
                logger.debug(
                    "Extracted %d tool definitions from toolsets", len(tool_defs)
                )
            else:
                logger.debug("Agent has no toolsets attribute")

            # Also check for adapter's non_mcp_toolsets (used by PydanticAIAdapter)
            if hasattr(agent, "_non_mcp_toolsets") and agent._non_mcp_toolsets:
                adapter_toolsets = agent._non_mcp_toolsets
                logger.debug("Adapter has %d non_mcp_toolsets", len(adapter_toolsets))
                adapter_defs = _extract_tool_definitions_from_toolsets(adapter_toolsets)
                logger.debug(
                    "Extracted %d tool definitions from adapter toolsets",
                    len(adapter_defs),
                )
                tool_defs.extend(adapter_defs)
        except Exception as e:
            logger.debug("Could not extract tools from toolsets: %s", e)

    # Process tool definitions into snapshot
    for name, description, params_schema in tool_defs:
        # Count tokens for the full tool definition as sent to the model
        # Format: {"name": "...", "description": "...", "input_schema": {...}}
        tool_def = {
            "name": name,
            "description": description or "",
            "input_schema": params_schema,
        }
        total_tokens = count_tokens_json(tool_def)
        params_tokens = count_tokens_json(params_schema)

        snapshot.tools.append(
            ToolSnapshot(
                name=name,
                description=description,
                parameters_tokens=params_tokens,
                total_tokens=total_tokens,
            )
        )
        snapshot.tool_tokens += total_tokens

    # Extract message history if provided
    if message_history:
        try:
            num_messages = len(message_history)

            # Find the index of the LAST user-prompt (not just last request)
            # This marks the start of the current "turn"
            current_turn_start_idx = -1
            for i in range(num_messages - 1, -1, -1):
                message = message_history[i]
                if getattr(message, "kind", None) == "request":
                    parts = getattr(message, "parts", [])
                    for part in parts:
                        part_kind = getattr(part, "part_kind", None)
                        if part_kind in ("user-prompt", "user_prompt"):
                            current_turn_start_idx = i
                            break
                    if current_turn_start_idx >= 0:
                        break

            for idx, message in enumerate(message_history):
                message_kind = getattr(message, "kind", None)
                # Everything from the last user-prompt onwards is "current turn"
                is_current_turn = (
                    (idx >= current_turn_start_idx)
                    if current_turn_start_idx >= 0
                    else True
                )

                if message_kind == "request":
                    # ModelRequest - user messages
                    parts = getattr(message, "parts", [])
                    for part in parts:
                        part_kind = getattr(part, "part_kind", None)
                        if part_kind in ("user-prompt", "user_prompt"):
                            content = _extract_message_content(part)
                            # User messages have structure: {"role": "user", "content": [{"type": "text", "text": "..."}]}
                            user_msg = {
                                "role": "user",
                                "content": [{"type": "text", "text": content}],
                            }
                            tokens = count_tokens_json(user_msg)
                            snapshot.messages.append(
                                MessageSnapshot(
                                    role="user",
                                    content=content,
                                    estimated_tokens=tokens,
                                    timestamp=str(getattr(message, "timestamp", None)),
                                )
                            )
                            # Categorize as current or history
                            if is_current_turn:
                                snapshot.current_user_tokens += tokens
                            else:
                                snapshot.history_user_tokens += tokens
                            snapshot.user_message_tokens += tokens
                        elif part_kind in ("system-prompt", "system_prompt"):
                            content = _extract_message_content(part)
                            tokens = count_tokens(content)
                            snapshot.system_prompt_tokens += tokens
                        elif part_kind in ("tool-return", "tool_return"):
                            # Tool returns include structure overhead
                            # Format: {"tool_use_id": "...", "type": "tool_result", "content": "...", "is_error": false}
                            content = _extract_message_content(part)
                            tool_id = getattr(part, "tool_call_id", "") or ""
                            tool_result = {
                                "tool_use_id": tool_id,
                                "type": "tool_result",
                                "content": content,
                                "is_error": False,
                            }
                            tokens = count_tokens_json(tool_result)
                            if is_current_turn:
                                snapshot.current_tool_return_tokens += tokens
                            else:
                                snapshot.history_tool_return_tokens += tokens
                            snapshot.tool_return_tokens += tokens
                        elif part_kind in ("retry-prompt", "retry_prompt"):
                            # Retry prompts are sent as tool_result with is_error=True
                            content = _extract_message_content(part)
                            tool_id = getattr(part, "tool_call_id", "") or ""
                            retry_result = {
                                "tool_use_id": tool_id,
                                "type": "tool_result",
                                "content": content,
                                "is_error": True,
                            }
                            tokens = count_tokens_json(retry_result)
                            if is_current_turn:
                                snapshot.current_tool_return_tokens += tokens
                            else:
                                snapshot.history_tool_return_tokens += tokens
                            snapshot.tool_return_tokens += tokens

                elif message_kind == "response":
                    # ModelResponse - assistant messages
                    # Extract usage from the response if available
                    response_usage = getattr(message, "usage", None)
                    tool_names_in_response: list[str] = []
                    message_timestamp = getattr(message, "timestamp", None)
                    if response_usage is not None:
                        resp_input = getattr(response_usage, "input_tokens", 0) or 0
                        resp_output = getattr(response_usage, "output_tokens", 0) or 0
                        snapshot.sum_response_input_tokens += resp_input
                        snapshot.sum_response_output_tokens += resp_output

                        # Find ALL tool calls in this response
                        parts_for_tool = getattr(message, "parts", [])
                        for p in parts_for_tool:
                            if getattr(p, "part_kind", None) in (
                                "tool-call",
                                "tool_call",
                            ):
                                tool_name = getattr(p, "tool_name", None)
                                if tool_name:
                                    tool_names_in_response.append(tool_name)

                        # Format timestamp for CSV export
                        ts_str = None
                        if message_timestamp:
                            if hasattr(message_timestamp, "isoformat"):
                                ts_str = message_timestamp.isoformat().replace(
                                    "+00:00", "Z"
                                )
                            else:
                                ts_str = str(message_timestamp)

                        # Add per-request usage (duration calculated later)
                        request_num = len(snapshot.per_request_usage) + 1
                        req_snapshot = RequestUsageSnapshot(
                            request_num=request_num,
                            input_tokens=resp_input,
                            output_tokens=resp_output,
                            tool_names=tool_names_in_response,
                            timestamp=ts_str,
                        )

                        snapshot.per_request_usage.append(req_snapshot)

                    parts = getattr(message, "parts", [])
                    for part in parts:
                        part_kind = getattr(part, "part_kind", None)
                        if part_kind == "text":
                            content = _extract_message_content(part)
                            # Assistant messages: {"role": "assistant", "content": [{"type": "text", "text": "..."}]}
                            assistant_msg = {
                                "role": "assistant",
                                "content": [{"type": "text", "text": content}],
                            }
                            tokens = count_tokens_json(assistant_msg)
                            snapshot.messages.append(
                                MessageSnapshot(
                                    role="assistant",
                                    content=content,
                                    estimated_tokens=tokens,
                                    timestamp=str(getattr(message, "timestamp", None)),
                                )
                            )
                            if is_current_turn:
                                snapshot.current_assistant_tokens += tokens
                            else:
                                snapshot.history_assistant_tokens += tokens
                            snapshot.assistant_message_tokens += tokens
                        elif part_kind in ("tool-call", "tool_call"):
                            # Tool calls include structure overhead
                            # Format: {"id": "...", "type": "tool_use", "name": "...", "input": {...}}
                            args = getattr(part, "args", {})
                            tool_name = getattr(part, "tool_name", "") or ""
                            tool_id = getattr(part, "tool_call_id", "") or ""
                            tool_call = {
                                "id": tool_id,
                                "type": "tool_use",
                                "name": tool_name,
                                "input": args if isinstance(args, dict) else {},
                            }
                            tokens = count_tokens_json(tool_call)
                            if is_current_turn:
                                snapshot.current_tool_call_tokens += tokens
                            else:
                                snapshot.history_tool_call_tokens += tokens
                            snapshot.tool_call_tokens += tokens
                        elif part_kind == "thinking":
                            content = _extract_message_content(part)
                            tokens = count_tokens(content)
                            if is_current_turn:
                                snapshot.current_assistant_tokens += tokens
                            else:
                                snapshot.history_assistant_tokens += tokens
                            snapshot.assistant_message_tokens += tokens
        except Exception as e:
            logger.debug("Could not extract message history: %s", e)

    # Compute aggregate fields for backward compatibility
    snapshot.history_tokens = (
        snapshot.history_user_tokens + snapshot.history_assistant_tokens
    )
    snapshot.current_message_tokens = snapshot.current_user_tokens  # Alias

    # Calculate totals (including tool usage)
    snapshot.total_tokens = (
        snapshot.system_prompt_tokens
        + snapshot.tool_tokens
        + snapshot.tool_call_tokens
        + snapshot.tool_return_tokens
        + snapshot.history_user_tokens
        + snapshot.history_assistant_tokens
        + snapshot.current_user_tokens
        + snapshot.current_assistant_tokens
    )

    # Calculate step durations from timestamps AFTER all RequestUsageSnapshots are created
    # Since timestamps represent START times, duration = next_step_start - this_step_start
    if snapshot.per_request_usage and turn_usage and turn_usage.duration_seconds > 0:
        total_turn_duration_ms = turn_usage.duration_seconds * 1000

        for i, req in enumerate(snapshot.per_request_usage):
            if i < len(snapshot.per_request_usage) - 1:
                # For all steps except the last: duration = next step start - this step start
                next_req = snapshot.per_request_usage[i + 1]
                if req.timestamp and next_req.timestamp:
                    try:
                        from datetime import datetime

                        # Parse current step timestamp
                        current_time_str = req.timestamp
                        if current_time_str.endswith("Z"):
                            current_time_str = current_time_str[:-1] + "+00:00"
                        current_dt = datetime.fromisoformat(current_time_str)
                        current_time = current_dt.timestamp()

                        # Parse next step timestamp
                        next_time_str = next_req.timestamp
                        if next_time_str.endswith("Z"):
                            next_time_str = next_time_str[:-1] + "+00:00"
                        next_dt = datetime.fromisoformat(next_time_str)
                        next_time = next_dt.timestamp()

                        # Calculate duration in milliseconds
                        duration_seconds = next_time - current_time
                        req.duration_ms = duration_seconds * 1000

                    except Exception:
                        pass  # Keep duration_ms as 0.0
            else:
                # For the last step: duration = total_turn_duration - sum_of_previous_durations
                previous_durations_ms = sum(
                    r.duration_ms for r in snapshot.per_request_usage[:-1]
                )
                req.duration_ms = total_turn_duration_ms - previous_durations_ms

    return snapshot


def extract_full_context_snapshot(
    agent: Any,
    agent_id: str,
    context_window: int = 128000,
    message_history: Sequence[Any] | None = None,
) -> FullContextSnapshot:
    """
    Extract detailed context snapshot from a pydantic-ai agent.

    This provides complete introspection including:
    - Model configuration
    - Full system prompts
    - Tool definitions with schemas and source code
    - Complete message history with in_context flags

    Args:
        agent: The BaseAgent wrapper or pydantic_ai.Agent instance.
        agent_id: The agent identifier.
        context_window: The context window size for the model.
        message_history: Optional message history from the agent run.

    Returns:
        FullContextSnapshot with all extracted information.
    """
    snapshot = FullContextSnapshot(
        agent_id=agent_id,
        context_window=context_window,
    )

    # Get the underlying pydantic-ai Agent
    pydantic_agent = None
    if hasattr(agent, "_agent"):
        pydantic_agent = agent._agent
    elif hasattr(agent, "__class__") and agent.__class__.__name__ == "Agent":
        pydantic_agent = agent
    elif hasattr(agent, "toolsets") and hasattr(agent, "_system_prompts"):
        pydantic_agent = agent
    elif hasattr(agent, "toolsets"):
        pydantic_agent = agent

    if pydantic_agent is None:
        logger.warning("Could not extract pydantic-ai agent from %s", type(agent))
        return snapshot

    # Extract model configuration
    try:
        # Model name
        model = getattr(pydantic_agent, "model", None) or getattr(
            pydantic_agent, "_model", None
        )
        if model:
            if isinstance(model, str):
                snapshot.model_name = model
            elif hasattr(model, "name"):
                snapshot.model_name = model.name
            elif hasattr(model, "model_name"):
                snapshot.model_name = model.model_name
            else:
                snapshot.model_name = str(model)

        # Model settings
        model_settings = getattr(pydantic_agent, "model_settings", None)
        if model_settings:
            if hasattr(model_settings, "model_dump"):
                snapshot.model_settings = model_settings.model_dump()
            elif isinstance(model_settings, dict):
                snapshot.model_settings = model_settings
    except Exception as e:
        logger.debug("Could not extract model configuration: %s", e)

    # Extract system prompts
    try:
        if hasattr(pydantic_agent, "_system_prompts"):
            for prompt in pydantic_agent._system_prompts:
                if isinstance(prompt, str):
                    snapshot.system_prompts.append(prompt)
                    snapshot.system_prompt_tokens += count_tokens(prompt)
    except Exception as e:
        logger.debug("Could not extract system prompts: %s", e)

    # Extract tool definitions with full details
    try:
        # First check the underlying pydantic-ai agent's toolsets
        if hasattr(pydantic_agent, "toolsets"):
            agent_toolsets = pydantic_agent.toolsets
            logger.debug(
                "extract_full_context_snapshot: pydantic_agent has %d toolsets",
                len(agent_toolsets),
            )
            for toolset in agent_toolsets:
                _extract_tools_from_toolset(toolset, snapshot)

        # Also check the adapter's non_mcp_toolsets (for PydanticAIAdapter)
        if hasattr(agent, "_non_mcp_toolsets") and agent._non_mcp_toolsets:
            non_mcp_toolsets = agent._non_mcp_toolsets
            logger.debug(
                "extract_full_context_snapshot: adapter has %d non_mcp_toolsets",
                len(non_mcp_toolsets),
            )
            for toolset in non_mcp_toolsets:
                _extract_tools_from_toolset(toolset, snapshot)

        logger.debug(
            "extract_full_context_snapshot: Total tools extracted: %d, tool_tokens: %d",
            len(snapshot.tools),
            snapshot.tool_tokens,
        )
    except Exception as e:
        logger.warning("Could not extract tools: %s", e)

    # Extract message history with in_context tracking
    if message_history:
        try:
            # Calculate context budget for in_context determination
            context_budget = (
                context_window - snapshot.system_prompt_tokens - snapshot.tool_tokens
            )
            running_tokens = 0

            # Process messages from newest to oldest to determine which are in context
            messages_processed = []

            for message in reversed(list(message_history)):
                # Handle both dict (from storage) and object (from pydantic-ai) formats
                if isinstance(message, dict):
                    message_kind = message.get("kind")
                    message_timestamp = message.get("timestamp")
                    parts = message.get("parts", [])
                else:
                    message_kind = getattr(message, "kind", None)
                    message_timestamp = str(getattr(message, "timestamp", None))
                    parts = getattr(message, "parts", [])

                if message_kind == "request":
                    for part in parts:
                        if isinstance(part, dict):
                            part_kind = part.get("part_kind")
                            content = part.get("content", "")
                            tool_name = part.get("tool_name")
                            tool_call_id = part.get("tool_call_id")
                        else:
                            part_kind = getattr(part, "part_kind", None)
                            content = _extract_message_content(part)
                            tool_name = getattr(part, "tool_name", None)
                            tool_call_id = getattr(part, "tool_call_id", None)

                        tokens = count_tokens(content)

                        in_context = (running_tokens + tokens) <= context_budget
                        if in_context:
                            running_tokens += tokens

                        if part_kind == "user-prompt":
                            messages_processed.append(
                                MessageDetailSnapshot(
                                    role="user",
                                    content=content,
                                    estimated_tokens=tokens,
                                    timestamp=message_timestamp,
                                    in_context=in_context,
                                )
                            )
                        elif part_kind == "system-prompt":
                            messages_processed.append(
                                MessageDetailSnapshot(
                                    role="system",
                                    content=content,
                                    estimated_tokens=tokens,
                                    timestamp=message_timestamp,
                                    in_context=in_context,
                                )
                            )
                        elif part_kind == "tool-return":
                            messages_processed.append(
                                MessageDetailSnapshot(
                                    role="tool",
                                    content=content,
                                    estimated_tokens=tokens,
                                    timestamp=message_timestamp,
                                    in_context=in_context,
                                    tool_name=tool_name,
                                    tool_call_id=tool_call_id,
                                    is_tool_result=True,
                                )
                            )

                elif message_kind == "response":
                    for part in parts:
                        if isinstance(part, dict):
                            part_kind = part.get("part_kind")
                            content = part.get("content", "")
                            tool_name = part.get("tool_name")
                            tool_call_id = part.get("tool_call_id")
                            args = part.get("args", "{}")
                        else:
                            part_kind = getattr(part, "part_kind", None)
                            content = _extract_message_content(part)
                            tool_name = getattr(part, "tool_name", None)
                            tool_call_id = getattr(part, "tool_call_id", None)
                            args = getattr(part, "args", {})

                        tokens = count_tokens(content)

                        in_context = (running_tokens + tokens) <= context_budget
                        if in_context:
                            running_tokens += tokens

                        if part_kind == "text":
                            messages_processed.append(
                                MessageDetailSnapshot(
                                    role="assistant",
                                    content=content,
                                    estimated_tokens=tokens,
                                    timestamp=message_timestamp,
                                    in_context=in_context,
                                )
                            )
                        elif part_kind in ("tool-call", "tool_call"):
                            # For dict format, args is already a string
                            if isinstance(args, str):
                                content = args
                            else:
                                content = json.dumps(args, default=str) if args else ""
                            messages_processed.append(
                                MessageDetailSnapshot(
                                    role="assistant",
                                    content=content,
                                    estimated_tokens=tokens,
                                    timestamp=message_timestamp,
                                    in_context=in_context,
                                    tool_name=tool_name,
                                    tool_call_id=tool_call_id,
                                    is_tool_call=True,
                                )
                            )

            # Reverse to get chronological order
            snapshot.messages = list(reversed(messages_processed))

            # Calculate token totals
            for msg in snapshot.messages:
                if msg.in_context:
                    snapshot.current_tokens += msg.estimated_tokens
                else:
                    snapshot.history_tokens += msg.estimated_tokens

        except Exception as e:
            logger.debug("Could not extract message history: %s", e)

    # Extract tool environment variables (common patterns)
    try:
        for key in (
            "TAVILY_API_KEY",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "GITHUB_TOKEN",
        ):
            if key in os.environ:
                # Mask the value for security
                value = os.environ[key]
                if len(value) > 8:
                    masked = value[:4] + "..." + value[-4:]
                else:
                    masked = "***"
                snapshot.tool_environment[key] = masked
    except Exception as e:
        logger.debug("Could not extract tool environment: %s", e)

    # Calculate totals
    snapshot.total_tokens = (
        snapshot.system_prompt_tokens
        + snapshot.tool_tokens
        + snapshot.memory_tokens
        + snapshot.current_tokens
    )

    return snapshot


def _extract_tools_from_toolset(toolset: Any, snapshot: FullContextSnapshot) -> None:
    """Extract tool details from a toolset into snapshot."""
    import inspect

    toolset_class_name = toolset.__class__.__name__
    logger.debug(
        "_extract_tools_from_toolset: Processing toolset %s", toolset_class_name
    )

    # Handle CodemodeToolset
    if toolset_class_name == "CodemodeToolset":
        registry = getattr(toolset, "registry", None)
        logger.debug(
            "_extract_tools_from_toolset: CodemodeToolset registry=%s", registry
        )
        if registry is not None:
            tools_list = registry.list_tools(include_deferred=True)
            logger.debug(
                "_extract_tools_from_toolset: registry has %d tools", len(tools_list)
            )
            for tool in tools_list:
                schema = (
                    getattr(tool, "input_schema", {})
                    or getattr(tool, "parameters", {})
                    or {}
                )
                tool_def = {
                    "name": tool.name,
                    "description": tool.description or "",
                    "input_schema": schema,
                }
                total_tokens = count_tokens_json(tool_def)
                params_tokens = count_tokens_json(schema)

                snapshot.tools.append(
                    ToolDetailSnapshot(
                        name=tool.name,
                        description=tool.description,
                        parameters_schema=schema,
                        parameters_tokens=params_tokens,
                        total_tokens=total_tokens,
                        source_type="codemode",
                    )
                )
                snapshot.tool_tokens += total_tokens
            if tools_list:
                return

        # Fallback to TOOL_SCHEMAS if registry is empty
        try:
            from agent_codemode.tool_definitions import TOOL_SCHEMAS

            logger.debug(
                "_extract_tools_from_toolset: Using TOOL_SCHEMAS fallback with %d tools",
                len(TOOL_SCHEMAS),
            )
            for name, schema in TOOL_SCHEMAS.items():
                tool_def = {
                    "name": name,
                    "description": schema.get("description", ""),
                    "input_schema": schema.get("parameters", {}),
                }
                total_tokens = count_tokens_json(tool_def)
                params_tokens = count_tokens_json(schema.get("parameters", {}))

                snapshot.tools.append(
                    ToolDetailSnapshot(
                        name=name,
                        description=schema.get("description"),
                        parameters_schema=schema.get("parameters", {}),
                        parameters_tokens=params_tokens,
                        total_tokens=total_tokens,
                        source_type="codemode",
                    )
                )
                snapshot.tool_tokens += total_tokens
        except ImportError as e:
            logger.debug(
                "_extract_tools_from_toolset: Could not import TOOL_SCHEMAS: %s", e
            )
        return

    # Handle FunctionToolset
    if hasattr(toolset, "_tools"):
        for tool in toolset._tools.values():
            source_code = None
            is_async = False
            requires_approval = False

            # Try to get the function and its source code
            func = getattr(tool, "function", None) or getattr(tool, "_function", None)
            if func:
                try:
                    source_code = inspect.getsource(func)
                    is_async = inspect.iscoroutinefunction(func)
                except Exception:
                    pass

            # Check for approval requirement
            requires_approval = getattr(
                tool, "requires_confirmation", False
            ) or getattr(tool, "human_in_the_loop", False)

            if hasattr(tool, "definition"):
                tool_def = tool.definition
                name = getattr(tool_def, "name", str(tool))
                description = getattr(tool_def, "description", None)
                params_schema = getattr(tool_def, "parameters_json_schema", {})
            elif hasattr(tool, "name"):
                name = tool.name
                description = getattr(tool, "description", None)
                params_schema = getattr(tool, "parameters_json_schema", {})
            else:
                continue

            tool_dict = {
                "name": name,
                "description": description or "",
                "input_schema": params_schema,
            }
            total_tokens = count_tokens_json(tool_dict)
            params_tokens = count_tokens_json(params_schema)

            snapshot.tools.append(
                ToolDetailSnapshot(
                    name=name,
                    description=description,
                    parameters_schema=params_schema,
                    parameters_tokens=params_tokens,
                    total_tokens=total_tokens,
                    source_type="function",
                    is_async=is_async,
                    requires_approval=requires_approval,
                    source_code=source_code,
                )
            )
            snapshot.tool_tokens += total_tokens

    # Handle MCP servers
    if hasattr(toolset, "_cached_tools") and toolset._cached_tools is not None:
        cached = toolset._cached_tools
        if isinstance(cached, list):
            for tool in cached:
                name = getattr(tool, "name", None)
                if name:
                    description = getattr(tool, "description", None)
                    params_schema = getattr(tool, "inputSchema", {}) or {}

                    tool_dict = {
                        "name": name,
                        "description": description or "",
                        "input_schema": params_schema,
                    }
                    total_tokens = count_tokens_json(tool_dict)
                    params_tokens = count_tokens_json(params_schema)

                    snapshot.tools.append(
                        ToolDetailSnapshot(
                            name=name,
                            description=description,
                            parameters_schema=params_schema,
                            parameters_tokens=params_tokens,
                            total_tokens=total_tokens,
                            source_type="mcp",
                        )
                    )
                    snapshot.tool_tokens += total_tokens


# Agent registry for context snapshot lookups
_agents: dict[str, tuple[Any, dict[str, Any]]] = {}


def register_agent(
    agent_id: str, agent: Any, info: dict[str, Any] | None = None
) -> None:
    """
    Register an agent for context snapshot lookups.

    Args:
        agent_id: The unique identifier for the agent.
        agent: The agent instance (BaseAgent wrapper or pydantic_ai.Agent).
        info: Optional additional info about the agent.
    """
    _agents[agent_id] = (agent, info or {})


def unregister_agent(agent_id: str) -> None:
    """
    Unregister an agent from the registry.

    Args:
        agent_id: The unique identifier for the agent.
    """
    if agent_id in _agents:
        del _agents[agent_id]


def get_agent_context_snapshot(agent_id: str) -> ContextSnapshot | None:
    """
    Get context snapshot for a registered agent.

    Args:
        agent_id: The unique identifier for the agent.

    Returns:
        ContextSnapshot if agent is found, None otherwise.
    """
    from .usage import get_usage_tracker

    if agent_id not in _agents:
        logger.debug(f"get_agent_context_snapshot: agent_id={agent_id} not in _agents")
        return None

    agent, info = _agents[agent_id]
    logger.debug(f"get_agent_context_snapshot: Found agent type={type(agent).__name__}")

    # Get context window from usage tracker
    tracker = get_usage_tracker()
    context_window = tracker.get_context_window(agent_id)

    # Extract snapshot from agent
    snapshot = extract_context_snapshot(agent, agent_id, context_window)
    logger.debug(
        f"get_agent_context_snapshot: After extract - tool_tokens={snapshot.tool_tokens}, tools={len(snapshot.tools)}, system_prompt_tokens={snapshot.system_prompt_tokens}"
    )

    # Merge with usage tracker data for message tokens and tools
    # (since message history is per-run, we use accumulated stats)
    stats = tracker.get_agent_stats(agent_id)
    if stats:
        snapshot.user_message_tokens = stats.user_message_tokens
        snapshot.assistant_message_tokens = stats.assistant_message_tokens
        logger.debug(
            f"get_agent_context_snapshot: After merge - user_tokens={snapshot.user_message_tokens}, assistant_tokens={snapshot.assistant_message_tokens}"
        )

        # Merge tool definitions from tracker if snapshot has none
        # (runtime toolsets aren't stored on agent, but captured in tracker)
        if not snapshot.tools and stats.tool_definitions:
            logger.debug(
                f"get_agent_context_snapshot: Using {len(stats.tool_definitions)} tool definitions from tracker"
            )
            for name, description, params_schema in stats.tool_definitions:
                tool_def = {
                    "name": name,
                    "description": description or "",
                    "input_schema": params_schema,
                }
                total_tokens = count_tokens_json(tool_def)
                params_tokens = count_tokens_json(params_schema)

                snapshot.tools.append(
                    ToolSnapshot(
                        name=name,
                        description=description,
                        parameters_tokens=params_tokens,
                        total_tokens=total_tokens,
                    )
                )
                snapshot.tool_tokens += total_tokens
            logger.debug(
                f"get_agent_context_snapshot: After tool merge - tool_tokens={snapshot.tool_tokens}, tools={len(snapshot.tools)}"
            )

        # Merge per-request usage from tracker if snapshot has none
        # (AG-UI doesn't populate _agent_messages, so snapshot extraction finds nothing)
        if not snapshot.per_request_usage and stats.request_usage_history:
            for req in stats.request_usage_history:
                snapshot.per_request_usage.append(
                    RequestUsageSnapshot(
                        request_num=req.request_num,
                        input_tokens=req.input_tokens,
                        output_tokens=req.output_tokens,
                        tool_names=req.tool_names,
                        timestamp=req.timestamp,
                        duration_ms=req.duration_ms,
                    )
                )
            # Update sum fields from tracker data
            snapshot.sum_response_input_tokens = stats.input_tokens
            snapshot.sum_response_output_tokens = stats.output_tokens

        # Recalculate total (include tool_tokens)
        snapshot.total_tokens = (
            snapshot.system_prompt_tokens
            + snapshot.tool_tokens
            + snapshot.user_message_tokens
            + snapshot.assistant_message_tokens
        )

    return snapshot


def get_agent_full_context_snapshot(agent_id: str) -> FullContextSnapshot | None:
    """
    Get full detailed context snapshot for a registered agent.

    This provides complete introspection including:
    - Model configuration
    - Full system prompts
    - Tool definitions with schemas and source code
    - Complete message history with in_context flags

    Args:
        agent_id: The unique identifier for the agent.

    Returns:
        FullContextSnapshot if agent is found, None otherwise.
    """
    from .usage import get_usage_tracker

    if agent_id not in _agents:
        return None

    agent, info = _agents[agent_id]

    # Get context window and stored data from usage tracker
    tracker = get_usage_tracker()
    context_window = tracker.get_context_window(agent_id)

    # Get stored message history and tools from usage stats
    stats = tracker.get_agent_stats(agent_id)
    stored_messages = stats.message_history if stats else []
    stored_tools = stats.tool_definitions if stats else []

    # Extract full snapshot from agent, passing stored messages
    snapshot = extract_full_context_snapshot(
        agent, agent_id, context_window, message_history=stored_messages
    )

    # Merge tool definitions from tracker if snapshot has none
    if not snapshot.tools and stored_tools:
        logger.debug(
            f"get_agent_full_context_snapshot: Using {len(stored_tools)} tool definitions from tracker"
        )
        for name, description, params_schema in stored_tools:
            tool_def = {
                "name": name,
                "description": description or "",
                "input_schema": params_schema,
            }
            total_tokens = count_tokens_json(tool_def)
            params_tokens = count_tokens_json(params_schema)

            snapshot.tools.append(
                ToolDetailSnapshot(
                    name=name,
                    description=description,
                    parameters_schema=params_schema,
                    parameters_tokens=params_tokens,
                    total_tokens=total_tokens,
                    source_type="runtime",
                )
            )
            snapshot.tool_tokens += total_tokens

    # Recalculate total tokens
    snapshot.total_tokens = (
        snapshot.system_prompt_tokens
        + snapshot.tool_tokens
        + snapshot.memory_tokens
        + snapshot.current_tokens
    )

    return snapshot
