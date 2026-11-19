# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /browser - Open this session in a browser."""

from __future__ import annotations

import webbrowser
from typing import TYPE_CHECKING, Any, Optional

import httpx

from agent_runtimes.loop.commands import CommandArgSpec

from ..pages import split_jupyter_url

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "browser"
ALIASES: list[str] = ["chat"]
DESCRIPTION = (
    "Open this session in your browser (chat, notebook, document, sandbox, a2ui)"
)
SHORTCUT = "escape w"
GROUP = "Open"

#: Views the workspace can open on. Until the workspace ships, everything but
#: `chat` falls back to the page that exists today.
VIEWS = ("chat", "notebook", "document", "sandbox", "a2ui")

ARGS = (
    CommandArgSpec(
        name="view",
        description="Which view to open on",
        choices=VIEWS,
    ),
)

#: Pages that exist today, per view, until the LOOP workspace lands.
_LEGACY_PAGES = {
    "chat": "agent.html",
    "notebook": "agent-notebook.html",
    "document": "agent-document.html",
}


def _handoff_runtime(tux: "CliTux") -> dict[str, Any]:
    """Where this session's agent runs, for the page to take that place.

    On Datalayer (``tux.where``) the page is served through the relay, which
    looks like a local server, so it is told: the runtime's name, and its
    Jupyter base URL and token — what ``/notebook`` opens the runtime's
    Jupyter with. The token goes in the handoff, never in the page's URL.

    Raises
    ------
    ValueError
        On Datalayer with no Jupyter address for the runtime.
    """
    if not tux.where:
        return {"where": "local"}
    base, token = split_jupyter_url(tux.jupyter_url or "")
    if not (base and token and tux.cloud_runtime):
        raise ValueError(
            f"This session runs on {tux.where}, and its runtime's Jupyter server "
            "is not known here: the page would have no notebook to open."
        )
    return {
        "where": "datalayer",
        "name": tux.cloud_runtime,
        "jupyter_url": base,
        "jupyter_token": token,
    }


async def _mint_handoff(tux: "CliTux", view: str) -> Optional[str]:
    """Ask the server for a single-use code that carries this session over.

    Returns the code, or ``None`` when the server is too old to know about
    handoffs — in which case the browser still opens, just without continuity.
    """
    session = getattr(tux, "loop_session", None)
    session_id = (
        getattr(session, "conversation_id", None)
        or getattr(tux, "conversation_id", None)
        or getattr(tux, "agent_id", "")
        or "session"
    )
    body = {
        "agent_id": getattr(tux, "agent_id", "") or "",
        "conversation_id": getattr(session, "conversation_id", None),
        "model": getattr(session, "model", None),
        "view": view,
        "sandbox": dict(getattr(session, "sandbox", {}) or {}),
        "runtime": _handoff_runtime(tux),
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/loop/sessions/{session_id}/handoff",
                json=body,
                timeout=10.0,
            )
            response.raise_for_status()
            return str(response.json().get("code") or "") or None
    except Exception as error:  # noqa: BLE001
        # Not fatal: an older server simply cannot hand the session over.
        tux.console.print(
            f"[dim]Session handoff unavailable ({error}); opening a fresh page.[/dim]"
        )
        return None


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Open the workspace in a browser, attached to this session."""
    from ..tux import STYLE_MUTED

    view = (argv or "").strip().lower() or "chat"
    if view not in VIEWS:
        tux.console.print(
            f"  Unknown view {view!r}. One of: {', '.join(VIEWS)}", style=STYLE_MUTED
        )
        return None

    try:
        code = await _mint_handoff(tux, view)
    except ValueError as refused:
        tux.console.print(f"  {refused}", style=STYLE_MUTED)
        return None

    if code:
        url = f"{tux.server_url}/loop?handoff={code}"
        if view != "chat":
            url += f"&view={view}"
    else:
        # Until the workspace ships, fall back to the page that exists.
        page = _LEGACY_PAGES.get(view, _LEGACY_PAGES["chat"])
        url = f"{tux.server_url}/static/{page}?agentId={tux.agent_id}"

    tux.console.print()
    tux.console.print(
        f"  [link={url}][bold white on rgb(22,160,133)] Open {view} [/][/link]"
    )
    if code:
        tux.console.print(
            "  Same agent, same sandbox, same conversation. The link expires in a minute.",
            style=STYLE_MUTED,
        )
    tux.console.print()
    webbrowser.open(url)
    return None
