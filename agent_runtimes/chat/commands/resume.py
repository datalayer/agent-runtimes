# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /resume <uid> - Open this conversation on a session (MH-18)."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Optional

from agent_runtimes.loop.commands import CommandArgSpec

from .sessions_shared import ask, session_of

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "resume"
ALIASES: list[str] = []
DESCRIPTION = "Resume a session here: /swap, /clone and /export then act on it"
SHORTCUT = None
GROUP = "Session"
ARGS = (
    CommandArgSpec(name="uid", description="The session's id (/sessions)"),
    CommandArgSpec(
        name="agent",
        description="Its application's agent, for a session the runtime no longer holds",
    ),
)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Resume the session, replaying its conversation, and make it this conversation's."""
    parts = (argv or "").split()
    if not parts:
        tux.console.print("  /resume <uid> [<agent>]")
        return None
    uid, agent = parts[0], (parts[1] if len(parts) > 1 else "")
    try:
        response = ask(tux, "POST", f"/{uid}/resume", json={"agent": agent})
        described = ask(tux, "GET", f"/{uid}").json()
    except (RuntimeError, OSError) as refused:
        tux.console.print(f"[red]{refused}[/red]")
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
    session = session_of(tux)
    if session is not None:
        session.session_uid = uid
        session.conversation_id = uid
        if described.get("agent"):
            session.agent_id = str(described["agent"])
    tux.console.print(
        f"Resumed {uid} ({described.get('agent')}): {replayed} turn{'s' if replayed != 1 else ''} replayed. "
        "/swap, /clone and /export act on it now.",
        markup=False,
    )
    return None
