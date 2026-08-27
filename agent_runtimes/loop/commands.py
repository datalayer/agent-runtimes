# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The slash command registry.

A slash command used to be a module in ``agent_runtimes.chat.commands`` that
``build_commands`` knew about by name. That works exactly as long as every
command lives in this repository.

The registry is the same idea with the hard-coded list taken out: commands are
*registered*, by the built-ins and by whatever plugins the reactor discovers
(see :mod:`agent_runtimes.loop.discovery`), and a package that ships a ``/deploy``
command can add one without editing anything here.

:class:`SlashCommandSpec` is the Python mirror of the TypeScript
``CommandContribution``, so a command is described the same way in the terminal
and in the browser workspace even when the two implementations differ — a Rich
panel there, a React panel here.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Iterator, Optional, Sequence

logger = logging.getLogger(__name__)

#: What a command handler returns: an optional prompt to send on its behalf.
CommandHandler = Callable[[], Awaitable[Optional[str]]]


class CommandCollisionError(ValueError):
    """Raised when a command name or alias is already taken."""


@dataclass(frozen=True)
class CommandArgSpec:
    """One argument of a slash command, used to drive completion.

    ``choices`` may be a callable so a command can complete against live state
    — the MCP servers currently configured, the models actually reachable —
    rather than a list frozen at import time.
    """

    name: str
    description: str = ""
    required: bool = False
    choices: Sequence[str] | Callable[[], Sequence[str]] = ()

    def resolve_choices(self) -> tuple[str, ...]:
        """Current values for this argument, never raising at the prompt."""
        source = self.choices
        if callable(source):
            try:
                source = source()
            except Exception as error:  # noqa: BLE001
                logger.debug("Choices for %s could not be resolved: %s", self.name, error)
                return ()
        return tuple(str(choice) for choice in source or ())


@dataclass
class SlashCommandSpec:
    """A slash command, however it was contributed."""

    name: str
    description: str = ""
    aliases: tuple[str, ...] = ()
    shortcut: Optional[str] = None
    #: Grouping for `/help`. Commands with no group land under "General".
    group: str = "General"
    args: tuple[CommandArgSpec, ...] = ()
    handler: Optional[CommandHandler] = None
    #: Where it came from — "builtin" or a plugin name. Shown when a collision
    #: is refused, so the culprit is named rather than guessed at.
    source: str = "builtin"

    @property
    def names(self) -> tuple[str, ...]:
        """The primary name and every alias."""
        return (self.name, *self.aliases)


@dataclass
class SlashCommandRegistry:
    """Every slash command available in a session, by name and by alias."""

    _by_name: dict[str, SlashCommandSpec] = field(default_factory=dict)
    _primary: dict[str, SlashCommandSpec] = field(default_factory=dict)

    def register(self, spec: SlashCommandSpec) -> SlashCommandSpec:
        """Register a command, refusing to shadow an existing name.

        Raises :class:`CommandCollisionError` on any collision. Callers that
        must not bring the session down over one bad plugin should use
        :meth:`try_register`.
        """
        for name in spec.names:
            existing = self._by_name.get(name)
            if existing is not None:
                raise CommandCollisionError(
                    f"/{name} is already registered by {existing.source!r}; "
                    f"{spec.source!r} cannot take it"
                )
        for name in spec.names:
            self._by_name[name] = spec
        self._primary[spec.name] = spec
        return spec

    def try_register(self, spec: SlashCommandSpec) -> bool:
        """Register a command, logging and skipping on collision.

        The posture for anything discovered rather than shipped: a third-party
        command that clashes with `/help` costs a warning, not a CLI that
        refuses to start.
        """
        try:
            self.register(spec)
        except CommandCollisionError as error:
            logger.warning("Slash command not registered: %s", error)
            return False
        return True

    def resolve(self, name: str) -> Optional[SlashCommandSpec]:
        """Look a command up by primary name or alias, with or without a slash."""
        return self._by_name.get(name.lstrip("/").strip().lower())

    def __contains__(self, name: object) -> bool:
        return isinstance(name, str) and self.resolve(name) is not None

    def __iter__(self) -> Iterator[SlashCommandSpec]:
        """Primary commands, alphabetically — aliases are not yielded twice."""
        return iter(sorted(self._primary.values(), key=lambda spec: spec.name))

    def __len__(self) -> int:
        return len(self._primary)

    def names(self) -> tuple[str, ...]:
        """Every primary command name."""
        return tuple(sorted(self._primary))

    def by_group(self) -> dict[str, list[SlashCommandSpec]]:
        """Primary commands grouped for `/help`, groups alphabetical."""
        grouped: dict[str, list[SlashCommandSpec]] = {}
        for spec in self:
            grouped.setdefault(spec.group or "General", []).append(spec)
        return {group: grouped[group] for group in sorted(grouped)}

    def as_mapping(self) -> dict[str, SlashCommandSpec]:
        """Name-and-alias mapping, the shape the terminal UI consumes."""
        return dict(self._by_name)


def spec_from_module(
    module: Any,
    handler: CommandHandler,
    *,
    source: str = "builtin",
) -> SlashCommandSpec:
    """Build a spec from a command module.

    The one-file-per-command modules in :mod:`agent_runtimes.chat.commands`
    export ``NAME``, ``ALIASES``, ``DESCRIPTION``, ``SHORTCUT`` and ``execute``.
    That contract is kept — the registry adapts it rather than asking twenty
    working commands to be rewritten — and ``GROUP`` / ``ARGS`` are optional
    additions a command can opt into.
    """
    return SlashCommandSpec(
        name=module.NAME,
        description=getattr(module, "DESCRIPTION", ""),
        aliases=tuple(getattr(module, "ALIASES", ()) or ()),
        shortcut=getattr(module, "SHORTCUT", None),
        group=getattr(module, "GROUP", "General"),
        args=tuple(getattr(module, "ARGS", ()) or ()),
        handler=handler,
        source=source,
    )
