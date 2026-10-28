# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The three Python applications of ``examples/python-applications``, run.

Each script is run here as its README runs it — its own process, from its
folder, no key, no network — and what its README says it prints is asserted,
so the README cannot describe an example that no longer runs.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

EXAMPLES = Path(__file__).resolve().parents[2] / "examples" / "python-applications"


def run(script: str) -> str:
    environment = dict(os.environ)
    environment.pop("DATALAYER_IAM_URL", None)
    environment.pop("DATALAYER_API_KEY", None)
    # Each script keeps its record in a list of its own: never the test
    # process's store (conftest names one), which other tests fill.
    environment.pop("AGENT_RUNTIMES_SESSIONS_PATH", None)
    done = subprocess.run(
        [sys.executable, script],
        cwd=EXAMPLES,
        env=environment,
        capture_output=True,
        text=True,
        timeout=240,
    )
    assert done.returncode == 0, done.stdout + done.stderr[-4000:]
    return done.stdout


def test_every_script_is_in_its_readme() -> None:
    readme = (EXAMPLES / "README.md").read_text(encoding="utf-8")
    scripts = sorted(path.name for path in EXAMPLES.glob("*.py"))
    assert scripts == [
        "answers_from_a_document.py",
        "asks_before_it_acts.py",
        "runs_on_a_schedule.py",
    ]
    for name in scripts:
        assert f"python {name}" in readme, name


def test_answers_from_a_document() -> None:
    out = run("answers_from_a_document.py")
    assert "I answer from handbook.txt: 6 paragraphs. Ask away." in out
    assert (
        "How many days off do I get?\nHandbook desk: Here is what the handbook says."
        in out
    )
    assert "> Days off. Everybody has twenty-five days off a year" in out
    assert (
        "Who feeds the office cat?\nHandbook desk: The handbook says nothing about that."
        in out
    )
    assert (
        "steps: Finding the passage (retrieval), Answering (model), Finding the passage (retrieval)"
        in out
    )


def test_asks_before_it_acts() -> None:
    out = run("asks_before_it_acts.py")
    assert "Send it to ada@example.com? -> Send -> Sent to ada@example.com." in out
    assert (
        "Send it to ada@example.com? -> Keep it as a draft -> Kept as a draft. Nothing was sent."
        in out
    )
    assert (
        "Your rule “send a reply”: ask you first. -> Refuse -> You refused: the agent sent nothing."
        in out
    )
    assert (
        "Your rule “send a reply”: ask you first. -> Allow -> Done: the reply is sent."
        in out
    )
    assert "outbox 2, drafts 1" in out


def test_runs_on_a_schedule() -> None:
    out = run("runs_on_a_schedule.py")
    assert "trigger: schedule '0 9 * * 1-5', handler 'digest'" in out
    assert (
        "tick 1: Nothing new since the last digest.\n  woken by schedule 'digest' (0 9 * * 1-5), kept: -"
        in out
    )
    assert (
        "tick 2: 2 new: parcel, invoice. Two deliveries and a visit.\n  woken by schedule 'digest' (0 9 * * 1-5), kept: True"
        in out
    )
    assert "tick 3: 1 new: visitor. Two deliveries and a visit." in out
    assert "sessions: 3 of 3 ticks are their own session" in out
    assert "in an open session: 1 new: letter. Two deliveries and a visit." in out
