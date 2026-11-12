# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What is listed, and how: only the sessions that run or can be gone on
with, in a table.

A paused session is always resumable: an ended one — ended by its person, or
by the record because its team run ended or its deployment was taken down —
is not listed unless asked for, and resuming one says which command clones
it. The list is a table: in a terminal it fits the width, the title cut;
piped, it is a markdown table; in the picker a row stays one line.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any, Dict, List

from rich.console import Console
from typer.testing import CliRunner

from agent_runtimes.commands import sessions as command
from agent_runtimes.loop import picker
from agent_runtimes.loop.paused import (
    ON_DATALAYER,
    ON_THIS_MACHINE,
    TEAM_WHY_NOT,
    Paused,
    clone_command,
    is_listed,
    listed,
    paused_of,
)
from agent_runtimes.loop.picker import Picker, listing_lines, why_not
from agent_runtimes.loop.session_table import (
    COLUMNS,
    cells_of_row,
    cells_of_session,
    table_lines,
)

NOW = datetime(2026, 11, 12, 12, 0, tzinfo=timezone.utc)
UID = "01M780EXBBXNNH629KKJJ3PR62"
LONG = (
    "Which coding agent are you? Answer in one short sentence, then stop — and say why."
)

runner = CliRunner()


def _row(uid: str, state: str = "paused", **more: Any) -> Paused:
    facts: Dict[str, Any] = dict(
        uid=uid,
        kind="agent",
        agent="worker-marketer",
        title="The autumn campaign",
        where=ON_DATALAYER,
        store="record",
        started_at="2026-11-12T09:00:00+00:00",
        turns=4,
        app_uid="agent:worker-marketer",
        state=state,
    )
    return Paused(**{**facts, **more})


def _described() -> List[Dict[str, Any]]:
    """Sessions as the record lists them, of every kind and state."""
    base = {"agent": "an-agent", "started_at": "2026-11-12T09:00:00+00:00"}
    return [
        {**base, "uid": "agent-paused", "state": "paused", "app_uid": "agent:coder"},
        {**base, "uid": "agent-open", "state": "open", "app_uid": "agent:coder"},
        {**base, "uid": "agent-ended", "state": "ended", "app_uid": "agent:coder"},
        {**base, "uid": "preview-paused", "state": "paused", "app_uid": "app-1"},
        {
            **base,
            "uid": "mine-paused",
            "state": "paused",
            "app_uid": "app-1",
            "deployment_uid": "dep-mine",
        },
        {
            **base,
            "uid": "theirs-paused",
            "state": "paused",
            "app_uid": "app-2",
            "deployment_uid": "dep-theirs",
        },
        {
            **base,
            "uid": "seat-paused",
            "state": "paused",
            "app_uid": "team:crew",
            "runs_on": {"kind": "team_run", "execution_id": "exec_1", "seat": "coder"},
        },
        {
            **base,
            "uid": "seat-no-run",
            "state": "paused",
            "app_uid": "team:crew",
            "runs_on": {"kind": "team_run"},
        },
        {**base, "uid": "seat-ended", "state": "ended", "app_uid": "team:crew"},
    ]


DEPLOYMENTS = {
    "dep-mine": {
        "uid": "dep-mine",
        "app_name": "Desk",
        "slug": "desk",
        "target": "hosted",
    }
}


def _rows() -> List[Paused]:
    return paused_of(
        _described(), "record", DEPLOYMENTS, {}, ("open", "paused", "ended")
    )


# --- what is listed -----------------------------------------------------------------


def test_only_running_and_resumable_sessions_are_listed() -> None:
    rows = _rows()
    assert {row.uid for row in listed(rows)} == {
        "agent-paused",
        "agent-open",
        "preview-paused",
        "mine-paused",
        "seat-paused",
    }
    by_uid = {row.uid: row for row in rows}
    # Ended: not listed. A seat whose run nobody names: nothing resumes it.
    assert not is_listed(by_uid["agent-ended"]) and not is_listed(by_uid["seat-ended"])
    assert by_uid["seat-no-run"].why_not == TEAM_WHY_NOT and not is_listed(
        by_uid["seat-no-run"]
    )
    # Somebody else's deployment, at no address a terminal knows: not from here.
    assert not is_listed(by_uid["theirs-paused"])


