# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /context-export - Export current context to CSV."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "context-export"
ALIASES = ["export"]
DESCRIPTION = "Export the current context to a CSV file"
SHORTCUT = "escape e"


async def execute(tux: "CliTux") -> Optional[str]:
    """Export the current context to a CSV file."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED

    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/context-export"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error fetching context: {e}[/red]")
        return None

    if data.get("error"):
        tux.console.print(f"[red]{data.get('error')}[/red]")
        return None

    filename = data.get("filename", "agent_runtimes_cli_context.csv")
    csv_content = data.get("csv", "")

    if not csv_content:
        tux.console.print("[red]No CSV content returned.[/red]")
        return None

    try:
        with open(filename, "w", newline="") as csvfile:
            csvfile.write(csv_content)

        tools_count = data.get("toolsCount", 0)
        messages_count = data.get("messagesCount", 0)

        tux.console.print()
        tux.console.print(f"● Context exported to {filename}", style=STYLE_ACCENT)
        if tools_count or messages_count:
            tux.console.print(
                f"  Contains {tools_count} tools and {messages_count} messages",
                style=STYLE_MUTED,
            )
        tux.console.print()
    except IOError as e:
        tux.console.print(f"[red]Error writing file: {e}[/red]")
    return None
