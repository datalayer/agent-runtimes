# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A person's threads and what was said of their answers, read from ai-agents
(LOOP P-24): what `loop apps threads` and `loop apps feedback` print.

A thread is a conversation a person had with an application, as their
history lists it — ai-agents' ``/apps/conversations/mine/threads``, newest
first, each under its title (the person's, else the one its code gave, else
their first question), its tags and metadata. Feedback is a session's
``feedback`` entries in the application's record — the thumb, the comment,
the answer it is about and who said it — which its owner reads.

Pure but for the request, made with the ``httpx.Client`` it is given.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import httpx

#: Where ai-agents answers, under its URL.
THREADS_PATH = "/api/ai-agents/v1/apps/conversations/mine/threads"
RECORDS_PATH = "/api/ai-agents/v1/apps/records"


class ThreadsRefused(RuntimeError):
    """The ai-agents service did not answer, in a sentence."""


@dataclass(frozen=True)
class Thread:
    """One conversation, as the person's history lists it."""

    session_uid: str
    app_uid: str
    title: str
    first_asked: str
    turns: int
    started_at: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def shown_title(self) -> str:
        """Give its title, else what was first asked, else its uid."""
        return self.title or self.first_asked or self.session_uid


@dataclass(frozen=True)
class SaidOfAnAnswer:
    """A ``feedback`` entry of a session's record."""

    liked: bool
    comment: str
    message: str
    by: str
    at: str


def _refused(response: httpx.Response, what: str) -> ThreadsRefused:
    try:
        detail = str((response.json() or {}).get("detail") or "")
    except ValueError:
        detail = response.text[:200]
    return ThreadsRefused(
        f"{what} could not be read ({response.status_code}): {detail}"
    )


def list_threads(
    client: httpx.Client,
    *,
    app_uid: Optional[str] = None,
    search: str = "",
    tag: str = "",
    limit: int = 50,
) -> List[Thread]:
    """The caller's threads, newest first: one application's, or all."""
    params: Dict[str, Any] = {"limit": limit}
    if app_uid:
        params["app_uid"] = app_uid
    if search.strip():
        params["q"] = search.strip()
    if tag.strip():
        params["tag"] = tag.strip()
    response = client.get(THREADS_PATH, params=params)
    if response.status_code >= 300:
        raise _refused(response, "Your threads")
    return [
        Thread(
            session_uid=str(item.get("session_uid") or ""),
            app_uid=str(item.get("app_uid") or ""),
            title=str(item.get("title") or ""),
            first_asked=str(item.get("first_asked") or ""),
            turns=int(item.get("turns") or 0),
            started_at=str(item.get("started_at") or ""),
            tags=[str(tag) for tag in item.get("tags") or []],
            metadata=dict(item.get("metadata") or {}),
        )
        for item in (response.json() or {}).get("threads") or []
    ]


def thread_feedback(client: httpx.Client, session_uid: str) -> List[SaidOfAnAnswer]:
    """What was said of a thread's answers, oldest first, as its record keeps it."""
    response = client.get(
        RECORDS_PATH,
        params={"session_uid": session_uid, "kind": "feedback", "limit": 1000},
    )
    if response.status_code >= 300:
        raise _refused(response, f"The feedback of {session_uid}")
    said: List[SaidOfAnAnswer] = []
    for entry in (response.json() or {}).get("entries") or []:
        if entry.get("kind") != "feedback":
            continue
        payload = entry.get("payload") or {}
        said.append(
            SaidOfAnAnswer(
                liked=bool(payload.get("liked")),
                comment=str(payload.get("comment") or ""),
                message=str(payload.get("message") or ""),
                by=str(payload.get("by") or ""),
                at=str(entry.get("created_at") or ""),
            )
        )
    return said


def feedback_line(said: SaidOfAnAnswer) -> str:
    """One feedback entry in a line: the thumb, the answer, who, and the comment."""
    thumb = "👍" if said.liked else "👎"
    about = f" on {said.message}" if said.message else ""
    who = f" by {said.by}" if said.by else ""
    comment = f": {said.comment}" if said.comment else ""
    return f"{thumb}{about}{who}{comment}"


def thread_line(thread: Thread) -> str:
    """One thread in a line: its title, turns, tags and uid."""
    tags = f" [{', '.join(thread.tags)}]" if thread.tags else ""
    turns = f"{thread.turns} turn{'' if thread.turns == 1 else 's'}"
    return f"{thread.shown_title} — {turns}{tags} ({thread.session_uid})"


__all__ = [
    "RECORDS_PATH",
    "SaidOfAnAnswer",
    "THREADS_PATH",
    "Thread",
    "ThreadsRefused",
    "feedback_line",
    "list_threads",
    "thread_feedback",
    "thread_line",
]
