# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
AG-UI (Agent UI) protocol client.

Provides:
- HTTP-based communication with AG-UI compatible agent servers
- Server-Sent Events (SSE) streaming
- Message history management
- Tool call handling

AG-UI Protocol Reference: https://docs.ag-ui.com/

Example:
    async with AGUIClient("http://localhost:8000/api/v1/ag-ui/agent-1/") as client:
        async for event in client.run("Hello, agent!"):
            if event.type == "TEXT_MESSAGE_CONTENT":
                print(event.delta, end="", flush=True)
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator

try:
    import httpx

    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

# Import AG-UI protocol types
from ag_ui.core import (
    AssistantMessage,
    BaseEvent,
    EventType,
    Message,
    ToolMessage,
    UserMessage,
)

logger = logging.getLogger(__name__)


class AGUIClientError(Exception):
    """Error raised during AG-UI client operations."""

    pass


@dataclass
class AGUIEvent:
    """Parsed AG-UI event."""

    type: EventType
    data: dict[str, Any]
    raw_event: BaseEvent | None = None

    # Convenience properties for common event types
    @property
    def delta(self) -> str | None:
        """Get text delta for TEXT_MESSAGE_CONTENT events."""
        if self.type == EventType.TEXT_MESSAGE_CONTENT:
            return self.data.get("delta", "")
        return None

    @property
    def message_id(self) -> str | None:
        """Get message ID from event."""
        return self.data.get("message_id")

    @property
    def tool_call_id(self) -> str | None:
        """Get tool call ID from event."""
        return self.data.get("tool_call_id") or self.data.get("toolCallId")

    @property
    def tool_name(self) -> str | None:
        """Get tool name from TOOL_CALL_START events."""
        if self.type == EventType.TOOL_CALL_START:
            return self.data.get("tool_call_name") or self.data.get("toolCallName")
        return None

    @property
    def tool_args(self) -> str | None:
        """Get tool arguments delta from TOOL_CALL_ARGS events."""
        if self.type == EventType.TOOL_CALL_ARGS:
            return self.data.get("delta", "")
        return None

    @property
    def tool_result(self) -> str | None:
        """Get tool result from TOOL_CALL_RESULT events."""
        if self.type == EventType.TOOL_CALL_RESULT:
            return self.data.get("result")
        return None

    @property
    def error(self) -> str | None:
        """Get error message from RUN_ERROR events."""
        if self.type == EventType.RUN_ERROR:
            return self.data.get("message")
        return None


@dataclass
class AGUIConversation:
    """Manages conversation state for AG-UI client."""

    messages: list[Message] = field(default_factory=list)
    thread_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def add_user_message(self, content: str) -> UserMessage:
        """Add a user message to the conversation."""
        msg = UserMessage(
            id=str(uuid.uuid4()),
            content=content,
        )
        self.messages.append(msg)
        return msg

    def add_assistant_message(
        self, content: str, message_id: str | None = None
    ) -> AssistantMessage:
        """Add an assistant message to the conversation."""
        msg = AssistantMessage(
            id=message_id or str(uuid.uuid4()),
            content=content,
        )
        self.messages.append(msg)
        return msg

    def add_tool_message(self, tool_call_id: str, content: str) -> ToolMessage:
        """Add a tool result message to the conversation."""
        msg = ToolMessage(
            id=str(uuid.uuid4()),
            tool_call_id=tool_call_id,
            content=content,
        )
        self.messages.append(msg)
        return msg

    def clear(self) -> None:
        """Clear conversation history."""
        self.messages.clear()
        self.thread_id = str(uuid.uuid4())


