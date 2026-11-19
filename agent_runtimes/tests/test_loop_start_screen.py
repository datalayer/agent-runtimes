# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The screen `loop` starts on is `loop sessions`' screen.

One function (`run_picker`) draws both: from `loop`, its launch rows come
first — *Start a new session*, on this machine or on Datalayer when where
it runs is still to be asked — highlighted by default, and under them the
sessions exactly as `loop sessions` draws them. Enter on a launch row starts
a new session; on a session, resumes it as `loop --resume <uid>` does. A
session is listed once, and only when it can be gone on with.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional, Tuple

import pytest

from agent_runtimes.commands import sessions
from agent_runtimes.loop import launch, picker
from agent_runtimes.loop.launch import CLOUD, LOCAL, NEW_SESSION, start_choices
from agent_runtimes.loop.paused import (
    DEPLOYMENT_WHY_NOT,
    ON_DATALAYER,
    ON_THIS_MACHINE,
    Paused,
    listed,
    paused_of,
)
from agent_runtimes.loop.picker import Launch, Picker
from agent_runtimes.loop.session_table import cells_of_row, table_lines

NOW = datetime(2026, 11, 11, 12, 0, tzinfo=timezone.utc)

#: The terminal's picker, before a test stands in for it.
PICK = picker.pick


def _rows() -> List[Paused]:
    return [
        Paused(
            "01M75JVX5C26R21YXGM1Q0W204",
            "agent",
            "example-simple",
            "List my GitHub repositories, names only.",
            ON_THIS_MACHINE,
            "file",
            "2026-11-11T11:00:00Z",
            turns=2,
            app_uid="agent:example-simple",
        ),
        Paused(
            "72a52412b51f401ab91555394f4ef82c",
            "agent",
            "worker-marketer",
            "The autumn campaign",
            ON_DATALAYER,
            "record",
            "2026-11-11T09:00:00Z",
            turns=4,
            app_uid="agent:worker-marketer",
        ),
    ]


def _launch(tmp_path: Path) -> Tuple[Launch, ...]:
    rows, _ = start_choices(preferences=tmp_path / "loop.json")
    return tuple(Launch(key, label) for key, label in rows)


def test_the_launch_rows_come_first_and_the_sessions_part_is_the_same(
    tmp_path: Path,
) -> None:
    rows = _rows()
    start = Picker(rows, launch=_launch(tmp_path), now=NOW, width=120)
    alone = Picker(rows, now=NOW, width=120)
    drawn = start.lines()
    # A new session first, highlighted: Enter starts it.
    assert drawn[0] == (
        "on",
        "❯ Start a new session on this machine — a local server, with your own model keys",
    )
    assert drawn[1] == (
        "row",
        "  Start a new session on Datalayer — a cloud runtime with Datalayer's models, "
        "billed by the second",
    )
    assert start.highlighted() is None and start.highlighted_launch() is not None
    # Under them, byte for byte what `loop sessions` draws, the same session
    # highlighted in both.
    start.move(2)
    assert start.highlighted() is alone.highlighted() is rows[0]
    assert start.lines()[2:] == alone.lines()
    assert start.session_lines() == alone.session_lines()
    # Rows numbered from 1 under the launch rows: a number picks the session.
    start.type("2")
    assert start.highlighted() is rows[1]


def test_one_launch_row_when_where_is_said_or_not_offered(tmp_path: Path) -> None:
    for flags in ({"local": True}, {"cloud": True}, {"cloud_offered": False}):
        assert start_choices(preferences=tmp_path / "loop.json", **flags) == (
            [(NEW_SESSION, "Start a new session")],
            NEW_SESSION,
        )
    # The last answer to where is the row highlighted.
    launch.remember_where(CLOUD, tmp_path / "loop.json")
    rows, highlighted = start_choices(preferences=tmp_path / "loop.json")
    assert [key for key, _ in rows] == [LOCAL, CLOUD] and highlighted == CLOUD


def test_enter_on_a_launch_row_starts_and_a_sessions_key_says_why_not(
    tmp_path: Path,
) -> None:
    start = Picker(_rows(), launch=_launch(tmp_path), now=NOW)
    assert start.act("transfer") is None and start.said == picker.ON_A_LAUNCH_ROW
    assert start.act("resume") == (LOCAL, None)
    start.move(1)
    assert start.act("resume") == (CLOUD, None)
    start.move(1)
    assert start.act("resume") == ("resume", _rows()[0])


def test_filtering_highlights_the_first_session_that_matches(tmp_path: Path) -> None:
    start = Picker(_rows(), launch=_launch(tmp_path), now=NOW)
    start.type("marketer")
    assert start.highlighted() is not None
    assert start.highlighted().uid == "72a52412b51f401ab91555394f4ef82c"
    start.erase()
    for _ in "markete":
        start.erase()
    assert start.highlighted_launch() is not None


