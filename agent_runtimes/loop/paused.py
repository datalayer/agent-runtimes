# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The paused sessions `loop` offers to resume as it starts.

Before asking where a new agent should run, `loop` lists the person's paused
sessions that can be gone on with: those kept in files on this machine and,
signed in to Datalayer, those in the platform's record — each with its kind
(an agent's, an application's), its agent, its title, where it lives and
when it started, newest first, the five most recent. One picked is resumed
where it lives, its conversation loaded; *Start a new session* goes on to
the usual questions. With none paused nothing is printed.

What `loop` resumes is an agent's session, whose agent it starts: those are
offered. An application's paused session is resumed at its application's
address: it is counted with the rest (`/sessions` lists them), never offered
as a choice that cannot be picked. The platform's list failing — offline, a key
refused — is said in one line and never blocks the start.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

from agent_runtimes.apps.record import session_kind

#: How many paused sessions are offered at the start.
OFFERED = 5

#: How many are read to say how many more there are.
READ = 50

#: Where a session lives.
ON_THIS_MACHINE = "local"
ON_DATALAYER = "cloud"

#: The store a session on this machine is kept in.
FILE = "file"
RECORD = "record"

NEW_SESSION = "Start a new session"


@dataclass(frozen=True)
class Paused:
    """One paused session, as the start offers it."""

    uid: str
    kind: str
    """``agent`` or ``application``."""
    agent: str
    title: str
    where: str
    """`ON_THIS_MACHINE` or `ON_DATALAYER`: where it ran, and is resumed."""
    store: str
    """`FILE` or `RECORD`: where its conversation is kept."""
    started_at: str
    turns: int = 0

    @property
    def resumable(self) -> bool:
        """Whether `loop` resumes it: an agent's session, whose agent it starts."""
        return self.kind == "agent" and bool(self.agent)


@dataclass(frozen=True)
class ResumePlan:
    """How a paused session picked at the start is gone on with."""

    uid: str
    agent: str
    """The agentspec `loop` starts: the session's."""
    cloud: bool
    """On Datalayer, where it ran; else on this machine. Nobody is asked where."""
    session_store: str
    """The store its server must read (``AGENT_RUNTIMES_SESSION_STORE``), or
    ``""`` for the one the environment names: a session kept in files is
    read from the files, signed in or not."""


def resume_plan(row: Paused) -> ResumePlan:
    """A paused session resumed where it lives."""
    return ResumePlan(
        uid=row.uid,
        agent=row.agent,
        cloud=row.where == ON_DATALAYER,
        session_store=FILE if row.store == FILE else "",
    )


def _where_of(session: Mapping[str, Any]) -> str:
    runs_on = session.get("runs_on") or {}
    on_own = runs_on.get("kind") == "runtime" and runs_on.get("uid") == "local"
    return ON_THIS_MACHINE if on_own or not runs_on else ON_DATALAYER


def paused_of(sessions: List[Mapping[str, Any]], store: str) -> List[Paused]:
    """The paused sessions among described ones, as a store lists them."""
    rows: List[Paused] = []
    for session in sessions:
        if session.get("state") != "paused" or session.get("archived"):
            continue
        app_uid = session.get("app_uid") or (session.get("instance") or {}).get(
            "app_uid"
        )
        rows.append(
            Paused(
                uid=str(session.get("uid") or ""),
                kind=session_kind(app_uid),
                agent=str(session.get("agent") or ""),
                title=str(session.get("title") or ""),
                # What is kept in files on this machine ran on this machine.
                where=ON_THIS_MACHINE if store == FILE else _where_of(session),
                store=store,
                started_at=str(session.get("started_at") or ""),
                turns=int(session.get("turns") or 0),
            )
        )
    return rows


def local_paused(store: Any = None) -> List[Paused]:
    """The paused sessions kept in files on this machine."""
    from agent_runtimes.apps.session_store import FileSessionStore

    files = store or FileSessionStore()
    page = asyncio.run(files.list({"kind": "local"}, state="paused", limit=READ))
    return paused_of(page.sessions, FILE)


async def _ask_the_record(token: str) -> List[Dict[str, Any]]:
    """The person's paused sessions in the platform's record, asked with their token."""
    from agent_runtimes.apps.callers import VERIFIER
    from agent_runtimes.apps.session_store import _list_sessions

    person = await VERIFIER.verify(token, "")
    answered = await _list_sessions(
        token, {"opened_by": person.uid, "state": "paused", "limit": READ}
    )
    return [dict(item) for item in answered.get("sessions") or []]


