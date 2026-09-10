# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes evals run` and `evals launches` (BENCHMARK.md, B2-15).

A cloud run is a launch the platform executes: the command imports the
spec, finds or creates one experiment per subject, validates, submits and
follows the launch. Everything the platform is asked is recorded on a fake
client, so what is checked is the conversation, not the service.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from typer.testing import CliRunner

from agent_runtimes.__main__ import app
from agent_runtimes.commands import evals as evals_commands
from agent_runtimes.evals.remote import runner as runner_module
from agent_runtimes.evals.remote.runner import execute_evalset_spec

runner = CliRunner(
    env={"NO_COLOR": "1", "TERM": "dumb", "_TYPER_STANDARD_TRACEBACK": "1"}
)

SPEC = {
    "name": "Data Analysis Agent Benchmark",
    "kind": "batch",
    "evalset_evaluators": [],
    "report_evaluators": [
        {"name": "pass_rate_threshold", "arguments": {"threshold": 0.6}}
    ],
    "cases": [
        {
            "name": "duplicates",
            "inputs": {"prompt": "Find the duplicates."},
            "expected_output": "314",
            "evaluators": [{"name": "contains"}],
        }
    ],
}


class FakeClient:
    """What the platform answers, and every call it was asked."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.experiments: list[dict[str, Any]] = []
        self.executes = True
        self.plan_ok = True
        self.statuses = ["running", "completed"]
        self.blocked_reason = ""

    def _note(self, name: str, kwargs: dict[str, Any]) -> None:
        self.calls.append((name, kwargs))

    def evals_import_eval(self, **kwargs):
        self._note("import", kwargs)
        return {
            "success": True,
            "evalset": {"id": "evalset-1", "name": kwargs["spec"]["name"]},
            "unsupported_evaluators": ["is_instance"],
        }

    def evals_export_eval(self, evalset_id, **kwargs):
        self._note("export", {"evalset_id": evalset_id, **kwargs})
        return dict(SPEC)

    def evals_list_experiments(self, **kwargs):
        self._note("list_experiments", kwargs)
        return {"experiments": list(self.experiments), "total": len(self.experiments)}

    def evals_create_experiment(self, **kwargs):
        self._note("create_experiment", kwargs)
        experiment = {
            "id": f"experiment-{len(self.experiments) + 1}",
            "name": kwargs["name"],
            "config": kwargs["config"],
            "archived": False,
        }
        self.experiments.append(experiment)
        return {"success": True, "experiment": experiment}

    def evals_validate_launch(self, evalset_id, **kwargs):
        self._note("validate", {"evalset_id": evalset_id, **kwargs})
        return {
            "success": True,
            "ok": self.plan_ok,
            "problems": []
            if self.plan_ok
            else [
                {
                    "code": "credits",
                    "severity": "error",
                    "message": "The launch would reserve 180.0 credits and the account has 1.0.",
                }
            ],
            "estimate": {
                "cases": 1,
                "experiments": len(kwargs["experiment_ids"]),
                "slots": 1,
                "duration_seconds": 30.0,
                "duration_basis": "history",
                "credits_reserved": 180.0,
                "credits_available": 500.0,
                "budget_limit": kwargs["config"].get("budget"),
            },
            "compute": {
                "environment": kwargs["config"]["environment"],
                "slots": 1,
                "concurrency": kwargs["config"]["concurrency"],
                "time_reservation": 30.0,
                "burning_rate": 0.1,
            },
            "experiments": [],
            "approvals": {},
            "unsupported_evaluators": [],
        }

    def evals_create_launch(self, evalset_id, **kwargs):
        self._note("create_launch", {"evalset_id": evalset_id, **kwargs})
        return {
            "success": True,
            "launch": {"id": "launch-1", "number": 128, "status": "queued"},
            "runs": [{"id": "run-1", "status": "queued"}],
            "executes": self.executes,
        }

    def evals_get_launch(self, launch_id, **kwargs):
        self._note("get_launch", {"launch_id": launch_id, **kwargs})
        status = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
        launch = {
            "id": launch_id,
            "number": 128,
            "status": status,
            "progress": {
                "completed_cases": 1 if status in {"completed", "blocked"} else 0,
                # The total is known from the benchmark at creation; whether
                # anything has been taken shows in the counts, not the total.
                "total_cases": 1,
                "running_cases": 0,
                "failed_cases": 0,
                "cost_credits": 0.5,
            },
            "blocked_reason": self.blocked_reason if status == "blocked" else "",
        }
        return {
            "success": True,
            "launch": launch,
            "runs": [
                {
                    "id": "run-1",
                    "experiment_id": "experiment-1",
                    "status": status,
                    "metrics": {"pass_rate": 1.0},
                    "summary": (
                        {
                            "agent_spec_id": "a",
                            "failure_cause": {
                                "stage": "infrastructure",
                                "message": "mint_eval_credential: iam refused /api/iam/v1/api-keys/temporary: 403",
                            },
                        }
                        if status == "failed"
                        else {"agent_spec_id": "a"}
                    ),
                    "blocked_reason": (
                        "no_compute: no sandbox of the pool came up (the sandbox of slot 0 did not come up within the provisioning window)"
                        if status == "blocked"
                        else ""
                    ),
                }
            ],
        }

    def evals_list_launches(self, **kwargs):
        self._note("list_launches", kwargs)
        return {
            "success": True,
            "total": 1,
            "launches": [
                {
                    "id": "launch-1",
                    "number": 128,
                    "evalset_id": "evalset-1",
                    "status": "completed",
                    "progress": {
                        "completed_cases": 1,
                        "total_cases": 1,
                        "cost_credits": 0.5,
                    },
                    "created_at": "2026-09-09T00:00:00Z",
                }
            ],
        }

    def evals_cancel_launch(self, launch_id, **kwargs):
        self._note("cancel_launch", {"launch_id": launch_id, **kwargs})
        return {
            "success": True,
            "launch": {"id": launch_id, "number": 128, "status": "cancelled"},
            "cancelled_runs": 1,
        }


@pytest.fixture
def fake(monkeypatch, tmp_path) -> FakeClient:
    client = FakeClient()
    monkeypatch.setattr(evals_commands, "_make_client", lambda token=None: client)
    monkeypatch.setattr(runner_module.time, "sleep", lambda seconds: None)
    client.spec_path = tmp_path / "bench.evalset.json"
    client.spec_path.write_text(json.dumps(SPEC), encoding="utf-8")
    return client


def _names(client: FakeClient) -> list[str]:
    return [name for name, _ in client.calls]


def test_run_imports_the_spec_makes_the_experiments_validates_launches_and_watches(
    fake: FakeClient,
):
    result = runner.invoke(
        app,
        [
            "evals",
            "run",
            str(fake.spec_path),
            "--agent-spec-ids",
            "jupyter-data-analyst,example-evals",
            "--concurrency",
            "2",
            "--budget",
            "12",
            "--environment",
            "gpu-env",
        ],
    )
    assert result.exit_code == 0, result.output
    assert _names(fake) == [
        "import",
        "list_experiments",
        "create_experiment",
        "create_experiment",
        "validate",
        "create_launch",
        "get_launch",
        "get_launch",
    ]
    imported = fake.calls[0][1]
    assert (
        imported["spec"]["name"] == SPEC["name"]
        and imported["run_environment"] == "sdk"
    )
    assert "Dropped evaluators the platform cannot run: is_instance" in result.output
    created = [kwargs for name, kwargs in fake.calls if name == "create_experiment"]
    assert [item["config"]["subject"] for item in created] == [
        {"kind": "agentspec", "ref": "jupyter-data-analyst"},
        {"kind": "agentspec", "ref": "example-evals"},
    ]
    assert all(
        item["config"]["execution_target"] == "cloud"
        and item["evalset_id"] == "evalset-1"
        for item in created
    )
    launched = next(kwargs for name, kwargs in fake.calls if name == "create_launch")
    assert launched["experiment_ids"] == ["experiment-1", "experiment-2"]
    assert launched["config"] == {
        "concurrency": 2,
        "environment": "gpu-env",
        "time_reservation": 60.0,
        "request_timeout_seconds": 180,
        "retention": "snapshots",
        "budget": 12.0,
    }
    assert "Launch 128 submitted" in result.output and "/runs/launch-1" in result.output
    assert "completed" in result.output and "pass_rate=100.0%" in result.output


def test_run_reuses_the_experiment_that_already_runs_the_subject(fake: FakeClient):
    fake.experiments.append(
        {
            "id": "experiment-9",
            "name": "jupyter-data-analyst",
            "config": {"agent_spec_id": "jupyter-data-analyst"},
            "archived": False,
        }
    )
    result = runner.invoke(
        app,
        [
            "evals",
            "run",
            "evalset-1",
            "--agent-spec-ids",
            "jupyter-data-analyst",
            "--no-watch",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "import" not in _names(fake) and "create_experiment" not in _names(fake)
    launched = next(kwargs for name, kwargs in fake.calls if name == "create_launch")
    assert launched["experiment_ids"] == [
        "experiment-9"
    ] and "get_launch" not in _names(fake)


def test_run_takes_models_as_subjects(fake: FakeClient):
    result = runner.invoke(
        app,
        [
            "evals",
            "run",
            "evalset-1",
            "--models",
            "anthropic.claude-sonnet-4",
            "--no-watch",
        ],
    )
    assert result.exit_code == 0, result.output
    created = next(kwargs for name, kwargs in fake.calls if name == "create_experiment")
    assert (
        created["config"]["subject"]
        == {"kind": "model", "ref": "anthropic.claude-sonnet-4"}
        and "agent_spec_id" not in created["config"]
    )


def test_run_needs_a_subject():
    result = runner.invoke(app, ["evals", "run", "evalset-1"])
    assert result.exit_code != 0 and "at least one subject" in result.output


def test_validate_only_shows_the_plan_and_launches_nothing(fake: FakeClient):
    result = runner.invoke(
        app, ["evals", "run", "evalset-1", "--agent-spec-ids", "a", "--validate-only"]
    )
    assert result.exit_code == 0, result.output
    assert (
        "Launch plan" in result.output
        and "Credits reserved" in result.output
        and "180.0" in result.output
    )
    assert "create_launch" not in _names(fake)
    fake.plan_ok = False
    fake.calls.clear()
    result = runner.invoke(
        app, ["evals", "run", "evalset-1", "--agent-spec-ids", "a", "--validate-only"]
    )
    assert result.exit_code == 1 and "credits:" in result.output


def test_a_plan_with_errors_stops_the_run(fake: FakeClient):
    fake.plan_ok = False
    result = runner.invoke(app, ["evals", "run", "evalset-1", "--agent-spec-ids", "a"])
    assert result.exit_code == 1 and "would not run" in result.output
    assert "create_launch" not in _names(fake)


def test_a_blocked_launch_exits_one_with_its_reason(fake: FakeClient):
    fake.statuses = ["running", "blocked"]
    fake.blocked_reason = (
        "budget_reached: 12.00 of the 12.00 credits allowed were consumed"
    )
    result = runner.invoke(app, ["evals", "run", "evalset-1", "--agent-spec-ids", "a"])
    assert result.exit_code == 1, result.output
    assert "Blocked: budget_reached" in result.output
    # And the run's own reason, which the launch does not carry when every
    # run blocked for a reason of its own.
    assert "run run-1 (agentspec a) blocked: no_compute" in result.output


def test_a_deployment_where_nothing_executes_is_refused(fake: FakeClient):
    fake.executes = False
    result = runner.invoke(app, ["evals", "run", "evalset-1", "--agent-spec-ids", "a"])
    assert result.exit_code != 0
    assert "Nothing is executing this launch" in str(result.exception or result.output)
    assert "/runs/launch-1" in str(result.exception or result.output)


class Clock:
    """A clock the tests advance; `sleep` moves it, nothing waits."""

    def __init__(self) -> None:
        self.now = 1_000.0

    def time(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock(monkeypatch) -> Clock:
    clock = Clock()
    monkeypatch.setattr(runner_module.time, "time", clock.time)
    monkeypatch.setattr(runner_module.time, "sleep", clock.sleep)
    return clock


def test_a_launch_nobody_takes_is_given_up_on_with_the_reason(fake: FakeClient, clock: Clock):
    """The launch the platform accepted and then nobody started: `queued`
    with no tasks, poll after poll. Waiting the full hour for that read as a
    hang — no error, no line — so it ends at the queued timeout, naming the
    executor and where the launch stays."""
    fake.statuses = ["queued"]
    lines: list[str] = []
    with pytest.raises(RuntimeError) as refused:
        runner_module.watch_launch(
            fake, "launch-1", queued_timeout_seconds=180, interval_seconds=5, log=lines.append
        )
    assert "still queued after" in str(refused.value)
    assert "durable service" in str(refused.value) and "/runs/launch-1" in str(refused.value)
    assert clock.now - 1_000.0 < 200  # gave up at the queued timeout, not the hour
    assert lines[0].startswith("Launch 128: queued tasks=0/1, waiting for the executor to take it")


def test_the_watch_is_never_silent(fake: FakeClient, clock: Clock):
    """A status that does not change is still reported, every heartbeat,
    with how long it has been: silence and a hang look the same."""
    fake.statuses = ["running"] * 20 + ["completed"]
    lines: list[str] = []
    runner_module.watch_launch(
        fake, "launch-1", interval_seconds=5, heartbeat_seconds=30, log=lines.append
    )
    changes = [line for line in lines if "(t+" in line]
    heartbeats = [line for line in lines if "still running" in line]
    assert len(changes) == 2  # running, then completed
    assert len(heartbeats) >= 2 and "s so far" in heartbeats[0]
    # And a launch that runs — tasks counted — is not held to the queued timeout.
    assert clock.now - 1_000.0 > 90


def test_launches_are_listed_read_and_cancelled(fake: FakeClient):
    listed = runner.invoke(
        app, ["evals", "launches", "ls", "--evalset-id", "evalset-1"]
    )
    assert listed.exit_code == 0, listed.output
    assert "launch-1" in listed.output and "completed" in listed.output
    assert fake.calls[-1] == (
        "list_launches",
        {
            "evalset_id": "evalset-1",
            "status": None,
            "include_archived": False,
            "limit": 50,
            "billing_entity_uid": None,
        },
    )
    one = runner.invoke(app, ["evals", "launches", "get", "launch-1"])
    assert (
        one.exit_code == 0 and "run-1" in one.output and "/runs/launch-1" in one.output
    )
    cancelled = runner.invoke(app, ["evals", "launches", "cancel", "launch-1"])
    assert cancelled.exit_code == 0 and "1 run(s) cancelled" in cancelled.output


def test_subjects_lists_the_kinds_and_the_models(fake: FakeClient, monkeypatch):
    fake.evals_list_subjects = lambda **kwargs: {
        "kinds": [
            {"kind": "agentspec", "executable": True, "label": "An agent"},
            {"kind": "container", "executable": False, "label": "A container image"},
        ],
        "models": ["anthropic.claude-sonnet-4"],
        "default_model": "anthropic.claude-sonnet-4",
        "models_available": True,
    }
    result = runner.invoke(app, ["evals", "subjects"])
    assert result.exit_code == 0, result.output
    assert (
        "agentspec" in result.output
        and "not yet" in result.output
        and "anthropic.claude-sonnet-4" in result.output
    )


def test_the_runner_cloud_target_is_a_launch(fake: FakeClient):
    """The action's execute-runs goes through the runner: on the cloud it
    submits a launch and watches it rather than driving runtimes itself."""
    lines: list[str] = []
    result = execute_evalset_spec(
        fake,
        spec=SPEC,
        agentspec_ids=["jupyter-data-analyst"],
        execution_target="cloud",
        run_limit=1,
        concurrency=3,
        credits_limit=8.0,
        git={"sha": "abc123", "ref": "refs/pull/7/merge", "pr_number": "7", "run_id": "", "repository": None},
        log=lines.append,
    )
    assert (
        result["evalset_id"] == "evalset-1"
        and result["launch_ids"] == ["launch-1"]
        and result["run_ids"] == ["run-1"]
    )
    assert result["launch_statuses"] == {"launch-1": "completed"} and result[
        "view_url"
    ].endswith("/runs/launch-1")
    assert _names(fake) == [
        "import",
        "list_experiments",
        "create_experiment",
        "create_launch",
        "get_launch",
        "get_launch",
    ]
    launched = next(kwargs for name, kwargs in fake.calls if name == "create_launch")
    assert (
        launched["config"]["concurrency"] == 3 and launched["config"]["budget"] == 8.0
    )
    # Where CI made it from rides on the launch (B6-02); empty values do not.
    assert launched["config"]["git"] == {"sha": "abc123", "ref": "refs/pull/7/merge", "pr_number": "7"}
    assert any("Launch 128 submitted" in line for line in lines) and any(
        "completed" in line for line in lines
    )


def test_a_launch_made_by_hand_carries_no_git_context():
    assert "git" not in runner_module.launch_config(git=None)
    assert "git" not in runner_module.launch_config(git={"sha": "", "ref": None})


def test_the_report_names_where_a_ci_launch_came_from():
    from agent_runtimes.evals.lexical import _from_ci

    assert _from_ci({}) == ""
    assert _from_ci({"config": {"git": {}}}) == ""
    line = _from_ci(
        {"config": {"git": {"sha": "0123456789abcdef", "ref": "main", "pr_number": "7", "repository": "datalayer/x", "run_id": "42"}}}
    )
    assert line == "From CI: commit 0123456789ab, on main, pull request #7, of datalayer/x, action run 42"



def test_a_failed_launch_says_why_run_by_run(fake: FakeClient):
    """"Launch 1 failed" alone sent people to the page to learn that every
    run was refused at its first step; the cause is in the answer already."""
    fake.statuses = ["running", "failed"]
    lines: list[str] = []
    result = execute_evalset_spec(
        fake, spec=SPEC, agentspec_ids=["a"], execution_target="cloud", run_limit=1, log=lines.append
    )
    assert result["launch_statuses"] == {"launch-1": "failed"}
    said = "\n".join(lines)
    assert "Launch 128 failed" in said
    assert "run run-1 (agentspec a) failed: infrastructure — mint_eval_credential: iam refused" in said
    # The CLI says the same.
    fake.statuses = ["running", "failed"]
    answer = runner.invoke(app, ["evals", "run", "evalset-1", "--agent-spec-ids", "a"])
    assert "403" in answer.output and "run run-1" in answer.output
