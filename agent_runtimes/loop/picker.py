# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop sessions`, with nothing else: the sessions to pick one from.

Two groups, **On this machine** and **On Datalayer**; each row a session
with its uid, its state, its kind, its agent or application, its title or
first words, its turns and when it started. Arrow keys or a row's number
choose (Page Up and Page Down move by a page, Home and End go to the first
and the last row), typing filters, Enter resumes the session where it lives, and one
key each does the rest to the highlighted row — pause, end, transfer,
export, delete, start over — each said in a one-line legend.

`loop`, as it starts, draws the same screen (:func:`agent_runtimes.commands.
sessions.run_picker` runs both): its launch rows first — *Start a new
session*, on this machine or on Datalayer when where it runs is still to be
asked — highlighted by default, and under them the sessions exactly as
`loop sessions` lists them.

This module is the picker's model, which needs no terminal (what is
listed, filtered, highlighted, and whether an action applies to a row, with
why not), its text and JSON listings for a run nobody is at, and the
terminal's drawing of it.
"""

from __future__ import annotations

import shutil
import textwrap
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from agent_runtimes.loop.paused import (
    MANAGED_BY_PLACE,
    ON_DATALAYER,
    ON_THIS_MACHINE,
    PLACE_TITLES,
    Paused,
    _ago,
    clone_command,
    grouped,
)
from agent_runtimes.loop.session_table import cells_of_row, table_lines


@dataclass(frozen=True)
class Action:
    """One thing done to the highlighted session."""

    id: str
    key: str
    """The key, as prompt_toolkit names it."""
    shown: str
    """The key, as the legend says it."""
    legend: str


#: What the picker does, in the legend's order.
ACTIONS: Tuple[Action, ...] = (
    Action("resume", "enter", "Enter", "resume"),
    Action("pause", "c-p", "Ctrl-P", "pause"),
    Action("end", "c-e", "Ctrl-E", "end"),
    Action("transfer", "c-t", "Ctrl-T", "transfer to the other place"),
    Action("export", "c-x", "Ctrl-X", "export to a file"),
    Action("delete", "c-d", "Ctrl-D", "delete"),
    Action(
        "start_over",
        "c-n",
        "Ctrl-N",
        "start over (a new session of the same agent or application, with nothing "
        "of this conversation; this one is left as it is)",
    ),
)

LEGEND = (
    "↑↓ or a number: choose · PgUp/PgDn: a page · Home/End: first, last · "
    "type: filter · "
    + " · ".join(f"{action.shown}: {action.legend}" for action in ACTIONS)
    + " · Esc: leave"
)

#: The rows a page moves by when the terminal's height is not known.
PAGE = 10

#: What an empty group says, by place. Ended sessions are not listed.
NO_SESSION = {
    ON_THIS_MACHINE: "No session to go on with: `loop` starts one.",
    ON_DATALAYER: "No session to go on with: `loop --cloud` starts one.",
}

#: Said under the listing: what is not in it, and how it is seen.
NOT_LISTED = (
    "Listed: the sessions that run (open) and those you can go on with (paused). "
    "Ended ones are not: `loop sessions --all` lists them too; "
    "`loop sessions show|clone|export <uid>` still act on one."
)

NOT_SIGNED_IN = (
    "Not signed in: only the sessions on this machine are listed. `datalayer login` "
    "lists those on Datalayer too."
)


def why_not(action: str, row: Paused, *, signed_in: bool = True) -> str:
    """Why an action does not apply to a session, in a sentence; ``""`` when it does."""
    here = row.where == ON_THIS_MACHINE
    if action == "resume":
        if row.state == "ended":
            what = (
                "was a seat of a team run that ended; an ended run is not resumed"
                if row.team_run or row.app_uid.startswith("team:")
                else "ended; an ended session is not resumed"
            )
            return (
                f"Session {row.uid} {what} — clone it to go on from it "
                f"(`{clone_command(row)}`), or start over."
            )
        if not row.resumable:
            where = f": open {row.address}" if row.address else ""
            return f"Session {row.uid} is {row.why_not or 'not resumed from a terminal'}{where}."
        return ""
    if action == "pause":
        if row.state != "open":
            return f"Session {row.uid} is {row.state}, not open: there is nothing to pause."
        if here:
            return (
                f"Session {row.uid} is open in a prompt on this machine: pause it there, with /pause. "
                "If its prompt is gone, Enter resumes it."
            )
        return (
            f"Session {row.uid} is open on a runtime on Datalayer: pause it in its conversation, "
            f"on its row of https://datalayer.ai/sessions, or with `loop sessions pause {row.uid} --cloud --server <its runtime>`."
        )
    if action == "end":
        if row.state == "ended":
            return f"Session {row.uid} ended already."
        if row.state == "open":
            return f"Session {row.uid} is open: pause it first, then end it."
        if row.deployment_uid or row.team_run:
            return f"Session {row.uid} is ended where it runs: at its application's address, or with its team run."
        return ""
    if action == "transfer":
        if not signed_in:
            return (
                "You are not signed in: a session is transferred to, and from, your "
                "Datalayer account. Sign in with `datalayer login`."
            )
        if row.state != "paused":
            return (
                f"Session {row.uid} is {row.state}: a paused session is transferred."
                + (" Pause it first." if row.state == "open" else "")
            )
        if row.deployment_uid:
            return f"Session {row.uid} is a session of a deployment: it belongs to its deployment."
        if row.team_run:
            return (
                f"Session {row.uid} is a seat of a team run: it goes on with its run."
            )
        return ""
    if action == "delete":
        if not here and not signed_in:
            return (
                f"Session {row.uid} is in your Datalayer account's record: it is deleted signed in. "
                "Sign in with `datalayer login`."
            )
        if row.state == "open":
            return f"Session {row.uid} is open: pause or end it first."
        return ""
    if action == "start_over":
        if row.deployment_uid:
            return f"A new session of a deployment is opened at its address{': ' + row.address.split('?')[0] if row.address else ''}."
        if row.team_run:
            return "A team run is started over with `agent-teams start`."
        if not (row.agent if row.kind == "agent" else row.app_uid):
            return f"Session {row.uid} names no agent to start again."
        return ""
    return ""


def row_line(row: Paused, now: Optional[datetime] = None) -> str:
    """One session as the picker and the text listing draw it."""
    title = row.title[:48] or "(no title)"
    when = _ago(row.started_at, now)
    return "  ".join(
        part
        for part in (
            row.uid,
            f"{row.state:<6}",
            f"{'agent' if row.kind == 'agent' else 'app':<5}",
            row.agent if row.kind == "agent" else (row.app_name or row.app_uid),
            f"{row.turns} turn{'s' if row.turns != 1 else ''}",
            when,
            f"— {title}",
        )
        if part
    )


@dataclass(frozen=True)
class Launch:
    """A row above the sessions that starts a new one, as `loop` starts."""

    id: str
    label: str


#: Said when a session's key is pressed on a launch row.
ON_A_LAUNCH_ROW = "This row starts a new session: Enter starts it. The other keys act on a session's row."


@dataclass
class Picker:
    """What is listed, filtered and highlighted.

    ``launch`` rows, when `loop` starts, come first, above the sessions;
    the sessions are numbered from 1 under them, as `loop sessions` numbers
    them. ``index`` counts the launch rows, then the sessions.
    """

    rows: List[Paused]
    launch: Tuple[Launch, ...] = ()
    signed_in: bool = True
    typed: str = ""
    index: int = 0
    said: str = ""
    now: Optional[datetime] = field(default=None, repr=False)
    width: Optional[int] = None
    """The columns a row may take: the terminal's, unless a test says."""
    height: Optional[int] = None
    """The terminal's lines, unless a test says."""

    @property
    def number(self) -> Optional[int]:
        """The row number typed, when what is typed is one."""
        return int(self.typed) if self.typed.isdigit() and len(self.typed) < 5 else None

    def groups(self) -> List[Tuple[str, List[Paused]]]:
        """The two places, *On this machine* first, each with its sessions that match what is typed."""
        words = [] if self.number is not None else self.typed.lower().split()
        kept = [
            row
            for row in self.rows
            if all(
                word in f"{row_line(row, self.now)} {row.where}".lower()
                for word in words
            )
        ]
        return grouped(kept)

    def visible(self) -> List[Paused]:
        """The sessions drawn, in the order they are numbered."""
        return [row for _, rows in self.groups() for row in rows]

    def count(self) -> int:
        """The rows that can be highlighted: the launch rows, then the sessions drawn."""
        return len(self.launch) + len(self.visible())

    def _position(self) -> int:
        return max(0, min(self.index, self.count() - 1))

    def highlighted_launch(self) -> Optional[Launch]:
        """The launch row highlighted, or ``None`` when a session is."""
        position = self._position()
        return self.launch[position] if position < len(self.launch) else None

    def highlighted(self) -> Optional[Paused]:
        """The session highlighted, or ``None`` when none is (or a launch row is)."""
        rows = self.visible()
        position = self._position() - len(self.launch)
        if not rows or position < 0:
            return None
        return rows[position]

    def move(self, by: int) -> None:
        count = self.count()
        if count:
            self.index = (max(0, min(self.index, count - 1)) + by) % count
        self.said = ""

    def page_size(self) -> int:
        """The rows a page moves by: those the terminal shows beside the
        titles, the sentences and the legend; :data:`PAGE` when its height
        is not known.
        """
        height = self.height or shutil.get_terminal_size((0, 0)).lines
        if height <= 0:
            return PAGE
        drawn = self.lines()
        rows = sum(1 for style, _ in drawn if style in ("row", "on"))
        return max(1, height - (len(drawn) - rows))

    def page(self, pages: int) -> None:
        """Move by pages, down or up (negative), stopping at the last and
        the first row: a page goes from one place's rows into the other's,
        as the arrows do, and never around.
        """
        count = self.count()
        if count:
            here = max(0, min(self.index, count - 1))
            self.index = max(0, min(here + pages * self.page_size(), count - 1))
        self.said = ""

    def first(self) -> None:
        """Highlight the first row."""
        self.index = 0
        self.said = ""

    def last(self) -> None:
        """Highlight the last row."""
        self.index = max(0, self.count() - 1)
        self.said = ""

    def cursor_line(self) -> int:
        """The line, among those drawn, of the highlighted row (0 with none):
        what the terminal keeps in sight when the list is taller than it.
        """
        for index, (style, _) in enumerate(self.lines()):
            if style == "on":
                return index
        return 0

    def type(self, text: str) -> None:
        self.typed += text
        self._after_typing()

    def erase(self) -> None:
        self.typed = self.typed[:-1]
        self._after_typing()

    def _after_typing(self) -> None:
        self.said = ""
        number = self.number
        if number is None:
            # Filtering highlights the first session that matches; nothing
            # typed, the first row (a launch row when `loop` starts).
            self.index = len(self.launch) if self.typed and self.visible() else 0
        elif 1 <= number <= len(self.visible()):
            self.index = len(self.launch) + number - 1

    def act(self, action: str) -> Optional[Tuple[str, Optional[Paused]]]:
        """The action and the session it is done to, or ``None`` with why said.

        Enter on a launch row answers that row's id, and no session.
        """
        launch = self.highlighted_launch()
        if launch is not None:
            if action == "resume":
                return launch.id, None
            self.said = ON_A_LAUNCH_ROW
            return None
        row = self.highlighted()
        if row is None:
            self.said = "No session is highlighted."
            return None
        refused = why_not(action, row, signed_in=self.signed_in)
        if refused:
            self.said = refused
            return None
        return action, row

    def header(self) -> List[str]:
        """What is said above the groups: only that nobody is signed in.
        How a place keeps its sessions is said under the place's title.
        """
        return [] if self.signed_in else [NOT_SIGNED_IN]

    def lines(self) -> List[Tuple[str, str]]:
        """What is drawn, each line with its style: ``title``, ``row``, ``on``,
        ``dim``: the launch rows, then the sessions (:meth:`session_lines`).
        """
        on = self.highlighted_launch()
        return [
            (
                "on" if launch is on else "row",
                f"{'❯' if launch is on else ' '} {launch.label}",
            )
            for launch in self.launch
        ] + self.session_lines()

    def session_lines(self) -> List[Tuple[str, str]]:
        """The sessions as drawn, the same from `loop` and from `loop sessions`:
        the filter, the two groups with how each keeps its sessions, the
        table, the legend and what was said.
        """
        # A row is one line: the table is as wide as the terminal less the
        # marker, its title the column that is cut. A sentence is wrapped
        # here, between words: the terminal would cut it inside one.
        columns = self.width or shutil.get_terminal_size((100, 24)).columns
        width = columns - 3

        def sentence(text: str, indent: str = "") -> List[Tuple[str, str]]:
            return [
                ("dim", line)
                for line in textwrap.wrap(
                    text,
                    max(20, columns - 1),
                    initial_indent=indent,
                    subsequent_indent=indent,
                    break_long_words=False,
                    break_on_hyphens=False,
                )
            ]

        drawn: List[Tuple[str, str]] = []
        for line in self.header():
            drawn += sentence(line)
        drawn.append(
            (
                "dim",
                f"Filter: {self.typed}" if self.typed else "Type to filter.",
            )
        )
        on = self.highlighted()
        number = 0
        for place, rows in self.groups():
            if place == ON_DATALAYER and not self.signed_in:
                continue
            drawn.append(("title", f"{PLACE_TITLES[place]} ({len(rows)})"))
            drawn += sentence(MANAGED_BY_PLACE[place], "   ")
            if not rows:
                drawn.append(
                    (
                        "dim",
                        "   No session matches."
                        if self.typed
                        else f"   {NO_SESSION[place]}",
                    )
                )
            if not rows:
                continue
            table = table_lines(
                [
                    cells_of_row(row, number + index + 1, self.now)
                    for index, row in enumerate(rows)
                ],
                width,
            )
            drawn += [("dim", f"  {line}") for line in table[:2]]
            for row, line in zip(rows, table[2:]):
                number += 1
                drawn.append(
                    (
                        "on" if row is on else "row",
                        f"{'❯' if row is on else ' '} {line}",
                    )
                )
        drawn += sentence(LEGEND)
        if self.said:
            drawn.append(("said", self.said))
        return drawn


