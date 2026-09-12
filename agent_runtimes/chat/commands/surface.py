# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /surface - Run code and render the result as a surface."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

import httpx

from agent_runtimes.loop.commands import CommandArgSpec

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "surface"
ALIASES: list[str] = ["a2ui"]
DESCRIPTION = "Run code and render the result as a surface"
GROUP = "Open"

ARGS = (CommandArgSpec(name="code", description="Python to run"),)


def _index(components: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(c.get("id")): c for c in components if isinstance(c, dict)}


def _render(
    tux: "CliTux",
    components: dict[str, dict[str, Any]],
    component_id: str,
    depth: int = 0,
) -> None:
    """Walk the surface tree, printing what a terminal can show.

    A terminal cannot draw an A2UI surface, and pretending otherwise would be
    worse than saying so: text and structure survive, images do not, and the
    reader is told which is which.
    """
    from ..tux import STYLE_ACCENT, STYLE_MUTED

    component = components.get(component_id)
    if component is None:
        return

    indent = "  " * (depth + 1)
    kind = str(component.get("component") or "")

    if kind == "Text":
        variant = str(component.get("variant") or "")
        text = str(component.get("text") or "")
        style = STYLE_ACCENT if variant in {"h1", "h2", "caption"} else STYLE_MUTED
        for line in text.splitlines() or [""]:
            tux.console.print(f"{indent}{line}", style=style)
    elif kind == "Image":
        tux.console.print(
            f"{indent}[image — /browser a2ui to see it]", style=STYLE_MUTED
        )
    elif kind == "Button":
        label = component.get("label") or component.get("text") or "Button"
        tux.console.print(f"{indent}[ {label} ]", style=STYLE_MUTED)

    for child in component.get("children", []) or []:
        _render(tux, components, str(child), depth + 1 if kind == "Card" else depth)
    if component.get("child"):
        _render(tux, components, str(component["child"]), depth + 1)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Run code in the sandbox and print the surface it produced."""
    from ..tux import STYLE_MUTED, STYLE_PRIMARY

    code = (argv or "").strip()
    if not code:
        tux.console.print("  /surface <code>", style=STYLE_MUTED)
        return None

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{tux.server_url}/api/v1/sandbox/execute/a2ui",
                json={"code": code},
                timeout=120.0,
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as error:  # noqa: BLE001
        tux.console.print(f"[red]Could not run that: {error}[/red]")
        return None

    messages = payload.get("messages") or []
    components: dict[str, dict[str, Any]] = {}
    for message in messages:
        update = message.get("updateComponents") if isinstance(message, dict) else None
        if update:
            components.update(_index(update.get("components") or []))

    if not components:
        tux.console.print("  Nothing to show.", style=STYLE_MUTED)
        return None

    tux.console.print()
    tux.console.print("● Surface", style=STYLE_PRIMARY)
    _render(tux, components, "root")
    tux.console.print()
    tux.console.print("  /browser a2ui for the real thing", style=STYLE_MUTED)
    tux.console.print()
    return None
