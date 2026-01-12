# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""ACP (Agent Client Protocol) adapter.

Implements the Agent Client Protocol for agent-runtimes using the
official Python SDK from https://github.com/agentclientprotocol/python-sdk

Protocol Reference: https://agentclientprotocol.com

Key Protocol Features:
- JSON-RPC 2.0 based communication
- Protocol version: 1 (integer for MAJOR version)
- Methods: initialize, session/new, session/prompt, session/load, session/cancel
- Session updates: session/update notifications with various update types
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable, Optional

# Import from official ACP SDK
from acp import (
    PROTOCOL_VERSION,
    AGENT_METHODS,
    CLIENT_METHODS,
    # Request/Response types
    InitializeRequest,
    InitializeResponse,
    NewSessionRequest,
    NewSessionResponse,
    LoadSessionRequest,
    LoadSessionResponse,
    PromptRequest,
    PromptResponse,
    CancelNotification,
    SessionNotification,
    # Helpers
    text_block,
    update_agent_message,
    update_agent_message_text,
    update_agent_thought,
    update_agent_thought_text,
    update_tool_call,
    session_notification,
)
from acp.schema import (
    # Capability types
    AgentCapabilities,
    ClientCapabilities,
    PromptCapabilities,
    McpCapabilities,
    SessionCapabilities,
    Implementation,
    StopReason,
    # Content types
    TextContentBlock,
    ImageContentBlock,
    AudioContentBlock,
    ResourceContentBlock,
    EmbeddedResourceContentBlock,
)

from ..adapters.base import (
    AgentContext,
    BaseAgent,
    StreamEvent,
)
from .base import BaseTransport


@dataclass
class ACPSession:
    """An ACP session.

    Attributes:
        id: Unique session identifier.
        created_at: Unix timestamp when created.
        cwd: Current working directory.
        context: Agent context for this session.
        mcp_servers: Connected MCP servers.
        current_mode: Current session mode.
        cancelled: Whether the session has been cancelled.
    """

    id: str
    created_at: float = field(default_factory=time.time)
    cwd: str = "."
    context: Optional[AgentContext] = None
    mcp_servers: list[dict[str, Any]] = field(default_factory=list)
    current_mode: Optional[str] = None
    cancelled: bool = False


