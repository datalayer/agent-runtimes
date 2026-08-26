# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /datalayer - Connect this agent to Datalayer Notebooks.

Registers the hosted Jupyter MCP endpoint of Datalayer as a tool source for
the running agent, so the loop can read, edit and execute notebooks that live
on the platform rather than only on this machine.

The point of connecting to the hosted endpoint rather than a local Jupyter is
that execution outlives the session: a cell started here keeps running on the
server after the loop moves on or the process stops, and its outputs stay
attached to the notebook.

Authentication uses the Datalayer token this environment already has —
``DATALAYER_TOKEN`` or ``DATALAYER_API_KEY`` — which is the same personal
access token the CLI uses elsewhere. There is no browser flow here: a loop is
not a browser, and asking one to open a window is how automation stalls.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "datalayer"
ALIASES = ["dl", "notebooks"]
DESCRIPTION = "Connect this agent to Datalayer Notebooks (hosted Jupyter MCP)"
SHORTCUT = None

#: The hosted endpoint. Overridable so the command works against a staging
#: deployment or a locally running gateway.
DEFAULT_MCP_URL = "https://mcp.datalayer.run/mcp"

#: The identifier the server is registered under, so a second invocation
#: updates the connection rather than adding a duplicate.
SERVER_ID = "datalayer-jupyter-mcp"

#: Where the token is looked for, in order.
TOKEN_ENV_VARS = ("DATALAYER_TOKEN", "DATALAYER_API_KEY")


def _mcp_url() -> str:
    return (
        os.environ.get("DATALAYER_JUPYTER_MCP_SERVER_URL") or DEFAULT_MCP_URL
    ).rstrip("/")


def _token() -> Optional[str]:
    for name in TOKEN_ENV_VARS:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return None


async def execute(tux: "CliTux") -> Optional[str]:
    """Connect the running agent to the Datalayer MCP endpoint."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

    url = _mcp_url()
    token = _token()

    if not token:
        tux.console.print()
        tux.console.print("● Datalayer", style=STYLE_PRIMARY)
        tux.console.print(
            "  No Datalayer token found in this environment.", style=STYLE_MUTED
        )
        tux.console.print(
            f"  Set one of {', '.join(TOKEN_ENV_VARS)} and run /datalayer again.",
            style=STYLE_MUTED,
        )
        tux.console.print(
            "  Create a token under Settings → API Keys on datalayer.ai.",
            style=STYLE_MUTED,
        )
        tux.console.print()
        return None

    server = {
        "id": SERVER_ID,
        "name": "Datalayer Notebooks",
        "description": (
            "Always-on Jupyter Notebooks on Datalayer, with durable execution: "
            "a cell keeps running after this session ends."
        ),
        "emoji": "🪐",
        "url": url,
        "transport": "http",
        "enabled": True,
        # The gateway reads a bearer token, and answers 401 with the challenge
        # that would start a browser flow — which this caller cannot do.
        "env": {"Authorization": f"Bearer {token}"},
    }

    tux.console.print()
    tux.console.print("● Connecting to Datalayer…", style=STYLE_PRIMARY)

    try:
        async with httpx.AsyncClient() as client:
            base = f"{tux.server_url}/api/v1/mcp"
            response = await client.post(base, json=server, timeout=30.0)
            if response.status_code == 409:
                # Already registered: update it, so a changed token or URL is
                # picked up rather than silently ignored.
                response = await client.put(
                    f"{base}/{SERVER_ID}", json=server, timeout=30.0
                )
            response.raise_for_status()
            registered = response.json()
    except httpx.HTTPStatusError as error:
        tux.console.print(
            f"[red]Could not connect to Datalayer: "
            f"{error.response.status_code} {error.response.text[:200]}[/red]"
        )
        return None
    except Exception as error:  # noqa: BLE001 - surfaced to the user as text
        tux.console.print(f"[red]Could not connect to Datalayer: {error}[/red]")
        return None

    tools = registered.get("tools") or []
    tux.console.print(f"  🪐 {registered.get('name', 'Datalayer')}", style=STYLE_ACCENT)
    tux.console.print(f"     {url}", style=STYLE_MUTED)
    if tools:
        tux.console.print(f"     {len(tools)} tools available", style=STYLE_MUTED)
    else:
        # The tool list is fetched when the server is first used, so an empty
        # list here is normal rather than a failure.
        tux.console.print(
            "     Tools are listed once the agent first uses them.",
            style=STYLE_MUTED,
        )
    tux.console.print()
    tux.console.print(
        "  Ask for a notebook by name, or run /mcp-servers to see the tools.",
        style=STYLE_MUTED,
    )
    tux.console.print(
        "  Work started here keeps running on Datalayer after this session ends.",
        style=STYLE_MUTED,
    )
    tux.console.print()
    return None
