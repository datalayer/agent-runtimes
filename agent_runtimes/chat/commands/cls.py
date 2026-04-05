# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /cls - Clear the screen."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "cls"
ALIASES: list[str] = []
DESCRIPTION = "Clear the screen"
SHORTCUT: str | None = None


async def execute(tux: "CliTux") -> Optional[str]:
    """Clear the screen."""
    tux.console.clear()
    return None
