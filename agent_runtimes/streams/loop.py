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
from urllib.parse import urlencode

from fastapi import WebSocket, WebSocketDisconnect

from agent_runtimes.context.costs import get_cost_store
from agent_runtimes.otel.prompt_turn_metrics import extract_jwt_token
from agent_runtimes.streams.messages import (
    AgentMonitoringSnapshotPayload,
    AgentStreamMessage,
)

logger = logging.getLogger(__name__)


# ─── Pub/Sub ──────────────────────────────────────────────────────────

_STREAM_SUBSCRIBERS: dict[str, set[asyncio.Queue[AgentStreamMessage]]] = {}
_MCP_ENABLED_TOOLS_BY_AGENT: dict[str, dict[str, set[str]]] = {}
# Tracks approved tools per agent per server (allowlist; default = none approved).
_MCP_APPROVED_TOOLS_BY_AGENT: dict[str, dict[str, set[str]]] = {}
_SKILLS_BY_AGENT: dict[str, dict[str, dict[str, Any]]] = {}


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


def _build_default_mcp_enabled_tools_by_server() -> dict[str, list[str]]:
    """Build default enabled MCP tools per server from lifecycle state."""
    result: dict[str, list[str]] = {}
    try:
        from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

        manager = get_mcp_lifecycle_manager()
        for instance in manager.get_all_running_servers():
            enabled_tool_names = [
                t.name for t in instance.config.tools if getattr(t, "enabled", True)
            ]
            if not enabled_tool_names:
                enabled_tool_names = [t.name for t in instance.tools]
            result[instance.server_id] = sorted(set(enabled_tool_names))
    except Exception:
        return {}
    return result


def _get_agent_mcp_enabled_tools_by_server(
    agent_id: str | None,
) -> dict[str, list[str]]:
    """Get effective enabled MCP tools per server for an agent."""
    key = _stream_key(agent_id)
    defaults = _build_default_mcp_enabled_tools_by_server()
    overrides = _MCP_ENABLED_TOOLS_BY_AGENT.get(key, {})
    for server_id, tool_names in overrides.items():
        # An empty override means "no explicit user selection yet" — keep
        # lifecycle-derived defaults rather than wiping the server's tools.
        if not tool_names:
            continue
        defaults[server_id] = sorted(set(tool_names))
    return defaults


def get_agent_mcp_enabled_tools_by_server(
    agent_id: str | None,
) -> dict[str, list[str]]:
    """Public accessor for effective MCP enabled tools by server."""
    return _get_agent_mcp_enabled_tools_by_server(agent_id)


def _get_agent_mcp_approved_tools_by_server(
    agent_id: str | None,
) -> dict[str, list[str]]:
    """Get approved MCP tools per server for an agent.

    The universe of tools for each server is the set of currently *enabled*
    tools. By default none are approved until explicitly toggled.
    """
    key = _stream_key(agent_id)
    approved_by_server = _MCP_APPROVED_TOOLS_BY_AGENT.get(key, {})
    enabled_by_server = _get_agent_mcp_enabled_tools_by_server(agent_id)
    result: dict[str, list[str]] = {}
    for server_id, enabled_tool_names in enabled_by_server.items():
        approved = approved_by_server.get(server_id, set())
        result[server_id] = sorted(set(enabled_tool_names) & approved)
    return result


def get_agent_approved_mcp_tool_names(agent_id: str | None) -> set[str]:
    """Return the set of approved MCP tool names for an agent."""
    by_server = _get_agent_mcp_approved_tools_by_server(agent_id)
    names: set[str] = set()
    for tool_names in by_server.values():
        for tool_name in tool_names:
            if isinstance(tool_name, str) and tool_name.strip():
                names.add(tool_name.strip())
    return names


def get_agent_enabled_mcp_tool_names(agent_id: str | None) -> set[str]:
    """Return the set of enabled MCP tool names for an agent."""
    by_server = _get_agent_mcp_enabled_tools_by_server(agent_id)
    names: set[str] = set()
    for tool_names in by_server.values():
        for tool_name in tool_names:
            if isinstance(tool_name, str) and tool_name.strip():
                names.add(tool_name.strip())
    return names


