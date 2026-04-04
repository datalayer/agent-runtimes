# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /help - Show available commands."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "help"
ALIASES = ["?"]
DESCRIPTION = "Show available commands"
SHORTCUT = "escape h"


def _format_shortcut(shortcut: Optional[str]) -> str:
    """Format a shortcut string for display."""
    if not shortcut:
        return ""
    if shortcut.startswith("escape "):
        return f"Esc,{shortcut[7:].upper()}"
    if shortcut.startswith("c-"):
        return f"Ctrl+{shortcut[2:].upper()}"
    return shortcut


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Show available commands."""
    from ..tux import STYLE_WHITE, STYLE_PRIMARY, STYLE_MUTED, STYLE_SECONDARY

    tux.console.print()
    tux.console.print("Available Commands:", style=STYLE_WHITE)
    tux.console.print()

    shown: set[str] = set()
    for name, cmd in sorted(tux.commands.items()):
        if cmd.name in shown:
            continue
        shown.add(cmd.name)

        # Build command name with aliases
        aliases_str = ""
        if cmd.aliases:
            aliases_str = f" ({', '.join(cmd.aliases)})"

        # Build shortcut indicator
        shortcut_str = ""
        if cmd.shortcut:
            shortcut_str = f" [{_format_shortcut(cmd.shortcut)}]"

        cmd_display = f"/{cmd.name}{aliases_str}"
        tux.console.print(f"  {cmd_display}", style=STYLE_PRIMARY, end="")

        # Calculate padding for alignment
        padding_len = max(1, 22 - len(cmd_display))
        tux.console.print(" " * padding_len, end="")
        tux.console.print(cmd.description, style=STYLE_MUTED, end="")

        if shortcut_str:
            tux.console.print(f"  {shortcut_str}", style=STYLE_SECONDARY)
        else:
            tux.console.print()

    tux.console.print()
    return None
