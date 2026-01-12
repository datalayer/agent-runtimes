# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""MCP-UI protocol adapter.

Implements the MCP-UI (Model Context Protocol UI) for agent-runtimes using the
Python mcp-ui-server SDK.

Protocol Reference: https://mcpui.dev

MCP-UI provides:
- Interactive UI resources in agent responses
- Support for HTML, external URLs, and Remote DOM content
- Secure sandboxed iframe execution
- Two-way communication between UI and host
- Flexible metadata for UI customization
"""

from typing import Any, AsyncIterator

from mcp_ui_server import UIResource, create_ui_resource, UIMetadataKey

from ..adapters.base import BaseAgent, AgentContext
from .base import BaseTransport


class MCPUITransport(BaseTransport):
    """MCP-UI protocol adapter.

    Wraps agent responses to include interactive UI resources using the
    MCP-UI protocol standard.

    The adapter allows agents to return rich, interactive UI components
    that can be rendered in the client application using the @mcp-ui/client
    React components or web components.

    Example:
        from agent_runtimes.agents import PydanticAIAgent
        from agent_runtimes.transports import MCPUITransport

        agent = PydanticAIAgent(...)
        adapter = MCPUITransport(agent)

        # Agent can return UI resources in responses
        response = await adapter.handle_request({
            "message": "Show me a dashboard",
            "session_id": "session-123"
        })

        # Response will include UIResource objects that can be rendered
        # using <UIResourceRenderer /> from @mcp-ui/client
    """

    def __init__(
        self,
        agent: BaseAgent,
        enable_ui_transforms: bool = True,
        default_frame_size: tuple[str, str] | None = None,
    ):
        """Initialize the MCP-UI adapter.

        Args:
            agent: The agent to adapt.
            enable_ui_transforms: Whether to automatically transform agent responses
                into UI resources when appropriate.
            default_frame_size: Default iframe dimensions as CSS strings, e.g.,
                ("800px", "600px") or ("100%", "80vh").
        """
        super().__init__(agent)
        self._enable_ui_transforms = enable_ui_transforms
        self._default_frame_size = default_frame_size or ("100%", "600px")

    @property
    def protocol_name(self) -> str:
        """Get the protocol name."""
        return "mcp-ui"

    def create_html_resource(
        self,
        uri: str,
        html: str,
        metadata: dict[str, Any] | None = None,
        frame_size: tuple[str, str] | None = None,
    ) -> UIResource:
        """Create an HTML UI resource.

        Args:
            uri: Resource URI (must start with 'ui://').
            html: HTML content string.
            metadata: Optional metadata dictionary.
            frame_size: Optional frame size override (width, height).

        Returns:
            UIResource ready to include in agent responses.
        """
        ui_metadata = {}
        if frame_size or self._default_frame_size:
            size = frame_size or self._default_frame_size
            ui_metadata[UIMetadataKey.PREFERRED_FRAME_SIZE] = list(size)

        return create_ui_resource({
            "uri": uri,
            "content": {
                "type": "rawHtml",
                "htmlString": html,
            },
            "encoding": "text",
            "uiMetadata": ui_metadata,
            "metadata": metadata or {},
        })

    def create_external_url_resource(
        self,
        uri: str,
        url: str,
        metadata: dict[str, Any] | None = None,
        frame_size: tuple[str, str] | None = None,
    ) -> UIResource:
        """Create an external URL UI resource.

        Args:
            uri: Resource URI (must start with 'ui://').
            url: External URL to display in iframe.
            metadata: Optional metadata dictionary.
            frame_size: Optional frame size override (width, height).

        Returns:
            UIResource ready to include in agent responses.
        """
        ui_metadata = {}
        if frame_size or self._default_frame_size:
            size = frame_size or self._default_frame_size
            ui_metadata[UIMetadataKey.PREFERRED_FRAME_SIZE] = list(size)

        return create_ui_resource({
            "uri": uri,
            "content": {
                "type": "externalUrl",
                "iframeUrl": url,
            },
            "encoding": "text",
            "uiMetadata": ui_metadata,
            "metadata": metadata or {},
        })

    def create_remote_dom_resource(
        self,
        uri: str,
        script: str,
        framework: str = "react",
        metadata: dict[str, Any] | None = None,
        frame_size: tuple[str, str] | None = None,
    ) -> UIResource:
        """Create a Remote DOM UI resource.

        Args:
            uri: Resource URI (must start with 'ui://').
            script: JavaScript code defining the UI.
            framework: Framework to use ('react' or 'webcomponents').
            metadata: Optional metadata dictionary.
            frame_size: Optional frame size override (width, height).

        Returns:
            UIResource ready to include in agent responses.
        """
        if framework not in ("react", "webcomponents"):
            raise ValueError(f"Invalid framework: {framework}. Must be 'react' or 'webcomponents'")

        ui_metadata = {}
        if frame_size or self._default_frame_size:
            size = frame_size or self._default_frame_size
            ui_metadata[UIMetadataKey.PREFERRED_FRAME_SIZE] = list(size)

        return create_ui_resource({
            "uri": uri,
            "content": {
                "type": "remoteDom",
                "script": script,
                "framework": framework,
            },
            "encoding": "text",
            "uiMetadata": ui_metadata,
            "metadata": metadata or {},
        })

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Handle an MCP-UI request.

        Processes the request through the agent and optionally transforms
        the response to include UI resources.

        Args:
            request: Request data containing:
                - message: User message
                - session_id: Optional session identifier
                - ui_options: Optional UI configuration

        Returns:
            Response with potential UI resources in the content array.
        """
        # Extract request parameters
        message = request.get("message", "")
        session_id = request.get("session_id", f"session-{id(request)}")
        ui_options = request.get("ui_options", {})

        # Create agent context
        context = AgentContext(session_id=session_id)

        # Run the agent
        result = await self.agent.run(message, context)

        # Build response
        response: dict[str, Any] = {
            "role": "assistant",
            "content": [],
        }

        # Add text content if present
        if hasattr(result, "content") and result.content:
            response["content"].append({
                "type": "text",
                "text": result.content,
            })

        # Add tool results if present and they contain UI resources
        if hasattr(result, "tool_results") and result.tool_results:
            for tool_result in result.tool_results:
                # Check if tool result contains UI resources
                if isinstance(tool_result, UIResource):
                    response["content"].append(tool_result)
                elif isinstance(tool_result, dict) and tool_result.get("type") == "resource":
                    response["content"].append(tool_result)
                else:
                    # Regular tool result
                    response["content"].append({
                        "type": "tool_result",
                        "result": tool_result,
                    })

        # Add session info if available
        if session_id:
            response["session_id"] = session_id

        return response

    async def handle_stream(
        self, request: dict[str, Any]
    ) -> AsyncIterator[dict[str, Any]]:
        """Handle a streaming MCP-UI request.

        Streams agent responses and UI resources as they become available.

        Args:
            request: Request data.

        Yields:
            Stream events with text deltas and UI resources.
        """
        # Extract request parameters
        message = request.get("message", "")
        session_id = request.get("session_id", f"session-{id(request)}")

        # Create agent context
        context = AgentContext(session_id=session_id)

        # Yield initial event
        yield {
            "type": "start",
            "session_id": session_id,
        }

        try:
            # Stream from agent
            async for event in self.agent.stream(message, context):
                # Forward text deltas
                if hasattr(event, "delta") and event.delta:
                    yield {
                        "type": "delta",
                        "delta": event.delta,
                    }

                # Forward tool calls
                if hasattr(event, "tool_call"):
                    yield {
                        "type": "tool_call",
                        "tool_call": event.tool_call,
                    }

                # Forward UI resources if present
                if hasattr(event, "ui_resource"):
                    yield {
                        "type": "resource",
                        "resource": event.ui_resource,
                    }

            # Yield completion event
            yield {
                "type": "complete",
                "session_id": session_id,
            }

        except Exception as e:
            # Yield error event
            yield {
                "type": "error",
                "error": str(e),
                "session_id": session_id,
            }

    async def initialize(self) -> None:
        """Initialize the adapter."""
        await self.agent.initialize()
