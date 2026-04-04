# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /context - Visualize current context usage."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx
from rich.text import Text

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "context"
ALIASES: list[str] = []
DESCRIPTION = "Visualize current context usage as a colored grid"
SHORTCUT = "escape x"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Display context usage visualization."""
    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/context-table?show_context=false"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error fetching context: {e}[/red]")
        return None

    if data.get("error"):
        tux.console.print(f"[red]{data.get('error')}[/red]")
        return None

    table_text = data.get("table", "").rstrip()
    if table_text:
        tux.console.print(Text.from_ansi(table_text))
    else:
        tux.console.print("[red]No table content returned.[/red]")
    return None
