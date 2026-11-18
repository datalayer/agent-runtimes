# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What the chat's title bar tells the agent.

A header UI (``agentspecs/ui/<id>.yaml``, ``header``) puts buttons,
drop-downs and indicators in the chat's title bar. Its indicators are set by
the agent, with a frontend tool the page runs; its drop-downs go the other
way: the page sends the option each one is on with every run
(``forwardedProps.loop.header``, an option id by item id, by UI id), and the
runtime tells the agent their sentences for that run only — as it does the
modes of the composer (:mod:`agent_runtimes.apps.composer`).

The page sends ids, never words: the sentences are the UI spec's
(``says``, an option's own first, ``{label}`` the option chosen), so what
the agent is told is what the catalogue declares. The rule is agentspecs'
(``agentspecs.ui.header_says``), said again here on the runtime's catalogue.
"""

from __future__ import annotations

from typing import Any, List, Mapping, Optional

from agent_runtimes.specs.ui import get_ui

#: The header UIs a run names at most: a chat has one, seldom two.
HEADERS_AT_MOST = 4


def header_says(ui_id: str, chosen: Mapping[str, Any]) -> List[str]:
    """What the agent is told of the options chosen in one header UI, a sentence each.

    Parameters
    ----------
    ui_id : str
        The header UI, by its id in the catalogue.
    chosen : Mapping[str, Any]
        The option each drop-down is on: an option id by item id.

    Returns
    -------
    List[str]
        The sentences, in the order of the header's items; none for an
        option that says nothing ("No limit").

    Raises
    ------
    ValueError
        When the UI declares no header, an item is not a drop-down of it, or
        an option is not one of the item's, in a sentence.
    """
    spec = get_ui(ui_id)
    header = spec.header if spec is not None else None
    if not header:
        raise ValueError(f"There is no header UI named {ui_id!r}.")
    choices = {
        item["id"]: item
        for item in header.get("items") or []
        if item.get("kind") == "choice"
    }
    for item_id in chosen:
        if str(item_id) not in choices:
            raise ValueError(f"The header {ui_id!r} has no drop-down {item_id!r}.")
    said: List[str] = []
    for item_id, item in choices.items():
        if item_id not in chosen:
            continue
        option_id = str(chosen[item_id])
        option = next(
            (each for each in item.get("options") or [] if each["id"] == option_id),
            None,
        )
        if option is None:
            raise ValueError(f"{item['label']} has no option {option_id!r}.")
        words = option.get("says")
        if words is None:
            words = (item.get("says") or "").replace("{label}", option["label"])
        if words.strip():
            said.append(words.strip())
    return said


def header_instructions(header: Any) -> str:
    """What a run is told of its title bar's drop-downs: ``forwardedProps.loop.header``.

    Parameters
    ----------
    header : Any
        What the page sent: ``{<ui id>: {<item id>: <option id>}}``, or
        nothing.

    Returns
    -------
    str
        The sentences, a line each; empty when nothing is chosen that says
        something.

    Raises
    ------
    ValueError
        When what was sent is not options by item by header UI, or names a
        header, a drop-down or an option the catalogue does not have.
    """
    if header is None:
        return ""
    if not isinstance(header, Mapping):
        raise ValueError("The header's choices are options by item id, by header UI.")
    if len(header) > HEADERS_AT_MOST:
        raise ValueError(f"A run names {HEADERS_AT_MOST} header UIs at most.")
    said: List[str] = []
    for ui_id, chosen in header.items():
        if not isinstance(chosen, Mapping):
            raise ValueError(
                f"The choices of the header {ui_id!r} are options by item id."
            )
        said.extend(header_says(str(ui_id), chosen))
    return "\n".join(said)


def with_header(instructions: Optional[str], header: Any) -> str:
    """A run's instructions, then what its title bar's drop-downs say."""
    return "\n\n".join(
        part
        for part in ((instructions or "").strip(), header_instructions(header))
        if part
    )