def get_known_mcp_tool_names() -> set[str]:
    """Return all known MCP tool names currently discovered by lifecycle manager."""
    names: set[str] = set()
    try:
        from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

        manager = get_mcp_lifecycle_manager()
        for instance in manager.get_all_running_servers():
            for tool in instance.tools:
                tool_name = getattr(tool, "name", None)
                if isinstance(tool_name, str) and tool_name.strip():
                    names.add(tool_name.strip())
            for tool in getattr(instance.config, "tools", []):
                tool_name = getattr(tool, "name", None)
                if isinstance(tool_name, str) and tool_name.strip():
                    names.add(tool_name.strip())
    except Exception:
        return set()
    return names


def _normalize_skill_ref(skill_ref: str) -> str:
    """Normalize version-qualified skill references to base skill IDs."""
    if not isinstance(skill_ref, str):
        return ""
    base, _, ver = skill_ref.rpartition(":")
    if base and "." in ver:
        return base.strip()
    return skill_ref.strip()


def _build_unknown_skill_entry(skill_id: str) -> dict[str, Any]:
    """Build a skill entry when discovery did not provide metadata."""
    name = skill_id
    description = ""
    try:
        from agent_runtimes.specs.skills import get_skill_spec

        spec = get_skill_spec(skill_id)
        if spec is not None:
            name = str(spec.name or skill_id)
            description = str(spec.description or "")
    except Exception:
        pass

    return {
        "id": skill_id,
        "name": name,
        "description": description,
        "tags": [],
        "has_scripts": False,
        "has_resources": False,
        "status": "available",
        "approved": False,
        "skill_definition": None,
        "source_variant": "unknown",
        "module": None,
        "package": None,
        "method": None,
        "path": None,
    }


def _seed_agent_skills(agent_id: str | None) -> None:
    """Ensure a per-agent skills map exists and is seeded from discovery."""
    key = _stream_key(agent_id)
    if key in _SKILLS_BY_AGENT:
        return

    seeded: dict[str, dict[str, Any]] = {}
    try:
        from agent_runtimes.routes.configure import _get_available_skills

        for skill in _get_available_skills():
            skill_id = _normalize_skill_ref(
                str(skill.get("id") or skill.get("name") or "")
            )
            if not skill_id:
                continue
            seeded[skill_id] = {
                "id": skill_id,
                "name": str(skill.get("name") or skill_id),
                "description": str(skill.get("description") or ""),
                "tags": list(skill.get("tags") or []),
                "has_scripts": bool(skill.get("has_scripts", False)),
                "has_resources": bool(skill.get("has_resources", False)),
                "status": "available",
                "approved": False,
                "skill_definition": skill.get("skill_definition"),
                "source_variant": skill.get("source_variant"),
                "module": skill.get("module"),
                "package": skill.get("package"),
                "method": skill.get("method"),
                "path": str(skill["path"]) if skill.get("path") is not None else None,
            }
    except Exception as exc:
        logger.debug("[skills:seed] failed for agent %s: %s", agent_id, exc)

    _SKILLS_BY_AGENT[key] = seeded


def get_agent_skills_snapshot(agent_id: str | None) -> list[dict[str, Any]]:
    """Return serialized skills state for an agent."""
    _seed_agent_skills(agent_id)
    key = _stream_key(agent_id)
    skills = _SKILLS_BY_AGENT.get(key, {})
    return [dict(v) for v in skills.values()]


def get_agent_enabled_skill_ids(agent_id: str | None) -> set[str]:
    """Return enabled (enabled/loaded) skill IDs for an agent."""
    _seed_agent_skills(agent_id)
    enabled: set[str] = set()
    for skill_id, entry in _SKILLS_BY_AGENT.get(_stream_key(agent_id), {}).items():
        if entry.get("status") in {"enabled", "loaded"}:
            enabled.add(skill_id)
    return enabled


