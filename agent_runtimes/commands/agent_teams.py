# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``agent-teams`` command group: a catalogued team, started and followed.

A team is not a new kind of work on the control plane. Starting one delegates
a root execution to it — the call a benchmark's team task makes
(``activities_evals._team_chat``) and the team page's **Launch** — and the
control plane runs its supervisor and its seats as children of that root. So
every command here is a team-shaped front on what ``executions`` already does:

- ``list`` and ``show`` read the catalogue (``agent_runtimes.specs.teams``);
- ``start`` delegates a goal to a team, and can follow it;
- ``runs`` lists a team's root executions; ``status`` shows one run's tree,
  seat by seat;
- ``monitor``, ``steer``, ``pause``, ``resume``, ``cancel``, ``terminate`` and
  ``artifacts`` act on a run — its root, and through it the whole tree —
  through core's own ``executions`` implementation, so the two never drift.

Named ``agent-teams`` and not ``teams``: the Datalayer CLI's ``teams`` lists
the people's teams an account belongs to, and a plugin group of the same name
would be merged into it.
"""

from __future__ import annotations

from typing import Any, Callable, Optional

import typer
from datalayer_core.cli.commands import executions as core_executions
from datalayer_core.cli.commands.contents import OutputFormat
from datalayer_core.cli.commands.executions import keyed, show_receipt, stream
from datalayer_core.cli.commands.orchestration_common import (
    OrchestrationCommandError,
    account_option,
    call,
    client,
    console,
    emit,
    orchestration_command,
    output_option,
)
from datalayer_core.mixins.orchestration import Receipt
from datalayer_core.orchestration import (
    AgentBinding,
    AgentProtocol,
    Execution,
    ExecutionsDelegate,
    ExecutionsPause,
    ExecutionsResume,
    ExecutionsTerminate,
    Objective,
    Policy,
)
from rich.table import Table

from agent_runtimes.orchestration.teams import TEAM_PREFIX, team_seat
from agent_runtimes.specs.teams import get_team_spec, list_team_specs
from agent_runtimes.types import TeamSpec

app = typer.Typer(
    name="agent-teams",
    help="Agent teams: list and show the catalogued teams; start one on a goal, follow it, steer, pause, resume, cancel or terminate it.",
    no_args_is_help=True,
)

#: Replaced by the key derived from the command before it is sent.
_PENDING_KEY = "pending"

_ENDED = {"completed", "failed", "cancelled", "terminated"}


# ---------------------------------------------------------------------------
# What the commands share
# ---------------------------------------------------------------------------


def the_team(team_id: str) -> TeamSpec:
    """The catalogued team, or a refusal that says how to find one."""
    team = get_team_spec(team_id)
    if team is None:
        raise OrchestrationCommandError(
            f"No team '{team_id}' is catalogued: `agent-runtimes agent-teams list` lists them."
        )
    return team


def team_binding(team: TeamSpec) -> AgentBinding:
    """How a run of a team is delegated: to the team, which the control plane
    turns into its supervisor's root execution — the binding a benchmark's
    team task uses, so a run started here is the same kind of run."""
    return AgentBinding(
        agent_id=team.id, capability=team.id, protocol=AgentProtocol.DATALAYER
    )


def team_of(execution: Execution) -> str:
    """The team an execution belongs to, from its seat's agent id; empty for none."""
    agent_id = execution.agent.agent_id
    if not agent_id.startswith(TEAM_PREFIX):
        return ""
    return agent_id[len(TEAM_PREFIX) :].partition("/")[0]


def seat_words(execution: Execution) -> str:
    """A seat as a person reads it, e.g. "Benchmark Runner (runner)"; the agent id when it names no catalogued seat."""
    seat = team_seat(execution.agent.agent_id)
    return (
        f"{seat.name} ({seat.seat})" if seat is not None else execution.agent.agent_id
    )


def _state(execution: Execution) -> str:
    return getattr(execution.status, "value", str(execution.status))


