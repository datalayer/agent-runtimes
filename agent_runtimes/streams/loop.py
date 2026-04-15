# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""WebSocket pub/sub infrastructure and monitoring snapshot builder.

This module provides the generic streaming loop used by the agent-runtimes
WebSocket endpoints.  It was extracted from routes/tool_approvals.py so that
the common logic (subscriber management, snapshot assembly, stream loop) is
decoupled from the tool-approval CRUD routes.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Awaitable, Callable

import httpx
from fastapi import WebSocket, WebSocketDisconnect

from agent_runtimes.context.costs import get_cost_store
from agent_runtimes.observability.prompt_turn_metrics import extract_jwt_token
from agent_runtimes.streams.messages import (
    AgentMonitoringSnapshotPayload,
    AgentStreamMessage,
)

logger = logging.getLogger(__name__)


# ─── Pub/Sub ──────────────────────────────────────────────────────────

_STREAM_SUBSCRIBERS: dict[str, set[asyncio.Queue[AgentStreamMessage]]] = {}


def _stream_key(agent_id: str | None) -> str:
    return agent_id or "__global__"


def subscribe_stream(agent_id: str | None) -> asyncio.Queue[AgentStreamMessage]:
    """Register a subscriber queue for *agent_id* (or global)."""
    key = _stream_key(agent_id)
    queue: asyncio.Queue[AgentStreamMessage] = asyncio.Queue(maxsize=32)
    _STREAM_SUBSCRIBERS.setdefault(key, set()).add(queue)
    return queue


def unsubscribe_stream(
    agent_id: str | None, queue: asyncio.Queue[AgentStreamMessage]
) -> None:
    """Remove a previously registered subscriber queue."""
    key = _stream_key(agent_id)
    subscribers = _STREAM_SUBSCRIBERS.get(key)
    if not subscribers:
        return
    subscribers.discard(queue)
    if not subscribers:
        _STREAM_SUBSCRIBERS.pop(key, None)


def enqueue_stream_message(agent_id: str | None, message: AgentStreamMessage) -> None:
    """Push *message* to every queue subscribed to *agent_id*."""
    keys = [_stream_key(agent_id)]
    if keys[0] != "__global__":
        keys.append("__global__")
    total_sent = 0
    for key in keys:
        subscribers = _STREAM_SUBSCRIBERS.get(key)
        if not subscribers:
            continue
        for queue in list(subscribers):
            if queue.full():
                continue
            queue.put_nowait(message)
            total_sent += 1
    logger.debug(
        "[ws:emit] type=%s agent_id=%s subscribers=%d",
        message.type,
        agent_id,
        total_sent,
    )


# ─── Snapshot builders ────────────────────────────────────────────────


def build_context_snapshot(agent_id: str) -> dict[str, Any] | None:
    """Build the lightweight context snapshot dict for *agent_id*."""
    from agent_runtimes.context.session import get_agent_context_snapshot

    snapshot = get_agent_context_snapshot(agent_id)
    if snapshot is None:
        return None
    data = snapshot.to_dict()
    data["costUsage"] = get_cost_store().get_agent_usage_dict(agent_id)
    return data


def build_full_context(agent_id: str) -> dict[str, Any] | None:
    """Build the full context snapshot (tools, messages, model config)."""
    try:
        from agent_runtimes.context.session import get_agent_full_context_snapshot

        snapshot = get_agent_full_context_snapshot(agent_id)
        if snapshot is None:
            return None
        return snapshot.to_dict()
    except Exception:
        return None


def build_mcp_status() -> dict[str, Any] | None:
    """Build MCP toolsets status dict."""
    try:
        from agent_runtimes.mcp import get_config_mcp_toolsets_status

        return get_config_mcp_toolsets_status()
    except Exception:
        return None


