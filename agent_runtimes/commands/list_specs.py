# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
List specs command for the Agent Runtimes CLI.

This module provides the list-specs command that shows available agent specs
from the library. It can be used directly by other libraries or through the CLI.

Usage as library:
    from agent_runtimes.commands.list_specs import (
        list_agent_specs,
        get_agent_specs,
        OutputFormat,
    )

    # Get specs as list of dicts
    specs = get_agent_specs()
    for spec in specs:
        print(f"{spec['id']}: {spec['name']}")

    # Print formatted output
    list_agent_specs(output=OutputFormat.table)
"""

import json
from enum import Enum
from typing import Any

from rich import box
from rich.console import Console
from rich.table import Table


class OutputFormat(str, Enum):
    """Output format options."""

    table = "table"
    json = "json"


def get_agent_specs() -> list[dict[str, Any]]:
    """
    Get available agent specs from the library.

    Returns:
        List of agent spec dictionaries with keys:
        - id: Agent spec ID
        - name: Human-readable name
        - description: Description of the agent
        - mcp_servers: List of MCP server IDs the agent uses
    """
    from agent_runtimes.config.agents import AGENT_SPECS

    specs = []
    for agent_id, agent in AGENT_SPECS.items():
        specs.append(
            {
                "id": agent_id,
                "name": agent.name,
                "description": agent.description,
                "mcp_servers": [s.id for s in agent.mcp_servers],
            }
        )
    return specs


def list_agent_specs(output: OutputFormat = OutputFormat.table) -> list[dict[str, Any]]:
    """
    List available agent specs from the library.

    This is the core logic of the list-specs command, usable by other libraries.

    Args:
        output: Output format (table or json). Controls how results are printed.

    Returns:
        List of agent spec dictionaries.
    """
    from agent_runtimes.config.agents import AGENT_SPECS

    specs = get_agent_specs()
    console = Console()

    if output == OutputFormat.json:
        console.print_json(json.dumps(specs, indent=2))
    else:
        # Rich table format
        table = Table(
            title="🤖 Available Agent Specs",
            box=box.ROUNDED,
            show_header=True,
            header_style="bold cyan",
            title_style="bold magenta",
            border_style="blue",
            padding=(0, 1),
        )

        table.add_column("ID", style="green", no_wrap=True)
        table.add_column("Name", style="bold white")
        table.add_column("Description", style="dim")
        table.add_column("MCP Servers", style="yellow")

        for agent_id, agent in AGENT_SPECS.items():
            mcp_ids = [s.id for s in agent.mcp_servers]
            # Truncate description
            desc = (
                agent.description[:60] + "..."
                if len(agent.description) > 60
                else agent.description
            )

            # Format MCP servers as badges
            mcp_text = ", ".join(mcp_ids) if mcp_ids else "[dim]none[/dim]"

            table.add_row(
                agent_id,
                agent.name,
                desc,
                mcp_text,
            )

        console.print()
        console.print(table)
        console.print()
        console.print(
            f"[bold]Total:[/bold] [cyan]{len(AGENT_SPECS)}[/cyan] agent spec(s)"
        )

    return specs