def _lifecycle(
    the_client: Any, method: str, operation: str, command: Any, account: Optional[str]
) -> Receipt:
    """Pause, resume or terminate through the client's own method.

    Core gained ``pause_execution``, ``resume_execution`` and
    ``terminate_execution`` after 1.2.9; with an older core the same command
    goes through the client's one route for every orchestration operation, so
    these commands work with whichever core is installed.
    """
    own: Optional[Callable[..., Receipt]] = getattr(the_client, method, None)
    if own is not None:
        return own(command, account_uid=account)
    # Only for a core older than the method: a private helper, imported where it is needed.
    from datalayer_core.mixins.orchestration import _receipt  # noqa: PLC0415

    return _receipt(
        the_client._orchestration_call(
            operation, body=command.to_wire(), account_uid=account
        )
    )


# ---------------------------------------------------------------------------
# The catalogue
# ---------------------------------------------------------------------------


@app.command("list")
@orchestration_command
def list_teams(
    prefix: Optional[str] = typer.Option(
        None, "--prefix", help="Only the teams whose id starts with this."
    ),
    output: OutputFormat = output_option(),
) -> None:
    """The catalogued teams: id, name, how their seats run, and how many."""
    teams = list_team_specs(prefix)
    rows = [
        {
            "id": team.id,
            "name": team.name,
            "mode": team.execution_mode,
            "seats": len(team.agents),
            "enabled": team.enabled,
        }
        for team in teams
    ]
    if emit({"teams": rows}, output):
        return
    table = Table(title=f"{len(rows)} teams")
    for column in ("Id", "Name", "Mode", "Seats", "Enabled"):
        table.add_column(column)
    for row in rows:
        table.add_row(
            row["id"],
            row["name"],
            str(row["mode"]),
            str(row["seats"]),
            "yes" if row["enabled"] else "no",
        )
    console.print(table)


@app.command("show")
@orchestration_command
def show(
    team_id: str = typer.Argument(
        ..., help="The team, as `agent-teams list` names it."
    ),
    output: OutputFormat = output_option(),
) -> None:
    """A team: its supervisor, its seats in order, what each is for and waits on."""
    team = the_team(team_id)
    if emit(team.model_dump(mode="json"), output):
        return
    supervisor = team.supervisor.name if team.supervisor else "none"
    console.print(
        f"{team.name} ({team.id}) · {team.execution_mode} · supervisor: {supervisor}",
        markup=False,
        highlight=False,
    )
    if team.description:
        console.print(team.description.strip(), markup=False, highlight=False)
    table = Table()
    for column in ("Seat", "Name", "Role", "Waits on", "Goal"):
        table.add_column(column)
    for member in team.agents:
        table.add_row(
            member.id,
            member.name or member.id,
            member.role or "",
            ", ".join(member.depends_on or []),
            member.goal or "",
        )
    console.print(table)


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


@app.command("start")
@orchestration_command
def start(
    team_id: str = typer.Argument(
        ..., help="The team to start, as `agent-teams list` names it."
    ),
    goal: str = typer.Option(..., "--goal", "-g", help="What the team is to do."),
    instructions: Optional[str] = typer.Option(
        None, "--instructions", help="Steering that applies from the start."
    ),
    criterion: Optional[list[str]] = typer.Option(
        None, "--criterion", help="An acceptance criterion; repeatable."
    ),
    deadline: Optional[str] = typer.Option(
        None, "--deadline", help="When the work must be over, as an RFC 3339 instant."
    ),
    idempotency_key: Optional[str] = typer.Option(
        None,
        "--idempotency-key",
        help="The key of this start; derived from what it asks when omitted, so running the same command again is the same run.",
    ),
    watch_after: bool = typer.Option(
        False, "--watch", "-w", help="Then follow the whole team until it is over."
    ),
    account: Optional[str] = account_option(),
    output: OutputFormat = output_option(),
) -> None:
    """Start a team on a goal: one root execution, which its supervisor and seats work under."""
    team = the_team(team_id)
    the_client = client()
    command = call(
        lambda: ExecutionsDelegate(
            idempotency_key=_PENDING_KEY,
            agent=team_binding(team),
            objective=Objective(
                goal=goal,
                acceptance_criteria=criterion or [],
                instructions=instructions,
            ),
            policy=Policy(deadline=deadline),
        )
    )
    receipt: Receipt = call(
        lambda: the_client.delegate_execution(
            keyed(command, idempotency_key), account_uid=account
        )
    )
    show_receipt(
        receipt,
        output,
        delivered=f"Started {team.name}: the durable service took it.",
        undelivered=f"Received for {team.name}, and not dispatched yet.",
    )
    if watch_after:
        stream(
            the_client,
            receipt.execution.execution_id,
            children=True,
            from_sequence=None,
            last_event_id=None,
            account=account,
            output=output,
        )


