# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sessions `loop` lists: the paused ones it offers to resume as it
starts, and every one of them for `loop sessions`.

A session lives in one of two places, and is listed under it:

- **On this machine**: a folder of ``~/.datalayer/sessions/``, named by the
  session's uid. Kept until it is deleted, seen only here, resumed by a
  runtime on this machine.
- **On Datalayer**: in the record of the person's Datalayer account. Seen
  on the web, in the desktop app and from any machine signed in, resumed on
  a runtime Datalayer launches. Signed out, these are not listed.

A session has one uid for its whole life, wherever it lives; `transfer`
moves it from one place to the other under the same uid.

As it starts, `loop` draws the screen `loop sessions` draws (its picker,
`agent_runtimes.loop.picker`), its launch rows first — *Start a new
session*, on this machine or on Datalayer when where it runs is still to be
asked, highlighted — and under them the same sessions in the same two
groups, *On this machine* first. One picked is resumed where it lives, its
conversation loaded, as `loop --resume <uid>` resumes it. With no session
listed nothing is drawn and the usual questions follow.

What `loop` resumes from a terminal:

- **an agent's session**: its agent is started, here or on Datalayer;
- **an application's session that is a Preview** — the person trying an
  application, a catalogue's or their own in the Studio, with no deployment:
  the application is started as `loop apps run` starts it, from the
  catalogue's Appspec or the one the Studio keeps, and the session resumed.

A **seat of a team run** is offered too: its session goes on with its run,
so picking it lets the paused run go on, as `agent-teams sessions resume
<run>` does (`resume_team_run`), and each seat's session with it. A run that
is not paused, or ended, says so in the command's own sentence.

What it does not, listed all the same with the reason and where to open it:

- **a session of somebody else's deployment**: a terminal starts a runtime
  for a deployment of its owner's only; it is gone on with at its address.

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
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple

from agent_runtimes.apps.record import session_kind

#: How many are read to say how many more there are.
READ = 50

#: Where a session lives.
ON_THIS_MACHINE = "local"
ON_DATALAYER = "cloud"

