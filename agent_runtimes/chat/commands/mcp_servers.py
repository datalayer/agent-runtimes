# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /mcp - MCP servers, their tools, and their logins."""

from __future__ import annotations

import webbrowser
from typing import TYPE_CHECKING, Any, Optional

import httpx

from agent_runtimes.loop.commands import CommandArgSpec

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "mcp"
ALIASES = ["mcp-servers"]
DESCRIPTION = "List MCP servers, connect to them, and inspect their tools"
SHORTCUT = "escape m"
GROUP = "Capabilities"

ACTIONS = ("auth", "logout", "tools", "refresh")

ARGS = (
    CommandArgSpec(
        name="action", description="auth, logout, tools or refresh", choices=ACTIONS
    ),
    CommandArgSpec(name="server", description="MCP server id"),
)


async def _get(tux: "CliTux", path: str, **kwargs: Any) -> Optional[Any]:
    """GET from this session's server, reporting rather than raising."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{tux.server_url}{path}", timeout=15.0, **kwargs
            )
            response.raise_for_status()
            return response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]{error}[/red]")
        return None


async def _show(tux: "CliTux") -> None:
    """List the servers with their connection state and tool counts."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    servers = await _get(tux, "/api/v1/mcp/servers")
    if servers is None:
        return
    if not servers:
        tux.console.print("No MCP servers configured", style=STYLE_MUTED)
        return

    tux.console.print()
    tux.console.print(f"● MCP Servers ({len(servers)})", style=STYLE_PRIMARY)
    tux.console.print()

    for server in servers:
        server_id = server.get("id", "unknown")
        name = server.get("name", server_id)
        tools = server.get("tools", []) or []

        auth = await _get(tux, f"/api/v1/mcp/servers/{server_id}/auth") or {}
        status = auth.get("status", "unknown")

        # Availability and authentication are different questions: a server can
        # be running and unauthenticated, or authenticated and down.
        if not server.get("isAvailable", False):
            marker, note = "[red]●[/red]", "unavailable"
        elif status == "connected":
            marker, note = "[green]●[/green]", "connected"
        elif status == "expired":
            marker, note = "[yellow]●[/yellow]", "login expired"
        elif status == "needs_auth":
            marker, note = "○", "needs auth"
        else:
            marker, note = "○", status

        tux.console.print(f"  {marker} {name} [dim]({server_id})[/dim]", style=STYLE_ACCENT)
        tux.console.print(f"      {note} · {len(tools)} tools", style=STYLE_MUTED)
        if status in {"needs_auth", "expired"}:
            tux.console.print(f"      /mcp auth {server_id}", style=STYLE_WARNING)

    store = (await _get(tux, "/api/v1/mcp/servers/_/auth") or {}).get("store", "")
    tux.console.print()
    if store:
        tux.console.print(f"  Credentials are held by: {store}", style=STYLE_MUTED)
    tux.console.print(
        "  /mcp auth|logout|refresh|tools <server>", style=STYLE_MUTED
    )
    tux.console.print()


async def _tools(tux: "CliTux", server_id: str) -> None:
    """Show one server's tools."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

    server = await _get(tux, f"/api/v1/mcp/servers/{server_id}")
    if server is None:
        return

    tools = server.get("tools", []) or []
    tux.console.print()
    tux.console.print(
        f"● {server.get('name', server_id)} — {len(tools)} tools", style=STYLE_PRIMARY
    )
    tux.console.print()
    for tool in tools:
        tux.console.print(f"  {tool.get('name', '?')}", style=STYLE_ACCENT)
        description = (tool.get("description") or "").strip()
        if description:
            if len(description) > 76:
                description = description[:73] + "..."
            tux.console.print(f"      {description}", style=STYLE_MUTED)
    tux.console.print()


async def _auth(tux: "CliTux", server_id: str) -> None:
    """Start an authorization and send the user to it."""
    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/mcp/servers/{server_id}/auth/start",
                json={},
                timeout=30.0,
            )
            if response.status_code >= 400:
                detail = response.json().get("detail", response.text[:200])
                tux.console.print(f"[red]{detail}[/red]")
                return
            payload = response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Could not start the login: {error}[/red]")
        return

    url = payload.get("authorization_url", "")
    tux.console.print()
    tux.console.print(f"● Connecting to {server_id}", style=STYLE_PRIMARY)
    tux.console.print(f"  [link={url}]Open the authorization page[/link]")
    tux.console.print(
        f"  Credentials will be held by: {payload.get('store', 'unknown')}",
        style=STYLE_MUTED,
    )
    tux.console.print("  Then run /mcp to check the connection.", style=STYLE_MUTED)
    tux.console.print()
    webbrowser.open(url)


async def _logout(tux: "CliTux", server_id: str) -> None:
    """Revoke and forget the credentials for a server."""
    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{tux.server_url}/api/v1/mcp/servers/{server_id}/auth", timeout=30.0
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Could not log out: {error}[/red]")
        return

    tux.console.print()
    if payload.get("forgotten"):
        revoked = "revoked and forgotten" if payload.get("revoked") else "forgotten"
        tux.console.print(f"● {server_id}: {revoked}", style=STYLE_PRIMARY)
        if not payload.get("revoked"):
            # Worth saying plainly: the token may still be honoured upstream.
            tux.console.print(
                "  The server offers no revocation endpoint, so the token may "
                "still be valid until it expires.",
                style=STYLE_MUTED,
            )
    else:
        tux.console.print(f"  Not connected to {server_id}", style=STYLE_MUTED)
    tux.console.print()


async def _refresh(tux: "CliTux", server_id: str) -> None:
    """Renew a login without sending the user back to a browser."""
    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/mcp/servers/{server_id}/auth/refresh",
                timeout=30.0,
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Could not refresh: {error}[/red]")
        return

    tux.console.print()
    if payload.get("status") == "connected":
        tux.console.print(f"● {server_id}: refreshed", style=STYLE_PRIMARY)
    else:
        tux.console.print(
            f"  {server_id}: {payload.get('detail') or payload.get('status')}",
            style=STYLE_MUTED,
        )
        tux.console.print(f"  /mcp auth {server_id}", style=STYLE_MUTED)
    tux.console.print()


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """List MCP servers, or act on one."""
    parts = (argv or "").split()
    if not parts:
        await _show(tux)
        return None

    action, *rest = parts
    action = action.lower()
    server_id = rest[0] if rest else ""

    if action not in ACTIONS:
        from ..tux import STYLE_MUTED

        tux.console.print(
            f"  /mcp · /mcp {' | '.join(ACTIONS)} <server>", style=STYLE_MUTED
        )
        return None

    if not server_id:
        from ..tux import STYLE_MUTED

        tux.console.print(f"  Which server? /mcp {action} <server>", style=STYLE_MUTED)
        return None

    handler = {"auth": _auth, "logout": _logout, "tools": _tools, "refresh": _refresh}[action]
    await handler(tux, server_id)
    return None
