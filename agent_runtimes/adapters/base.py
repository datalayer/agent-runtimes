# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Base agent interface for agent-runtimes.

Provides an abstract base class that all agent implementations must follow,
enabling consistent protocol adapter integration.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional


@dataclass
class AgentContext:
    """Context for agent execution.

    Attributes:
        session_id: Unique session identifier.
        user_id: User identifier.
        conversation_history: Previous messages in the conversation.
        metadata: Additional context metadata.
    """

    session_id: str
    user_id: str = "default"
    conversation_history: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolCall:
    """A tool call requested by the agent.

    Attributes:
        id: Unique identifier for this tool call.
        name: Tool name.
        arguments: Tool arguments.
    """

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ToolResult:
    """Result of a tool execution.

    Attributes:
        tool_call_id: ID of the tool call this is a result for.
        result: The tool result data.
        error: Error message if the tool failed.
    """

    tool_call_id: str
    result: Any = None
    error: Optional[str] = None

    @property
    def success(self) -> bool:
        """Whether the tool execution was successful."""
        return self.error is None


@dataclass
class StreamEvent:
    """An event from the agent's streaming response.

    Attributes:
        type: Event type (text, tool_call, tool_result, done, error).
        data: Event data.
    """

    type: str  # "text", "tool_call", "tool_result", "done", "error"
    data: Any


@dataclass
class AgentResponse:
    """Complete response from an agent.

    Attributes:
        content: Text content of the response.
        tool_calls: Any tool calls made during execution.
        tool_results: Results of tool executions.
        usage: Token usage information.
        metadata: Additional response metadata.
    """

    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    tool_results: list[ToolResult] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolDefinition:
    """Definition of a tool available to the agent.

    Attributes:
        name: Tool name.
        description: Human-readable description.
        input_schema: JSON Schema for input parameters.
        output_schema: JSON Schema for output (optional).
    """

    name: str
    description: str
    input_schema: dict[str, Any] = field(default_factory=dict)
    output_schema: Optional[dict[str, Any]] = None


class BaseAgent(ABC):
    """Abstract base class for all agent implementations.

    This provides a consistent interface for agents that can be used
    with different protocol adapters (ACP, AG-UI, A2A, etc.).

    Example:
        class MyAgent(BaseAgent):
            async def run(self, prompt, context):
                # Implementation
                pass

            def get_tools(self):
                return [ToolDefinition(name="my_tool", ...)]
    """

    @abstractmethod
    async def run(
        self,
        prompt: str,
        context: AgentContext,
    ) -> AgentResponse:
        """Run the agent with a prompt.

        Args:
            prompt: User prompt/message.
            context: Execution context with session and history.

        Returns:
            Complete agent response.
        """
        pass

    @abstractmethod
    async def stream(
        self,
        prompt: str,
        context: AgentContext,
    ) -> AsyncIterator[StreamEvent]:
        """Run the agent with streaming output.

        Args:
            prompt: User prompt/message.
            context: Execution context with session and history.

        Yields:
            Stream events as they are produced.
        """
        pass

    @abstractmethod
    def get_tools(self) -> list[ToolDefinition]:
        """Get the list of tools available to this agent.

        Returns:
            List of tool definitions.
        """
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        """Get the agent's name."""
        pass

    @property
    def description(self) -> str:
        """Get the agent's description."""
        return ""

    @property
    def version(self) -> str:
        """Get the agent's version."""
        return "1.0.0"

    async def handle_tool_result(
        self,
        context: AgentContext,
        tool_result: ToolResult,
    ) -> Optional[AgentResponse]:
        """Handle a tool result and optionally continue execution.

        Some agents may need to continue processing after receiving
        tool results. Override this method to implement that behavior.

        Args:
            context: Execution context.
            tool_result: Result from tool execution.

        Returns:
            Optional continuation response.
        """
        return None

    async def initialize(self) -> None:
        """Initialize the agent.

        Called once when the agent is first created.
        Override to perform async setup.
        """
        pass

    async def cleanup(self) -> None:
        """Clean up agent resources.

        Called when the agent is being shut down.
        Override to perform async cleanup.
        """
        pass