def get_agent_tracked_skill_ids(agent_id: str | None) -> set[str]:
    """Return all skill IDs tracked for an agent (available + enabled + loaded).

    These are the skills declared by the agent's spec. The guardrail uses
    this as the "in-scope" set — anything in it is allowed to run pending
    user approval; anything outside is rejected as unknown.
    """
    _seed_agent_skills(agent_id)
    return set(_SKILLS_BY_AGENT.get(_stream_key(agent_id), {}).keys())


def set_agent_enabled_skills(
    agent_id: str | None,
    skill_refs: list[str],
) -> list[dict[str, Any]]:
    """Set enabled skills for an agent (single source of truth)."""
    _seed_agent_skills(agent_id)
    key = _stream_key(agent_id)
    enabled_ids = {_normalize_skill_ref(ref) for ref in skill_refs if ref}

    # Ensure all requested skills exist, even when discovery missed them.
    for skill_id in enabled_ids:
        if not skill_id:
            continue
        if skill_id not in _SKILLS_BY_AGENT[key]:
            _SKILLS_BY_AGENT[key][skill_id] = _build_unknown_skill_entry(skill_id)

    # Prune the per-agent snapshot to the skills this agent's spec declares.
    # This ensures the UI skills dropdown reflects exactly the skills available
    # to this agent, not the global catalog of all discoverable skills.
    # Spec-declared skills start as enabled by default.
    if enabled_ids:
        _SKILLS_BY_AGENT[key] = {
            skill_id: entry
            for skill_id, entry in _SKILLS_BY_AGENT[key].items()
            if skill_id in enabled_ids
        }
        for entry in _SKILLS_BY_AGENT[key].values():
            entry["status"] = "enabled"
    else:
        # Spec declares no skills: clear the snapshot entirely.
        _SKILLS_BY_AGENT[key] = {}

    return get_agent_skills_snapshot(agent_id)


def set_agent_turn_enabled_skills(
    agent_id: str | None,
    skill_refs: list[str],
) -> list[dict[str, Any]]:
    """Apply per-turn skill enablement without changing tracked skill scope."""
    _seed_agent_skills(agent_id)
    key = _stream_key(agent_id)
    enabled_ids = {_normalize_skill_ref(ref) for ref in skill_refs if ref}

    for skill_id in enabled_ids:
        if not skill_id:
            continue
        if skill_id not in _SKILLS_BY_AGENT[key]:
            _SKILLS_BY_AGENT[key][skill_id] = _build_unknown_skill_entry(skill_id)

    for skill_id, entry in _SKILLS_BY_AGENT[key].items():
        entry["status"] = "enabled" if skill_id in enabled_ids else "available"

    return get_agent_skills_snapshot(agent_id)


def get_agent_approved_skill_ids(agent_id: str | None) -> set[str]:
    """Return approved skill IDs for an agent."""
    _seed_agent_skills(agent_id)
    approved: set[str] = set()
    for skill_id, entry in _SKILLS_BY_AGENT.get(_stream_key(agent_id), {}).items():
        if bool(entry.get("approved", False)):
            approved.add(skill_id)
    return approved


def _build_all_mcp_tools_by_server() -> dict[str, set[str]]:
    """Build all known MCP tool names per running server."""
    result: dict[str, set[str]] = {}
    try:
        from agent_runtimes.mcp.lifecycle import get_mcp_lifecycle_manager

        manager = get_mcp_lifecycle_manager()
        for instance in manager.get_all_running_servers():
            names: set[str] = set()
            for tool in instance.tools:
                tool_name = getattr(tool, "name", None)
                if isinstance(tool_name, str) and tool_name.strip():
                    names.add(tool_name.strip())
            for tool in getattr(instance.config, "tools", []):
                tool_name = getattr(tool, "name", None)
                if isinstance(tool_name, str) and tool_name.strip():
                    names.add(tool_name.strip())
            result[instance.server_id] = names
    except Exception:
        return {}
    return result


