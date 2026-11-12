# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""``loop --resume <uid> --prompt …`` and ``loop --continue --prompt …``: the
lines go on with the session named, where it lives, its agent started; what
``--prompt`` cannot go on with is refused in one sentence.
"""

from __future__ import annotations

import asyncio
from typing import Any, List

import pytest
from typer.testing import CliRunner

from agent_runtimes.chat import cli
from agent_runtimes.commands import sessions as sessions_command
from agent_runtimes.loop.paused import (
    FILE,
    ON_DATALAYER,
    ON_THIS_MACHINE,
    RECORD,
    Paused,
)


def _row(uid: str, **fields: Any) -> Paused:
    said: dict = {
        "uid": uid,
        "kind": "agent",
        "agent": "default",
        "title": "A conversation",
        "where": ON_DATALAYER,
        "store": RECORD,
        "started_at": "2026-11-11T09:00:00+00:00",
        "app_uid": "agent:example-simple",
        "state": "paused",
    }
    said.update(fields)
    return Paused(**said)


ROWS = [
    _row("01CLOUDAGENT"),
    _row(
        "01LOCALFILES",
        where=ON_THIS_MACHINE,
        store=FILE,
        app_uid="agent:worker-marketer",
        started_at="2026-11-10T09:00:00+00:00",
    ),
    _row("01APPSESSION", kind="application", app_uid="app-1", agent="desk"),
    _row("01ENDEDONE", state="ended"),
]


@pytest.fixture
def called(monkeypatch: pytest.MonkeyPatch) -> List[tuple]:
    """``run_prompts`` recorded, and the person's sessions those above."""
    recorded: List[tuple] = []

    def run_prompts(prompts: List[str], **options: Any) -> int:
        recorded.append((prompts, options))
        return 0

    monkeypatch.setattr(cli, "run_prompts", run_prompts)
    monkeypatch.setattr(sessions_command, "_token", lambda: "the-token")
    monkeypatch.setattr(sessions_command, "every_session", lambda token: list(ROWS))
    monkeypatch.delenv("AGENT_RUNTIMES_SESSION_STORE", raising=False)
    return recorded


def test_resume_with_prompt_goes_on_with_the_session_where_it_lives(
    called: List[tuple],
) -> None:
    result = CliRunner().invoke(
        cli.app, ["--resume", "01CLOUDAGENT", "--prompt", "Which word?"]
    )
    assert result.exit_code == 0, result.output
    prompts, options = called[0]
    assert prompts == ["Which word?"]
    assert options["resume"] == "01CLOUDAGENT"
    # On Datalayer, where it ran, with its agentspec: nobody is asked.
    assert options["cloud"] and not options["local"]
    assert options["agent_id"] == "example-simple"


def test_continue_with_prompt_takes_the_most_recent_and_reads_its_files(
    called: List[tuple], monkeypatch: pytest.MonkeyPatch
) -> None:
    import os

    result = CliRunner().invoke(cli.app, ["--continue", "--local", "--prompt", "Go on"])
    assert result.exit_code == 0, result.output
    _, options = called[0]
    assert options["resume"] == "01LOCALFILES"
    assert options["local"] and not options["cloud"]
    assert options["agent_id"] == "worker-marketer"
    assert os.environ["AGENT_RUNTIMES_SESSION_STORE"] == FILE

    called.clear()
    result = CliRunner().invoke(cli.app, ["-c", "--prompt", "Go on"])
    assert result.exit_code == 0, result.output
    assert called[0][1]["resume"] == "01CLOUDAGENT"


def test_what_prompt_cannot_go_on_with_is_refused_in_a_sentence(
    called: List[tuple],
) -> None:
    runner = CliRunner()
    alone = runner.invoke(cli.app, ["--resume", "", "--prompt", "Hi"])
    assert alone.exit_code == 2
    assert "needs the session's uid" in alone.output

    app = runner.invoke(cli.app, ["--resume", "01APPSESSION", "--prompt", "Hi"])
    assert app.exit_code == 2
    assert "an application's session" in app.output
    assert "`loop --resume 01APPSESSION` without --prompt" in app.output

    missing = runner.invoke(cli.app, ["--resume", "01NOSUCH", "--prompt", "Hi"])
    assert missing.exit_code == 1
    assert "There is no session 01NOSUCH" in missing.output

    elsewhere = runner.invoke(
        cli.app, ["--resume", "01LOCALFILES", "--runtime", "rt-1", "--prompt", "Hi"]
    )
    assert elsewhere.exit_code == 2
    assert "lives on this machine" in elsewhere.output

    # A message as an argument is a new conversation: said, not run fresh.
    query = runner.invoke(cli.app, ["--resume", "01CLOUDAGENT", "Which word?"])
    assert query.exit_code == 2
    assert "give it with --prompt" in query.output
    assert called == []


def test_the_session_is_resumed_before_the_lines_and_a_refusal_stops_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``run_prompts`` runs ``/resume <uid>`` first; refused, no line runs."""
    from agent_runtimes.chat.commands import resume as resume_command
    from agent_runtimes.loop import session as loop_session

    class Process:
        def is_alive(self) -> bool:
            return False

    monkeypatch.setattr(
        cli, "_start_agent_runtime_server", lambda agent_id, **kwargs: (Process(), 9)
    )
    monkeypatch.setattr(cli, "_wait_for_server", lambda host, port, timeout: True)
    monkeypatch.setattr(
        loop_session,
        "conversation_url",
        lambda server, agent: (f"{server}/api/v1/ag-ui/{agent}/", ""),
    )
    ran: List[str] = []

    def refused(tux: Any, method: str, path: str, **kwargs: Any) -> Any:
        raise RuntimeError("Session 01LOCALFILES is not in the record.")

    async def run_line(self: Any, line: str) -> bool:
        ran.append(line)
        self.last_error = None
        if line.startswith("/resume"):
            await resume_command.execute(self, line.split(" ", 1)[1])
        return self.last_error is None

    from agent_runtimes.chat.tux import CliTux

    monkeypatch.setattr(resume_command, "ask", refused)
    monkeypatch.setattr(resume_command, "session_of", lambda tux: None)
    monkeypatch.setattr(CliTux, "run_line", run_line)
    code = cli.run_prompts(
        ["Which word?"], agent_id="worker-marketer", resume="01LOCALFILES"
    )
    assert code == 1
    assert ran == ["/resume 01LOCALFILES"]

    ran.clear()
    monkeypatch.setattr(
        resume_command, "execute", lambda tux, argv: asyncio.sleep(0, result=None)
    )
    assert (
        cli.run_prompts(
            ["Which word?"], agent_id="worker-marketer", resume="01LOCALFILES"
        )
        == 0
    )
    assert ran == ["/resume 01LOCALFILES", "Which word?"]
