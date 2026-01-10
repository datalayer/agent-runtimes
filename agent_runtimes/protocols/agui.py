# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""AG-UI protocol adapter.

Implements the AG-UI (Agent UI) protocol for agent-runtimes using Pydantic AI's
built-in AG-UI support from pydantic_ai.ui.ag_ui.

Protocol Reference: https://ai.pydantic.dev/ui/ag-ui/

AG-UI is a lightweight protocol focused on UI integration with:
- Simple JSON message format
- UI-focused events (text, thinking, tool_use)
- Real-time streaming support
- Lightweight for browser clients
"""

from typing import TYPE_CHECKING, Any, AsyncIterator

from pydantic_ai.ui.ag_ui.app import AGUIApp

from ..adapters.base import BaseAgent
from .base import BaseProtocol

if TYPE_CHECKING:
    from starlette.applications import Starlette


class AGUIProtocol(BaseProtocol):
    """AG-UI (Agent UI) protocol adapter.

    Wraps Pydantic AI's built-in AG-UI support to expose agents through
    the AG-UI protocol as an ASGI/Starlette application.

    The adapter creates a Starlette app that can be mounted into a FastAPI
    application or run standalone.

    Example:
        from pydantic_ai import Agent
        from agent_runtimes.agents import PydanticAIAgent
        from agent_runtimes.protocols import AGUIProtocol

        # Create Pydantic AI agent
        pydantic_agent = Agent("openai:gpt-4o")
        
        # Wrap with agent adapter
        agent = PydanticAIAgent(pydantic_agent)
        
        # Create AG-UI adapter
        agui_adapter = AGUIProtocol(agent)
        
        # Get the Starlette app
        app = agui_adapter.get_app()
        
        # Mount in FastAPI
        from fastapi import FastAPI
        from starlette.routing import Mount
        
        main_app = FastAPI()
        main_app.mount("/agentic_chat", app)
    """

    def __init__(self, agent: BaseAgent, **kwargs: Any):
        """Initialize the AG-UI adapACPProtocolter.

        Args:
            agent: The agent to adapt.
            **kwargs: Additional arguments passed to AGUIApp.
        """
        super().__init__(agent)
        self._agui_kwargs = kwargs
        self._app: Starlette | None = None

    @property
    def protocol_name(self) -> str:
        """Get the protocol name."""
        return "ag-ui"

    def get_app(self) -> "Starlette":
        """Get the Starlette/ASGI application for AG-UI.

        This creates an AGUIApp instance that can be mounted into a FastAPI
        application or run standalone with uvicorn.

        Returns:
            Starlette application implementing the AG-UI protocol.
        """
        if self._app is None:
            # Get the underlying Pydantic AI agent
            if hasattr(self.agent, "_agent"):
                # PydanticAIAgent wraps a pydantic_ai.Agent
                pydantic_agent = self.agent._agent
            else:
                raise ValueError(
                    "AGUIProtocol requires a PydanticAIAgent that wraps a pydantic_ai.Agent"
                )

            # Create the AG-UI app using Pydantic AI's built-in support
            self._app = AGUIApp(pydantic_agent, **self._agui_kwargs)

        return self._app

    async def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Handle an AG-UI request.

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
        """Handle a streaming AG-UI request.

        Note: AG-UI uses Starlette/ASGI for streaming. Use get_app() instead.

        Args:
            request: AG-UI request data.

        Yields:
            AG-UI stream events.
        """
        raise NotImplementedError(
            "AG-UI adapter uses Starlette/ASGI interface. "
            "Use get_app() to get the Starlette application."
        )
        # Make this a generator
        yield  # type: ignore
