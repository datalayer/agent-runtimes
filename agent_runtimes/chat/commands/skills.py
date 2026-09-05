# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /skills - List skills, and turn them on or off."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

import httpx

from agent_runtimes.loop.commands import CommandArgSpec

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "skills"
ALIASES: list[str] = []
DESCRIPTION = "List skills, and enable or disable them for this agent"
SHORTCUT = "escape k"
GROUP = "Capabilities"


def _catalog_ids() -> list[str]:
    """Skill ids for completion, from the catalog rather than the network."""
    try:
        from agent_runtimes.specs.skills import SKILLS_CATALOG

        return sorted(SKILLS_CATALOG)
    except Exception:  # noqa: BLE001
        return []


ARGS = (
    CommandArgSpec(
        name="action",
        description="enable, disable, add or info",
        choices=("enable", "disable", "add", "info"),
    ),
    CommandArgSpec(name="skill-id", description="Skill to act on", choices=_catalog_ids),
)


async def _fetch(tux: "CliTux") -> Optional[dict[str, Any]]:
    """The skill catalog with readiness, from this session's server."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{tux.server_url}/api/v1/configure/skills",
                params={"agent_id": getattr(tux, "agent_id", "") or ""},
                timeout=10.0,
            )
            response.raise_for_status()
            return response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Unable to fetch skills: {error}[/red]")
        return None


def _base_id(ref: str) -> str:
    """`events:0.0.1` and `events` name the same skill."""
    base, _, version = str(ref).rpartition(":")
    return base if base and "." in version else str(ref)


async def _read_spec(tux: "CliTux") -> Optional[dict[str, Any]]:
    """The running agent's spec, which is where enablement lives."""
    agent_id = getattr(tux, "agent_id", "") or ""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{tux.server_url}/api/v1/configure/agents/{agent_id}/spec",
                timeout=10.0,
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Unable to read the agent spec: {error}[/red]")
        return None

    spec = payload.get("spec") if isinstance(payload, dict) else None
    return dict(spec or payload or {})


async def _show(tux: "CliTux") -> None:
    """Print the catalog.

    Deliberately answers without a sandbox: what a skill *is* should be
    readable before paying for compute to run it. Only the "active" column
    needs something running.
    """
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    payload = await _fetch(tux)
    if payload is None:
        return

    skills = payload.get("skills") or []
    if not skills:
        tux.console.print("No skills available", style=STYLE_MUTED)
        return

    spec = await _read_spec(tux) or {}
    enabled = {_base_id(ref) for ref in (spec.get("skills") or [])}
    sandbox = payload.get("sandbox") or {}
    running = bool(sandbox.get("sandbox_running") or sandbox.get("jupyter_connected"))

    tux.console.print()
    tux.console.print(f"● Skills ({len(skills)})", style=STYLE_PRIMARY)
    tux.console.print()

    for skill in skills:
        on = skill["id"] in enabled
        live = skill.get("active")
        marker = "[green]●[/green]" if on else "○"
        state = ""
        if on and running:
            state = " [green](active)[/green]" if live else " [yellow](not loaded)[/yellow]"
        elif on:
            state = " [dim](enabled)[/dim]"

        emoji = skill.get("emoji") or " "
        tux.console.print(
            f"  {marker} {emoji} {skill['id']}{state}",
            style=STYLE_ACCENT if on else STYLE_MUTED,
        )
        description = (skill.get("description") or "").strip()
        if description:
            if len(description) > 72:
                description = description[:69] + "..."
            tux.console.print(f"      {description}", style=STYLE_MUTED)
        if skill.get("missing_env_vars"):
            tux.console.print(
                f"      missing {', '.join(skill['missing_env_vars'])}",
                style=STYLE_WARNING,
            )

    if not running:
        tux.console.print()
        tux.console.print(
            "  No sandbox is running: skills are listed, not loaded.",
            style=STYLE_MUTED,
        )

    tux.console.print()
    tux.console.print("  /skills enable|disable|info <id>", style=STYLE_MUTED)
    tux.console.print()


async def _info(tux: "CliTux", skill_id: str) -> None:
    """Show one skill in full, including its instructions when available."""
    from agent_runtimes.specs.skills import get_skill_spec

    from ..tux import STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    spec = get_skill_spec(skill_id)
    if spec is None:
        tux.console.print(f"[red]Unknown skill: {skill_id}[/red]")
        return

    tux.console.print()
    tux.console.print(f"● {spec.emoji or ''} {spec.name}", style=STYLE_PRIMARY)
    tux.console.print(f"  {spec.description}", style=STYLE_MUTED)
    tux.console.print(f"  id: {spec.id}:{spec.version}", style=STYLE_MUTED)
    if spec.dependencies:
        tux.console.print(
            f"  dependencies: {', '.join(spec.dependencies)}", style=STYLE_MUTED
        )
    if spec.envvars:
        tux.console.print(
            f"  environment: {', '.join(ref.split(':')[0] for ref in spec.envvars)}",
            style=STYLE_WARNING,
        )
    tux.console.print()


