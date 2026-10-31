# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The sessions plugin contributes whatever module a process imports first (MH-F01).

Importing ``agent_teams`` builds its app and discovers every extension under
``datalayer.reactor.extensions`` — ours among them, whose built-in plugin
imports the applications and the adapters. A module of theirs that imported
``agent_teams`` at module level was therefore half-initialised when that import
re-entered it, and the reactor logged ``Plugin agent-runtimes.sessions failed
to contribute: cannot import name 'DELEGATION_META_KEY' from partially
initialized module 'agent_runtimes.guardrails.model_budget' (most likely due
to a circular import)``: agent-teams' platform ran without a harness, a store
or a format. `context.delegation` is the one module that imports the package
at module level, and nothing the plugin contributes imports it; these tests
hold that, each in a fresh interpreter, since import order is per process.
"""

from __future__ import annotations

import subprocess
import sys
from textwrap import dedent

import pytest

#: What a cold interpreter imports first: the two modules that were
#: half-initialised, the leaf that keeps the output formats off the
#: orchestration package, and the applications themselves.
FIRST = [
    "agent_runtimes.guardrails.model_budget",
    "agent_runtimes.context.delegation",
    "agent_runtimes.output.formats",
    "agent_runtimes.apps",
]

#: The exit code of a fresh interpreter whose agent-teams has no platform.
NO_PLATFORM = 77

#: The roots of what the built-in plugin contributes (`plugins.builtin`).
CONTRIBUTED = ["agent_runtimes.apps", "agent_runtimes.adapters.acp_agent"]


def _fresh(script: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 - the interpreter running the suite, our own script
        [sys.executable, "-W", "error::ImportWarning", "-c", dedent(script)],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )


@pytest.mark.parametrize("first", FIRST)
def test_the_sessions_plugin_contributes_on_agent_teams_platform(first: str) -> None:
    done = _fresh(
        f"""
        import importlib, json
        importlib.import_module({first!r})
        from agent_teams.app import create_app
        app = create_app()  # agent-teams builds no app at import time
        from agent_runtimes.plugins.host import BUILTIN_PLUGIN, accepted
        from agent_runtimes.plugins.points import POINTS
        manager = app.state.team_manager
        if not hasattr(manager, "platform"):
            raise SystemExit({NO_PLATFORM})
        platform = manager.platform
        assert platform.has_plugin(BUILTIN_PLUGIN), BUILTIN_PLUGIN
        print(json.dumps({{point.id: len(accepted(platform, point)) for point in POINTS}}))
        """
    )
    if done.returncode == NO_PLATFORM:
        pytest.skip(
            "the installed agent-teams runs no reactor platform (released before TeamManager.platform)"
        )
    assert done.returncode == 0, done.stderr
    assert "failed to contribute" not in done.stderr, done.stderr
    assert "circular import" not in done.stderr, done.stderr
    counts = __import__("json").loads(done.stdout.strip().splitlines()[-1])
    assert set(counts) == {
        "harness",
        "session.store",
        "session.format",
        "session.carry",
        "session.hook",
    }
    assert all(counts.values()), counts


@pytest.mark.parametrize("root", CONTRIBUTED)
def test_what_the_plugin_contributes_never_imports_agent_teams(root: str) -> None:
    done = _fresh(
        f"""
        import importlib, sys
        importlib.import_module({root!r})
        print(sorted(name for name in sys.modules if name == "agent_teams"))
        """
    )
    assert done.returncode == 0, done.stderr
    assert done.stdout.strip().splitlines()[-1] == "[]"
