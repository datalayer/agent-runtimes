# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Events management mixin for Datalayer Core."""

import json
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


class EventsMixin:
    """Mixin for managing agent events via the AI Agents service."""

    def _resolve_event_agent_id(self, event_id: str) -> str:
        """Resolve an event's agent_id from the global events listing."""
        response = self._fetch(  # type: ignore
            "{}/api/ai-agents/v1/events".format(self.urls.run_url),  # type: ignore
            method="GET",
            params={"limit": 500, "offset": 0},
        )
        data = response.json()
        events = data.get("events", []) if isinstance(data, dict) else []
        for event in events:
            if str(event.get("id", "")) == event_id:
                agent_id = str(event.get("agent_id", ""))
                if agent_id:
                    return agent_id
        raise ValueError(
            f"Unable to resolve agent_id for event '{event_id}'. Use --agent-id."
        )

    def _list_events(
        self,
        agent_id: Optional[str] = None,
        kind: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        """List events with optional filters."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if kind:
            params["kind"] = kind
        if status:
            params["status"] = status

        if agent_id:
            url = "{}/api/ai-agents/v1/agents/{}/events".format(
                self.urls.run_url,  # type: ignore
                agent_id,
            )
        else:
            url = "{}/api/ai-agents/v1/events".format(self.urls.run_url)  # type: ignore

        response = self._fetch(  # type: ignore
            url,
            method="GET",
            params=params,
        )
        return response.json()

    def _create_event(
        self,
        agent_id: str,
        title: str,
        kind: str = "generic",
        status: str = "pending",
        payload: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a new event record."""
        body = {
            "title": title,
            "kind": kind,
            "status": status,
            "payload": payload or {},
            "metadata": metadata or {},
        }
        response = self._fetch(  # type: ignore
            "{}/api/ai-agents/v1/agents/{}/events".format(
                self.urls.run_url,  # type: ignore
                agent_id,
            ),
            method="POST",
            json=body,
        )
        return response.json()

    def _get_event(
        self, event_id: str, agent_id: Optional[str] = None
    ) -> dict[str, Any]:
        """Get a single event by ID."""
        resolved_agent_id = agent_id or self._resolve_event_agent_id(event_id)
        response = self._fetch(  # type: ignore
            "{}/api/ai-agents/v1/agents/{}/events/{}".format(
                self.urls.run_url,  # type: ignore
                resolved_agent_id,
                event_id,
            ),
            method="GET",
        )
        return response.json()

    def _update_event(
        self,
        event_id: str,
        agent_id: Optional[str] = None,
        title: Optional[str] = None,
        kind: Optional[str] = None,
        status: Optional[str] = None,
        read: Optional[bool] = None,
        payload: Optional[dict[str, Any]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Update a mutable event record."""
        resolved_agent_id = agent_id or self._resolve_event_agent_id(event_id)
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

        response = self._fetch(  # type: ignore
            "{}/api/ai-agents/v1/agents/{}/events/{}".format(
                self.urls.run_url,  # type: ignore
                resolved_agent_id,
                event_id,
            ),
            method="PATCH",
            json=body,
        )
        return response.json()

    def _delete_event(
        self, event_id: str, agent_id: Optional[str] = None
    ) -> dict[str, Any]:
        """Delete an event by ID."""
        resolved_agent_id = agent_id or self._resolve_event_agent_id(event_id)
        response = self._fetch(  # type: ignore
            "{}/api/ai-agents/v1/agents/{}/events/{}".format(
                self.urls.run_url,  # type: ignore
                resolved_agent_id,
                event_id,
            ),
            method="DELETE",
        )
        return response.json()

    def _mark_event_read(
        self, event_id: str, agent_id: Optional[str] = None
    ) -> dict[str, Any]:
        """Mark an event as read."""
        return self._update_event(event_id, agent_id=agent_id, read=True)

    def _mark_event_unread(
        self, event_id: str, agent_id: Optional[str] = None
    ) -> dict[str, Any]:
        """Mark an event as unread."""
        return self._update_event(event_id, agent_id=agent_id, read=False)
