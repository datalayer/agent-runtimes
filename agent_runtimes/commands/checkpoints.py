# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Runtime Checkpoint commands for Datalayer CLI (CRIU full-pod checkpoints)."""

import os
from typing import Any, Optional

import typer
from rich.console import Console

from agent_runtimes.displays.runtime_checkpoints import display_runtime_checkpoints
from datalayer_core.utils.urls import DatalayerURLs

# Create a Typer app for checkpoint commands
app = typer.Typer(
    name="checkpoints",
    help="Runtime checkpoint management commands (CRIU full-pod checkpoints)",
    invoke_without_command=True,
)

console = Console()


def _resolve_token(token: Optional[str] = None) -> str:
    """Resolve the authentication token from argument, env var, or DatalayerClient."""
    if token:
        return token
    env_token = os.environ.get("DATALAYER_API_KEY")
    if env_token:
        return env_token
    # Fall back to DatalayerClient's token resolution (keyring, config file, etc.)
    try:
        from agent_runtimes.client import DatalayerClient

        client = DatalayerClient()
        return client._get_token() or ""
    except Exception:
        return ""


def _fetch_api(
    path: str,
    *,
    method: str = "GET",
    token: Optional[str] = None,
    runtimes_url: Optional[str] = None,
) -> Any:
    """Make an authenticated request to the runtimes checkpoints API."""
    import requests

    resolved_token = _resolve_token(token)
    if not resolved_token:
        raise RuntimeError(
            "No authentication token found. Pass --api-key, set DATALAYER_API_KEY, or run 'datalayer login'."
        )
    urls = DatalayerURLs.from_environment(runtimes_url=runtimes_url)
    url = f"{urls.runtimes_url}/api/runtimes/v1{path}"
    headers = {"Authorization": f"Bearer {resolved_token}"}

    response = requests.request(method, url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


@app.callback()
def checkpoints_callback(ctx: typer.Context) -> None:
    """Runtime checkpoint management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
def checkpoints_list(
    agent_uid: Optional[str] = typer.Option(
        None,
        "--agent",
        "-a",
        help="Filter checkpoints by agent UID (pod name). If omitted, lists all checkpoints.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL.",
    ),
) -> None:
    """List runtime checkpoints."""
    try:
        if agent_uid:
            path = f"/runtime-checkpoints/{agent_uid}"
        else:
            path = "/runtime-checkpoints"
        data = _fetch_api(path, token=token, runtimes_url=runtimes_url)
        checkpoints = data.get("checkpoints", [])
        if not checkpoints:
            console.print("[yellow]No checkpoints found.[/yellow]")
            raise typer.Exit(0)
        display_runtime_checkpoints(checkpoints)
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]Error listing checkpoints: {e}[/red]")
        raise typer.Exit(1)


def checkpoints_ls(
    agent_uid: Optional[str] = typer.Option(
        None,
        "--agent",
        "-a",
        help="Filter checkpoints by agent UID (pod name). If omitted, lists all checkpoints.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL.",
    ),
) -> None:
    """List runtime checkpoints (root command alias)."""
    checkpoints_list(agent_uid=agent_uid, token=token, runtimes_url=runtimes_url)


@app.command(name="delete")
def checkpoints_delete(
    checkpoint_uid: str = typer.Argument(..., help="Checkpoint UID to delete"),
    agent_uid: Optional[str] = typer.Option(
        None,
        "--agent",
        "-a",
        help="Agent UID that owns the checkpoint. If omitted, will be looked up automatically.",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL.",
    ),
    yes: bool = typer.Option(
        False,
        "--yes",
        "-y",
        help="Skip confirmation prompt.",
    ),
) -> None:
    """Delete a runtime checkpoint."""
    try:
        # If agent_uid not provided, look up the checkpoint first.
        if not agent_uid:
            # List all checkpoints and find the one matching the uid.
            data = _fetch_api(
                "/runtime-checkpoints", token=token, runtimes_url=runtimes_url
            )
            checkpoints = data.get("checkpoints", [])
            match = next((c for c in checkpoints if c["id"] == checkpoint_uid), None)
            if not match:
                console.print(f"[red]Checkpoint {checkpoint_uid} not found.[/red]")
                raise typer.Exit(1)
            agent_uid = match["runtime_uid"]

        if not yes:
            typer.confirm(
                f"Delete checkpoint {checkpoint_uid} from agent {agent_uid}?",
                abort=True,
            )

        _fetch_api(
            f"/runtime-checkpoints/{agent_uid}/{checkpoint_uid}",
            method="DELETE",
            token=token,
            runtimes_url=runtimes_url,
        )
        console.print(
            f"[green]Checkpoint {checkpoint_uid} deleted successfully.[/green]"
        )

    except typer.Exit:
        raise
    except typer.Abort:
        console.print("[yellow]Aborted.[/yellow]")
    except Exception as e:
        console.print(f"[red]Error deleting checkpoint: {e}[/red]")
        raise typer.Exit(1)
