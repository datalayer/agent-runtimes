# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /agents - List available agents."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "agents"
ALIASES: list[str] = []
DESCRIPTION = "List available agents on the server"
SHORTCUT = "escape a"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """List available agents with detailed information."""
    from ..tux import STYLE_PRIMARY, STYLE_ACCENT, STYLE_MUTED

    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/agents"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error fetching agents: {e}[/red]")
        return None

    agents_list = data.get("agents", [])

    if not agents_list:
        tux.console.print("No agents available", style=STYLE_MUTED)
        return None

    tux.console.print()
    tux.console.print(f"● Available Agents ({len(agents_list)}):", style=STYLE_PRIMARY)
    tux.console.print()

    for agent in agents_list:
        agent_id = agent.get("id", "unknown")
        name = agent.get("name", "Unknown")
        description = agent.get("description", "")
        model = agent.get("model", "unknown")
        status = agent.get("status", "unknown")
        toolsets = agent.get("toolsets", {})

        # Status indicator
        status_icon = "[green]●[/green]" if status == "running" else "[red]○[/red]"
        tux.console.print(f"  {status_icon} {name} ({agent_id})", style=STYLE_ACCENT)

        # Description
        if description:
            desc = description[:60] + "..." if len(description) > 60 else description
            tux.console.print(f"    {desc}", style=STYLE_MUTED)

        # Model
        tux.console.print(f"    Model: {model}", style=STYLE_MUTED)

        # Codemode
        codemode = toolsets.get("codemode", False)
        codemode_text = "enabled" if codemode else "disabled"
        codemode_style = STYLE_ACCENT if codemode else STYLE_MUTED
        tux.console.print(f"    Codemode: ", style=STYLE_MUTED, end="")
        tux.console.print(codemode_text, style=codemode_style)

        # MCP Servers
        mcp_servers = toolsets.get("mcp_servers", [])
        if mcp_servers:
            mcp_text = ", ".join(mcp_servers[:5])
            if len(mcp_servers) > 5:
                mcp_text += f" (+{len(mcp_servers) - 5} more)"
            tux.console.print(f"    MCP Servers: {mcp_text}", style=STYLE_MUTED)

        # Tools count
        tools_count = toolsets.get("tools_count", 0)
        if tools_count > 0:
            tux.console.print(f"    Tools: {tools_count}", style=STYLE_MUTED)

        # Skills
        skills = toolsets.get("skills", [])
        if skills:
            skill_names = []
            for s in skills[:3]:
                if isinstance(s, dict):
                    skill_names.append(s.get("name", "?"))
                else:
                    skill_names.append(str(s))
            skills_text = ", ".join(skill_names)
            if len(skills) > 3:
                skills_text += f" (+{len(skills) - 3} more)"
            tux.console.print(f"    Skills: {skills_text}", style=STYLE_MUTED)

        tux.console.print()
    return None
