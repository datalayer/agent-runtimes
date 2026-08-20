# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /skills - List available skills."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional

import httpx

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "skills"
ALIASES: list[str] = []
DESCRIPTION = "List available skills (requires an active sandbox)"
SHORTCUT = "escape k"


async def execute(tux: "CliTux") -> Optional[str]:
    """List available skills (requires an active sandbox)."""
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    # Query server-side status for the active agent.
    try:
        async with httpx.AsyncClient() as client:
            status_url = f"{tux.server_url}/api/v1/configure/codemode/status"
            response = await client.get(
                status_url,
                params={"agent_id": tux.agent_id},
                timeout=10.0,
            )
            response.raise_for_status()
            status_data = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error checking skills status: {e}[/red]")
        return None

    sandbox = status_data.get("sandbox") if isinstance(status_data, dict) else None
    sandbox_variant = ""
    sandbox_running = False
    if isinstance(sandbox, dict):
        sandbox_variant = str(sandbox.get("variant") or "").strip().lower()
        sandbox_running = bool(sandbox.get("sandbox_running"))
        # Jupyter sandboxes can be considered available when connected,
        # even if sandbox_running is not explicitly reported.
        if sandbox_variant == "jupyter-server" and bool(sandbox.get("jupyter_connected")):
            sandbox_running = True

    if not sandbox_running:
        tux.console.print()
        tux.console.print("● Sandbox is not available", style=STYLE_WARNING)
        tux.console.print(
            "  Skills are available only when an active sandbox is available.",
            style=STYLE_MUTED,
        )
        tux.console.print(
            "  Start or attach a sandbox, then run /skills again.",
            style=STYLE_MUTED,
        )
        tux.console.print()
        return None

    # Get skills from codemode status (it includes available_skills)
    skills = status_data.get("available_skills", [])
    active_skills = {s.get("name") for s in status_data.get("skills", [])}

    if not skills:
        tux.console.print("No skills available", style=STYLE_MUTED)
        return None

    tux.console.print()
    tux.console.print(f"● Available Skills ({len(skills)}):", style=STYLE_PRIMARY)
    tux.console.print()

    for skill in skills:
        skill_name = skill.get("name", "Unknown")
        skill_desc = skill.get("description", "")
        is_active = skill_name in active_skills
        # Truncate description if too long
        if len(skill_desc) > 60:
            skill_desc = skill_desc[:57] + "..."
        # Show active status
        status_icon = "[green]●[/green]" if is_active else "○"
        tux.console.print(
            f"  {status_icon} {skill_name}",
            style=STYLE_ACCENT if is_active else STYLE_MUTED,
        )
        if skill_desc:
            tux.console.print(f"    {skill_desc}", style=STYLE_MUTED)

    tux.console.print()
    return None
