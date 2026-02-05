# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP servers catalog command for the Agent Runtimes CLI.

This module provides the mcp-servers-catalog command that displays the catalog
of available MCP servers. It can be used directly by other libraries or through
the CLI.

Usage as library:
    from agent_runtimes.commands.mcp_servers_catalog import (
        list_mcp_servers_catalog,
        get_mcp_servers_catalog,
        OutputFormat,
    )

    # Get servers as list of dicts
    servers = get_mcp_servers_catalog()
    for server in servers:
        print(f"{server['id']}: {server['name']}")

    # Print formatted output
    list_mcp_servers_catalog(output=OutputFormat.table)
"""

import json
import os
from enum import Enum
from typing import Any

from rich import box
from rich.console import Console
from rich.table import Table


class OutputFormat(str, Enum):
    """Output format options."""

    table = "table"
    json = "json"


def get_mcp_servers_catalog() -> list[dict[str, Any]]:
    """
    Get the MCP servers catalog with availability status.

    Returns:
        List of MCP server dictionaries with keys:
        - id: Server ID
        - name: Human-readable name
        - description: Description of the server
        - command: Command to start the server
        - args: Arguments for the command
        - transport: Transport type (stdio, http)
        - required_env_vars: List of required environment variables
        - is_available: Whether required env vars are set
    """
    from agent_runtimes.mcp.catalog_mcp_servers import (
        MCP_SERVER_CATALOG,
        check_env_vars_available,
    )

    servers = []
    for server_id, server in MCP_SERVER_CATALOG.items():
        is_available = check_env_vars_available(server.required_env_vars)
        servers.append(
            {
                "id": server_id,
                "name": server.name,
                "description": server.description,
                "command": server.command,
                "args": server.args,
                "transport": server.transport,
                "required_env_vars": server.required_env_vars,
                "is_available": is_available,
            }
        )
    return servers


def list_mcp_servers_catalog(
    output: OutputFormat = OutputFormat.table,
) -> list[dict[str, Any]]:
    """
    List MCP servers from the catalog with availability status.

    This is the core logic of the mcp-servers-catalog command, usable by other libraries.

    Args:
        output: Output format (table or json). Controls how results are printed.

    Returns:
        List of MCP server dictionaries.
    """
    servers = get_mcp_servers_catalog()
    console = Console()

    if output == OutputFormat.json:
        console.print_json(json.dumps(servers, indent=2))
    else:
        # Rich table format
        table = Table(
            title="📦 MCP Servers Catalog",
            box=box.ROUNDED,
            show_header=True,
            header_style="bold cyan",
            title_style="bold magenta",
            border_style="blue",
            padding=(0, 1),
        )

        table.add_column("ID", style="green", no_wrap=True)
        table.add_column("Name", style="bold white")
        table.add_column("Status", style="yellow", justify="center")
        table.add_column("Transport", style="dim", justify="center")
        table.add_column("Env Vars", style="cyan")
        table.add_column("Description", style="dim")

        # Count available/unavailable servers
        available_count = 0
        unavailable_count = 0

        for server in servers:
            # Availability badge
            if server["is_available"]:
                status = "[green]● ready[/green]"
                available_count += 1
            else:
                status = "[red]○ missing env[/red]"
                unavailable_count += 1

            # Format env vars
            env_vars = server.get("required_env_vars", [])
            if env_vars:
                # Check each env var and color accordingly
                env_parts = []
                for var in env_vars:
                    if os.environ.get(var):
                        env_parts.append(f"[green]{var}[/green]")
                    else:
                        env_parts.append(f"[red]{var}[/red]")
                env_text = ", ".join(env_parts)
            else:
                env_text = "[dim]none[/dim]"

            # Truncate description
            desc = server["description"]
            desc = desc[:40] + "..." if len(desc) > 40 else desc

            table.add_row(
                server["id"],
                server["name"],
                status,
                server["transport"],
                env_text,
                desc,
            )

        console.print()
        console.print(table)
        console.print()

        # Summary with colored counts
        summary_parts = [
            f"[bold]Total:[/bold] [cyan]{len(servers)}[/cyan] server(s)",
            f"[green]● {available_count} ready[/green]",
            f"[red]○ {unavailable_count} missing env[/red]",
        ]
        console.print(" • ".join(summary_parts))

        if unavailable_count > 0:
            console.print()
            console.print(
                "[dim]Tip: Set the required environment variables to make servers available.[/dim]"
            )

    return servers