@app.command("runs")
@orchestration_command
def runs(
    team_id: Optional[str] = typer.Argument(
        None, help="Only this team's runs; every team's when omitted."
    ),
    active: bool = typer.Option(
        False, "--active", help="Only the runs that are not over."
    ),
    limit: int = typer.Option(20, "--limit", "-n", min=1, help="The latest this many."),
    account: Optional[str] = account_option(),
    output: OutputFormat = output_option(),
) -> None:
    """A team's runs, latest first: each root execution, its state and when it started."""
    if team_id:
        the_team(team_id)
    listed = call(lambda: client().list_executions(account_uid=account))
    roots = [
        execution
        for execution in listed
        if execution.depth == 0
        and team_of(execution)
        and (not team_id or team_of(execution) == team_id)
    ]
    if active:
        roots = [execution for execution in roots if _state(execution) not in _ENDED]
    roots = sorted(
        roots, key=lambda execution: str(execution.created_at), reverse=True
    )[:limit]
    rows = [
        {
            "executionId": execution.execution_id,
            "team": team_of(execution),
            "status": _state(execution),
            "goal": execution.objective.goal,
            "createdAt": str(execution.created_at),
        }
        for execution in roots
    ]
    if emit({"runs": rows}, output):
        return
    table = Table(title=f"{len(rows)} team runs")
    for column in ("Execution", "Team", "Status", "Started", "Goal"):
        table.add_column(column, overflow="fold")
    for row in rows:
        table.add_row(
            row["executionId"],
            row["team"],
            row["status"],
            row["createdAt"][:19],
            row["goal"][:80],
        )
    console.print(table)


@app.command("status")
@orchestration_command
def status(
    execution_id: str = typer.Argument(
        ..., help="The run: its root execution, as `agent-teams runs` lists it."
    ),
    account: Optional[str] = account_option(),
    output: OutputFormat = output_option(),
) -> None:
    """One run of a team, seat by seat: who was asked, in what order, and how each stands."""
    the_client = client()
    root = call(
        lambda: the_client.get_execution(execution_id, account_uid=account)
    ).execution
    tree = call(
        lambda: the_client.list_executions(
            root_execution_id=root.root_execution_id, account_uid=account
        )
    )
    tree = sorted(
        tree, key=lambda execution: (execution.depth, str(execution.created_at))
    )
    rows = [
        {
            "executionId": execution.execution_id,
            "seat": seat_words(execution),
            "depth": execution.depth,
            "status": _state(execution),
            "attempts": execution.attempt_count,
            "createdAt": str(execution.created_at),
            "updatedAt": str(execution.updated_at),
            "error": execution.error.message if execution.error else "",
        }
        for execution in tree
    ]
    if emit(
        {"root": root.execution_id, "team": team_of(root), "executions": rows}, output
    ):
        return
    ended = sum(1 for row in rows if row["status"] in _ENDED)
    console.print(
        f"{team_of(root) or 'Not a team run'} · {root.execution_id} · {_state(root)} · {ended} of {len(rows)} executions over",
        markup=False,
        highlight=False,
    )
    table = Table()
    for column in ("Seat", "Status", "Attempts", "Updated", "Execution", "Error"):
        table.add_column(column, overflow="fold")
    for row in rows:
        table.add_row(
            ("  " * row["depth"]) + row["seat"],
            row["status"],
            str(row["attempts"]),
            row["updatedAt"][:19],
            row["executionId"],
            row["error"],
        )
    console.print(table)


