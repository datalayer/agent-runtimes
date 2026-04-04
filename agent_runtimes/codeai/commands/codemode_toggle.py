# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /codemode-toggle - Toggle codemode on/off."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "codemode-toggle"
ALIASES = ["codemode"]
DESCRIPTION = "Toggle codemode on/off for enhanced code capabilities"
SHORTCUT = "escape o"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Toggle codemode on/off."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_WARNING

    # First get current status
    try:
        async with httpx.AsyncClient() as client:
            status_url = f"{tux.server_url}/api/v1/configure/codemode-status"
            status_response = await client.get(status_url, timeout=10.0)
            status_response.raise_for_status()
            current_status = status_response.json()
    except Exception as e:
        tux.console.print(f"[red]Error checking codemode status: {e}[/red]")
        return None

    current_enabled = current_status.get("enabled", False)
    new_enabled = not current_enabled

    # Toggle to opposite state
    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/codemode/toggle"
            response = await client.post(
                url,
                json={"enabled": new_enabled},
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error toggling codemode: {e}[/red]")
        return None

    enabled = data.get("enabled", False)

    tux.console.print()
    if enabled:
        tux.console.print("● Codemode enabled", style=STYLE_ACCENT)
        tux.console.print("  Enhanced code capabilities are now active.", style=STYLE_MUTED)
        tux.console.print("  Use /skills to see available skills.", style=STYLE_MUTED)
    else:
        tux.console.print("● Codemode disabled", style=STYLE_WARNING)
        tux.console.print("  Standard mode is now active.", style=STYLE_MUTED)
    tux.console.print()
    return None
