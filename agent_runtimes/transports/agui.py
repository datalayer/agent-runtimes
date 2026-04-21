# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
AG-UI protocol adapter.

Implements the AG-UI (Agent UI) protocol for agent-runtimes using Pydantic AI's
built-in AG-UI support from pydantic_ai.ui.ag_ui.

Protocol Reference: https://ai.pydantic.dev/ui/ag-ui/

AG-UI is a lightweight protocol focused on UI integration with:
- Simple JSON message format
- UI-focused events (text, thinking, tool_use)
- Real-time streaming support
- Lightweight for browser clients
- Identity context support for OAuth token propagation
"""

import asyncio
import json
import logging
from typing import TYPE_CHECKING, Any, AsyncIterator

if TYPE_CHECKING:
    from pydantic_ai.ui.ag_ui._adapter import AGUIAdapter
else:
    try:
        from pydantic_ai.ui.ag_ui._adapter import AGUIAdapter
    except (ImportError, ModuleNotFoundError):
        AGUIAdapter = None  # type: ignore[assignment,misc]

from starlette.applications import Starlette

from ..adapters.base import BaseAgent
from ..context.identities import set_request_identities, set_request_user_jwt
from ..context.usage import get_usage_tracker
from ..observability.prompt_turn_metrics import (
    extract_identity_hints,
    extract_jwt_token,
    extract_user_id_from_jwt,
    record_prompt_turn_completion,
)
from .base import BaseTransport

logger = logging.getLogger(__name__)


class AGUITransport(BaseTransport):
    """
    AG-UI (Agent UI) protocol adapter.

    Wraps Pydantic AI's built-in AG-UI support to expose agents through
    the AG-UI protocol as an ASGI/Starlette application.

    The adapter creates a Starlette app that can be mounted into a FastAPI
    application or run standalone.

    This adapter supports per-request model override by extracting the model
    from the request body and passing it to the AGUIAdapter.

    Example:
        from pydantic_ai import Agent
        from agent_runtimes.agents import PydanticAIAgent
        from agent_runtimes.transports import AGUITransport

        # Create Pydantic AI agent
        pydantic_agent = Agent("openai:gpt-4o")

        # Wrap with agent adapter
        agent = PydanticAIAgent(pydantic_agent)

        # Create AG-UI adapter
        agui_adapter = AGUITransport(agent)

        # Get the Starlette app
        app = agui_adapter.get_app()

        # Mount in FastAPI
        from fastapi import FastAPI
        from starlette.routing import Mount

        main_app = FastAPI()
        main_app.mount("/agentic_chat", app)
    """

    def __init__(self, agent: BaseAgent, agent_id: str | None = None, **kwargs: Any):
        """Initialize the AG-UI adapter.

        Args:
            agent: The agent to adapt.
            agent_id: Agent ID for usage tracking.
            **kwargs: Additional arguments passed to AGUIAdapter.dispatch_request.
        """
        super().__init__(agent)
        self._agui_kwargs = kwargs
        self._app: "Starlette | None" = None
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
        return "ag-ui"

    def _get_pydantic_agent(self) -> Any:
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
                "AGUITransport requires a PydanticAIAgent that wraps a pydantic_ai.Agent"
            )

    def _get_runtime_toolsets(self) -> list[Any]:
        """
        Get runtime toolsets from the adapter.

        Returns:
            List of toolsets from the PydanticAIAdapter.
        """
        if hasattr(self.agent, "_get_runtime_toolsets"):
            return self.agent._get_runtime_toolsets()
        return []

    def get_app(self) -> "Starlette":
        """
        Get the Starlette/ASGI application for AG-UI.

        This creates a custom Starlette app that supports per-request model override
        by extracting the model from the request body.

        Returns:
            Starlette application implementing the AG-UI protocol.
        """
        if self._app is None:
            from typing import TYPE_CHECKING

            from starlette.applications import Starlette
            from starlette.requests import Request
            from starlette.responses import Response
            from starlette.routing import Route

            if TYPE_CHECKING:
                from pydantic_ai.agent import AgentRunResult

            pydantic_agent = self._get_pydantic_agent()
            agui_kwargs = self._agui_kwargs
            agent_id = self._agent_id
            tracker = get_usage_tracker()
            # Store reference to self for accessing runtime toolsets in the closure
            transport_self = self

            async def run_agent(request: Request) -> Response:
                """
                Endpoint to run the agent with per-request model override support.
                """
                import time

                request_start = time.perf_counter()
                request_prompt = ""
                metric_emitted = False
                # Extract model and identities from request body if provided
                model: str | None = None
                identities_from_request: list[dict[str, Any]] | None = None
                metric_user_id: str | None = None
                metric_user_provider: str | None = None
                metric_user_jwt_token = extract_jwt_token(
                    request.headers.get("authorization"),
                    request.headers.get("x-external-token"),
                )
                try:
                    # Read the body once and cache it
                    body_bytes = await request.body()
                    body = json.loads(body_bytes)
                    model = body.get("model")
                    if model:
                        logger.info(f"AG-UI using model from request body: {model}")

                    prompt_candidate = body.get("prompt")
                    if isinstance(prompt_candidate, str):
                        request_prompt = prompt_candidate
                    if not request_prompt:
                        messages_candidate = body.get("messages")
                        if isinstance(messages_candidate, list):
                            for msg in reversed(messages_candidate):
                                if not isinstance(msg, dict):
                                    continue
                                role = msg.get("role")
                                if role not in ("user", "input"):
                                    continue
                                content = msg.get("content")
                                if isinstance(content, str):
                                    request_prompt = content
                                    break
                                if isinstance(content, list):
                                    text_parts: list[str] = []
                                    for block in content:
                                        if (
                                            isinstance(block, dict)
                                            and block.get("type") == "text"
                                        ):
                                            text = block.get("text")
                                            if isinstance(text, str):
                                                text_parts.append(text)
                                    if text_parts:
                                        request_prompt = "\n".join(text_parts)
                                        break

                    # Extract identities from request (OAuth tokens from frontend)
                    identities_from_request = body.get("identities")
                    if identities_from_request:
                        providers = [i.get("provider") for i in identities_from_request]
                        hint_user_id, hint_provider, hint_token = (
                            extract_identity_hints(identities_from_request)
                        )
                        metric_user_provider = hint_provider or metric_user_provider
                        metric_user_id = hint_user_id or metric_user_id
                        metric_user_jwt_token = hint_token or metric_user_jwt_token
                        logger.debug(
                            "[AG-UI] Received identities for providers=%s count=%s user_hint=%s",
                            providers,
                            len(identities_from_request),
                            metric_user_id,
                        )
                    else:
                        logger.debug("[AG-UI] No identities in request body")

                    if not metric_user_id:
                        metric_user_id = extract_user_id_from_jwt(metric_user_jwt_token)
                    if metric_user_id and not metric_user_provider:
                        metric_user_provider = "jwt"

                    # Create a new request with the cached body for pydantic-ai to consume
                    async def receive() -> dict[str, Any]:
                        return {"type": "http.request", "body": body_bytes}

                    request = Request(request.scope, receive)
                except (json.JSONDecodeError, Exception) as e:
                    logger.debug(
                        f"Could not extract model/identities from AG-UI request body: {e}"
                    )

                # Create on_complete callback to track usage
                async def on_complete(result: "AgentRunResult") -> None:
                    """
                    Callback invoked after agent run completes.
                    Usage tracking is handled by LLMContextUsageCapability.
                    """
                    logger.info(
                        f"[AG-UI on_complete] Callback invoked for agent {agent_id}"
                    )
                    usage = result.usage()
                    logger.info(f"[AG-UI on_complete] Usage object: {usage}")
                    response_text_chunks: list[str] = []
                    total_tool_calls = 0
                    nonlocal metric_emitted
                    if usage:
                        duration_ms = (time.perf_counter() - request_start) * 1000

                        # Extract per-response text and tool call counts for OTEL metrics
                        try:
                            messages = result.all_messages()

                            for msg in messages:
                                if hasattr(msg, "kind") and msg.kind == "response":
                                    if hasattr(msg, "parts"):
                                        for part in msg.parts:
                                            if isinstance(part, dict):
                                                if part.get("part_kind") == "tool-call":
                                                    total_tool_calls += 1
                                                elif part.get("part_kind") in (
                                                    "text",
                                                    "output_text",
                                                ):
                                                    text_content = part.get(
                                                        "content"
                                                    ) or part.get("text")
                                                    if isinstance(text_content, str):
                                                        response_text_chunks.append(
                                                            text_content
                                                        )
                                            else:
                                                if hasattr(part, "tool_name"):
                                                    total_tool_calls += 1
                                                text_content = getattr(
                                                    part, "content", None
                                                ) or getattr(part, "text", None)
                                                if isinstance(text_content, str):
                                                    response_text_chunks.append(
                                                        text_content
                                                    )

                            record_prompt_turn_completion(
                                prompt=request_prompt,
                                response="\n".join(response_text_chunks),
                                duration_ms=duration_ms,
                                protocol="ag-ui",
                                stop_reason="end_turn",
                                success=True,
                                model=model if isinstance(model, str) else None,
                                tool_call_count=total_tool_calls
                                or int(getattr(usage, "tool_calls", 0) or 0),
                                input_tokens=int(
                                    getattr(usage, "input_tokens", 0) or 0
                                ),
                                output_tokens=int(
                                    getattr(usage, "output_tokens", 0) or 0
                                ),
                                total_tokens=int(
                                    (getattr(usage, "input_tokens", 0) or 0)
                                    + (getattr(usage, "output_tokens", 0) or 0)
                                ),
                                user_id=metric_user_id,
                                user_provider=metric_user_provider,
                                identities_count=(
                                    len(identities_from_request)
                                    if isinstance(identities_from_request, list)
                                    else None
                                ),
                                user_jwt_token=metric_user_jwt_token,
                                agent_id=agent_id,
                            )
                            metric_emitted = True
                        except Exception as e:
                            logger.warning(
                                f"[AG-UI on_complete] Could not extract per-response data: {e}"
                            )
                            record_prompt_turn_completion(
                                prompt=request_prompt,
                                response="",
                                duration_ms=duration_ms,
                                protocol="ag-ui",
                                stop_reason="end_turn",
                                success=True,
                                model=model if isinstance(model, str) else None,
                                tool_call_count=int(
                                    getattr(usage, "tool_calls", 0) or 0
                                ),
                                input_tokens=int(
                                    getattr(usage, "input_tokens", 0) or 0
                                ),
                                output_tokens=int(
                                    getattr(usage, "output_tokens", 0) or 0
                                ),
                                total_tokens=int(
                                    (getattr(usage, "input_tokens", 0) or 0)
                                    + (getattr(usage, "output_tokens", 0) or 0)
                                ),
                                user_id=metric_user_id,
                                user_provider=metric_user_provider,
                                identities_count=(
                                    len(identities_from_request)
                                    if isinstance(identities_from_request, list)
                                    else None
                                ),
                                user_jwt_token=metric_user_jwt_token,
                                agent_id=agent_id,
                            )
                            metric_emitted = True
                    else:
                        logger.warning(
                            f"[AG-UI on_complete] No usage data available for agent {agent_id}"
                        )

                # Set the identity context for this request so that skill executors
                # and codemode tools can access OAuth tokens during tool execution.
                #
                # IMPORTANT: We don't use a context manager here because dispatch_request
                # returns a streaming Response immediately, but tool execution happens
                # during the streaming phase (when the response is being sent to client).
                # A context manager would exit too early and clear the identities before
                # tools run. Instead, we set the identities and let them persist for the
                # entire request duration via contextvars.
                set_request_identities(identities_from_request)
                set_request_user_jwt(metric_user_jwt_token)
                logger.debug("[AG-UI] Set request identities for streaming")
                logger.info(
                    "[AG-UI] Prompt metrics identity context: user_id=%s provider=%s identities=%s",
                    metric_user_id,
                    metric_user_provider,
                    (
                        len(identities_from_request)
                        if isinstance(identities_from_request, list)
                        else 0
                    ),
                )

                # Get runtime toolsets from the adapter (includes MCP servers)
                runtime_toolsets = transport_self._get_runtime_toolsets()

                # Log detailed toolset information
                if runtime_toolsets:
                    toolset_names = []
                    for ts in runtime_toolsets:
                        name = (
                            getattr(ts, "name", None)
                            or getattr(ts, "__class__", type(ts)).__name__
                        )
                        toolset_names.append(name)
                    logger.info(
                        f"[AG-UI] Passing {len(runtime_toolsets)} toolsets to agent run: {toolset_names}"
                    )

                    # Extract and store tool definitions for context tracking
                    try:
                        from ..context.session import (
                            _extract_tool_definitions_from_toolsets,
                        )

                        tool_defs = _extract_tool_definitions_from_toolsets(
                            runtime_toolsets
                        )
                        if tool_defs:
                            stats = tracker.get_agent_stats(agent_id)
                            if stats:
                                stats.store_tools(tool_defs)
                                logger.info(
                                    f"[AG-UI] Stored {len(tool_defs)} tool definitions for agent {agent_id}"
                                )
                    except Exception as e:
                        logger.warning(
                            f"[AG-UI] Could not extract tool definitions: {e}"
                        )
                else:
                    logger.info("[AG-UI] Passing 0 toolsets to agent run (empty list)")

                try:
                    return await AGUIAdapter.dispatch_request(
                        request,
                        agent=pydantic_agent,
                        model=model,
                        toolsets=runtime_toolsets,
                        on_complete=on_complete,
                        **agui_kwargs,
                    )
                except asyncio.CancelledError:
                    if not metric_emitted:
                        record_prompt_turn_completion(
                            prompt=request_prompt,
                            response="",
                            duration_ms=(time.perf_counter() - request_start) * 1000.0,
                            protocol="ag-ui",
                            stop_reason="cancelled",
                            success=False,
                            model=model if isinstance(model, str) else None,
                            tool_call_count=0,
                            input_tokens=0,
                            output_tokens=0,
                            total_tokens=0,
                            user_id=metric_user_id,
                            user_provider=metric_user_provider,
                            identities_count=(
                                len(identities_from_request)
                                if isinstance(identities_from_request, list)
                                else None
                            ),
                            user_jwt_token=metric_user_jwt_token,
                            agent_id=agent_id,
                        )
                        metric_emitted = True
                    raise
                except Exception:
                    if not metric_emitted:
                        record_prompt_turn_completion(
                            prompt=request_prompt,
                            response="",
                            duration_ms=(time.perf_counter() - request_start) * 1000.0,
                            protocol="ag-ui",
                            stop_reason="error",
                            success=False,
                            model=model if isinstance(model, str) else None,
                            tool_call_count=0,
                            input_tokens=0,
                            output_tokens=0,
                            total_tokens=0,
                            user_id=metric_user_id,
                            user_provider=metric_user_provider,
                            identities_count=(
                                len(identities_from_request)
                                if isinstance(identities_from_request, list)
                                else None
                            ),
                            user_jwt_token=metric_user_jwt_token,
                            agent_id=agent_id,
                        )
                        metric_emitted = True
                    raise

            # Create Starlette app for AG-UI endpoint
            self._app = Starlette(
                routes=[
                    Route("/", run_agent, methods=["POST"]),
                ],
            )

        return self._app

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """
        Handle an AG-UI request.

        Note: AG-UI is primarily a streaming protocol. For direct request handling,
        use the Starlette app via get_app() instead.

        Args:
            request: AG-UI request data.

        Returns:
            AG-UI response data.
        """
        raise NotImplementedError(
            "AG-UI adapter uses Starlette/ASGI interface. "
            "Use get_app() to get the Starlette application."
        )

    async def handle_stream(
        self, request: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """
        Handle a streaming AG-UI request.

        Note: AG-UI uses Starlette/ASGI for streaming. Use get_app() instead.

        Args:
            request: AG-UI request data.

        Yields
        ------
        dict[str, Any]
            AG-UI stream events (not implemented - raises NotImplementedError).
        """
        raise NotImplementedError(
            "AG-UI adapter uses Starlette/ASGI interface. "
            "Use get_app() to get the Starlette application."
        )
        # Make mypy happy - this line is never reached
        yield
