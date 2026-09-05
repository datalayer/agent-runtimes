# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Persistent Agent Node tunnel client for Datalayer Runtimes."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import socket
import uuid
from typing import Any
from urllib.parse import urlencode

from .agent_node_auth import resolve_auth_token, resolve_runtimes_url, token_source

logger = logging.getLogger(__name__)


def _node_id() -> str:
    """Resolve node identifier from env, persisted config, or hostname hash."""
    configured = (os.environ.get("AGENT_NODE_ID") or "").strip()
    if configured:
        return configured
    try:
        from ..routes.agent_node import get_agent_node_configuration

        persisted = (get_agent_node_configuration().node_uid or "").strip()
        if persisted:
            return persisted
    except Exception:
        # Best-effort lookup; fallback keeps local-only/dev scenarios working.
        pass
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, socket.gethostname()))


def _runtimes_url() -> str:
    """Resolve runtimes base URL from env or runtime credentials."""
    return resolve_runtimes_url()


def _auth_token() -> str:
    """The token the *sync loop* registered with — the same one, by construction.

    The service admits a tunnel only for the user who registered the node, so
    this must resolve exactly as registration did. See ``agent_node_auth``.
    """
    return resolve_auth_token()


def _local_base_url() -> str:
    """Where this node answers HTTP, for calling its own AG-UI mount.

    Set by ``serve`` when it starts the server in node mode; the host the
    server binds to may be ``0.0.0.0``, so it is always given as loopback.
    """
    return (os.environ.get("AGENT_NODE_LOCAL_URL") or "").strip().rstrip("/")


def _agui_agent_id(requested: str) -> str:
    """The agent a tunneled run is for: the service's choice, then the node's."""
    if requested:
        return requested
    try:
        from ..routes.agent_node import get_agent_node_configuration

        configured = (get_agent_node_configuration().active_agent_id or "").strip()
        if configured:
            return configured
    except Exception:  # noqa: BLE001
        pass
    try:
        from ..routes.acp import _agents

        for agent_id in _agents:
            return str(agent_id)
    except Exception:  # noqa: BLE001
        pass
    return "default"


async def _relay_agui_request(send: Any, request_id: str, data: dict[str, Any]) -> None:
    """Run a tunneled AG-UI request against this node's own AG-UI endpoint.

    The service forwards the browser's run input untouched; this posts it to
    the local mount — the same one a directly-connected browser would call —
    and relays the SSE response back frame by frame: ``agui.start`` with the
    status, ``agui.chunk`` per piece of the body, ``agui.end`` when it closes,
    ``agui.error`` if anything fails. Nothing is interpreted on the way: the
    agent's own events, tool calls included, reach the browser as emitted.
    """

    async def fail(error: str) -> None:
        await send(
            {
                "type": "agui.error",
                "request_id": request_id,
                "payload": {"error": error, "source": "agent-node-tunnel"},
            }
        )

    try:
        import httpx
    except Exception as exc:  # noqa: BLE001
        await fail(f"httpx unavailable: {exc}")
        return

    base_url = _local_base_url()
    if not base_url:
        await fail("Agent node local URL is not configured (AGENT_NODE_LOCAL_URL)")
        return
    agent_id = _agui_agent_id(str(data.get("agent_id") or "").strip())
    body = data.get("body") if isinstance(data.get("body"), dict) else {}
    # Trailing slash: the mount is a Starlette sub-application and redirects
    # without it, and a redirect is one more round trip per message.
    url = f"{base_url}/api/v1/ag-ui/{agent_id}/"
    headers = {"Accept": "text/event-stream", "Content-Type": "application/json"}
    token = resolve_auth_token()
    if token:
        headers["Authorization"] = f"Bearer {token}"

    try:
        # No read timeout: an agent run lasts as long as the model and its
        # tools take, and the service enforces the idle limit it wants.
        timeout = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST", url, json=body, headers=headers
            ) as response:
                detail = ""
                if response.status_code >= 400:
                    raw = await response.aread()
                    detail = raw.decode("utf-8", errors="replace")[:500]
                await send(
                    {
                        "type": "agui.start",
                        "request_id": request_id,
                        "payload": {
                            "status": response.status_code,
                            "content_type": response.headers.get("content-type", ""),
                            "detail": detail,
                        },
                    }
                )
                if response.status_code >= 400:
                    return
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    await send(
                        {
                            "type": "agui.chunk",
                            "request_id": request_id,
                            # Base64: a chunk may end mid-character, and the
                            # frame is JSON text.
                            "payload": {
                                "data_b64": base64.b64encode(chunk).decode("ascii")
                            },
                        }
                    )
        await send({"type": "agui.end", "request_id": request_id, "payload": {}})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Agent node AG-UI relay failed: %s", exc)
        await fail(f"Local AG-UI request failed: {exc}")


def _http_to_ws(url: str) -> str:
    """Convert HTTP(S) base URLs to WS(S) URLs."""
    if url.startswith("https://"):
        return f"wss://{url[len('https://') :]}"
    if url.startswith("http://"):
        return f"ws://{url[len('http://') :]}"
    return f"ws://{url}"


def _build_tunnel_url() -> str:
    """Build the authenticated websocket tunnel URL when credentials exist."""
    base_url = _runtimes_url()
    if not base_url:
        return ""
    token = _auth_token()
    if not token:
        return ""
    ws_base = _http_to_ws(base_url)
    query = urlencode({"node_id": _node_id(), "token": token})
    return f"{ws_base}/api/runtimes/v1/agent-nodes/tunnel/ws?{query}"


