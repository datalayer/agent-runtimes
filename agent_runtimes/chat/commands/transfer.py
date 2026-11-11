# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /transfer - Move this session between this machine and
Datalayer, under the same uid, and go on with it where it was sent."""

from __future__ import annotations

import atexit
import os
import sys
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional

from agent_runtimes.loop.commands import CommandArgSpec

from .pause import remembered_line
from .sessions_shared import NOT_A_SESSION, ask, current_uid

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "transfer"
ALIASES: list[str] = []
DESCRIPTION = (
    "Move this session to Datalayer, or from Datalayer to this machine: the same "
    "uid, the conversation carried, and the prompt goes on with it there"
)
SHORTCUT = None
GROUP = "Sessions"
ARGS = (
    CommandArgSpec(
        name="to",
        description="cloud or local: the other place, when it is not said",
    ),
    CommandArgSpec(name="--yes", description="Do not ask before it is sent"),
)

#: What goes on with the session once the prompt has ended, for a test to read.
GO_ON: Dict[str, List[str]] = {}


def go_on_command(uid: str) -> List[str]:
    """`loop --resume <uid>`: the session resumed where it lives now."""
    return ["--resume", uid]


def _go_on_at_exit(arguments: List[str]) -> None:
    """Once the prompt has ended and its runtime is stopped or given back,
    this process becomes `loop --resume <uid>`."""
    atexit.register(lambda: os.execvp(sys.argv[0], [sys.argv[0], *arguments]))


async def execute(
    tux: "CliTux",
    argv: str = "",
    *,
    mover: Optional[Callable[..., Any]] = None,
    confirm: Optional[Callable[[str], Any]] = None,
    token: Optional[str] = None,
    go_on: Optional[Callable[[List[str]], None]] = None,
) -> Optional[str]:
    """Pause this session, move it to the other place under its uid, end the
    prompt, and go on with it there."""
    from agent_runtimes.loop.paused import ON_DATALAYER, ON_THIS_MACHINE
    from agent_runtimes.loop.transfer import SAID, TransferRefused, places, transfer

    words = (argv or "").split()
    yes = "--yes" in words or "-y" in words
    named = [word for word in words if not word.startswith("-")]
    uid = current_uid(tux)
    if not uid:
        tux.console.print(NOT_A_SESSION, markup=False)
        return None
    here = ON_DATALAYER if getattr(tux, "cloud_runtime", None) else ON_THIS_MACHINE
    to = ON_THIS_MACHINE if here == ON_DATALAYER else ON_DATALAYER
    if named and named[0] != to:
        tux.console.print(
            f"This session is on {SAID[here]}: it is transferred to {SAID[to]} (`/transfer {to}`).",
            markup=False,
        )
        return None
    if token is None:
        from agent_runtimes.commands.sessions import _token

        token = _token()
    try:
        source, destination = places(to, token)
    except TransferRefused as refused:
        tux.console.print(f"[red]{refused}[/red]")
        return None

    async def asked(question: str) -> bool:
        if yes:
            return True
        if confirm is not None:
            return bool(confirm(question))
        import questionary

        return bool(await questionary.confirm(question, default=False).ask_async())

    # Asked before anything is paused or sent: what leaves, in one sentence.
    if not await asked(
        f"Transfer this session ({uid}) to {SAID[to]}? Its conversation and its record are sent, credentials "
        "redacted as an export redacts them; the files it was given are named, their contents are not sent. "
        "It is paused first, keeps its uid, and is ended here."
    ):
        tux.console.print("Not transferred: nothing was sent.", markup=False)
        return None
    try:
        # Paused first: what runs is stopped, and the conversation is given
        # to the agent's memory when it has one.
        paused = ask(tux, "POST", f"/{uid}/stop").json()
    except (RuntimeError, OSError) as refused:
        tux.console.print(f"[red]{refused}[/red]")
        return None
    said = remembered_line(paused.get("remembered") or {})
    if said:
        tux.console.print(said, markup=False)
    try:
        done = await (mover or transfer)(uid, source=source, destination=destination)
    except TransferRefused as refused:
        tux.console.print(f"[red]{refused}[/red]")
        tux.console.print(
            f"The session is paused where it was: `/resume {uid}` goes on with it here.",
            markup=False,
        )
        return None
    tux.console.print(done.said, markup=False)
    tux.console.print(
        f"Going on with it on {SAID[to]}: `loop --resume {uid}`.", markup=False
    )
    runtime = getattr(tux, "cloud_runtime", None)
    if runtime:
        # Its runtime on Datalayer is given back as the prompt ends.
        from agent_runtimes.loop.launch import give_back

        give_back(str(runtime))
    client = getattr(tux, "_agui_client", None)
    if client is not None:
        await client.disconnect()
        tux._agui_client = None
    GO_ON["arguments"] = go_on_command(uid)
    (go_on or _go_on_at_exit)(GO_ON["arguments"])
    tux.running = False
    return None