def test_every_session_listed_as_paused_resumes() -> None:
    """The invariant: a paused row that is listed is resumed by Enter, or
    opened at the address its row says — or this test fails."""
    paused = [row for row in listed(_rows()) if row.state == "paused"]
    assert paused
    for row in paused:
        refused = why_not("resume", row)
        assert refused == "" or (row.address and row.address in refused), row.uid
        if not refused:
            assert Picker([row]).act("resume") == ("resume", row)


def test_the_picker_lists_them_and_all_lists_the_ended_too(monkeypatch: Any) -> None:
    record = {"sessions": _described(), "deployments": list(DEPLOYMENTS.values())}
    stubs = dict(asker=lambda token: record, names={}, store=_NoFiles())
    assert {row.uid for row in command.listed_sessions("the-token", **stubs)} == {
        row.uid for row in listed(_rows())
    }
    assert {row.uid for row in command.every_session("the-token", **stubs)} >= {
        "agent-ended",
        "seat-ended",
    }


class _NoFiles:
    def described(self) -> List[Dict[str, Any]]:
        return []


def test_resuming_an_ended_session_names_the_command_that_clones_its_kind() -> None:
    ended = _row(UID, "ended")
    assert clone_command(ended) == f"loop sessions clone {UID} --cloud"
    assert (
        clone_command(_row(UID, "ended", where=ON_THIS_MACHINE))
        == f"loop sessions clone {UID}"
    )
    assert why_not("resume", ended) == (
        f"Session {UID} ended; an ended session is not resumed — clone it to go on from it "
        f"(`loop sessions clone {UID} --cloud`), or start over."
    )
    seat = _row(UID, "ended", kind="application", app_uid="team:crew")
    said = why_not("resume", seat)
    assert "was a seat of a team run that ended; an ended run is not resumed" in said
    assert (
        "agent-teams sessions clone <run>" in said and "loop sessions clone" not in said
    )
    # A seat the record still names its run for: the run is what is cloned.
    assert (
        clone_command(_row(UID, "paused", app_uid="team:crew", team_run="exec_1"))
        == "agent-teams sessions clone exec_1"
    )


# --- the table ---------------------------------------------------------------------


def _cells(titles: List[str]) -> List[List[str]]:
    return [
        cells_of_row(_row(UID, title=title), number, NOW)
        for number, title in enumerate(titles, start=1)
    ]


def test_piped_the_table_is_markdown_with_nothing_cut() -> None:
    lines = table_lines(_cells([LONG, "a | b"]))
    assert [cell.strip() for cell in lines[0].strip("|").split("|")] == list(COLUMNS)
    assert all(
        set(cell.strip()) <= set("-:") for cell in lines[1].strip("|").split("|")
    )
    assert len({len(line) for line in lines}) == 1, "aligned"
    assert (
        f"| {UID} | paused | agent | worker-marketer |     4 | 3h  | {LONG} |"
        in lines[2]
    )
    # A pipe in a title is escaped: the row keeps its eight cells.
    assert lines[3].rstrip().endswith("| a \\| b" + " " * (len(LONG) - 6) + " |")


def test_in_a_terminal_only_the_title_is_cut_and_a_row_is_one_line() -> None:
    for width in (140, 120, 100):
        lines = table_lines(_cells([LONG, "Short"]), width)
        assert all(len(line) <= width for line in lines), width
        assert f"| {UID} | paused | agent | worker-marketer |     4 | 3h " in lines[2]
    cut = table_lines(_cells([LONG]), 100)[2]
    assert cut.rstrip(" |").endswith("…") and LONG not in cut
    # Narrower still, the agent's name gives next; the uid is whole, always.
    narrow = table_lines(_cells([LONG]), 60)[2]
    assert UID in narrow and "worker-…" in narrow


def test_list_in_a_terminal_fits_its_width_and_piped_cuts_nothing() -> None:
    session = {
        "uid": UID,
        "state": "paused",
        "kind": "agent",
        "agent": "default",
        "turns": 1,
        "title": LONG,
    }
    out = io.StringIO()
    command.print_sessions_table(
        [session], Console(file=out, width=100, force_terminal=True, color_system=None)
    )
    drawn = out.getvalue().splitlines()
    assert len(drawn) == 3 and all(len(line) <= 100 for line in drawn)
    assert UID in drawn[2] and drawn[2].rstrip(" |").endswith("…")
    out = io.StringIO()
    command.print_sessions_table(
        [session], Console(file=out, width=80, force_terminal=False)
    )
    piped = out.getvalue().splitlines()
    assert len(piped) == 3 and LONG in piped[2] and piped[1].startswith("| --: | ---")


