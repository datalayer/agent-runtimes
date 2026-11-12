# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The table sessions are listed in: `loop sessions list`, the picker's two
groups, and the listing printed where nobody is at the terminal.

One row a session, one line a row: its number, its uid (whole, always), its
state, its kind, its agent or application, its turns, its age and its title.
It is a markdown table (`table_lines`) wherever it is drawn:

- in a terminal — `loop sessions list`, and the picker, where a row can be
  highlighted — with the terminal's width: the title is the column that is
  cut, with an ellipsis, so that a row is one line and nothing wraps; the
  agent's name gives next in a narrow terminal, a uid never;
- piped, with no width: pipes and a header separator, nothing cut — it
  pastes as markdown.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Mapping, Optional, Sequence

from agent_runtimes.loop.paused import Paused, _ago

#: The columns, in order. The title is the last, and the one that is cut.
COLUMNS = ("#", "Session", "State", "Kind", "Agent", "Turns", "Age", "Title")

#: The columns whose numbers are set to the right.
RIGHT = (0, 5)

ELLIPSIS = "…"

#: The least a title is cut to, however narrow the terminal.
TITLE_MIN = 8

NO_TITLE = "(no title)"


def age(moment: str, now: Optional[datetime] = None) -> str:
    """How old, short enough for a column: ``5m``, ``3h``, ``14d``, ``now``."""
    said = _ago(moment, now)
    if not said or said == "just now":
        return "now" if said else ""
    count, unit = said.split()[:2]
    return f"{count}{unit[0]}"


def _one_line(text: str) -> str:
    """A cell on one line that cannot break its table: no newline, no bare pipe."""
    return " ".join(str(text).split()).replace("|", "\\|")


def cells_of_row(row: Paused, number: int, now: Optional[datetime] = None) -> List[str]:
    """A session of the picker as the table's cells."""
    return [
        str(number),
        row.uid,
        row.state,
        "agent" if row.kind == "agent" else "app",
        _one_line(row.agent if row.kind == "agent" else (row.app_name or row.app_uid)),
        str(row.turns),
        age(row.started_at, now),
        _one_line(row.title) or NO_TITLE,
    ]


def cells_of_session(
    session: Mapping[str, Any], number: int, now: Optional[datetime] = None
) -> List[str]:
    """A session as a runtime's API lists it, as the table's cells."""
    state = str(session.get("state") or "")
    return [
        str(number),
        str(session.get("uid") or ""),
        f"{state}, archived" if session.get("archived") else state,
        "agent" if session.get("kind") == "agent" else "app",
        _one_line(str(session.get("agent") or "")),
        str(int(session.get("turns") or 0)),
        age(str(session.get("started_at") or ""), now),
        _one_line(str(session.get("title") or "")) or NO_TITLE,
    ]


def cut(text: str, width: int) -> str:
    """A text cut to a width, its last character an ellipsis when it was."""
    if len(text) <= width:
        return text
    return text[: max(0, width - 1)].rstrip() + ELLIPSIS


def table_lines(
    rows: Sequence[Sequence[str]], width: Optional[int] = None
) -> List[str]:
    """The table as markdown lines: the header, its separator, one line a row.

    With no ``width`` (piped), nothing is cut and nothing padded but to
    align: a GitHub-flavoured markdown table. With a ``width`` (a terminal's
    columns), the title is cut with an ellipsis so that no line is longer;
    every other cell — a uid above all — is whole.
    """
    # A markdown separator is three dashes at least.
    widths = [
        max(len(COLUMNS[index]), 3, *(len(row[index]) for row in rows))
        for index in range(len(COLUMNS))
    ]
    last = len(COLUMNS) - 1
    cut_too = COLUMNS.index("Agent")
    if width is not None:
        # "| " + cells joined by " | " + " |".
        taken = sum(widths[:last]) + 3 * last + 4
        if width - taken < TITLE_MIN:
            # Too narrow even for a short title: the agent's name gives next.
            # A uid never does.
            widths[cut_too] = max(
                TITLE_MIN, widths[cut_too] - (TITLE_MIN - (width - taken))
            )
            taken = sum(widths[:last]) + 3 * last + 4
        widths[last] = max(TITLE_MIN, min(widths[last], width - taken))

    def line(cells: Sequence[str]) -> str:
        drawn = []
        for index, cell in enumerate(cells):
            cell = cut(cell, widths[index]) if index in (last, cut_too) else cell
            drawn.append(
                cell.rjust(widths[index])
                if index in RIGHT
                else cell.ljust(widths[index])
            )
        return "| " + " | ".join(drawn) + " |"

    separator = (
        "| "
        + " | ".join(
            "-" * (widths[index] - 1) + ":" if index in RIGHT else "-" * widths[index]
            for index in range(len(COLUMNS))
        )
        + " |"
    )
    return [line(COLUMNS), separator, *(line(row) for row in rows)]


__all__ = [
    "COLUMNS",
    "age",
    "cells_of_row",
    "cells_of_session",
    "cut",
    "table_lines",
]
