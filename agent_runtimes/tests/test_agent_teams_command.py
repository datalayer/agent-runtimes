# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""`agent-runtimes agent-teams`: a catalogued team, started and followed.

A team's run is a root execution the control plane runs the team under, so
these commands are a team-shaped front on `executions`. What is held here:
the catalogue is read as it is, a start delegates to the team the way a
benchmark's team task does, a run's tree is shown seat by seat, the lifecycle
commands carry what they ask, and following, steering, cancelling and
collecting are core's own functions rather than copies.
"""

from __future__ import annotations

import json
import re
from types import SimpleNamespace
from typing import Any

import pytest
from datalayer_core.orchestration import (
    AgentBinding,
    AgentProtocol,
    Execution,
    ExecutionState,
    Objective,
)
from typer.testing import CliRunner

from agent_runtimes.__main__ import app
from agent_runtimes.commands import agent_teams
from agent_runtimes.reactor_extension import _COMMAND_GROUPS

runner = CliRunner(
    env={
        "NO_COLOR": "1",
        "TERM": "dumb",
        "COLUMNS": "200",
        "_TYPER_STANDARD_TRACEBACK": "1",
    }
)
NOW = "2026-09-18T10:07:03Z"


def plain(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def an_execution(
    execution_id: str,
    agent_id: str,
    *,
    parent: str | None = None,
    root: str = "exec_root",
    depth: int = 0,
    state: ExecutionState = ExecutionState.COMPLETED,
    created: str = NOW,
) -> Execution:
    return Execution(
        execution_id=execution_id,
        parent_execution_id=parent,
        root_execution_id=root,
        depth=depth,
        status=state,
        agent=AgentBinding(
            agent_id=agent_id, capability="c", protocol=AgentProtocol.A2A
        ),
        objective=Objective(goal=f"goal of {execution_id}"),
        created_at=created,
        updated_at=created,
    )


TREE = [
    an_execution("exec_root", "team:notebook-benchmark/supervisor"),
    an_execution(
        "exec_r", "team:notebook-benchmark/runner", parent="exec_root", depth=1
    ),
    an_execution(
        "exec_a", "team:notebook-benchmark/analyst", parent="exec_root", depth=1
    ),
    an_execution(
        "exec_v",
        "team:notebook-benchmark/reviewer",
        parent="exec_root",
        depth=1,
        state=ExecutionState.FAILED,
    ),
]
OTHER = [
    an_execution(
        "exec_old",
        "team:notebook-benchmark/supervisor",
        root="exec_old",
        created="2026-09-14T11:32:49Z",
    ),
    an_execution(
        "exec_live",
        "team:jupyter/supervisor",
        root="exec_live",
        state=ExecutionState.RUNNING,
    ),
    an_execution("exec_solo", "jupyter-data-analyst", root="exec_solo"),
]
RECORDED: dict[str, Any] = {}


def a_receipt(execution: Execution, delivered: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        execution=execution,
        delivered=delivered,
        detail=None,
        to_wire=lambda: {"execution": execution.to_wire(), "delivered": delivered},
    )


class Client:
    def delegate_execution(
        self, command: Any, *, account_uid: str | None = None
    ) -> Any:
        RECORDED["delegated"] = command
        return a_receipt(
            an_execution(
                "exec_new",
                "team:notebook-benchmark/supervisor",
                root="exec_new",
                state=ExecutionState.CREATED,
            )
        )

    def list_executions(
        self,
        *,
        root_execution_id: str | None = None,
        account_uid: str | None = None,
        **_: Any,
    ) -> list[Execution]:
        RECORDED["listed"] = root_execution_id
        return (
            [one for one in TREE if one.root_execution_id == root_execution_id]
            if root_execution_id
            else TREE + OTHER
        )

    def get_execution(
        self, execution_id: str, *, account_uid: str | None = None
    ) -> Any:
        return SimpleNamespace(
            execution=next(
                one for one in TREE + OTHER if one.execution_id == execution_id
            )
        )

    def pause_execution(self, command: Any, *, account_uid: str | None = None) -> Any:
        RECORDED["paused"] = command
        return a_receipt(TREE[0])

    def resume_execution(self, command: Any, *, account_uid: str | None = None) -> Any:
        RECORDED["resumed"] = command
        return a_receipt(TREE[0])

    def terminate_execution(
        self, command: Any, *, account_uid: str | None = None
    ) -> Any:
        RECORDED["terminated"] = command
        return a_receipt(TREE[0], delivered=False)


class OlderCoreClient:
    """A core from before `pause_execution`: one route for every operation."""

    def _orchestration_call(
        self, operation: str, *, body: dict[str, Any], account_uid: str | None = None
    ) -> dict[str, Any]:
        RECORDED["called"] = (operation, body)
        from datalayer_core.orchestration import (
            Acknowledgement,
            AcknowledgementKind,
            CommandName,
        )

        acknowledgement = Acknowledgement(
            kind=AcknowledgementKind.RECEIVED,
            execution_id="exec_root",
            command=CommandName.EXECUTIONS_PAUSE,
            acknowledged_at=NOW,
        )
        return {
            "execution": TREE[0].to_wire(),
            "acknowledgement": acknowledgement.to_wire(),
            "delivered": True,
        }


@pytest.fixture(autouse=True)
def client(monkeypatch: pytest.MonkeyPatch) -> None:
    RECORDED.clear()
    monkeypatch.setattr(agent_teams, "client", lambda: Client())


def invoke(*args: str) -> Any:
    return runner.invoke(app, ["agent-teams", *args])


class TestTheCatalogue:
    def test_lists_every_catalogued_team(self) -> None:
        listed = json.loads(plain(invoke("list", "-o", "json").stdout))["teams"]
        assert "notebook-benchmark" in {team["id"] for team in listed}
        benchmark = next(team for team in listed if team["id"] == "notebook-benchmark")
        assert (benchmark["mode"], benchmark["seats"]) == ("sequential", 3)

    def test_shows_a_teams_seats_in_order_with_what_each_waits_on(self) -> None:
        shown = invoke("show", "notebook-benchmark")
        assert shown.exit_code == 0, shown.output
        text = plain(shown.stdout)
        assert text.index("runner") < text.index("analyst") < text.index("reviewer")
        assert "Benchmark Supervisor" in text

    def test_a_team_nobody_catalogued_is_refused_with_the_way_to_find_one(self) -> None:
        refused = invoke("show", "no-such-team")
        assert refused.exit_code != 0
        assert "agent-teams list" in plain(refused.output)


class TestARun:
    def test_start_delegates_to_the_team_as_a_benchmark_task_does(self) -> None:
        started = invoke(
            "start",
            "notebook-benchmark",
            "--goal",
            "Find the duplicate customers",
            "--criterion",
            "Say how many",
        )
        assert started.exit_code == 0, started.output
        command = RECORDED["delegated"]
        # The binding `activities_evals._team_chat` delegates with: the team, over the Datalayer protocol.
        assert (
            command.agent.agent_id,
            command.agent.capability,
            command.agent.protocol,
        ) == ("notebook-benchmark", "notebook-benchmark", AgentProtocol.DATALAYER)
        assert command.objective.goal == "Find the duplicate customers"
        assert command.objective.acceptance_criteria == ["Say how many"]
        assert command.idempotency_key.startswith("cmd-")
        assert "Started Notebook Benchmark Team" in plain(started.stdout)

    def test_runs_are_a_teams_roots_latest_first_and_nothing_else(self) -> None:
        listed = json.loads(
            plain(invoke("runs", "notebook-benchmark", "-o", "json").stdout)
        )["runs"]
        assert [run["executionId"] for run in listed] == ["exec_root", "exec_old"]
        every = json.loads(plain(invoke("runs", "-o", "json").stdout))["runs"]
        # Seats are not runs, and an execution of no team is not a team's run.
        assert {run["executionId"] for run in every} == {
            "exec_root",
            "exec_old",
            "exec_live",
        }
        active = json.loads(plain(invoke("runs", "--active", "-o", "json").stdout))[
            "runs"
        ]
        assert [run["executionId"] for run in active] == ["exec_live"]

    def test_status_shows_the_tree_seat_by_seat(self) -> None:
        shown = json.loads(plain(invoke("status", "exec_root", "-o", "json").stdout))
        assert RECORDED["listed"] == "exec_root"
        assert shown["team"] == "notebook-benchmark"
        assert [(row["seat"], row["status"]) for row in shown["executions"]] == [
            ("Benchmark Supervisor (supervisor)", "completed"),
            ("Benchmark Runner (runner)", "completed"),
            ("Benchmark Analyst (analyst)", "completed"),
            ("Benchmark Reviewer (reviewer)", "failed"),
        ]
        table = plain(invoke("status", "exec_root").stdout)
        assert "4 of 4 executions over" in table


class TestItsLifecycle:
    def test_pause_resume_and_terminate_carry_what_they_ask(self) -> None:
        assert (
            invoke("pause", "exec_root", "--reason", "Waiting for the data").exit_code
            == 0
        )
        assert (RECORDED["paused"].execution_id, RECORDED["paused"].reason) == (
            "exec_root",
            "Waiting for the data",
        )
        assert invoke("resume", "exec_root", "--checkpoint", "ckpt_1").exit_code == 0
        assert RECORDED["resumed"].checkpoint_id == "ckpt_1"
        ended = invoke("terminate", "exec_root", "--keep-worker")
        assert ended.exit_code == 0, ended.output
        assert RECORDED["terminated"].release_worker is False
        assert "it has not been ended yet" in plain(ended.stdout)

    def test_with_an_older_core_the_same_command_goes_through_its_one_route(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(agent_teams, "client", lambda: OlderCoreClient())
        paused = invoke("pause", "exec_root")
        assert paused.exit_code == 0, paused.output
        operation, body = RECORDED["called"]
        assert operation == "executions.pause" and body["executionId"] == "exec_root"

    def test_following_steering_cancelling_and_collecting_are_core_s_own(self) -> None:
        from datalayer_core.cli.commands import executions as core

        registered = {
            command.name: command.callback
            for command in agent_teams.app.registered_commands
        }
        for ours, theirs in (
            ("monitor", core.watch),
            ("steer", core.steer),
            ("cancel", core.cancel),
            ("artifacts", core.artifacts),
        ):
            assert registered[ours] is theirs


def test_it_is_on_both_entry_points() -> None:
    result = runner.invoke(app, ["--help"])
    assert result.exit_code == 0 and "agent-teams" in plain(result.stdout)
    assert "agent_runtimes.commands.agent_teams" in _COMMAND_GROUPS
