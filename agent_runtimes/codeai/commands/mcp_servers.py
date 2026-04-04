# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /mcp-servers - List MCP servers and their status."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "mcp-servers"
ALIASES = ["mcp"]
DESCRIPTION = "List MCP servers and their status"
SHORTCUT = "escape m"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """List MCP servers and their status."""
    from ..tux import STYLE_PRIMARY, STYLE_ACCENT, STYLE_MUTED

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
            tool_names = [t.get("name", "?") for t in tools[:5]]
            tools_str = ", ".join(tool_names)
            if len(tools) > 5:
                tools_str += f" (+{len(tools) - 5} more)"
            tux.console.print(f"    Tools: {tools_str}", style=STYLE_MUTED)

    tux.console.print()
    return None
