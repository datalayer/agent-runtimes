# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Persistent listener for the datalayer-ai-agents tool-approvals WebSocket.

Whenever agent-runtimes has at least one in-flight approval forwarded to
ai-agents, we maintain a long-lived WS subscription (one per unique JWT
credential) that mirrors every ``tool_approval_*`` event into the local
store via :func:`update_local_approval_status`.

This guarantees that approvals/denials submitted by *any* participant —
including the SaaS UI (``datalayer.ai/agents/tool-approvals``) or other
runtimes — unblock the local waiter and update the local record, even
when the per-approval bridge in ``ToolApprovalManager`` is not active.

Lifecycle:
* :func:`ensure_listener` is invoked by ``register_approval_credentials``
  whenever a new approval is created with a JWT.
* A reference count per JWT tracks how many approvals are currently
  keeping the listener alive.
* :func:`release_listener` is invoked by ``remove_approval_credentials``
  once an approval is decided. When the refcount reaches zero the WS
  task is cancelled.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import Any
from urllib.parse import urlencode

logger = logging.getLogger(__name__)

_LOCK = asyncio.Lock()
_TASKS: dict[str, asyncio.Task[None]] = {}
_REFCOUNTS: dict[str, int] = {}

# Reverse map: remote (ai-agents) approval id → local approval id.
# Populated by ``register_remote_approval_mapping``.
_REMOTE_TO_LOCAL: dict[str, str] = {}


def _jwt_fingerprint(jwt: str) -> str:
    """Return a stable, non-reversible key for indexing listener state."""
    return hashlib.sha256(jwt.encode("utf-8")).hexdigest()


def register_remote_to_local(remote_id: str, local_id: str) -> None:
    if remote_id and local_id:
        _REMOTE_TO_LOCAL[remote_id] = local_id


def unregister_remote_to_local(remote_id: str) -> None:
    _REMOTE_TO_LOCAL.pop(remote_id, None)


def _resolve_ws_url(ai_agents_url: str, jwt: str) -> str:
    ws_base = ai_agents_url.rstrip("/")
    for suffix in ("/api/ai-agents/v1", "/api/ai-agents"):
        if ws_base.endswith(suffix):
            ws_base = ws_base[: -len(suffix)]
            break
    stripped = ws_base.replace("https://", "").replace("http://", "")
    scheme = "wss" if ai_agents_url.startswith("https") else "ws"
    query = urlencode({"token": jwt}) if jwt else ""
    sep = "?" if query else ""
    return f"{scheme}://{stripped}/api/ai-agents/v1/ws{sep}{query}"


async def _handle_record(record: dict[str, Any]) -> None:
    """Apply a ``tool_approval_*`` record from ai-agents to the local store."""
    # Lazy import to avoid circular dependency.
    from agent_runtimes.routes.tool_approvals import (
        _APPROVALS,
        _APPROVALS_LOCK,
        update_local_approval_status,
    )

    raw_status = record.get("status")
    status = str(raw_status or "").lower()
    # Normalise ``approved_with_changes`` to ``approved`` for local mirroring
    # — the local store only distinguishes approved/rejected.
    if status == "approved_with_changes":
        status = "approved"
    if status not in {"approved", "rejected"}:
        return

    note = record.get("note")
    note_value = note if isinstance(note, str) else None

    remote_id = record.get("id") if isinstance(record.get("id"), str) else None
    tool_call_id = record.get("tool_call_id") or record.get("toolCallId")
    if not isinstance(tool_call_id, str):
        tool_call_id = None

    # 1. Direct reverse lookup by remote id.
    local_id: str | None = None
    if remote_id and remote_id in _REMOTE_TO_LOCAL:
        local_id = _REMOTE_TO_LOCAL.get(remote_id)

    # 2. Match by tool_call_id on a local pending record.
    if local_id is None and tool_call_id:
        async with _APPROVALS_LOCK:
            for rec in _APPROVALS.values():
                if rec.status == "pending" and rec.tool_call_id == tool_call_id:
                    local_id = rec.id
                    break

    # 3. Remote id may actually equal the local id (single-tier deployments).
    if local_id is None and remote_id:
        async with _APPROVALS_LOCK:
            if remote_id in _APPROVALS:
                local_id = remote_id

    if local_id is None:
        logger.debug(
            "[tool-approval:listener] Ignoring remote record (no local match) "
            "remote_id=%s tool_call_id=%s status=%s",
            remote_id,
            tool_call_id,
            status,
        )
        return

    logger.info(
        "[tool-approval:listener] Mirroring remote %s decision to local_id=%s "
        "(remote_id=%s, tool_call_id=%s)",
        status,
        local_id,
        remote_id,
        tool_call_id,
    )
    await update_local_approval_status(local_id, status=status, note=note_value)
    if remote_id:
        unregister_remote_to_local(remote_id)


