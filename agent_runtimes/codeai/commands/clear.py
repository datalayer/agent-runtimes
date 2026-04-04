# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /clear - Clear conversation history."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "clear"
ALIASES = ["reset", "new"]
DESCRIPTION = "Clear conversation history and free up context"
SHORTCUT = "escape c"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Clear conversation history."""
    from ..tux import STYLE_PRIMARY, SessionStats

    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/context-details/reset"
            response = await client.post(url, timeout=10.0)
            response.raise_for_status()
    except Exception as e:
        tux.console.print(f"[red]Error clearing context: {e}[/red]")
        return None

    # Reset local AG-UI client to clear conversation history
    if tux._agui_client is not None:
        await tux._agui_client.disconnect()
        tux._agui_client = None

    tux.stats = SessionStats()
    tux.console.print("● Conversation cleared. Starting fresh.", style=STYLE_PRIMARY)
    return None
