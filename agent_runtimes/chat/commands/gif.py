# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /gif - Black hole spinning animation (Easter egg)."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "gif"
ALIASES: list[str] = []
DESCRIPTION = "Black hole spinning animation"
SHORTCUT = "escape g"


async def execute(tux: "CliTux") -> Optional[str]:
    """Display black hole spinning animation (5 seconds)."""
    from ..animations import gif_animation
    await gif_animation(tux.console)
    return None
