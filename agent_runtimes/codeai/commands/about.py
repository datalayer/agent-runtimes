# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /about - About Datalayer animation (Easter egg)."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "about"
ALIASES: list[str] = []
DESCRIPTION = "About Datalayer"
SHORTCUT = "escape l"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Display About Datalayer animation."""
    from ..animations import about_animation
    await about_animation(tux.console)
    return None
