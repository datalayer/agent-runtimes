# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Background synchronization with central Agent Node API."""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid

import httpx

from .routes.agent_node import get_agent_node_configuration

logger = logging.getLogger(__name__)


def _node_id() -> str:
    configured = (os.environ.get("AGENT_NODE_ID") or "").strip()
    if configured:
        return configured
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, socket.gethostname()))


def _node_name() -> str:
    return (os.environ.get("AGENT_NODE_NAME") or socket.gethostname()).strip()


def _runtimes_url() -> str:
    return (os.environ.get("DATALAYER_RUNTIMES_URL") or os.environ.get("DATALAYER_AGENT_RUNTIMES_URL") or "").strip().rstrip("/")


def _auth_headers() -> dict[str, str]:
    token = (os.environ.get("DATALAYER_API_KEY") or "").strip()
    headers: dict[str, str] = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _payload() -> dict:
    configuration = get_agent_node_configuration().model_dump()
    return {
        "node_id": _node_id(),
        "node_name": _node_name(),
        "node_version": os.environ.get("AGENT_RUNTIMES_VERSION", "dev"),
        "host": socket.gethostname(),
        "capabilities": ["chat", "agent-runtime"],
        "configuration": configuration,
    }


async def _post(client: httpx.AsyncClient, path: str, body: dict) -> None:
    response = await client.post(path, json=body)
    response.raise_for_status()


async def run_agent_node_sync(stop_event: asyncio.Event) -> None:
    """Register and heartbeat this node until stop_event is set."""
    base_url = _runtimes_url()
    if not base_url:
        logger.warning("Agent node sync disabled: missing DATALAYER_RUNTIMES_URL")
        await stop_event.wait()
        return

    headers = _auth_headers()
    if "Authorization" not in headers:
        logger.warning("Agent node sync disabled: missing DATALAYER_API_KEY")
        await stop_event.wait()
        return

    heartbeat_seconds = int(os.environ.get("AGENT_NODE_HEARTBEAT_SECONDS", "20"))
    timeout = httpx.Timeout(20.0)

    async with httpx.AsyncClient(base_url=f"{base_url}/api/runtimes/v1/agent-nodes", headers=headers, timeout=timeout) as client:
        while not stop_event.is_set():
            try:
                payload = _payload()
                await _post(client, "/register", payload)
                await _post(
                    client,
                    "/heartbeat",
                    {
                        "node_id": payload["node_id"],
                        "configuration": payload["configuration"],
                    },
                )
            except Exception as exc:
                logger.warning("Agent node sync failed: %s", exc)

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=heartbeat_seconds)
            except asyncio.TimeoutError:
                continue
