# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Runtime pool administration commands for Datalayer CLI."""

import os
from typing import Any, Optional

import requests
import typer
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console
from rich.table import Table

from agent_runtimes.client import AgentClient

app = typer.Typer(
    name="pools",
    help="Runtime pool administration commands",
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
        client = AgentClient()
        return client._get_api_key() or ""
    except Exception:
        return ""


def _runtimes_base_url(runtimes_url: Optional[str] = None) -> str:
    urls = DatalayerURLs.from_environment(runtimes_url=runtimes_url)
    return urls.runtimes_url.rstrip("/")


def _api_get(path: str, *, token: Optional[str], runtimes_url: Optional[str]) -> Any:
    resolved_token = _resolve_token(token)
    if not resolved_token:
        raise RuntimeError(
            "No authentication token found. Pass --api-key, set DATALAYER_API_KEY, or run 'datalayer login'."
        )
    url = f"{_runtimes_base_url(runtimes_url)}/api/runtimes/v1{path}"
    headers = {"Authorization": f"Bearer {resolved_token}"}
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def _api_post(
    path: str,
    payload: dict[str, Any],
    *,
    token: Optional[str],
    runtimes_url: Optional[str],
) -> Any:
    resolved_token = _resolve_token(token)
    if not resolved_token:
        raise RuntimeError(
            "No authentication token found. Pass --api-key, set DATALAYER_API_KEY, or run 'datalayer login'."
        )
    url = f"{_runtimes_base_url(runtimes_url)}/api/runtimes/v1{path}"
    headers = {"Authorization": f"Bearer {resolved_token}"}
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    return response.json()


@app.callback()
def pools_callback(ctx: typer.Context) -> None:
    """Runtime pool administration commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
def show_pools(
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
    """List runtime pools with details (admin-only)."""

    try:
        payload = _api_get(
            "/cluster/admin/pools",
            token=token,
            runtimes_url=runtimes_url,
        )
        pools = payload.get("pools", []) if isinstance(payload, dict) else []

        table = Table(title="Runtime Pools")
        table.add_column("Pool", style="bold")
        table.add_column("Desired", justify="right")
        table.add_column("Available", justify="right")
        table.add_column("Pending", justify="right")
        table.add_column("Assigned", justify="right")

        for pool in pools:
            table.add_row(
                str(pool.get("name") or "-"),
                str(pool.get("desired") if pool.get("desired") is not None else "-"),
                str(
                    pool.get("available") if pool.get("available") is not None else "-"
                ),
                str(pool.get("pending") if pool.get("pending") is not None else "-"),
                str(pool.get("assigned") if pool.get("assigned") is not None else "-"),
            )

        console.print(table)
    except Exception as exc:
        console.print(f"[red]Error listing pools: {exc}[/red]")
        raise typer.Exit(1)


@app.command(name="set-size")
def set_pool_size(
    size: int = typer.Argument(..., help="Desired pool size (>= 0)."),
    pool: str = typer.Option(..., "--pool", help="Runtime pool name."),
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
    """Update runtime pool size (admin-only)."""

    if size < 0:
        console.print("[red]Size must be >= 0.[/red]")
        raise typer.Exit(1)

    try:
        payload = _api_post(
            "/cluster/admin/pools/set-size",
            {"pool": pool, "size": int(size)},
            token=token,
            runtimes_url=runtimes_url,
        )
        updated_pool = str(payload.get("pool") or pool)
        updated_size = payload.get("size", size)
        console.print(
            f"[green]Updated pool '{updated_pool}' size to {updated_size}.[/green]"
        )
    except Exception as exc:
        console.print(f"[red]Error updating pool size: {exc}[/red]")
        raise typer.Exit(1)
