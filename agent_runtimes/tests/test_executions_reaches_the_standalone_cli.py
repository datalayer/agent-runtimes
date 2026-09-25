# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`datalayer executions`, mirrored into agent-runtimes' own CLI (ORCHESTRATOR.md,
O1-13): reused, not rebuilt, so `agent-runtimes`/`datalayer-agents`/`loop`/`l`
— which have no `executions` group of their own — reach the same commands the
`datalayer` CLI does, over the one implementation core already has.
"""

from __future__ import annotations

from typer.testing import CliRunner

from agent_runtimes.__main__ import app
from agent_runtimes.commands.executions import app as executions_app
from agent_runtimes.reactor_extension import _COMMAND_GROUPS

runner = CliRunner(
    env={"NO_COLOR": "1", "TERM": "dumb", "_TYPER_STANDARD_TRACEBACK": "1"}
)


def test_it_is_core_s_own_app_not_a_copy():
    """Reused, so a fix to one is a fix to both — there is only one."""
    from datalayer_core.cli.commands.executions import app as core_app

    assert executions_app is core_app


def test_it_is_reachable_from_the_standalone_entry_point():
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0
    assert "executions" in result.stdout


def test_its_commands_are_the_ones_the_datalayer_cli_serves():
    result = runner.invoke(app, ["executions", "--help"])
    assert result.exit_code == 0
    for command in ("run", "watch", "steer", "cancel", "artifacts"):
        assert command in result.stdout


def test_it_is_advertised_to_the_reactor_plugin_path_too():
    """The other entry point: `datalayer executions ...` once agent-runtimes
    is installed beside it. Its own merge logic (`_ExtensionHost`) is core's
    to test; this only holds that the module is on the list it reads."""
    assert "agent_runtimes.commands.executions" in _COMMAND_GROUPS
