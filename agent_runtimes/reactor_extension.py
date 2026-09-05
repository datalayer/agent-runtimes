# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What agent-runtimes contributes to the Datalayer CLI, as a reactor plugin.

`datalayer <command>` is the way into the platform, whichever distribution
implements the command — nobody should have to know that the sandboxes live
here. The Datalayer CLI used to reach them by SPAWNING this package's own
executable when a command was not its own; now it discovers extensions
through the reactor instead, and this module is the extension: the command
groups of agent-runtimes, registered in-process into the host application.

The plugin is advertised by this distribution's entry point::

    [project.entry-points."datalayer.cli"]
    agent-runtimes = "agent_runtimes.reactor_extension:plugin"

so installing agent-runtimes next to the Datalayer CLI is all it takes.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from reactor import PluginManifest

if TYPE_CHECKING:  # pragma: no cover - typing only
    import typer

logger = logging.getLogger(__name__)

#: The identity of the extension, for the reactor.
manifest = PluginManifest(
    name="agent-runtimes",
    version="1.0.0",
    description=(
        "Agent runtimes for the Datalayer CLI: sandboxes, agents, "
        "environments, snapshots and the rest."
    ),
    author="Datalayer",
    tags=["cli", "agents", "sandboxes"],
)

#: The command groups registered into the host, each by its import path.
#:
#: Named rather than imported: a group is loaded when the CLI starts, and one
#: that cannot load — a missing optional dependency, a broken provider — must
#: cost a warning, not the whole command line.
_COMMAND_GROUPS: tuple[str, ...] = (
    "agent_runtimes.commands.agents",
    "agent_runtimes.commands.agent_nodes",
    "agent_runtimes.commands.benchmarks",
    "agent_runtimes.commands.checkpoints",
    "agent_runtimes.commands.console",
    "agent_runtimes.commands.envs",
    "agent_runtimes.commands.evals",
    "agent_runtimes.commands.events",
    "agent_runtimes.commands.memory",
    "agent_runtimes.commands.pools",
    "agent_runtimes.commands.ray",
    "agent_runtimes.commands.sandboxes",
    "agent_runtimes.commands.sandbox_snapshots",
    "agent_runtimes.commands.schedules",
)


class AgentRuntimesCliExtension:
    """The plugin: registers every command group into the host CLI."""

    def provide_cli(self, cli: "typer.Typer") -> None:
        from importlib import import_module

        for module_path in _COMMAND_GROUPS:
            try:
                module = import_module(module_path)
                cli.add_typer(module.app)
            except Exception as error:  # noqa: BLE001
                logger.warning(
                    "The command group %s could not be registered: %s",
                    module_path,
                    error,
                )


def plugin() -> tuple[PluginManifest, AgentRuntimesCliExtension]:
    """What the `datalayer.cli` entry point resolves to."""
    return manifest, AgentRuntimesCliExtension()