#: The store a session on this machine is kept in.
FILE = "file"
RECORD = "record"


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
    state: str = "paused"
    """``open``, ``paused`` or ``ended``."""
    team_run: str = ""
    """For a seat of a team run, its run (the root execution): resumed with it."""
    deployment_paused: bool = False
    """Whether it is a session of one of the person's own deployments that is
    paused: resuming it asks first to resume the deployment. Not shown in a
    listing, whose State says the session's state alone."""
    runs_on: str = ""
    """What its record says it runs on: ``runtime``, ``agentcore``, ``team_run``, or ``""``."""
    runs_on_id: str = ""
    """The runtime's uid (``local`` for one started by hand), or AgentCore's ARN."""

    @property
    def resumable(self) -> bool:
        """Whether `loop` resumes it from the terminal."""
        return not self.why_not and bool(
            self.team_run or (self.agent if self.kind == "agent" else self.app_uid)
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
    team_run: str = ""
    """For a seat of a team run, the run that is let go on: nothing is started here."""


def resume_plan(row: Paused) -> ResumePlan:
    """A paused session resumed where it lives."""
    # An agent's session names its agentspec in its application's uid; the
    # agent of its record is the one its runtime called it by.
    agent = (
        row.app_uid[len("agent:") :]
        if row.kind == "agent" and row.app_uid.startswith("agent:")
        else row.agent
    )
    return ResumePlan(
        uid=row.uid,
        agent=agent,
        cloud=row.where == ON_DATALAYER,
        session_store=FILE if row.store == FILE else "",
        application=row.app_uid
        if row.kind == "application" and not row.team_run
        else "",
        deployment=row.deployment_uid,
        team_run=row.team_run,
    )


def team_resume_command(execution_id: str) -> str:
    """The command that lets a paused team run go on."""
    return f"agent-teams sessions resume {execution_id}"


class TeamResumeUnavailable(Exception):
    """The team commands are not installed here: said with the command to run where they are."""


def resume_team_run(
    execution_id: str, run: Optional[Callable[[List[str]], Any]] = None
) -> int:
    """Let a paused team run go on, and each seat's session with it: what
    `agent-teams sessions resume <execution>` does, run here. The command
    says what it did, or why not (a run that is open, or ended) in its own
    sentence; its exit code is answered.

    Raises
    ------
    TeamResumeUnavailable
        The team commands, or what they ask Datalayer with, are not installed.
    """
    import click

    if run is None:
        try:
            from agent_teams.sessions_commands import sessions_app
        except ImportError as missing:
            raise TeamResumeUnavailable(
                f"The team commands are not installed here ({missing}): install "
                f"agent-teams[datalayer], or run `{team_resume_command(execution_id)}` where they are."
            ) from None

        def run(arguments: List[str]) -> Any:
            return sessions_app(
                args=arguments,
                prog_name="agent-teams sessions",
                standalone_mode=False,
            )

    try:
        # Not standalone, a command that exits answers its code.
        code = run(["resume", execution_id])
    except click.exceptions.Exit as done:
        return int(done.exit_code or 0)
    except click.ClickException as refused:
        refused.show()
        return int(refused.exit_code or 1)
    return code if isinstance(code, int) else 0


#: Where Datalayer serves an application's address.
SITE = "https://datalayer.ai"

DEPLOYMENT_WHY_NOT = (
    "a session of somebody else's deployment: a terminal starts a runtime for a "
    "deployment of its owner's only"
)
AGENT_WHY_NOT = (
    "a session of the agent {agent}, which is no longer an agentspec of the catalogue: "
    "a runtime on Datalayer cannot start it — clone it onto another agent to go on"
)


def agentspec_in_catalogue(agent: str) -> bool:
    """Whether an agentspec is one of the catalogue's."""
    from agent_runtimes.specs.agents.agents import get_agent_spec

    return bool(agent) and get_agent_spec(agent) is not None


TEAM_WHY_NOT = (
    "a seat of a team run whose run the record does not name: it is resumed "
    "with its run, agent-teams sessions resume <run>"
)


#: What the two places are called, wherever sessions are listed.
PLACE_TITLES = {ON_THIS_MACHINE: "On this machine", ON_DATALAYER: "On Datalayer"}

#: How the sessions of each place are managed, in a sentence: said under the
#: place's title by the picker and by `loop sessions` printed.
MANAGED_BY_PLACE = {
    ON_THIS_MACHINE: "A session is a folder of ~/.datalayer/sessions, named by its uid, "
    "kept until you delete it, seen only here and resumed by a runtime on this machine.",
    ON_DATALAYER: "A session is in your Datalayer account's record, seen on the web, in the "
    "desktop app and from any machine signed in, and resumed on a runtime Datalayer launches. "
    "Signed out, only the sessions on this machine are listed.",
}

#: The same, each sentence naming its place: said by `/sessions` and by
#: `loop sessions --help`, where no title stands above it.
MANAGED = tuple(
    f"{PLACE_TITLES[place]}: {sentence[0].lower()}{sentence[1:]}"
    for place, sentence in MANAGED_BY_PLACE.items()
)

#: A choice that is a group's title, not to be picked.
SEPARATOR = "\x00separator"


def catalogue_names() -> Dict[str, str]:
    """The catalogue's applications, by id: their names."""
    from agentspecs.apps import load_raw_apps

    return {
        str(app_id): str(document.get("name") or app_id)
        for app_id, document in load_raw_apps().items()
    }


def paused_of(
    sessions: Sequence[Mapping[str, Any]],
    store: str,
    deployments: Optional[Mapping[str, Mapping[str, Any]]] = None,
    names: Optional[Mapping[str, str]] = None,
    states: Tuple[str, ...] = ("paused",),
    in_catalogue: Optional[Callable[[str], bool]] = None,
) -> List[Paused]:
    """The sessions among described ones, as a store lists them: the paused
    ones, unless other ``states`` are named.

    ``deployments`` are the person's, by uid (their application's name, their
    address, whether it is paused); ``names`` the catalogue's applications'
    names by id; ``in_catalogue`` says whether an agentspec is one of the
    catalogue's (what a runtime on Datalayer can start).
    """
    deployments = deployments or {}
    names = catalogue_names() if names is None else names
    in_catalogue = in_catalogue or agentspec_in_catalogue
    rows: List[Paused] = []
    for session in sessions:
        if session.get("state") not in states or session.get("archived"):
            continue
        instance = session.get("instance") or {}
        app_uid = str(session.get("app_uid") or instance.get("app_uid") or "")
        deployment_uid = str(
            session.get("deployment_uid") or instance.get("deployment_uid") or ""
        )
        kind = session_kind(app_uid)
        runs_on = session.get("runs_on") or {}
        deployment = deployments.get(deployment_uid) or {}
        why_not = address = team_run = ""
        if runs_on.get("kind") == "team_run":
            # Resumed with its run, which `loop` lets go on; a seat whose
            # run is not named cannot be.
            team_run = str(runs_on.get("execution_id") or "")
            if team_run:
                address = f"{SITE}/executions/{team_run}"
            else:
                why_not = TEAM_WHY_NOT
        elif kind == "application" and deployment_uid:
            # One of the person's own is resumed from here, on a runtime
            # launched for it; somebody else's at its address.
            if not deployment:
                why_not = DEPLOYMENT_WHY_NOT
            slug = str(deployment.get("slug") or "")
            if slug and deployment.get("target") == "hosted":
                address = f"{SITE}/apps/{slug}?thread={session.get('uid') or ''}"
        elif kind == "agent" and store == RECORD:
            # On Datalayer a runtime starts an agentspec of the catalogue:
            # one that left it cannot be started again.
            spec = (
                app_uid[len("agent:") :]
                if app_uid.startswith("agent:")
                else str(session.get("agent") or "")
            )
            if spec and not in_catalogue(spec):
                why_not = AGENT_WHY_NOT.format(agent=spec)
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
                # It lives where it is kept: in files on this machine, or
                # in the account's record on Datalayer, whatever ran it last.
                where=ON_THIS_MACHINE if store == FILE else ON_DATALAYER,
                store=store,
                started_at=str(session.get("started_at") or ""),
                turns=int(session.get("turns") or 0),
                app_uid=app_uid,
                app_name=app_name,
                deployment_uid=deployment_uid,
                why_not=why_not,
                address=address,
                state=str(session.get("state") or ""),
                team_run=team_run,
                runs_on=str(runs_on.get("kind") or ""),
                runs_on_id=str(runs_on.get("uid") or runs_on.get("arn") or ""),
                # One of the person's own, paused: its owner resumes it, so
                # the session stays listed, and resuming it asks first.
                deployment_paused=bool(deployment)
                and str(deployment.get("state") or "live") == "paused",
            )
        )
    return rows


