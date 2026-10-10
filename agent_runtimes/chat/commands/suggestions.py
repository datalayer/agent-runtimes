# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /suggestions - List and pick an agent suggestion."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

import httpx

from agent_runtimes.types import AgentSuggestion

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "suggestions"
ALIASES = ["suggest"]
DESCRIPTION = "List available suggestions and pick one as next prompt"
SHORTCUT = "escape u"


def _offered(spec: dict[str, Any], extra: list[str]) -> list[AgentSuggestion]:
    """The agent's suggestions, then those ``--suggestions`` added.

    Parameters
    ----------
    spec : dict
        The agent's creation spec, as ``/configure/agents/{id}/spec`` answers
        it: its ``suggestions`` are ``AgentSuggestion`` records.
    extra : list of str
        The ``--suggestions`` flag's, each a text to send.

    Returns
    -------
    list of AgentSuggestion
        Each with the text sent when it is chosen.
    """
    return [AgentSuggestion.model_validate(item) for item in spec["suggestions"]] + [
        AgentSuggestion(text=text) for text in extra
    ]


async def execute(tux: "CliTux") -> Optional[str]:
    """Fetch suggestions from the running agent spec, display them numbered,
    and let the user choose one to use as the next prompt.

    Under ``loop --prompt`` (``tux.scripted``) they are listed and nothing
    is asked: the next line is the next prompt, not a choice.

    Returns:
        The chosen suggestion's text, or None if cancelled / no suggestions.
    """
    from ..banner import GREEN_MEDIUM, RESET
    from ..tux import STYLE_ACCENT, STYLE_MUTED, STYLE_PRIMARY

    # Fetch the agent spec which contains the suggestions list
    try:
        async with httpx.AsyncClient() as client:
            url = f"{tux.server_url}/api/v1/configure/agents/{tux.agent_id}/spec"
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            spec = response.json()
    except Exception as e:
        tux.console.print(f"[red]Error fetching suggestions: {e}[/red]")
        return None

    if "suggestions" not in spec:
        from ..older_runtime import older_runtime

        said = await older_runtime(tux, "its agent's suggestions")
        tux.console.print(f"[red]{said}[/red]")
        return None
    suggestions = _offered(spec, tux.extra_suggestions)

    if not suggestions:
        tux.console.print()
        tux.console.print(
            "● No suggestions available for this agent.", style=STYLE_MUTED
        )
        tux.console.print()
        return None

    # Display numbered suggestions: the summary, when there is one, then
    # the text that is sent.
    tux.console.print()
    tux.console.print(f"● Suggestions ({len(suggestions)}):", style=STYLE_PRIMARY)
    tux.console.print()

    for i, suggestion in enumerate(suggestions, 1):
        if suggestion.summary:
            tux.console.print(f"  {i}. {suggestion.summary}", style=STYLE_ACCENT)
            tux.console.print(f"     {suggestion.text}", style=STYLE_MUTED)
        else:
            tux.console.print(f"  {i}. {suggestion.text}", style=STYLE_ACCENT)

    tux.console.print()
    if tux.scripted:
        return None

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
                selected = suggestions[idx].text
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
