# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /swap <agent> - Swap this session's agent in place (MH-18)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

from agent_runtimes.loop.commands import CommandArgSpec
from agent_runtimes.loop.session import LoopRefused

from .sessions_shared import NOT_A_SESSION, current_uid, session_of

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "swap"
ALIASES: list[str] = []
DESCRIPTION = "Swap this session's agent in place; the new agent is told in a sentence"
SHORTCUT = None
GROUP = "Session"
ARGS = (CommandArgSpec(name="agent", description="The agentspec to go on with"),)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Swap through the session route; say the sentence the new agent is told."""
    agent = (argv or "").strip()
    if not agent:
        tux.console.print("  /swap <agent>")
        return None
    if not current_uid(tux):
        tux.console.print(f"[red]{NOT_A_SESSION}[/red]")
        return None
    session = session_of(tux)
    try:
        session.with_agent(agent)
    except LoopRefused as refused:
        tux.console.print(f"[red]{refused}[/red]")
        return None
    tux.agent_id = session.agent_id
    tux.console.print(f'{session.agent_id} is told: "{session.said}"', markup=False)
    tux.console.print(f"Swapped. {session.agent_id} answers from here.", markup=False)
    return None
