# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /notebook - Open the Agent Notebook UI in the browser."""

from __future__ import annotations

import webbrowser
from typing import TYPE_CHECKING, Optional

from ..pages import agent_page_url

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "notebook"
ALIASES: list[str] = ["browser-notebook"]
DESCRIPTION = "Open the Agent Notebook UI in your browser"
SHORTCUT = "escape n"


async def execute(tux: "CliTux") -> Optional[str]:
    """Open the Agent Notebook web UI (notebook + chat) in the default browser.

    Opened at the session's server address — on Datalayer, the relay that
    carries the person's token — with the session's Jupyter server, which on
    Datalayer is the runtime's own (see `agent_runtimes.chat.pages`).
    """
    url = agent_page_url(
        "agent-notebook.html",
        server_url=tux.server_url,
        agent_id=tux.agent_id,
        jupyter_url=tux.jupyter_url,
    )
    tux.console.print()
    tux.console.print(
        f"  [link={url}][bold white on rgb(22,160,133)] Open Notebook [/][/link]"
    )
    tux.console.print()
    webbrowser.open(url)
    return None