def _apply_sharing(sharing: Any) -> bool:
    """Persist the sharing the owner set from the SaaS.

    The sharing lives here, in the node's configuration, and goes back up with
    every heartbeat. The service applies the owner's change to its own record
    at once and hands it down this frame; without persisting it here, the
    next heartbeat would carry the old sharing and undo the change.
    """
    if not isinstance(sharing, dict):
        return False
    try:
        from ..routes.agent_node import (
            get_agent_node_configuration,
            set_agent_node_configuration,
        )

        current = get_agent_node_configuration()
        set_agent_node_configuration(current.model_copy(update={"sharing": sharing}))
        return True
    except Exception as exc:  # noqa: BLE001 - report, keep the tunnel up
        logger.warning("Agent node tunnel could not apply sharing: %s", exc)
        return False


async def _handle_message(
    websocket: Any, message: str, proxy: Any | None = None
) -> None:
    """Handle one inbound tunnel message and emit ack/response events."""
    try:
        payload = json.loads(message)
    except Exception:
        return

    request_id = payload.get("request_id")
    envelope = (
        payload.get("payload") if isinstance(payload.get("payload"), dict) else payload
    )
    type_value = str(envelope.get("type") or payload.get("type") or "ui_message")

    # Proxy frames — Jupyter and AG-UI — are high-volume and self-correlated;
    # they must not be acked (that would double tunnel traffic and pollute the
    # reverse buffer).
    if type_value in ("http.request", "agui.request", "ws.open", "ws.send", "ws.close"):
        if proxy is None:
            return
        channel_id = envelope.get("channel_id") or payload.get("channel_id")
        inner = (
            envelope.get("payload") if isinstance(envelope.get("payload"), dict) else {}
        )
        if type_value == "http.request":
            asyncio.create_task(proxy.handle_http_request(request_id, inner))
        elif type_value == "agui.request":
            asyncio.create_task(_relay_agui_request(proxy.send, request_id, inner))
        elif type_value == "ws.open":
            asyncio.create_task(proxy.handle_ws_open(channel_id, inner))
        elif type_value == "ws.send":
            asyncio.create_task(proxy.handle_ws_send(channel_id, inner))
        else:
            asyncio.create_task(proxy.handle_ws_close(channel_id))
        return

    if type_value == "configuration.sharing":
        inner = (
            envelope.get("payload") if isinstance(envelope.get("payload"), dict) else {}
        )
        accepted = _apply_sharing(inner.get("sharing"))
        await websocket.send(
            json.dumps(
                {
                    "type": "ack",
                    "request_id": request_id,
                    "payload": {"accepted": accepted},
                }
            )
        )
        return

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


async def run_agent_node_tunnel(stop_event: asyncio.Event) -> None:
    """Maintain websocket tunnel connection to runtimes until stop_event is set."""
    try:
        from websockets.asyncio.client import connect as ws_connect
    except Exception:
        logger.warning("Agent node tunnel disabled: websockets package not available")
        await stop_event.wait()
        return

    try:
        from ..routes.agent_node import get_agent_node_configuration
    except Exception:  # noqa: BLE001
        get_agent_node_configuration = None  # type: ignore[assignment]

    reconnect_seconds = int(os.environ.get("AGENT_NODE_TUNNEL_RECONNECT_SECONDS", "5"))
    missing_credentials_logged = False

    while not stop_event.is_set():
        tunnel_url = _build_tunnel_url()
        if not tunnel_url:
            if not missing_credentials_logged:
                logger.warning(
                    "Agent node tunnel waiting for credentials: missing runtimes URL or API token"
                )
                missing_credentials_logged = True
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=reconnect_seconds)
            except asyncio.TimeoutError:
                continue
            break
        missing_credentials_logged = False

        if get_agent_node_configuration is not None:
            try:
                if not get_agent_node_configuration().billing_entity_uid:
                    try:
                        await asyncio.wait_for(
                            stop_event.wait(), timeout=reconnect_seconds
                        )
                    except asyncio.TimeoutError:
                        continue
                    break
            except Exception:  # noqa: BLE001
                pass
        try:
            async with ws_connect(
                tunnel_url, open_timeout=15.0, close_timeout=5.0
            ) as websocket:
                logger.info("Agent node tunnel connected")
                from .agent_node_kernel_proxy import (
                    NodeKernelProxy,
                    build_send_frame,
                )

                proxy = NodeKernelProxy(build_send_frame(websocket))
                try:
                    while not stop_event.is_set():
                        try:
                            incoming = await asyncio.wait_for(
                                websocket.recv(), timeout=20.0
                            )
                            if isinstance(incoming, str):
                                await _handle_message(websocket, incoming, proxy)
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
                finally:
                    await proxy.aclose()
        except Exception as exc:
            logger.warning("Agent node tunnel connection failed: %s", exc)
            if "403" in str(exc):
                # The service closes the socket before accepting it for every
                # refusal — bad token, no owner, not our node — and the client
                # sees all of them as 403. Name what we sent, which is the one
                # thing on this side that can be wrong.
                logger.warning(
                    "Agent node tunnel received HTTP 403 (node_id=%s, token source: %s)."
                    " The service admits the tunnel only for the user who registered the"
                    " node; if you just signed in/out, it will retry with refreshed credentials.",
                    _node_id(),
                    token_source(),
                )
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=reconnect_seconds)
            except asyncio.TimeoutError:
                continue
