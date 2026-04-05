# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /about - About Datalayer animation (Easter egg)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "about"
ALIASES: list[str] = []
DESCRIPTION = "About Datalayer"
SHORTCUT = "escape l"


async def execute(tux: "CliTux") -> Optional[str]:
    """Display About Datalayer animation."""
    from ..animations import about_animation

    await about_animation(tux.console)
    return None
