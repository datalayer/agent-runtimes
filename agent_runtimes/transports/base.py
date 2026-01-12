# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Base protocol adapter interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal

from ..adapters.base import BaseAgent


# Event types for adapters
AdapterEventType = Literal[
    "request",
    "response",
    "stream_start",
    "stream_chunk",
    "stream_end",
    "error",
]


@dataclass
class AdapterEvent:
    """Event emitted by protocol adapters.

    Attributes:
        type: Type of the event.
        data: Event payload data.
        metadata: Optional metadata about the event.
    """

    type: AdapterEventType
    data: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseTransport(ABC):
    """Abstract base class for protocol adapters.

    Protocol adapters translate between agent-runtimes' internal
    BaseAgent interface and external protocols like ACP, AG-UI, A2A, etc.

    Example:
        class MyProtocolAdapter(BaseAdapter):
            async def handle_request(self, request):
                # Translate protocol request to agent run
                response = await self.agent.run(...)
                # Translate response back to protocol format
                return protocol_response
    """

    def __init__(self, agent: BaseAgent):
        """Initialize the adapter.

        Args:
            agent: The agent to adapt.
        """
        self.agent = agent

    @property
    def protocol_name(self) -> str:
        """Get the protocol name (e.g., 'acp', 'ag-ui', 'a2a')."""
        return "unknown"

    @abstractmethod
    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Handle a protocol request.

        Args:
            request: Protocol-specific request data.

        Returns:
            Protocol-specific response data.
        """
        pass

    @abstractmethod
    async def handle_stream(
        self, request: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """Handle a streaming protocol request.

        Args:
            request: Protocol-specific request data.

        Yields:
            Protocol-specific stream events.
        """
        pass

    async def initialize(self) -> None:
        """Initialize the adapter.

        Called when the adapter is first set up.
        """
        await self.agent.initialize()

    async def cleanup(self) -> None:
        """Clean up adapter resources.

        Called when the adapter is being shut down.
        """
        await self.agent.cleanup()
