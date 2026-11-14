# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`loop apps validate` (S-05): the instant checks of an Appspec, in a terminal and in CI."""

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
        # The scenes' members (agentspecs 0.0.60, A-04).
        "change-detection",
        "crop-monitoring",
        "customer-interview",
        "data-quality",
        "decide",
        # The deck and sheet makers, the player and the Marketer (agentspecs 0.0.148 to 0.0.150, 6 and 7 November 2026).
        "deck-maker",
        "disaster-assessment",
        "event-response",
        # The two Personal Agent Protocol examples (agentspecs 881a752, E-01, E-02).
        "exchange-desk",
        "inbox-triage",
        "marketer",
        "month-end-close",
        "model-choice",
        "order-desk",
        "pipeline-report",
        "player",
        "quote-calculator",
        "report-from-a-file",
        "sales",
        "sheet-maker",
        "ship-or-fix",
        # Datalayer Steward for AWS (agentspecs 0.0.176 as aws-account-agent, 0.0.179 as steward-aws).
        "aws-steward-agent",
        "supplier-comparison",
        "support-desk",
        "web-research",
        # A personal agent at an airline over PACT, shopping at test merchants (EX-13, EX-12).
        "travel-desk",
        "shopping-desk",
        # A PACT business and the personal agent that asks it, a pair (PR-13).
        "guest-desk",
        "errand-runner",
        # Reading a page at a site that checks its signature (EX-11).
        "signed-reader",
        # The Personal Agent Protocol's recorded journeys as applications (PR-05).
        "order-tracker",
        "shop-concierge",
        "live-shop-chat",
        "sign-in-desk",
        "returns-desk",
        "bookkeeping-desk",
        # A coding agent behind the Shield, lent one repository to read (agentspecs 0.0.137).
        "code-explainer",
        # The home page's live demos, moved from the landing (agentspecs 0.0.186).
        "demo-marketer",
        "demo-shopper",
        "demo-terra",
        "demo-accountant",
        "demo-aws-steward",
    }
    assert all(report.verdict != NOT_READY for report in reports.values())
    assert reports["web-research"].setup == []
    # Its agent, example-simple, is out of the galleries since agentspecs 0.0.186.
    assert reports["decide"].setup == [
        "The agent 'example-simple:0.0.1' is not enabled."
    ]
    # The home page's demos run on the five agents the catalogue enables.
    for demo in ("marketer", "shopper", "terra", "accountant", "aws-steward"):
        assert reports[f"demo-{demo}"].setup == [], demo
    # Gmail's server is offered since agentspecs 0.0.128; Inbox triage's worker is out of
    # the picker since agentspecs 0.0.164 (enabled: false), so its setup names it.
    assert reports["inbox-triage"].setup == [
        "The agent 'worker-mail-triage:0.0.1' is not enabled."
    ]
    # The team over A2A: each ready, its setup what is not enabled today.
    assert reports["sales"].setup == [
        "The agent 'worker-sales-pipeline-board-report:0.0.1' is not enabled."
    ]
    # odoo-accounting is enabled since agentspecs 0.0.162: it is no setup step any more.
    assert not any("odoo-accounting" in step for step in reports["accounting"].setup)


def test_json_for_ci(tmp_path: Path) -> None:
    path = write(tmp_path, {**BASE, "connections": [{"server": "tavily:0.0.1"}]})
    result = runner.invoke(app, ["validate", "--json", str(path)])
    assert result.exit_code == 0
    [report] = json.loads(result.output)
    assert report["verdict"] == PASSES and report["path"] == str(path)
