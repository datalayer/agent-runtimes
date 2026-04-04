# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /tools - List available tools."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "tools"
ALIASES: list[str] = []
DESCRIPTION = "List available tools for the current agent"
SHORTCUT = "escape t"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """List available tools for the current agent."""
    from ..tux import STYLE_PRIMARY, STYLE_ACCENT, STYLE_MUTED

    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/context-snapshot"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error fetching tools: {e}[/red]")
        return None

    tools = data.get("tools", [])

    if not tools:
        tux.console.print("No tools available", style=STYLE_MUTED)
        return None

    tux.console.print()
    tux.console.print(f"● Available Tools ({len(tools)}):", style=STYLE_PRIMARY)
    tux.console.print()

    for tool in tools:
        tool_name = tool.get("name", "Unknown")
        tool_desc = tool.get("description", "")
        # Truncate description if too long
        if len(tool_desc) > 60:
            tool_desc = tool_desc[:57] + "..."
        tux.console.print(f"  • {tool_name}", style=STYLE_ACCENT)
        if tool_desc:
            tux.console.print(f"    {tool_desc}", style=STYLE_MUTED)

    tux.console.print()
    return None
