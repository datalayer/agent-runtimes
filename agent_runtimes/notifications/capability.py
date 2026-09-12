# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Notifications as a pydantic-ai capability, and the stores by agent.

The store keeps an agent's channels and what was sent; the capability gives
the model ``send_notification`` and ``list_notifications``. Every agent can
have a store — a page configures channels for any agent — while only an
agent whose spec has a ``notifications`` section gets the tools.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.toolsets import AgentToolset, FunctionToolset

from .store import CHANNELS, Level, NotificationStore

logger = logging.getLogger(__name__)

_stores: dict[str, NotificationStore] = {}


def get_notification_store(agent_id: str) -> NotificationStore | None:
    return _stores.get(agent_id)


def ensure_notification_store(
    agent_id: str, channels: dict[str, Any] | None = None
) -> NotificationStore:
    """The agent's store, made with the given channel defaults when there is none."""
    store = _stores.get(agent_id)
    if store is None:
        store = NotificationStore(agent_id, channels)
        _stores[agent_id] = store
    return store


def drop_notification_store(agent_id: str) -> None:
    _stores.pop(agent_id, None)


@dataclass
class NotificationsCapability(AbstractCapability[Any]):
    """Let an agent notify through its configured channels."""

    store: NotificationStore
    expose_tools: bool = True

    def get_toolset(self) -> AgentToolset[Any] | None:
        if not self.expose_tools:
            return None
        store = self.store
        toolset: FunctionToolset[Any] = FunctionToolset()

        async def send_notification(
            title: str,
            body: str,
            level: str = "info",
            channel: str | None = None,
        ) -> str:
            """Send a notification to the person through the configured channels.

            Args:
                title: A short headline.
                body: The message, one or two sentences.
                level: ``info``, ``warning`` or ``critical``.
                channel: One channel — ``in-app``, ``email`` or ``slack`` — or
                    omitted to send through every channel that is enabled.
            """
            lvl: Level = level if level in ("info", "warning", "critical") else "info"  # type: ignore[assignment]
            if channel is not None and channel not in CHANNELS:
                return f"Unknown channel '{channel}'. Channels: {', '.join(CHANNELS)}."
            records = await store.notify(
                title, body, level=lvl, channels=[channel] if channel else None
            )
            if not records:
                return "No channel is enabled; nothing was sent."
            lines = [f"Sent '{title}' through {len(records)} channel(s):"]
            for record in records:
                detail = f" — {record.detail}" if record.detail else ""
                lines.append(f"- {record.channel}: {record.delivery}{detail}")
            return "\n".join(lines)

        async def list_notifications(unread_only: bool = False) -> str:
            """List the notifications sent so far, newest first, and the channels' state."""
            channels = ", ".join(
                f"{c.channel} ({'on' if c.enabled else 'off'}"
                + (f", {c.target}" if c.target else "")
                + ")"
                for c in store.channels()
            )
            items = store.list(unread_only=unread_only)
            if not items:
                return f"No notifications yet. Channels: {channels}."
            lines = [f"Channels: {channels}.", f"{len(items)} notification(s):"]
            for n in items[:20]:
                lines.append(
                    f"- [{n.level}] {n.title} via {n.channel} ({n.delivery}"
                    f"{', read' if n.read else ', unread'}) at {n.timestamp}"
                )
            return "\n".join(lines)

        toolset.add_function(send_notification)
        toolset.add_function(list_notifications)
        return toolset


def build_notifications_capability(
    spec_notifications: Any, agent_id: str | None = None
) -> NotificationsCapability | None:
    """Build the capability from an Agentspec ``notifications`` section.

    The section's keys are channel names — ``in-app``, ``email``, ``slack`` —
    each either a target string, a ``{enabled, target}`` mapping, or a flag.
    ``None`` when the section is absent, so an agent that did not ask for
    notifications gets no tools.
    """
    if spec_notifications is None or not agent_id:
        return None
    channels = spec_notifications if isinstance(spec_notifications, dict) else {}
    # A ``channels`` mapping inside the section is accepted too.
    if isinstance(channels.get("channels"), dict):
        channels = channels["channels"]
    store = ensure_notification_store(agent_id, channels)
    return NotificationsCapability(store=store)
