# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""LangChain agent adapter.

Wraps a LangChain agent/chain to implement the BaseAgent interface,
enabling use with protocol adapters.
"""

from typing import Any, AsyncIterator, Optional

from .base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolCall,
    ToolDefinition,
    ToolResult,
)


class LangChainAdapter(BaseAgent):
    """Adapter for LangChain agents.

    Wraps a LangChain agent or chain to provide a consistent interface
    for protocol adapters.

    Example:
        from langchain.agents import AgentExecutor
        from langchain.tools import Tool

        # Create LangChain agent
        langchain_agent = AgentExecutor(...)

        agent = LangChainAgent(
            agent=langchain_agent,
            name="langchain_agent",
            description="A LangChain powered assistant",
        )

        response = await agent.run("Hello!", context)
    """

    def __init__(
        self,
        agent: Any,  # langchain.agents.AgentExecutor or similar
        name: str = "langchain_agent",
        description: str = "A LangChain powered agent",
        version: str = "1.0.0",
    ):
        """Initialize the LangChain agent adapter.

        Args:
            agent: The LangChain agent/chain instance.
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
        """Extract tool definitions from the LangChain agent."""
        # LangChain agents have tools in .tools attribute
        if hasattr(self._agent, "tools"):
            for tool in self._agent.tools:
                # Extract schema from LangChain tool
                schema = {}
                if hasattr(tool, "args_schema") and tool.args_schema:
                    # Convert Pydantic schema to JSON schema
                    schema = tool.args_schema.model_json_schema()
                elif hasattr(tool, "args"):
                    # Fallback to args dict if available
                    schema = {
                        "type": "object",
                        "properties": {
                            k: {"type": "string"} for k in tool.args.keys()
                        },
                    }

                self._tools.append(
                    ToolDefinition(
                        name=tool.name,
                        description=tool.description or "",
                        input_schema=schema,
                    )
                )

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
        return self._tools

    async def initialize(self) -> None:
        """Initialize the agent."""
        # LangChain agents typically don't need explicit initialization
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
            tools: Available tools (optional, uses agent's tools if not provided).

        Returns:
            Agent response.
        """
        # Build input for LangChain
        input_data = {"input": prompt}

        # Add conversation history if available
        if context and context.conversation_history:
            input_data["chat_history"] = context.conversation_history

        # Run the agent
        try:
            if hasattr(self._agent, "ainvoke"):
                # Use async method if available
                result = await self._agent.ainvoke(input_data)
            else:
                # Fallback to sync method (will block)
                result = self._agent.invoke(input_data)

            # Extract output
            output = result.get("output", "") if isinstance(result, dict) else str(result)

            # Extract tool calls if present
            tool_calls = []
            if isinstance(result, dict) and "intermediate_steps" in result:
                for i, (action, observation) in enumerate(result["intermediate_steps"]):
                    tool_calls.append(
                        ToolCall(
                            id=f"call_{i}",
                            name=action.tool,
                            arguments=action.tool_input if isinstance(action.tool_input, dict) else {"input": action.tool_input},
                        )
                    )

            return AgentResponse(
                content=output,
                tool_calls=tool_calls,
                metadata={"langchain_result": result},
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
        # Build input for LangChain
        input_data = {"input": prompt}

        if context and context.conversation_history:
            input_data["chat_history"] = context.conversation_history

        # Check if streaming is supported
        if hasattr(self._agent, "astream") or hasattr(self._agent, "astream_events"):
            try:
                # Use astream_events if available (more detailed)
                if hasattr(self._agent, "astream_events"):
                    async for event in self._agent.astream_events(input_data, version="v1"):
                        event_type = event.get("event", "")
                        
                        if event_type == "on_chat_model_stream":
                            # Stream text chunks
                            chunk = event.get("data", {}).get("chunk", {})
                            if hasattr(chunk, "content") and chunk.content:
                                yield StreamEvent(type="text", data=chunk.content)
                        
                        elif event_type == "on_tool_start":
                            # Tool call started
                            tool_name = event.get("name", "")
                            tool_input = event.get("data", {}).get("input", {})
                            yield StreamEvent(
                                type="tool_call",
                                data=ToolCall(
                                    id=event.get("run_id", ""),
                                    name=tool_name,
                                    arguments=tool_input,
                                ),
                            )
                        
                        elif event_type == "on_tool_end":
                            # Tool call completed
                            yield StreamEvent(
                                type="tool_result",
                                data=ToolResult(
                                    tool_call_id=event.get("run_id", ""),
                                    result=event.get("data", {}).get("output"),
                                ),
                            )

                # Fallback to astream
                elif hasattr(self._agent, "astream"):
                    async for chunk in self._agent.astream(input_data):
                        if isinstance(chunk, dict) and "output" in chunk:
                            yield StreamEvent(type="text", data=chunk["output"])
                        else:
                            yield StreamEvent(type="text", data=str(chunk))

                yield StreamEvent(type="done", data=None)

            except Exception as e:
                yield StreamEvent(type="error", data=str(e))
        else:
            # No streaming support, fall back to run()
            response = await self.run(prompt, context, tools)
            yield StreamEvent(type="text", data=response.content)
            yield StreamEvent(type="done", data=None)

    async def cancel(self) -> None:
        """Cancel the current execution."""
        # LangChain doesn't have built-in cancellation
        # This would need to be implemented based on the specific agent type
        pass

    async def cleanup(self) -> None:
        """Clean up resources."""
        # Cleanup if needed
        pass
