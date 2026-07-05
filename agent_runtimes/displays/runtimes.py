# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Display functions for Datalayer core."""

from __future__ import annotations

from typing import Any

from rich.console import Console
from rich.table import Table

from datalayer_core.utils.date import timestamp_to_local_date


def _new_runtime_table(title: str = "Agents") -> Table:
    """
    Create a new table for displaying runtimes.

    Parameters
    ----------
    title : str
        Title for the table.

    Returns
    -------
    Table
        A configured Rich Table object for runtimes.
    """
    table = Table(title=title)
    table.add_column("ID", style="cyan", no_wrap=True)
    table.add_column("Name", style="cyan", no_wrap=True)
    table.add_column("Environment", style="cyan", no_wrap=True)
    table.add_column("Expired At", style="cyan", no_wrap=True)
    return table


def _add_runtime_to_table(table: Table, runtime: dict[str, Any]) -> None:
    """
    Add a runtime row to the display table.

    Parameters
    ----------
    table : Table
        Rich Table object to add the row to.
    kernel : dict[str, Any]
        Runtime/kernel data dictionary to add as a row.
    """
    expired_at = runtime.get("expired_at")
    table.add_row(
        runtime["pod_name"],
        runtime["given_name"],
        runtime["environment_name"],
        "Never" if expired_at is None else timestamp_to_local_date(expired_at),
    )


def display_runtimes(runtimes: list[dict[str, Any]]) -> None:
    """
    Display a list of Runtimes in the console.

    Parameters
    ----------
    runtimes : list[dict[str, Any]]
        List of runtime dictionaries to display.
    """
    table = _new_runtime_table(title="Agents")
    for runtime in runtimes:
        _add_runtime_to_table(table, runtime)
    console = Console()
    console.print(table)
