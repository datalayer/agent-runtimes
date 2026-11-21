# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The command groups register without pydantic_ai, Jupyter's server or jsonschema (21 November 2026).

Every `datalayer` command registers every command group of this package
before it runs, so what those modules import at their top every command
pays. `agent_runtimes.models.models` imported `pydantic_ai.settings` (the
whole of pydantic_ai, its MCP client and fastmcp: over a second) and
`commands.benchmarks` imported jupyter_server (about a second), and
`evals.spec_schema` jsonschema with its format grammars (0.7 s) — all before
`datalayer sandboxes create` sent its first request. Each is imported where
it is used.

The test names the module whose import statement first loads each of the
three, and fails only when that module is this package's: datalayer-core
imports jupyter_server (and jsonschema under it) at its own top up to
1.2.30, which is datalayer-core's to drop, not this package's.
"""

from __future__ import annotations

import subprocess
import sys

_REGISTER = """
import sys

HEAVY = ("pydantic_ai", "jupyter_server", "jsonschema")
importers = {}


class _Importer:
    # Asked first for every module not loaded yet; finds nothing itself, it
    # only notes which module's import statement asked for a heavy one.
    def find_spec(self, fullname, path=None, target=None):
        if fullname in HEAVY and fullname not in importers:
            frame = sys._getframe(1)
            while frame is not None and frame.f_globals.get("__name__", "").startswith(
                ("importlib", "_frozen_importlib")
            ):
                frame = frame.f_back
            importers[fullname] = frame.f_globals.get("__name__", "") if frame else ""
        return None


sys.meta_path.insert(0, _Importer())
import typer
from agent_runtimes.reactor_extension import AgentRuntimesCliExtension
AgentRuntimesCliExtension().provide_cli(typer.Typer())
print(sorted(f"{m} by {by}" for m, by in importers.items() if by.split(".")[0] == "agent_runtimes"))
"""


def test_registering_the_command_groups_loads_none_of_them() -> None:
    answer = subprocess.run(
        [sys.executable, "-c", _REGISTER],
        capture_output=True,
        text=True,
        check=True,
        timeout=180,
    )
    assert answer.stdout.strip().splitlines()[-1] == "[]"


def test_the_agent_client_loads_without_pydantic_ai() -> None:
    probe = (
        "import sys\nimport agent_runtimes.client\nprint('pydantic_ai' in sys.modules)"
    )
    answer = subprocess.run(
        [sys.executable, "-c", probe],
        capture_output=True,
        text=True,
        check=True,
        timeout=180,
    )
    assert answer.stdout.strip().splitlines()[-1] == "False"


def test_a_model_made_here_still_runs_deterministically() -> None:
    from agent_runtimes.models.models import _deterministic_settings

    assert _deterministic_settings() == {"parallel_tool_calls": False, "temperature": 0}
