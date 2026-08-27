# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /help - Show available commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

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


def _grouped(tux: "CliTux") -> "dict[str, list]":
    """Commands by group, from the registry when there is one.

    A session built before the registry existed — or a test double — still has
    the name-and-alias mapping, so fall back to a single group rather than
    refusing to print help.
    """
    registry = getattr(tux, "command_registry", None)
    if registry is not None:
        return registry.by_group()

    unique = {cmd.name: cmd for cmd in tux.commands.values()}
    return {"Commands": [unique[name] for name in sorted(unique)]}


async def execute(tux: "CliTux") -> Optional[str]:
    """Show available commands."""
    from ..tux import STYLE_MUTED, STYLE_PRIMARY, STYLE_SECONDARY, STYLE_WHITE

    tux.console.print()
    tux.console.print("Available Commands:", style=STYLE_WHITE)

    for group, specs in _grouped(tux).items():
        tux.console.print()
        tux.console.print(f"  {group}", style=STYLE_SECONDARY)

        for cmd in specs:
            # Build command name with aliases
            aliases_str = ""
            if cmd.aliases:
                aliases_str = f" ({', '.join(cmd.aliases)})"

            # Build shortcut indicator
            shortcut_str = ""
            if cmd.shortcut:
                shortcut_str = f" [{_format_shortcut(cmd.shortcut)}]"

            cmd_display = f"/{cmd.name}{aliases_str}"
            tux.console.print(f"    {cmd_display}", style=STYLE_PRIMARY, end="")

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
