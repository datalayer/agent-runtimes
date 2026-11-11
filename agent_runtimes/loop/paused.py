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

What `loop` resumes from a terminal:

- **an agent's session**: its agent is started, here or on Datalayer;
- **an application's session that is a Preview** — the person trying an
  application, a catalogue's or their own in the Studio, with no deployment:
  the application is started as `loop apps run` starts it, from the
  catalogue's Appspec or the one the Studio keeps, and the session resumed.

What it does not, listed all the same with the reason and where to open it:

- **a session of somebody else's deployment**: a terminal starts a runtime
  for a deployment of its owner's only; it is gone on with at its address;
- **a seat of a team run**: resumed with its run (`loop teams resume`).

A session of **one of the person's own deployments** is resumed from here
too: a runtime is launched on Datalayer for the deployment, its agent made
as its page makes it (its Appspec and the instance it runs), so the runtime
lets the person in as the deployment decides and acts as its principal.

The platform's list failing — offline, a key
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

#: How many of those `loop` does not resume are drawn beside them, with why
#: and where they are opened.
NOT_RESUMED_SHOWN = 3

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
    app_uid: str = ""
    """The application its record names: a catalogue's id, the Studio's uid, or ``agent:<agentspec>``."""
    app_name: str = ""
    """An application's name, when the catalogue or the person's deployments say it."""
    deployment_uid: str = ""
    """The deployment it is a session of, or ``""`` for a Preview and an agent's."""
    why_not: str = ""
    """Why `loop` does not resume it, in a sentence; ``""`` when it does."""
    address: str = ""
    """Where one `loop` does not resume is opened instead."""

    @property
    def resumable(self) -> bool:
        """Whether `loop` resumes it from the terminal."""
        return not self.why_not and bool(
            self.agent if self.kind == "agent" else self.app_uid
        )


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
    application: str = ""
    """For an application's session, the application to start (its uid in
    the record); ``""`` for an agent's, whose agentspec is started."""
    deployment: str = ""
    """For a deployment's session, the deployment a runtime is launched for."""


def resume_plan(row: Paused) -> ResumePlan:
    """A paused session resumed where it lives."""
    return ResumePlan(
        uid=row.uid,
        agent=row.agent,
        cloud=row.where == ON_DATALAYER,
        session_store=FILE if row.store == FILE else "",
        application=row.app_uid if row.kind == "application" else "",
        deployment=row.deployment_uid,
    )


#: Where Datalayer serves an application's address.
SITE = "https://datalayer.ai"

DEPLOYMENT_WHY_NOT = (
    "a session of somebody else's deployment: a terminal starts a runtime for a "
    "deployment of its owner's only"
)
TEAM_WHY_NOT = "a seat of a team run, resumed with its run: loop teams resume"


def _where_of(session: Mapping[str, Any]) -> str:
    runs_on = session.get("runs_on") or {}
    on_own = runs_on.get("kind") == "runtime" and runs_on.get("uid") == "local"
    return ON_THIS_MACHINE if on_own or not runs_on else ON_DATALAYER


def catalogue_names() -> Dict[str, str]:
    """The catalogue's applications, by id: their names."""
    from agentspecs.apps import load_raw_apps

    return {
        str(app_id): str(document.get("name") or app_id)
        for app_id, document in load_raw_apps().items()
    }


def paused_of(
    sessions: List[Mapping[str, Any]],
    store: str,
    deployments: Optional[Mapping[str, Mapping[str, Any]]] = None,
    names: Optional[Mapping[str, str]] = None,
) -> List[Paused]:
    """The paused sessions among described ones, as a store lists them.

    ``deployments`` are the person's, by uid (their application's name, their
    address); ``names`` the catalogue's applications' names by id.
    """
    deployments = deployments or {}
    names = catalogue_names() if names is None else names
    rows: List[Paused] = []
    for session in sessions:
        if session.get("state") != "paused" or session.get("archived"):
            continue
        instance = session.get("instance") or {}
        app_uid = str(session.get("app_uid") or instance.get("app_uid") or "")
        deployment_uid = str(
            session.get("deployment_uid") or instance.get("deployment_uid") or ""
        )
        kind = session_kind(app_uid)
        runs_on = session.get("runs_on") or {}
        deployment = deployments.get(deployment_uid) or {}
        why_not = address = ""
        if runs_on.get("kind") == "team_run":
            why_not = TEAM_WHY_NOT
            address = f"{SITE}/executions/{runs_on.get('execution_id') or ''}"
        elif kind == "application" and deployment_uid:
            # One of the person's own is resumed from here, on a runtime
            # launched for it; somebody else's at its address.
            if not deployment:
                why_not = DEPLOYMENT_WHY_NOT
            slug = str(deployment.get("slug") or "")
            if slug and deployment.get("target") == "hosted":
                address = f"{SITE}/apps/{slug}?thread={session.get('uid') or ''}"
        app_name = ""
        if kind == "application":
            app_name = (
                str(deployment.get("app_name") or "")
                or names.get(app_uid, "")
                or str((session.get("app") or {}).get("name") or "")
            )
        rows.append(
            Paused(
                uid=str(session.get("uid") or ""),
                kind=kind,
                agent=str(session.get("agent") or ""),
                title=str(session.get("title") or ""),
                # What is kept in files on this machine ran on this machine.
                # A deployment's lives on Datalayer, whatever ran it last.
                where=ON_THIS_MACHINE
                if store == FILE
                else ON_DATALAYER
                if deployment_uid
                else _where_of(session),
                store=store,
                started_at=str(session.get("started_at") or ""),
                turns=int(session.get("turns") or 0),
                app_uid=app_uid,
                app_name=app_name,
                deployment_uid=deployment_uid,
                why_not=why_not,
                address=address,
            )
        )
    return rows


