# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Per-agent notifications: channels, and what was sent through them.

An in-process store, one per agent. The in-app channel keeps every
notification for the page to list; Slack goes out to the webhook the channel
is configured with; email has no provider on a local server and is recorded
as such rather than pretended.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

logger = logging.getLogger(__name__)

Channel = Literal["in-app", "email", "slack"]
Level = Literal["info", "warning", "critical"]

CHANNELS: tuple[Channel, ...] = ("in-app", "email", "slack")
MAX_NOTIFICATIONS = 200


@dataclass
class ChannelConfig:
    """One channel: on or off, and where it delivers."""

    channel: Channel
    enabled: bool = False
    target: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"channel": self.channel, "enabled": self.enabled, "target": self.target}


@dataclass
class Notification:
    """One notification as it went through one channel."""

    id: str
    agent_id: str
    channel: Channel
    title: str
    body: str
    level: Level
    timestamp: str
    read: bool = False
    # ``stored`` (in-app), ``sent``, ``failed`` or ``unconfigured``, with a word on why.
    delivery: str = "stored"
    detail: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class NotificationStore:
    """The channels of one agent and the notifications it sent."""

    def __init__(self, agent_id: str, channels: dict[str, Any] | None = None) -> None:
        self.agent_id = agent_id
        # In-app on by default: it is the one channel a local server can
        # always deliver to. The others wait for a target.
        self._channels: dict[str, ChannelConfig] = {
            "in-app": ChannelConfig("in-app", enabled=True),
            "email": ChannelConfig("email"),
            "slack": ChannelConfig("slack"),
        }
        for name, value in (channels or {}).items():
            if name in self._channels:
                if isinstance(value, dict):
                    self.configure(
                        name,
                        enabled=bool(value.get("enabled", True)),
                        target=value.get("target"),
                    )
                elif isinstance(value, str):
                    self.configure(name, enabled=True, target=value)
                else:
                    self.configure(name, enabled=bool(value))
        self._notifications: list[Notification] = []

    # -- channels --------------------------------------------------------

    def channels(self) -> list[ChannelConfig]:
        return [self._channels[name] for name in CHANNELS]

    def configure(
        self, channel: str, *, enabled: bool | None = None, target: str | None = None
    ) -> ChannelConfig:
        if channel not in self._channels:
            raise ValueError(f"Unknown notification channel '{channel}'")
        config = self._channels[channel]
        if enabled is not None:
            config.enabled = enabled
        if target is not None:
            config.target = target.strip() or None
        return config

    def enabled_channels(self) -> list[Channel]:
        return [c.channel for c in self.channels() if c.enabled]

    # -- notifications ---------------------------------------------------

    def list(self, unread_only: bool = False) -> list[Notification]:
        items = self._notifications
        if unread_only:
            items = [n for n in items if not n.read]
        return list(items)

    def mark_read(self, notification_id: str) -> Notification | None:
        for notification in self._notifications:
            if notification.id == notification_id:
                notification.read = True
                return notification
        return None

    def mark_all_read(self) -> int:
        count = 0
        for notification in self._notifications:
            if not notification.read:
                notification.read = True
                count += 1
        return count

    async def notify(
        self,
        title: str,
        body: str,
        *,
        level: Level = "info",
        channels: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> list[Notification]:
        """Send through the enabled channels (or the ones named), one record each."""
        wanted = [
            c for c in (channels or self.enabled_channels()) if c in self._channels
        ]
        records: list[Notification] = []
        for name in wanted:
            config = self._channels[name]
            if channels is None and not config.enabled:
                continue
            record = Notification(
                id=str(uuid.uuid4()),
                agent_id=self.agent_id,
                channel=config.channel,
                title=title,
                body=body,
                level=level,
                timestamp=_now(),
                metadata=dict(metadata or {}),
            )
            await self._deliver(record, config)
            records.append(record)
            self._notifications.insert(0, record)
        del self._notifications[MAX_NOTIFICATIONS:]
        return records

    async def _deliver(self, record: Notification, config: ChannelConfig) -> None:
        if config.channel == "in-app":
            record.delivery = "stored"
            return
        if not config.enabled:
            record.delivery = "unconfigured"
            record.detail = f"The {config.channel} channel is off."
            return
        if config.channel == "slack":
            await _post_slack(record, config.target)
            return
        # Email: a local server has no mail provider; say so rather than pretend.
        record.delivery = "unconfigured"
        record.detail = (
            f"Recorded for {config.target or 'no address'}; the local server has no "
            "email provider, so nothing was sent."
        )


async def _post_slack(record: Notification, target: str | None) -> None:
    if not target or not target.startswith(("http://", "https://")):
        record.delivery = "unconfigured"
        record.detail = "The Slack channel needs an incoming-webhook URL as its target."
        return
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(
                target, json={"text": f"*{record.title}*\n{record.body}"}
            )
        if 200 <= response.status_code < 300:
            record.delivery = "sent"
            record.detail = f"Slack webhook answered {response.status_code}."
        else:
            record.delivery = "failed"
            record.detail = f"Slack webhook answered {response.status_code}."
    except Exception as exc:  # noqa: BLE001 - a failed delivery is a record, not a crash
        record.delivery = "failed"
        record.detail = str(exc)[:200]
