# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Persistent Agent Node tunnel client for Datalayer Runtimes."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import uuid
from typing import Any

logger = logging.getLogger(__name__)


def _node_id() -> str:
    configured = (os.environ.get("AGENT_NODE_ID") or "").strip()
    if configured:
        return configured
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, socket.gethostname()))


def _runtimes_url() -> str:
    return (
        os.environ.get("DATALAYER_RUNTIMES_URL")
        or os.environ.get("DATALAYER_AGENT_RUNTIMES_URL")
        or ""
    ).strip().rstrip("/")


def _auth_token() -> str:
    return (os.environ.get("DATALAYER_API_KEY") or "").strip()


def _http_to_ws(url: str) -> str:
    if url.startswith("https://"):
        return f"wss://{url[len('https://') :]}"
    if url.startswith("http://"):
        return f"ws://{url[len('http://') :]}"
    return f"ws://{url}"


def _build_tunnel_url() -> str:
    base_url = _runtimes_url()
    if not base_url:
        return ""
    token = _auth_token()
    if not token:
        return ""
    ws_base = _http_to_ws(base_url)
    return (
        f"{ws_base}/api/runtimes/v1/agent-nodes/tunnel/ws"
        f"?node_id={_node_id()}&token={token}"
    )


async def _handle_message(websocket: Any, message: str) -> None:
    try:
        payload = json.loads(message)
    except Exception:
        return

    request_id = payload.get("request_id")
    envelope = payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    type_value = str(envelope.get("type") or payload.get("type") or "ui_message")

    # Acknowledge every tunneled message so the reverse path is exercised.
    await websocket.send(
        json.dumps(
            {
                "type": "ack",
                "request_id": request_id,
                "payload": {"accepted": True},
            }
        )
    )

    # Run tunneled chat requests against the local agent runtime.
    if type_value == "chat.request":
        chat_payload = (
            envelope.get("payload") if isinstance(envelope.get("payload"), dict) else envelope
        )
        try:
            result_payload = await _run_local_chat_request(chat_payload)
            await websocket.send(
                json.dumps(
                    {
                        "type": "chat.response",
                        "request_id": request_id,
                        "payload": result_payload,
                    }
                )
            )
        except Exception as exc:
            await websocket.send(
                json.dumps(
                    {
                        "type": "chat.error",
                        "request_id": request_id,
                        "payload": {
                            "error": str(exc),
                            "source": "agent-node-tunnel",
                        },
                    }
                )
            )


def _extract_prompt(chat_payload: dict[str, Any]) -> str:
    direct = (
        chat_payload.get("text")
        or chat_payload.get("prompt")
        or chat_payload.get("message")
    )
    if isinstance(direct, str) and direct.strip():
        return direct.strip()

    messages = chat_payload.get("messages")
    if isinstance(messages, list):
        for msg in reversed(messages):
            if not isinstance(msg, dict):
                continue
            role = str(msg.get("role") or "")
            if role and role != "user":
                continue
            content = msg.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
            if isinstance(content, list):
                chunks: list[str] = []
                for chunk in content:
                    if not isinstance(chunk, dict):
                        continue
                    text = chunk.get("text")
                    if isinstance(text, str) and text.strip():
                        chunks.append(text.strip())
                if chunks:
                    return "\n".join(chunks)
    return ""


async def _run_local_chat_request(chat_payload: dict[str, Any]) -> dict[str, Any]:
    from .adapters.base import AgentContext
    from .routes.acp import _agents

    prompt = _extract_prompt(chat_payload)
    if not prompt:
        raise ValueError("Missing prompt text in tunneled chat request")

    requested_agent_id = str(chat_payload.get("agent_id") or "").strip()
    default_agent_id = (os.environ.get("AGENT_NODE_AGENT_ID") or "default").strip()
    agent_id = requested_agent_id or default_agent_id

    adapter_entry = _agents.get(agent_id)
    if adapter_entry is None and default_agent_id:
        adapter_entry = _agents.get(default_agent_id)
        if adapter_entry is not None:
            agent_id = default_agent_id
    if adapter_entry is None and _agents:
        agent_id, adapter_entry = next(iter(_agents.items()))
    if adapter_entry is None:
        raise ValueError("No local agents are registered for tunnel execution")

    adapter, _ = adapter_entry
    context = AgentContext(
        session_id=str(uuid.uuid4()),
        user_id=str(chat_payload.get("requester_uid") or "tunnel-user"),
        conversation_history=(
            chat_payload.get("messages")
            if isinstance(chat_payload.get("messages"), list)
            else []
        ),
        metadata={"source": "agent-node-tunnel", "agent_id": agent_id},
    )
    response = await adapter.run(prompt, context)
    return {
        "text": response.content,
        "usage": response.usage,
        "metadata": {"agent_id": agent_id, **response.metadata},
        "source": "agent-node-tunnel",
    }


async def run_agent_node_tunnel(stop_event: asyncio.Event) -> None:
    """Maintain websocket tunnel connection to runtimes until stop_event is set."""
    tunnel_url = _build_tunnel_url()
    if not tunnel_url:
        logger.warning("Agent node tunnel disabled: missing runtimes URL or API token")
        await stop_event.wait()
        return

    try:
        from websockets.asyncio.client import connect as ws_connect
    except Exception:
        logger.warning("Agent node tunnel disabled: websockets package not available")
        await stop_event.wait()
        return

    try:
        from .routes.agent_node import get_agent_node_configuration
    except Exception:  # noqa: BLE001
        get_agent_node_configuration = None  # type: ignore[assignment]

    reconnect_seconds = int(os.environ.get("AGENT_NODE_TUNNEL_RECONNECT_SECONDS", "5"))

    while not stop_event.is_set():
        if get_agent_node_configuration is not None:
            try:
                if not get_agent_node_configuration().billable_account_uid:
                    try:
                        await asyncio.wait_for(stop_event.wait(), timeout=reconnect_seconds)
                    except asyncio.TimeoutError:
                        continue
                    break
            except Exception:  # noqa: BLE001
                pass
        try:
            async with ws_connect(tunnel_url, open_timeout=15.0, close_timeout=5.0) as websocket:
                logger.info("Agent node tunnel connected")
                while not stop_event.is_set():
                    try:
                        incoming = await asyncio.wait_for(websocket.recv(), timeout=20.0)
                        if isinstance(incoming, str):
                            await _handle_message(websocket, incoming)
                    except asyncio.TimeoutError:
                        await websocket.send(
                            json.dumps(
                                {
                                    "type": "heartbeat",
                                    "payload": {
                                        "node_id": _node_id(),
                                        "status": "connected",
                                    },
                                }
                            )
                        )
        except Exception as exc:
            logger.warning("Agent node tunnel connection failed: %s", exc)
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=reconnect_seconds)
            except asyncio.TimeoutError:
                continue
