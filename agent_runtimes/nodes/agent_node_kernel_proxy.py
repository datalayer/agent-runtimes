# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
# BSD 3-Clause License

"""Forward tunneled Jupyter HTTP + WebSocket traffic to the node's Jupyter server.

The SaaS browser cannot reach the node's Jupyter server directly (it typically
lives on ``127.0.0.1`` inside the node's pod). Instead the runtimes service
multiplexes REST and kernel-channel traffic over the node's control tunnel; this
module is the node-side terminator that replays those frames against the local
Jupyter server and streams the answers back.

Message protocol (service -> node, unwrapped from the ``ui_message`` envelope):

* ``http.request``  ``{request_id, payload: {method, path, query, headers, body_b64}}``
* ``ws.open``       ``{channel_id, payload: {path, query, subprotocols}}``
* ``ws.send``       ``{channel_id, payload: {data, binary}}``
* ``ws.close``      ``{channel_id}``

Frames sent back (node -> service):

* ``http.response`` ``{request_id, payload: {status, headers, body_b64}}``
* ``ws.message``    ``{channel_id, payload: {data, binary}}``
* ``ws.close``      ``{channel_id, payload: {code, reason}}``
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

SendFrame = Callable[[Dict[str, Any]], Awaitable[None]]


def _local_jupyter_target() -> Optional[Tuple[str, str]]:
    """Return ``(base_url, token)`` for the node's Jupyter server, or ``None``.

    An explicit ``AGENT_NODE_JUPYTER_URL`` / ``AGENT_NODE_JUPYTER_TOKEN`` pair
    wins; otherwise the URL and token configured on the shared code-sandbox
    manager (the same Jupyter the agent executes against) are used.
    """
    env_url = (os.environ.get("AGENT_NODE_JUPYTER_URL") or "").strip().rstrip("/")
    if env_url:
        env_token = (os.environ.get("AGENT_NODE_JUPYTER_TOKEN") or "").strip()
        return env_url, env_token

    try:
        from ..services import get_code_sandbox_manager

        manager = get_code_sandbox_manager()
        config = getattr(manager, "_config", None)
        cfg_url = (getattr(config, "jupyter_url", "") or "").strip().rstrip("/")
        if cfg_url:
            cfg_token = (getattr(config, "jupyter_token", "") or "").strip()
            return cfg_url, cfg_token
    except Exception as exc:  # noqa: BLE001
        logger.debug("Unable to resolve local Jupyter target: %s", exc)
    return None


class NodeKernelProxy:
    """Terminates tunneled Jupyter HTTP/WebSocket traffic on the node.

    A single instance is bound to one tunnel connection. It owns the set of
    active WebSocket channels and cleans them up when the tunnel drops.
    """

    def __init__(self, send: SendFrame) -> None:
        self._send = send
        self._ws_clients: Dict[str, Any] = {}
        self._ws_tasks: Dict[str, asyncio.Task[None]] = {}
        # Browser frames for a channel, in order, from the moment the channel
        # is asked for. ``ws.open`` and the ``ws.send`` frames that follow it
        # arrive as separate tasks, and opening the local socket takes a
        # round trip; a send that ran before the open finished used to find
        # no client and drop the frame — and a kernel session begins with a
        # burst of exactly such frames, so every session lost its opening
        # messages. Queued here, they wait for the socket and go out in order.
        self._ws_outbox: Dict[str, asyncio.Queue[Optional[Dict[str, Any]]]] = {}
        self._ws_writers: Dict[str, asyncio.Task[None]] = {}

    @property
    def send(self) -> SendFrame:
        """The tunnel writer, for relays that live outside this class."""
        return self._send

    async def handle_http_request(self, request_id: str, data: Dict[str, Any]) -> None:
        """Forward one REST call to the local Jupyter server."""
        try:
            import httpx
        except Exception as exc:  # noqa: BLE001
            await self._http_error(request_id, 500, f"httpx unavailable: {exc}")
            return

        target = _local_jupyter_target()
        if target is None:
            await self._http_error(
                request_id, 503, "No local Jupyter server configured"
            )
            return
        base_url, token = target

        method = str(data.get("method") or "GET")
        path = str(data.get("path") or "").lstrip("/")
        query = str(data.get("query") or "")
        headers = {
            key: value
            for key, value in (data.get("headers") or {}).items()
            if key.lower()
            not in ("host", "authorization", "connection", "content-length")
        }
        if token:
            headers["Authorization"] = f"token {token}"
        body = base64.b64decode(data.get("body_b64") or "")

        url = f"{base_url}/{path}"
        if query:
            url = f"{url}?{query}"

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.request(
                    method, url, content=body or None, headers=headers
                )
            await self._send(
                {
                    "type": "http.response",
                    "request_id": request_id,
                    "payload": {
                        "status": response.status_code,
                        "headers": dict(response.headers),
                        "body_b64": base64.b64encode(response.content).decode("ascii"),
                    },
                }
            )
        except Exception as exc:  # noqa: BLE001
            await self._http_error(
                request_id, 502, f"Local Jupyter request failed: {exc}"
            )

    async def _http_error(self, request_id: str, status: int, message: str) -> None:
        await self._send(
            {
                "type": "http.response",
                "request_id": request_id,
                "payload": {
                    "status": status,
                    "headers": {"content-type": "text/plain"},
                    "body_b64": base64.b64encode(message.encode("utf-8")).decode(
                        "ascii"
                    ),
                },
            }
        )

    async def handle_ws_open(self, channel_id: str, data: Dict[str, Any]) -> None:
        """Open a WebSocket to the local Jupyter server for a channel."""
        if not channel_id:
            return
        # Before the first await: anything the browser sends from now on has
        # somewhere to wait.
        outbox = self._ws_outbox.setdefault(channel_id, asyncio.Queue())
        try:
            from websockets.asyncio.client import connect as ws_connect
        except Exception as exc:  # noqa: BLE001
            self._ws_outbox.pop(channel_id, None)
            await self._ws_close(channel_id, 1011, f"websockets unavailable: {exc}")
            return

        target = _local_jupyter_target()
        if target is None:
            self._ws_outbox.pop(channel_id, None)
            await self._ws_close(channel_id, 1011, "No local Jupyter server configured")
            return
        base_url, token = target

        ws_base = base_url
        if ws_base.startswith("https://"):
            ws_base = "wss://" + ws_base[len("https://") :]
        elif ws_base.startswith("http://"):
            ws_base = "ws://" + ws_base[len("http://") :]

        path = str(data.get("path") or "").lstrip("/")
        query = str(data.get("query") or "")
        if token:
            query = f"{query}&token={token}" if query else f"token={token}"
        url = f"{ws_base}/{path}"
        if query:
            url = f"{url}?{query}"

        subprotocols = data.get("subprotocols") or []
        try:
            client = await ws_connect(
                url,
                subprotocols=list(subprotocols) or None,
                open_timeout=15.0,
                max_size=None,
            )
        except Exception as exc:  # noqa: BLE001
            self._ws_outbox.pop(channel_id, None)
            await self._ws_close(
                channel_id, 1011, f"Local Jupyter WebSocket failed: {exc}"
            )
            return

        self._ws_clients[channel_id] = client
        self._ws_tasks[channel_id] = asyncio.create_task(self._pump(channel_id, client))
        self._ws_writers[channel_id] = asyncio.create_task(
            self._drain(channel_id, client, outbox)
        )

    async def _drain(
        self,
        channel_id: str,
        client: Any,
        outbox: "asyncio.Queue[Optional[Dict[str, Any]]]",
    ) -> None:
        """Send the browser's frames to the local socket, in the order they came."""
        try:
            while True:
                data = await outbox.get()
                if data is None:
                    return
                if data.get("binary"):
                    await client.send(base64.b64decode(data.get("data") or ""))
                else:
                    await client.send(data.get("data") or "")
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.debug("ws.send failed on channel %s: %s", channel_id, exc)

    async def _pump(self, channel_id: str, client: Any) -> None:
        """Relay messages from the local Jupyter socket back over the tunnel."""
        code, reason = 1000, "closed"
        try:
            async for message in client:
                if isinstance(message, (bytes, bytearray)):
                    payload = {
                        "data": base64.b64encode(bytes(message)).decode("ascii"),
                        "binary": True,
                    }
                else:
                    payload = {"data": message, "binary": False}
                await self._send(
                    {"type": "ws.message", "channel_id": channel_id, "payload": payload}
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            code, reason = 1011, str(exc)
        finally:
            self._ws_clients.pop(channel_id, None)
            self._ws_tasks.pop(channel_id, None)
            writer = self._ws_writers.pop(channel_id, None)
            self._ws_outbox.pop(channel_id, None)
            if writer is not None:
                writer.cancel()
            await self._ws_close(channel_id, code, reason)

    async def handle_ws_send(self, channel_id: str, data: Dict[str, Any]) -> None:
        """Forward one browser frame to the local Jupyter socket, in order."""
        outbox = self._ws_outbox.get(channel_id)
        if outbox is None:
            # No open was ever asked for on this channel (or it has closed).
            return
        outbox.put_nowait(data)

    async def handle_ws_close(self, channel_id: str) -> None:
        """Tear down a channel at the browser's request."""
        await self._close_channel(channel_id)

    async def _close_channel(self, channel_id: str) -> None:
        task = self._ws_tasks.pop(channel_id, None)
        client = self._ws_clients.pop(channel_id, None)
        writer = self._ws_writers.pop(channel_id, None)
        self._ws_outbox.pop(channel_id, None)
        if task is not None:
            task.cancel()
        if writer is not None:
            writer.cancel()
        if client is not None:
            try:
                await client.close()
            except Exception:  # noqa: BLE001
                pass

    async def _ws_close(self, channel_id: str, code: int, reason: str) -> None:
        try:
            await self._send(
                {
                    "type": "ws.close",
                    "channel_id": channel_id,
                    "payload": {"code": code, "reason": reason},
                }
            )
        except Exception:  # noqa: BLE001
            pass

    async def aclose(self) -> None:
        """Close every active channel (called when the tunnel drops)."""
        for channel_id in list(self._ws_clients.keys()):
            await self._close_channel(channel_id)


def build_send_frame(websocket: Any) -> SendFrame:
    """Build a coroutine that serializes and sends a frame over the tunnel."""

    async def _send(frame: Dict[str, Any]) -> None:
        await websocket.send(json.dumps(frame))

    return _send
