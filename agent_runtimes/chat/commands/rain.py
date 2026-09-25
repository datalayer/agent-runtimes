# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /rain - Matrix rain animation (Easter egg)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "rain"
ALIASES: list[str] = []
DESCRIPTION = "Matrix rain animation"
SHORTCUT = None


async def execute(tux: "CliTux") -> Optional[str]:
    """Display Matrix rain animation (5 seconds)."""
    from ..animations import rain_animation

    await rain_animation(tux.console)
    return None