def build_codemode_status() -> dict[str, Any] | None:
    """Build codemode status dict (sync — safe to call from async context).

    Uses the server-side SkillsArea for per-skill status instead of the
    legacy list-based approach.  Each skill in the ``skills`` list carries
    a ``status`` field (``available`` | ``enabled`` | ``loaded``).
    """
    from agent_runtimes.routes.configure import (
        _codemode_state,
        _get_sandbox_status,
    )

    try:
        from agent_runtimes.routes.agui import get_all_agui_adapters
        from agent_runtimes.services.skills_area import get_skills_area

        skills_area = get_skills_area()
        _ensure_skills_area_seeded(skills_area)

        adapters = get_all_agui_adapters()
        codemode_enabled = _codemode_state["enabled"]

        if adapters:
            for _agent_id, agui_transport in adapters.items():
                try:
                    agent_adapter = agui_transport.agent
                    if hasattr(agent_adapter, "codemode_enabled"):
                        codemode_enabled = agent_adapter.codemode_enabled
                        break
                except Exception:
                    pass

        sandbox_status = _get_sandbox_status()

        return {
            "enabled": codemode_enabled,
            "skills": skills_area.to_snapshot_list(),
            "available_skills": skills_area.to_snapshot_list(),
            "sandbox": sandbox_status.model_dump() if sandbox_status else None,
        }
    except Exception:
        return None


def _ensure_skills_area_seeded(skills_area: Any) -> None:
    """Seed SkillsArea from configured catalog when currently empty."""
    if skills_area.list_skills():
        return
    try:
        from agent_runtimes.routes.configure import _get_available_skills

        skills_area.seed_available(_get_available_skills())
    except Exception as exc:
        logger.debug("[skills:seed] failed to seed SkillsArea: %s", exc)


# ─── Monitoring payload assembly ──────────────────────────────────────


async def build_monitoring_snapshot_payload(
    agent_id: str | None,
    *,
    list_approvals: Any | None = None,
) -> AgentMonitoringSnapshotPayload:
    """Assemble a full monitoring snapshot for *agent_id*.

    Parameters
    ----------
    list_approvals : callable, optional
        An async callable ``(agent_id, status) -> list[Record]`` that returns
        the current pending tool approvals.  When ``None`` the approval fields
        are left empty (useful when the caller does not have access to the
        approval store).
    """
    approvals: list[dict[str, Any]] = []
    if list_approvals is not None:
        records = await list_approvals(agent_id=agent_id, status="pending")
        approvals = [a.model_dump() for a in records]

    context_snapshot: dict[str, Any] | None = None
    cost_usage: dict[str, Any] | None = None
    full_context: dict[str, Any] | None = None
    if agent_id:
        context_snapshot = build_context_snapshot(agent_id)
        cost_usage = get_cost_store().get_agent_usage_dict(agent_id)
        full_context = build_full_context(agent_id)

    mcp_status = build_mcp_status()
    codemode_status = build_codemode_status()

    return AgentMonitoringSnapshotPayload(
        agentId=agent_id,
        approvals=approvals,
        pendingApprovalCount=len(approvals),
        contextSnapshot=context_snapshot,
        costUsage=cost_usage,
        mcpStatus=mcp_status,
        codemodeStatus=codemode_status,
        fullContext=full_context,
    )


async def publish_stream_event(
    *,
    event_type: str,
    payload: dict[str, Any],
    agent_id: str | None,
    list_approvals: Any | None = None,
) -> None:
    """Publish a stream event and follow it with a fresh snapshot."""
    message = AgentStreamMessage.create(
        type=event_type,
        payload=payload,
        agent_id=agent_id,
    )
    enqueue_stream_message(agent_id, message)

    snapshot_payload = (
        await build_monitoring_snapshot_payload(agent_id, list_approvals=list_approvals)
    ).model_dump(by_alias=True)
    snapshot = AgentStreamMessage.create(
        type="agent.snapshot",
        payload=snapshot_payload,
        agent_id=agent_id,
    )
    enqueue_stream_message(agent_id, snapshot)


# ─── OTEL flush helper ────────────────────────────────────────────────


