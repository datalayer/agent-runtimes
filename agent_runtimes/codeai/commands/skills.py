# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /skills - List available skills."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "skills"
ALIASES: list[str] = []
DESCRIPTION = "List available skills (requires codemode enabled)"
SHORTCUT = "escape k"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """List available skills (requires codemode enabled)."""
    from ..tux import STYLE_PRIMARY, STYLE_ACCENT, STYLE_MUTED, STYLE_WARNING

    # First check if codemode is enabled
    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/codemode-status"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            status_data = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error checking codemode status: {e}[/red]")
        return None

    codemode_enabled = status_data.get("enabled", False)

    if not codemode_enabled:
        tux.console.print()
        tux.console.print("● Codemode is disabled", style=STYLE_WARNING)
        tux.console.print("  Skills are only available when codemode is enabled.", style=STYLE_MUTED)
        tux.console.print("  Use /codemode-toggle to enable it.", style=STYLE_MUTED)
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
        tux.console.print(f"  {status_icon} {skill_name}", style=STYLE_ACCENT if is_active else STYLE_MUTED)
        if skill_desc:
            tux.console.print(f"    {skill_desc}", style=STYLE_MUTED)

    tux.console.print()
    return None
