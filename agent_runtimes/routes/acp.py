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
import json
import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel, Field

# Import from official ACP SDK
from acp import (
    PROTOCOL_VERSION as ACP_PROTOCOL_VERSION,
    AGENT_METHODS,
    CLIENT_METHODS,
    session_notification,
    update_agent_message_text,
    update_agent_thought_text,
    update_tool_call,
)
from acp.schema import (
    AgentCapabilities as ACPAgentCapabilities,
    PromptCapabilities,
    McpCapabilities,
    SessionCapabilities,
    Implementation,
    InitializeRequest as ACPInitializeRequest,
    InitializeResponse as ACPInitializeResponse,
    NewSessionRequest as ACPNewSessionRequest,
    NewSessionResponse as ACPNewSessionResponse,
    PromptRequest as ACPPromptRequest,
    PromptResponse as ACPPromptResponse,
    SessionNotification as ACPSessionNotification,
)

from ..adapters.base import BaseAgent
from ..transports.acp import ACPTransport, ACPSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/acp", tags=["acp"])


# ACP Protocol Constants
ACP_JSONRPC_VERSION = "2.0"


class AgentCapabilities(BaseModel):
    """Agent capabilities for ACP protocol (extended info)."""
    streaming: bool = True
    tool_calling: bool = True
    code_execution: bool = True
    file_access: bool = False
    permissions: list[str] = Field(default_factory=list)


class AgentInfo(BaseModel):
    """Agent information for ACP discovery."""
    id: str
    name: str
    description: str = ""
    capabilities: AgentCapabilities = Field(default_factory=AgentCapabilities)
    version: str = "1.0.0"
    protocol_version: int = ACP_PROTOCOL_VERSION


class SessionInfo(BaseModel):
    """Session information for ACP."""
    session_id: str
    agent_id: str
    created_at: str
    status: str = "active"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ACPMessage(BaseModel):
    """Base ACP message format.
    
    Per JSON-RPC 2.0 spec, id can be a string, number, or null.
    """
    jsonrpc: str = "2.0"
    id: str | int | None = None
    method: str | None = None
    params: dict[str, Any] | None = None
    result: Any | None = None
    error: dict[str, Any] | None = None


class ACPError(BaseModel):
    """ACP error response."""
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


# In-memory stores (should be replaced with proper persistence in production)
_agents: dict[str, tuple[BaseAgent, AgentInfo]] = {}
_sessions: dict[str, ACPSession] = {}
_adapters: dict[str, ACPTransport] = {}

# Track running prompts per session ID for termination
# Maps session_id to a cancellation event
_running_prompts: dict[str, asyncio.Event] = {}


def register_prompt(session_id: str) -> asyncio.Event:
    """Register a running prompt and return its cancellation event.
    
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
    """Unregister a prompt when it completes.
    
    Args:
        session_id: The session identifier to remove.
    """
    if session_id in _running_prompts:
        del _running_prompts[session_id]
        logger.debug(f"Unregistered ACP prompt for session: {session_id}")


def cancel_prompt(session_id: str) -> bool:
    """Cancel a running prompt.
    
    Args:
        session_id: The session identifier to cancel.
        
    Returns:
        True if the prompt was found and cancelled, False otherwise.
    """
    if session_id in _running_prompts:
        _running_prompts[session_id].set()
        logger.info(f"Cancelled ACP prompt for session: {session_id}")
        return True
    return False


def cancel_all_prompts() -> int:
    """Cancel all running prompts.
    
    Returns:
        Number of prompts cancelled.
    """
    count = 0
    for session_id, cancel_event in _running_prompts.items():
        cancel_event.set()
        count += 1
        logger.info(f"Cancelled ACP prompt for session: {session_id}")
    return count


def register_agent(agent: BaseAgent, info: AgentInfo) -> None:
    """Register an agent with the ACP server."""
    _agents[info.id] = (agent, info)
    logger.info(f"Registered agent: {info.id} ({info.name})")


def unregister_agent(agent_id: str) -> None:
    """Unregister an agent from the ACP server."""
    if agent_id in _agents:
        del _agents[agent_id]
        logger.info(f"Unregistered agent: {agent_id}")


# REST Endpoints for ACP
@router.get("/agents")
async def list_agents() -> dict[str, Any]:
    """
    List all available agents.
    
    Returns:
        List of agent information.
    """
    return {
        "agents": [info.model_dump() for _, info in _agents.values()]
    }


@router.get("/agents/{agent_id}")
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
    List all active sessions.
    
    Returns:
        List of session information.
    """
    sessions = []
    for session_id, session in _sessions.items():
        sessions.append(SessionInfo(
            session_id=session_id,
            agent_id=session.agent_id,
            created_at=session.created_at,
            status=session.status,
            metadata=session.metadata,
        ).model_dump())
    
    return {"sessions": sessions}


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
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    session = _sessions[session_id]
    return SessionInfo(
        session_id=session_id,
        agent_id=session.agent_id,
        created_at=session.created_at,
        status=session.status,
        metadata=session.metadata,
    )


