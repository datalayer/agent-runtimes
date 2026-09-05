# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /agents - List available agents."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

from agent_runtimes.loop.commands import CommandArgSpec

NAME = "agents"
ALIASES: list[str] = ["agent"]
DESCRIPTION = "List agents, and switch the one this session is using"
SHORTCUT = "escape a"


def _agent_ids() -> list[str]:
    """Agent ids for completion, from the catalogue rather than the network."""
    try:
        from agent_runtimes.specs.agents.agents import AGENTSPECS

        return sorted(AGENTSPECS)
    except Exception:  # noqa: BLE001
        return []


ARGS = (
    CommandArgSpec(name="action", description="use", choices=("use",)),
    CommandArgSpec(name="agent-id", description="Agent to switch to", choices=_agent_ids),
)


async def _use(tux: "CliTux", agent_id: str) -> None:
    """Bind this session to another agent."""
    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    session = getattr(tux, "loop_session", None)
    session_id = (
        getattr(session, "conversation_id", None)
        or getattr(tux, "agent_id", "")
        or "session"
    )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/loop/sessions/{session_id}/agent",
                json={"agent_id": agent_id},
                timeout=120.0,
            )
            if response.status_code == 404:
                tux.console.print(f"[red]Unknown agent: {agent_id}[/red]")
                tux.console.print("  /agents to see what is available.", style=STYLE_MUTED)
                return
            response.raise_for_status()
            payload = response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Could not switch agent: {error}[/red]")
        return

    if session is not None:
        session.agent_id = payload.get("agent_id", agent_id)
        session.model = payload.get("model") or session.model
    tux.agent_id = payload.get("agent_id", agent_id)

    tux.console.print()
    tux.console.print(f"● {payload.get('name', agent_id)}", style=STYLE_PRIMARY)
    tux.console.print(f"  {payload.get('agent_id')}", style=STYLE_MUTED)
    if payload.get("model"):
        tux.console.print(f"  model: {payload['model']}", style=STYLE_MUTED)
    if payload.get("sandbox_variant"):
        tux.console.print(f"  sandbox: {payload['sandbox_variant']}", style=STYLE_MUTED)
    tux.console.print()


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """List agents, or switch to one."""
    parts = (argv or "").split()
    if parts and parts[0].lower() == "use":
        if len(parts) < 2:
            from ..tux import STYLE_MUTED

            tux.console.print("  /agents use <agent-id>", style=STYLE_MUTED)
            return None
        await _use(tux, parts[1])
        return None
    return await _list(tux)


async def _list(tux: "CliTux") -> Optional[str]:
    """List available agents with detailed information."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

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
        tux.console.print("    Codemode: ", style=STYLE_MUTED, end="")
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
    tux.console.print("  /agents use <agent-id> to switch", style=STYLE_MUTED)
    tux.console.print()
    return None
