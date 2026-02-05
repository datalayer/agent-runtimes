# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
MCP servers config command for the Agent Runtimes CLI.

This module provides the mcp-servers-config command that displays MCP servers
configured in the user's ~/.datalayer/mcp.json file. It can be used directly
by other libraries or through the CLI.

Usage as library:
    from agent_runtimes.commands.mcp_servers_config import (
        list_mcp_servers_config,
        get_mcp_servers_config,
        OutputFormat,
    )

    # Get servers as list of dicts
    servers = get_mcp_servers_config()
    for server in servers:
        print(f"{server['id']}: {server['command']}")

    # Print formatted output
    list_mcp_servers_config(output=OutputFormat.table)
"""

import json
from enum import Enum
from typing import Any

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table


class OutputFormat(str, Enum):
    """Output format options."""

    table = "table"
    json = "json"


def get_mcp_servers_config() -> dict[str, Any]:
    """
    Get MCP servers from the user's config file.

    Returns:
        Dictionary containing:
        - config_path: Path to the config file
        - exists: Whether the config file exists
        - servers: List of server dictionaries with keys:
          - id: Server ID
          - command: Command to start the server
          - args: Arguments for the command
          - env: Environment variables for the server
    """
    from agent_runtimes.mcp.config_mcp_servers import (
        get_mcp_config_path,
        load_mcp_config,
    )

    config_path = get_mcp_config_path()
    exists = config_path.exists()

    if not exists:
        return {
            "config_path": str(config_path),
            "exists": False,
            "servers": [],
        }

    # Load raw config for env info
    raw_config = load_mcp_config()
    mcp_servers = raw_config.get("mcpServers", {})

    servers = []
    for server_id, config in mcp_servers.items():
        servers.append(
            {
                "id": server_id,
                "command": config.get("command", ""),
                "args": config.get("args", []),
                "env": config.get("env", {}),
            }
        )

    return {
        "config_path": str(config_path),
        "exists": True,
        "servers": servers,
    }


def list_mcp_servers_config(
    output: OutputFormat = OutputFormat.table,
) -> dict[str, Any]:
    """
    List MCP servers from the user's config file.

    This is the core logic of the mcp-servers-config command, usable by other libraries.

    Args:
        output: Output format (table or json). Controls how results are printed.

    Returns:
        Dictionary containing config path and servers.
    """
    result = get_mcp_servers_config()
    console = Console()

    if output == OutputFormat.json:
        console.print_json(json.dumps(result, indent=2))
    else:
        config_path = result["config_path"]
        servers = result["servers"]

        if not result["exists"]:
            console.print()
            console.print(
                Panel(
                    f"[dim]Config file not found at:[/dim]\n\n"
                    f"[cyan]{config_path}[/cyan]\n\n"
                    f"[dim]Create this file to configure MCP servers.[/dim]",
                    title="📋 MCP Config Servers",
                    border_style="yellow",
                )
            )
            console.print()
            console.print("[dim]Example config format:[/dim]")
            console.print_json(
                json.dumps(
                    {
                        "mcpServers": {
                            "my-server": {
                                "command": "npx",
                                "args": ["-y", "@some/mcp-server"],
                                "env": {"API_KEY": "${API_KEY}"},
                            }
                        }
                    },
                    indent=2,
                )
            )
            return result

        if not servers:
            console.print()
            console.print(
                Panel(
                    f"[dim]No MCP servers configured in:[/dim]\n\n"
                    f"[cyan]{config_path}[/cyan]",
                    title="📋 MCP Config Servers",
                    border_style="yellow",
                )
            )
            return result

        # Rich table format
        table = Table(
            title="📋 MCP Config Servers",
            caption=f"[dim]Config: {config_path}[/dim]",
            box=box.ROUNDED,
            show_header=True,
            header_style="bold cyan",
            title_style="bold magenta",
            border_style="blue",
            padding=(0, 1),
        )

        table.add_column("ID", style="green", no_wrap=True)
        table.add_column("Command", style="bold white")
        table.add_column("Args", style="dim")
        table.add_column("Env Vars", style="cyan")

        for server in servers:
            # Format args - show truncated if too long
            args = server.get("args", [])
            args_str = " ".join(args)
            if len(args_str) > 40:
                args_str = args_str[:37] + "..."

            # Format env vars
            env = server.get("env", {})
            if env:
                env_parts = []
                for key in env.keys():
                    env_parts.append(f"[cyan]{key}[/cyan]")
                env_text = ", ".join(env_parts)
            else:
                env_text = "[dim]none[/dim]"

            table.add_row(
                server["id"],
                server.get("command", ""),
                args_str,
                env_text,
            )

        console.print()
        console.print(table)
        console.print()
        console.print(f"[bold]Total:[/bold] [cyan]{len(servers)}[/cyan] server(s)")

    return result
