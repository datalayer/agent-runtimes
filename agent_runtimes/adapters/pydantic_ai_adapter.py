# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Pydantic AI agent adapter.

Wraps a Pydantic AI Agent to implement the BaseAgent interface,
enabling use with protocol adapters.
"""

import logging
import uuid
from typing import Any, AsyncIterator

from pydantic_ai import Agent

from ..context.usage import get_usage_tracker
from ..mcp.lifecycle import get_mcp_lifecycle_manager
from .base import (
    AgentContext,
    AgentResponse,
    BaseAgent,
    StreamEvent,
    ToolCall,
    ToolDefinition,
    ToolResult,
)

logger = logging.getLogger(__name__)


class PydanticAIAdapter(BaseAgent):
    """
    Adapter for Pydantic AI agents.

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
        agent_id: str | None = None,
        selected_mcp_servers: list[Any] | None = None,
        non_mcp_toolsets: list[Any] | None = None,
        codemode_builder: Any = None,
    ):
        """
        Initialize the Pydantic AI agent adapter.

        Args:
            agent: The Pydantic AI Agent instance.
            name: Agent name.
            description: Agent description.
            version: Agent version.
            agent_id: Unique identifier for usage tracking (defaults to name).
            selected_mcp_servers: List of MCP server selections to use.
            non_mcp_toolsets: List of non-MCP toolsets (e.g., codemode, skills) to always include.
            codemode_builder: Optional callable to rebuild codemode toolset when MCP servers change.
        """
        self._agent = agent
        self._name = name
        self._description = description
        self._version = version
        self._agent_id = agent_id or name.lower().replace(" ", "-")
        self._tools: list[ToolDefinition] = []
        self._selected_mcp_servers = selected_mcp_servers or []
        self._non_mcp_toolsets = non_mcp_toolsets or []
        self._codemode_builder = codemode_builder
        self._codemode_toolset_index = None
        # Find codemode toolset in non_mcp_toolsets if it exists
        for i, toolset in enumerate(self._non_mcp_toolsets):
            if (
                hasattr(toolset, "__class__")
                and "CodemodeToolset" in toolset.__class__.__name__
            ):
                self._codemode_toolset_index = i
                logger.info(
                    f"PydanticAIAdapter [{self._name}]: Found CodemodeToolset at index {i}"
                )
                break
        self._extract_tools()

        # Register with usage tracker
        tracker = get_usage_tracker()
        # Try to extract model from agent
        model = getattr(agent, "model", None)
        model_str = str(model) if model else None
        tracker.register_agent(self._agent_id, model=model_str)

    def _extract_tools(self) -> None:
        """
        Extract tool definitions from the Pydantic AI agent.
        """
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
        """
        Get the agent's name.
        """
        return self._name

    @property
    def description(self) -> str:
        """
        Get the agent's description.
        """
        return self._description

    @property
    def version(self) -> str:
        """
        Get the agent's version.
        """
        return self._version

    @property
    def agent_id(self) -> str:
        """
        Get the agent's unique identifier for usage tracking.
        """
        return self._agent_id

    @property
    def selected_mcp_server_ids(self) -> list[str]:
        """
        Get the list of selected MCP server IDs.
        """
        return [getattr(s, "id", str(s)) for s in self._selected_mcp_servers]

    @property
    def codemode_enabled(self) -> bool:
        """
        Check if codemode is currently enabled.
        """
        return self._codemode_toolset_index is not None

    def set_codemode_enabled(self, enabled: bool) -> bool:
        """
        Enable or disable codemode at runtime.

        When enabling, builds a new CodemodeToolset using the codemode_builder.
        When disabling, removes the existing CodemodeToolset.

        Args:
            enabled: Whether to enable (True) or disable (False) codemode.

        Returns:
            True if the operation succeeded, False otherwise.
        """
        current_enabled = self._codemode_toolset_index is not None

        if enabled == current_enabled:
            logger.info(
                f"PydanticAIAdapter [{self._name}]: Codemode already {'enabled' if enabled else 'disabled'}"
            )
            return True

        if enabled:
            # Enable codemode
            if not self._codemode_builder:
                logger.error(
                    f"PydanticAIAdapter [{self._name}]: Cannot enable codemode - no codemode_builder provided"
                )
                return False

            try:
                logger.info(f"PydanticAIAdapter [{self._name}]: Enabling codemode")
                new_codemode = self._codemode_builder(self._selected_mcp_servers)
                if new_codemode:
                    self._non_mcp_toolsets.append(new_codemode)
                    self._codemode_toolset_index = len(self._non_mcp_toolsets) - 1
                    logger.info(
                        f"PydanticAIAdapter [{self._name}]: Codemode enabled at index {self._codemode_toolset_index}"
                    )
                    return True
                else:
                    logger.warning(
                        f"PydanticAIAdapter [{self._name}]: codemode_builder returned None"
                    )
                    return False
            except Exception as e:
                logger.error(
                    f"PydanticAIAdapter [{self._name}]: Failed to enable codemode: {e}",
                    exc_info=True,
                )
                return False
        else:
            # Disable codemode
            if self._codemode_toolset_index is not None:
                try:
                    logger.info(f"PydanticAIAdapter [{self._name}]: Disabling codemode")
                    self._non_mcp_toolsets.pop(self._codemode_toolset_index)
                    self._codemode_toolset_index = None
                    logger.info(f"PydanticAIAdapter [{self._name}]: Codemode disabled")
                    return True
                except Exception as e:
                    logger.error(
                        f"PydanticAIAdapter [{self._name}]: Failed to disable codemode: {e}",
                        exc_info=True,
                    )
                    return False
            return True

    def update_mcp_servers(self, servers: list[Any]) -> None:
        """
        Update the list of selected MCP servers.

        Also rebuilds Codemode toolset if a builder was provided, to ensure
        tool bindings reflect the current MCP server selection.

        Args:
            servers: New list of MCP server selections to use.
        """
        old_servers = self._selected_mcp_servers
        self._selected_mcp_servers = (
            servers.copy()
        )  # Make a copy to avoid reference issues
        logger.info(
            f"PydanticAIAdapter [{self._name}]: Updated MCP servers from {old_servers} to {self._selected_mcp_servers}"
        )

        # Rebuild Codemode toolset if builder is available and we have a codemode toolset
        if self._codemode_builder and self._codemode_toolset_index is not None:
            try:
                logger.info(
                    f"PydanticAIAdapter [{self._name}]: Rebuilding CodemodeToolset with new MCP servers"
                )
                new_codemode = self._codemode_builder(servers)
                if new_codemode:
                    self._non_mcp_toolsets[self._codemode_toolset_index] = new_codemode
                    logger.info(
                        f"PydanticAIAdapter [{self._name}]: Successfully rebuilt CodemodeToolset"
                    )
                else:
                    # If no servers, remove codemode toolset
                    logger.info(
                        f"PydanticAIAdapter [{self._name}]: No MCP servers, removing CodemodeToolset"
                    )
                    self._non_mcp_toolsets.pop(self._codemode_toolset_index)
                    self._codemode_toolset_index = None
            except Exception as e:
                logger.error(
                    f"PydanticAIAdapter [{self._name}]: Failed to rebuild CodemodeToolset: {e}",
                    exc_info=True,
                )

    @property
    def pydantic_agent(self) -> Agent:
        """
        Get the underlying Pydantic AI agent.
        """
        return self._agent

    def _get_runtime_toolsets(self) -> list[Any]:
        """
        Get the list of toolsets to use at run time.

        This dynamically fetches MCP toolsets based on selected_mcp_servers,
        ensuring only currently running servers are included.

        Note: When codemode is enabled (CodemodeToolset present), MCP servers
        are NOT added directly as toolsets. Instead, the CodemodeToolset has
        its own registry containing the MCP servers, and tools are accessed
        via discovery tools (search_tools, get_tool_details, call_tool).

        Returns:
            List of toolsets including MCP servers and non-MCP toolsets.
        """
        toolsets = []

        # Log current state
        logger.info(
            f"PydanticAIAdapter [{self._name}]: _get_runtime_toolsets called, selected_mcp_servers={self._selected_mcp_servers}"
        )

        # Check if codemode is enabled (CodemodeToolset present in non_mcp_toolsets)
        codemode_enabled = self._codemode_toolset_index is not None

        # Dynamically fetch MCP toolsets for selected servers
        # But ONLY if codemode is NOT enabled (codemode has its own MCP registry)
        if self._selected_mcp_servers and not codemode_enabled:
            logger.info(
                f"PydanticAIAdapter [{self._name}]: Fetching toolsets for servers: {self._selected_mcp_servers}"
            )
            lifecycle_manager = get_mcp_lifecycle_manager()

            for selection in self._selected_mcp_servers:
                server_id = getattr(selection, "id", None)
                origin = getattr(selection, "origin", None)
                if not server_id or origin not in {"config", "catalog"}:
                    continue

                is_config = origin == "config"
                instance = lifecycle_manager.get_running_server(
                    server_id, is_config=is_config
                )
                if instance and instance.is_running:
                    pydantic_server = instance.pydantic_server
                    # Debug: log toolset details to help trace errors
                    try:
                        toolset_id = (
                            pydantic_server.id
                            if hasattr(pydantic_server, "id")
                            else "no-id"
                        )
                        toolset_label = (
                            pydantic_server.label
                            if hasattr(pydantic_server, "label")
                            else "no-label"
                        )
                        toolset_class = type(pydantic_server).__name__
                        logger.info(
                            f"PydanticAIAdapter [{self._name}]: Toolset details - class={toolset_class}, id={toolset_id}, label={toolset_label}"
                        )

                        # Verify id is a property not a method
                        id_attr = getattr(type(pydantic_server), "id", None)
                        logger.debug(
                            f"PydanticAIAdapter [{self._name}]: id attr type: {type(id_attr)}, is property: {isinstance(id_attr, property)}"
                        )
                    except Exception as debug_err:
                        logger.error(
                            f"PydanticAIAdapter [{self._name}]: Error inspecting toolset: {debug_err}",
                            exc_info=True,
                        )

                    toolsets.append(pydantic_server)
                    logger.info(
                        f"PydanticAIAdapter [{self._name}]: Added {origin} MCP server '{server_id}' toolset"
                    )
                else:
                    logger.warning(
                        f"PydanticAIAdapter [{self._name}]: {origin} MCP server '{server_id}' not running, skipping"
                    )

        elif codemode_enabled:
            logger.info(
                f"PydanticAIAdapter [{self._name}]: Codemode enabled - MCP servers accessed via CodemodeToolset registry, not as direct toolsets"
            )
        else:
            logger.info(
                f"PydanticAIAdapter [{self._name}]: No MCP servers selected (list is empty)"
            )

        # Always include non-MCP toolsets (codemode, skills, etc.)
        for i, ts in enumerate(self._non_mcp_toolsets):
            try:
                ts_class = type(ts).__name__
                ts_id = ts.id if hasattr(ts, "id") else "no-id"
                logger.debug(
                    f"PydanticAIAdapter [{self._name}]: Non-MCP toolset {i}: class={ts_class}, id={ts_id}"
                )
            except Exception as debug_err:
                logger.error(
                    f"PydanticAIAdapter [{self._name}]: Error inspecting non-MCP toolset {i}: {debug_err}",
                    exc_info=True,
                )
        toolsets.extend(self._non_mcp_toolsets)

        mcp_count = len(toolsets) - len(self._non_mcp_toolsets)
        logger.info(
            f"PydanticAIAdapter [{self._name}]: Total toolsets for run: {len(toolsets)} (MCP: {mcp_count}, non-MCP: {len(self._non_mcp_toolsets)})"
        )
        return toolsets

    def get_tools(self) -> list[ToolDefinition]:
        """
        Get the list of tools available to this agent.
        """
        return self._tools.copy()

    async def run(
        self,
        prompt: str,
        context: AgentContext,
    ) -> AgentResponse:
        """
        Run the agent with a prompt.

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
                logger.info(
                    f"PydanticAIAdapter: Using model override: {model_override}"
                )

            # Dynamically get toolsets at run time to reflect current MCP server state
            runtime_toolsets = self._get_runtime_toolsets()
            # Always pass toolsets to override any default toolsets on the agent
            # Even an empty list should be passed to ensure no tools are available
            run_kwargs["toolsets"] = runtime_toolsets
            logger.debug(
                f"PydanticAIAdapter: Using {len(runtime_toolsets)} runtime toolsets"
            )

            result = await self._agent.run(prompt, **run_kwargs)

            # Extract response content
            content = str(result.output) if result.output else ""

            # Extract tool calls if any
            tool_calls: list[ToolCall] = []
            tool_results: list[ToolResult] = []

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

            # Extract usage information and track it
            usage = {}
            tracker = get_usage_tracker()

            # Pydantic AI uses result.usage() method which returns RunUsage
            if hasattr(result, "usage"):
                run_usage = result.usage()
                usage = {
                    "prompt_tokens": getattr(run_usage, "input_tokens", 0),
                    "completion_tokens": getattr(run_usage, "output_tokens", 0),
                    "total_tokens": getattr(run_usage, "total_tokens", 0),
                }

                # Update the usage tracker with real data
                tracker.update_usage(
                    agent_id=self._agent_id,
                    input_tokens=getattr(run_usage, "input_tokens", 0),
                    output_tokens=getattr(run_usage, "output_tokens", 0),
                    cache_read_tokens=getattr(run_usage, "cache_read_tokens", 0),
                    cache_write_tokens=getattr(run_usage, "cache_write_tokens", 0),
                    requests=getattr(run_usage, "requests", 1),
                    tool_calls=getattr(run_usage, "tool_calls", len(tool_calls)),
                )

                # Update message token tracking
                stats = tracker.get_agent_stats(self._agent_id)
                if stats:
                    # Estimate: user tokens ~= input tokens, assistant tokens ~= output tokens
                    stats.update_message_tokens(
                        user_tokens=getattr(run_usage, "input_tokens", 0),
                        assistant_tokens=getattr(run_usage, "output_tokens", 0),
                    )

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
        """
        Run the agent with streaming output.

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
                logger.info(
                    f"PydanticAIAdapter: Using model override for stream: {model_override}"
                )

            # Dynamically get toolsets at run time to reflect current MCP server state
            runtime_toolsets = self._get_runtime_toolsets()
            # Always pass toolsets to override any default toolsets on the agent
            # Even an empty list should be passed to ensure no tools are available
            stream_kwargs["toolsets"] = runtime_toolsets
            logger.debug(
                f"PydanticAIAdapter: Using {len(runtime_toolsets)} runtime toolsets for stream"
            )

            async with self._agent.run_stream(prompt, **stream_kwargs) as result:
                # stream_text() yields cumulative text, we need deltas
                last_text = ""
                async for text in result.stream_text():
                    # Calculate delta (new text since last chunk)
                    if text and len(text) > len(last_text):
                        delta = text[len(last_text) :]
                        last_text = text
                        yield StreamEvent(type="text", data=delta)

                # Track usage after streaming completes
                tracker = get_usage_tracker()
                if hasattr(result, "usage"):
                    run_usage = result.usage()
                    tracker.update_usage(
                        agent_id=self._agent_id,
                        input_tokens=getattr(run_usage, "input_tokens", 0),
                        output_tokens=getattr(run_usage, "output_tokens", 0),
                        cache_read_tokens=getattr(run_usage, "cache_read_tokens", 0),
                        cache_write_tokens=getattr(run_usage, "cache_write_tokens", 0),
                        requests=getattr(run_usage, "requests", 1),
                        tool_calls=getattr(run_usage, "tool_calls", 0),
                    )

                    # Update message token tracking
                    stats = tracker.get_agent_stats(self._agent_id)
                    if stats:
                        stats.update_message_tokens(
                            user_tokens=getattr(run_usage, "input_tokens", 0),
                            assistant_tokens=getattr(run_usage, "output_tokens", 0),
                        )

            yield StreamEvent(type="done", data=None)

        except Exception as e:
            yield StreamEvent(type="error", data=str(e))

    async def run_with_codemode(
        self,
        prompt: str,
        context: AgentContext,
        codemode_executor: Any,
    ) -> AgentResponse:
        """
        Run the agent with CodeMode for programmatic tool composition.

        This variant allows the agent to use agent-codemode for executing
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
