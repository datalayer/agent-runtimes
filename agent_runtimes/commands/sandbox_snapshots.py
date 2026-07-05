# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Runtime Snapshot commands for Datalayer CLI."""

from typing import Optional

import typer
from rich.console import Console

from agent_runtimes.client import DatalayerClient
from agent_runtimes.displays.sandbox_snapshots import display_code_sandbox_snapshots

# Create a Typer app for snapshot commands
app = typer.Typer(
    name="sandbox-snapshots",
    help="Runtime snapshots management commands",
    invoke_without_command=True,
)

console = Console()


@app.callback()
def snapshots_callback(ctx: typer.Context) -> None:
    """Runtime snapshots management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
def list_snapshots(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
) -> None:
    """List all snapshots."""
    try:
        client = DatalayerClient(token=token)
        snapshots = client.list_snapshots()

        # Convert to dict format for display_snapshots
        snapshot_dicts = []
        for snapshot in snapshots:
            snapshot_dicts.append(
                {
                    "uid": snapshot.uid,
                    "name": snapshot.name,
                    "description": snapshot.description,
                    "environment": snapshot.environment,
                    "metadata": snapshot.metadata,
                }
            )

        display_code_sandbox_snapshots(snapshot_dicts)

    except Exception as e:
        console.print(f"[red]Error listing snapshots: {e}[/red]")
        raise typer.Exit(1)


@app.command(name="create")
def create_snapshot(
    pod_name: Optional[str] = typer.Option(
        None,
        "--pod-name",
        help="Pod name of the runtime to snapshot",
    ),
    name: Optional[str] = typer.Option(
        None,
        "--name",
        help="Name for the snapshot",
    ),
    description: Optional[str] = typer.Option(
        None,
        "--description",
        help="Description for the snapshot",
    ),
    stop: bool = typer.Option(
        True,
        "--stop/--no-stop",
        help="Whether to stop the runtime after creating snapshot",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
) -> None:
    """Create a snapshot from a running runtime."""
    try:
        client = DatalayerClient(token=token)

        snapshot = client.create_snapshot(
            pod_name=pod_name,
            name=name,
            description=description,
            stop=stop,
        )

        # Convert to dict format for display_snapshots
        snapshot_dict = {
            "uid": snapshot.uid,
            "name": snapshot.name,
            "description": snapshot.description,
            "environment": snapshot.environment,
            "metadata": snapshot.metadata,
        }

        display_code_sandbox_snapshots([snapshot_dict])
        console.print(
            f"[green]Snapshot '{snapshot.name}' created successfully![/green]"
        )

    except Exception as e:
        console.print(f"[red]Error creating snapshot: {e}[/red]")
        raise typer.Exit(1)


@app.command(name="delete")
def delete_snapshot(
    uid: str = typer.Argument(..., help="UID of the snapshot to delete"),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
) -> None:
    """Delete a snapshot."""
    try:
        client = DatalayerClient(token=token)

        result = client.delete_snapshot(uid)

        if result.get("success", False):
            console.print(f"[green]Snapshot '{uid}' deleted successfully![/green]")
        else:
            console.print(
                f"[red]Failed to delete snapshot '{uid}': {result.get('message', 'Unknown error')}[/red]"
            )
            raise typer.Exit(1)

    except Exception as e:
        console.print(f"[red]Error deleting snapshot: {e}[/red]")
        raise typer.Exit(1)


# Root level commands for convenience
def snapshots_list(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
) -> None:
    """List all snapshots (root command)."""
    list_snapshots(token=token)


def snapshots_ls(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
) -> None:
    """List all snapshots (root command alias)."""
    list_snapshots(token=token)
