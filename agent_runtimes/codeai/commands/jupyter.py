# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /jupyter - Open the Jupyter server in the browser."""

from __future__ import annotations

import webbrowser
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "jupyter"
ALIASES: list[str] = []
DESCRIPTION = "Open the Jupyter server in your browser"
SHORTCUT = "escape j"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Open the Jupyter server API page in the default browser."""
    if tux.jupyter_url:
        # Append /api so the browser lands on the Jupyter REST API root
        sep = "&" if "?" in tux.jupyter_url else "?"
        base = tux.jupyter_url.split("?")[0].rstrip("/") + "/api"
        query = tux.jupyter_url.split("?")[1] if "?" in tux.jupyter_url else None
        url = f"{base}?{query}" if query else base
        tux.console.print(f"  Opening [bold cyan]{url}[/bold cyan]")
        webbrowser.open(url)
    else:
        tux.console.print("  [yellow]No Jupyter server available.[/yellow]")
    return None
