# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Slash command: /suggestions - List and pick an agent suggestion."""

from __future__ import annotations

from typing import Optional, TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from ..tux import CodeAITux

NAME = "suggestions"
ALIASES = ["suggest"]
DESCRIPTION = "List available suggestions and pick one as next prompt"
SHORTCUT = "escape u"


async def execute(tux: "CodeAITux") -> Optional[str]:
    """Fetch suggestions from the running agent spec, display them numbered,
    and let the user choose one to use as the next prompt.

    Returns:
        The chosen suggestion text, or None if cancelled / no suggestions.
    """
    from ..tux import STYLE_PRIMARY, STYLE_ACCENT, STYLE_MUTED, STYLE_WARNING
    from ..banner import GREEN_MEDIUM, RESET

    # Fetch the agent spec which contains the suggestions list
    suggestions: list[str] = []
    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/spec"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
            suggestions = data.get("suggestions", [])
    except Exception as e:
        tux.console.print(f"[red]Error fetching suggestions: {e}[/red]")
        return None

    # Append extra suggestions provided via --suggestions CLI flag
    if tux.extra_suggestions:
        suggestions = suggestions + tux.extra_suggestions

    if not suggestions:
        tux.console.print()
        tux.console.print("● No suggestions available for this agent.", style=STYLE_MUTED)
        tux.console.print()
        return None

    # Display numbered suggestions
    tux.console.print()
    tux.console.print(f"● Suggestions ({len(suggestions)}):", style=STYLE_PRIMARY)
    tux.console.print()

    for i, suggestion in enumerate(suggestions, 1):
        tux.console.print(f"  {i}. {suggestion}", style=STYLE_ACCENT)

    tux.console.print()

    # Prompt user to choose
    while True:
        try:
            choice = input(
                f"{GREEN_MEDIUM}Choose a suggestion [1-{len(suggestions)}] "
                f"(Enter to cancel): {RESET}"
            ).strip()

            if not choice:
                tux.console.print("  Cancelled.", style=STYLE_MUTED)
                return None

            idx = int(choice) - 1
            if 0 <= idx < len(suggestions):
                selected = suggestions[idx]
                tux.console.print()
                tux.console.print("  Selected:", style=STYLE_PRIMARY, end=" ")
                tux.console.print(selected, style=STYLE_ACCENT)
                tux.console.print()
                return selected
            else:
                tux.console.print(
                    f"  Please enter a number between 1 and {len(suggestions)}.",
                    style=STYLE_MUTED,
                )
        except ValueError:
            tux.console.print(
                f"  Please enter a number between 1 and {len(suggestions)}.",
                style=STYLE_MUTED,
            )
        except (KeyboardInterrupt, EOFError):
            tux.console.print()
            tux.console.print("  Cancelled.", style=STYLE_MUTED)
            return None