def mark_agent_mcp_tool_approved(
    agent_id: str | None,
    tool_name: str,
) -> bool:
    """Mark an MCP tool as approved for an agent.

    Looks up which MCP server hosts the tool and adds it to the agent's
    approved set so the dropdown reflects the new state. Returns True if the
    tool was matched to a known MCP server.

    Accepts both bare tool names (``tavily_extract``) and qualified names
    (``tavily__tavily_extract``).
    """
    if not isinstance(tool_name, str):
        return False
    raw = tool_name.strip()
    if not raw:
        return False
    normalized = raw.split("__", 1)[1] if "__" in raw else raw

    all_by_server = _build_all_mcp_tools_by_server()
    matched_server: str | None = None
    for server_id, server_tools in all_by_server.items():
        if normalized in server_tools or raw in server_tools:
            matched_server = server_id
            break
    if matched_server is None:
        return False

    key = _stream_key(agent_id)
    approved_map = _MCP_APPROVED_TOOLS_BY_AGENT.setdefault(key, {})
    approved_map.setdefault(matched_server, set()).add(normalized)
    return True


def set_agent_enabled_mcp_tool_names(
    agent_id: str | None,
    tool_names: list[str],
) -> dict[str, list[str]]:
    """Set enabled MCP tools from a flat per-turn tool-name list.

    This is used by request transports that only receive a flat list of tool
    names for a turn (e.g. ``builtinTools`` in chat payloads). The mapping is
    projected back to per-server enabled tool sets.
    """
    key = _stream_key(agent_id)

    def _normalize_tool_name(name: str) -> str:
        stripped = name.strip()
        if "__" in stripped:
            return stripped.split("__", 1)[1]
        return stripped

    selected = {
        name.strip() for name in tool_names if isinstance(name, str) and name.strip()
    }
    selected_normalized = {_normalize_tool_name(name) for name in selected}

    all_by_server = _build_all_mcp_tools_by_server()

    # If the request does not carry any MCP tool names (e.g. empty list,
    # or only unrelated builtins), keep existing server-side MCP selection.
    # This avoids accidentally disabling all MCP tools at startup before the
    # dropdown state has synchronized.
    known_aliases: set[str] = set()
    for names in all_by_server.values():
        for name in names:
            known_aliases.add(name)
            known_aliases.add(_normalize_tool_name(name))

    if not (selected & known_aliases or selected_normalized & known_aliases):
        return _get_agent_mcp_enabled_tools_by_server(agent_id)

    enabled_map: dict[str, set[str]] = {}

    for server_id, all_names in all_by_server.items():
        enabled_map[server_id] = {
            name
            for name in all_names
            if name in selected or _normalize_tool_name(name) in selected_normalized
        }

    _MCP_ENABLED_TOOLS_BY_AGENT[key] = enabled_map

    # Keep approvals consistent with enabled state.
    approved_map = _MCP_APPROVED_TOOLS_BY_AGENT.setdefault(key, {})
    for server_id, approved in list(approved_map.items()):
        approved_map[server_id] = approved & enabled_map.get(server_id, set())

    return _get_agent_mcp_enabled_tools_by_server(agent_id)


def enable_agent_skill(agent_id: str | None, skill_ref: str) -> None:
    """Enable one skill for an agent."""
    _seed_agent_skills(agent_id)
    key = _stream_key(agent_id)
    skill_id = _normalize_skill_ref(skill_ref)
    if not skill_id:
        return
    entry = _SKILLS_BY_AGENT[key].get(skill_id)
    if entry is None:
        entry = _build_unknown_skill_entry(skill_id)
        _SKILLS_BY_AGENT[key][skill_id] = entry
    entry["status"] = "enabled"


def disable_agent_skill(agent_id: str | None, skill_ref: str) -> None:
    """Disable one skill for an agent."""
    _seed_agent_skills(agent_id)
    key = _stream_key(agent_id)
    skill_id = _normalize_skill_ref(skill_ref)
    entry = _SKILLS_BY_AGENT.get(key, {}).get(skill_id)
    if entry is None:
        return
    entry["status"] = "available"
    entry["skill_definition"] = None


