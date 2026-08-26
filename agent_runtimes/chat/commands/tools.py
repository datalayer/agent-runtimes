# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

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
    mcp_fallback = False
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
                        if (
                            isinstance(aid, str)
                            and aid.strip()
                            and aid not in candidate_ids
                        ):
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

            # Fallback: dynamic codemode/MCP toolsets may not appear in
            # /api/v1/agents/{id} static toolset metadata. In that case, show
            # currently running MCP server tools so /tools remains useful.
            if not tools:
                mcp_response = await client.get(
                    f"{tux.server_url}/api/v1/mcp/servers",
                    timeout=5.0,
                )
                if mcp_response.status_code == 200:
                    servers = mcp_response.json() or []
                    if isinstance(servers, list):
                        aggregate: list[dict] = []
                        for server in servers:
                            if not isinstance(server, dict):
                                continue
                            server_name = (
                                server.get("name") or server.get("id") or "mcp"
                            )
                            for tool in server.get("tools", []) or []:
                                if not isinstance(tool, dict):
                                    continue
                                aggregate.append(
                                    {
                                        "name": tool.get("name", "Unknown"),
                                        "description": tool.get("description", ""),
                                        "server": server_name,
                                    }
                                )
                        if aggregate:
                            tools = aggregate
                            mcp_fallback = True

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
    if mcp_fallback:
        title += " [dim](from MCP servers)[/dim]"
    tux.console.print(title, style=STYLE_PRIMARY)
    tux.console.print()

    for tool in tools:
        tool_name = tool.get("name", "Unknown")
        tool_desc = tool.get("description", "")
        tool_server = tool.get("server", "")
        # Truncate description if too long
        if len(tool_desc) > 60:
            tool_desc = tool_desc[:57] + "..."
        label = f"{tool_name}"
        if isinstance(tool_server, str) and tool_server:
            label = f"{tool_name} ({tool_server})"
        tux.console.print(f"  • {label}", style=STYLE_ACCENT)
        if tool_desc:
            tux.console.print(f"    {tool_desc}", style=STYLE_MUTED)

    tux.console.print()
    return None