def local_paused(
    store: Any = None, names: Optional[Mapping[str, str]] = None
) -> List[Paused]:
    """The paused sessions kept in files on this machine."""
    from agent_runtimes.apps.session_store import FileSessionStore

    files = store or FileSessionStore()
    page = asyncio.run(files.list({"kind": "local"}, state="paused", limit=READ))
    return paused_of(page.sessions, FILE, None, names)


async def _ask_the_record(token: str) -> Dict[str, Any]:
    """The person's paused sessions in the platform's record and their
    deployments, asked with their token: ``{sessions, deployments}``.
    """
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.apps.callers import VERIFIER
    from agent_runtimes.apps.session_store import _list_sessions

    person = await VERIFIER.verify(token, "")
    answered = await _list_sessions(
        token, {"opened_by": person.uid, "state": "paused", "limit": READ}
    )
    sessions = [dict(item) for item in answered.get("sessions") or []]
    deployments: List[Dict[str, Any]] = []
    if any(session.get("deployment_uid") for session in sessions):
        # Their applications' names and addresses, for what is opened there.
        url = getattr(DatalayerURLs.from_environment(), "ai_agents_url", "") or ""
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{url.rstrip('/')}/api/ai-agents/v1/apps/deployments",
                headers={"Authorization": f"Bearer {token}"},
            )
        if response.status_code < 300:
            deployments = list((response.json() or {}).get("deployments") or [])
    return {"sessions": sessions, "deployments": deployments}


def record_paused(
    token: str,
    asker: Optional[Callable[[str], Dict[str, Any]]] = None,
    names: Optional[Mapping[str, str]] = None,
) -> List[Paused]:
    """The person's paused sessions in the platform's record.

    Raises
    ------
    Exception
        Whatever kept the record from answering: `paused_sessions` says it
        in a line and goes on.
    """
    answered = asker(token) if asker else asyncio.run(_ask_the_record(token))
    deployments = {
        str(deployment.get("uid") or ""): deployment
        for deployment in answered.get("deployments") or []
    }
    return paused_of(list(answered.get("sessions") or []), RECORD, deployments, names)


def paused_sessions(
    *,
    token: str = "",
    store: Any = None,
    asker: Optional[Callable[[str], Dict[str, Any]]] = None,
    say: Callable[[str], None] = print,
    names: Optional[Mapping[str, str]] = None,
) -> List[Paused]:
    """Every paused session the person may go on with, newest first: those
    on this machine and, with a token, those of the platform's record. Not
    signed in, the local ones only; the record failing is said in a line.
    """
    names = catalogue_names() if names is None else names
    rows = local_paused(store, names)
    if token:
        try:
            known = {row.uid for row in rows}
            rows += [
                row
                for row in record_paused(token, asker, names)
                if row.uid not in known
            ]
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
            # An agent's by its agentspec; an application's by its name.
            row.agent if row.kind == "agent" else (row.app_name or row.app_uid),
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

    With none paused, nobody is asked. The five most recent are offered,
    those `loop` resumes first, *Start a new session* before them and
    chosen by Enter. One it does not resume from a terminal is drawn too,
    not to be picked, with why and where it is opened instead. The rest are
    counted, with where they are listed.
    """
    if not rows:
        return None
    from agent_runtimes.loop.launch import _select

    # What can be gone on with here first, then the most recent of what is
    # opened elsewhere: never only counted.
    offered = [row for row in rows if row.resumable][:OFFERED] + [
        row for row in rows if not row.resumable
    ][:NOT_RESUMED_SHOWN]
    more = len(rows) - len(offered)
    choices: List[Tuple[Any, ...]] = [(NEW_SESSION, "")]
    for row in offered:
        line = paused_line(row, now)
        if row.resumable:
            choices.append((f"Resume: {line}", row.uid))
        else:
            where = f": open {row.address}" if row.address else ""
            choices.append((line, row.uid, f"{row.why_not}{where}"))
    count = len(rows)
    question = (
        f"You have {count} paused session{'s' if count != 1 else ''}"
        + (f" ({len(offered)} shown; {more} more: /sessions)" if more else "")
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
    "DEPLOYMENT_WHY_NOT",
    "TEAM_WHY_NOT",
    "catalogue_names",
    "resume_plan",
]
