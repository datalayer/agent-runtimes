# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Jupyter AI agent adapter.

Wraps a Jupyter AI agent to implement the BaseAgent interface,
enabling use with protocol adapters.
"""

from typing import Any, AsyncIterator, Optional

from .base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolDefinition,
)


class JupyterAIAdapter(BaseAgent):
    """Adapter for Jupyter AI agents.

    Wraps a Jupyter AI agent to provide a consistent interface
    for protocol adapters.

    Example:
        from jupyter_ai import ChatHandler

        # Create Jupyter AI handler
        jupyter_handler = ChatHandler(...)

        agent = JupyterAIAgent(
            handler=jupyter_handler,
            name="jupyter_ai_agent",
            description="A Jupyter AI assistant",
        )

        response = await agent.run("Hello!", context)
    """

    def __init__(
        self,
        handler: Any,  # jupyter_ai.chat_handlers.base.BaseChatHandler
        name: str = "jupyter_ai_agent",
        description: str = "A Jupyter AI powered agent",
        version: str = "1.0.0",
    ):
        """Initialize the Jupyter AI agent adapter.

        Args:
            handler: The Jupyter AI chat handler instance.
            name: Agent name.
            description: Agent description.
            version: Agent version.
        """
        self._handler = handler
        self._name = name
        self._description = description
        self._version = version
        self._tools: list[ToolDefinition] = []

    @property
    def name(self) -> str:
        """Get the agent name."""
        return self._name

    @property
    def description(self) -> str:
        """Get the agent description."""
        return self._description

    @property
    def version(self) -> str:
        """Get the agent version."""
        return self._version

    @property
    def tools(self) -> list[ToolDefinition]:
        """Get available tools."""
        # Jupyter AI has slash commands that could be exposed as tools
        return self._tools

    async def initialize(self) -> None:
        """Initialize the agent."""
        # Jupyter AI handlers are typically initialized on creation
        pass

    async def run(
        self,
        prompt: str,
        context: Optional[AgentContext] = None,
        tools: Optional[list[ToolDefinition]] = None,
    ) -> AgentResponse:
        """Run the agent with a prompt.

        Args:
            prompt: User prompt.
            context: Execution context.
            tools: Available tools (optional).

        Returns:
            Agent response.
        """
        try:
            # Jupyter AI uses a message-based interface
            # Build a message object
            message = {
                "type": "human",
                "content": prompt,
            }

            # Add conversation history if available
            history = []
            if context and context.conversation_history:
                history = context.conversation_history

            # Process the message
            response_content = ""
            
            # Jupyter AI's process() method typically expects a message object
            if hasattr(self._handler, "process_message"):
                result = await self._handler.process_message(message, history)
                response_content = result.get("content", "") if isinstance(result, dict) else str(result)
            elif hasattr(self._handler, "handle"):
                # Fallback to handle method
                result = await self._handler.handle(prompt, history)
                response_content = result if isinstance(result, str) else str(result)
            else:
                response_content = "Jupyter AI handler does not support message processing"

            return AgentResponse(
                content=response_content,
                metadata={"jupyter_ai": True},
            )

        except Exception as e:
            return AgentResponse(
                content=f"Error: {str(e)}",
                metadata={"error": str(e)},
            )

    async def stream(
        self,
        prompt: str,
        context: Optional[AgentContext] = None,
        tools: Optional[list[ToolDefinition]] = None,
    ) -> AsyncIterator[StreamEvent]:
        """Stream agent responses.

        Args:
            prompt: User prompt.
            context: Execution context.
            tools: Available tools (optional).

        Yields:
            Stream events.
        """
        try:
            # Jupyter AI supports streaming through its chat interface
            message = {
                "type": "human",
                "content": prompt,
            }

            history = []
            if context and context.conversation_history:
                history = context.conversation_history

            # Check if streaming is supported
            if hasattr(self._handler, "stream_message"):
                async for chunk in self._handler.stream_message(message, history):
                    if isinstance(chunk, dict):
                        content = chunk.get("content", "")
                        if content:
                            yield StreamEvent(type="text", data=content)
                    else:
                        yield StreamEvent(type="text", data=str(chunk))
                
                yield StreamEvent(type="done", data=None)
            else:
                # No streaming support, fall back to run()
                response = await self.run(prompt, context, tools)
                yield StreamEvent(type="text", data=response.content)
                yield StreamEvent(type="done", data=None)

        except Exception as e:
            yield StreamEvent(type="error", data=str(e))

    async def cancel(self) -> None:
        """Cancel the current execution."""
        # Jupyter AI handlers may have cancellation support
        if hasattr(self._handler, "cancel"):
            await self._handler.cancel()

    async def cleanup(self) -> None:
        """Clean up resources."""
        # Cleanup if needed
        if hasattr(self._handler, "close"):
            await self._handler.close()
