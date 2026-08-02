# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Persisted memory management commands for the Datalayer CLI (platform_admin only).

These commands call the protected admin endpoints exposed by the datalayer-runtimes
service, which query the pgvector memory database that backs the Datalayer AI
agents (mem0ai). Only users with the ``platform_admin`` role are authorized; the
endpoints reject everyone else.
"""

import os
from typing import Any, Optional

import typer
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console

from agent_runtimes.displays.memories import display_memories, display_memory

# Create a Typer app for memory commands.
app = typer.Typer(
    name="memory",
    help="Persisted agent memory management commands (platform_admin only).",
    invoke_without_command=True,
)

console = Console()


def _resolve_token(token: Optional[str] = None) -> str:
    """Resolve the authentication token from argument, env var, or AgentClient."""
    if token:
        return token
    env_token = os.environ.get("DATALAYER_API_KEY")
    if env_token:
        return env_token
    # Fall back to AgentClient's token resolution (keyring, config file, etc.)
    try:
        from agent_runtimes.client import AgentClient

        client = AgentClient()
        return client._get_api_key() or ""
    except Exception:
        return ""


def _fetch_api(
    path: str,
    *,
    method: str = "GET",
    params: Optional[dict[str, Any]] = None,
    token: Optional[str] = None,
    runtimes_url: Optional[str] = None,
) -> Any:
    """Make an authenticated request to the runtimes memory API."""
    import requests

    resolved_token = _resolve_token(token)
    if not resolved_token:
        raise RuntimeError(
            "No authentication token found. Pass --api-key, set DATALAYER_API_KEY, or run 'datalayer login'."
        )
    urls = DatalayerURLs.from_environment(runtimes_url=runtimes_url)
    url = f"{urls.runtimes_url}/api/runtimes/v1{path}"
    headers = {"Authorization": f"Bearer {resolved_token}"}

    response = requests.request(
        method, url, headers=headers, params=params, timeout=30
    )
    response.raise_for_status()
    return response.json()


@app.callback()
def memory_callback(ctx: typer.Context) -> None:
    """Persisted agent memory management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
@app.command(name="list")
def memory_list(
    user_id: Optional[str] = typer.Option(
        None,
        "--user",
        "-u",
        help="Filter memories by user id (personal account).",
    ),
    agent_id: Optional[str] = typer.Option(
        None,
        "--agent",
        "-a",
        help="Filter memories by agent id.",
    ),
    limit: int = typer.Option(
        100,
        "--limit",
        "-l",
        help="Maximum number of memories to return.",
    ),
    offset: int = typer.Option(
        0,
        "--offset",
        help="Number of memories to skip.",
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
    """List persisted agent memories."""
    try:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if user_id:
            params["user_id"] = user_id
        if agent_id:
            params["agent_id"] = agent_id
        data = _fetch_api(
            "/memories", params=params, token=token, runtimes_url=runtimes_url
        )
        memories = data.get("memories", [])
        if not memories:
            console.print("[yellow]No memories found.[/yellow]")
            raise typer.Exit(0)
        display_memories(memories)
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]Error listing memories: {e}[/red]")
        raise typer.Exit(1)


@app.command(name="inspect")
def memory_inspect(
    memory_id: str = typer.Argument(..., help="Memory id to inspect."),
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
    """Inspect a single persisted memory by id."""
    try:
        data = _fetch_api(
            f"/memories/{memory_id}", token=token, runtimes_url=runtimes_url
        )
        memory = data.get("memory")
        if not memory:
            console.print(f"[red]Memory {memory_id} not found.[/red]")
            raise typer.Exit(1)
        display_memory(memory)
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]Error inspecting memory: {e}[/red]")
        raise typer.Exit(1)


@app.command(name="stats")
def memory_stats(
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
    """Show aggregate statistics about persisted memories."""
    try:
        data = _fetch_api("/memories/stats", token=token, runtimes_url=runtimes_url)
        stats = data.get("stats", {})
        console.print(
            f"[cyan]Collection:[/cyan] {stats.get('collection')}\n"
            f"[cyan]Total memories:[/cyan] {stats.get('total')}\n"
            f"[cyan]Distinct users:[/cyan] {stats.get('distinct_users')}\n"
            f"[cyan]Distinct agents:[/cyan] {stats.get('distinct_agents')}"
        )
    except typer.Exit:
        raise
    except Exception as e:
        console.print(f"[red]Error fetching memory stats: {e}[/red]")
        raise typer.Exit(1)
