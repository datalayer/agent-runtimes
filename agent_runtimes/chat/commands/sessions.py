# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /sessions - List your sessions on this runtime: an
application's and an agent's, each saying its kind and its state."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from agent_runtimes.commands.sessions import session_line
from agent_runtimes.loop.commands import CommandArgSpec

from .sessions_shared import ask, current_uid, session_of

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "sessions"
ALIASES: list[str] = []
DESCRIPTION = (
    "List your sessions, numbered: an agent's and an application's, open, paused, ended; "
    "`/sessions <n or uid>` switches the prompt to that one"
)
SHORTCUT = None
GROUP = "Sessions"
ARGS = (
    CommandArgSpec(
        name="session",
        description="A session's number in the list, or its uid: the prompt switches to it",
    ),
    CommandArgSpec(name="--app", description="List one application's, by its id"),
)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """List the caller's sessions, newest first; or, with a session's number
    or uid, switch the prompt to it as `/resume` does."""
    words = (argv or "").split()
    app_id = ""
    if "--app" in words:
        at = words.index("--app")
        app_id = words[at + 1] if at + 1 < len(words) else ""
        words = words[:at] + words[at + 2 :]
    if words:
        # `/sessions 2`, `/sessions <uid>`: the prompt goes on with that
        # session. The one it was on is left as it is, in its record.
        from . import resume

        was = current_uid(tux)
        await resume.execute(tux, " ".join(words))
        now = current_uid(tux)
        if now and now != was:
            tux.console.print(
                f"This prompt is on session {now} now"
                + (
                    f"; {was} is left as it is: `/sessions {was}` comes back to it."
                    if was
                    else "."
                ),
                markup=False,
            )
        return None
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
    # Where they are kept, said first: this runtime lists the sessions of
    # the place it runs in.
    from agent_runtimes.loop.paused import MANAGED

    on_datalayer = bool(getattr(tux, "cloud_runtime", None))
    tux.console.print(
        f"{'On Datalayer' if on_datalayer else 'On this machine'}: {MANAGED[1 if on_datalayer else 0].split(': ', 1)[1]} "
        f"`loop sessions` lists both places; `/transfer` moves this session to the other.",
        markup=False,
        style="dim",
    )
    # Numbered: `/resume 2` goes on with the second.
    listed = session_of(tux)
    if listed is not None:
        listed.extras["listed_sessions"] = [str(s.get("uid") or "") for s in sessions]
    for number, session in enumerate(sessions, 1):
        tux.console.print(f"{number:>2}  {session_line(session)}", markup=False)
    return None
