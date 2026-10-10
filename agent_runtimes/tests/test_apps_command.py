# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps validate` (LOOP S-05): the instant checks of an Appspec, in a terminal and in CI."""

import json
from pathlib import Path

import pytest
import yaml
from typer.testing import CliRunner

from agent_runtimes.commands.apps import (
    NEEDS_ATTENTION,
    NOT_READY,
    PASSES,
    app,
    validate_file,
)

runner = CliRunner()

pytest.importorskip("agentspecs.apps")

#: The applications of the agentspecs installed — the package carries them.
CATALOGUE = Path(pytest.importorskip("agentspecs.apps").__file__).parent


def write(tmp_path: Path, data: dict, name: str = "app.yaml") -> Path:
    path = tmp_path / name
    path.write_text(yaml.safe_dump(data, sort_keys=False))
    return path


BASE = {
    "schema": "loop.app/v1",
    "id": "desk",
    "name": "Desk",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
}


def test_an_application_that_only_reads_passes_and_is_told_its_tests_decide(
    tmp_path: Path,
) -> None:
    path = write(tmp_path, {**BASE, "connections": [{"server": "tavily:0.0.1"}]})
    report = validate_file(path)
    assert (report.verdict, report.problems, report.attention) == (PASSES, [], [])
    result = runner.invoke(app, ["validate", str(path)])
    assert result.exit_code == 0
    assert "Passes the instant checks" in result.output
    assert "Its tests decide whether it is ready." in result.output


def test_what_is_wrong_makes_it_not_ready_and_fails_the_command(tmp_path: Path) -> None:
    path = write(tmp_path, {**BASE, "agent": "no-such-agent", "colour": "red"})
    report = validate_file(path)
    assert report.verdict == NOT_READY
    assert any("colour is not a field" in line for line in report.problems)
    result = runner.invoke(app, ["validate", str(path)])
    assert result.exit_code == 1
    reference = write(tmp_path, {**BASE, "agent": "no-such-agent"}, "ref.yaml")
    assert validate_file(reference).problems == [
        "There is no agent or Cog named 'no-such-agent'."
    ]


def test_what_it_can_do_without_a_rule_needs_attention(tmp_path: Path) -> None:
    path = write(
        tmp_path,
        {**BASE, "connections": [{"server": "slack:0.0.1", "access": "write"}]},
    )
    report = validate_file(path)
    assert report.verdict == NEEDS_ATTENTION
    assert any(line.startswith("It can send (slack.") for line in report.attention)
    assert any("with its builder's account" in line for line in report.attention)
    assert runner.invoke(app, ["validate", str(path)]).exit_code == 0
    assert runner.invoke(app, ["validate", "--strict", str(path)]).exit_code == 2
    ruled = write(
        tmp_path,
        {
            **BASE,
            "connections": [{"server": "slack:0.0.1", "access": "write", "as": "user"}],
            "rules": [
                {
                    "action": "Post a message",
                    "applies_to": "send",
                    "behaviour": "ask_first",
                }
            ],
        },
        "ruled.yaml",
    )
    assert validate_file(ruled).verdict == PASSES


def test_a_file_that_is_not_an_application_is_not_ready(tmp_path: Path) -> None:
    broken = tmp_path / "broken.yaml"
    broken.write_text("kind: [chat\n")
    assert validate_file(broken).verdict == NOT_READY
    listed = tmp_path / "list.yaml"
    listed.write_text("- a\n- b\n")
    assert validate_file(listed).problems == ["The file is not an application."]


def test_every_application_of_the_catalogue_is_valid_and_says_its_setup() -> None:
    reports = {
        path.stem: validate_file(path) for path in sorted(CATALOGUE.glob("*.yaml"))
    }
    assert set(reports) == {
        "accounting",
        # The scenes' members (agentspecs 0.0.60, LOOP A-04).
        "change-detection",
        "crop-monitoring",
        "customer-interview",
        "data-quality",
        "decide",
        "disaster-assessment",
        "event-response",
        "inbox-triage",
        "month-end-close",
        "model-choice",
        "pipeline-report",
        "quote-calculator",
        "report-from-a-file",
        "sales",
        "ship-or-fix",
        "supplier-comparison",
        "support-desk",
        "web-research",
    }
    assert all(report.verdict != NOT_READY for report in reports.values())
    assert reports["web-research"].setup == []
    assert reports["decide"].setup == []
    assert any("not enabled" in line for line in reports["inbox-triage"].setup)
    # The team over A2A: each ready, its setup what is not enabled today.
    assert reports["sales"].setup == [
        "The agent 'worker-sales-pipeline-board-report:0.0.1' is not enabled."
    ]
    assert "The MCP server 'odoo-accounting:0.0.1' is not enabled." in (
        reports["accounting"].setup
    )


def test_json_for_ci(tmp_path: Path) -> None:
    path = write(tmp_path, {**BASE, "connections": [{"server": "tavily:0.0.1"}]})
    result = runner.invoke(app, ["validate", "--json", str(path)])
    assert result.exit_code == 0
    [report] = json.loads(result.output)
    assert report["verdict"] == PASSES and report["path"] == str(path)
