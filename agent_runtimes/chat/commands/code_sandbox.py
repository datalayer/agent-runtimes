# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /code-sandbox - Show the code sandbox details."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "code-sandbox"
ALIASES: list[str] = ["sandbox"]
DESCRIPTION = "Show the code sandbox details (variant, kernel, Jupyter server)"
SHORTCUT = "escape b"


def _to_ws(url: Optional[str]) -> Optional[str]:
    """Derive a WebSocket URL from an http(s) Jupyter URL."""
    if not url:
        return None
    if url.startswith("https://"):
        return "wss://" + url[len("https://") :]
    if url.startswith("http://"):
        return "ws://" + url[len("http://") :]
    return url


async def execute(tux: "CliTux") -> Optional[str]:
    """Show code sandbox details from the server's startup info."""
    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    tux.console.print()
    tux.console.print("● Code Sandbox", style=STYLE_PRIMARY)
    tux.console.print()

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{tux.server_url}/health/startup", timeout=5.0)
            response.raise_for_status()
            sandbox = response.json().get("sandbox", {}) or {}
    except Exception as exc:  # noqa: BLE001
        tux.console.print(
            f"  [red]Unable to fetch sandbox details:[/red] {exc}",
            style=STYLE_MUTED,
        )
        tux.console.print()
        return None

    variant = sandbox.get("variant") or "unknown"
    running = sandbox.get("sandbox_running")
    state = "[green]running[/green]" if running else "[yellow]stopped[/yellow]"
    tux.console.print(f"  Variant: {variant} ({state})", style=STYLE_MUTED)

    if variant == "jupyter-server":
        jupyter_url = sandbox.get("jupyter_url")
        kernel_name = sandbox.get("kernel_name") or "python3"
        kernel_id = sandbox.get("kernel_id")
        username = sandbox.get("username")
        token = sandbox.get("jupyter_token")
        ws_url = _to_ws(jupyter_url)

        tux.console.print(f"  Kernel Name: {kernel_name}", style=STYLE_MUTED)
        tux.console.print(
            f"  Kernel ID: {kernel_id or '[dim]not started[/dim]'}",
            style=STYLE_MUTED,
        )
        if username:
            tux.console.print(f"  User: {username}", style=STYLE_MUTED)
        if jupyter_url:
            tux.console.print(f"  Server URL: {jupyter_url}", style=STYLE_MUTED)
        if ws_url:
            tux.console.print(f"  WebSocket URL: {ws_url}", style=STYLE_MUTED)
        if token:
            tux.console.print(f"  Token: {token}", style=STYLE_MUTED)

    tux.console.print()
    return None