@router.delete("/sessions/{session_id}")
async def close_session(session_id: str) -> dict[str, str]:
    """
    Close an active session.
    
    Args:
        session_id: The session identifier.
        
    Returns:
        Confirmation message.
        
    Raises:
        HTTPException: If session not found.
    """
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    session = _sessions[session_id]
    session.status = "closed"
    del _sessions[session_id]
    
    # Clean up adapter if exists
    if session_id in _adapters:
        del _adapters[session_id]
    
    return {"message": f"Session {session_id} closed"}


# WebSocket Endpoint for ACP
@router.websocket("/ws/{agent_id}")
async def websocket_endpoint(websocket: WebSocket, agent_id: str):
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
        await websocket.send_json(ACPMessage(
            error=ACPError(
                code=ACPErrorCode.AGENT_NOT_FOUND,
                message=f"Agent not found: {agent_id}",
            ).model_dump()
        ).model_dump())
        await websocket.close()
        return
    
    agent, agent_info = _agents[agent_id]
    session_id: str | None = None
    adapter: ACPTransport | None = None
    
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
            
            # ACP spec method: session/prompt
            elif message.method == "session/prompt":
                if not session_id or session_id not in _sessions:
                    await _send_error(
                        websocket, message.id,
                        ACPErrorCode.SESSION_NOT_FOUND,
                        "No active session"
                    )
                    continue
                    
                await _handle_prompt(
                    websocket, message, session_id, agent, adapter
                )
            
            # Legacy method name: acp.session.run
            elif message.method == "acp.session.run":
                # Run agent on input
                if not session_id or session_id not in _sessions:
                    await _send_error(
                        websocket, message.id,
                        ACPErrorCode.SESSION_NOT_FOUND,
                        "No active session"
                    )
                    continue
                    
                await _handle_run(
                    websocket, message, session_id, agent, adapter
                )
            
            # ACP spec method: session/load
            elif message.method == "session/load":
                params = message.params or {}
                target_session_id = params.get("sessionId")
                if target_session_id and target_session_id in _sessions:
                    session_id = target_session_id
                    await websocket.send_json(ACPMessage(
                        jsonrpc=ACP_JSONRPC_VERSION,
                        id=message.id,
                        result={"sessionId": session_id}
                    ).model_dump())
                else:
                    await _send_error(
                        websocket, message.id,
                        ACPErrorCode.SESSION_NOT_FOUND,
                        f"Session not found: {target_session_id}"
                    )
            
            # ACP spec method: session/cancel
            elif message.method == "session/cancel":
                # Cancel the running prompt for this session
                params = message.params or {}
                target_session_id = params.get("sessionId", session_id)
                
                if target_session_id:
                    cancelled = cancel_prompt(target_session_id)
                    await websocket.send_json(ACPMessage(
                        jsonrpc=ACP_JSONRPC_VERSION,
                        id=message.id,
                        result={
                            "acknowledged": True,
                            "cancelled": cancelled,
                            "sessionId": target_session_id,
                        }
                    ).model_dump())
                else:
                    # Cancel all prompts if no session specified
                    count = cancel_all_prompts()
                    await websocket.send_json(ACPMessage(
                        jsonrpc=ACP_JSONRPC_VERSION,
                        id=message.id,
                        result={
                            "acknowledged": True,
                            "cancelled": count > 0,
                            "cancelledCount": count,
                        }
                    ).model_dump())
                
            elif message.method == "acp.permission.respond":
                # Handle permission response
                if adapter:
                    await _handle_permission_response(
                        websocket, message, adapter
                    )
                    
            elif message.method == "shutdown":
                # Shutdown connection
                if session_id and session_id in _sessions:
                    _sessions[session_id].status = "closed"
                    del _sessions[session_id]
                if session_id and session_id in _adapters:
                    del _adapters[session_id]
                    
                await websocket.send_json(ACPMessage(
                    jsonrpc=ACP_JSONRPC_VERSION,
                    id=message.id,
                    result={"status": "shutdown"}
                ).model_dump())
                break
                
            else:
                # Unknown method
                await _send_error(
                    websocket, message.id,
                    ACPErrorCode.METHOD_NOT_FOUND,
                    f"Unknown method: {message.method}"
                )
                
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await _send_error(
                websocket, None,
                ACPErrorCode.INTERNAL_ERROR,
                str(e)
            )
        except Exception:
            pass
    finally:
        # Cleanup
        if session_id and session_id in _sessions:
            _sessions[session_id].status = "disconnected"
        if session_id and session_id in _adapters:
            del _adapters[session_id]


