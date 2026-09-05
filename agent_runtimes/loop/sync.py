# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Keeping the terminal and the browser looking at the same conversation.

`/browser` hands a session over, and both ends stay attached to it: the same
agent, the same sandbox, the same conversation. The sandbox and the agent are
shared by construction — one server holds them. The conversation is not: each
front-end renders what it saw happen, so a turn typed in the browser is
invisible in the terminal that opened it.

The server already keeps the history both ends need. This watches it and reports
what arrived from somewhere else, so the terminal can show it rather than
quietly diverging from the page it launched.

Polling rather than a subscription, deliberately: the history endpoint is the
one thing both ends already agree on, and a poll that finds nothing costs one
request. A stream would need every producer to publish turns, which is a larger
promise than "the two ends do not disagree".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

#: How often to look. Slow enough to be free, quick enough that a turn made in
#: the browser shows up before the reader wonders whether it worked.
DEFAULT_INTERVAL_SECONDS = 3.0


@dataclass(frozen=True)
class ForeignTurn:
    """A turn this front-end did not produce."""

    role: str
    content: str
    #: Position in the shared history, which is what makes it identifiable.
    index: int


@dataclass
class SessionSync:
    """Tracks the shared history and reports what came from elsewhere.

    It is told what the local end sent, so an echo of the reader's own message
    is not announced back to them as news from the browser.
    """

    server_url: str
    agent_id: str = "default"
    #: How many messages were already accounted for when the sync started.
    _seen: int = field(default=0, init=False)
    #: Content this end produced, so its echo is not reported as foreign.
    _local: list[str] = field(default_factory=list, init=False)
    _started: bool = field(default=False, init=False)

    @property
    def history_url(self) -> str:
        return f"{self.server_url.rstrip('/')}/api/v1/history"

    def note_local(self, content: str) -> None:
        """Record something this end sent."""
        text = (content or "").strip()
        if text:
            self._local.append(text)

    def _is_local_echo(self, message: dict[str, Any]) -> bool:
        content = str(message.get("content") or "").strip()
        if not content:
            return False
        try:
            self._local.remove(content)
        except ValueError:
            return False
        return True

    async def poll(self, fetch: Optional[Callable[..., Any]] = None) -> list[ForeignTurn]:
        """Look once. Returns turns that arrived from another front-end.

        The first call establishes the baseline and reports nothing: whatever
        was already in the history was not "news", and announcing it would
        replay the conversation the reader has just been having.
        """
        messages = await self._fetch(fetch)
        if messages is None:
            return []

        if not self._started:
            self._started = True
            self._seen = len(messages)
            return []

        fresh = messages[self._seen :]
        self._seen = len(messages)

        turns: list[ForeignTurn] = []
        for offset, message in enumerate(fresh):
            if not isinstance(message, dict):
                continue
            if self._is_local_echo(message):
                continue
            content = str(message.get("content") or "").strip()
            if not content:
                continue
            turns.append(
                ForeignTurn(
                    role=str(message.get("role") or "assistant"),
                    content=content,
                    index=self._seen - len(fresh) + offset,
                )
            )
        return turns

    async def _fetch(
        self, fetch: Optional[Callable[..., Any]]
    ) -> Optional[list[dict[str, Any]]]:
        """The shared history, or ``None`` when it cannot be read.

        A sync that cannot reach the server is not an error worth showing: the
        two ends are out of step for a moment, which the next poll fixes.
        """
        if fetch is not None:
            return await fetch()

        try:
            import httpx

            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.history_url,
                    params={"agent_id": self.agent_id},
                    timeout=10.0,
                )
                response.raise_for_status()
                payload = response.json()
        except Exception as error:  # noqa: BLE001
            logger.debug("Session sync could not read history: %s", error)
            return None

        messages = payload.get("messages") if isinstance(payload, dict) else None
        return messages if isinstance(messages, list) else []
