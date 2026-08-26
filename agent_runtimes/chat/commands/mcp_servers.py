# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /mcp-servers - List MCP servers and their status."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "mcp-servers"
ALIASES = ["mcp"]
DESCRIPTION = "List MCP servers and their status"
SHORTCUT = "escape m"


async def execute(tux: "CliTux") -> Optional[str]:
    """List MCP servers and their status."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/mcp/servers"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            servers = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error fetching MCP servers: {e}[/red]")
        return None

    if not servers:
        tux.console.print("No MCP servers running", style=STYLE_MUTED)
        return None

    tux.console.print()
    tux.console.print(f"● MCP Servers ({len(servers)}):", style=STYLE_PRIMARY)
    tux.console.print()

    for server in servers:
        server_id = server.get("id", "Unknown")
        server_name = server.get("name", server_id)
        is_available = server.get("isAvailable", False)
        tools = server.get("tools", [])

        status = "[green]●[/green]" if is_available else "[red]●[/red]"
        tux.console.print(f"  {status} {server_name}", style=STYLE_ACCENT)

        if tools:
            tux.console.print(f"    Tools ({len(tools)}):", style=STYLE_MUTED)
            for tool in tools:
                tool_name = tool.get("name", "?")
                tool_desc = (tool.get("description") or "").strip()
                if not tool_desc:
                    tool_desc = "No description"
                tux.console.print(
                    f"      - {tool_name}: {tool_desc}",
                    style=STYLE_MUTED,
                )
        else:
            tux.console.print("    Tools (0)", style=STYLE_MUTED)

    tux.console.print()
    return None