async def _flush_otel_service(auth_token: str | None = None) -> None:
    """Ask the OTEL service to flush its buffers so WS subscribers get fresh data."""
    run_url = (
        os.environ.get("DATALAYER_RUN_URL")
        or os.environ.get("DATALAYER_OTEL_RUN_URL")
        or "https://prod1.datalayer.run"
    )
    flush_url = f"{run_url.rstrip('/')}/api/otel/v1/flush"
    token = (
        auth_token
        or os.environ.get("DATALAYER_TOKEN")
        or os.environ.get("DATALAYER_API_KEY")
    )
    try:
        headers: dict[str, str] = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                flush_url,
                headers=headers,
            )
            logger.debug("[otel:flush] status=%d url=%s", resp.status_code, flush_url)
            if not resp.is_success:
                logger.warning(
                    "[otel:flush] failed status=%d url=%s body=%s",
                    resp.status_code,
                    flush_url,
                    (resp.text or "")[:300],
                )
    except Exception as exc:
        logger.debug("[otel:flush] failed: %s", exc)


# ─── Skill enable/disable via WebSocket ───────────────────────────────


async def _handle_skill_enable(
    skill_id: str,
    agent_id: str | None,
    websocket: Any,
    list_approvals: Any | None,
) -> None:
    """Handle a skill_enable WS message.

    Enables the skill. Loading happens lazily when building the prompt,
    so the UI can reflect the intermediate ``enabled`` state.
    """
    from agent_runtimes.services.skills_area import get_skills_area

    skills_area = get_skills_area()
    _ensure_skills_area_seeded(skills_area)
    skills_area.enable_skill(skill_id)
    logger.info("[ws:skill_enable] skill_id=%s agent_id=%s", skill_id, agent_id)
    # Push an immediate snapshot so the frontend sees the change
    await _push_fresh_snapshot(agent_id, websocket, list_approvals)


async def _handle_skill_disable(
    skill_id: str,
    agent_id: str | None,
    websocket: Any,
    list_approvals: Any | None,
) -> None:
    """Handle a skill_disable WS message."""
    from agent_runtimes.services.skills_area import get_skills_area

    skills_area = get_skills_area()
    _ensure_skills_area_seeded(skills_area)
    skills_area.disable_skill(skill_id)
    logger.info("[ws:skill_disable] skill_id=%s agent_id=%s", skill_id, agent_id)
    await _push_fresh_snapshot(agent_id, websocket, list_approvals)


async def _push_fresh_snapshot(
    agent_id: str | None,
    websocket: Any,
    list_approvals: Any | None,
) -> None:
    """Build and send a fresh snapshot over the websocket."""
    fresh = (
        await build_monitoring_snapshot_payload(agent_id, list_approvals=list_approvals)
    ).model_dump(by_alias=True)
    snap_msg = AgentStreamMessage.create(
        type="agent.snapshot",
        payload=fresh,
        agent_id=agent_id,
    ).model_dump(by_alias=True)
    await websocket.send_json(snap_msg)
    logger.debug("[ws:send] type=agent.snapshot (skill-update) agent_id=%s", agent_id)


# ─── WebSocket stream loop ───────────────────────────────────────────


