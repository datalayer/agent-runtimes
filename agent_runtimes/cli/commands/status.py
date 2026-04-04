# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /status - Show agent-runtimes CLI status."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "status"
ALIASES: list[str] = []
DESCRIPTION = "Show agent-runtimes cli status including model, tokens, and connectivity"
SHORTCUT = "escape s"


async def execute(tux: "CliTux") -> Optional[str]:
    """Show status information."""
    from ..tux import STYLE_PRIMARY, STYLE_MUTED

    tux.console.print()
    tux.console.print("● Agent Runtimes CLI Status", style=STYLE_PRIMARY)
    tux.console.print()

    # Version
    from .. import __version__
    tux.console.print(f"  Version: {__version__.__version__}", style=STYLE_MUTED)

    # Model
    tux.console.print(f"  Model: {tux.model_name}", style=STYLE_MUTED)

    # Server
    tux.console.print(f"  Server: {tux.server_url}", style=STYLE_MUTED)

    # Connection test
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{tux.server_url}/health", timeout=5.0)
            if response.status_code == 200:
                tux.console.print("  API: [green]Connected[/green]", style=STYLE_MUTED)
            else:
                tux.console.print(f"  API: [yellow]Status {response.status_code}[/yellow]", style=STYLE_MUTED)
    except Exception:
        tux.console.print("  API: [red]Disconnected[/red]", style=STYLE_MUTED)

    # Session stats
    tux.console.print()
    tux.console.print(f"  Session tokens: {tux._format_tokens(tux.stats.total_tokens)}", style=STYLE_MUTED)
    tux.console.print(f"  Messages: {tux.stats.messages}", style=STYLE_MUTED)
    tux.console.print()
    return None