def listing_lines(
    rows: List[Paused], *, signed_in: bool, now: Optional[datetime] = None
) -> List[str]:
    """The two groups as text, for a run nobody is at: each a title and a
    markdown table (pipes, a header separator, nothing cut), a blank line
    around it so that the whole pastes as markdown; under the title, how
    the place keeps its sessions, in a line; an empty group says so in a
    sentence.
    """
    picker = Picker(rows, signed_in=signed_in, now=now)
    lines: List[str] = []
    number = 0
    for place, of_place in picker.groups():
        if place == ON_DATALAYER and not signed_in:
            lines.append(NOT_SIGNED_IN)
            continue
        lines.append(f"{PLACE_TITLES[place]} ({len(of_place)})")
        lines.append(MANAGED_BY_PLACE[place])
        if not of_place:
            lines.append(NO_SESSION[place])
            continue
        lines.append("")
        lines += table_lines(
            [
                cells_of_row(row, number + index + 1, now)
                for index, row in enumerate(of_place)
            ]
        )
        lines.append("")
        number += len(of_place)
    return lines


def listing_json(rows: List[Paused], *, signed_in: bool) -> Dict[str, Any]:
    """The two groups as JSON: ``{local: [...], cloud: [...] | null, signed_in}``."""

    def said(row: Paused) -> Dict[str, Any]:
        return {
            "uid": row.uid,
            "state": row.state,
            "kind": row.kind,
            "agent": row.agent,
            "application": row.app_uid if row.kind == "application" else "",
            "name": row.agent if row.kind == "agent" else (row.app_name or row.app_uid),
            "title": row.title,
            "turns": row.turns,
            "started_at": row.started_at,
            "where": row.where,
            "resumable": row.resumable and row.state != "ended",
        }

    by_place = dict(grouped(rows))
    return {
        "signed_in": signed_in,
        "local": [said(row) for row in by_place[ON_THIS_MACHINE]],
        "cloud": [said(row) for row in by_place[ON_DATALAYER]] if signed_in else None,
    }


