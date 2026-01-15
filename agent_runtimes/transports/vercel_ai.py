# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Vercel AI SDK protocol adapter.

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
from typing import TYPE_CHECKING, Any, AsyncIterator

from pydantic_ai import UsageLimits
from pydantic_ai.ui.vercel_ai import VercelAIAdapter
from starlette.requests import Request
from starlette.responses import Response

from ..adapters.base import BaseAgent
from ..context.usage import get_usage_tracker
from .base import BaseTransport

if TYPE_CHECKING:
    from pydantic_ai import Agent

logger = logging.getLogger(__name__)


class VercelAITransport(BaseTransport):
    """Vercel AI SDK protocol adapter.

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
        elif hasattr(agent, 'agent_id'):
            self._agent_id = agent.agent_id
        elif hasattr(agent, '_agent_id'):
            self._agent_id = agent._agent_id
        else:
            self._agent_id = getattr(agent, 'name', 'unknown').lower().replace(' ', '-')

    @property
    def protocol_name(self) -> str:
        """Get the protocol name."""
        return "vercel-ai"

    def _get_pydantic_agent(self) -> "Agent":
        """Get the underlying Pydantic AI agent.

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

    async def handle_vercel_request(
        self,
        request: Request,
        model: str | None = None,
    ) -> Response:
        """Handle a Vercel AI SDK request.

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

        # Extract model from request body if not provided
        if model is None:
            try:
                # Read the body once and cache it
                body_bytes = await request.body()
                body = json.loads(body_bytes)
                model = body.get("model")
                if model:
                    logger.info(f"Vercel AI: Using model from request body: {model}")
                else:
                    logger.debug(f"Vercel AI: No model in request body, keys: {list(body.keys())}")

                # Create a new request with the cached body for pydantic-ai to consume
                # We need to wrap the request with cached body
                from starlette.requests import Request as StarletteRequest

                async def receive():
                    return {"type": "http.request", "body": body_bytes}

                request = StarletteRequest(request.scope, receive)
            except (json.JSONDecodeError, Exception) as e:
                logger.debug(f"Could not extract model from request body: {e}")

        # Create on_complete callback to track usage
        agent_id = self._agent_id
        tracker = get_usage_tracker()

        async def on_complete(result: "AgentRunResult") -> AsyncIterator:
            """Callback to track usage after agent run completes."""
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
            yield  # type: ignore[misc]

        # Use Pydantic AI's built-in Vercel AI adapter with on_complete callback
        response = await VercelAIAdapter.dispatch_request(
            request,
            agent=pydantic_agent,
            model=model,
            usage_limits=self._usage_limits,
            toolsets=self._toolsets,
            builtin_tools=self._builtin_tools,
            on_complete=on_complete,
        )

        return response

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Handle a direct request (not recommended for Vercel AI).

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
        """Handle a streaming request (not recommended for Vercel AI).

        Note: Vercel AI uses HTTP streaming via Starlette Response. Use
        handle_vercel_request() instead.

        Args:
            request: Request data.

        Yields:
            Stream events.
        """
        raise NotImplementedError(
            "Vercel AI adapter uses Starlette/FastAPI HTTP interface. "
            "Use handle_vercel_request() with a Request object."
        )
        # Make this a generator
        yield  # type: ignore
