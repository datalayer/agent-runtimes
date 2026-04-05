# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /exit - Exit the agent-runtimes CLI assistant."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "exit"
ALIASES = ["quit", "q"]
DESCRIPTION = "Exit agent-runtimes chat"
SHORTCUT = "escape q"


async def execute(tux: "CliTux") -> Optional[str]:
    """Exit the application."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED
    from ..banner import GOODBYE_MESSAGE

    tux.running = False

    # Clean up AG-UI client
    if tux._agui_client is not None:
        await tux._agui_client.disconnect()
        tux._agui_client = None

    tux.console.print()
    tux.console.print(GOODBYE_MESSAGE, style=STYLE_ACCENT)
    tux.console.print("   [link=https://datalayer.ai]https://datalayer.ai[/link]", style=STYLE_MUTED)
    tux.console.print()
    return None
