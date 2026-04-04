# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /browser - Open the Agent chat UI in the browser."""

from __future__ import annotations

import webbrowser
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "browser"
ALIASES: list[str] = []
DESCRIPTION = "Open the Agent chat UI in your browser"
SHORTCUT = "escape w"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Open the Agent chat web UI in the default browser."""
    url = f"{tux.server_url}/static/agent.html?agentId={tux.agent_id}"
    tux.console.print(f"  Opening [bold cyan]{url}[/bold cyan]")
    webbrowser.open(url)
    return None