class AGUIClient:
    """
    AG-UI (Agent UI) protocol client.

    Connects to AG-UI compatible agent servers via HTTP with SSE streaming.

    Example:
        async with AGUIClient("http://localhost:8000/api/v1/ag-ui/agent-1/") as client:
            async for event in client.run("Hello, agent!"):
                if event.type == EventType.TEXT_MESSAGE_CONTENT:
                    print(event.delta, end="", flush=True)
    """

    def __init__(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        timeout: float = 60.0,
        model: str | None = None,
    ):
        """
        Initialize the AG-UI client.

        Args:
            url: HTTP URL of the AG-UI endpoint (e.g., http://localhost:8000/api/v1/ag-ui/agent-1/).
            headers: Optional headers for HTTP requests.
            timeout: Request timeout in seconds.
            model: Optional model to use (overrides server default).
        """
        if not HAS_HTTPX:
            raise ImportError(
                "httpx package is required for AG-UI client. "
                "Install it with: pip install httpx"
            )

        # Ensure URL ends with trailing slash - mounted Starlette apps require it
        self.url = url.rstrip("/") + "/"
        self.headers = headers or {}
        self.timeout = timeout
        self.model = model

        self._client: httpx.AsyncClient | None = None
        self._conversation = AGUIConversation()

    async def connect(self) -> "AGUIClient":
        """
        Initialize the HTTP client.

        Returns:
            Self for chaining.
        """
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers=self.headers,
        )
        return self

    async def disconnect(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "AGUIClient":
        """Async context manager entry."""
        return await self.connect()

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.disconnect()

    async def run(
        self,
        input_text: str,
        context: list[dict[str, Any]] | None = None,
        tools: list[dict[str, Any]] | None = None,
        identities: list[dict[str, Any]] | None = None,
    ) -> AsyncGenerator[AGUIEvent, None]:
        """
        Run the agent on the given input with SSE streaming.

        Args:
            input_text: The input text to send to the agent.
            context: Optional context items (files, snippets, etc.).
            tools: Optional tool definitions for the agent.
            identities: Optional OAuth identities for tool authentication.

        Yields:
            AGUIEvent objects for each SSE event.
        """
        if not self._client:
            await self.connect()

        # Add user message to conversation
        self._conversation.add_user_message(input_text)

        # Build request payload with all required AG-UI fields
        payload: dict[str, Any] = {
            "thread_id": self._conversation.thread_id,
            "run_id": str(uuid.uuid4()),
            "messages": [self._message_to_dict(m) for m in self._conversation.messages],
            "state": {},  # Required by AG-UI protocol
            "tools": tools or [],  # Required by AG-UI protocol
            "context": context or [],  # Required by AG-UI protocol
            "forwardedProps": {},  # Required by AG-UI protocol
        }

        if identities:
            payload["identities"] = identities
        if self.model:
            payload["model"] = self.model

        # Track assistant response for conversation
        current_message_id: str | None = None
        current_content: list[str] = []

        if not self._client:
            raise AGUIClientError("Client not connected. Call connect() first.")

        try:
            async with self._client.stream(
                "POST",
                self.url,
                json=payload,
                headers={"Accept": "text/event-stream", **self.headers},
            ) as response:
                # Check for HTTP errors - must read body first for streaming responses
                if response.status_code >= 400:
                    await response.aread()
                    raise AGUIClientError(
                        f"HTTP error: {response.status_code} - {response.text}"
                    )

                async for line in response.aiter_lines():
                    if not line:
                        continue

                    # Parse SSE format: "data: {...}"
                    if line.startswith("data: "):
                        data_str = line[6:]  # Remove "data: " prefix

                        if data_str == "[DONE]":
                            break

                        try:
                            data = json.loads(data_str)
                            event = self._parse_event(data)

                            # Track message content
                            if event.type == EventType.TEXT_MESSAGE_START:
                                current_message_id = event.message_id
                                current_content = []
                            elif event.type == EventType.TEXT_MESSAGE_CONTENT:
                                if event.delta:
                                    current_content.append(event.delta)
                            elif event.type == EventType.TEXT_MESSAGE_END:
                                # Add assistant message to conversation
                                if current_content:
                                    self._conversation.add_assistant_message(
                                        "".join(current_content),
                                        message_id=current_message_id,
                                    )

                            yield event

                        except json.JSONDecodeError as e:
                            logger.warning(f"Failed to parse SSE data: {e}")
                            continue

        except AGUIClientError:
            # Re-raise our own errors
            raise
        except httpx.RequestError as e:
            raise AGUIClientError(f"Request error: {e}")
        except Exception as e:
            raise AGUIClientError(f"Unexpected error: {e}")

    async def send_message(
        self,
        content: str,
        **kwargs: Any,
    ) -> AsyncGenerator[AGUIEvent, None]:
        """
        Send a message to the agent and stream responses.

        Convenience method that wraps run().

        Args:
            content: The message content.
            **kwargs: Additional arguments passed to run().

        Yields:
            AGUIEvent objects.
        """
        async for event in self.run(content, **kwargs):
            yield event

    async def run_with_tools(
        self,
        input_text: str,
        tool_handler: Any,  # Callable[[str, str, dict], Any]
        **kwargs: Any,
    ) -> AsyncGenerator[AGUIEvent, None]:
        """
        Run the agent with automatic tool execution.

        Args:
            input_text: The input text to send to the agent.
            tool_handler: Async function to handle tool calls: (tool_name, tool_call_id, args) -> result
            **kwargs: Additional arguments passed to run().

        Yields:
            AGUIEvent objects including tool execution results.
        """
        pending_tool_calls: dict[
            str, dict[str, Any]
        ] = {}  # tool_call_id -> {name, args}

        async for event in self.run(input_text, **kwargs):
            yield event

            # Track tool calls
            if event.type == EventType.TOOL_CALL_START:
                tool_call_id = event.tool_call_id
                if tool_call_id:
                    pending_tool_calls[tool_call_id] = {
                        "name": event.tool_name,
                        "args": "",
                    }

            elif event.type == EventType.TOOL_CALL_ARGS:
                tool_call_id = event.tool_call_id
                if tool_call_id and tool_call_id in pending_tool_calls:
                    pending_tool_calls[tool_call_id]["args"] += event.tool_args or ""

            elif event.type == EventType.TOOL_CALL_END:
                tool_call_id = event.tool_call_id
                if tool_call_id and tool_call_id in pending_tool_calls:
                    tool_info = pending_tool_calls.pop(tool_call_id)

                    # Parse args and execute tool
                    try:
                        args = (
                            json.loads(tool_info["args"]) if tool_info["args"] else {}
                        )
                        result = await tool_handler(
                            tool_info["name"], tool_call_id, args
                        )

                        # Add tool result to conversation
                        self._conversation.add_tool_message(tool_call_id, str(result))

                    except Exception as e:
                        logger.error(f"Tool execution error: {e}")
                        self._conversation.add_tool_message(tool_call_id, f"Error: {e}")

    def new_conversation(self) -> None:
        """Start a new conversation (clears history)."""
        self._conversation.clear()

    @property
    def conversation(self) -> AGUIConversation:
        """Get the current conversation."""
        return self._conversation

    @property
    def messages(self) -> list[Message]:
        """Get conversation messages."""
        return self._conversation.messages

    @property
    def thread_id(self) -> str:
        """Get the current thread ID."""
        return self._conversation.thread_id

    def _message_to_dict(self, message: Message) -> dict[str, Any]:
        """Convert a Message to a dictionary for the API."""
        if isinstance(message, UserMessage):
            return {
                "id": message.id,
                "role": "user",
                "content": message.content,
            }
        elif isinstance(message, AssistantMessage):
            return {
                "id": message.id,
                "role": "assistant",
                "content": message.content,
            }
        elif isinstance(message, ToolMessage):
            return {
                "id": message.id,
                "role": "tool",
                "tool_call_id": message.tool_call_id,
                "content": message.content,
            }
        else:
            # Generic message
            return {
                "id": getattr(message, "id", str(uuid.uuid4())),
                "role": getattr(message, "role", "user"),
                "content": getattr(message, "content", ""),
            }

    def _parse_event(self, data: dict[str, Any]) -> AGUIEvent:
        """Parse an SSE event data dictionary into an AGUIEvent."""
        event_type_str = data.get("type", "")

        try:
            event_type = EventType(event_type_str)
        except ValueError:
            # Unknown event type, use a generic type
            logger.debug(f"Unknown event type: {event_type_str}")
            event_type = EventType.CUSTOM

        return AGUIEvent(
            type=event_type,
            data=data,
        )


async def connect_agui(
    url: str,
    headers: dict[str, str] | None = None,
    timeout: float = 60.0,
    model: str | None = None,
) -> AGUIClient:
    """
    Connect to an AG-UI compatible agent server.

    Convenience function for creating and connecting an AG-UI client.

    Args:
        url: HTTP URL of the AG-UI endpoint.
        headers: Optional headers for HTTP requests.
        timeout: Request timeout in seconds.
        model: Optional model to use.

    Returns:
        Connected AG-UI client.

    Example:
        client = await connect_agui("http://localhost:8000/api/v1/ag-ui/my-agent/")
        async for event in client.run("Hello!"):
            print(event)
        await client.disconnect()
    """
    client = AGUIClient(url, headers, timeout, model)
    return await client.connect()
