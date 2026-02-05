# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Vercel AI SDK protocol adapter.

Implements the Vercel AI SDK protocol for agent-runtimes using Pydantic AI's
built-in Vercel AI support from pydantic_ai.ui.vercel_ai.

Protocol Reference: https://ai.pydantic.dev/ui/vercel-ai/

The Vercel AI SDK protocol provides:
- Streaming chat responses
- Tool call support
- Token usage tracking
- Standard message format compatible with Vercel AI SDK
"""

import logging
import traceback
from typing import TYPE_CHECKING, Any, AsyncIterator

from pydantic_ai import UsageLimits
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

if TYPE_CHECKING:
    from pydantic_ai import Agent

from ..adapters.base import BaseAgent
from ..context.identities import IdentityContextManager
from ..context.usage import get_usage_tracker
from .base import BaseTransport

logger = logging.getLogger(__name__)


async def _wrap_streaming_body(body_iterator: AsyncIterator[str]) -> AsyncIterator[str]:
    """
    Wrap a streaming body to catch and log exceptions during iteration.
    """
    try:
        async for chunk in body_iterator:
            yield chunk
    except Exception as e:
        logger.error(f"[Vercel AI] STREAMING ERROR: {e}")
        logger.error(
            f"[Vercel AI] STREAMING ERROR traceback:\n{traceback.format_exc()}"
        )
        # Re-raise so the error propagates
        raise


class VercelAITransport(BaseTransport):
    """
    Vercel AI SDK protocol adapter.

    Wraps Pydantic AI's built-in Vercel AI support to expose agents through
    the Vercel AI SDK protocol.

    This adapter provides a FastAPI/Starlette compatible handler for the
    /api/chat endpoint that implements the Vercel AI SDK streaming protocol.

    Example:
        from pydantic_ai import Agent
        from agent_runtimes.agents import PydanticAIAgent
        from agent_runtimes.transports import VercelAITransport
        from fastapi import FastAPI, Request

        # Create Pydantic AI agent
        pydantic_agent = Agent("openai:gpt-4o")

        # Wrap with agent adapter
        agent = PydanticAIAgent(pydantic_agent)

        # Create Vercel AI adapter
        vercel_adapter = VercelAITransport(agent)

        # Add to FastAPI app
        app = FastAPI()

        @app.post("/api/chat")
        async def chat(request: Request):
            return await vercel_adapter.handle_vercel_request(request)
    """

    def __init__(
        self,
        agent: BaseAgent,
        usage_limits: UsageLimits | None = None,
        toolsets: list[Any] | None = None,
        builtin_tools: list[str] | None = None,
        agent_id: str | None = None,
    ):
        """Initialize the Vercel AI adapter.

        Args:
            agent: The agent to adapt.
            usage_limits: Usage limits for the agent (tokens, tool calls).
            toolsets: Additional toolsets (e.g., MCP servers).
            builtin_tools: List of built-in tool names to expose.
            agent_id: Agent ID for usage tracking.
        """
        super().__init__(agent)
        self._usage_limits = usage_limits or UsageLimits(
            tool_calls_limit=5,
            output_tokens_limit=5000,
            total_tokens_limit=100000,
        )
        self._toolsets = toolsets or []
        self._builtin_tools = builtin_tools or []
        # Get agent_id from adapter if available
        if agent_id:
            self._agent_id = agent_id
        elif hasattr(agent, "agent_id"):
            self._agent_id = agent.agent_id
        elif hasattr(agent, "_agent_id"):
            self._agent_id = agent._agent_id
        else:
            self._agent_id = getattr(agent, "name", "unknown").lower().replace(" ", "-")

    @property
    def protocol_name(self) -> str:
        """
        Get the protocol name.
        """
        return "vercel-ai"

    def _get_pydantic_agent(self) -> "Agent":
        """
        Get the underlying Pydantic AI agent.

        Returns:
            The pydantic_ai.Agent instance.

        Raises:
            ValueError: If the agent is not a PydanticAIAgent.
        """
        if hasattr(self.agent, "_agent"):
            # PydanticAIAgent wraps a pydantic_ai.Agent
            return self.agent._agent
        else:
            raise ValueError(
                "VercelAITransport requires a PydanticAIAgent that wraps a pydantic_ai.Agent"
            )

    def _get_runtime_toolsets(self) -> list[Any]:
        """
        Get runtime toolsets from the adapter.

        Returns:
            List of toolsets from the PydanticAIAdapter, combined with any static toolsets.
        """
        toolsets = list(self._toolsets)  # Start with static toolsets
        if hasattr(self.agent, "_get_runtime_toolsets"):
            toolsets.extend(self.agent._get_runtime_toolsets())
        return toolsets

    async def handle_vercel_request(
        self,
        request: Request,
        model: str | None = None,
    ) -> Response:
        """
        Handle a Vercel AI SDK request.

        This method processes a Starlette/FastAPI request and returns a streaming
        response compatible with the Vercel AI SDK.

        Args:
            request: The Starlette/FastAPI request object.
            model: Optional model override. If None, extracts from request body
                   or uses the agent's default model.

        Returns:
            Starlette Response with streaming content.
        """
        import json
        import logging
        from collections.abc import AsyncIterator
        from typing import TYPE_CHECKING

        if TYPE_CHECKING:
            from pydantic_ai.agent import AgentRunResult

        logger = logging.getLogger(__name__)
        pydantic_agent = self._get_pydantic_agent()

        # Extract model, builtinTools, and identities from request body if not provided
        builtin_tools_from_request: list[str] | None = None
        identities_from_request: list[dict[str, Any]] | None = None
        body: dict[str, Any] | None = None

        try:
            # Read the body once and cache it
            body_bytes = await request.body()
            body = json.loads(body_bytes)

            # Extract model
            if model is None:
                model = body.get("model")
                if model:
                    logger.info(f"Vercel AI: Using model from request body: {model}")
                else:
                    logger.debug(
                        f"Vercel AI: No model in request body, keys: {list(body.keys())}"
                    )

            # Extract builtinTools from request
            builtin_tools_from_request = body.get("builtinTools")
            if builtin_tools_from_request:
                logger.info(
                    f"Vercel AI: Using builtinTools from request: {builtin_tools_from_request}"
                )

            # Extract identities from request (OAuth tokens from frontend)
            identities_from_request = body.get("identities")
            if identities_from_request:
                providers = [i.get("provider") for i in identities_from_request]
                logger.info(
                    f"Vercel AI: Received identities from request for providers: {providers}"
                )

            # Create a new request with the cached body for pydantic-ai to consume
            # We need to wrap the request with cached body
            from starlette.requests import Request as StarletteRequest

            async def receive() -> dict[str, Any]:
                return {"type": "http.request", "body": body_bytes}

            request = StarletteRequest(request.scope, receive)
        except (json.JSONDecodeError, Exception) as e:
            logger.debug(f"Could not extract model/builtinTools from request body: {e}")

        # Determine which builtin_tools to use:
        # 1. If request specifies builtinTools, use those (allows per-request tool selection)
        # 2. Otherwise fall back to self._builtin_tools (initialized at adapter creation)
        builtin_tools_input = (
            builtin_tools_from_request
            if builtin_tools_from_request is not None
            else self._builtin_tools
        )

        # Convert string tool IDs to actual AbstractBuiltinTool instances
        # pydantic-ai expects Sequence[AbstractBuiltinTool], not list[str]
        effective_builtin_tools = None
        if builtin_tools_input:
            try:
                from pydantic_ai.builtin_tools import (
                    BUILTIN_TOOL_TYPES,
                    AbstractBuiltinTool,
                )

                tool_instances: list[AbstractBuiltinTool] = []
                for tool_id in builtin_tools_input:
                    if isinstance(tool_id, str):
                        tool_cls = BUILTIN_TOOL_TYPES.get(tool_id)
                        if tool_cls is not None:
                            tool_instances.append(tool_cls())
                            logger.debug(
                                f"Vercel AI: Converted builtin tool '{tool_id}' to {tool_cls.__name__}"
                            )
                        else:
                            logger.warning(
                                f"Vercel AI: Unknown builtin tool '{tool_id}', skipping"
                            )
                    elif isinstance(tool_id, AbstractBuiltinTool):
                        # Already an instance
                        tool_instances.append(tool_id)
                    else:
                        logger.warning(
                            f"Vercel AI: Invalid builtin tool type: {type(tool_id)}, skipping"
                        )
                effective_builtin_tools = tool_instances if tool_instances else None
                logger.info(
                    f"Vercel AI: Converted {len(builtin_tools_input)} builtin tool names to {len(tool_instances)} instances"
                )
            except ImportError as e:
                logger.error(f"Vercel AI: Could not import builtin_tools: {e}")

        # Create on_complete callback to track usage
        agent_id = self._agent_id
        tracker = get_usage_tracker()

        async def on_complete(result: "AgentRunResult") -> AsyncIterator[None]:
            """
            Callback to track usage after agent run completes.

            Yields
            ------
            None
                This generator yields nothing but must be a generator for API compatibility.
            """
            usage = result.usage()
            if usage:
                tracker.update_usage(
                    agent_id=agent_id,
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    requests=usage.requests,  # Number of requests made
                    tool_calls=usage.tool_calls,
                )

                # Also update message token tracking
                stats = tracker.get_agent_stats(agent_id)
                if stats:
                    stats.update_message_tokens(
                        user_tokens=usage.input_tokens,
                        assistant_tokens=usage.output_tokens,
                    )

                logger.debug(
                    f"Tracked usage for agent {agent_id} via on_complete: "
                    f"input={usage.input_tokens}, output={usage.output_tokens}, "
                    f"requests={usage.requests}, tools={usage.tool_calls}"
                )
            # Must be an async generator, even if it yields nothing
            return
            yield

        # Set the identity context for this request so that skill executors
        # can access OAuth tokens during tool execution
        try:
            async with IdentityContextManager(identities_from_request):
                # Get runtime toolsets from the adapter (includes MCP servers)
                runtime_toolsets = self._get_runtime_toolsets()

                # Log toolsets being used with detailed inspection
                if runtime_toolsets:
                    toolset_info = []
                    for i, ts in enumerate(runtime_toolsets):
                        try:
                            ts_class = type(ts).__name__
                            ts_id = ts.id if hasattr(ts, "id") else "no-id-attr"
                            ts_label = (
                                ts.label if hasattr(ts, "label") else "no-label-attr"
                            )
                            toolset_info.append(f"{ts_class}(id={ts_id})")
                            logger.debug(
                                f"[Vercel AI] Toolset {i}: class={ts_class}, id={ts_id}, label={ts_label}"
                            )

                            # Check if any attribute might be callable when it shouldn't be
                            for attr_name in ["id", "label", "name"]:
                                if hasattr(ts, attr_name):
                                    attr_val = getattr(ts, attr_name)
                                    if callable(attr_val):
                                        logger.warning(
                                            f"[Vercel AI] SUSPICIOUS: {ts_class}.{attr_name} is callable! type={type(attr_val)}"
                                        )
                        except Exception as inspect_err:
                            logger.error(
                                f"[Vercel AI] Error inspecting toolset {i}: {inspect_err}",
                                exc_info=True,
                            )
                            toolset_info.append(f"ERROR({inspect_err})")
                    logger.info(
                        f"[Vercel AI] Passing {len(runtime_toolsets)} toolsets to agent run: {toolset_info}"
                    )
                else:
                    logger.info(
                        "[Vercel AI] Passing 0 toolsets to agent run (empty list)"
                    )

                # Use Pydantic AI's built-in Vercel AI adapter with on_complete callback
                logger.debug(
                    f"[Vercel AI] Calling VercelAIAdapter.dispatch_request with model={model}"
                )
                response = await VercelAIAdapter.dispatch_request(
                    request,
                    agent=pydantic_agent,
                    model=model,
                    usage_limits=self._usage_limits,
                    toolsets=runtime_toolsets,
                    builtin_tools=effective_builtin_tools,
                    on_complete=on_complete,
                )
                logger.debug(
                    f"[Vercel AI] dispatch_request returned response type: {type(response)}"
                )

                # Wrap the streaming response body to catch errors during streaming
                if isinstance(response, StreamingResponse):
                    original_body = response.body_iterator
                    response.body_iterator = _wrap_streaming_body(original_body)
                    logger.debug(
                        "[Vercel AI] Wrapped StreamingResponse body_iterator for error logging"
                    )

        except Exception as e:
            logger.error(
                f"[Vercel AI] Error during dispatch_request: {e}", exc_info=True
            )
            raise

        return response

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """
        Handle a direct request (not recommended for Vercel AI).

        Note: Vercel AI is primarily a streaming protocol over HTTP. For proper
        integration, use handle_vercel_request() with a Starlette Request object.

        Args:
            request: Request data.

        Returns:
            Response data.
        """
        raise NotImplementedError(
            "Vercel AI adapter uses Starlette/FastAPI HTTP interface. "
            "Use handle_vercel_request() with a Request object."
        )

    async def handle_stream(
        self, request: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """
        Handle a streaming request (not recommended for Vercel AI).

        Note: Vercel AI uses HTTP streaming via Starlette Response. Use
        handle_vercel_request() instead.

        Args:
            request: Request data.

        Yields
        ------
        dict[str, Any]
            Stream events (not implemented - raises NotImplementedError).
        """
        raise NotImplementedError(
            "Vercel AI adapter uses Starlette/FastAPI HTTP interface. "
            "Use handle_vercel_request() with a Request object."
        )
        # Make mypy happy - this line is never reached
        yield
