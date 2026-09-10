# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
ACP (Agent Communication Protocol) client.

Provides:
- WebSocket-based communication with ACP-compatible agent servers
- Session management
- Message streaming
- Permission handling

Uses the official ACP Python SDK from https://github.com/agentclientprotocol/python-sdk

Example:
    async with ACPClient("ws://localhost:8000/api/v1/acp/ws/agent-1") as client:
        session = await client.create_session()
        async for event in client.run("Hello, agent!", stream=True):
            print(event)
"""

import asyncio
import json
import logging
import uuid
from typing import Any, AsyncGenerator, Callable

# Import from official ACP SDK
from acp import (
    AGENT_METHODS,
    CLIENT_METHODS,
    PROTOCOL_VERSION,
    InitializeRequest,
    InitializeResponse,
    NewSessionRequest,
    NewSessionResponse,
    PromptRequest,
    PromptResponse,
    RequestPermissionResponse,
    SessionNotification,
    text_block,
)
from acp.schema import (
    AgentCapabilities,
    AllowedOutcome,
    ClientCapabilities,
    DeniedOutcome,
    Implementation,
)


def _wire(model: Any) -> dict[str, Any]:
    """One ACP message, as the protocol spells it.

    The schema's fields are snake_case with camelCase aliases, and the wire
    is the aliases: `sessionId`, `protocolVersion`, `clientCapabilities`.
    Dumped without them every request went out in a spelling no conformant
    agent reads. `None`s are dropped so an optional field that was never set
    is absent rather than null.
    """
    return model.model_dump(by_alias=True, exclude_none=True)


try:
    import websockets  # noqa: F401
    from websockets.asyncio.client import connect as ws_connect

    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False

logger = logging.getLogger(__name__)


class ACPClientError(Exception):
    """Error raised during ACP client operations."""

    pass


class ACPClient:
    """
    ACP (Agent Communication Protocol) client.

    Connects to ACP-compatible agent servers via WebSocket.

    Example:
        async with ACPClient("ws://localhost:8000/api/v1/acp/ws/agent-1") as client:
            session = await client.create_session()
            async for event in client.run("Hello, agent!", stream=True):
                print(event)
    """

    def __init__(
        self,
        url: str,
        headers: dict[str, str] | None = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the ACP client.

        Args:
            url: WebSocket URL of the ACP server.
            headers: Optional headers for the WebSocket connection.
            timeout: Connection timeout in seconds.
        """
        if not HAS_WEBSOCKETS:
            raise ImportError(
                "websockets package is required for ACP client. "
                "Install it with: pip install websockets"
            )

        self.url = url
        self.headers = headers or {}
        self.timeout = timeout

        self._websocket: Any | None = None
        self._session_id: str | None = None
        self._agent_info: Implementation | None = None
        self._agent_capabilities: AgentCapabilities | None = None
        self._pending_requests: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._notification_handlers: list[Callable[[dict[str, Any]], None]] = []
        self._receive_task: asyncio.Task[None] | None = None

    async def connect(self) -> "ACPClient":
        """
        Connect to the ACP server.

        Returns:
            Self for chaining.
        """
        self._websocket = await ws_connect(
            self.url,
            additional_headers=self.headers,
            close_timeout=self.timeout,
        )

        # Start receive loop
        self._receive_task = asyncio.create_task(self._receive_loop())

        # Initialize connection
        await self._initialize()

        return self

    async def disconnect(self) -> None:
        """Disconnect from the ACP server."""
        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass

        if self._websocket:
            await self._websocket.close()
            self._websocket = None

        self._session_id = None
        self._agent_info = None

    async def __aenter__(self) -> "ACPClient":
        """Async context manager entry."""
        return await self.connect()

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.disconnect()

    async def _initialize(self) -> None:
        """Initialize the ACP connection using SDK types."""
        # The protocol version is required by `InitializeRequest` and is what
        # tells the agent which ACP this client speaks; without it the SDK
        # refuses to build the request at all.
        init_request = InitializeRequest(
            protocol_version=PROTOCOL_VERSION,
            client_capabilities=ClientCapabilities(),
        )

        response = await self._send_request(
            AGENT_METHODS["initialize"], _wire(init_request)
        )

        if response:
            # Parse as InitializeResponse
            init_response = InitializeResponse(**response)
            self._agent_info = init_response.agent_info
            self._agent_capabilities = init_response.agent_capabilities

            if self._agent_info:
                logger.info(f"Connected to agent: {self._agent_info.name}")

    async def create_session(
        self,
        cwd: str = ".",
        mcp_servers: list[dict[str, Any]] | None = None,
    ) -> str:
        """
        Create a new session with the agent using SDK types.

        Args:
            cwd: Current working directory for the session.
            mcp_servers: Optional MCP server configurations.

        Returns:
            Session ID.
        """
        # Create session request using SDK type
        session_request = NewSessionRequest(cwd=cwd, mcp_servers=mcp_servers or [])

        response = await self._send_request(
            AGENT_METHODS["session_new"], _wire(session_request)
        )

        if response:
            # Parse as NewSessionResponse
            session_response = NewSessionResponse(**response)
            self._session_id = session_response.session_id
            return session_response.session_id

        raise ACPClientError("Failed to create session")

    async def run(
        self,
        input_text: str,
        stream: bool = True,
    ) -> AsyncGenerator[SessionNotification | PromptResponse, None]:
        """
        Run the agent on the given input using SDK types.

        Args:
            input_text: The input text to send to the agent.
            stream: Whether to stream responses.

        Yields:
            SessionNotification updates during streaming, then PromptResponse.
        """
        if not self._session_id:
            await self.create_session()

        # Create prompt request using SDK type
        prompt_request = PromptRequest(
            session_id=self._session_id, prompt=[text_block(input_text)]
        )

        # Create event queue for notifications
        event_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        # Register notification handler for session updates
        def notification_handler(msg: dict[str, Any]) -> None:
            if msg.get("method") == CLIENT_METHODS["session_update"]:
                params = msg.get("params", {})
                # The wire is camelCase; a notification for another session
                # is not this prompt's.
                if (
                    params.get("sessionId", params.get("session_id"))
                    == self._session_id
                ):
                    asyncio.create_task(event_queue.put(params))

        self._notification_handlers.append(notification_handler)

        try:
            # The prompt request only answers when the turn is over, so it
            # cannot be awaited before reading the updates it produces: the
            # updates arrive *during* it. Started as a task, the queue is
            # drained while it runs and the response is taken at the end.
            #
            # Awaiting it first — as this did — meant every update sat in the
            # queue until the turn finished and then only the first was
            # yielded, because the loop broke as soon as it saw a response.
            pending = asyncio.ensure_future(
                self._send_request(
                    AGENT_METHODS["session_prompt"], _wire(prompt_request)
                )
            )

            if stream:
                while True:
                    getter = asyncio.ensure_future(event_queue.get())
                    done, _ = await asyncio.wait(
                        {getter, pending},
                        timeout=self.timeout,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    if getter in done:
                        yield SessionNotification(**getter.result())
                        continue
                    getter.cancel()
                    if pending in done:
                        # The turn is over. Anything already queued is part
                        # of it and is yielded before the response.
                        while not event_queue.empty():
                            yield SessionNotification(**event_queue.get_nowait())
                        break
                    # Neither: the agent has gone quiet for longer than the
                    # timeout, which is the caller's answer as much as a
                    # response would be.
                    pending.cancel()
                    break

            response = None
            if not pending.cancelled():
                try:
                    response = await pending
                except asyncio.CancelledError:
                    response = None
            if response:
                yield PromptResponse(**response)

        finally:
            self._notification_handlers.remove(notification_handler)

    async def send_message(
        self,
        content: str,
    ) -> AsyncGenerator[SessionNotification | PromptResponse, None]:
        """
        Send a message to the agent and stream responses.

        Convenience method that wraps run().

        Args:
            content: The message content.

        Yields:
            SessionNotification updates and PromptResponse.
        """
        async for event in self.run(content, stream=True):
            yield event

    async def respond_to_permission(
        self,
        request_id: str | int,
        option_id: str | None = None,
    ) -> None:
        """
        Respond to a permission request from the agent using SDK types.

        Args:
            request_id: The JSON-RPC request ID to respond to.
            option_id: The option chosen; `None` refuses the request.

        The answer is an *outcome*, which `RequestPermissionResponse`
        requires: the option selected, or cancelled. Built without one the
        SDK refuses to construct the response, so a permission request was
        never answered at all.
        """
        # `RequestPermissionResponse.outcome` is one of these two: the
        # option that was selected, or cancelled.
        outcome = (
            AllowedOutcome(outcome="selected", option_id=option_id)
            if option_id
            else DeniedOutcome(outcome="cancelled")
        )
        response = RequestPermissionResponse(outcome=outcome)

        # Send as JSON-RPC response
        await self._send_response(request_id, _wire(response))

    async def shutdown(self) -> None:
        """Gracefully shutdown the connection."""
        await self._send_request("shutdown", {})
        await self.disconnect()

    @property
    def session_id(self) -> str | None:
        """Get the current session ID."""
        return self._session_id

    @property
    def agent_info(self) -> Implementation | None:
        """Get information about the connected agent (SDK type)."""
        return self._agent_info

    @property
    def agent_capabilities(self) -> AgentCapabilities | None:
        """Get agent capabilities (SDK type)."""
        return self._agent_capabilities

    @property
    def is_connected(self) -> bool:
        """Check if connected to the server."""
        return self._websocket is not None and not self._websocket.closed

    async def _send_request(
        self,
        method: str,
        params: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Send a JSON-RPC request and wait for response."""
        if not self._websocket:
            raise ACPClientError("Not connected to ACP server")

        message_id = str(uuid.uuid4())
        message = {
            "jsonrpc": "2.0",
            "id": message_id,
            "method": method,
            "params": params,
        }

        # Create future for response
        future: asyncio.Future[dict[str, Any]] = asyncio.Future()
        self._pending_requests[message_id] = future

        try:
            # Send message
            await self._websocket.send(json.dumps(message))

            # Wait for response
            response = await asyncio.wait_for(future, timeout=self.timeout)

            # Return result if success, raise if error
            if "error" in response:
                raise ACPClientError(f"Request failed: {response['error']}")

            return response.get("result")

        finally:
            self._pending_requests.pop(message_id, None)

    async def _send_response(
        self,
        request_id: str | int,
        result: dict[str, Any],
    ) -> None:
        """Send a JSON-RPC response."""
        if not self._websocket:
            raise ACPClientError("Not connected to ACP server")

        message = {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result,
        }

        await self._websocket.send(json.dumps(message))

    async def _receive_loop(self) -> None:
        """Background task to receive JSON-RPC messages."""
        if not self._websocket:
            return

        try:
            async for raw_message in self._websocket:
                try:
                    message = json.loads(raw_message)

                    # Check if this is a response to a pending request
                    if "id" in message and message["id"] in self._pending_requests:
                        self._pending_requests[message["id"]].set_result(message)

                    # Handle notifications (method present, no id)
                    elif "method" in message:
                        for handler in self._notification_handlers:
                            handler(message)

                    # Handle requests (method present with id) - permission requests
                    elif "id" in message and "method" in message:
                        for handler in self._notification_handlers:
                            handler(message)

                except json.JSONDecodeError as e:
                    logger.error(f"Failed to parse message: {e}")
                except Exception as e:
                    logger.error(f"Error processing message: {e}")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Receive loop error: {e}")


async def connect_acp(
    url: str,
    headers: dict[str, str] | None = None,
    timeout: float = 30.0,
) -> ACPClient:
    """
    Connect to an ACP-compatible agent server.

    Convenience function for creating and connecting an ACP client.

    Args:
        url: WebSocket URL of the ACP server.
        headers: Optional headers for the WebSocket connection.
        timeout: Connection timeout in seconds.

    Returns:
        Connected ACP client.

    Example:
        client = await connect_acp("ws://localhost:8000/api/v1/acp/ws/my-agent")
        async for event in client.run("Hello!"):
            print(event)
        await client.disconnect()
    """
    client = ACPClient(url, headers, timeout)
    return await client.connect()
