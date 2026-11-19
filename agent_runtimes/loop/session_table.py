# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The table sessions are listed in: `loop sessions list`, the picker's two
groups, and the listing printed where nobody is at the terminal.

One row a session, one line a row: its number, its uid, its state, its
kind, its agent or application, its turns, its age and its title. It is a
markdown table (`table_lines`) wherever it is drawn:

- in a terminal — `loop sessions list`, and the picker, where a row can be
  highlighted — with the terminal's width, so that a row is one line and
  nothing wraps: the uid's column is as wide as the longest uid up to 32
  characters (a ULID and a hexadecimal uid whole; a longer one cut in its
  middle with an ellipsis), the agent's up to 28, and the title takes the
  rest, cut with an ellipsis at its end; in a narrow terminal the agent's
  name gives first, then a long uid, then the title; under 80 columns the
  Kind column is left out, then Turns;
- piped, with no width: pipes and a header separator, nothing cut — it
  pastes as markdown, every uid whole.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Mapping, Optional, Sequence

from agent_runtimes.loop.paused import Paused, _ago

#: The columns, in order. The title is the last, and the one that is cut.
COLUMNS = ("#", "Session", "State", "Kind", "Agent", "Turns", "Age", "Title")

#: The columns whose numbers are set to the right.
RIGHT_COLUMNS = ("#", "Turns")

ELLIPSIS = "…"

#: The least a title is cut to, however narrow the terminal.
TITLE_MIN = 8

#: What a title is left with before another column gives.
TITLE_WANT = 20

#: The most the uid's column takes in a terminal: a ULID (26 characters) and
#: a hexadecimal uid (32) whole; a longer one is cut in its middle.
SESSION_CAP = 32
ULID_LENGTH = 26

#: The least a uid is cut to, and the characters of its end that are kept.
SESSION_MIN = 13
UID_TAIL = 9

#: The most the agent's column takes in a terminal, and the least it is cut to.
AGENT_CAP = 28
AGENT_MIN = 10

#: Under this many columns the Kind column is left out, then Turns.
NARROW = 80

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
        # The session's state alone: a paused deployment is asked about
        # when the session is resumed, not marked here.
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


def cut_middle(text: str, width: int) -> str:
    """A uid cut to a width in its middle: its start and its end are what
    tell one from another (``scheduled-e63f…-20261111``).
    """
    if len(text) <= width:
        return text
    tail = min(UID_TAIL, max(1, (width - 1) // 2))
    return text[: max(1, width - 1 - tail)] + ELLIPSIS + text[-tail:]


def _fit(natural: List[int], names: List[str], width: int, floor: int) -> List[int]:
    """The widths of the columns named, for a terminal ``width`` columns wide.

    The uid takes its length up to :data:`SESSION_CAP`, the agent's name up
    to :data:`AGENT_CAP`, and the title what is left — it alone takes up
    the slack. When that is under :data:`TITLE_WANT`, the agent's name gives
    first, then a uid longer than a ULID, then the title down to ``floor``,
    and a ULID last.
    """
    widths = dict(zip(names, natural))
    widths["Session"] = min(widths["Session"], SESSION_CAP)
    widths["Agent"] = min(widths["Agent"], AGENT_CAP)
    title = widths.pop("Title")
    # "| " + cells joined by " | " + " |".
    borders = 3 * (len(names) - 1) + 4

    def left() -> int:
        return width - borders - sum(widths.values())

    want = min(title, TITLE_WANT)
    for name, least in (("Agent", AGENT_MIN), ("Session", ULID_LENGTH)):
        if left() < want:
            widths[name] = max(min(least, widths[name]), widths[name] - (want - left()))
    if left() < floor:
        widths["Session"] = max(
            min(SESSION_MIN, widths["Session"]), widths["Session"] - (floor - left())
        )
    widths["Title"] = max(floor, min(title, left()))
    return [widths[name] for name in names]


def table_lines(
    rows: Sequence[Sequence[str]], width: Optional[int] = None
) -> List[str]:
    """The table as markdown lines: the header, its separator, one line a row.

    With no ``width`` (piped), nothing is cut and nothing padded but to
    align: a GitHub-flavoured markdown table. With a ``width`` (a terminal's
    columns), a row is one line no longer than it: see :func:`_fit` for what
    each column takes, and under :data:`NARROW` columns the Kind column is
    left out, then Turns when a row still does not fit.
    """
    names = list(COLUMNS)

    def natural() -> List[int]:
        # A markdown separator is three dashes at least.
        return [
            max(len(name), 3, *(len(row[COLUMNS.index(name)]) for row in rows))
            for name in names
        ]

    widths = natural()
    if width is not None:
        # "(no title)" is said whole, as any title that short is.
        titles = [row[COLUMNS.index("Title")] for row in rows]
        floor = max(TITLE_MIN, len(NO_TITLE) if NO_TITLE in titles else 0)
        floor = min(floor, widths[-1])
        if width < NARROW:
            names.remove("Kind")
        widths = _fit(natural(), names, width, floor)
        if width < NARROW and sum(widths) + 3 * (len(names) - 1) + 4 > width:
            names.remove("Turns")
            widths = _fit(natural(), names, width, floor)
    right = [index for index, name in enumerate(names) if name in RIGHT_COLUMNS]

    def line(cells: Sequence[str]) -> str:
        drawn = []
        for index, name in enumerate(names):
            cell = cells[COLUMNS.index(name)]
            if name == "Session":
                cell = cut_middle(cell, widths[index])
            elif name in ("Agent", "Title"):
                cell = cut(cell, widths[index])
            drawn.append(
                cell.rjust(widths[index])
                if index in right
                else cell.ljust(widths[index])
            )
        return "| " + " | ".join(drawn) + " |"

    separator = (
        "| "
        + " | ".join(
            "-" * (widths[index] - 1) + ":" if index in right else "-" * widths[index]
            for index in range(len(names))
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
    "cut_middle",
    "table_lines",
]