def local_paused(
    store: Any = None,
    names: Optional[Mapping[str, str]] = None,
    states: Tuple[str, ...] = ("paused",),
) -> List[Paused]:
    """The sessions kept in files on this machine: the paused ones, unless
    other ``states`` are named.
    """
    from agent_runtimes.apps.local_rule import reconciled
    from agent_runtimes.apps.session_store import FileSessionStore

    files = store or FileSessionStore()
    described = files.described()
    if hasattr(files, "write"):
        # As the rule says them (`local_rule`): a seat whose local run is
        # over is ended, an open one whose process is gone is paused.
        described = reconciled(files, described)
    return paused_of(described, FILE, None, names, states)


async def _ask_the_record(token: str, state: str = "paused") -> Dict[str, Any]:
    """The person's sessions in the platform's record — the paused ones, or
    every state with ``""`` — and their deployments, asked with their
    token: ``{sessions, deployments}``.
    """
    import httpx
    from datalayer_core.utils.urls import DatalayerURLs

    from agent_runtimes.apps.callers import VERIFIER
    from agent_runtimes.apps.session_store import _list_sessions

    person = await VERIFIER.verify(token, "")
    answered = await _list_sessions(
        token, {"opened_by": person.uid, "state": state, "limit": READ}
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
    states: Tuple[str, ...] = ("paused",),
) -> List[Paused]:
    """The person's sessions in the platform's record: the paused ones,
    unless other ``states`` are named.

    Raises
    ------
    Exception
        Whatever kept the record from answering: `paused_sessions` says it
        in a line and goes on.
    """
    if asker:
        answered = asker(token)
    else:
        # Unsaid, the record answers the open and the paused ones: the ended
        # are asked for by their state.
        only = states[0] if len(states) == 1 else ""
        answered = asyncio.run(_ask_the_record(token, only))
        if not only and "ended" in states:
            ended = asyncio.run(_ask_the_record(token, "ended"))
            known = {session.get("uid") for session in answered["sessions"]}
            answered = {
                "sessions": answered["sessions"]
                + [s for s in ended["sessions"] if s.get("uid") not in known],
                "deployments": answered["deployments"]
                + [
                    d
                    for d in ended["deployments"]
                    if d.get("uid")
                    not in {one.get("uid") for one in answered["deployments"]}
                ],
            }
    deployments = {
        str(deployment.get("uid") or ""): deployment
        for deployment in answered.get("deployments") or []
    }
    return paused_of(
        list(answered.get("sessions") or []), RECORD, deployments, names, states
    )


def paused_sessions(
    *,
    token: str = "",
    store: Any = None,
    asker: Optional[Callable[[str], Dict[str, Any]]] = None,
    say: Callable[[str], None] = print,
    names: Optional[Mapping[str, str]] = None,
    states: Tuple[str, ...] = ("paused",),
) -> List[Paused]:
    """Every paused session the person may go on with, newest first: those
    on this machine and, with a token, those of the platform's record. Not
    signed in, the local ones only; the record failing is said in a line.
    Every state with ``states=STATES``: what `loop sessions` lists.

    A session is listed where it lives. One transferred is ended where it
    was, and lives where it went, under the same uid: both are listed, each
    in its place and its state.
    """
    names = catalogue_names() if names is None else names
    rows = local_paused(store, names, states)
    if token:
        try:
            rows += record_paused(token, asker, names, states)
        except Exception as refused:  # noqa: BLE001 - said, never fatal to the start
            say(
                f"Your sessions on Datalayer could not be listed ({str(refused)[:160]}): going on without them."
            )
    return sorted(rows, key=lambda row: row.started_at, reverse=True)


