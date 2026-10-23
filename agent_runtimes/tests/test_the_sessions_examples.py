# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sessions and plugins examples, run (MH-46).

``examples/sessions`` and ``examples/plugins`` are what the sessions pages
point a reader at; each script is run here as its README runs it — its own
process, no key, no network — and what its README says it prints is
asserted, so a page cannot describe an example that no longer runs.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

EXAMPLES = Path(__file__).resolve().parents[2] / "examples"


def run(folder: str, script: str) -> str:
    environment = dict(os.environ)
    environment.pop("DATALAYER_IAM_URL", None)
    environment.pop("DATALAYER_API_KEY", None)
    # The example keeps its sessions in a folder of its own: never the test
    # process's store (conftest names one), which other tests fill.
    environment.pop("AGENT_RUNTIMES_SESSIONS_PATH", None)
    done = subprocess.run(
        [sys.executable, script],
        cwd=EXAMPLES / folder,
        env=environment,
        capture_output=True,
        text=True,
        timeout=240,
    )
    assert done.returncode == 0, done.stdout + done.stderr[-4000:]
    return done.stdout


def test_every_script_is_in_its_readme() -> None:
    for folder in ("sessions", "plugins"):
        readme = (EXAMPLES / folder / "README.md").read_text(encoding="utf-8")
        for path in sorted((EXAMPLES / folder).glob("*.py")):
            assert f"python {path.name}" in readme, path.name


def test_a_sessions_life_in_process() -> None:
    out = run("sessions", "sessions_in_process.py")
    assert "opened     " in out and ": Claude: Plan the refactor" in out
    assert "turn 2     Claude: Start with the tests" in out
    assert (
        'is told: "This conversation was with notes-claude until turn 2; from here it is with '
        in out
    )
    assert "what notes-claude kept for itself is gone." in out
    assert "turn 3     Second: Go on" in out
    assert "(paused, 1 turn, from " in out and " at turn 1)" in out
    assert "there is no turn 9 to clone it at." in out
    assert "exported   3 turns, " in out and " 0 redactions → " in out
    assert "imported   " in out and "(paused, 3 turns, from sha256:" in out
    assert ": 3 turns replayed" in out
    assert out.count("listed     ") == 3
    assert "ended      " in out and "(ended)" in out


def test_the_two_packages_contribute_and_a_yaml_without_terms_is_refused() -> None:
    out = run("plugins", "show_contributed.py")
    assert (
        "harnesses  claude-code, codex, custom, fast-agent, gemini-cli, goose, opencode, openhands, aider"
        in out
    )
    assert "formats    datalayer-session/1, omnigent-jsonl/1" in out
    assert "plugins      aider-harness: harness (aider)" in out
    assert (
        "refused    aider-harness: harness 'aider' refused — aider-harness contributes harness 'aider' without terms: a harness whose terms are unknown is not served."
        in out
    )
