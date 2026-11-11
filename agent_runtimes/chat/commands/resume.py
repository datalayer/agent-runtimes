# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /resume <uid> - Go on with a session here, its conversation loaded."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Optional

from agent_runtimes.loop.commands import CommandArgSpec

from .sessions_shared import ask, load_conversation, session_of

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "resume"
ALIASES: list[str] = []
DESCRIPTION = "Resume a session here, its conversation loaded: go on where it stopped"
SHORTCUT = None
GROUP = "Session"
ARGS = (
    CommandArgSpec(name="uid", description="The session's id (/sessions)"),
    CommandArgSpec(
        name="agent",
        description="The agent that runs it here, when it is not this prompt's",
    ),
)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Resume the session, replaying its conversation, and make it this conversation's."""
    parts = (argv or "").split()
    if not parts:
        tux.console.print("  /resume <uid> [<agent>]")
        return None
    session = session_of(tux)
    # A session this runtime no longer holds is rebuilt from its record on
    # the agent named: this prompt's, unless another is.
    uid = parts[0]
    agent = parts[1] if len(parts) > 1 else str(getattr(tux, "agent_id", "") or "")
    try:
        response = ask(tux, "POST", f"/{uid}/resume", json={"agent": agent})
        described = ask(tux, "GET", f"/{uid}").json()
        thread = ask(tux, "GET", f"/{uid}/messages").json()
    except (RuntimeError, OSError) as refused:
        tux.console.print(f"[red]{refused}[/red]")
        if "is not a session of" in str(refused):
            # Another agent's or application's: `loop` starts what it is a
            # session of when it is picked as it starts.
            tux.console.print(
                "Start `loop` with nothing else and pick it among your paused sessions: "
                "its agent, or its application, is started and it is resumed there.",
                markup=False,
            )
        return None
    replayed = 0
    for block in response.text.split("\n\n"):
        data = "".join(
            line[len("data:") :].strip()
            for line in block.splitlines()
            if line.startswith("data:")
        )
        if not data:
            continue
        try:
            event = json.loads(data)
        except ValueError:
            continue
        if event.get("type") == "MESSAGES_SNAPSHOT":
            replayed += sum(
                1 for m in event.get("messages") or [] if m.get("role") == "user"
            )
    if session is not None:
        session.session_uid = uid
        session.conversation_id = uid
        if described.get("agent"):
            session.agent_id = str(described["agent"])
    # The prompt goes on with it: its next message is the session's next
    # turn, sent with the conversation so far.
    await load_conversation(tux, uid, thread.get("messages") or [])
    tux.console.print(
        f"Resumed {uid} ({described.get('agent')}): {replayed} turn{'s' if replayed != 1 else ''} replayed. "
        "Your next message goes on with it; /pause, /swap, /clone and /export act on it.",
        markup=False,
    )
    return None
