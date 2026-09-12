# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /document - Open the Agent Lexical UI in the browser."""

from __future__ import annotations

import os
import webbrowser
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "document"
ALIASES: list[str] = ["browser-document", "browser-lexical"]
DESCRIPTION = "Open the Agent Lexical UI in your browser"
SHORTCUT = "escape l"


async def execute(tux: "CliTux") -> Optional[str]:
    """Open the Agent Lexical web UI (lexical editor + chat) in the default browser.

    In dev mode (set ``AGENT_RUNTIMES_DEV_UI=1``) the page is loaded from the
    Vite dev server (default ``http://localhost:5173``, override with
    ``AGENT_RUNTIMES_DEV_UI_URL``) instead of the built ``/static`` bundle. The
    dev server proxies ``/api`` to the backend, so the chat still connects.
    """
    if os.environ.get("AGENT_RUNTIMES_DEV_UI", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    ):
        dev_base = os.environ.get(
            "AGENT_RUNTIMES_DEV_UI_URL", "http://localhost:5173"
        ).rstrip("/")
        url = f"{dev_base}/html/agent-document.html?agentId={tux.agent_id}"
    else:
        url = f"{tux.server_url}/static/agent-document.html?agentId={tux.agent_id}"
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
    tux.console.print()
    tux.console.print(
        f"  [link={url}][bold white on rgb(22,160,133)] Open Document [/][/link]"
    )
    tux.console.print()
    webbrowser.open(url)
    return None
