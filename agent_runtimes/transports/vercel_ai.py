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

import inspect
import logging
import os
import traceback
from typing import TYPE_CHECKING, Any, AsyncIterator, Callable

import httpx
from pydantic_ai import UsageLimits
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

if TYPE_CHECKING:
    from pydantic_ai import Agent
    from pydantic_ai.ui.vercel_ai import VercelAIAdapter
else:
    try:
        from pydantic_ai.ui.vercel_ai import VercelAIAdapter
    except (ImportError, ModuleNotFoundError):
        VercelAIAdapter = None  # type: ignore[assignment,misc]

from pydantic_ai import DeferredToolRequests
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.toolsets import ExternalToolset, FilteredToolset

from ..adapters.base import BaseAgent
from ..context.identities import IdentityContextManager, set_request_user_jwt
from ..events import create_event
from ..observability.prompt_turn_metrics import (
    extract_identity_hints,
    extract_jwt_token,
    extract_user_id_from_jwt,
    record_prompt_turn_completion,
)
from ..streams.loop import get_agent_enabled_mcp_tool_names, get_known_mcp_tool_names
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


async def _presignal_deferred_approvals(
    body: dict[str, Any],
    agent_id: str,
) -> None:
    """Mark pending local approval records 'approved' before a DeferredToolResults
    continuation runs.

    In **server mode** the human-approval decision travels via the ai-agents
    WebSocket and updates ai-agents' store, but never calls
    ``signal_approval_event()`` on the local asyncio.Event that
    ``ToolApprovalCapability.before_tool_execute`` waits on.  Without this
    pre-signal, ``before_tool_execute`` would call ``request_and_wait()`` again
    on the continuation turn and block forever.

    This function inspects the continuation body for ``approval-responded``
    ``dynamic-tool`` parts and pre-approves the matching local records so the
    capability hook's skip-check succeeds immediately.
    """
    from datetime import datetime, timezone

    from ..routes.tool_approvals import (
        _APPROVALS,
        _APPROVALS_LOCK,
        signal_approval_event,
    )

    messages: list[Any] = body.get("messages") or []
    tool_call_ids: list[str] = []
    for msg in messages:
        if not isinstance(msg, dict) or msg.get("role") != "assistant":
            continue
        parts: list[Any] = msg.get("parts") or []
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            if (
                part.get("type") == "dynamic-tool"
                and part.get("state") == "approval-responded"
            ):
                approval_info = part.get("approval") or {}
                if approval_info.get("approved") is True:
                    tool_call_id = part.get("toolCallId")
                    if isinstance(tool_call_id, str) and tool_call_id:
                        tool_call_ids.append(tool_call_id)

    if not tool_call_ids:
        return

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    updated: list[tuple[str, str]] = []
    async with _APPROVALS_LOCK:
        for record_id, record in list(_APPROVALS.items()):
            if record.tool_call_id in tool_call_ids and record.status == "pending":
                _APPROVALS[record_id] = record.model_copy(
                    update={"status": "approved", "updated_at": now}
                )
                updated.append((record_id, record.tool_call_id or ""))

    for record_id, tool_call_id in updated:
        signal_approval_event(record_id, approved=True, note=None)
        logger.info(
            "[Vercel AI] Pre-approved local record %s (tool_call_id=%s) "
            "for DeferredToolResults continuation in agent %s",
            record_id,
            tool_call_id,
            agent_id,
        )


