# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /status - Show agent-runtimes CLI status."""

from __future__ import annotations

import csv
from io import StringIO
from typing import TYPE_CHECKING, Optional
from urllib.parse import urlparse

import httpx
from rich.text import Text

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "status"
ALIASES: list[str] = []
DESCRIPTION = "Show loop status including model, tokens, and connectivity"
SHORTCUT = "escape s"


async def execute(tux: "CliTux") -> Optional[str]:
    """Show status information."""
    from ..cli import _format_startup_info
    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    tux.console.print()
    tux.console.print("● Loop Status", style=STYLE_PRIMARY)
    tux.console.print()

    # Version
    from .. import __version__

    tux.console.print(f"  Version: {__version__.__version__}", style=STYLE_MUTED)

    parsed = urlparse(tux.server_url)
    runtime_host = parsed.hostname or "127.0.0.1"
    runtime_port = parsed.port or (443 if parsed.scheme == "https" else 80)

    startup_info: dict | None = None
    agent_spec: dict = {}

    # Connection test + fetch startup/spec metadata
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{tux.server_url}/health", timeout=5.0)
            if response.status_code == 200:
                tux.console.print("  API: [green]Connected[/green]", style=STYLE_MUTED)
            else:
                tux.console.print(
                    f"  API: [yellow]Status {response.status_code}[/yellow]",
                    style=STYLE_MUTED,
                )

            startup_response = await client.get(
                f"{tux.server_url}/health/startup", timeout=5.0
            )
            if startup_response.status_code == 200:
                startup_info = startup_response.json()

            spec_response = await client.get(
                f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/spec",
                timeout=5.0,
            )
            if spec_response.status_code == 200:
                data = spec_response.json()
                if isinstance(data, dict):
                    agent_spec = data

            # Prefer live per-request token usage exported by the server.
            # This avoids stale local counters and keeps /status authoritative.
            export_response = await client.get(
                f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/context-export",
                timeout=5.0,
            )
            if export_response.status_code == 200:
                export_payload = export_response.json()
                csv_blob = export_payload.get("csv", "")
                if isinstance(csv_blob, str) and csv_blob.strip():
                    reader = csv.DictReader(StringIO(csv_blob))
                    total_in = 0
                    total_out = 0
                    for row in reader:
                        try:
                            total_in += int(row.get("Input_Tokens", 0) or 0)
                        except Exception:
                            pass
                        try:
                            total_out += int(row.get("Output_Tokens", 0) or 0)
                        except Exception:
                            pass
                    tux.stats.total_input_tokens = total_in
                    tux.stats.total_output_tokens = total_out
    except Exception:
        tux.console.print("  API: [red]Disconnected[/red]", style=STYLE_MUTED)

    # Runtime startup block (matches startup display format)
    startup_block = _format_startup_info(runtime_host, runtime_port, startup_info)
    if startup_block:
        tux.console.print(Text.from_ansi(startup_block))
        tux.console.print()

    # Ready line summary in the same style as startup
    try:
        spec_name = str(agent_spec.get("name") or "").strip()
        spec_desc = str(agent_spec.get("description") or "").strip()
        spec_emoji = str(agent_spec.get("emoji") or "").strip()

        agent_info = (startup_info or {}).get("agent", {}) or {}
        sandbox_info = (startup_info or {}).get("sandbox", {}) or {}

        agent_label = spec_name or str(agent_info.get("name") or tux.agent_id)
        agent_prefix = f"{spec_emoji}  " if spec_emoji else ""

        ready_suffix = ""
        if spec_desc:
            desc_line = spec_desc.split("\n", 1)[0].strip()
            if len(desc_line) > 90:
                desc_line = desc_line[:87].rstrip() + "..."
            ready_suffix = f" - {desc_line}"

        mcp_list = agent_info.get("mcp_servers")
        if mcp_list is None:
            mcp_list = agent_spec.get("mcp_servers") or []
        mcp_count = len(mcp_list or [])

        skill_list = agent_info.get("skills")
        if skill_list is None:
            skill_list = agent_spec.get("skills") or []
        skill_count = len(skill_list or [])

        sandbox_variant = str(sandbox_info.get("variant") or "").lower()
        codemode_on = bool(agent_info.get("codemode"))

        summary_parts: list[str] = [
            f"{mcp_count} MCP server{'s' if mcp_count != 1 else ''}"
        ]
        if skill_count:
            summary_parts.append(
                f"{skill_count} skill{'s' if skill_count != 1 else ''}"
            )
        if sandbox_variant == "jupyter-server":
            summary_parts.append("Jupyter sandbox")
        if codemode_on:
            summary_parts.append("Code Mode")

        summary_text = f" ({' • '.join(summary_parts)})" if summary_parts else ""

        tux.console.print(
            "[rgb(26,188,156)]●[/rgb(26,188,156)] "
            "[bold white]Agent [/bold white]"
            f"[rgb(46,204,113)]{agent_prefix}{agent_label}[/rgb(46,204,113)]"
            "[bold white] is started and ready[/bold white]"
            f"[dim]{ready_suffix}{summary_text}[/dim]"
        )
        tux.console.print()
    except Exception:
        # Status command should never fail because of a display-only issue.
        pass

    # Session stats
    tux.console.print(
        "  Session tokens: "
        f"{tux._format_tokens(tux.stats.total_tokens)} "
        f"({tux._format_tokens(tux.stats.total_input_tokens)} in / "
        f"{tux._format_tokens(tux.stats.total_output_tokens)} out)",
        style=STYLE_MUTED,
    )
    tux.console.print(f"  Messages: {tux.stats.messages}", style=STYLE_MUTED)
    tux.console.print()
    return None
