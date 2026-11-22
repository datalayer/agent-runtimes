# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The slash command registry — now the reactor's.

The registry that grew here moved to :mod:`reactor.slash`, where any reactor
host — this terminal, the ``examples/repl`` demo, whatever comes next — can
build on it. This module is the dictionary kept so everything written against
the agent-runtimes names imports unchanged.
"""

from __future__ import annotations

from reactor.slash import (
    CommandArgSpec,
    CommandCollisionError,
    CommandHandler,
    SlashCommandRegistry,
    SlashCommandSpec,
    spec_from_module,
)

__all__ = [
    "CommandArgSpec",
    "CommandCollisionError",
    "CommandHandler",
    "SlashCommandRegistry",
    "SlashCommandSpec",
    "spec_from_module",
]
