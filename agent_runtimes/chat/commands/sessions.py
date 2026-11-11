# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /sessions - List your sessions on this runtime: an
application's and an agent's, each saying its kind and its state."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from agent_runtimes.commands.sessions import session_line
from agent_runtimes.loop.commands import CommandArgSpec

from .sessions_shared import ask, session_of

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "sessions"
ALIASES: list[str] = []
DESCRIPTION = (
    "List your sessions, numbered: an agent's and an application's, open, paused, ended"
)
SHORTCUT = None
GROUP = "Sessions"
ARGS = (CommandArgSpec(name="app", description="One application's, by its id"),)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """List the caller's sessions, newest first."""
    app_id = (argv or "").strip()
    try:
        answer = ask(tux, "GET", "", params={"app": app_id} if app_id else None).json()
    except (RuntimeError, OSError) as refused:
        tux.console.print(f"[red]{refused}[/red]")
        return None
    sessions = answer.get("sessions") or []
    if not sessions:
        tux.console.print(
            "No session yet." if not app_id else f"No session of {app_id} yet."
        )
        return None
    # Numbered: `/resume 2` goes on with the second.
    listed = session_of(tux)
    if listed is not None:
        listed.extras["listed_sessions"] = [str(s.get("uid") or "") for s in sessions]
    for number, session in enumerate(sessions, 1):
        tux.console.print(f"{number:>2}  {session_line(session)}", markup=False)
    return None
