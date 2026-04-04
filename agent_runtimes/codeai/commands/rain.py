# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /rain - Matrix rain animation (Easter egg)."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "rain"
ALIASES: list[str] = []
DESCRIPTION = "Matrix rain animation"
SHORTCUT = "escape r"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Display Matrix rain animation (5 seconds)."""
    from ..animations import rain_animation
    await rain_animation(tux.console)
    return None
