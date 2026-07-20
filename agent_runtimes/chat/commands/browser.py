# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /chat - Open the Agent chat UI in the browser."""

from __future__ import annotations

import webbrowser
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "chat"
ALIASES: list[str] = ["browser"]
DESCRIPTION = "Open the Agent chat UI in your browser"
SHORTCUT = "escape w"


async def execute(tux: "CliTux") -> Optional[str]:
    """Open the Agent chat web UI in the default browser."""
    url = f"{tux.server_url}/static/agent.html?agentId={tux.agent_id}"
    tux.console.print()
    tux.console.print(
        f"  [link={url}][bold white on rgb(22,160,133)] Open Chat [/][/link]"
    )
    tux.console.print()
    webbrowser.open(url)
    return None
