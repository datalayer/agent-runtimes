# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /tools - List available tools."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "tools"
ALIASES: list[str] = []
DESCRIPTION = "List available tools for the current agent"
SHORTCUT = "escape t"


async def execute(tux: "CliTux") -> Optional[str]:
    """List available tools for the current agent."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

    tools: list[dict] = []
    resolved_agent_id: str | None = None

    try:
        async with httpx.AsyncClient() as client:
            candidate_ids: list[str] = []
            if isinstance(tux.agent_id, str) and tux.agent_id.strip():
                candidate_ids.append(tux.agent_id.strip())

            # Fallback to the active runtime agent from startup metadata.
            try:
                startup_response = await client.get(
                    f"{tux.server_url}/health/startup",
                    timeout=5.0,
                )
                if startup_response.status_code == 200:
                    startup_info = startup_response.json()
                    startup_agent = (startup_info or {}).get("agent", {}) or {}
                    startup_agent_id = startup_agent.get("id")
                    if (
                        isinstance(startup_agent_id, str)
                        and startup_agent_id.strip()
                        and startup_agent_id.strip() not in candidate_ids
                    ):
                        candidate_ids.append(startup_agent_id.strip())
            except Exception:
                # Best-effort fallback source only.
                pass

            # If we still cannot resolve a live agent, inspect the running
            # registry and try all known IDs.
            try:
                list_response = await client.get(
                    f"{tux.server_url}/api/v1/agents",
                    timeout=5.0,
                )
                if list_response.status_code == 200:
                    payload = list_response.json() or {}
                    for item in payload.get("agents", []) or []:
                        aid = item.get("id") if isinstance(item, dict) else None
                        if isinstance(aid, str) and aid.strip() and aid not in candidate_ids:
                            candidate_ids.append(aid)
            except Exception:
                pass

            for agent_id in candidate_ids:
                response = await client.get(
                    f"{tux.server_url}/api/v1/agents/{agent_id}",
                    timeout=5.0,
                )
                if response.status_code != 200:
                    continue

                data = response.json() if response.content else {}
                toolsets = data.get("toolsets", {}) if isinstance(data, dict) else {}
                candidate_tools = (
                    toolsets.get("tools", []) if isinstance(toolsets, dict) else []
                )
                if isinstance(candidate_tools, list):
                    tools = [t for t in candidate_tools if isinstance(t, dict)]
                    resolved_agent_id = agent_id
                    break

    except Exception as e:
        tux.console.print(f"[red]Error fetching tools: {e}[/red]")
        return None

    if not tools:
        tux.console.print("No tools available", style=STYLE_MUTED)
        return None

    tux.console.print()
    title = f"● Available Tools ({len(tools)})"
    if resolved_agent_id and resolved_agent_id != tux.agent_id:
        title += f" [dim](agent: {resolved_agent_id})[/dim]"
    tux.console.print(title, style=STYLE_PRIMARY)
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
