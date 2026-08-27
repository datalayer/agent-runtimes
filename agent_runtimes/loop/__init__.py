# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The LOOP session: its command registry, its discovery, its session object.

One loop, several front-ends. What a command *is* lives here; how it is drawn
belongs to whichever front-end is driving — a prompt_toolkit terminal, the
browser workspace, a JupyterLab panel.
"""

from agent_runtimes.loop.commands import (
    CommandArgSpec,
    CommandCollisionError,
    CommandHandler,
    SlashCommandRegistry,
    SlashCommandSpec,
    spec_from_module,
)
from agent_runtimes.loop.discovery import (
    ENTRY_POINT_GROUP,
    discover_slash_commands,
)
from agent_runtimes.loop.entrypoint import (
    WORKSPACE_ENTRYPOINTS,
    invoked_name,
    opens_workspace,
)
from agent_runtimes.loop.session import LoopSession

__all__ = [
    "ENTRY_POINT_GROUP",
    "WORKSPACE_ENTRYPOINTS",
    "CommandArgSpec",
    "CommandCollisionError",
    "CommandHandler",
    "LoopSession",
    "SlashCommandRegistry",
    "SlashCommandSpec",
    "discover_slash_commands",
    "invoked_name",
    "opens_workspace",
    "spec_from_module",
]