STYLES = {
    "title": "bold",
    "row": "",
    "on": "reverse",
    "dim": "ansibrightblack",
    "said": "ansiyellow",
}


def pick(
    picker: Picker, *, input: Any = None, output: Any = None
) -> Optional[Tuple[str, Optional[Paused]]]:
    """Draw the picker in the terminal and answer what was chosen: the
    action and its session, a launch row's id and ``None``, or ``None`` when
    the person left.

    ``input`` and ``output`` stand in for the terminal in a test.
    """
    from prompt_toolkit.application import Application
    from prompt_toolkit.data_structures import Point
    from prompt_toolkit.key_binding import KeyBindings
    from prompt_toolkit.layout import Layout
    from prompt_toolkit.layout.containers import Window
    from prompt_toolkit.layout.controls import FormattedTextControl

    bindings = KeyBindings()

    @bindings.add("up")
    def _(event: Any) -> None:
        picker.move(-1)

    @bindings.add("down")
    def _(event: Any) -> None:
        picker.move(1)

    @bindings.add("pagedown")
    def _(event: Any) -> None:
        picker.page(1)

    @bindings.add("pageup")
    def _(event: Any) -> None:
        picker.page(-1)

    @bindings.add("home")
    def _(event: Any) -> None:
        picker.first()

    @bindings.add("end")
    def _(event: Any) -> None:
        picker.last()

    @bindings.add("backspace")
    def _(event: Any) -> None:
        picker.erase()

    @bindings.add("escape", eager=True)
    @bindings.add("c-c")
    def _(event: Any) -> None:
        event.app.exit(result=None)

    def bind(action: Action) -> None:
        @bindings.add(action.key)
        def _(event: Any) -> None:
            chosen = picker.act(action.id)
            if chosen is not None:
                event.app.exit(result=chosen)

    for action in ACTIONS:
        bind(action)

    @bindings.add("<any>")
    def _(event: Any) -> None:
        text = event.data
        if text and text.isprintable():
            picker.type(text)

    def drawn() -> List[Tuple[str, str]]:
        return [(STYLES[style], f"{line}\n") for style, line in picker.lines()]

    def cursor() -> Any:
        # Never shown: the window scrolls to keep its line, the highlighted
        # row's, in sight when the list is taller than the terminal.
        return Point(x=0, y=picker.cursor_line())

    application: Any = Application(
        # A row is one line, cut to the terminal's width; the sentences are
        # wrapped between words as they are drawn.
        layout=Layout(
            Window(
                FormattedTextControl(
                    drawn, show_cursor=False, get_cursor_position=cursor
                ),
                wrap_lines=True,
            )
        ),
        key_bindings=bindings,
        full_screen=False,
        input=input,
        output=output,
    )
    return application.run()


__all__ = [
    "ACTIONS",
    "Action",
    "Launch",
    "ON_A_LAUNCH_ROW",
    "LEGEND",
    "NOT_LISTED",
    "NOT_SIGNED_IN",
    "NO_SESSION",
    "PAGE",
    "Picker",
    "listing_json",
    "listing_lines",
    "pick",
    "row_line",
    "why_not",
]
