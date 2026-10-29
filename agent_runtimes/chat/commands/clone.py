# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /clone [turn] - Clone this session from a turn (MH-18)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from agent_runtimes.loop.commands import CommandArgSpec

from .sessions_shared import NOT_A_SESSION, ask, current_uid

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "clone"
ALIASES: list[str] = []
DESCRIPTION = "Clone this session from a turn: a new session, paused"
SHORTCUT = None
GROUP = "Session"
ARGS = (
    CommandArgSpec(name="turn", description="The turn to cut at; the last one unsaid"),
)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Clone through the session route; say the new id and how to resume it."""
    uid = current_uid(tux)
    if not uid:
        tux.console.print(f"[red]{NOT_A_SESSION}[/red]")
        return None
    at: Optional[int] = None
    if (argv or "").strip():
        try:
            at = int(argv.strip())
        except ValueError:
            tux.console.print("  /clone [<turn>]: the turn is a number.")
            return None
    try:
        answer = ask(
            tux,
            "POST",
            f"/{uid}/clone",
            json={"up_to_turn": at, "agent": None, "title": ""},
        ).json()
    except (RuntimeError, OSError) as refused:
        tux.console.print(f"[red]{refused}[/red]")
        return None
    tux.console.print(
        f"Cloned as {answer['uid']} (paused, {answer['turns']} turn{'s' if answer['turns'] != 1 else ''}). "
        f"/resume {answer['uid']} opens it.",
        markup=False,
    )
    return None
