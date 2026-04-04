# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /tools-last - Show tool call details from last response."""

from __future__ import annotations

import json
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "tools-last"
ALIASES = ["tl"]
DESCRIPTION = "Show details of tool calls from last response"
SHORTCUT = "escape l"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Show detailed information about tool calls from the last response."""
    from ..tux import (
        STYLE_PRIMARY, STYLE_ACCENT, STYLE_MUTED,
        STYLE_ERROR, STYLE_WARNING,
    )

    if not tux.tool_calls:
        tux.console.print()
        tux.console.print("● No tool calls in the last response", style=STYLE_MUTED)
        tux.console.print()
        return None

    tux.console.print()
    tux.console.print(f"● Tool Calls from Last Response ({len(tux.tool_calls)}):", style=STYLE_PRIMARY)
    tux.console.print()

    for i, tc in enumerate(tux.tool_calls, 1):
        # Status indicator
        if tc.status == "complete":
            status_icon = "[green]✓[/green]"
        elif tc.status == "error":
            status_icon = "[red]✗[/red]"
        else:
            status_icon = "[yellow]●[/yellow]"

        # Tool header
        tux.console.print(f"  {status_icon} {i}. {tc.tool_name}", style=STYLE_PRIMARY)

        # Arguments - show complete details
        if tc.args_json:
            try:
                args = json.loads(tc.args_json)
                if isinstance(args, dict):
                    for key, value in args.items():
                        val_str = str(value)
                        # Show full value, preserving newlines with indentation
                        if "\n" in val_str:
                            tux.console.print(f"     {key}:", style=STYLE_MUTED)
                            for line in val_str.split("\n"):
                                tux.console.print(f"       {line}", style=STYLE_MUTED)
                        else:
                            tux.console.print(f"     {key}: {val_str}", style=STYLE_MUTED)
                else:
                    tux.console.print(f"     args: {tc.args_json}", style=STYLE_MUTED)
            except json.JSONDecodeError:
                tux.console.print(f"     args: {tc.args_json}", style=STYLE_MUTED)

        # Result - show complete details
        if tc.result:
            tux.console.print("     result:", style=STYLE_MUTED)
            for line in tc.result.split("\n"):
                tux.console.print(f"       │ {line}", style=STYLE_MUTED)

        tux.console.print()

    tux.console.print()
    return None
