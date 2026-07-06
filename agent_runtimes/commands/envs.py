# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Environment commands for Datalayer CLI."""

from typing import Any, Dict, Optional

import typer
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console

from agent_runtimes.client import DatalayerClient
from agent_runtimes.displays.environments import display_environments

# Create a Typer app for environment commands
app = typer.Typer(
    name="envs", help="Environment management commands", invoke_without_command=True
)

console = Console()


def _make_client(
    token: Optional[str] = None,
    iam_url: Optional[str] = None,
    runtimes_url: Optional[str] = None,
) -> DatalayerClient:
    """Create a DatalayerClient with optional runtimes URL override."""
    urls = DatalayerURLs.from_environment(iam_url=iam_url, runtimes_url=runtimes_url)
    return DatalayerClient(urls=urls, api_key=token)


@app.callback()
def envs_callback(ctx: typer.Context) -> None:
    """Environment management commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
def list_environments(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List available environments."""
    try:
        client = _make_client(
            token=token,
            iam_url=iam_url,
            runtimes_url=runtimes_url,
        )
        environments = client.list_environments()

        # Convert to dict format for display_environments
        env_dicts: list[Dict[str, Any]] = []
        for env in environments:
            env_dict: Dict[str, Any] = {
                "name": env.name,
                "title": env.title,
                "burning_rate": env.burning_rate,
                "language": env.language,
                "owner": env.owner,
                "visibility": env.visibility,
            }
            for key, value in (env.metadata or {}).items():
                if key not in env_dict:
                    env_dict[key] = value
            env_dicts.append(env_dict)

        display_environments(env_dicts)

        if len(env_dicts) > 0:
            console.print("\n[dim]Create an Agent with e.g.[/dim]")
            for env_dict in env_dicts:
                console.print(
                    f"[dim]datalayer agents create --given-name my-agent {env_dict['name']}[/dim]"
                )
            console.print()

    except Exception as e:
        console.print(f"[red]Error listing environments: {e}[/red]")
        raise typer.Exit(1)


# Root level commands for convenience
def envs_list(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List available environments (root command)."""
    list_environments(token=token, iam_url=iam_url, runtimes_url=runtimes_url)


def envs_ls(
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key (Bearer token for API requests).",
    ),
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer IAM server URL",
    ),
    runtimes_url: Optional[str] = typer.Option(
        None,
        "--runtimes-url",
        help="Datalayer Runtimes server URL",
    ),
) -> None:
    """List available environments (root command alias)."""
    list_environments(token=token, iam_url=iam_url, runtimes_url=runtimes_url)
