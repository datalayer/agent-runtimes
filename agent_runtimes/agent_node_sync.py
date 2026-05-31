# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Background synchronization with central Agent Node API."""

from __future__ import annotations

import asyncio
import logging
import os
import socket

import httpx

from .agent_node_health import collect_health
from .routes.agent_node import (
    get_agent_node_configuration,
    register_mode_change_callback,
    set_agent_node_uid,
)

logger = logging.getLogger(__name__)


def _explicit_node_id() -> str | None:
    """Return an operator-pinned node id (env override) if any.

    Normally the central datalayer-runtimes service assigns a ULID on first
    ``/register`` and we persist it locally. ``AGENT_NODE_ID`` is only an
    escape hatch for operators that need a stable, externally-managed id.
    """
    configured = (os.environ.get("AGENT_NODE_ID") or "").strip()
    return configured or None


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


def _current_node_id() -> str | None:
    """Resolve the node id from env override or persisted configuration."""
    explicit = _explicit_node_id()
    if explicit:
        return explicit
    return get_agent_node_configuration().node_uid


def _register_payload() -> dict:
    configuration = get_agent_node_configuration().model_dump()
    payload: dict = {
        "node_name": _node_name(),
        "node_version": os.environ.get("AGENT_RUNTIMES_VERSION", "dev"),
        "host": socket.gethostname(),
        "capabilities": ["chat", "agent-runtime"],
        "configuration": configuration,
    }
    node_id = _current_node_id()
    if node_id:
        payload["node_id"] = node_id
    return payload


async def _register(client: httpx.AsyncClient) -> str | None:
    """Register with the central service and return the assigned node id."""
    response = await client.post("/register", json=_register_payload())
    response.raise_for_status()
    try:
        body = response.json()
    except Exception:  # noqa: BLE001
        return None
    record = body.get("agent_node") if isinstance(body, dict) else None
    if isinstance(record, dict):
        assigned = record.get("node_id")
        if isinstance(assigned, str) and assigned and not _explicit_node_id():
            set_agent_node_uid(assigned)
        return assigned if isinstance(assigned, str) else None
    return None


async def _heartbeat(client: httpx.AsyncClient, node_id: str) -> None:
    body = {
        "node_id": node_id,
        "configuration": get_agent_node_configuration().model_dump(),
    }
    response = await client.post("/heartbeat", json=body)
    response.raise_for_status()


async def _post_health(
    client: httpx.AsyncClient, node_id: str, reason: str
) -> None:
    body = {
        "node_id": node_id,
        "health": collect_health(reason=reason),
    }
    response = await client.post("/health", json=body)
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
    health_seconds = int(os.environ.get("AGENT_NODE_HEALTH_SECONDS", "60"))
    timeout = httpx.Timeout(20.0)

    loop = asyncio.get_running_loop()
    mode_change_event = asyncio.Event()

    def _on_mode_change(_new_mode: str) -> None:
        loop.call_soon_threadsafe(mode_change_event.set)

    register_mode_change_callback(_on_mode_change)

    last_health_at = 0.0
    first_health_sent = False

    async with httpx.AsyncClient(
        base_url=f"{base_url}/api/runtimes/v1/agent-nodes",
        headers=headers,
        timeout=timeout,
    ) as client:
        while not stop_event.is_set():
            mode_change_triggered = mode_change_event.is_set()
            mode_change_event.clear()
            try:
                configuration = get_agent_node_configuration()
                is_authenticated = bool(configuration.billable_account_uid)
                if not is_authenticated:
                    logger.debug(
                        "Agent node not authenticated (no billable account); skipping register/heartbeat/health"
                    )
                else:
                    node_id = await _register(client)
                    if node_id:
                        await _heartbeat(client, node_id)
                        now = loop.time()
                        needs_health = (
                            mode_change_triggered
                            or not first_health_sent
                            or (now - last_health_at) >= health_seconds
                        )
                        if needs_health:
                            reason = (
                                "mode_change"
                                if mode_change_triggered
                                else ("startup" if not first_health_sent else "periodic")
                            )
                            await _post_health(client, node_id, reason)
                            last_health_at = now
                            first_health_sent = True
            except Exception as exc:
                logger.warning("Agent node sync failed: %s", exc)

            # Wake early on stop or mode change; otherwise tick at heartbeat cadence.
            wait_tasks = [
                asyncio.create_task(stop_event.wait()),
                asyncio.create_task(mode_change_event.wait()),
            ]
            try:
                done, pending = await asyncio.wait(
                    wait_tasks,
                    timeout=heartbeat_seconds,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
            except asyncio.CancelledError:
                for task in wait_tasks:
                    task.cancel()
                raise