async def _handle_initialize(
    websocket: WebSocket,
    message: ACPMessage,
    agent: BaseAgent,
    agent_info: AgentInfo,
) -> dict[str, Any]:
    """Handle initialize method.
    
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
    )
    _sessions[session_id] = session
    
    # Build ACP-compliant response
    result = {
        "protocolVersion": ACP_PROTOCOL_VERSION,
        "agentCapabilities": {
            "loadSession": False,
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
    
    await websocket.send_json(ACPMessage(
        jsonrpc=ACP_JSONRPC_VERSION,
        id=message.id,
        result=result
    ).model_dump())
    
    return {"session_id": session_id}


async def _handle_new_session(
    websocket: WebSocket,
    message: ACPMessage,
    agent: BaseAgent,
    agent_info: AgentInfo,
) -> dict[str, Any]:
    """Handle session/new method.
    
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
    )
    _sessions[session_id] = session
    
    # ACP-compliant response
    result = {
        "sessionId": session_id,
    }
    
    await websocket.send_json(ACPMessage(
        jsonrpc=ACP_JSONRPC_VERSION,
        id=message.id,
        result=result
    ).model_dump())
    
    return {"session_id": session_id}


async def _handle_prompt(
    websocket: WebSocket,
    message: ACPMessage,
    session_id: str,
    agent: BaseAgent,
    adapter: ACPTransport | None,
) -> None:
    """Handle session/prompt method.
    
    Per ACP spec, sends session/update notifications during processing
    and returns stopReason when complete.
    """
    params = message.params or {}
    content = params.get("content", [])
    metadata = params.get("metadata", {})
    
    # Extract model from metadata for per-request model override
    model = metadata.get("model") if isinstance(metadata, dict) else None
    if model:
        logger.info(f"ACP: Using model from request metadata: {model}")
    
    # Extract text from content blocks per ACP spec
    prompt = ""
    for block in content:
        if isinstance(block, str):
            prompt = block
        elif isinstance(block, dict):
            if block.get("type") == "text":
                prompt = block.get("text", "")
    
    # Convert to context - include model in metadata for agents that support it
    from ..adapters.base import AgentContext
    
    context_metadata = params.get("metadata", {}) or {}
    if model:
        context_metadata["model"] = model
    
    context = AgentContext(
        session_id=session_id,
        conversation_history=[{"role": "user", "content": prompt}],
        metadata=context_metadata,
    )
    
    stop_reason = "end_turn"
    
    # Register this prompt for potential cancellation
    cancel_event = register_prompt(session_id)
    
    try:
        if hasattr(agent, "stream"):
            logger.info(f"Using streaming for agent {agent}, prompt: {prompt[:50]}...")
            event_count = 0
            # Streaming response with session/update notifications
            async for event in agent.stream(prompt, context):
                # Check for cancellation
                if cancel_event.is_set():
                    logger.info(f"Prompt cancelled for session {session_id}")
                    stop_reason = "cancelled"
                    break
                    
                event_count += 1
                logger.info(f"Received event #{event_count}: {event}")
                # Send session/update notification per ACP spec
                update_params = _convert_event_to_session_update(session_id, event)
                logger.info(f"Converted to update_params: {update_params}")
                if update_params is not None:  # Skip events that return None (e.g., 'done')
                    notification = ACPMessage(
                        jsonrpc=ACP_JSONRPC_VERSION,
                        method="session/update",
                        params=update_params,
                    )
                    await websocket.send_json(notification.model_dump())
            
            logger.info(f"Stream complete, received {event_count} events")
            # Send final response with stopReason
            await websocket.send_json(ACPMessage(
                jsonrpc=ACP_JSONRPC_VERSION,
                id=message.id,
                result={"stopReason": stop_reason}
            ).model_dump())
        else:
            # Non-streaming response
            response = await agent.run(prompt, context)
            
            await websocket.send_json(ACPMessage(
                jsonrpc=ACP_JSONRPC_VERSION,
                id=message.id,
                result={
                    "stopReason": stop_reason,
                    "output": response.output if response else "",
                }
            ).model_dump())
            
    except Exception as e:
        logger.error(f"Agent prompt error: {e}")
        await _send_error(
            websocket, message.id,
            ACPErrorCode.INTERNAL_ERROR,
            f"Agent execution failed: {str(e)}"
        )
    finally:
        # Always unregister the prompt when done
        unregister_prompt(session_id)


