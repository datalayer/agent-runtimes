# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
ACP (Agent Client Protocol) routes for agent-runtimes server.

Provides WebSocket-based communication for agent interactions following
the ACP specification from https://agentclientprotocol.com

Uses the official ACP Python SDK from:
https://github.com/agentclientprotocol/python-sdk

Protocol Features:
- JSON-RPC 2.0 message format
- Protocol version: 1 (integer for MAJOR version)
- Session-based communication
- Streaming via session/update notifications

Supported Methods:
- initialize: Capability negotiation
- session/new: Create new session
- session/load: Load existing session
- session/prompt: Send prompt to agent
- session/set_mode: Change session mode
- session/cancel: Cancel running prompt
"""

import asyncio
import logging
import time
import uuid
from typing import Any

# Import from official ACP SDK
from acp import (
    PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
)
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, SerializerFunctionWrapHandler, model_serializer

from ..adapters.base import BaseAgent
from ..context.delegation import STEER_METHOD
from ..context.identities import set_request_user_jwt
from ..context.usage import TurnSpend
from ..otel.prompt_turn_metrics import (
    extract_identity_hints,
    extract_jwt_token,
    extract_user_id_from_jwt,
    record_prompt_turn_completion,
)
from ..protocol_state import acp as sessions
from ..transports.acp import ACPSession, ACPTransport

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/acp", tags=["acp"])


# ACP Protocol Constants
ACP_JSONRPC_VERSION = "2.0"


class AgentCapabilities(BaseModel):
    """
    Agent capabilities for ACP protocol (extended info).
    """

    streaming: bool = True
    tool_calling: bool = True
    code_execution: bool = True
    file_access: bool = False
    permissions: list[str] = Field(default_factory=list)


class AgentInfo(BaseModel):
    """
    Agent information for ACP discovery.
    """

    id: str
    name: str
    description: str = ""
    capabilities: AgentCapabilities = Field(default_factory=AgentCapabilities)
    version: str = "1.0.0"
    protocol_version: int = ACP_PROTOCOL_VERSION
    protocol: str = (
        "ag-ui"  # Transport protocol: ag-ui, vercel-ai, vercel-ai-jupyter, a2a
    )


class SessionInfo(BaseModel):
    """
    Session information for ACP.
    """

    session_id: str
    agent_id: str
    created_at: str
    status: str = "active"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ACPMessage(BaseModel):
    """
    Base ACP message format.

    Per JSON-RPC 2.0 spec, id can be a string, number, or null.

    What it is written as is exactly one JSON-RPC message: a request or a
    notification carries its method, and its id and params when it has them;
    a response carries its id and either its result or its error. Never both,
    and never the other member as null — a conforming client reads an
    ``error`` member as a failure whatever its value, which is how the
    repository's own ACP client came to refuse every answer of this route.
    """

    jsonrpc: str = "2.0"
    id: str | int | None = None
    method: str | None = None
    params: dict[str, Any] | None = None
    result: Any | None = None
    error: dict[str, Any] | None = None

    @model_serializer(mode="wrap")
    def _json_rpc(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        dumped = handler(self)
        if self.method is not None:
            return {
                key: dumped[key]
                for key in ("jsonrpc", "id", "method", "params")
                if dumped.get(key) is not None
            }
        member = "error" if self.error is not None else "result"
        return {"jsonrpc": dumped["jsonrpc"], "id": dumped["id"], member: dumped[member]}


class ACPError(BaseModel):
    """
    ACP error response.
    """

    code: int
    message: str
    data: Any | None = None


# ACP Error Codes
class ACPErrorCode:
    PARSE_ERROR = -32700
    INVALID_REQUEST = -32600
    METHOD_NOT_FOUND = -32601
    INVALID_PARAMS = -32602
    INTERNAL_ERROR = -32603
    SESSION_NOT_FOUND = -32001
    PERMISSION_DENIED = -32002
    AGENT_NOT_FOUND = -32003


# The agents registered in this process, and the transport of each open
# connection's session: process state, made again by whoever connects. The
# sessions themselves are records of the protocol state store
# (`protocol_state/acp.py`), so `session/load` on a restarted runtime finds the
# session a client names (O1-11).
_agents: dict[str, tuple[BaseAgent, AgentInfo]] = {}
_adapters: dict[str, ACPTransport] = {}

# Track running prompts per session ID for termination
# Maps session_id to a cancellation event
_running_prompts: dict[str, asyncio.Event] = {}


def register_prompt(session_id: str) -> asyncio.Event:
    """
    Register a running prompt and return its cancellation event.

    Args:
        session_id: The session identifier.

    Returns:
        An asyncio.Event that can be set to signal cancellation.
    """
    cancel_event = asyncio.Event()
    _running_prompts[session_id] = cancel_event
    logger.debug(f"Registered ACP prompt for session: {session_id}")
    return cancel_event


def unregister_prompt(session_id: str) -> None:
    """
    Unregister a prompt when it completes.

    Args:
        session_id: The session identifier to remove.
    """
    if session_id in _running_prompts:
        del _running_prompts[session_id]
        logger.debug(f"Unregistered ACP prompt for session: {session_id}")


def cancel_prompt(session_id: str) -> bool:
    """
    Cancel a running prompt and interrupt the sandbox.

    Args:
        session_id: The session identifier to cancel.

    Returns:
        True if the prompt was found and cancelled, False otherwise.
    """
    if session_id in _running_prompts:
        _running_prompts[session_id].set()
        logger.info(f"Cancelled ACP prompt for session: {session_id}")
        # Also interrupt the sandbox so running code stops immediately.
        try:
            from agent_runtimes.services.code_sandbox_manager import interrupt_sandbox

            interrupt_sandbox()
        except Exception:
            pass
        return True
    return False


def cancel_all_prompts() -> int:
    """
    Cancel all running prompts and interrupt the sandbox.

    Returns:
        Number of prompts cancelled.
    """
    count = 0
    for session_id, cancel_event in _running_prompts.items():
        cancel_event.set()
        count += 1
        logger.info(f"Cancelled ACP prompt for session: {session_id}")
    if count > 0:
        try:
            from agent_runtimes.services.code_sandbox_manager import interrupt_sandbox

            interrupt_sandbox()
        except Exception:
            pass
    return count


def register_agent(agent: BaseAgent, info: AgentInfo) -> None:
    """
    Register an agent with the ACP server.
    """
    _agents[info.id] = (agent, info)
    logger.info(f"Registered agent: {info.id} ({info.name})")


def unregister_agent(agent_id: str) -> None:
    """
    Unregister an agent from the ACP server.
    """
    if agent_id in _agents:
        del _agents[agent_id]
    try:
        from ..streams.loop import purge_agent_stream_state

        purge_agent_stream_state(agent_id)
    except Exception as e:
        logger.debug("Could not purge stream state for %s: %s", agent_id, e)
    logger.info(f"Unregistered agent: {agent_id}")


# REST Endpoints for ACP
@router.get("/agents")
async def list_agents() -> dict[str, Any]:
    """
    List all available agents.

    Returns:
        List of agent information.
    """
    return {"agents": [info.model_dump() for _, info in list(_agents.values())]}


@router.get("/agents/{agent_id:path}")
async def get_agent(agent_id: str) -> AgentInfo:
    """
    Get information about a specific agent.

    Args:
        agent_id: The agent identifier.

    Returns:
        Agent information.

    Raises:
        HTTPException: If agent not found.
    """
    if agent_id not in _agents:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")

    _, info = _agents[agent_id]
    return info


@router.get("/sessions")
async def list_sessions() -> dict[str, Any]:
    """
    List the sessions this runtime keeps, whichever process made them.

    Returns:
        List of session information.
    """
    return {
        "sessions": [
            SessionInfo(
                session_id=session.id,
                agent_id=session.agent_id,
                created_at=session.created_at,
                status=session.status,
                metadata=session.metadata,
            ).model_dump()
            for session in await sessions.list_sessions()
        ]
    }


@router.get("/sessions/{session_id}")
async def get_session(session_id: str) -> SessionInfo:
    """
    Get information about a specific session.

    Args:
        session_id: The session identifier.

    Returns:
        Session information.

    Raises:
        HTTPException: If session not found.
    """
    session = await sessions.load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    return SessionInfo(
        session_id=session.id,
        agent_id=session.agent_id,
        created_at=session.created_at,
        status=session.status,
        metadata=session.metadata,
    )


@router.delete("/sessions/{session_id}")
async def close_session(session_id: str) -> dict[str, str]:
    """
    Close a session: its running prompt stops, and it and its conversation are forgotten.

    Args:
        session_id: The session identifier.

    Returns:
        Confirmation message.

    Raises:
        HTTPException: If session not found.
    """
    if not await sessions.close_session(session_id):
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    cancel_prompt(session_id)
    _adapters.pop(session_id, None)
    return {"message": f"Session {session_id} closed"}


# WebSocket Endpoint for ACP
@router.websocket("/ws/{agent_id:path}")
async def websocket_endpoint(websocket: WebSocket, agent_id: str) -> None:
    """
    WebSocket endpoint for ACP communication.

    Implements the ACP protocol over WebSocket for real-time
    bidirectional communication with agents.

    Args:
        websocket: The WebSocket connection.
        agent_id: The target agent identifier.
    """
    await websocket.accept()

    # Check if agent exists
    if agent_id not in _agents:
        await websocket.send_json(
            ACPMessage(
                error=ACPError(
                    code=ACPErrorCode.AGENT_NOT_FOUND,
                    message=f"Agent not found: {agent_id}",
                ).model_dump()
            ).model_dump()
        )
        await websocket.close()
        return

    agent, agent_info = _agents[agent_id]
    session_id: str | None = None
    adapter: ACPTransport | None = None
    # The prompts this connection is running, each on a task of its own.
    prompts: set[asyncio.Task[None]] = set()
    websocket_user_jwt_token = extract_jwt_token(
        websocket.headers.get("authorization"),
        websocket.headers.get("x-external-token"),
    )

    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            message = ACPMessage(**data)

            # Handle different methods
            if message.method == "initialize":
                # Initialize connection
                response = await _handle_initialize(
                    websocket, message, agent, agent_info
                )
                session_id = response.get("session_id")
                if session_id:
                    adapter = ACPTransport(agent)
                    _adapters[session_id] = adapter

            # ACP spec method: session/new
            elif message.method == "session/new":
                response = await _handle_new_session(
                    websocket, message, agent, agent_info
                )
                session_id = response.get("session_id")
                if session_id:
                    adapter = ACPTransport(agent)
                    _adapters[session_id] = adapter

            # Legacy method name: acp.session.new
            elif message.method == "acp.session.new":
                # Create new session
                response = await _handle_new_session(
                    websocket, message, agent, agent_info
                )
                session_id = response.get("session_id")
                if session_id:
                    adapter = ACPTransport(agent)
                    _adapters[session_id] = adapter

            # ACP spec method: session/prompt. On a task of its own, so this
            # loop goes on reading while the prompt runs: the `session/cancel`
            # that stops it arrives on this same connection (O1-11).
            elif message.method == "session/prompt":
                prompted_session_id = (message.params or {}).get("sessionId")
                if (
                    not prompted_session_id
                    or await sessions.load_session(prompted_session_id) is None
                ):
                    await _send_error(
                        websocket,
                        message.id,
                        ACPErrorCode.SESSION_NOT_FOUND,
                        f"Session not found: {prompted_session_id}",
                    )
                    continue

                prompting = asyncio.create_task(
                    _handle_prompt(
                        websocket,
                        message,
                        prompted_session_id,
                        agent,
                        _adapters.get(prompted_session_id),
                        websocket_user_jwt_token,
                    )
                )
                prompts.add(prompting)
                prompting.add_done_callback(prompts.discard)

            # Legacy method name: acp.session.run
            elif message.method == "acp.session.run":
                # Run agent on input
                if not session_id or await sessions.load_session(session_id) is None:
                    await _send_error(
                        websocket,
                        message.id,
                        ACPErrorCode.SESSION_NOT_FOUND,
                        "No active session",
                    )
                    continue

                await _handle_run(websocket, message, session_id, agent, adapter)

            # ACP spec method: session/load. The session is read from the
            # protocol state store, whichever process made it, and its
            # conversation is replayed before the load is answered — what the
            # schema asks of an agent that declares `loadSession`.
            elif message.method == "session/load":
                params = message.params or {}
                target_session_id = params.get("sessionId")
                loaded = (
                    await sessions.load_session(target_session_id)
                    if target_session_id
                    else None
                )
                if loaded is None:
                    await _send_error(
                        websocket,
                        message.id,
                        ACPErrorCode.SESSION_NOT_FOUND,
                        f"Session not found: {target_session_id}",
                    )
                    continue

                loaded.status = "active"
                loaded.cwd = params.get("cwd") or loaded.cwd
                if "mcpServers" in params:
                    loaded.mcp_servers = list(params.get("mcpServers") or [])
                await sessions.save_session(loaded)
                session_id = loaded.id
                adapter = ACPTransport(agent)
                _adapters[session_id] = adapter
                for turn in await sessions.turns(session_id):
                    await websocket.send_json(
                        ACPMessage(
                            jsonrpc=ACP_JSONRPC_VERSION,
                            method="session/update",
                            params=_session_update(
                                session_id,
                                {
                                    "sessionUpdate": "user_message_chunk"
                                    if turn["role"] == "user"
                                    else "agent_message_chunk",
                                    "content": _text_block(str(turn["text"])),
                                },
                            ),
                        ).model_dump()
                    )
                await websocket.send_json(
                    ACPMessage(
                        jsonrpc=ACP_JSONRPC_VERSION, id=message.id, result={}
                    ).model_dump()
                )

            # ACP spec method: session/cancel, a notification: the running
            # prompt stops and answers `cancelled`, and the cancel itself is
            # not answered.
            elif message.method == "session/cancel":
                cancelled_session_id = (message.params or {}).get("sessionId")
                if cancelled_session_id:
                    from ..context.delegation import pause_asked, request_pause

                    # A cancel that asks to pause (the Datalayer orchestration
                    # extension, O2-05): the turn keeps a checkpoint of its
                    # conversation and answers with it, rather than only stopping.
                    if pause_asked((message.params or {}).get("_meta")):
                        request_pause(cancelled_session_id)
                    cancel_prompt(cancelled_session_id)

            # The Datalayer orchestration extension's steer (O2-05), a
            # notification: the instructions reach the session's running turn
            # before its next model request, and a session not working drops
            # them.
            elif message.method == STEER_METHOD:
                from ..context.delegation import deliver_steer

                steered = message.params or {}
                steered_session_id = steered.get("sessionId")
                instructions = steered.get("instructions")
                if steered_session_id and isinstance(instructions, str) and instructions:
                    if not deliver_steer(steered_session_id, instructions):
                        logger.info("ACP session %s is not working; its steer was dropped", steered_session_id)

            elif message.method == "acp.permission.respond":
                # Handle permission response
                if adapter:
                    await _handle_permission_response(websocket, message, adapter)

            elif message.method == "shutdown":
                # Shutdown connection
                if session_id:
                    await sessions.set_session_status(session_id, "closed")
                    _adapters.pop(session_id, None)

                await websocket.send_json(
                    ACPMessage(
                        jsonrpc=ACP_JSONRPC_VERSION,
                        id=message.id,
                        result={"status": "shutdown"},
                    ).model_dump()
                )
                break

            else:
                # Unknown method
                await _send_error(
                    websocket,
                    message.id,
                    ACPErrorCode.METHOD_NOT_FOUND,
                    f"Unknown method: {message.method}",
                )

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await _send_error(websocket, None, ACPErrorCode.INTERNAL_ERROR, str(e))
        except Exception:
            pass
    finally:
        # Cleanup: the prompts this connection ran stop with it, and its
        # session is kept, disconnected, for a `session/load` to find.
        for prompting in list(prompts):
            prompting.cancel()
        if session_id:
            await sessions.set_session_status(session_id, "disconnected")
        if session_id and session_id in _adapters:
            del _adapters[session_id]


async def _handle_initialize(
    websocket: WebSocket,
    message: ACPMessage,
    agent: BaseAgent,
    agent_info: AgentInfo,
) -> dict[str, Any]:
    """
    Handle initialize method.

    Per ACP spec, returns:
    - protocolVersion: int (MAJOR version)
    - agentCapabilities: AgentCapabilities object
    """
    session_id = str(uuid.uuid4())

    # Create session with context
    from ..adapters.base import AgentContext

    context = AgentContext(
        session_id=session_id,
        user_id="default",
    )
    session = ACPSession(
        id=session_id,
        context=context,
        agent_id=agent_info.id,
    )
    await sessions.save_session(session)

    from ..context.delegation import EXTENSION_URI

    # Build ACP-compliant response
    result = {
        "protocolVersion": ACP_PROTOCOL_VERSION,
        "agentCapabilities": {
            # The Datalayer orchestration extension (O2-05): a prompt may name
            # its execution and resume from a checkpoint, a `session/cancel`
            # may ask to pause at one, and `_datalayer/steer` reaches the
            # running turn.
            "_meta": {"datalayer": {"extensions": [EXTENSION_URI]}},
            # A session outlives this process, and its conversation is
            # replayed on `session/load` (O1-11).
            "loadSession": True,
            "promptCapabilities": {
                "image": False,
                "audio": False,
                "embeddedContext": True,
            },
            "mcpCapabilities": {
                "http": False,
                "sse": False,
            },
            "sessionCapabilities": {
                "streaming": agent_info.capabilities.streaming,
                "tools": agent_info.capabilities.tool_calling,
                "modes": False,
            },
            # Extended info
            "agent": {
                "id": agent_info.id,
                "name": agent_info.name,
                "description": agent_info.description,
                "version": agent_info.version,
            },
        },
        # For convenience, also include session_id (not in ACP spec but useful)
        "session_id": session_id,
    }

    await websocket.send_json(
        ACPMessage(
            jsonrpc=ACP_JSONRPC_VERSION, id=message.id, result=result
        ).model_dump()
    )

    return {"session_id": session_id}


async def _handle_new_session(
    websocket: WebSocket,
    message: ACPMessage,
    agent: BaseAgent,
    agent_info: AgentInfo,
) -> dict[str, Any]:
    """
    Handle session/new method.

    Per ACP spec, returns sessionId.
    """
    params = message.params or {}
    session_id = str(uuid.uuid4())

    # Create session with context
    from ..adapters.base import AgentContext

    context = AgentContext(
        session_id=session_id,
        user_id=params.get("userId", "default"),
    )
    session = ACPSession(
        id=session_id,
        cwd=params.get("cwd", "."),
        context=context,
        mcp_servers=params.get("mcpServers", []),
        current_mode=params.get("mode"),
        agent_id=agent_info.id,
    )
    await sessions.save_session(session)

    # ACP-compliant response
    result = {
        "sessionId": session_id,
    }

    await websocket.send_json(
        ACPMessage(
            jsonrpc=ACP_JSONRPC_VERSION, id=message.id, result=result
        ).model_dump()
    )

    return {"session_id": session_id}


async def _handle_prompt(
    websocket: WebSocket,
    message: ACPMessage,
    session_id: str,
    agent: BaseAgent,
    adapter: ACPTransport | None,
    user_jwt_token: str | None = None,
) -> None:
    """
    Handle session/prompt method.

    Per ACP spec, sends session/update notifications during processing
    and returns stopReason when complete.
    """
    params = message.params or {}
    # The prompt's content blocks, under the name the schema gives them (O1-11).
    content = params.get("prompt", [])
    metadata = params.get("metadata", {})
    metadata_identities = (
        metadata.get("identities") if isinstance(metadata, dict) else None
    )

    # Extract model from metadata for per-request model override
    model = metadata.get("model") if isinstance(metadata, dict) else None
    if model:
        logger.info(f"ACP: Using model from request metadata: {model}")

    # The text of every text block, in order.
    prompt = "\n".join(
        str(block.get("text", ""))
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    )

    # Convert to context - include model in metadata for agents that support it
    from ..adapters.base import AgentContext

    context_metadata = params.get("metadata", {}) or {}
    if model:
        context_metadata["model"] = model
    from ..guardrails.model_budget import (
        ModelBudgetReached,
        acp_stop_reason,
        delegated_budget,
        refusal_meta,
    )

    # The model budget the delegation set on this turn, in the schema's `_meta`:
    # the adapter applies it as the run's usage limits (O1-07).
    budget = delegated_budget(params.get("_meta"))
    if budget:
        context_metadata["budget"] = budget
    # The execution's token, taken out of `_meta` before anything keeps the
    # prompt: the turn's identity, and its Datalayer MCP toolset's (O1-17).
    from ..checkpoints.protocol_state import ProtocolStateCheckpointStore
    from ..context.delegation import (
        checkpoint_of,
        enter_execution,
        execution_of,
        take_credential,
    )

    delegated_credential = take_credential(params.get("_meta"))
    if delegated_credential:
        context_metadata["user_token"] = delegated_credential
    budget_meta: dict[str, Any] | None = None

    # The execution this turn is for, whose checkpoints it keeps, and the one
    # it resumes from when it was paused (O2-05); what is steered into it while
    # it works reaches its model within the turn.
    execution_id = execution_of(params.get("_meta"))
    # On the turn, where its tools read it: an orchestrated turn asks the
    # control plane for its children rather than taking them (O2-06).
    enter_execution(params.get("_meta"))
    # The conversation before this prompt — none, or the checkpoint's. The
    # prompt is not part of it: the adapter is given the prompt once, as such.
    history: list[dict[str, Any]] = []
    resumed_from = checkpoint_of(params.get("_meta"))
    if resumed_from:
        checkpoint = (
            await ProtocolStateCheckpointStore(execution_id).get(resumed_from)
            if execution_id
            else None
        )
        if checkpoint is None:
            await _send_error(
                websocket,
                message.id,
                ACPErrorCode.INVALID_PARAMS,
                f"Checkpoint '{resumed_from}' of execution '{execution_id}' is not kept by this "
                "runtime, so the turn cannot resume from it.",
            )
            return
        history = [dict(one) for one in checkpoint.messages]
    context_metadata["steer_run"] = session_id

    context = AgentContext(
        session_id=session_id,
        conversation_history=history,
        metadata=context_metadata,
    )

    stop_reason = "end_turn"
    start_time = time.perf_counter()
    tool_call_count = 0
    response_chunks: list[str] = []
    completed_without_error = False
    session = await sessions.load_session(session_id)
    # Kept before it runs: a runtime that stops mid-turn still replays what
    # was asked on `session/load`.
    await sessions.append_turn(session_id, "user", prompt)
    session_agent_id = session.agent_id if session else None
    # What the turn spends, counted from here: answered with the turn, so the
    # control plane knows what its attempt cost (O2-10), and kept in the metrics.
    turn = TurnSpend.begin(session_agent_id)

    session_user_id = session.context.user_id if session and session.context else None
    metric_user_provider = "acp-session"
    hint_user_id, hint_provider, hint_token = extract_identity_hints(
        metadata_identities
    )
    # The execution's token is the turn's identity when the prompt delegated
    # one (O1-17); otherwise the identity hints', or the connection's.
    user_jwt_token = delegated_credential or hint_token or user_jwt_token
    if hint_user_id:
        session_user_id = hint_user_id
    if hint_provider:
        metric_user_provider = hint_provider
    if not session_user_id:
        session_user_id = extract_user_id_from_jwt(user_jwt_token)
    logger.info(
        "ACP prompt metrics context: session_id=%s user_id=%s model=%s",
        session_id,
        session_user_id,
        model,
    )

    # Make the user JWT available to capabilities (e.g. OTEL hooks).
    set_request_user_jwt(user_jwt_token)

    # Register this prompt for potential cancellation
    cancel_event = register_prompt(session_id)

    try:
        if hasattr(agent, "stream"):
            logger.info(f"Using streaming for agent {agent}, prompt: {prompt[:50]}...")
            event_count = 0
            from ..context.delegation import close_steering, open_steering

            # Steerable while it works: what arrives on `_datalayer/steer` for
            # this session reaches its model before the next request (O2-05).
            open_steering(session_id)
            stream = agent.stream(prompt, context).__aiter__()
            cancelled = asyncio.ensure_future(cancel_event.wait())
            try:
                while not cancelled.done():
                    # The next event or the cancel, whichever comes first: an
                    # agent waiting in the middle of its answer is stopped
                    # where it waits, not after its next event (O1-11).
                    step = asyncio.ensure_future(stream.__anext__())
                    await asyncio.wait(
                        {step, cancelled}, return_when=asyncio.FIRST_COMPLETED
                    )
                    if not step.done():
                        step.cancel()
                        try:
                            await step
                        except (asyncio.CancelledError, StopAsyncIteration):
                            pass
                        break
                    try:
                        event = step.result()
                    except StopAsyncIteration:
                        break

                    event_type = ""
                    event_data: Any = None
                    if hasattr(event, "type"):
                        event_type = getattr(event, "type", "")
                        event_data = getattr(event, "data", None)
                    elif isinstance(event, dict):
                        event_type = event.get("type", "")
                        event_data = event.get("data")

                    if event_type == "error" and isinstance(
                        event_data, ModelBudgetReached
                    ):
                        # The turn's budget, reached: a stop reason the schema
                        # has, and which limit in `_meta` (O1-07).
                        stop_reason = acp_stop_reason(event_data.limit)
                        budget_meta = refusal_meta(event_data)
                        break
                    if event_type == "error":
                        # A failed turn is the prompt's error, not an update
                        # the schema does not have.
                        raise RuntimeError(
                            str(event_data) if event_data else "The agent failed."
                        )
                    if event_type == "text" and isinstance(event_data, str):
                        response_chunks.append(event_data)
                    elif event_type == "output" and event_data and not response_chunks:
                        # An agent that answered at once, with no text on the
                        # way: its answer is the turn's message.
                        response_chunks.append(str(event_data))
                        await websocket.send_json(
                            ACPMessage(
                                jsonrpc=ACP_JSONRPC_VERSION,
                                method="session/update",
                                params=_session_update(
                                    session_id,
                                    {
                                        "sessionUpdate": "agent_message_chunk",
                                        "content": _text_block(str(event_data)),
                                    },
                                ),
                            ).model_dump()
                        )
                    elif event_type == "tool_call":
                        tool_call_count += 1
                    elif event_type == "done":
                        turn.reported(
                            event_data.get("usage")
                            if isinstance(event_data, dict)
                            else None
                        )

                    event_count += 1
                    update_params = _convert_event_to_session_update(session_id, event)
                    if update_params is not None:
                        await websocket.send_json(
                            ACPMessage(
                                jsonrpc=ACP_JSONRPC_VERSION,
                                method="session/update",
                                params=update_params,
                            ).model_dump()
                        )
                if cancelled.done():
                    logger.info(f"Prompt cancelled for session {session_id}")
                    stop_reason = "cancelled"
            finally:
                cancelled.cancel()
                closing = getattr(stream, "aclose", None)
                if closing is not None:
                    try:
                        await closing()
                    except Exception:  # noqa: BLE001 - the stream is over either way
                        pass
                close_steering(session_id)

            from ..context.delegation import (
                forget_pause,
                merged_meta,
                pause_requested,
                paused_meta,
                spent_meta,
            )

            paused: dict[str, Any] | None = None
            if stop_reason == "cancelled" and pause_requested(session_id):
                forget_pause(session_id)
                if execution_id:
                    # Paused, not cancelled: the turn's conversation so far is
                    # kept where a resume finds it, in whichever process (O2-05).
                    kept = [*history, {"role": "user", "content": prompt}]
                    if response_chunks:
                        kept.append({"role": "assistant", "content": "".join(response_chunks)})
                    checkpoint = await ProtocolStateCheckpointStore(execution_id).create_checkpoint(
                        "paused", turn=len(kept), messages=kept, metadata={"session_id": session_id}
                    )
                    paused = paused_meta(checkpoint.id)
                    logger.info("ACP session %s paused at %s", session_id, checkpoint.id)
                else:
                    logger.warning(
                        "ACP session %s was asked to pause and names no execution to keep a "
                        "checkpoint under; it is stopped instead",
                        session_id,
                    )

            if response_chunks:
                await sessions.append_turn(
                    session_id, "agent", "".join(response_chunks)
                )
            logger.info(f"Stream complete, received {event_count} events")
            # Send final response with stopReason, and what the turn spent.
            answer_meta = merged_meta(budget_meta, paused, spent_meta(turn.settle()))
            await websocket.send_json(
                ACPMessage(
                    jsonrpc=ACP_JSONRPC_VERSION,
                    id=message.id,
                    result={
                        "stopReason": stop_reason,
                        **({"_meta": answer_meta} if answer_meta else {}),
                    },
                ).model_dump()
            )
            completed_without_error = True
        else:
            # Non-streaming response
            response = await agent.run(prompt, context)
            response_content = response.content if response else ""
            if response and response.tool_calls:
                tool_call_count = len(response.tool_calls)
            turn.reported(response.usage if response else None)
            response_chunks.append(response_content)
            from ..context.delegation import spent_meta

            spent = spent_meta(turn.settle())
            await websocket.send_json(
                ACPMessage(
                    jsonrpc=ACP_JSONRPC_VERSION,
                    id=message.id,
                    result={
                        "stopReason": stop_reason,
                        "output": response_content,
                        **({"_meta": spent} if spent else {}),
                    },
                ).model_dump()
            )
            completed_without_error = True

    except Exception as e:
        logger.error(f"Agent prompt error: {e}")
        await _send_error(
            websocket,
            message.id,
            ACPErrorCode.INTERNAL_ERROR,
            f"Agent execution failed: {str(e)}",
        )
    finally:
        # Always unregister the prompt when done
        unregister_prompt(session_id)

        turn.settle()

        duration_ms = (time.perf_counter() - start_time) * 1000.0
        record_prompt_turn_completion(
            prompt=prompt,
            response="".join(response_chunks),
            duration_ms=duration_ms,
            protocol="acp",
            stop_reason=stop_reason,
            success=completed_without_error,
            model=model if isinstance(model, str) else None,
            tool_call_count=tool_call_count,
            input_tokens=turn.input_tokens,
            output_tokens=turn.output_tokens,
            total_tokens=turn.total_tokens,
            user_id=str(session_user_id) if session_user_id else None,
            user_provider=metric_user_provider,
            identities_count=None,
            user_jwt_token=user_jwt_token,
            agent_id=session_agent_id,
        )


def _convert_event_to_session_update(
    session_id: str, event: Any
) -> dict[str, Any] | None:
    """
    Convert agent event to ACP session/update params.

    Per ACP spec, sessionUpdate types include:
    - agent_message_chunk
    - tool_call
    - tool_call_update
    - agent_thought_chunk

    Returns None for events that should not be sent as session updates (e.g., 'done').
    """
    # Extract event type - handle both dataclass objects and dicts
    if hasattr(event, "type"):
        event_type = event.type
        event_data = getattr(event, "data", None)
        logger.debug(f"Event with type attribute: type={event_type}, data={event_data}")
    elif isinstance(event, dict):
        event_type = event.get("type", "")
        event_data = event.get("data", "")
        logger.debug(f"Event dict: type={event_type}, data={event_data}")
    else:
        # Fallback for unknown event types
        logger.warning(f"Unknown event type: {type(event)}, value: {event}")
        event_type = ""
        event_data = str(event)

    # Skip done events - they should not be sent as session updates
    if event_type == "done":
        logger.debug(f"Skipping done event for session {session_id}")
        return None

    # As the ACP schema spells an update: nested under `update`, its text in a
    # content block (O1-11).
    if event_type == "text":
        return _session_update(
            session_id,
            {
                "sessionUpdate": "agent_message_chunk",
                "content": _text_block(str(event_data)),
            },
        )
    if event_type == "thought":
        return _session_update(
            session_id,
            {
                "sessionUpdate": "agent_thought_chunk",
                "content": _text_block(str(event_data)),
            },
        )
    if event_type == "tool_call":
        call = _fields(event_data)
        return _session_update(
            session_id,
            {
                "sessionUpdate": "tool_call",
                "toolCallId": str(
                    call.get("id") or call.get("tool_call_id") or uuid.uuid4()
                ),
                "title": str(call.get("name") or ""),
                "kind": "other",
                "status": "pending",
                "rawInput": call.get("arguments") or {},
            },
        )
    if event_type == "tool_result":
        result = _fields(event_data)
        return _session_update(
            session_id,
            {
                "sessionUpdate": "tool_call_update",
                "toolCallId": str(result.get("tool_call_id") or result.get("id") or ""),
                "status": "failed" if result.get("error") else "completed",
                "rawOutput": result.get("result", event_data),
            },
        )
    # Anything else — a final `output`, an error, a framework's own events — is
    # not an update the schema has, and is not guessed into one.
    return None


def _text_block(text: str) -> dict[str, Any]:
    """
    A text content block, as the ACP schema spells one.
    """
    return {"type": "text", "text": text}


def _session_update(session_id: str, update: dict[str, Any]) -> dict[str, Any]:
    """
    The parameters of a `session/update` notification: the update nested under `update`.
    """
    return {"sessionId": session_id, "update": update}


def _fields(data: Any) -> dict[str, Any]:
    """
    An event's data as a mapping, whether it came as one or as a dataclass.
    """
    if isinstance(data, dict):
        return data
    return dict(vars(data)) if hasattr(data, "__dict__") else {}


async def _handle_run(
    websocket: WebSocket,
    message: ACPMessage,
    session_id: str,
    agent: BaseAgent,
    adapter: ACPTransport | None,
) -> None:
    """
    Handle legacy acp.session.run method.
    """
    params = message.params or {}
    input_data = params.get("input", [])
    stream = params.get("stream", True)

    # Convert input to context
    from ..adapters.base import AgentContext

    messages = []
    for item in input_data:
        if isinstance(item, dict) and "content" in item:
            messages.append(
                {
                    "role": item.get("role", "user"),
                    "content": item["content"],
                }
            )
        elif isinstance(item, str):
            messages.append(
                {
                    "role": "user",
                    "content": item,
                }
            )

    # The prompt is the last user message, and what came before it is the
    # conversation the adapter is given: the prompt is not part of that.
    last = max(
        (index for index, msg in enumerate(messages) if msg.get("role") == "user"),
        default=None,
    )
    prompt = messages[last].get("content", "") if last is not None else ""
    context = AgentContext(
        session_id=session_id,
        conversation_history=messages[:last] if last is not None else messages,
        metadata=params.get("metadata", {}),
    )

    try:
        if stream and hasattr(agent, "stream"):
            # Streaming response
            async for event in agent.stream(prompt, context):
                notification = ACPMessage(
                    method="acp.session.notify",
                    params={
                        "session_id": session_id,
                        "event": event,
                    },
                )
                await websocket.send_json(notification.model_dump())

            # Send final result
            await websocket.send_json(
                ACPMessage(
                    id=message.id,
                    result={
                        "status": "completed",
                        "session_id": session_id,
                    },
                ).model_dump()
            )
        else:
            # Non-streaming response
            response = await agent.run(prompt, context)

            await websocket.send_json(
                ACPMessage(
                    id=message.id,
                    result={
                        "status": "completed",
                        "session_id": session_id,
                        "output": response.content,
                        "tool_calls": [tc for tc in (response.tool_calls or [])],
                    },
                ).model_dump()
            )

    except Exception as e:
        logger.error(f"Agent run error: {e}")
        await _send_error(
            websocket,
            message.id,
            ACPErrorCode.INTERNAL_ERROR,
            f"Agent execution failed: {str(e)}",
        )


async def _handle_permission_response(
    websocket: WebSocket,
    message: ACPMessage,
    adapter: ACPTransport,
) -> None:
    """
    Handle acp.permission.respond method.
    """
    params = message.params or {}
    permission_id = params.get("permission_id")
    granted = params.get("granted", False)

    # Resolve the permission request
    if permission_id and permission_id in adapter._pending_permissions:
        future = adapter._pending_permissions[permission_id]
        future.set_result(granted)
        del adapter._pending_permissions[permission_id]

    await websocket.send_json(
        ACPMessage(id=message.id, result={"acknowledged": True}).model_dump()
    )


async def _send_error(
    websocket: WebSocket,
    message_id: str | int | None,
    code: int,
    message: str,
    data: Any = None,
) -> None:
    """
    Send an error response.
    """
    error = ACPError(code=code, message=message, data=data)
    await websocket.send_json(
        ACPMessage(id=message_id, error=error.model_dump()).model_dump()
    )


# Utility functions for external use
def get_registered_agents() -> list[AgentInfo]:
    """
    Get all registered agents.
    """
    return [info for _, info in list(_agents.values())]


async def get_active_sessions() -> list[SessionInfo]:
    """
    Get the sessions this runtime keeps that are active.
    """
    return [
        SessionInfo(
            session_id=session.id,
            agent_id=session.agent_id,
            created_at=session.created_at,
            status=session.status,
            metadata=session.metadata,
        )
        for session in await sessions.list_sessions()
        if session.status == "active"
    ]
