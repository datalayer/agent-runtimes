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

import pytest
from rich.console import Console
from typer.testing import CliRunner

from agent_runtimes.commands import sessions as command
from agent_runtimes.loop import picker
from agent_runtimes.loop.paused import (
    MANAGED_BY_PLACE,
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
    """Give sessions as the record lists them, of every kind and state."""
    base = {"agent": "an-agent", "started_at": "2026-11-12T09:00:00+00:00"}
    return [
        {
            **base,
            "uid": "agent-paused",
            "state": "paused",
            "app_uid": "agent:example-simple",
        },
        {
            **base,
            "uid": "agent-open",
            "state": "open",
            "app_uid": "agent:example-simple",
        },
        {
            **base,
            "uid": "agent-ended",
            "state": "ended",
            "app_uid": "agent:example-simple",
        },
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


HEX = "72a52412b51f401ab91555394f4ef82c"
SCHEDULED = "scheduled-e63f8642-a01b-43ec-88ac-28c74f3a5879-20261111"


def _mixed() -> List[List[str]]:
    """ULIDs, a 32-character hexadecimal uid and one long scheduled uid."""
    rows = [
        _row(
            UID,
            title="List my GitHub repositories, names only.",
            agent="example-github-repositories",
        ),
        _row(HEX, title=""),
        _row(SCHEDULED, title=LONG),
        _row("01M75JVX5C26R21YXGM1Q0W204", title="Short"),
    ]
    return [cells_of_row(row, number, NOW) for number, row in enumerate(rows, start=1)]


def _column(lines: List[str], name: str) -> List[str]:
    header = [cell.strip() for cell in lines[0].strip("|").split("|")]
    at = header.index(name)
    return [line.strip("|").split("|")[at].strip() for line in lines[2:]]


@pytest.mark.parametrize("width", [80, 100, 120, 160])
def test_in_a_terminal_a_row_is_one_line_and_the_title_takes_the_rest(
    width: int,
) -> None:
    lines = table_lines(_mixed(), width)
    assert {len(line) for line in lines} == {width}, "one line a row, the width taken"
    header = [cell.strip() for cell in lines[0].strip("|").split("|")]
    assert header == list(COLUMNS)
    sessions, agents, titles = (
        _column(lines, "Session"),
        _column(lines, "Agent"),
        _column(lines, "Title"),
    )
    # A long uid never widens its column past 32: it is cut in its middle,
    # its start and its end kept.
    assert max(len(uid) for uid in sessions) <= 32
    assert sessions[2].startswith("sched") and sessions[2].endswith("1111")
    assert "…" in sessions[2] and SCHEDULED not in lines[4]
    # "(no title)" is never cut.
    assert titles[1] == "(no title)" and titles[3] == "Short"
    if width >= 100:
        # A ULID is whole.
        assert sessions[0] == UID
    if width >= 120:
        # So is a hexadecimal uid; the agent's name has 20 characters and more
        # and the title's column its 20 (a cut never ends on a space).
        assert sessions[1] == HEX
        assert sessions[2] == "scheduled-e63f8642-a01…-20261111"
        assert len(agents[0]) >= 20 and len(titles[2]) >= 19
    if width >= 160:
        # Nothing but the long uid and the long title is cut, and the title
        # takes all that is left.
        assert agents[0] == "example-github-repositories"
        assert titles[0] == "List my GitHub repositories, names only."
        assert titles[2].endswith("…") and len(titles[2]) > 40


def test_the_agent_gives_before_the_title_and_a_ulid_last() -> None:
    lines = table_lines(_cells([LONG, "Short"]), 100)
    assert all(len(line) <= 100 for line in lines)
    assert UID in lines[2] and "worker-ma…" in lines[2]
    assert lines[2].rstrip(" |").endswith("…") and LONG not in lines[2]
    # With room for it, nothing but the title is cut.
    wide = table_lines(_cells([LONG, "Short"]), 140)[2]
    assert f"| {UID} | paused | agent | worker-marketer |     4 | 3h " in wide
    assert table_lines(_cells(["Short"]), 140)[2].rstrip().endswith("| Short |")


def test_under_80_columns_kind_is_left_out_then_turns() -> None:
    def header(width: int) -> List[str]:
        lines = table_lines(_mixed(), width)
        assert all(len(line) <= max(width, 64) for line in lines), width
        return [cell.strip() for cell in lines[0].strip("|").split("|")]

    assert header(80) == list(COLUMNS)
    assert header(79) == [name for name in COLUMNS if name != "Kind"]
    assert header(72) == [name for name in COLUMNS if name != "Kind"]
    assert header(64) == [name for name in COLUMNS if name not in ("Kind", "Turns")]
    # The numbers still set to the right, whichever columns are left.
    narrow = table_lines(_mixed(), 72)
    assert narrow[1].split("|")[1].strip().endswith(":")
    assert narrow[1].split("|")[5].strip().endswith(":")


def test_piped_every_uid_is_whole() -> None:
    lines = table_lines(_mixed())
    assert SCHEDULED in lines[4] and HEX in lines[3] and LONG in lines[4]


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
    # A title, how the place keeps its sessions, a blank line, the table, a
    # blank line: it pastes as markdown.
    assert (
        lines[first + 1] == MANAGED_BY_PLACE[ON_THIS_MACHINE]
        and lines[second + 1] == MANAGED_BY_PLACE[ON_DATALAYER]
        and lines[first + 2] == ""
        and lines[first + 3].startswith("| ")
        and lines[first + 6] == ""
    )
    assert (
        "|   1 | local-one" in lines[first + 5]
        and "|   2 | cloud-one" in lines[second + 5]
    )
    empty = listing_lines([there], signed_in=True, now=NOW)
    assert empty[:3] == [
        "On this machine (0)",
        MANAGED_BY_PLACE[ON_THIS_MACHINE],
        picker.NO_SESSION[ON_THIS_MACHINE],
    ]
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