def test_the_two_groups_are_two_tables_and_an_empty_group_says_so() -> None:
    here = _row("local-one", where=ON_THIS_MACHINE, store="file", title="Here")
    there = _row("cloud-one", title="There")
    lines = listing_lines([here, there], signed_in=True, now=NOW)
    first, second = lines.index("On this machine (1)"), lines.index("On Datalayer (1)")
    assert first < second
    # A title, a blank line, the table, a blank line: it pastes as markdown.
    assert (
        lines[first + 1] == ""
        and lines[first + 2].startswith("| ")
        and lines[first + 5] == ""
    )
    assert (
        "|   1 | local-one" in lines[first + 4]
        and "|   2 | cloud-one" in lines[second + 4]
    )
    empty = listing_lines([there], signed_in=True, now=NOW)
    assert empty[:2] == ["On this machine (0)", picker.NO_SESSION[ON_THIS_MACHINE]]
    drawn = [line for _, line in Picker([there], now=NOW, width=100).lines()]
    assert f"   {picker.NO_SESSION[ON_THIS_MACHINE]}" in drawn


def test_the_picker_draws_each_group_as_a_table_a_row_one_line() -> None:
    rows = [
        _row("local-one", where=ON_THIS_MACHINE, store="file", title=LONG),
        _row(UID, title=LONG),
    ]
    model = Picker(rows, now=NOW, width=100)
    drawn = model.lines()
    table = [(style, line) for style, line in drawn if line[2:3] == "|"]
    assert all(len(line) <= 100 for _, line in table)
    # A header and its separator a group, then the rows: the highlighted one marked.
    assert [style for style, _ in table] == ["dim", "dim", "on", "dim", "dim", "row"]
    assert table[2][1].startswith("❯ |   1 | local-one") and table[5][1].startswith(
        f"  |   2 | {UID}"
    )
    assert "…" in table[5][1]
    model.move(1)
    assert [style for style, line in model.lines() if line[2:3] == "|"][-1] == "on"


def test_a_session_of_the_api_is_a_row_of_the_same_table() -> None:
    session = {
        "uid": UID,
        "state": "paused",
        "kind": "agent",
        "agent": "default",
        "turns": 1,
        "archived": True,
        "started_at": "2026-11-12T11:00:00+00:00",
        "title": "",
    }
    assert cells_of_session(session, 3, NOW) == [
        "3",
        UID,
        "paused, archived",
        "agent",
        "default",
        "1",
        "1h",
        "(no title)",
    ]


# --- `loop sessions list` -----------------------------------------------------------


class _Answer:
    def __init__(self, body: Dict[str, Any]) -> None:
        self._body = body

    def json(self) -> Dict[str, Any]:
        return self._body


def test_list_leaves_the_ended_out_and_state_ended_lists_them(monkeypatch: Any) -> None:
    rows = [
        {
            "uid": "01a",
            "state": "paused",
            "kind": "agent",
            "agent": "default",
            "turns": 2,
        },
        {
            "uid": "01b",
            "state": "ended",
            "kind": "agent",
            "agent": "default",
            "turns": 1,
        },
    ]
    asked: List[Dict[str, Any]] = []

    def ask(client: Any, method: str, path: str, **kwargs: Any) -> _Answer:
        asked.append(dict(kwargs.get("params") or {}))
        wanted = asked[-1].get("state")
        # A runtime older than the rule answers every state when none is asked.
        return _Answer(
            {"sessions": [row for row in rows if not wanted or row["state"] == wanted]}
        )

    monkeypatch.setattr(command, "_client", lambda server, cloud: object())
    monkeypatch.setattr(command, "_ask", ask)
    default = runner.invoke(command.app, ["list"])
    assert default.exit_code == 0, default.output
    assert "| 01a " in default.output and "01b" not in default.output
    assert "loop sessions list --state ended" in default.output
    ended = runner.invoke(command.app, ["list", "--state", "ended"])
    assert (
        asked[-1]["state"] == "ended"
        and "| 01b " in ended.output
        and "01a" not in ended.output
    )
    rows[:] = rows[1:]
    none = runner.invoke(command.app, ["list"])
    assert (
        "No session to go on with. Ended ones: `loop sessions list --state ended`."
        in none.output
    )