async def _toggle(tux: "CliTux", skill_id: str, *, on: bool) -> None:
    """Turn a skill on or off for this agent.

    Enablement lives in the agent spec, so this edits the spec and applies it
    through ``configure-from-spec`` — the same route the pod companion uses.
    No second mechanism for the same fact.
    """
    from agent_runtimes.specs.skills import get_skill_spec

    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    skill = get_skill_spec(skill_id)
    if skill is None:
        tux.console.print(f"[red]Unknown skill: {skill_id}[/red]")
        tux.console.print("  /skills to see what is available.", style=STYLE_MUTED)
        return

    spec = await _read_spec(tux)
    if spec is None:
        return

    current = list(spec.get("skills") or [])
    without = [ref for ref in current if _base_id(ref) != skill.id]
    if on:
        spec["skills"] = [*without, f"{skill.id}:{skill.version}"]
    else:
        spec["skills"] = without

    if spec["skills"] == current:
        tux.console.print(
            f"  {skill.id} is already {'enabled' if on else 'disabled'}",
            style=STYLE_MUTED,
        )
        return

    agent_id = getattr(tux, "agent_id", "") or ""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/agents/configure-from-spec",
                json={
                    "agent_spec_id": spec.get("id") or agent_id,
                    "agent_spec": spec,
                },
                timeout=60.0,
            )
            response.raise_for_status()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Unable to update skills: {error}[/red]")
        return

    tux.console.print()
    tux.console.print(
        f"● {skill.name} {'enabled' if on else 'disabled'}", style=STYLE_PRIMARY
    )
    if on and skill.dependencies:
        tux.console.print(
            f"  requires {', '.join(skill.dependencies)} in the sandbox",
            style=STYLE_MUTED,
        )
    tux.console.print()


async def _add(tux: "CliTux", skill_id: str) -> None:
    """Install a skill's dependencies into the running sandbox, then enable it.

    Installing is separate from enabling because they can fail separately: a
    skill can be enabled on a spec long before any sandbox exists to hold its
    packages.
    """
    from agent_runtimes.specs.skills import get_skill_spec

    from ..tux import STYLE_MUTED, STYLE_PRIMARY, STYLE_WARNING

    skill = get_skill_spec(skill_id)
    if skill is None:
        tux.console.print(f"[red]Unknown skill: {skill_id}[/red]")
        return

    if skill.dependencies:
        packages = " ".join(skill.dependencies)
        tux.console.print()
        tux.console.print(f"● Installing {packages}", style=STYLE_PRIMARY)
        code = (
            "import subprocess, sys\n"
            f"print(subprocess.run([sys.executable, '-m', 'pip', 'install', "
            f"*{skill.dependencies!r}], capture_output=True, text=True).stdout[-2000:])"
        )
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{tux.server_url}/api/v1/sandbox/execute",
                    json={"code": code},
                    timeout=600.0,
                )
                response.raise_for_status()
                result = response.json()
        except Exception as error:  # noqa: BLE001
            tux.console.print(f"[red]Install failed: {error}[/red]")
            tux.console.print(
                "  A sandbox has to be running to hold the packages.",
                style=STYLE_WARNING,
            )
            return

        if result.get("error"):
            tux.console.print(f"[red]{result['error']}[/red]")
            return
        tail = (result.get("stdout") or "").strip().splitlines()[-3:]
        for line in tail:
            tux.console.print(f"  {line}", style=STYLE_MUTED)

    await _toggle(tux, skill_id, on=True)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """List skills, or enable / disable / inspect one."""
    parts = (argv or "").split()
    if not parts:
        await _show(tux)
        return None

    action, *rest = parts
    action = action.lower()
    target = rest[0] if rest else ""

    if action == "add" and target:
        await _add(tux, target)
    elif action in {"enable", "on"} and target:
        await _toggle(tux, target, on=True)
    elif action in {"disable", "off"} and target:
        await _toggle(tux, target, on=False)
    elif action == "info" and target:
        await _info(tux, target)
    else:
        from ..tux import STYLE_MUTED

        tux.console.print(
            "  /skills · /skills enable|disable|add|info <id>",
            style=STYLE_MUTED,
        )
    return None