def _convert_event_to_session_update(session_id: str, event: Any) -> dict[str, Any] | None:
    """Convert agent event to ACP session/update params.
    
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
    
    if event_type == "text":
        return {
            "sessionId": session_id,
            "sessionUpdate": "agent_message_chunk",
            "chunk": event_data,
        }
    elif event_type == "tool_call":
        return {
            "sessionId": session_id,
            "sessionUpdate": "tool_call",
            "toolCallId": event_data.get("id", str(uuid.uuid4())) if isinstance(event_data, dict) else str(uuid.uuid4()),
            "name": event_data.get("name", "") if isinstance(event_data, dict) else "",
            "arguments": event_data.get("arguments", {}) if isinstance(event_data, dict) else {},
        }
    elif event_type == "tool_result":
        return {
            "sessionId": session_id,
            "sessionUpdate": "tool_call_update",
            "toolCallId": event_data.get("id", "") if isinstance(event_data, dict) else "",
            "result": event_data.get("result") if isinstance(event_data, dict) else event_data,
        }
    elif event_type == "thought":
        return {
            "sessionId": session_id,
            "sessionUpdate": "agent_thought_chunk",
            "chunk": event_data,
        }
    elif event_type == "error":
        # Error events should be sent with a special sessionUpdate type
        return {
            "sessionId": session_id,
            "sessionUpdate": "error",
            "error": str(event_data) if event_data else "Unknown error",
        }
    else:
        return {
            "sessionId": session_id,
            "sessionUpdate": "agent_message_chunk",
            "chunk": str(event_data) if event_data else "",
        }


async def _handle_run(
    websocket: WebSocket,
    message: ACPMessage,
    session_id: str,
    agent: BaseAgent,
    adapter: ACPTransport | None,
) -> None:
    """Handle legacy acp.session.run method."""
    params = message.params or {}
    input_data = params.get("input", [])
    stream = params.get("stream", True)
    
    # Convert input to context
    from ..adapters.base import AgentContext
    
    messages = []
    for item in input_data:
        if isinstance(item, dict) and "content" in item:
            messages.append({
                "role": item.get("role", "user"),
                "content": item["content"],
            })
        elif isinstance(item, str):
            messages.append({
                "role": "user",
                "content": item,
            })
    
    context = AgentContext(
        session_id=session_id,
        conversation_history=messages,
        metadata=params.get("metadata", {}),
    )
    
    # Extract prompt from the last user message
    prompt = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            prompt = msg.get("content", "")
            break
    
    try:
        if stream and hasattr(agent, "stream"):
            # Streaming response
            async for event in agent.stream(prompt, context):
                notification = ACPMessage(
                    method="acp.session.notify",
                    params={
                        "session_id": session_id,
                        "event": event,
                    }
                )
                await websocket.send_json(notification.model_dump())
            
            # Send final result
            await websocket.send_json(ACPMessage(
                id=message.id,
                result={
                    "status": "completed",
                    "session_id": session_id,
                }
            ).model_dump())
        else:
            # Non-streaming response
            response = await agent.run(prompt, context)
            
            await websocket.send_json(ACPMessage(
                id=message.id,
                result={
                    "status": "completed",
                    "session_id": session_id,
                    "output": response.output,
                    "tool_calls": [tc for tc in (response.tool_calls or [])],
                }
            ).model_dump())
            
    except Exception as e:
        logger.error(f"Agent run error: {e}")
        await _send_error(
            websocket, message.id,
            ACPErrorCode.INTERNAL_ERROR,
            f"Agent execution failed: {str(e)}"
        )


async def _handle_permission_response(
    websocket: WebSocket,
    message: ACPMessage,
    adapter: ACPTransport,
) -> None:
    """Handle acp.permission.respond method."""
    params = message.params or {}
    permission_id = params.get("permission_id")
    granted = params.get("granted", False)
    
    # Resolve the permission request
    if permission_id and permission_id in adapter._pending_permissions:
        future = adapter._pending_permissions[permission_id]
        future.set_result(granted)
        del adapter._pending_permissions[permission_id]
    
    await websocket.send_json(ACPMessage(
        id=message.id,
        result={"acknowledged": True}
    ).model_dump())


async def _send_error(
    websocket: WebSocket,
    message_id: str | None,
    code: int,
    message: str,
    data: Any = None,
) -> None:
    """Send an error response."""
    error = ACPError(code=code, message=message, data=data)
    await websocket.send_json(ACPMessage(
        id=message_id,
        error=error.model_dump()
    ).model_dump())


# Utility functions for external use
def get_registered_agents() -> list[AgentInfo]:
    """Get all registered agents."""
    return [info for _, info in _agents.values()]


def get_active_sessions() -> list[SessionInfo]:
    """Get all active sessions."""
    return [
        SessionInfo(
            session_id=sid,
            agent_id=s.agent_id,
            created_at=s.created_at,
            status=s.status,
            metadata=s.metadata,
        )
        for sid, s in _sessions.items()
    ]
