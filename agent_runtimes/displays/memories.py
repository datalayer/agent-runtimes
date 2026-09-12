# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Display functions for persisted agent memories."""

from __future__ import annotations

from typing import Any

from rich.console import Console
from rich.table import Table


def _truncate(value: Any, width: int = 60) -> str:
    """Return a single-line, width-limited representation of ``value``."""
    text = "" if value is None else str(value)
    text = text.replace("\n", " ").strip()
    if len(text) > width:
        return text[: width - 1] + "\u2026"
    return text


def _new_memories_table(title: str = "Persisted Memories") -> Table:
    """Create a new memories table."""
    table = Table(title=title)
    table.add_column("ID", style="cyan", no_wrap=True)
    table.add_column("User", style="green", no_wrap=True)
    table.add_column("Agent", style="magenta", no_wrap=True)
    table.add_column("Scope", style="blue", no_wrap=True)
    table.add_column("Memory", style="white")
    table.add_column("Updated", style="dim", no_wrap=True)
    return table


def _add_memory_to_table(table: Table, memory: dict[str, Any]) -> None:
    """Add a memory row to the table."""
    table.add_row(
        _truncate(memory.get("id"), 38),
        _truncate(memory.get("user_id"), 24),
        _truncate(memory.get("agent_id"), 20),
        _truncate(memory.get("scope"), 8),
        _truncate(memory.get("memory"), 60),
        _truncate(memory.get("updated_at") or memory.get("created_at"), 26),
    )


def display_memories(memories: list[dict[str, Any]]) -> None:
    """Display a list of persisted memories in the console."""
    console = Console()
    table = _new_memories_table()
    for memory in memories:
        _add_memory_to_table(table, memory)
    console.print(table)


def display_memory(memory: dict[str, Any]) -> None:
    """Display the full detail of a single persisted memory."""
    console = Console()
    table = Table(title=f"Memory {memory.get('id', '')}", show_header=False)
    table.add_column("Field", style="cyan", no_wrap=True)
    table.add_column("Value", style="white")
    for field in (
        "id",
        "user_id",
        "agent_id",
        "run_id",
        "actor_id",
        "role",
        "scope",
        "hash",
        "created_at",
        "updated_at",
    ):
        table.add_row(
            field, "" if memory.get(field) is None else str(memory.get(field))
        )
    table.add_row(
        "memory", "" if memory.get("memory") is None else str(memory.get("memory"))
    )
    metadata = memory.get("metadata") or {}
    if metadata:
        table.add_row("metadata", str(metadata))
    console.print(table)
