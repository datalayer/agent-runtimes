# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""When a session kept on this machine is over: the rule, for the files.

**A paused session is always resumable**, here as on Datalayer. The platform's
record holds its rule in the services (``datalayer_solr/session_rule.py``),
which this package cannot import: this module is its mirror for the sessions
of ``~/.datalayer/sessions``, **and the two must stay in step** — a case
added to one is added to the other, with the same row in both test tables
(``test_local_rule.py`` here, ``test_session_rule.py`` there).

| The session | On Datalayer (`session_rule`) | On this machine (here) |
| --- | --- | --- |
| a seat of a team run that is over, or that nothing keeps any more | `ended`, by `run` | `ended`, by `run`: the run's file (``~/.datalayer/teams/sessions/<run>.json``) says `ended`, is gone, or says `open` for a process that no longer exists (it crashed) |
| a session of a deployment that was taken down | `ended`, by `deployment` | never kept here: a deployment's sessions are in its owner's record |
| a Preview of a Studio application that was deleted | `ended`, by `application` | not decided here (the Studio is asked signed in; a Preview kept here is of the catalogue or of the Studio, and starts or says why) |
| `open` on a runtime that no longer exists | `paused`, by `record` | `paused`, by `record`: the process that held it (`held_by`, on its ``session`` entry) is gone from this machine |
| a harness that does not bring its own session back (`resume: none`) | left: the session resumes, its harness starts over and says so | the same |

What is not known is left as the record says it: a session opened before
`held_by` was written, or held on another machine, stays `open` (Enter in
the picker resumes it).

The rule is applied as the sessions are read (`reconciled`, called by the
file store's listing and by the picker's first group), which writes the
`paused` or `ended` entry the session lacks. Nothing is deleted.
"""

from __future__ import annotations

import hashlib
import json
import os
import socket
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

#: Where agent-teams keeps a self-hosted team's runs, one file a run.
TEAMS_PATH_VARIABLE = "AGENT_TEAMS_SESSIONS_PATH"
DEFAULT_TEAMS_PATH = Path.home() / ".datalayer" / "teams" / "sessions"

#: The states a session is reconciled from.
LIVE = ("open", "paused")


def this_machine() -> str:
    """The machine a session's file names: a digest of this one's name,
    never the name — a session file is exported and transferred.
    """
    return hashlib.sha256(socket.gethostname().encode()).hexdigest()[:16]


def holder() -> Dict[str, Any]:
    """Who holds a session opened by this process: written on its ``session``
    entry (`held_by`) by a runtime started by hand that keeps its sessions in
    files, so that a listing can tell an open session from one whose process
    is gone.
    """
    return {"pid": os.getpid(), "host": this_machine()}


def process_gone(held_by: Any) -> Optional[bool]:
    """Whether the process that held something is gone from this machine:
    ``None`` when that is not known — nobody said who held it, or it was held
    on another machine.
    """
    if not isinstance(held_by, Mapping):
        return None
    try:
        pid = int(held_by.get("pid") or 0)
    except (TypeError, ValueError):
        return None
    if pid <= 0 or str(held_by.get("host") or "") != this_machine():
        return None
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    except PermissionError:
        return False
    except OSError:
        return None
    return False


def run_of(session: Mapping[str, Any]) -> str:
    """The team run a session is a seat of, or ``""``."""
    runs_on = session.get("runs_on") or {}
    if runs_on.get("kind") != "team_run":
        return ""
    return str(runs_on.get("execution_id") or "")


def team_run(
    execution_id: str, root: Optional[Path] = None
) -> Optional[Dict[str, Any]]:
    """A self-hosted team's run as its file says it, or ``None`` when no file does."""
    folder = root or Path(os.environ.get(TEAMS_PATH_VARIABLE) or DEFAULT_TEAMS_PATH)
    path = folder / f"{execution_id}.json"
    if not execution_id or path.parent != folder or not path.is_file():
        return None
    try:
        row = json.loads(path.read_text())
    except ValueError:
        return None
    return dict(row) if isinstance(row, dict) else None


def why_over(
    session: Mapping[str, Any],
    *,
    runs: Mapping[str, Optional[Mapping[str, Any]]],
    gone: Callable[[Any], Optional[bool]] = process_gone,
) -> Tuple[str, str]:
    """Why a session the files say is ``open`` or ``paused`` is over, and by
    what: ``("", "")`` when it is not. ``runs`` are the team runs asked
    about, by execution id, each as its file says it or ``None`` when no
    file keeps it.
    """
    if session.get("state") not in LIVE:
        return "", ""
    run = run_of(session)
    if not run:
        return "", ""
    row = runs.get(run)
    if row is None:
        return f"Its team run {run} is no longer kept on this machine.", "run"
    state = str(row.get("state") or "")
    if state == "ended":
        return f"Its team run {run} ended.", "run"
    if state == "open" and gone(row.get("held_by")):
        return f"Its team run {run} stopped without ending: its process is gone.", "run"
    return "", ""


def why_not_running(
    session: Mapping[str, Any], *, gone: Callable[[Any], Optional[bool]] = process_gone
) -> str:
    """Why a session the files say is ``open`` is not running, ``""`` when
    it is or when that is not known.
    """
    if session.get("state") != "open" or run_of(session):
        return ""
    if gone(session.get("held_by")):
        return "The process that held it is gone from this machine."
    return ""


def decided(
    sessions: List[Dict[str, Any]],
    *,
    teams_root: Optional[Path] = None,
    gone: Callable[[Any], Optional[bool]] = process_gone,
) -> Dict[str, Tuple[str, str, str]]:
    """What the rule says of some sessions: ``{uid: (state, why, by)}`` for
    each one whose state is not what the files say.
    """
    runs = {
        run: team_run(run, teams_root)
        for run in {run_of(session) for session in sessions} - {""}
    }
    found: Dict[str, Tuple[str, str, str]] = {}
    for session in sessions:
        why, by = why_over(session, runs=runs, gone=gone)
        if why:
            found[str(session["uid"])] = ("ended", why, by)
            continue
        stopped = why_not_running(session, gone=gone)
        if stopped:
            found[str(session["uid"])] = ("paused", stopped, "record")
    return found


def reconciled(
    store: Any,
    sessions: List[Dict[str, Any]],
    *,
    teams_root: Optional[Path] = None,
    gone: Callable[[Any], Optional[bool]] = process_gone,
) -> List[Dict[str, Any]]:
    """Some sessions of a file store as they are answered: each one the rule
    says is over or not running gets its `ended` or `paused` entry in its
    file first (``store.write``), and is answered so.
    """
    found = decided(sessions, teams_root=teams_root, gone=gone)
    if not found:
        return sessions
    answered = []
    for session in sessions:
        said = found.get(str(session.get("uid")))
        if said is None:
            answered.append(session)
            continue
        state, why, by = said
        instance = session.get("instance") or {}
        store.write(
            str(session["uid"]),
            [
                {
                    "kind": state,
                    "summary": why,
                    "payload": {"state": state, "by": by, "why": why},
                }
            ],
            app_uid=str(instance.get("app_uid") or ""),
            version=int(instance.get("version") or 0),
            opened_by=str((session.get("opened_by") or {}).get("uid") or ""),
        )
        answered.append(
            {**session, "state": state, "held": False, "turn": "idle"}
            | ({"runs_on": None} if state == "ended" else {})
        )
    return answered


__all__ = [
    "decided",
    "holder",
    "process_gone",
    "reconciled",
    "run_of",
    "team_run",
    "this_machine",
    "why_not_running",
    "why_over",
]