async def _wrap_streaming_body_with_approvals(
    body_iterator: AsyncIterator[str],
    approval_tool_ids: list[str],
    agent_id: str,
    user_jwt_token: str | None = None,
    pod_name: str | None = None,
) -> AsyncIterator[str]:
    """Wrap a streaming body to create local approval records for deferred tools.

    When DeferredToolRequests is active, pydantic-ai never executes the tool,
    so ToolApprovalCapability.before_tool_execute never fires.  This wrapper
    intercepts ``tool-input-available`` SSE events and creates matching
    approval records in the local in-memory store so the frontend can poll
    them and enable the Approve / Deny buttons.
    """
    import json as json_mod

    from ..routes.tool_approvals import (
        ToolApprovalCreateRequest,
        _create_approval,
        mirror_approval_to_local,
    )

    # Build name variants for matching (underscore / hyphen normalisation).
    # Include both versioned IDs (e.g. "runtime-sensitive-echo:0.0.1") and
    # base names without version suffix (e.g. "runtime_sensitive_echo") so
    # pydantic-ai's tool-input-available events (which carry the registered
    # function name without a version suffix) are not skipped.
    approval_names: set[str] = set()
    for tid in approval_tool_ids:
        base_name = tid.split(":", 1)[0]
        for name in (tid, base_name):
            approval_names.add(name)
            approval_names.add(name.replace("-", "_"))
            approval_names.add(name.replace("_", "-"))
    created_tool_call_ids: set[str] = set()
    remote_created_tool_call_ids: set[str] = set()

    async def create_remote_approval_if_possible(
        *,
        tool_name: str,
        tool_args: dict[str, Any],
        tool_call_id: str,
    ) -> None:
        if not user_jwt_token or not tool_call_id:
            return
        if tool_call_id in remote_created_tool_call_ids:
            return
        try:
            from datalayer_core.utils.urls import DatalayerURLs

            urls = DatalayerURLs.from_environment()
            ai_agents_url = urls.ai_agents_url.rstrip("/")
            async with httpx.AsyncClient(
                base_url=ai_agents_url,
                headers={"Authorization": f"Bearer {user_jwt_token}"},
                timeout=10.0,
            ) as client:
                resp = await client.post(
                    "/api/ai-agents/v1/tool-approvals",
                    json={
                        "agent_id": agent_id,
                        "pod_name": pod_name or "",
                        "tool_name": tool_name,
                        "tool_args": tool_args,
                        "tool_call_id": tool_call_id,
                    },
                )
                resp.raise_for_status()
            remote_created_tool_call_ids.add(tool_call_id)
            logger.info(
                "[Vercel AI] Created remote ai-agents approval for tool_call_id=%s tool='%s'",
                tool_call_id,
                tool_name,
            )
        except Exception as remote_err:
            logger.debug(
                "[Vercel AI] Could not create remote ai-agents approval for tool_call_id=%s: %s",
                tool_call_id,
                remote_err,
            )

    try:
        async for chunk in body_iterator:
            # Fast path: skip parsing when not relevant
            if "tool-input-available" in chunk or "tool-approval-request" in chunk:
                try:
                    for line in chunk.strip().split("\n"):
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            continue
                        event = json_mod.loads(data_str)
                        event_type = event.get("type")
                        if event_type not in (
                            "tool-input-available",
                            "tool-approval-request",
                        ):
                            continue
                        tool_call_id = (
                            event.get("toolCallId")
                            or event.get("tool_call_id")
                            or event.get("id")
                            or ""
                        )
                        if tool_call_id and tool_call_id in created_tool_call_ids:
                            continue
                        tool_name = (
                            event.get("toolName") or event.get("tool_name") or ""
                        )
                        # For legacy tool-input-available events, keep approval tool filtering.
                        if event_type == "tool-input-available":
                            variants = {
                                tool_name,
                                tool_name.replace("-", "_"),
                                tool_name.replace("_", "-"),
                            }
                            if not variants & approval_names:
                                continue
                        tool_args = (
                            event.get("input")
                            or event.get("toolArgs")
                            or event.get("tool_args")
                            or {}
                        )
                        normalized_tool_args = (
                            tool_args if isinstance(tool_args, dict) else {}
                        )

                        # Best-effort remote sync so server-mode panels backed by
                        # ai-agents can display pending approvals.
                        if tool_call_id:
                            await create_remote_approval_if_possible(
                                tool_name=tool_name,
                                tool_args=normalized_tool_args,
                                tool_call_id=tool_call_id,
                            )

                        # If the stream already provides an approval ID, mirror it
                        # so local state uses the same identifier as the protocol.
                        approval_id = (
                            event.get("approvalId") or event.get("approval_id") or ""
                        )
                        if isinstance(approval_id, str) and approval_id:
                            record = await mirror_approval_to_local(
                                {
                                    "id": approval_id,
                                    "agent_id": agent_id,
                                    "tool_name": tool_name,
                                    "tool_args": normalized_tool_args,
                                    "tool_call_id": tool_call_id or None,
                                    "status": "pending",
                                }
                            )
                        else:
                            req = ToolApprovalCreateRequest(
                                agent_id=agent_id,
                                tool_name=tool_name,
                                tool_args=normalized_tool_args,
                                tool_call_id=tool_call_id or None,
                            )
                            record = await _create_approval(req)
                        if tool_call_id:
                            created_tool_call_ids.add(tool_call_id)
                        logger.info(
                            "[Vercel AI] Created local approval record %s "
                            "for deferred tool '%s'",
                            record.id,
                            tool_name,
                        )
                except Exception as parse_err:
                    logger.debug(
                        "[Vercel AI] Error parsing SSE for approval: %s",
                        parse_err,
                    )
            yield chunk
    except Exception as e:
        logger.error(f"[Vercel AI] STREAMING ERROR: {e}")
        logger.error(
            f"[Vercel AI] STREAMING ERROR traceback:\n{traceback.format_exc()}"
        )
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
        has_spec_frontend_tools: bool = False,
        has_approval_tools: bool = False,
        approval_tool_ids: list[str] | None = None,
        is_triggered: bool = False,
    ):
        """Initialize the Vercel AI adapter.

        Args:
            agent: The agent to adapt.
            usage_limits: Usage limits for the agent (tokens, tool calls).
            toolsets: Additional toolsets (e.g., MCP servers).
            builtin_tools: List of built-in tool names to expose.
            agent_id: Agent ID for usage tracking.
            has_spec_frontend_tools: Whether the agent spec declares frontend tools.
            has_approval_tools: Whether the agent has runtime tools requiring approval.
            approval_tool_ids: List of tool IDs that require human approval.
            is_triggered: Whether the agent has a trigger config (output events are only emitted for triggered agents).
        """
        super().__init__(agent)
        self._usage_limits = usage_limits or UsageLimits(
            tool_calls_limit=20,
            output_tokens_limit=5000,
            total_tokens_limit=100000,
        )
        self._toolsets = toolsets or []
        self._builtin_tools = builtin_tools or []
        self._has_spec_frontend_tools = has_spec_frontend_tools
        self._approval_tool_ids = approval_tool_ids or []
        self._has_approval_tools = has_approval_tools or bool(self._approval_tool_ids)
        self._is_triggered = is_triggered
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
        from typing import TYPE_CHECKING

        if TYPE_CHECKING:
            from pydantic_ai.agent import AgentRunResult

        logger = logging.getLogger(__name__)
        pydantic_agent = self._get_pydantic_agent()

        # Extract model, builtinTools, identities, and frontend tools from request body if not provided
        builtin_tools_from_request: list[str] | None = None
        identities_from_request: list[dict[str, Any]] | None = None
        frontend_tools_from_request: list[dict[str, Any]] | None = None
        sdk_version: str | None = None
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

            # Extract SDK version when present (newer AI SDK clients).
            sdk_version = body.get("sdkVersion") or body.get("sdk_version")

            # Extract frontend tools from request body
            frontend_tools_from_request = body.get("tools")
            if frontend_tools_from_request:
                logger.info(
                    f"Vercel AI: Received {len(frontend_tools_from_request)} frontend tools from request"
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

        # Extract identity/JWT hints for OTEL metric attribution
        metric_user_id: str | None = None
        metric_user_provider: str | None = None
        metric_user_jwt_token = extract_jwt_token(
            request.headers.get("authorization"),
            request.headers.get("x-external-token"),
        )
        if identities_from_request:
            hint_user_id, hint_provider, hint_token = extract_identity_hints(
                identities_from_request
            )
            metric_user_provider = hint_provider or metric_user_provider
            metric_user_id = hint_user_id or metric_user_id
            metric_user_jwt_token = hint_token or metric_user_jwt_token
        if not metric_user_id:
            metric_user_id = extract_user_id_from_jwt(metric_user_jwt_token)
        if metric_user_id and not metric_user_provider:
            metric_user_provider = "jwt"

        # Extract the last user message for OTEL prompt recording
        request_prompt = ""
        if body and isinstance(body, dict):
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

        # Create on_complete callback to track usage
        agent_id = self._agent_id
        import time

        request_start = time.perf_counter()

        async def on_complete(result: "AgentRunResult") -> None:
            """
            Callback invoked after agent run completes.
            Usage tracking is handled by LLMContextUsageCapability.
            """
            usage = result.usage()
            input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
            output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
            tool_call_count = int(getattr(usage, "tool_calls", 0) or 0)

            duration_ms = (time.perf_counter() - request_start) * 1000

            logger.info(
                "[Vercel AI] on_complete: agent_id=%s input_tokens=%s output_tokens=%s tool_calls=%s",
                agent_id,
                input_tokens,
                output_tokens,
                tool_call_count,
            )

            # Emit agent-output event for final textual completions so
            # trigger panels can show Generated Output consistently.
            # Only emit for triggered agents (agents with a trigger config).
            if self._is_triggered:
                try:
                    output_text = ""
                    if hasattr(result, "output") and isinstance(result.output, str):
                        output_text = result.output.strip()

                    if output_text:
                        auth_header = request.headers.get("Authorization", "")
                        token_value = ""
                        if auth_header.startswith("Bearer "):
                            token_value = auth_header.removeprefix("Bearer ").strip()
                        elif auth_header.startswith("token "):
                            token_value = auth_header.removeprefix("token ").strip()

                        if token_value:
                            events_base_url = (
                                os.environ.get("DATALAYER_AI_AGENTS_URL")
                                or os.environ.get("AI_AGENTS_URL")
                                or os.environ.get("DATALAYER_RUN_URL")
                                or "https://prod1.datalayer.run"
                            )
                            create_event(
                                token=token_value,
                                agent_id=agent_id,
                                title="Agent Output",
                                kind="agent-output",
                                status="completed",
                                payload={
                                    "agent_id": agent_id,
                                    "duration_ms": int(duration_ms),
                                    "outputs": output_text,
                                    "exit_status": "completed",
                                },
                                metadata={
                                    "origin": "agent-runtime",
                                    "source": "vercel-ai-on-complete",
                                },
                                base_url=events_base_url,
                            )
                except Exception as event_exc:
                    logger.debug(
                        "[Vercel AI] Failed to emit agent-output event for agent '%s': %s",
                        agent_id,
                        event_exc,
                    )

            # Emit OTEL prompt-turn metrics for every successful completed turn.
            response_text = ""
            if hasattr(result, "output") and isinstance(result.output, str):
                response_text = result.output
            record_prompt_turn_completion(
                prompt=request_prompt,
                response=response_text,
                duration_ms=duration_ms,
                protocol="vercel-ai",
                stop_reason="end_turn",
                success=True,
                model=model if isinstance(model, str) else None,
                tool_call_count=tool_call_count,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=(input_tokens + output_tokens),
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
            return

        # Set the identity context for this request so that skill executors
        # can access OAuth tokens during tool execution
        set_request_user_jwt(metric_user_jwt_token)
        try:
            async with IdentityContextManager(identities_from_request):
                # Get runtime toolsets from the adapter (includes MCP servers)
                runtime_toolsets = self._get_runtime_toolsets()

                # Filter MCP toolsets to only expose tools the user has enabled.
                # We check if each tool's name is in the known MCP tool inventory;
                # if it is, it must also be in the per-agent enabled set.  Tools
                # that are not MCP tools (e.g. skill tools, frontend tools) are
                # always passed through.
                known_mcp_tool_names = get_known_mcp_tool_names()
                if known_mcp_tool_names:
                    enabled_mcp_tool_names = get_agent_enabled_mcp_tool_names(agent_id)

                    def _make_mcp_filter(
                        enabled: set[str], known: set[str]
                    ) -> Callable[[Any, ToolDefinition], bool]:
                        def _filter(_ctx: Any, tool_def: ToolDefinition) -> bool:
                            return (
                                tool_def.name not in known or tool_def.name in enabled
                            )

                        return _filter

                    mcp_filter = _make_mcp_filter(
                        enabled_mcp_tool_names, known_mcp_tool_names
                    )
                    runtime_toolsets = [
                        FilteredToolset(wrapped=ts, filter_func=mcp_filter)
                        for ts in runtime_toolsets
                    ]
                    logger.debug(
                        "[Vercel AI] Filtering MCP tools: %d enabled out of %d known",
                        len(enabled_mcp_tool_names),
                        len(known_mcp_tool_names),
                    )

                # Add frontend tools as an ExternalToolset if provided in the request
                has_frontend_tools = False
                if frontend_tools_from_request:
                    frontend_tool_defs = []
                    for tool in frontend_tools_from_request:
                        tool_name = tool.get("name", "")
                        tool_desc = tool.get("description", "")
                        tool_params = tool.get("parameters", {})
                        # Normalize parameters: accept both JSON Schema and array formats
                        if isinstance(tool_params, list):
                            # Convert CopilotKit-style array to JSON Schema
                            properties = {}
                            required = []
                            for p in tool_params:
                                p_name = p.get("name", "")
                                p_type = p.get("type", "string")
                                properties[p_name] = {
                                    "type": p_type,
                                    "description": p.get("description", ""),
                                }
                                if p.get("required"):
                                    required.append(p_name)
                            tool_params = {
                                "type": "object",
                                "properties": properties,
                                "required": required,
                            }
                        if tool_name:
                            frontend_tool_defs.append(
                                ToolDefinition(
                                    name=tool_name,
                                    description=tool_desc,
                                    parameters_json_schema=tool_params,
                                )
                            )
                    if frontend_tool_defs:
                        frontend_toolset: ExternalToolset = ExternalToolset(
                            frontend_tool_defs, id="frontend-tools"
                        )
                        runtime_toolsets.append(frontend_toolset)
                        has_frontend_tools = True
                        logger.info(
                            f"[Vercel AI] Added frontend ExternalToolset with {len(frontend_tool_defs)} tools: "
                            f"{[t.name for t in frontend_tool_defs]}"
                        )

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
                dispatch_kwargs: dict[str, Any] = {
                    "request": request,
                    "agent": pydantic_agent,
                    "model": model,
                    "toolsets": runtime_toolsets,
                    "builtin_tools": effective_builtin_tools,
                    "on_complete": on_complete,
                }

                dispatch_params = inspect.signature(
                    VercelAIAdapter.dispatch_request
                ).parameters
                if "usage_limits" in dispatch_params:
                    dispatch_kwargs["usage_limits"] = self._usage_limits

                # Enable DeferredToolRequests for either:
                # 1) frontend tools (client-side tool execution), or
                # 2) approval-capable agents (approval-responded continuations).
                #
                # Without DeferredToolRequests on continuation turns, an
                # approval-responded part can be treated as a fresh tool call,
                # causing the same approval to be requested again.
                if has_frontend_tools or self._has_approval_tools:
                    dispatch_kwargs["output_type"] = [str, DeferredToolRequests]
                    logger.info(
                        "[Vercel AI] Enabled DeferredToolRequests output_type "
                        "(frontend_tools=%s, approval_tools=%s)",
                        has_frontend_tools,
                        self._has_approval_tools,
                    )

                # Pass sdk_version only if supported by installed pydantic-ai.
                if sdk_version and "sdk_version" in dispatch_params:
                    dispatch_kwargs["sdk_version"] = sdk_version

                # Before the continuation run, pre-approve any pending local
                # approval records for tools approved via ai-agents WebSocket.
                # In server mode the approval decision updates ai-agents' store
                # but never signals the local asyncio.Event that
                # ToolApprovalCapability.before_tool_execute waits on.
                if self._has_approval_tools and body:
                    await _presignal_deferred_approvals(body, agent_id)

                response = await VercelAIAdapter.dispatch_request(
                    **dispatch_kwargs,
                )
                logger.debug(
                    f"[Vercel AI] dispatch_request returned response type: {type(response)}"
                )

                # Wrap the streaming response body to catch errors during streaming
                # AND to create local approval records for any tool-approval-request
                # events pydantic-ai emits (so WS approve/reject can resolve them).
                if isinstance(response, StreamingResponse):
                    original_body = response.body_iterator
                    response.body_iterator = _wrap_streaming_body_with_approvals(
                        original_body,
                        approval_tool_ids=self._approval_tool_ids,
                        agent_id=agent_id,
                        user_jwt_token=metric_user_jwt_token,
                        pod_name=None,
                    )
                    logger.debug(
                        "[Vercel AI] Wrapped StreamingResponse body_iterator with approvals"
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
