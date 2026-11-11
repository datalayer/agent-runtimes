# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop sessions`, with nothing else: the sessions to pick one from.

Two groups, **On this machine** and **On Datalayer**; each row a session
with its uid, its state, its kind, its agent or application, its title or
first words, its turns and when it started. Arrow keys or a row's number
choose, typing filters, Enter resumes the session where it lives, and one
key each does the rest to the highlighted row — pause, end, transfer,
export, delete, start over — each said in a one-line legend.

This module is the picker's model, which needs no terminal (what is
listed, filtered, highlighted, and whether an action applies to a row, with
why not), its text and JSON listings for a run nobody is at, and the
terminal's drawing of it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from agent_runtimes.loop.paused import (
    MANAGED,
    ON_DATALAYER,
    ON_THIS_MACHINE,
    PLACE_TITLES,
    Paused,
    _ago,
    grouped,
)


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
    "↑↓ or a number: choose · type: filter · "
    + " · ".join(f"{action.shown}: {action.legend}" for action in ACTIONS)
    + " · Esc: leave"
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
            return f"Session {row.uid} ended: start over, or clone it to go on from it."
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


@dataclass
class Picker:
    """What is listed, filtered and highlighted."""

    rows: List[Paused]
    signed_in: bool = True
    typed: str = ""
    index: int = 0
    said: str = ""
    now: Optional[datetime] = field(default=None, repr=False)

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

    def highlighted(self) -> Optional[Paused]:
        rows = self.visible()
        if not rows:
            return None
        return rows[max(0, min(self.index, len(rows) - 1))]

    def move(self, by: int) -> None:
        count = len(self.visible())
        if count:
            self.index = (max(0, min(self.index, count - 1)) + by) % count
        self.said = ""

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
            self.index = 0
        elif 1 <= number <= len(self.visible()):
            self.index = number - 1

    def act(self, action: str) -> Optional[Tuple[str, Paused]]:
        """The action and the session it is done to, or ``None`` with why said."""
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
        lines = list(MANAGED)
        if not self.signed_in:
            lines.append(NOT_SIGNED_IN)
        return lines

    def lines(self) -> List[Tuple[str, str]]:
        """What is drawn, each line with its style: ``title``, ``row``, ``on``, ``dim``."""
        drawn: List[Tuple[str, str]] = [("dim", line) for line in self.header()]
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
            if not rows:
                drawn.append(
                    (
                        "dim",
                        "   No session matches."
                        if self.typed
                        else (
                            "   No session yet: `loop` starts one."
                            if place == ON_THIS_MACHINE
                            else "   No session yet: `loop --cloud` starts one."
                        ),
                    )
                )
            for row in rows:
                number += 1
                drawn.append(
                    (
                        "on" if row is on else "row",
                        f"{'❯' if row is on else ' '}{number:>3}  {row_line(row, self.now)}",
                    )
                )
        drawn.append(("dim", LEGEND))
        if self.said:
            drawn.append(("said", self.said))
        return drawn


def listing_lines(
    rows: List[Paused], *, signed_in: bool, now: Optional[datetime] = None
) -> List[str]:
    """The two groups as text, for a run nobody is at."""
    picker = Picker(rows, signed_in=signed_in, now=now)
    lines: List[str] = []
    for place, of_place in picker.groups():
        if place == ON_DATALAYER and not signed_in:
            lines.append(NOT_SIGNED_IN)
            continue
        lines.append(f"{PLACE_TITLES[place]} ({len(of_place)})")
        lines += [f"  {row_line(row, now)}" for row in of_place]
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
) -> Optional[Tuple[str, Paused]]:
    """Draw the picker in the terminal and answer what was chosen: the
    action and its session, or ``None`` when the person left.

    ``input`` and ``output`` stand in for the terminal in a test.
    """
    from prompt_toolkit.application import Application
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

    application: Any = Application(
        layout=Layout(Window(FormattedTextControl(drawn), wrap_lines=True)),
        key_bindings=bindings,
        full_screen=False,
        input=input,
        output=output,
    )
    return application.run()


__all__ = [
    "ACTIONS",
    "Action",
    "LEGEND",
    "NOT_SIGNED_IN",
    "Picker",
    "listing_json",
    "listing_lines",
    "pick",
    "row_line",
    "why_not",
]
