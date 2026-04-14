# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /tools - List available tools."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "tools"
ALIASES: list[str] = []
DESCRIPTION = "List available tools for the current agent"
SHORTCUT = "escape t"


async def execute(tux: "CliTux") -> Optional[str]:
    """List available tools for the current agent."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

    try:
        from agent_runtimes.context.session import get_agent_context_snapshot

        snapshot = get_agent_context_snapshot(tux.agent_id)
        if snapshot is None:
            tux.console.print("No tools available (agent not found)", style=STYLE_MUTED)
            return None
        data = snapshot.to_dict()
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
