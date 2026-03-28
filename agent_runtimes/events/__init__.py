# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Helpers for the AI Agents Events HTTP API.

This module provides lightweight Python wrappers for the events endpoints:
- POST   /api/ai-agents/v1/events
- GET    /api/ai-agents/v1/events
- GET    /api/ai-agents/v1/events/{event_id}
- PATCH  /api/ai-agents/v1/events/{event_id}
"""

from __future__ import annotations

from typing import Any

import httpx

DEFAULT_AI_AGENTS_BASE_URL = "https://prod1.datalayer.run"


def _auth_headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _events_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/api/ai-agents/v1/events"


def create_event(
    token: str,
    agent_id: str,
    title: str,
    kind: str = "generic",
    status: str = "pending",
    payload: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    base_url: str = DEFAULT_AI_AGENTS_BASE_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Create an event record for an AI agent."""
    body = {
        "agent_id": agent_id,
        "title": title,
        "kind": kind,
        "status": status,
        "payload": payload or {},
        "metadata": metadata or {},
    }
    response = httpx.post(
        _events_url(base_url),
        headers=_auth_headers(token),
        json=body,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def list_events(
    token: str,
    agent_id: str | None = None,
    kind: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    base_url: str = DEFAULT_AI_AGENTS_BASE_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """List event records with optional filters."""
    params: dict[str, Any] = {"limit": limit, "offset": offset}
    if agent_id:
        params["agent_id"] = agent_id
    if kind:
        params["kind"] = kind
    if status:
        params["status"] = status

    response = httpx.get(
        _events_url(base_url),
        headers=_auth_headers(token),
        params=params,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def get_event(
    token: str,
    event_id: str,
    base_url: str = DEFAULT_AI_AGENTS_BASE_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Retrieve one event by identifier."""
    response = httpx.get(
        f"{_events_url(base_url)}/{event_id}",
        headers=_auth_headers(token),
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def update_event(
    token: str,
    event_id: str,
    title: str | None = None,
    kind: str | None = None,
    status: str | None = None,
    read: bool | None = None,
    payload: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    base_url: str = DEFAULT_AI_AGENTS_BASE_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Update an existing event record."""
    body: dict[str, Any] = {}
    if title is not None:
        body["title"] = title
    if kind is not None:
        body["kind"] = kind
    if status is not None:
        body["status"] = status
    if read is not None:
        body["read"] = read
    if payload is not None:
        body["payload"] = payload
    if metadata is not None:
        body["metadata"] = metadata

    response = httpx.patch(
        f"{_events_url(base_url)}/{event_id}",
        headers=_auth_headers(token),
        json=body,
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def delete_event(
    token: str,
    event_id: str,
    base_url: str = DEFAULT_AI_AGENTS_BASE_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Delete an event record."""
    response = httpx.delete(
        f"{_events_url(base_url)}/{event_id}",
        headers=_auth_headers(token),
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def mark_event_read(
    token: str,
    event_id: str,
    base_url: str = DEFAULT_AI_AGENTS_BASE_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Mark an event as read."""
    return update_event(token, event_id, read=True, base_url=base_url, timeout=timeout)


def mark_event_unread(
    token: str,
    event_id: str,
    base_url: str = DEFAULT_AI_AGENTS_BASE_URL,
    timeout: float = 30.0,
) -> dict[str, Any]:
    """Mark an event as unread."""
    return update_event(token, event_id, read=False, base_url=base_url, timeout=timeout)
