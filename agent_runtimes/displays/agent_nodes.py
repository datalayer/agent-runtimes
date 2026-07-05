# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Rich display helpers for agent nodes."""

from typing import Any

from rich.console import Console
from rich.table import Table

console = Console()


def display_agent_nodes(agent_nodes: list[dict[str, Any]]) -> None:
    """Display agent nodes in a Rich table."""
    table = Table(title="Agent Nodes")
    table.add_column("Node ID", style="cyan", no_wrap=True)
    table.add_column("Name")
    table.add_column("Mode")
    table.add_column("Status")
    table.add_column("Last Seen")

    for node in agent_nodes:
        configuration = node.get("configuration") or {}
        table.add_row(
            str(node.get("node_id") or ""),
            str(node.get("node_name") or ""),
            str(configuration.get("mode") or "sleep"),
            str(node.get("status") or "stale"),
            str(node.get("last_seen_at") or ""),
        )

    console.print(table)