@app.command("pause")
@orchestration_command
def pause(
    execution_id: str = typer.Argument(
        ..., help="The run to pause: its root execution."
    ),
    reason: Optional[str] = typer.Option(
        None, "--reason", help="Why, kept on the run."
    ),
    idempotency_key: Optional[str] = typer.Option(
        None, "--idempotency-key", help="The key of this pause; derived when omitted."
    ),
    account: Optional[str] = account_option(),
    output: OutputFormat = output_option(),
) -> None:
    """Ask a run to stop at its next checkpoint; nothing it did is lost."""
    command = call(
        lambda: ExecutionsPause(
            idempotency_key=_PENDING_KEY, execution_id=execution_id, reason=reason
        )
    )
    receipt = call(
        lambda: _lifecycle(
            client(),
            "pause_execution",
            "executions.pause",
            keyed(command, idempotency_key),
            account,
        )
    )
    show_receipt(
        receipt,
        output,
        delivered="Received, and the team was asked to pause.",
        undelivered="Received; the team was not asked yet.",
    )


@app.command("resume")
@orchestration_command
def resume(
    execution_id: str = typer.Argument(..., help="The paused run: its root execution."),
    checkpoint: Optional[str] = typer.Option(
        None,
        "--checkpoint",
        help="The checkpoint to go on from; where it paused when omitted.",
    ),
    idempotency_key: Optional[str] = typer.Option(
        None, "--idempotency-key", help="The key of this resume; derived when omitted."
    ),
    account: Optional[str] = account_option(),
    output: OutputFormat = output_option(),
) -> None:
    """Let a paused run go on."""
    command = call(
        lambda: ExecutionsResume(
            idempotency_key=_PENDING_KEY,
            execution_id=execution_id,
            checkpoint_id=checkpoint,
        )
    )
    receipt = call(
        lambda: _lifecycle(
            client(),
            "resume_execution",
            "executions.resume",
            keyed(command, idempotency_key),
            account,
        )
    )
    show_receipt(
        receipt,
        output,
        delivered="Received, and the team goes on.",
        undelivered="Received; it has not gone on yet.",
    )


@app.command("terminate")
@orchestration_command
def terminate(
    execution_id: str = typer.Argument(..., help="The run to end: its root execution."),
    reason: Optional[str] = typer.Option(
        None, "--reason", help="Why, kept on the run."
    ),
    release_worker: bool = typer.Option(
        True,
        "--release-worker/--keep-worker",
        help="Release its workers too, where that is permitted.",
    ),
    idempotency_key: Optional[str] = typer.Option(
        None,
        "--idempotency-key",
        help="The key of this terminate; derived when omitted.",
    ),
    account: Optional[str] = account_option(),
    output: OutputFormat = output_option(),
) -> None:
    """End a run for good and release its workers; `cancel` stops it and keeps them."""
    command = call(
        lambda: ExecutionsTerminate(
            idempotency_key=_PENDING_KEY,
            execution_id=execution_id,
            reason=reason,
            release_worker=release_worker,
        )
    )
    receipt = call(
        lambda: _lifecycle(
            client(),
            "terminate_execution",
            "executions.terminate",
            keyed(command, idempotency_key),
            account,
        )
    )
    show_receipt(
        receipt,
        output,
        delivered="Received, and the team's run is being ended.",
        undelivered="Received; it has not been ended yet.",
    )


# Following, steering, cancelling and collecting a run are what `executions`
# already does to its root and, through it, the whole tree: the same functions,
# under the words a team's run is spoken of in.
app.command(
    "monitor",
    help="Follow a run: every event of the team's tree, until every execution in it is over.",
)(core_executions.watch)
app.command("steer", help="Add instructions to a run while the team works.")(
    core_executions.steer
)
app.command(
    "cancel",
    help="Stop a run and, by default, every seat under it, keeping its history.",
)(core_executions.cancel)
app.command(
    "artifacts",
    help="What a run produced: the artifacts of its root and, by default, of every seat.",
)(core_executions.artifacts)

__all__ = ["app"]
