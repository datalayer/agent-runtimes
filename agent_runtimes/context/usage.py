# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Agent usage tracking for context monitoring.

Tracks token usage, message history, and tool calls for agents
to provide real-time context usage information.
"""

import logging
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from datalayer_core.orchestration import Usage

from agent_runtimes.context.costs import get_cost_store

logger = logging.getLogger(__name__)


@dataclass
class UsageCategory:
    """
    A category of usage with a name and token value.
    """

    name: str
    value: int = 0
    children: list["UsageCategory"] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """
        Convert to dictionary format for API response.
        """
        result: dict[str, Any] = {
            "name": self.name,
            "value": self.value,
        }
        if self.children:
            result["children"] = [child.to_dict() for child in self.children]
        return result


@dataclass
class RequestUsage:
    """
    Usage for a single request/response cycle.
    """

    request_num: int
    input_tokens: int = 0
    output_tokens: int = 0
    tool_calls: int = 0
    tool_names: list[str] = field(default_factory=list)
    timestamp: str | None = None
    duration_ms: float = 0.0


def serialize_messages(messages: list[Any]) -> list[dict[str, Any]]:
    """Convert pydantic-ai ``ModelMessage`` objects to JSON-serializable dicts.

    The form the usage tracker stores, the history route serves and a
    conversation checkpoint snapshots: ``kind``, ``timestamp`` and ``parts``
    with their kind, content and tool fields.
    """
    serialized: list[dict[str, Any]] = []
    for msg in messages:
        try:
            # Handle pydantic-ai ModelMessage objects
            msg_dict: dict[str, Any] = {}

            # Get the message kind (request or response)
            msg_kind = getattr(msg, "kind", None)
            msg_dict["kind"] = msg_kind

            # Get timestamp if available
            timestamp = getattr(msg, "timestamp", None)
            if timestamp:
                msg_dict["timestamp"] = str(timestamp)

            # Process parts
            parts = getattr(msg, "parts", [])
            serialized_parts: list[dict[str, Any]] = []
            for part in parts:
                part_dict: dict[str, Any] = {}
                part_kind = getattr(part, "part_kind", None)
                part_dict["part_kind"] = part_kind

                # Extract content based on part type
                if hasattr(part, "content"):
                    content = part.content
                    if isinstance(content, str):
                        part_dict["content"] = content
                    else:
                        part_dict["content"] = str(content)
                elif hasattr(part, "text"):
                    part_dict["content"] = part.text or ""

                # Tool-specific fields
                if hasattr(part, "tool_name"):
                    part_dict["tool_name"] = part.tool_name
                if hasattr(part, "tool_call_id"):
                    part_dict["tool_call_id"] = part.tool_call_id
                if hasattr(part, "args"):
                    try:
                        import json

                        part_dict["args"] = (
                            json.dumps(part.args, default=str) if part.args else "{}"
                        )
                    except Exception:
                        part_dict["args"] = str(part.args)

                serialized_parts.append(part_dict)

            msg_dict["parts"] = serialized_parts
            serialized.append(msg_dict)
        except Exception as e:
            logger.debug(f"Could not serialize message: {e}")
            continue

    return serialized


@dataclass
class AgentUsageStats:
    """
    Usage statistics for a single agent.
    """

    agent_id: str

    # Token usage
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    # Request/run statistics
    requests: int = 0
    tool_calls: int = 0

    # Message tracking
    user_message_tokens: int = 0
    assistant_message_tokens: int = 0
    system_prompt_tokens: int = 0

    # Tool tracking (definitions from last run)
    tool_definitions: list[tuple[str, str | None, dict[str, Any]]] = field(
        default_factory=list
    )
    tool_tokens: int = 0

    # Per-request usage history
    request_usage_history: list[RequestUsage] = field(default_factory=list)

    # Message history from agent runs (stored as JSON-serializable dicts)
    message_history: list[dict[str, Any]] = field(default_factory=list)

    # Last turn total duration (milliseconds) for proper step duration calculation
    last_turn_duration_ms: float = 0.0

    # Timestamps
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_updated: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    @property
    def total_tokens(self) -> int:
        """
        Total tokens used (input + output).
        """
        return self.input_tokens + self.output_tokens

    @property
    def message_tokens(self) -> int:
        """
        Total tokens in messages.
        """
        return self.user_message_tokens + self.assistant_message_tokens

    def update_from_run_usage(
        self,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        requests: int = 0,
        tool_calls: int = 0,
        tool_names: list[str] | None = None,
        duration_ms: float = 0.0,
    ) -> None:
        """
        Update usage stats from a run result.
        """
        self.input_tokens += input_tokens
        self.output_tokens += output_tokens
        self.cache_read_tokens += cache_read_tokens
        self.cache_write_tokens += cache_write_tokens
        self.requests += requests
        self.tool_calls += tool_calls
        self.last_updated = datetime.now(timezone.utc)

        # Add per-request usage entry
        request_num = len(self.request_usage_history) + 1
        self.request_usage_history.append(
            RequestUsage(
                request_num=request_num,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                tool_calls=tool_calls,
                tool_names=tool_names or [],
                timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                duration_ms=duration_ms,
            )
        )

    def update_message_tokens(
        self,
        user_tokens: int = 0,
        assistant_tokens: int = 0,
    ) -> None:
        """
        Update message token counts.
        """
        self.user_message_tokens += user_tokens
        self.assistant_message_tokens += assistant_tokens
        self.last_updated = datetime.now(timezone.utc)

    def set_system_prompt_tokens(self, tokens: int) -> None:
        """
        Set system prompt token count.
        """
        self.system_prompt_tokens = tokens
        self.last_updated = datetime.now(timezone.utc)

    def store_messages(self, messages: list[Any]) -> None:
        """
        Store message history from an agent run.

        Converts pydantic-ai ModelMessage objects to JSON-serializable dicts.
        Replaces the current message history (messages accumulate in the agent).

        Args:
            messages: List of pydantic-ai ModelMessage objects.
        """
        serialized = serialize_messages(messages)
        self.message_history = serialized
        self.last_updated = datetime.now(timezone.utc)
        logger.debug(f"Stored {len(serialized)} messages for agent {self.agent_id}")

    def store_tools(
        self, tool_definitions: list[tuple[str, str | None, dict[str, Any]]]
    ) -> None:
        """
        Store tool definitions from an agent run.

        Args:
            tool_definitions: List of (name, description, params_schema) tuples.
        """
        from .session import count_tokens_json

        self.tool_definitions = tool_definitions
        # Calculate tool tokens
        total_tokens = 0
        for name, description, params_schema in tool_definitions:
            tool_def = {
                "name": name,
                "description": description or "",
                "input_schema": params_schema,
            }
            total_tokens += count_tokens_json(tool_def)
        self.tool_tokens = total_tokens
        self.last_updated = datetime.now(timezone.utc)
        logger.debug(
            f"Stored {len(tool_definitions)} tools ({total_tokens} tokens) for agent {self.agent_id}"
        )

    def reset(self) -> None:
        """
        Reset all usage statistics.
        """
        self.input_tokens = 0
        self.output_tokens = 0
        self.cache_read_tokens = 0
        self.cache_write_tokens = 0
        self.requests = 0
        self.tool_calls = 0
        self.user_message_tokens = 0
        self.assistant_message_tokens = 0
        self.request_usage_history = []
        self.message_history = []
        self.tool_definitions = []
        self.tool_tokens = 0
        self.last_updated = datetime.now(timezone.utc)


class AgentUsageTracker:
    """
    Global tracker for agent usage statistics.

    Maintains usage stats for all registered agents and provides
    context details for the frontend.
    """

    # Default context window size (can be overridden per model)
    DEFAULT_CONTEXT_WINDOW = 128000  # 128K tokens (common for modern models)

    # Model-specific context windows
    MODEL_CONTEXT_WINDOWS: dict[str, int] = {
        "gpt-4o": 128000,
        "gpt-4o-mini": 128000,
        "gpt-4-turbo": 128000,
        "gpt-4": 8192,
        "gpt-3.5-turbo": 16385,
        "claude-3-5-sonnet": 200000,
        "claude-3-opus": 200000,
        "claude-3-sonnet": 200000,
        "claude-3-haiku": 200000,
        "gemini-1.5-pro": 2000000,
        "gemini-1.5-flash": 1000000,
        "gemini-2.0-flash": 1000000,
    }

    def __init__(self) -> None:
        """
        Initialize the usage tracker.
        """
        self._agents: dict[str, AgentUsageStats] = {}
        self._model_overrides: dict[str, str] = {}  # agent_id -> model name

    def register_agent(
        self, agent_id: str, model: str | None = None
    ) -> AgentUsageStats:
        """
        Register an agent for usage tracking.

        Args:
            agent_id: Unique identifier for the agent.
            model: Optional model name for context window calculation.

        Returns:
            The usage stats object for the agent.
        """
        if agent_id not in self._agents:
            self._agents[agent_id] = AgentUsageStats(agent_id=agent_id)
            logger.info(f"Registered agent '{agent_id}' for usage tracking")

        if model:
            self._model_overrides[agent_id] = model

        return self._agents[agent_id]

    def unregister_agent(self, agent_id: str) -> None:
        """
        Remove an agent from usage tracking.
        """
        if agent_id in self._agents:
            del self._agents[agent_id]
            logger.info(f"Unregistered agent '{agent_id}' from usage tracking")
        if agent_id in self._model_overrides:
            del self._model_overrides[agent_id]

    def get_agent_stats(self, agent_id: str) -> AgentUsageStats | None:
        """
        Get usage stats for an agent.
        """
        return self._agents.get(agent_id)

    def get_or_create_stats(self, agent_id: str) -> AgentUsageStats:
        """
        Get or create usage stats for an agent.
        """
        if agent_id not in self._agents:
            return self.register_agent(agent_id)
        return self._agents[agent_id]

    def get_context_window(self, agent_id: str) -> int:
        """
        Get the context window size for an agent.
        """
        model = self._model_overrides.get(agent_id)
        if model:
            # Extract model name without provider prefix (e.g., "openai:gpt-4o" -> "gpt-4o")
            model_name = model.split(":")[-1] if ":" in model else model
            return self.MODEL_CONTEXT_WINDOWS.get(
                model_name, self.DEFAULT_CONTEXT_WINDOW
            )
        return self.DEFAULT_CONTEXT_WINDOW

    def set_model(self, agent_id: str, model: str) -> None:
        """
        Set the model for an agent (affects context window calculation).
        """
        self._model_overrides[agent_id] = model

    def update_usage(
        self,
        agent_id: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        requests: int = 0,
        tool_calls: int = 0,
        tool_names: list[str] | None = None,
        duration_ms: float = 0.0,
    ) -> None:
        """
        Update usage statistics for an agent.

        Args:
            agent_id: The agent identifier.
            input_tokens: Number of input tokens used.
            output_tokens: Number of output tokens used.
            cache_read_tokens: Number of tokens read from cache.
            cache_write_tokens: Number of tokens written to cache.
            requests: Number of API requests made.
            tool_calls: Number of tool calls executed.
            tool_names: List of tool names used in this request.
        """
        stats = self.get_or_create_stats(agent_id)
        stats.update_from_run_usage(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
            requests=requests,
            tool_calls=tool_calls,
            tool_names=tool_names,
            duration_ms=duration_ms,
        )

    def get_context_details(self, agent_id: str) -> dict[str, Any]:
        """
        Get context usage details for an agent.

        Returns a structured breakdown of context usage suitable
        for the frontend ContextUsage component.

        Args:
            agent_id: The agent identifier.

        Returns:
            Dictionary with context usage details.
        """
        stats = self._agents.get(agent_id)
        context_window = self.get_context_window(agent_id)

        if stats is None:
            # Return empty stats for unknown agent
            return {
                "name": "Context",
                "totalTokens": context_window,
                "usedTokens": 0,
                "children": [
                    {
                        "name": "Messages",
                        "value": 0,
                        "children": [
                            {"name": "User messages", "value": 0},
                            {"name": "Assistant responses", "value": 0},
                        ],
                    },
                    {
                        "name": "Tools",
                        "value": 0,
                        "children": [],
                    },
                ],
            }

        # Build the context breakdown
        # Messages category
        messages_category = UsageCategory(
            name="Messages",
            value=stats.user_message_tokens + stats.assistant_message_tokens,
            children=[
                UsageCategory(name="User messages", value=stats.user_message_tokens),
                UsageCategory(
                    name="Assistant responses", value=stats.assistant_message_tokens
                ),
            ],
        )

        # Tools category (estimate based on tool calls)
        # Rough estimate: ~500 tokens per tool call on average
        tool_tokens = stats.tool_calls * 500
        tools_category = UsageCategory(
            name="Tools",
            value=tool_tokens,
            children=[
                UsageCategory(name="Tool calls", value=tool_tokens),
            ]
            if tool_tokens > 0
            else [],
        )

        # System prompt category
        system_category = UsageCategory(
            name="System",
            value=stats.system_prompt_tokens,
            children=[
                UsageCategory(name="System prompt", value=stats.system_prompt_tokens),
            ]
            if stats.system_prompt_tokens > 0
            else [],
        )

        # Cache category
        cache_value = stats.cache_read_tokens + stats.cache_write_tokens
        cache_category = UsageCategory(
            name="Cache",
            value=cache_value,
            children=[
                UsageCategory(name="Cache read", value=stats.cache_read_tokens),
                UsageCategory(name="Cache write", value=stats.cache_write_tokens),
            ]
            if cache_value > 0
            else [],
        )

        # Total used tokens
        used_tokens = stats.total_tokens

        # Build children list, only including non-empty categories
        children = []
        if messages_category.value > 0:
            children.append(messages_category.to_dict())
        if tools_category.value > 0:
            children.append(tools_category.to_dict())
        if system_category.value > 0:
            children.append(system_category.to_dict())
        if cache_category.value > 0:
            children.append(cache_category.to_dict())

        # If no categories have data, add empty messages category
        if not children:
            children.append(
                {
                    "name": "Messages",
                    "value": 0,
                    "children": [
                        {"name": "User messages", "value": 0},
                        {"name": "Assistant responses", "value": 0},
                    ],
                }
            )

        return {
            "name": "Context",
            "totalTokens": context_window,
            "usedTokens": used_tokens,
            "children": children,
        }

    def list_agents(self) -> list[str]:
        """
        List all tracked agent IDs.
        """
        return list(self._agents.keys())

    def reset_agent(self, agent_id: str) -> None:
        """
        Reset usage statistics for an agent.
        """
        if agent_id in self._agents:
            self._agents[agent_id].reset()


# Global singleton instance
_usage_tracker: AgentUsageTracker | None = None


def get_usage_tracker() -> AgentUsageTracker:
    """
    Get the global usage tracker instance.
    """
    global _usage_tracker
    if _usage_tracker is None:
        _usage_tracker = AgentUsageTracker()
    return _usage_tracker


def _counted(*values: Any) -> int | None:
    """The first of several spellings of a count that is a number, as an int."""
    for value in values:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return int(value)
    return None


@dataclass
class TurnSpend:
    """
    What one turn of an agent spent, for the answer that ends it (O2-10).

    The tokens are the run's own count when the end of the run reports one,
    and otherwise what the agent's usage history grew by during the turn. The
    cost is what the agent's cost monitor priced during the turn, and there is
    none when nothing priced it: a model without a price is not free. Both are
    read from the agent's counters, so two turns of one agent at once share
    what they spent between them.
    """

    agent_id: str | None
    requests_before: int = 0
    priced_runs_before: int = 0
    cost_before: float = 0.0
    input_tokens: int | None = None
    output_tokens: int | None = None
    reported_total_tokens: int | None = None

    @classmethod
    def begin(cls, agent_id: str | None) -> "TurnSpend":
        """
        Start counting a turn.

        Parameters
        ----------
        agent_id : str | None
            The agent whose counters the turn moves; without one, only what
            the run reports is counted.

        Returns
        -------
        TurnSpend
            The count, as the turn starts.
        """
        if not agent_id:
            return cls(agent_id=None)
        stats = get_usage_tracker().get_agent_stats(agent_id)
        costs = get_cost_store().get_agent_usage(agent_id)
        return cls(
            agent_id=agent_id,
            requests_before=len(stats.request_usage_history) if stats else 0,
            priced_runs_before=costs.request_count if costs else 0,
            cost_before=costs.cumulative_cost_usd if costs else 0.0,
        )

    def reported(self, usage: Any) -> None:
        """
        Take the run's own count, as the end of the run reports it.

        Parameters
        ----------
        usage : Any
            ``input_tokens`` or ``prompt_tokens``, ``output_tokens`` or
            ``completion_tokens``, and ``total_tokens``; anything that is not a
            mapping reports nothing.
        """
        if not isinstance(usage, Mapping):
            return
        counted_input = _counted(usage.get("input_tokens"), usage.get("prompt_tokens"))
        counted_output = _counted(
            usage.get("output_tokens"), usage.get("completion_tokens")
        )
        counted_total = _counted(usage.get("total_tokens"))
        if counted_input is not None:
            self.input_tokens = counted_input
        if counted_output is not None:
            self.output_tokens = counted_output
        if counted_total is not None:
            self.reported_total_tokens = counted_total

    @property
    def total_tokens(self) -> int | None:
        """The run's total when it reported one, the sum of what was counted otherwise."""
        if self.reported_total_tokens is not None:
            return self.reported_total_tokens
        if self.input_tokens is None and self.output_tokens is None:
            return None
        return max((self.input_tokens or 0) + (self.output_tokens or 0), 0)

    def settle(self) -> Usage | None:
        """
        What the turn has spent, filling what the run did not report from the counters.

        Returns
        -------
        Usage | None
            The usage; ``None`` when nothing was counted at all.
        """
        if self.agent_id and (self.input_tokens is None or self.output_tokens is None):
            stats = get_usage_tracker().get_agent_stats(self.agent_id)
            grown = stats.request_usage_history[self.requests_before :] if stats else []
            if grown:
                if self.input_tokens is None:
                    self.input_tokens = sum(item.input_tokens for item in grown)
                if self.output_tokens is None:
                    self.output_tokens = sum(item.output_tokens for item in grown)
        cost: float | None = None
        costs = get_cost_store().get_agent_usage(self.agent_id) if self.agent_id else None
        if (
            costs is not None
            and costs.request_count > self.priced_runs_before
            and costs.runs
            and costs.runs[-1].pricing_resolved
        ):
            cost = max(costs.cumulative_cost_usd - self.cost_before, 0.0)
        if self.input_tokens is None and self.output_tokens is None and cost is None:
            return None
        return Usage(
            input_tokens=self.input_tokens, output_tokens=self.output_tokens, cost=cost
        )
