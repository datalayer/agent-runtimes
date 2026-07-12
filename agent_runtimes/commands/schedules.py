# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Schedule commands for Datalayer CLI."""

from __future__ import annotations

import os
from typing import Any, Optional

import requests
import typer
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console
from rich.table import Table

app = typer.Typer(
    name="schedules",
    help="Scheduler management commands.",
    invoke_without_command=True,
)

console = Console()


@app.callback()
def schedules_callback(ctx: typer.Context) -> None:
    """Scheduler management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


def _resolve_token(token: Optional[str] = None) -> str:
    if token:
        return token
    env_token = os.environ.get("DATALAYER_API_KEY")
    if env_token:
        return env_token
    try:
        from agent_runtimes.client import AgentClient

        client = AgentClient()
        return client._get_api_key() or ""
    except Exception:
        return ""


def _fetch_scheduler(
    *,
    path: str,
    token: Optional[str] = None,
) -> dict[str, Any]:
    resolved_token = _resolve_token(token)
    if not resolved_token:
        raise RuntimeError(
            "No authentication token found. Pass --api-key, set DATALAYER_API_KEY, or run 'datalayer login'."
        )

    urls = DatalayerURLs.from_environment()
    url = f"{urls.scheduler_url}/api/scheduler/v1{path}"
    headers = {"Authorization": f"Bearer {resolved_token}"}

    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json() if response.content else {}
    if not isinstance(data, dict):
        raise RuntimeError("Unexpected scheduler response payload.")
    return data


def _render_schedules(schedules: list[dict[str, Any]]) -> None:
    table = Table(title="Schedules")
    table.add_column("UID", style="cyan")
    table.add_column("Notebook UID")
    table.add_column("Cron")
    table.add_column("Preset")
    table.add_column("Enabled")
    table.add_column("Next Planned")

    for schedule in schedules:
        table.add_row(
            str(schedule.get("uid", "")),
            str(schedule.get("notebook_uid_s", "")),
            str(schedule.get("cron_expression_s", "")),
            str(schedule.get("preset_s", "")),
            "yes" if bool(schedule.get("enabled_b", True)) else "no",
            str(schedule.get("next_planned_ts_dt", "")),
        )
    console.print(table)


def _render_runs(runs: list[dict[str, Any]]) -> None:
    table = Table(title="Schedule Runs")
    table.add_column("UID", style="cyan")
    table.add_column("Schedule UID")
    table.add_column("Notebook UID")
    table.add_column("State")
    table.add_column("Success")
    table.add_column("Planned")
    table.add_column("Executed")

    for run in runs:
        table.add_row(
            str(run.get("uid", "")),
            str(run.get("schedule_uid_s", "")),
            str(run.get("notebook_uid_s", "")),
            str(run.get("state_s", "")),
            str(run.get("success_b", "")),
            str(run.get("planned_ts_dt", "")),
            str(run.get("executed_ts_dt", "")),
        )
    console.print(table)


@app.command(name="ls")
def list_schedules(
    runs: bool = typer.Option(
        False, "--runs", help="List schedule runs instead of schedule definitions."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    """List scheduler definitions or scheduler runs."""
    try:
        if runs:
            payload = _fetch_scheduler(path="/schedules/runs", token=token)
            _render_runs(payload.get("runs") or [])
            return

        payload = _fetch_scheduler(path="/schedules", token=token)
        _render_schedules(payload.get("schedules") or [])
    except Exception as exc:
        console.print(f"[red]Error listing schedules: {exc}[/red]")
        raise typer.Exit(1)