def record_paused(
    token: str,
    asker: Optional[Callable[[str], List[Dict[str, Any]]]] = None,
) -> List[Paused]:
    """The person's paused sessions in the platform's record.

    Raises
    ------
    Exception
        Whatever kept the record from answering: `paused_sessions` says it
        in a line and goes on.
    """
    sessions = asker(token) if asker else asyncio.run(_ask_the_record(token))
    return paused_of(sessions, RECORD)


def paused_sessions(
    *,
    token: str = "",
    store: Any = None,
    asker: Optional[Callable[[str], List[Dict[str, Any]]]] = None,
    say: Callable[[str], None] = print,
) -> List[Paused]:
    """Every paused session the person may go on with, newest first: those
    on this machine and, with a token, those of the platform's record. Not
    signed in, the local ones only; the record failing is said in a line.
    """
    rows = local_paused(store)
    if token:
        try:
            known = {row.uid for row in rows}
            rows += [row for row in record_paused(token, asker) if row.uid not in known]
        except Exception as refused:  # noqa: BLE001 - said, never fatal to the start
            say(
                f"Your paused sessions on Datalayer could not be listed ({str(refused)[:160]}): going on without them."
            )
    return sorted(rows, key=lambda row: row.started_at, reverse=True)


def _ago(moment: str, now: Optional[datetime] = None) -> str:
    """When, in words: ``3 hours ago``."""
    try:
        then = datetime.fromisoformat(moment.replace("Z", "+00:00"))
    except ValueError:
        return ""
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    seconds = max(0, int(((now or datetime.now(timezone.utc)) - then).total_seconds()))
    for size, word in ((86400, "day"), (3600, "hour"), (60, "minute")):
        if seconds >= size:
            count = seconds // size
            return f"{count} {word}{'s' if count != 1 else ''} ago"
    return "just now"


def paused_line(row: Paused, now: Optional[datetime] = None) -> str:
    """One paused session as the start offers it."""
    title = row.title[:60] or "(no title)"
    return " · ".join(
        part
        for part in (
            f"{'Agent' if row.kind == 'agent' else 'Application'} session",
            row.agent,
            f"“{title}”",
            "on this machine" if row.where == ON_THIS_MACHINE else "on Datalayer",
            f"started {_ago(row.started_at, now)}" if _ago(row.started_at, now) else "",
        )
        if part
    )


def choose_paused(
    rows: List[Paused],
    *,
    ask: Optional[Callable[..., Optional[str]]] = None,
    now: Optional[datetime] = None,
) -> Optional[Paused]:
    """The paused session the person goes on with, or ``None`` for a new one.

    With none `loop` can resume, nobody is asked. The five most recent
    agent sessions are offered, *Start a new session* first and chosen by
    Enter; the rest — more of them, and the applications' paused sessions,
    resumed at their address — are counted, with where they are listed.
    """
    resumable = [row for row in rows if row.resumable]
    if not resumable:
        return None
    from agent_runtimes.loop.launch import _select

    offered = resumable[:OFFERED]
    more = len(rows) - len(offered)
    choices: List[Tuple[Any, ...]] = [(NEW_SESSION, "")]
    for row in offered:
        choices.append((f"Resume: {paused_line(row, now)}", row.uid))
    count = len(rows)
    shown = (
        f"the {len(offered)} most recent of your agents'"
        if len(resumable) > len(offered)
        else "your agents' shown"
    )
    question = (
        f"You have {count} paused session{'s' if count != 1 else ''}"
        + (f" ({shown}; {more} more: /sessions)" if more else "")
        + ". Go on with one, or start a new one?"
    )
    answer = (ask or _select)(question, choices, "")
    if answer is None:
        raise KeyboardInterrupt
    return next((row for row in offered if row.uid == answer), None)


__all__ = [
    "NEW_SESSION",
    "OFFERED",
    "ON_DATALAYER",
    "ON_THIS_MACHINE",
    "Paused",
    "choose_paused",
    "local_paused",
    "paused_line",
    "paused_of",
    "paused_sessions",
    "record_paused",
    "resume_plan",
]
