# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Commands package - one file per slash command.

Each command module exports:
    NAME: str - primary command name
    ALIASES: list[str] - alternative names
    DESCRIPTION: str - help text
    SHORTCUT: Optional[str] - keyboard shortcut (e.g., "escape x")
    GROUP: Optional[str] - grouping for /help (defaults to "General")
    ARGS: Optional[tuple[CommandArgSpec, ...]] - arguments, for completion
    execute(tux) -> Optional[str] - async handler, returns optional next prompt

The modules are the built-in commands. They are no longer the *only* commands:
they are registered into a :class:`~agent_runtimes.loop.SlashCommandRegistry`,
alongside whatever plugins the reactor discovers, so a package outside this
repository can ship a slash command without editing this file.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable, Optional

from agent_runtimes.loop.commands import (
    CommandArgSpec,
    CommandCollisionError,
    SlashCommandRegistry,
    SlashCommandSpec,
    spec_from_module,
)
from agent_runtimes.loop.discovery import discover_slash_commands

if TYPE_CHECKING:
    from ..tux import CliTux

#: The registry's spec is the command type. The old name is kept because the
#: terminal UI and its completer are written against it.
SlashCommand = SlashCommandSpec

__all__ = [
    "CommandArgSpec",
    "CommandCollisionError",
    "SlashCommand",
    "SlashCommandRegistry",
    "SlashCommandSpec",
    "build_commands",
    "build_registry",
]

#: Built-in command modules and the `/help` group each belongs to. Grouping
#: lives here rather than in twenty modules so the shape of the help screen is
#: visible in one place.
_BUILTIN_GROUPS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Session", ("help", "status", "clear", "cls", "exit", "suggestions")),
    ("Context", ("context", "context_export")),
    ("Agents", ("agents", "models", "tools", "tools_last", "codemode_toggle")),
    ("Capabilities", ("mcp_servers", "skills", "code_sandbox")),
    ("Open", ("browser", "browser_notebook", "browser_document", "jupyter", "datalayer")),
    ("Fun", ("rain", "about", "gif")),
)


def _group_for(module_name: str) -> str:
    """The `/help` group a built-in module belongs to."""
    for group, members in _BUILTIN_GROUPS:
        if module_name in members:
            return group
    return "General"


def build_registry(
    tux: "CliTux",
    eggs: bool = False,
    jupyter_url: Optional[str] = None,
    discover: bool = True,
) -> SlashCommandRegistry:
    """Build the registry for a session.

    Args:
        tux: The CliTux instance handlers are bound to.
        eggs: Enable Easter egg commands.
        jupyter_url: Jupyter URL (enables /jupyter when set).
        discover: Also let discovered plugins register their commands.

    Returns:
        A registry holding the built-ins and, unless disabled, everything the
        installed plugins contributed.
    """
    from . import (
        agents,
        browser,
        browser_document,
        browser_notebook,
        clear,
        cls,
        code_sandbox,
        codemode_toggle,
        context,
        context_export,
        datalayer,
        exit,
        help,
        mcp_servers,
        models,
        skills,
        status,
        suggestions,
        tools,
        tools_last,
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
        models,
        skills,
        code_sandbox,
        codemode_toggle,
        context_export,
        datalayer,
        tools_last,
        cls,
        browser,
        browser_notebook,
        browser_document,
        suggestions,
    ]

    # Conditionally add egg commands
    if eggs:
        from . import about, gif, rain

        modules.extend([rain, about, gif])

    # Conditionally add jupyter command
    if jupyter_url:
        from . import jupyter

        modules.append(jupyter)

    registry = SlashCommandRegistry()

    for mod in modules:
        module_name = mod.__name__.rsplit(".", 1)[-1]
        spec = spec_from_module(mod, _make_handler(mod.execute, tux))
        if not getattr(mod, "GROUP", None):
            spec.group = _group_for(module_name)
        # A built-in colliding with a built-in is a bug in this file, so it is
        # allowed to raise; a plugin colliding is handled below.
        registry.register(spec)

    if discover:
        discover_slash_commands(registry)

    return registry


def build_commands(
    tux: "CliTux",
    eggs: bool = False,
    jupyter_url: Optional[str] = None,
) -> dict[str, SlashCommand]:
    """Build all slash commands, binding handlers to the tux instance.

    Returns:
        Dict mapping command names (including aliases) to commands — the shape
        the terminal UI and its completer consume. The registry behind it is
        available through :func:`build_registry`.
    """
    return build_registry(tux, eggs=eggs, jupyter_url=jupyter_url).as_mapping()


def _make_handler(execute_fn: Callable[..., Any], tux: "CliTux") -> Callable[..., Any]:
    """Create a handler closure that passes tux — and arguments — to a command.

    Most commands take only the session UI. A command that declares a second
    parameter also receives what was typed after its name (`/models <id>`), so
    argument-taking commands are opt-in and the twenty existing ones are
    untouched.
    """
    import inspect

    try:
        takes_args = len(inspect.signature(execute_fn).parameters) > 1
    except (TypeError, ValueError):  # pragma: no cover - builtins, C functions
        takes_args = False

    async def handler(argv: str = "") -> Any:
        if takes_args:
            return await execute_fn(tux, argv)
        return await execute_fn(tux)

    return handler
