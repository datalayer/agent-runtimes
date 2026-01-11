# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2A (Agent-to-Agent) protocol adapter.

Implements the A2A protocol for agent-to-agent communication.
"""

import uuid
from typing import Any, AsyncIterator

from .base import BaseTransport


class A2ATransport(BaseTransport):
    """A2A (Agent-to-Agent) protocol adapter.

    Implements the A2A protocol for inter-agent communication.
    This protocol enables agents to communicate and collaborate.

    Protocol Features:
    - Standardized message format for agent communication
    - Task delegation support
    - Result aggregation
    - Capability negotiation

    Example:
        from agent_runtimes.agents import PydanticAIAgent
        from agent_runtimes.transports import A2ATransport

        agent = PydanticAIAgent(...)
        adapter = A2ATransport(agent)

        # Handle a request from another agent
        response = await adapter.handle_request({
            "task": "analyze_data",
            "data": {"values": [1, 2, 3]},
            "sender_agent_id": "agent-456",
            "conversation_id": "conv-789"
        })
    """

    @property
    def protocol_name(self) -> str:
        """Get the protocol name."""
        return "a2a"

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Handle an A2A request.

        Args:
            request: A2A request data with keys:
                - task: Task description
                - data: Task data/parameters
                - sender_agent_id: ID of the requesting agent
                - conversation_id: Conversation identifier
                - capabilities_required: Optional list of required capabilities

        Returns:
            A2A response data with keys:
                - result: Task result
                - status: Success/failure status
                - sender_agent_id: This agent's ID
                - receiver_agent_id: Original sender's ID
                - conversation_id: Conversation identifier
                - metadata: Additional response data
        """
        task = request.get("task", "")
        data = request.get("data", {})
        sender_agent_id = request.get("sender_agent_id", "")
        conversation_id = request.get("conversation_id", str(uuid.uuid4()))
        capabilities_required = request.get("capabilities_required", [])

        # Create agent context
        from ..adapters.base import AgentContext

        context = AgentContext(
            session_id=conversation_id,
            metadata={
                "sender_agent_id": sender_agent_id,
                "task": task,
                "data": data,
                "capabilities_required": capabilities_required,
            },
        )

        # Format prompt for the agent
        prompt = f"Task: {task}\n\nData: {data}"

        try:
            # Run the agent
            response = await self.agent.run(prompt, context)

            # Format A2A response
            return {
                "result": response.content,
                "status": "success",
                "sender_agent_id": self.agent.name,
                "receiver_agent_id": sender_agent_id,
                "conversation_id": conversation_id,
                "metadata": {
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "name": tc.name,
                            "arguments": tc.arguments,
                        }
                        for tc in response.tool_calls
                    ],
                    "usage": response.usage,
                    **response.metadata,
                },
            }

        except Exception as e:
            return {
                "result": None,
                "status": "error",
                "error": str(e),
                "sender_agent_id": self.agent.name,
                "receiver_agent_id": sender_agent_id,
                "conversation_id": conversation_id,
            }

    async def handle_stream(
        self, request: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """Handle a streaming A2A request.

        Args:
            request: A2A request data.

        Yields:
            A2A stream events with keys:
                - type: Event type (progress, result, error)
                - data: Event data
                - conversation_id: Conversation identifier
                - sender_agent_id: This agent's ID
        """
        task = request.get("task", "")
        data = request.get("data", {})
        sender_agent_id = request.get("sender_agent_id", "")
        conversation_id = request.get("conversation_id", str(uuid.uuid4()))

        # Create agent context
        from ..adapters.base import AgentContext

        context = AgentContext(
            session_id=conversation_id,
            metadata={
                "sender_agent_id": sender_agent_id,
                "task": task,
                "data": data,
            },
        )

        # Format prompt for the agent
        prompt = f"Task: {task}\n\nData: {data}"

        try:
            # Stream from agent
            async for event in self.agent.stream(prompt, context):
                # Map agent event types to A2A event types
                a2a_event = {
                    "type": "progress" if event.type == "text" else event.type,
                    "data": event.data,
                    "conversation_id": conversation_id,
                    "sender_agent_id": self.agent.name,
                    "receiver_agent_id": sender_agent_id,
                }

                # Format tool calls for A2A
                if event.type == "tool_call" and hasattr(event.data, "name"):
                    a2a_event["type"] = "tool_call"
                    a2a_event["data"] = {
                        "id": event.data.id,
                        "name": event.data.name,
                        "arguments": event.data.arguments,
                    }

                # Mark completion
                if event.type == "done":
                    a2a_event["type"] = "complete"
                    a2a_event["status"] = "success"

                yield a2a_event

        except Exception as e:
            yield {
                "type": "error",
                "data": str(e),
                "conversation_id": conversation_id,
                "sender_agent_id": self.agent.name,
                "receiver_agent_id": sender_agent_id,
                "status": "error",
            }