async def _run_listener(jwt: str) -> None:
    """Long-lived task: keep a WS connection open and mirror decisions.

    Reconnects with exponential backoff on failure. Exits only when
    cancelled.
    """
    try:
        from datalayer_core.utils.urls import DatalayerURLs
        from websockets.asyncio.client import connect as ws_connect
    except Exception as exc:
        logger.warning(
            "[tool-approval:listener] websockets/datalayer_core unavailable; "
            "cannot start ai-agents listener: %s",
            exc,
        )
        return

    urls = DatalayerURLs.from_environment()
    ai_agents_url = getattr(urls, "ai_agents_url", None)
    if not ai_agents_url:
        logger.warning(
            "[tool-approval:listener] ai_agents_url not configured; listener "
            "will not start."
        )
        return

    ws_url = _resolve_ws_url(str(ai_agents_url), jwt)
    logger.info(
        "[tool-approval:listener] Starting persistent listener for ai-agents "
        "(ws_url=%s)",
        ws_url.split("?", 1)[0],  # hide token in log
    )

    backoff = 1.0
    max_backoff = 30.0
    while True:
        try:
            async with ws_connect(
                ws_url,
                additional_headers={"Authorization": f"Bearer {jwt}"},
                close_timeout=5.0,
                open_timeout=10.0,
                ping_interval=20.0,
                ping_timeout=20.0,
            ) as websocket:
                logger.info("[tool-approval:listener] Connected to ai-agents WS")
                backoff = 1.0

                # Prime with full history so decisions that arrived between
                # reconnects are still mirrored locally.
                await websocket.send(json.dumps({"type": "tool-approvals-history"}))

                while True:
                    raw = await websocket.recv()
                    if not isinstance(raw, str):
                        continue
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(msg, dict):
                        continue

                    msg_type = msg.get("type")
                    msg_event = msg.get("event")
                    records: list[dict[str, Any]] = []

                    if msg_type == "tool-approvals-history":
                        data = msg.get("data") or {}
                        approvals = data.get("approvals")
                        if isinstance(approvals, list):
                            records = [r for r in approvals if isinstance(r, dict)]
                    elif isinstance(msg_event, str) and msg_event.startswith(
                        "tool_approval_"
                    ):
                        data = msg.get("data") or msg.get("payload")
                        if isinstance(data, dict):
                            records = [data]

                    for record in records:
                        try:
                            await _handle_record(record)
                        except Exception as exc:
                            logger.warning(
                                "[tool-approval:listener] handler error: %s",
                                exc,
                                exc_info=True,
                            )
        except asyncio.CancelledError:
            logger.info("[tool-approval:listener] Listener cancelled")
            raise
        except Exception as exc:
            logger.warning(
                "[tool-approval:listener] WS connection error: %s — "
                "reconnecting in %.1fs",
                exc,
                backoff,
            )
            try:
                await asyncio.sleep(backoff)
            except asyncio.CancelledError:
                raise
            backoff = min(backoff * 2.0, max_backoff)


async def ensure_listener(jwt: str) -> None:
    """Increment refcount for *jwt* and start a listener task if absent."""
    if not jwt:
        return
    key = _jwt_fingerprint(jwt)
    async with _LOCK:
        _REFCOUNTS[key] = _REFCOUNTS.get(key, 0) + 1
        if key not in _TASKS or _TASKS[key].done():
            loop = asyncio.get_running_loop()
            _TASKS[key] = loop.create_task(_run_listener(jwt))
            logger.info(
                "[tool-approval:listener] Started persistent listener task "
                "(key=%s, refcount=%d)",
                key[:12],
                _REFCOUNTS[key],
            )


async def release_listener(jwt: str) -> None:
    """Decrement refcount; cancel the listener when no approvals remain."""
    if not jwt:
        return
    key = _jwt_fingerprint(jwt)
    async with _LOCK:
        count = _REFCOUNTS.get(key, 0) - 1
        if count > 0:
            _REFCOUNTS[key] = count
            return
        _REFCOUNTS.pop(key, None)
        task = _TASKS.pop(key, None)
    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