def _screen(monkeypatch: pytest.MonkeyPatch, rows: List[Paused], keys_sent: str) -> Any:
    """`run_picker` in a terminal, the keys pressed."""
    from prompt_toolkit.input import create_pipe_input
    from prompt_toolkit.output import DummyOutput

    monkeypatch.setattr(sessions, "_token", lambda: "the-token")
    monkeypatch.setattr(sessions, "listed_sessions", lambda token: list(rows))
    monkeypatch.setattr(launch, "interactive", lambda: True)
    with create_pipe_input() as keys:
        keys.send_text(keys_sent)
        monkeypatch.setattr(
            picker,
            "pick",
            lambda model: PICK(model, input=keys, output=DummyOutput()),
        )
        return sessions.run_picker(
            launch=[
                (LOCAL, "Start a new session on this machine"),
                (CLOUD, "On Datalayer"),
            ],
            highlighted=LOCAL,
        )


def test_the_start_screen_in_a_terminal(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = _rows()
    # Enter: the new session highlighted by default.
    assert _screen(monkeypatch, rows, "\r") == (LOCAL, None)
    # Down past the launch rows, Enter: the first session, answered to
    # `loop`, which resumes it as `loop --resume <uid>` does, nothing run here.
    assert _screen(monkeypatch, rows, "\x1b[B\x1b[B\r") == ("resume", rows[0])
    # End: the last session.
    assert _screen(monkeypatch, rows, "\x1b[F\r") == ("resume", rows[1])
    # Esc: nothing chosen; `loop` leaves.
    assert _screen(monkeypatch, rows, "\x1b") is None
    # No session listed: nothing drawn, the highlighted launch row answered.
    assert _screen(monkeypatch, [], "") == (LOCAL, None)


def test_loop_starts_with_the_screen(monkeypatch: pytest.MonkeyPatch) -> None:
    from agent_runtimes.chat import cli

    asked: List[Any] = []

    def screen(**kwargs: Any) -> Optional[Tuple[str, Any]]:
        asked.append(kwargs)
        return answers.pop(0)

    monkeypatch.setattr(launch, "interactive", lambda: True)
    monkeypatch.setattr(sessions, "_token", lambda: "the-token")
    monkeypatch.setattr(sessions, "run_picker", screen)
    remembered: List[str] = []
    monkeypatch.setattr(launch, "remember_where", remembered.append)
    row = _rows()[1]
    answers: List[Any] = [(CLOUD, None), ("resume", row), (NEW_SESSION, None), None]
    assert cli._offer_paused() == (None, CLOUD) and remembered == [CLOUD]
    assert [key for key, _ in asked[0]["launch"]] == [LOCAL, CLOUD]
    assert cli._offer_paused() == (row, "")
    assert cli._offer_paused(local=True) == (None, "")
    assert asked[2]["launch"] == [(NEW_SESSION, "Start a new session")]
    with pytest.raises(KeyboardInterrupt):
        cli._offer_paused()


def _record_session(uid: str, deployment_uid: str, title: str) -> dict:
    return {
        "uid": uid,
        "app_uid": "01M4DF584YAF36ACJRTYG341E5",
        "deployment_uid": deployment_uid,
        "state": "paused",
        "agent": "accounting",
        "title": title,
        "started_at": f"2026-10-15T13:00:{uid[-2:]}Z",
        "turns": 1,
    }


def test_a_session_is_listed_once_and_only_when_it_can_be_gone_on_with() -> None:
    same = "What is seven times six? Answer with the number only."
    described = [
        # Sessions of a deployment the person does not have (somebody
        # else's, or taken down), with no address to open: drawn greyed at
        # the start before, never resumable; not listed.
        _record_session(f"msg_17920692409_{n:02d}", "dep-gone", same)
        for n in range(3)
    ] + [
        _record_session("msg_mine_01", "dep-mine", "Mine"),
        # The record answering a session twice: listed once.
        _record_session("msg_mine_01", "dep-mine", "Mine"),
    ]
    rows = paused_of(
        described,
        "record",
        {"dep-mine": {"uid": "dep-mine", "app_name": "Books"}},
        {},
    )
    assert [row.why_not for row in rows[:3]] == [DEPLOYMENT_WHY_NOT] * 3
    shown = listed(rows)
    assert [row.uid for row in shown] == ["msg_mine_01"]
    assert all(row.resumable for row in shown)
    drawn = "\n".join(line for _, line in Picker(shown, now=NOW, width=120).lines())
    assert drawn.count("msg_mine_01") == 1 and "msg_17920692409" not in drawn


def test_a_paused_deployments_session_says_paused_and_gives_the_width_back() -> None:
    row = Paused(
        "72a52412b51f401ab91555394f4ef82c",
        "application",
        "mh49-pi",
        "Which coding agent are you?",
        ON_DATALAYER,
        "record",
        "2026-10-28T09:00:00Z",
        app_uid="app-1",
        app_name="shield-mv-guardian",
        deployment_uid="dep-1",
        deployment_paused=True,
    )
    lines = table_lines([cells_of_row(row, 1, NOW)], 120)
    assert "| paused |" in lines[2] and "deployment" not in lines[2]
    # The uid whole, and the application's name.
    assert "| 72a52412b51f401ab91555394f4ef82c |" in lines[2]
    assert "| shield-mv-guardian |" in lines[2]
    # Piped too.
    assert "| paused |" in table_lines([cells_of_row(row, 1, NOW)])[2]
