# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
List agents command for the Agent Runtimes CLI.

This module provides the list-agents command that queries running agents
from an agent-runtimes server. It can be used directly by other libraries
or through the CLI.

Usage as library:
    from agent_runtimes.commands.list_agents import (
        list_agents_from_server,
        OutputFormat,
        ListAgentsError,
    )

    # Get agents as dict
    result = list_agents_from_server(host="localhost", port=8000)
    agents = result["agents"]

    # Print formatted output
    list_agents_from_server(host="localhost", port=8000, output=OutputFormat.table)
"""

import json
from enum import Enum
from typing import Any, Optional

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table


class OutputFormat(str, Enum):
    """Output format options."""

    table = "table"
    json = "json"


class ListAgentsError(Exception):
    """Error raised during list-agents command execution."""

    pass


def list_agents_from_server(
    host: str = "127.0.0.1",
    port: int = 8000,
    output: Optional[OutputFormat] = None,
) -> dict[str, Any]:
    """
    Query running agents from an agent-runtimes server.

    This is the core logic of the list-agents command, usable by other libraries.

    Args:
        host: Server host to query
        port: Server port to query
        output: If provided, print formatted output (table or json).
                If None, just return the data without printing.

    Returns:
        Dictionary containing the agents response from the server.
        Format: {"agents": [{"id": "...", "name": "...", "status": "..."}, ...]}

    Raises:
        ListAgentsError: If the server cannot be reached or returns an error
    """
    try:
        import httpx
    except ImportError:
        raise ListAgentsError(
            "httpx is not installed. Install it with: pip install httpx"
        )

    url = f"http://{host}:{port}/api/v1/agents"

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url)
            response.raise_for_status()
            data = response.json()
    except httpx.ConnectError:
        raise ListAgentsError(
            f"Could not connect to server at {host}:{port}. "
            "Make sure the agent-runtimes server is running."
        )
    except httpx.HTTPStatusError as e:
        raise ListAgentsError(f"Server returned {e.response.status_code}")
    except Exception as e:
        raise ListAgentsError(str(e))

    # If output format is specified, print the results
    if output is not None:
        _print_agents(data, host, port, output)

    return data


def _print_agents(
    data: dict[str, Any],
    host: str,
    port: int,
    output: OutputFormat,
) -> None:
    """Print agents in the specified format."""
    agents = data.get("agents", [])
    console = Console()

    if output == OutputFormat.json:
        console.print_json(json.dumps(data, indent=2))
    else:
        # Rich table format
        if not agents:
            console.print()
            console.print(
                Panel(
                    "[dim]No running agents found[/dim]",
                    title=f"🔍 Server: {host}:{port}",
                    border_style="yellow",
                )
            )
            return

        # Summary table
        table = Table(
            title=f"🚀 Running Agents on [cyan]{host}:{port}[/cyan]",
            box=box.ROUNDED,
            show_header=True,
            header_style="bold cyan",
            title_style="bold magenta",
            border_style="blue",
            padding=(0, 1),
        )

        table.add_column("ID", style="green", no_wrap=True)
        table.add_column("Name", style="bold white")
        table.add_column("Model", style="cyan")
        table.add_column("Protocol", style="magenta", justify="center")
        table.add_column("Status", style="yellow", justify="center")

        for agent in agents:
            agent_id = agent.get("id", "unknown")
            name = agent.get("name", "unknown")
            protocol = agent.get("protocol", "ag-ui")
            status = agent.get("status", "unknown")
            model = agent.get("model", "unknown")

            # Status badge styling
            if status == "running":
                status_display = "[green]● running[/green]"
            elif status == "stopped":
                status_display = "[red]○ stopped[/red]"
            elif status == "error":
                status_display = "[red]✗ error[/red]"
            else:
                status_display = f"[dim]{status}[/dim]"

            table.add_row(agent_id, name, model, protocol, status_display)

        console.print()
        console.print(table)
        console.print()

        # Print detailed info for each agent
        for agent in agents:
            agent_id = agent.get("id", "unknown")
            name = agent.get("name", "unknown")
            description = agent.get("description", "")
            model = agent.get("model", "unknown")
            toolsets = agent.get("toolsets", {})

            # Create detail panel
            detail_lines = []

            # Description
            if description:
                detail_lines.append(f"[bold]Description:[/bold] {description}")
                detail_lines.append("")

            # Model
            detail_lines.append(f"[bold]Model:[/bold] [cyan]{model}[/cyan]")

            # Codemode status
            codemode = toolsets.get("codemode", False)
            codemode_display = (
                "[green]● enabled[/green]" if codemode else "[dim]○ disabled[/dim]"
            )
            detail_lines.append(f"[bold]Codemode:[/bold] {codemode_display}")

            # MCP Servers
            mcp_servers = toolsets.get("mcp_servers", [])
            if mcp_servers:
                detail_lines.append(f"[bold]MCP Servers ({len(mcp_servers)}):[/bold]")
                for server in mcp_servers:
                    detail_lines.append(f"  [yellow]•[/yellow] {server}")
            else:
                detail_lines.append("[bold]MCP Servers:[/bold] [dim]none[/dim]")

            # Tools
            tools = toolsets.get("tools", [])
            tools_count = toolsets.get("tools_count", len(tools))
            if tools:
                detail_lines.append(f"[bold]Tools ({tools_count}):[/bold]")
                for tool in tools[:10]:  # Show first 10 tools
                    tool_name = tool.get("name", "unknown")
                    tool_desc = tool.get("description", "")
                    if tool_desc and len(tool_desc) > 50:
                        tool_desc = tool_desc[:47] + "..."
                    if tool_desc:
                        detail_lines.append(
                            f"  [cyan]•[/cyan] {tool_name}: [dim]{tool_desc}[/dim]"
                        )
                    else:
                        detail_lines.append(f"  [cyan]•[/cyan] {tool_name}")
                if len(tools) > 10:
                    detail_lines.append(
                        f"  [dim]... and {len(tools) - 10} more tools[/dim]"
                    )
            else:
                detail_lines.append("[bold]Tools:[/bold] [dim]none[/dim]")

            # Skills (if codemode enabled)
            skills = toolsets.get("skills", [])
            if skills:
                detail_lines.append(f"[bold]Skills ({len(skills)}):[/bold]")
                for skill in skills[:5]:
                    if isinstance(skill, dict):
                        skill_name = skill.get("name", "unknown")
                        skill_desc = skill.get("description", "")
                    else:
                        skill_name = str(skill)
                        skill_desc = ""
                    if skill_desc and len(skill_desc) > 40:
                        skill_desc = skill_desc[:37] + "..."
                    if skill_desc:
                        detail_lines.append(
                            f"  [magenta]•[/magenta] {skill_name}: [dim]{skill_desc}[/dim]"
                        )
                    else:
                        detail_lines.append(f"  [magenta]•[/magenta] {skill_name}")
                if len(skills) > 5:
                    detail_lines.append(
                        f"  [dim]... and {len(skills) - 5} more skills[/dim]"
                    )
            elif codemode:
                detail_lines.append("[bold]Skills:[/bold] [dim]none loaded[/dim]")

            console.print(
                Panel(
                    "\n".join(detail_lines),
                    title=f"[bold green]{agent_id}[/bold green] - {name}",
                    border_style="green",
                    expand=False,
                )
            )
            console.print()

        console.print(f"[bold]Total:[/bold] [cyan]{len(agents)}[/cyan] agent(s)")
