# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /pause - Pause this conversation's session, and leave.

The session is paused on its runtime: what its conversation holds is given
to its agent's memory first, when the agent has one, and its record says
``paused``. The prompt ends: on Datalayer the runtime is given back; on this
machine the server stops with the prompt. The session is resumed from its
record with ``/resume <uid>`` in a new prompt of its agent.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional

from .sessions_shared import ask, current_uid

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "pause"
ALIASES: list[str] = []
DESCRIPTION = (
    "Pause this session and leave: its conversation is kept, /resume goes on with it"
)
SHORTCUT = None
GROUP = "Sessions"

NOTHING_TO_PAUSE = (
    "Nothing to pause: this conversation has no message yet. `/sessions` lists "
    "your sessions, and `/resume <uid>` goes on with one."
)


def remembered_line(remembered: Dict[str, Any]) -> str:
    """What the pause gave the agent's memory, in a sentence; '' without memory."""
    if not remembered:
        return ""
    if remembered.get("refused"):
        return f"Its memory took nothing: {remembered['refused']}"
    saved = int(remembered.get("saved") or 0)
    if not saved:
        return "Its memory had the conversation already."
    return f"Its memory was given {saved} message{'s' if saved != 1 else ''} of the conversation."


def resume_line(tux: "CliTux", uid: str, agent: str) -> str:
    """How the session is gone on with, in a sentence."""
    on_datalayer = bool(getattr(tux, "cloud_runtime", None))
    start = f"loop{' --cloud' if on_datalayer else ''} -a {agent}"
    return (
        f"Resume it: `loop` lists it as it starts; or `{start}`, then `/resume {uid}`."
    )


#: Where a session kept in the platform's record is listed on the web.
WEB_SESSIONS = "https://datalayer.ai/sessions"


def web_line(tux: "CliTux") -> str:
    """Where it is on the web, when it is kept in the platform's record; '' in files."""
    import os

    on_platform = bool(getattr(tux, "cloud_runtime", None)) or bool(
        os.environ.get("DATALAYER_API_KEY")
    )
    return f"On the web: {WEB_SESSIONS}, under Paused sessions." if on_platform else ""


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Pause the session this conversation is, say how to resume it, and end the prompt."""
    uid = current_uid(tux)
    if not uid:
        tux.console.print(NOTHING_TO_PAUSE, markup=False)
        return None
    try:
        paused = ask(tux, "POST", f"/{uid}/stop").json()
    except (RuntimeError, OSError) as refused:
        tux.console.print(f"[red]{refused}[/red]")
        return None
    agent = str(paused.get("agent") or getattr(tux, "agent_id", ""))
    turns = int(paused.get("turns") or 0)
    tux.console.print(
        f"Paused {uid} ({agent}, {turns} turn{'s' if turns != 1 else ''}): it is kept in the record.",
        markup=False,
    )
    said = remembered_line(paused.get("remembered") or {})
    if said:
        tux.console.print(said, markup=False)
    tux.console.print(resume_line(tux, uid, agent), markup=False)
    web = web_line(tux)
    if web:
        tux.console.print(web, markup=False)
    runtime = getattr(tux, "cloud_runtime", None)
    if runtime:
        # Its runtime is given back as the prompt ends, without asking.
        from agent_runtimes.loop.launch import give_back

        give_back(str(runtime))
    client = getattr(tux, "_agui_client", None)
    if client is not None:
        await client.disconnect()
        tux._agui_client = None
    tux.running = False
    return None
