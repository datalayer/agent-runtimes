# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /exit - Exit the agent-runtimes CLI assistant."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "exit"
ALIASES = ["quit", "q"]
DESCRIPTION = "Exit loop"
SHORTCUT = "escape q"


async def execute(tux: "CliTux") -> Optional[str]:
    """Exit the application."""
    from ..banner import print_goodbye

    # A session open as the prompt leaves is not lost: its runtime pauses it
    # as it stops, and it is listed, and resumed, from there.
    uid = getattr(getattr(tux, "session", None), "session_uid", None)
    if uid:
        tux.console.print(
            f"Session {uid} is kept: paused as its runtime stops. `loop` lists it as it "
            f"starts, and `/resume {uid}` goes on with it.",
            markup=False,
        )
    tux.running = False

    # Clean up AG-UI client
    if tux._agui_client is not None:
        await tux._agui_client.disconnect()
        tux._agui_client = None

    print_goodbye(tux.console)
    return None
