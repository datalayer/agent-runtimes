# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Shield's Python examples, run (SH-23, G-10).

``examples/shield`` is what the harnesses pages and the README point a reader
at; each script is run here as the README runs it — its own process, on the
fake agent, no key — and what its README says it prints is asserted, so a
page cannot describe an example that no longer runs.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

EXAMPLES = Path(__file__).resolve().parents[2] / "examples" / "shield"


def run(script: str, *args: str) -> str:
    """Run one example from its folder; its standard output, after a clean exit."""
    environment = dict(os.environ)
    # No organization's rules from a real IAM: the default policy decides.
    environment.pop("DATALAYER_IAM_URL", None)
    done = subprocess.run(
        [sys.executable, script, *args],
        cwd=EXAMPLES,
        env=environment,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert done.returncode == 0, done.stdout + done.stderr[-4000:]
    return done.stdout


def test_every_script_is_in_the_readme() -> None:
    readme = (EXAMPLES / "README.md").read_text(encoding="utf-8")
    scripts = sorted(path.name for path in EXAMPLES.glob("*.py"))
    for script in scripts:
        if script == "fake_harness.py":
            continue
        assert f"python {script}" in readme, script


@pytest.mark.skipif(
    shutil.which("agent-shield") is None, reason="agent-shield not on the PATH"
)
def test_the_proxy_driven_from_python() -> None:
    out = run("proxy_from_python.py")
    assert "asked      git push origin main? (Allow, Reject) -> Reject" in out
    assert "is outside the workspace" in out
    assert "fs_write    Write hello.txt (hello.txt): do it" in out
    assert "The edit was done without asking, the push was asked and refused." in out


def test_a_harness_on_the_local_runtime() -> None:
    out = run("harness_on_the_runtime.py")
    assert "tool call  Write hello.txt — do it (edit)" in out
    assert "diff       hello.txt: '' -> 'hello, shield\\n'" in out
    assert "finished" in out


def test_claude_code_is_refused_in_a_sentence_without_its_adapter() -> None:
    if shutil.which("claude-agent-acp"):
        pytest.skip("Claude Code's adapter is installed here")
    done = subprocess.run(
        [sys.executable, "harness_on_the_runtime.py", "--harness", "claude-code"],
        cwd=EXAMPLES,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert done.returncode == 2
    assert "Claude Code's adapter @agentclientprotocol/claude-agent-acp" in done.stdout


def test_a_rule_tightened_on_a_running_session() -> None:
    out = run("session_rule.py")
    assert "Shield     Read README.md — leave it to me" in out
    assert (
        "The session rule is refused, it would permit more than the organization's policy"
        in out
    )
    assert out.rstrip().endswith("agent      done")


def test_the_audit_read_back_from_the_record() -> None:
    out = run("audit_read_back.py")
    assert "approval  Run `echo [redacted]`: approved: allow_once" in out
    assert "[kept whole: hello.txt now 'hello, shield\\n']" in out
    assert "The key appears nowhere in the record." in out


def test_an_orchestrator_delegates_to_a_harness_and_reads_the_diff() -> None:
    out = run("delegate_to_a_harness.py")
    assert "artifact   hello.txt (text/x-diff)" in out
    assert "+hello, shield" in out
    assert "(matches)" in out