class ACPTransport(BaseTransport):
    """Agent Client Protocol (ACP) adapter.

    Implements the ACP protocol for agent-runtimes using official
    ACP SDK types and utilities for protocol compliance.

    Protocol Reference: https://agentclientprotocol.com

    The adapter supports:
    - initialize: Capability negotiation
    - session/new: Create new sessions
    - session/load: Load existing sessions
    - session/prompt: Run prompts with streaming updates
    - session/cancel: Cancel running prompts

    Example:
        agent = PydanticAIAgent(pydantic_agent)
        adapter = ACPTransport(agent)

        # Handle ACP initialize request
        response = await adapter.handle_initialize(InitializeRequest(...))

        # Handle ACP session/prompt request
        async for event in adapter.handle_prompt(PromptRequest(...)):
            yield event
    """

    def __init__(
        self,
        agent: BaseAgent,
        agent_info: Optional[Implementation] = None,
        permission_handler: Optional[Callable[[dict], bool]] = None,
    ):
        """Initialize the ACP adapter.

        Args:
            agent: The agent to adapt.
            agent_info: Optional agent implementation info (name, version).
            permission_handler: Optional callback for permission requests.
        """
        super().__init__(agent)
        self._sessions: dict[str, ACPSession] = {}
        self._active_session_id: Optional[str] = None
        self._permission_handler = permission_handler
        self._pending_permissions: dict[str, Any] = {}
        self._agent_info = agent_info or Implementation(
            name=agent.name,
            version=getattr(agent, "version", "1.0.0"),
        )
        self._capabilities = AgentCapabilities(
            load_session=False,
            prompt_capabilities=PromptCapabilities(
                image=False,
                audio=False,
                embedded_context=True,
            ),
            mcp_capabilities=McpCapabilities(
                http=False,
                sse=False,
            ),
            session_capabilities=SessionCapabilities(),
        )
        self._client_capabilities: Optional[ClientCapabilities] = None

    @property
    def protocol_name(self) -> str:
        """Get the protocol name."""
        return "acp"

    @property
    def protocol_version(self) -> int:
        """Get the protocol version from official SDK."""
        return PROTOCOL_VERSION

    @property
    def capabilities(self) -> AgentCapabilities:
        """Get agent capabilities."""
        return self._capabilities

    # =========================================================================
    # ACP Request Handlers
    # =========================================================================

    async def handle_initialize(
        self, request: InitializeRequest
    ) -> InitializeResponse:
        """Handle ACP initialize request.

        Per ACP spec, negotiates protocol version and exchanges capabilities.

        Args:
            request: Initialize request from client.

        Returns:
            Initialize response with protocol version and capabilities.
        """
        await self.agent.initialize()
        self._client_capabilities = request.client_capabilities

        return InitializeResponse(
            protocol_version=PROTOCOL_VERSION,
            agent_capabilities=self._capabilities,
            agent_info=self._agent_info,
        )

    async def handle_new_session(
        self, request: NewSessionRequest
    ) -> NewSessionResponse:
        """Handle ACP session/new request.

        Creates a new session with the specified configuration.

        Args:
            request: New session request from client.

        Returns:
            New session response with session ID.
        """
        session_id = str(uuid.uuid4())

        context = AgentContext(
            session_id=session_id,
            user_id="default",
        )

        session = ACPSession(
            id=session_id,
            cwd=request.cwd or ".",
            context=context,
            mcp_servers=request.mcp_servers or [],
        )

        self._sessions[session_id] = session
        self._active_session_id = session_id

        return NewSessionResponse(session_id=session_id)

    async def handle_load_session(
        self, request: LoadSessionRequest
    ) -> Optional[LoadSessionResponse]:
        """Handle ACP session/load request.

        Loads an existing session by ID.

        Args:
            request: Load session request from client.

        Returns:
            Load session response or None if not supported/found.
        """
        if not self._capabilities.load_session:
            return None

        session_id = request.session_id
        if session_id not in self._sessions:
            return None

        self._active_session_id = session_id
        return LoadSessionResponse()

    async def handle_prompt(
        self, request: PromptRequest
    ) -> AsyncIterator[SessionNotification | PromptResponse]:
        """Handle ACP session/prompt request.

        Processes a prompt and yields session update notifications,
        followed by the final prompt response.

        Args:
            request: Prompt request from client.

        Yields:
            Session notifications during processing, then PromptResponse.
        """
        session_id = request.session_id
        session = self._sessions.get(session_id)

        if not session:
            yield PromptResponse(stop_reason="cancelled")
            return

        # Extract prompt text from content blocks
        prompt = self._extract_prompt_text(request.prompt)

        context = session.context
        if context is None:
            context = AgentContext(session_id=session_id)

        # Stream agent response
        try:
            if hasattr(self.agent, "stream"):
                async for event in self.agent.stream(prompt, context):
                    notification = self._convert_to_session_notification(
                        session_id, event
                    )
                    if notification:
                        yield notification

                yield PromptResponse(stop_reason="end_turn")
            else:
                # Non-streaming fallback
                response = await self.agent.run(prompt, context)

                yield session_notification(
                    session_id=session_id,
                    update=update_agent_message_text(
                        response.content if response else ""
                    ),
                )

                yield PromptResponse(stop_reason="end_turn")

        except Exception as e:
            yield PromptResponse(stop_reason="refusal")

    async def handle_cancel(self, notification: CancelNotification) -> None:
        """Handle ACP session/cancel notification.

        Cancels ongoing operations for the specified session.

        Args:
            notification: Cancel notification from client.
        """
        session_id = notification.session_id
        if session_id in self._sessions:
            self._sessions[session_id].cancelled = True

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _extract_prompt_text(
        self,
        content: list[
            TextContentBlock
            | ImageContentBlock
            | AudioContentBlock
            | ResourceContentBlock
            | EmbeddedResourceContentBlock
        ],
    ) -> str:
        """Extract text from content blocks.

        Args:
            content: List of content blocks.

        Returns:
            Extracted text content.
        """
        texts = []
        for block in content:
            if isinstance(block, TextContentBlock):
                texts.append(block.text)
            elif hasattr(block, "text"):
                texts.append(block.text)
        return "\n".join(texts)

    def _convert_to_session_notification(
        self, session_id: str, event: StreamEvent
    ) -> Optional[SessionNotification]:
        """Convert agent stream event to ACP session notification.

        Args:
            session_id: The session ID.
            event: Agent stream event.

        Returns:
            ACP session notification or None.
        """
        event_type = event.type
        event_data = event.data

        if event_type == "text":
            return session_notification(
                session_id=session_id,
                update=update_agent_message_text(str(event_data) if event_data else ""),
            )
        elif event_type == "thought":
            return session_notification(
                session_id=session_id,
                update=update_agent_thought_text(str(event_data) if event_data else ""),
            )
        elif event_type == "tool_call":
            if isinstance(event_data, dict):
                return session_notification(
                    session_id=session_id,
                    update=update_tool_call(
                        tool_call_id=event_data.get("id", ""),
                        name=event_data.get("name", ""),
                        content=[],
                    ),
                )
        elif event_type == "tool_result":
            if isinstance(event_data, dict):
                return session_notification(
                    session_id=session_id,
                    update=update_tool_call(
                        tool_call_id=event_data.get("id", ""),
                        name=event_data.get("name", ""),
                        content=[],
                    ),
                )
        elif event_type in ("done", "error"):
            return None

        # Default: treat as text
        return session_notification(
            session_id=session_id,
            update=update_agent_message_text(str(event_data) if event_data else ""),
        )

    # =========================================================================
    # BaseAdapter Implementation
    # =========================================================================

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Handle a non-streaming ACP JSON-RPC request.

        Args:
            request: JSON-RPC request dictionary.

        Returns:
            JSON-RPC response dictionary.
        """
        method = request.get("method")
        params = request.get("params", {})

        if method == AGENT_METHODS.initialize:
            init_req = InitializeRequest(**params)
            init_resp = await self.handle_initialize(init_req)
            return {"result": init_resp.model_dump()}

        elif method == AGENT_METHODS.session_new:
            session_req = NewSessionRequest(**params)
            session_resp = await self.handle_new_session(session_req)
            return {"result": session_resp.model_dump()}

        elif method == AGENT_METHODS.session_load:
            load_req = LoadSessionRequest(**params)
            load_resp = await self.handle_load_session(load_req)
            if load_resp:
                return {"result": load_resp.model_dump()}
            return {"error": {"code": -32602, "message": "Session not found"}}

        else:
            return {"error": {"code": -32601, "message": f"Method not found: {method}"}}

    async def handle_stream(
        self, request: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """Handle a streaming ACP JSON-RPC request.

        Args:
            request: JSON-RPC request dictionary.

        Yields:
            JSON-RPC notification or response dictionaries.
        """
        method = request.get("method")
        params = request.get("params", {})

        if method == AGENT_METHODS.session_prompt:
            prompt_req = PromptRequest(**params)
            async for event in self.handle_prompt(prompt_req):
                if isinstance(event, SessionNotification):
                    yield {
                        "method": CLIENT_METHODS.session_notification,
                        "params": event.model_dump(),
                    }
                elif isinstance(event, PromptResponse):
                    yield {"result": event.model_dump()}
        else:
            yield {"error": {"code": -32601, "message": f"Method not found: {method}"}}

    # =========================================================================
    # Session Management
    # =========================================================================

    def get_session(self, session_id: str) -> Optional[ACPSession]:
        """Get a session by ID.

        Args:
            session_id: Session ID.

        Returns:
            Session or None.
        """
        return self._sessions.get(session_id)

    @property
    def active_session(self) -> Optional[ACPSession]:
        """Get the active session."""
        if self._active_session_id:
            return self._sessions.get(self._active_session_id)
        return None


# Re-export SDK types and helpers for convenience
__all__ = [
    # Adapter
    "ACPTransport",
    "ACPSession",
    # SDK Constants
    "PROTOCOL_VERSION",
    "AGENT_METHODS",
    "CLIENT_METHODS",
    # Request/Response types
    "InitializeRequest",
    "InitializeResponse",
    "NewSessionRequest",
    "NewSessionResponse",
    "LoadSessionRequest",
    "LoadSessionResponse",
    "PromptRequest",
    "PromptResponse",
    "CancelNotification",
    "SessionNotification",
    # Capability types
    "AgentCapabilities",
    "ClientCapabilities",
    "PromptCapabilities",
    "McpCapabilities",
    "SessionCapabilities",
    "Implementation",
    "StopReason",
    # Content types
    "TextContentBlock",
    "ImageContentBlock",
    "AudioContentBlock",
    "ResourceContentBlock",
    "EmbeddedResourceContentBlock",
    # Helpers
    "text_block",
    "session_notification",
    "update_agent_message",
    "update_agent_message_text",
    "update_agent_thought",
    "update_agent_thought_text",
    "update_tool_call",
]