#: Every state a session has, for a listing of all of them.
STATES = ("open", "paused", "ended")

#: What is listed unless more is asked: the sessions that run (``open``) and
#: those that can be gone on with (``paused``).
LISTED_STATES = ("open", "paused")


def is_listed(row: Paused) -> bool:
    """Whether a session is listed by default: it runs, or it can be gone on
    with — from here, or at the address it is opened at. An ended one is
    not (it is cloned or exported, by its uid), nor a paused one nothing
    resumes (a seat whose run the record does not name).
    """
    if row.state == "open":
        return True
    return row.state == "paused" and (row.resumable or bool(row.address))


def listed(rows: Sequence[Paused]) -> List[Paused]:
    """The sessions among some that are listed by default (`is_listed`),
    each once in its place: a record that answers a session twice lists it
    once (a transferred session is listed in each place, ended in one).
    """
    seen: set[tuple[str, str]] = set()
    kept: List[Paused] = []
    for row in rows:
        if is_listed(row) and (row.uid, row.where) not in seen:
            seen.add((row.uid, row.where))
            kept.append(row)
    return kept


class RunsElsewhere(Exception):
    """An open session that a terminal cannot join where it runs: said in a sentence."""


def joined_runtime(row: Paused, running: Callable[[], Sequence[str]]) -> str:
    """The runtime an open session runs on, to be joined rather than resumed:
    its uid, when it runs on a runtime on Datalayer that ``running`` (the
    names and uids of the person's running runtimes) still lists. ``""``
    for a session that is resumed as a paused one is — not open, kept on
    this machine, or open on a runtime that is gone (the record's rule: an
    open session whose runtime no longer exists is paused).

    Raises
    ------
    RunsElsewhere
        An open session that runs where a terminal cannot join it: a seat of
        a running team run, or a run in AgentCore.
    """
    if row.state != "open" or row.where != ON_DATALAYER:
        return ""
    if row.team_run:
        raise RunsElsewhere(
            f"Session {row.uid} is a seat of team run {row.team_run}, which is running: "
            f"follow it with `agent-teams sessions show {row.team_run}` or at {row.address}; "
            f"once it is paused, `{team_resume_command(row.team_run)}` goes on with it."
        )
    if row.runs_on == "agentcore":
        where = f": open it at {row.address}" if row.address else ""
        raise RunsElsewhere(
            f"Session {row.uid} is running now in AgentCore, where a terminal cannot "
            f"join a run{where}. Once its run ends it is paused, and resumed from here."
        )
    if row.runs_on == "runtime" and row.runs_on_id not in ("", "local"):
        if row.runs_on_id in set(running()):
            return row.runs_on_id
    return ""


def clone_command(row: Paused) -> str:
    """The command that clones a session to go on from it: a team run's
    seat is cloned with its run, any other session by its uid.
    """
    if row.team_run:
        return f"agent-teams sessions clone {row.team_run}"
    if row.app_uid.startswith("team:"):
        return "agent-teams sessions clone <run> (`agent-teams sessions list --all` names its run)"
    return f"loop sessions clone {row.uid}" + (
        " --cloud" if row.where == ON_DATALAYER else ""
    )


def grouped(rows: List[Paused]) -> List[Tuple[str, List[Paused]]]:
    """The rows by where they live, *On this machine* first, each newest first."""
    return [
        (place, [row for row in rows if row.where == place])
        for place in (ON_THIS_MACHINE, ON_DATALAYER)
    ]


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
            # Its uid, the same wherever it lives: what `--resume` takes.
            row.uid,
            f"started {_ago(row.started_at, now)}" if _ago(row.started_at, now) else "",
        )
        if part
    )


__all__ = [
    "ON_DATALAYER",
    "ON_THIS_MACHINE",
    "Paused",
    "local_paused",
    "paused_line",
    "paused_of",
    "paused_sessions",
    "record_paused",
    "AGENT_WHY_NOT",
    "DEPLOYMENT_WHY_NOT",
    "agentspec_in_catalogue",
    "MANAGED",
    "MANAGED_BY_PLACE",
    "PLACE_TITLES",
    "SEPARATOR",
    "LISTED_STATES",
    "STATES",
    "TEAM_WHY_NOT",
    "clone_command",
    "joined_runtime",
    "RunsElsewhere",
    "is_listed",
    "listed",
    "grouped",
    "TeamResumeUnavailable",
    "catalogue_names",
    "resume_plan",
    "resume_team_run",
    "team_resume_command",
]
