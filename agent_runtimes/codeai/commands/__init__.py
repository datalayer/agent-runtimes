# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Commands package - one file per slash command.

Each command module exports:
    NAME: str - primary command name
    ALIASES: list[str] - alternative names
    DESCRIPTION: str - help text
    SHORTCUT: Optional[str] - keyboard shortcut (e.g., "escape x")
    execute(tux) -> Optional[str] - async handler, returns optional next prompt
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux


@dataclass
class SlashCommand:
    """Definition of a slash command."""
    name: str
    aliases: list[str] = field(default_factory=list)
    description: str = ""
    handler: Optional[Callable] = None
    shortcut: Optional[str] = None  # e.g., "escape x" for Esc, X


def build_commands(
    tux: "CodeAITux",
    eggs: bool = False,
    jupyter_url: Optional[str] = None,
) -> dict[str, SlashCommand]:
    """Build all slash commands, binding handlers to the tux instance.

    Args:
        tux: The CodeAITux instance.
        eggs: Enable Easter egg commands.
        jupyter_url: Jupyter URL (enables /jupyter command when set).

    Returns:
        Dict mapping command names (including aliases) to SlashCommand instances.
    """
    from . import (
        context,
        clear,
        help,
        status,
        exit,
        agents,
        tools,
        mcp_servers,
        skills,
        codemode_toggle,
        context_export,
        tools_last,
        cls,
        browser,
        browser_notebook,
        browser_lexical,
        suggestions,
    )

    # Core commands always registered
    modules = [
        context,
        clear,
        help,
        status,
        exit,
        agents,
        tools,
        mcp_servers,
        skills,
        codemode_toggle,
        context_export,
        tools_last,
        cls,
        browser,
        browser_notebook,
        browser_lexical,
        suggestions,
    ]

    # Conditionally add egg commands
    if eggs:
        from . import rain, about, gif
        modules.extend([rain, about, gif])

    # Conditionally add jupyter command
    if jupyter_url:
        from . import jupyter
        modules.append(jupyter)

    commands: dict[str, SlashCommand] = {}

    for mod in modules:
        # Create handler closure that captures tux
        handler = _make_handler(mod.execute, tux)

        cmd = SlashCommand(
            name=mod.NAME,
            aliases=getattr(mod, "ALIASES", []),
            description=getattr(mod, "DESCRIPTION", ""),
            handler=handler,
            shortcut=getattr(mod, "SHORTCUT", None),
        )
        commands[cmd.name] = cmd
        for alias in cmd.aliases:
            commands[alias] = cmd

    return commands


def _make_handler(execute_fn: Callable, tux: "CodeAITux") -> Callable:
    """Create a handler closure that passes tux to the execute function."""
    async def handler():
        return await execute_fn(tux)
    return handler
