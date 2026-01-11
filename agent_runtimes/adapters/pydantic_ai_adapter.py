# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic AI agent adapter.

Wraps a Pydantic AI Agent to implement the BaseAgent interface,
enabling use with protocol adapters.
"""

import logging
import uuid
from typing import Any, AsyncIterator

from pydantic_ai import Agent

from .base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolCall,
    ToolDefinition,
)


logger = logging.getLogger(__name__)


class PydanticAIAdapter(BaseAgent):
    """Adapter for Pydantic AI agents.

    Wraps a pydantic_ai.Agent to provide a consistent interface
    for protocol adapters.

    Example:
        from pydantic_ai import Agent

        pydantic_agent = Agent("openai:gpt-4o", instructions="...")

        agent = PydanticAIAgent(
            agent=pydantic_agent,
            name="my_agent",
            description="A helpful assistant",
        )

        response = await agent.run("Hello!", context)
    """

    def __init__(
        self,
        agent: Agent,
        name: str = "pydantic_ai_agent",
        description: str = "A Pydantic AI powered agent",
        version: str = "1.0.0",
    ):
        """Initialize the Pydantic AI agent adapter.

        Args:
            agent: The Pydantic AI Agent instance.
            name: Agent name.
            description: Agent description.
            version: Agent version.
        """
        self._agent = agent
        self._name = name
        self._description = description
        self._version = version
        self._tools: list[ToolDefinition] = []
        self._extract_tools()

    def _extract_tools(self) -> None:
        """Extract tool definitions from the Pydantic AI agent."""
        # Pydantic AI agents have tools registered via decorators
        # We need to extract them for the protocol adapters
        if hasattr(self._agent, "_tools"):
            for tool_name, tool_func in self._agent._tools.items():
                # Try to extract schema from the function
                schema = {}
                if hasattr(tool_func, "__annotations__"):
                    # Build a simple schema from annotations
                    properties = {}
                    for param_name, param_type in tool_func.__annotations__.items():
                        if param_name == "return":
                            continue
                        type_map = {
                            str: "string",
                            int: "integer",
                            float: "number",
                            bool: "boolean",
                            list: "array",
                            dict: "object",
                        }
                        properties[param_name] = {
                            "type": type_map.get(param_type, "string")
                        }
                    schema = {"type": "object", "properties": properties}

                self._tools.append(
                    ToolDefinition(
                        name=tool_name,
                        description=getattr(tool_func, "__doc__", "") or "",
                        input_schema=schema,
                    )
                )

    @property
    def name(self) -> str:
        """Get the agent's name."""
        return self._name

    @property
    def description(self) -> str:
        """Get the agent's description."""
        return self._description

    @property
    def version(self) -> str:
        """Get the agent's version."""
        return self._version

    @property
    def pydantic_agent(self) -> Agent:
        """Get the underlying Pydantic AI agent."""
        return self._agent

    def get_tools(self) -> list[ToolDefinition]:
        """Get the list of tools available to this agent."""
        return self._tools.copy()

    async def run(
        self,
        prompt: str,
        context: AgentContext,
    ) -> AgentResponse:
        """Run the agent with a prompt.

        Args:
            prompt: User prompt/message.
            context: Execution context.

        Returns:
            Complete agent response.
        """
        # Build message history from context
        message_history = []
        for msg in context.conversation_history:
            message_history.append(msg)

        # Extract model from context metadata for per-request model override
        model_override = context.metadata.get("model") if context.metadata else None

        try:
            # Run the Pydantic AI agent
            # Pass model override if provided in context metadata
            run_kwargs = {
                "message_history": message_history if message_history else None,
            }
            if model_override:
                run_kwargs["model"] = model_override
                logger.info(f"PydanticAIAdapter: Using model override: {model_override}")
            
            result = await self._agent.run(prompt, **run_kwargs)

            # Extract response content
            content = str(result.output) if result.output else ""

            # Extract tool calls if any
            tool_calls = []
            tool_results = []

            # Pydantic AI handles tool calls internally, but we can
            # extract them from the messages if needed
            if hasattr(result, "_messages"):
                for msg in result._messages:
                    if hasattr(msg, "tool_calls"):
                        for tc in msg.tool_calls:
                            tool_calls.append(
                                ToolCall(
                                    id=str(uuid.uuid4()),
                                    name=tc.name,
                                    arguments=tc.arguments,
                                )
                            )

            # Extract usage information
            usage = {}
            if hasattr(result, "usage"):
                usage = {
                    "prompt_tokens": getattr(result.usage, "prompt_tokens", 0),
                    "completion_tokens": getattr(
                        result.usage, "completion_tokens", 0
                    ),
                    "total_tokens": getattr(result.usage, "total_tokens", 0),
                }

            return AgentResponse(
                content=content,
                tool_calls=tool_calls,
                tool_results=tool_results,
                usage=usage,
            )

        except Exception as e:
            return AgentResponse(
                content=f"Error: {str(e)}",
                metadata={"error": str(e)},
            )

    async def stream(
        self,
        prompt: str,
        context: AgentContext,
    ) -> AsyncIterator[StreamEvent]:
        """Run the agent with streaming output.

        Args:
            prompt: User prompt/message.
            context: Execution context.

        Yields:
            Stream events as they are produced.
        """
        # Build message history from context
        message_history = []
        for msg in context.conversation_history:
            message_history.append(msg)

        # Extract model from context metadata for per-request model override
        model_override = context.metadata.get("model") if context.metadata else None

        try:
            # Use Pydantic AI's run_stream for proper streaming
            # Pass model override if provided in context metadata
            stream_kwargs = {
                "message_history": message_history if message_history else None,
            }
            if model_override:
                stream_kwargs["model"] = model_override
                logger.info(f"PydanticAIAdapter: Using model override for stream: {model_override}")
            
            async with self._agent.run_stream(prompt, **stream_kwargs) as result:
                # stream_text() yields cumulative text, we need deltas
                last_text = ""
                async for text in result.stream_text():
                    # Calculate delta (new text since last chunk)
                    if text and len(text) > len(last_text):
                        delta = text[len(last_text):]
                        last_text = text
                        yield StreamEvent(type="text", data=delta)

            yield StreamEvent(type="done", data=None)

        except Exception as e:
            yield StreamEvent(type="error", data=str(e))

    async def run_with_codemode(
        self,
        prompt: str,
        context: AgentContext,
        codemode_executor: Any,
    ) -> AgentResponse:
        """Run the agent with CodeMode for programmatic tool composition.

        This variant allows the agent to use mcp-codemode for executing
        code that composes multiple tools efficiently.

        Args:
            prompt: User prompt/message.
            context: Execution context.
            codemode_executor: CodeModeExecutor instance.

        Returns:
            Complete agent response.
        """
        # Add CodeMode tools to the context
        meta_tools_info = """
You have access to CodeMode for programmatic tool composition.
When you need to chain multiple tool calls or perform complex operations,
you can use the execute_code tool to run Python code that calls tools directly.

Available meta-tools:
- search_tools(query): Search for available tools
- list_tool_names(): List all tool names
- get_tool_definition(name): Get a tool's schema
- execute_code(code): Execute Python code that uses tools

Example code for execute_code:
```python
from generated.servers.bash import ls, cat

files = await ls({"path": "/tmp"})
for f in files:
    content = await cat({"path": f})
    print(content)
```
"""
        enhanced_prompt = f"{prompt}\n\n{meta_tools_info}"

        return await self.run(enhanced_prompt, context)
