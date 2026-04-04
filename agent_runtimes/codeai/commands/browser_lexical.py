# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /browser-lexical - Open the Agent Lexical UI in the browser."""

from __future__ import annotations

import webbrowser
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "browser-lexical"
ALIASES: list[str] = []
DESCRIPTION = "Open the Agent Lexical UI in your browser"
SHORTCUT = "escape l"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Open the Agent Lexical web UI (lexical editor + chat) in the default browser."""
    url = f"{tux.server_url}/static/agent-lexical.html?agentId={tux.agent_id}"
    if tux.jupyter_url:
        # Forward Jupyter connection info so the page can reach the kernel
        import urllib.parse
        base = tux.jupyter_url.split("?")[0].rstrip("/")
        query = tux.jupyter_url.split("?")[1] if "?" in tux.jupyter_url else None
        token = ""
        if query:
            params = urllib.parse.parse_qs(query)
            token = params.get("token", [""])[0]
        url += f"&jupyterBaseUrl={urllib.parse.quote(base, safe='')}"
        if token:
            url += f"&jupyterToken={urllib.parse.quote(token, safe='')}"
    tux.console.print(f"  Opening [bold cyan]{url}[/bold cyan]")
    webbrowser.open(url)
    return None
