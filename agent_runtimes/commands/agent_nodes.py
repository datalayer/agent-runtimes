# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agent node commands for Datalayer CLI."""

import os
from typing import Any, Optional

import requests
import typer
from rich.console import Console

from agent_runtimes.displays.agent_nodes import display_agent_nodes
from datalayer_core.utils.urls import DatalayerURLs

app = typer.Typer(
    name="agent-nodes",
    help="Agent Node management commands",
    invoke_without_command=True,
)

console = Console()


def _resolve_token(token: Optional[str] = None) -> str:
    if token:
        return token
    env_token = os.environ.get("DATALAYER_API_KEY")
    if env_token:
        return env_token
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
def agent_nodes_callback(ctx: typer.Context) -> None:
    """Agent Node management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
def list_agent_nodes(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List registered agent nodes."""
    try:
        data = _fetch_api("/agent-nodes", token=token, runtimes_url=runtimes_url)
        nodes = data.get("agent_nodes", [])
        if not nodes:
            console.print("[yellow]No agent nodes found.[/yellow]")
            raise typer.Exit(0)
        display_agent_nodes(nodes)
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]Error listing agent nodes: {e}[/red]")
        raise typer.Exit(1)


def agent_nodes_list(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List registered agent nodes (root command)."""
    list_agent_nodes(token=token, runtimes_url=runtimes_url)


def agent_nodes_ls(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List registered agent nodes (root alias)."""
    list_agent_nodes(token=token, runtimes_url=runtimes_url)