def approve_agent_skill(agent_id: str | None, skill_ref: str) -> None:
    """Mark one skill as approved for an agent."""
    _seed_agent_skills(agent_id)
    key = _stream_key(agent_id)
    skill_id = _normalize_skill_ref(skill_ref)
    entry = _SKILLS_BY_AGENT.get(key, {}).get(skill_id)
    if entry is not None:
        entry["approved"] = True


def unapprove_agent_skill(agent_id: str | None, skill_ref: str) -> None:
    """Mark one skill as unapproved for an agent."""
    _seed_agent_skills(agent_id)
    key = _stream_key(agent_id)
    skill_id = _normalize_skill_ref(skill_ref)
    entry = _SKILLS_BY_AGENT.get(key, {}).get(skill_id)
    if entry is not None:
        entry["approved"] = False


def purge_agent_stream_state(agent_id: str | None) -> None:
    """Purge per-agent in-memory stream state for skills/MCP/subscribers."""
    key = _stream_key(agent_id)
    _SKILLS_BY_AGENT.pop(key, None)
    _MCP_ENABLED_TOOLS_BY_AGENT.pop(key, None)
    _MCP_APPROVED_TOOLS_BY_AGENT.pop(key, None)
    _STREAM_SUBSCRIBERS.pop(key, None)