async def stream_loop(
    websocket: WebSocket,
    agent_id: str | None,
    *,
    list_approvals: Any | None = None,
    decide_approval: Callable[[str, bool, str | None], Awaitable[Any]] | None = None,
) -> None:
    """Run the main WebSocket stream loop.

    Accepts the connection, streams an initial snapshot, then pushes
    periodic diffs and reactive messages until the client disconnects.
    """
    await websocket.accept()
    logger.info("[ws:connect] agent_id=%s", agent_id)
    websocket_user_jwt_token = extract_jwt_token(
        websocket.headers.get("authorization"),
        websocket.headers.get("x-external-token"),
        websocket.query_params.get("token"),
    )
    queue = subscribe_stream(agent_id)
    try:
        initial_payload = (
            await build_monitoring_snapshot_payload(
                agent_id, list_approvals=list_approvals
            )
        ).model_dump(by_alias=True)
        msg = AgentStreamMessage.create(
            type="agent.snapshot",
            payload=initial_payload,
            agent_id=agent_id,
        ).model_dump(by_alias=True)
        await websocket.send_json(msg)
        logger.debug("[ws:send] type=agent.snapshot (initial) agent_id=%s", agent_id)

        last_snapshot = initial_payload
        while True:
            recv_task = asyncio.create_task(websocket.receive_text())
            msg_task = asyncio.create_task(queue.get())
            try:
                done, pending = await asyncio.wait(
                    {recv_task, msg_task},
                    timeout=2.0,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()

                if not done:
                    next_snapshot = (
                        await build_monitoring_snapshot_payload(
                            agent_id, list_approvals=list_approvals
                        )
                    ).model_dump(by_alias=True)
                    if next_snapshot != last_snapshot:
                        last_snapshot = next_snapshot
                        msg = AgentStreamMessage.create(
                            type="agent.snapshot",
                            payload=next_snapshot,
                            agent_id=agent_id,
                        ).model_dump(by_alias=True)
                        await websocket.send_json(msg)
                        logger.debug(
                            "[ws:send] type=agent.snapshot (periodic) agent_id=%s",
                            agent_id,
                        )
                    continue

                if recv_task in done:
                    raw_text = recv_task.result()
                    logger.debug(
                        "[ws:recv] agent_id=%s raw=%s", agent_id, raw_text[:200]
                    )
                    try:
                        payload = json.loads(raw_text)
                        if isinstance(payload, dict):
                            msg_type = payload.get("type")

                            if (
                                msg_type == "tool_approval_decision"
                                and decide_approval is not None
                            ):
                                approval_id = payload.get("approvalId")
                                approved = payload.get("approved")
                                note = payload.get("note")
                                if isinstance(approval_id, str) and isinstance(
                                    approved, bool
                                ):
                                    await decide_approval(
                                        approval_id,
                                        approved,
                                        note if isinstance(note, str) else None,
                                    )

                            elif msg_type == "request_snapshot":
                                fresh = (
                                    await build_monitoring_snapshot_payload(
                                        agent_id,
                                        list_approvals=list_approvals,
                                    )
                                ).model_dump(by_alias=True)
                                last_snapshot = fresh
                                snap_msg = AgentStreamMessage.create(
                                    type="agent.snapshot",
                                    payload=fresh,
                                    agent_id=agent_id,
                                ).model_dump(by_alias=True)
                                await websocket.send_json(snap_msg)
                                logger.debug(
                                    "[ws:send] type=agent.snapshot (requested) agent_id=%s",
                                    agent_id,
                                )

                            elif msg_type == "request_otel_flush":
                                await _flush_otel_service(websocket_user_jwt_token)

                            elif msg_type == "skill_enable":
                                skill_id = payload.get("skillId")
                                if isinstance(skill_id, str):
                                    await _handle_skill_enable(
                                        skill_id, agent_id, websocket, list_approvals
                                    )

                            elif msg_type == "skill_disable":
                                skill_id = payload.get("skillId")
                                if isinstance(skill_id, str):
                                    await _handle_skill_disable(
                                        skill_id, agent_id, websocket, list_approvals
                                    )

                    except Exception as exc:
                        logger.debug("[ws:recv] ignored client message error: %s", exc)

                if msg_task in done:
                    message = msg_task.result()
                    await websocket.send_json(message.model_dump(by_alias=True))
                    logger.debug(
                        "[ws:send] type=%s agent_id=%s", message.type, agent_id
                    )
            finally:
                if not recv_task.done():
                    recv_task.cancel()
                if not msg_task.done():
                    msg_task.cancel()
    except WebSocketDisconnect:
        logger.info("[ws:disconnect] agent_id=%s", agent_id)
        return
    finally:
        unsubscribe_stream(agent_id, queue)
