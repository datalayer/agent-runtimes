# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Display functions for runtime checkpoints (CRIU full-pod checkpoints).
"""

from __future__ import annotations

from typing import Any

from rich.console import Console
from rich.table import Table


def _new_runtime_checkpoints_table(title: str = "Runtime Checkpoints") -> Table:
    """
    Create a new runtime checkpoints table.

    Parameters
    ----------
    title : str, default "Runtime Checkpoints"
        The title for the table.

    Returns
    -------
    Table
        A rich Table configured for displaying checkpoints.
    """
    table = Table(title=title)
    table.add_column("ID", style="cyan", no_wrap=True)
    table.add_column("Runtime", style="green", no_wrap=True)
    table.add_column("Agentspec", style="magenta", no_wrap=True)
    table.add_column("Name", style="cyan", no_wrap=True)
    table.add_column("Status", style="yellow", no_wrap=True)
    table.add_column("Updated", style="dim", no_wrap=True)
    return table


def _add_runtime_checkpoint_to_table(table: Table, checkpoint: dict[str, Any]) -> None:
    """
    Add a runtime checkpoint row to the table.

    Parameters
    ----------
    table : Table
        The rich Table to add the row to.
    checkpoint : dict[str, Any]
        Dictionary containing checkpoint information.
    """
    table.add_row(
        checkpoint.get("id", ""),
        checkpoint.get("runtime_uid", ""),
        checkpoint.get("agent_spec_id", ""),
        checkpoint.get("name", ""),
        checkpoint.get("status", ""),
        checkpoint.get("updated_at", ""),
    )


def display_runtime_checkpoints(checkpoints: list[dict[str, Any]]) -> None:
    """
    Display a list of runtime checkpoints in the console.

    Parameters
    ----------
    checkpoints : list[dict[str, Any]]
        List of checkpoint dictionaries to display.
    """
    console = Console()
    table = _new_runtime_checkpoints_table()
    for checkpoint in checkpoints:
        _add_runtime_checkpoint_to_table(table, checkpoint)
    console.print(table)