def build_codemode_status(agent_id: str | None = None) -> dict[str, Any] | None:
    """Build codemode status dict (sync — safe to call from async context).

    Uses the stream-layer per-agent skills state. Each skill in the ``skills`` list carries
    a ``status`` field (``available`` | ``enabled`` | ``loaded``).
    """
    from agent_runtimes.routes.configure import (
        _codemode_state,
        _get_sandbox_status,
    )

    try:
        from agent_runtimes.routes.agui import get_all_agui_adapters

        adapters = get_all_agui_adapters()
        codemode_enabled = _codemode_state["enabled"]
        resolved = False

        # 1. Prefer the per-agent pydantic-ai adapter from the acp registry.
        #    This works for all transports (vercel-ai, ag-ui, acp, ...).
        if agent_id:
            try:
                from agent_runtimes.routes.acp import _agents as _agent_registry

                entry = _agent_registry.get(agent_id)
                if entry is not None:
                    adapter_obj = entry[0]
                    if hasattr(adapter_obj, "codemode_enabled"):
                        codemode_enabled = adapter_obj.codemode_enabled
                        resolved = True
            except Exception:
                pass

        # 2. Fallback: look up the AG-UI adapter by agent_id.
        if not resolved and agent_id and adapters and agent_id in adapters:
            try:
                agent_adapter = adapters[agent_id].agent
                if hasattr(agent_adapter, "codemode_enabled"):
                    codemode_enabled = agent_adapter.codemode_enabled
                    resolved = True
            except Exception:
                pass

        # 3. Last resort: pick the first available AG-UI adapter. Only used
        #    when no agent_id is provided (legacy behaviour).
        if not resolved and not agent_id and adapters:
            for _agent_id, agui_transport in adapters.items():
                try:
                    agent_adapter = agui_transport.agent
                    if hasattr(agent_adapter, "codemode_enabled"):
                        codemode_enabled = agent_adapter.codemode_enabled
                        break
                except Exception:
                    pass
        sandbox_status = _get_sandbox_status()
        skills_snapshot = get_agent_skills_snapshot(agent_id)

        return {
            "enabled": codemode_enabled,
            "skills": skills_snapshot,
            "available_skills": skills_snapshot,
            "sandbox": sandbox_status.model_dump() if sandbox_status else None,
        }
    except Exception:
        return None


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
    if mcp_status is not None:
        enabled_tools_by_server = _get_agent_mcp_enabled_tools_by_server(agent_id)
        mcp_status["enabled_tools_by_server"] = enabled_tools_by_server
        mcp_status["enabled_tools_count"] = sum(
            len(tool_names) for tool_names in enabled_tools_by_server.values()
        )
        mcp_status["approved_tools_by_server"] = (
            _get_agent_mcp_approved_tools_by_server(agent_id)
        )
    codemode_status = build_codemode_status(agent_id)

    graph_telemetry: dict[str, Any] | None = None
    if agent_id:
        from ..monitoring.graph_telemetry import get_graph_telemetry_dict

        graph_telemetry = get_graph_telemetry_dict(agent_id)

    return AgentMonitoringSnapshotPayload(
        agentId=agent_id,
        approvals=approvals,
        pendingApprovalCount=len(approvals),
        contextSnapshot=context_snapshot,
        costUsage=cost_usage,
        mcpStatus=mcp_status,
        codemodeStatus=codemode_status,
        fullContext=full_context,
        graphTelemetry=graph_telemetry,
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
    """Nudge the OTEL websocket stream to deliver fresh telemetry.

    The OTEL service contract for live delivery is websocket-based
    (``/api/otel/v1/ws``).  We intentionally avoid a REST flush call here.
    """
    run_url = (
        os.environ.get("DATALAYER_RUN_URL")
        or os.environ.get("DATALAYER_OTEL_RUN_URL")
        or "https://prod1.datalayer.run"
    )
    token = (
        auth_token
        or os.environ.get("DATALAYER_TOKEN")
        or os.environ.get("DATALAYER_API_KEY")
    )

    run_url = run_url.strip().rstrip("/")
    if run_url.startswith("https://"):
        ws_base = "wss://" + run_url[len("https://") :]
    elif run_url.startswith("http://"):
        ws_base = "ws://" + run_url[len("http://") :]
    elif run_url.startswith("ws://") or run_url.startswith("wss://"):
        ws_base = run_url
    else:
        ws_base = "wss://" + run_url

    params: dict[str, str] = {}
    if token:
        params["token"] = token
    query = f"?{urlencode(params)}" if params else ""
    ws_url = f"{ws_base}/api/otel/v1/ws{query}"

    try:
        from websockets.asyncio.client import connect as ws_connect

        async with ws_connect(ws_url, open_timeout=5.0, close_timeout=3.0) as websocket:
            # Wait briefly for one event/keepalive. This keeps the flow websocket-only
            # and avoids emitting REST 404 warnings when /flush is unavailable.
            try:
                await asyncio.wait_for(websocket.recv(), timeout=1.5)
            except asyncio.TimeoutError:
                pass
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
    enable_agent_skill(agent_id, skill_id)
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
    disable_agent_skill(agent_id, skill_id)
    logger.info("[ws:skill_disable] skill_id=%s agent_id=%s", skill_id, agent_id)
    await _push_fresh_snapshot(agent_id, websocket, list_approvals)


async def _handle_skill_approve(
    skill_id: str,
    agent_id: str | None,
    websocket: Any,
    list_approvals: Any | None,
) -> None:
    """Handle a skill_approve WS message."""
    approve_agent_skill(agent_id, skill_id)
    logger.info("[ws:skill_approve] skill_id=%s agent_id=%s", skill_id, agent_id)
    await _push_fresh_snapshot(agent_id, websocket, list_approvals)


async def _handle_skill_unapprove(
    skill_id: str,
    agent_id: str | None,
    websocket: Any,
    list_approvals: Any | None,
) -> None:
    """Handle a skill_unapprove WS message."""
    unapprove_agent_skill(agent_id, skill_id)
    logger.info("[ws:skill_unapprove] skill_id=%s agent_id=%s", skill_id, agent_id)
    await _push_fresh_snapshot(agent_id, websocket, list_approvals)


async def _handle_mcp_server_tools_set(
    server_id: str,
    enabled_tool_names: list[str],
    agent_id: str | None,
    websocket: Any,
    list_approvals: Any | None,
) -> None:
    """Handle an MCP tools selection update for a specific server."""
    key = _stream_key(agent_id)
    agent_map = _MCP_ENABLED_TOOLS_BY_AGENT.setdefault(key, {})
    normalized = sorted(
        {
            name.strip()
            for name in enabled_tool_names
            if isinstance(name, str) and name.strip()
        }
    )
    agent_map[server_id] = set(normalized)
    approved_map = _MCP_APPROVED_TOOLS_BY_AGENT.setdefault(key, {})
    approved_map[server_id] = approved_map.get(server_id, set()) & set(normalized)
    logger.info(
        "[ws:mcp_server_tools_set] agent_id=%s server_id=%s enabled_count=%d",
        agent_id,
        server_id,
        len(normalized),
    )
    await _push_fresh_snapshot(agent_id, websocket, list_approvals)


async def _handle_mcp_server_tool_approve(
    server_id: str,
    tool_name: str,
    approved: bool,
    agent_id: str | None,
    websocket: Any,
    list_approvals: Any | None,
) -> None:
    """Handle a per-tool approval toggle for a specific MCP server."""
    key = _stream_key(agent_id)
    server_approved = _MCP_APPROVED_TOOLS_BY_AGENT.setdefault(key, {}).setdefault(
        server_id, set()
    )
    if approved:
        server_approved.add(tool_name)
    else:
        server_approved.discard(tool_name)
    logger.info(
        "[ws:mcp_server_tool_approve] agent_id=%s server_id=%s tool=%s approved=%s",
        agent_id,
        server_id,
        tool_name,
        approved,
    )
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
    decide_approval: Callable[[str, bool, str | None, str | None], Awaitable[Any]]
    | None = None,
    delete_approval: Callable[[str], Awaitable[Any]] | None = None,
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
                                tool_call_id = payload.get("toolCallId") or payload.get(
                                    "tool_call_id"
                                )
                                if isinstance(approval_id, str) and isinstance(
                                    approved, bool
                                ):
                                    logger.info(
                                        "[ws:tool_approval_decision] agent_id=%s approval_id=%s approved=%s tool_call_id=%s",
                                        agent_id,
                                        approval_id,
                                        approved,
                                        tool_call_id
                                        if isinstance(tool_call_id, str)
                                        else None,
                                    )
                                    await decide_approval(
                                        approval_id,
                                        approved,
                                        note if isinstance(note, str) else None,
                                        tool_call_id
                                        if isinstance(tool_call_id, str)
                                        else None,
                                    )
                                else:
                                    logger.warning(
                                        "[ws:tool_approval_decision] dropped invalid payload agent_id=%s approval_id=%r approved=%r",
                                        agent_id,
                                        approval_id,
                                        approved,
                                    )

                            elif (
                                msg_type == "tool_approval_delete"
                                and delete_approval is not None
                            ):
                                approval_id = payload.get("approvalId")
                                if isinstance(approval_id, str):
                                    await delete_approval(approval_id)

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

                            elif msg_type == "skill_approve":
                                skill_id = payload.get("skillId")
                                if isinstance(skill_id, str):
                                    await _handle_skill_approve(
                                        skill_id, agent_id, websocket, list_approvals
                                    )

                            elif msg_type == "skill_unapprove":
                                skill_id = payload.get("skillId")
                                if isinstance(skill_id, str):
                                    await _handle_skill_unapprove(
                                        skill_id, agent_id, websocket, list_approvals
                                    )

                            elif msg_type == "mcp_server_tools_set":
                                server_id = payload.get("serverId")
                                enabled_tool_names = payload.get("enabledToolNames")
                                if isinstance(server_id, str) and isinstance(
                                    enabled_tool_names, list
                                ):
                                    await _handle_mcp_server_tools_set(
                                        server_id,
                                        [
                                            n
                                            for n in enabled_tool_names
                                            if isinstance(n, str)
                                        ],
                                        agent_id,
                                        websocket,
                                        list_approvals,
                                    )

                            elif msg_type == "mcp_server_tool_approve":
                                server_id = payload.get("serverId")
                                tool_name = payload.get("toolName")
                                approved = payload.get("approved")
                                if (
                                    isinstance(server_id, str)
                                    and isinstance(tool_name, str)
                                    and isinstance(approved, bool)
                                ):
                                    await _handle_mcp_server_tool_approve(
                                        server_id,
                                        tool_name,
                                        approved,
                                        agent_id,
                                        websocket,
                                        list_approvals,
                                    )

                    except Exception as exc:
                        logger.debug(
                            "[ws:recv] client message handling error agent_id=%s: %s",
                            agent_id,
                            exc,
                            exc_info=True,
                        )

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
