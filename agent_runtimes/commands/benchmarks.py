# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Benchmarks commands for Datalayer CLI."""

import sys
from typing import Optional

import typer
from rich.console import Console

from datalayer_core.base.serverapplication import launch_new_instance
from datalayer_core.utils.urls import DatalayerURLs

# Create a Typer app for benchmarks commands
app = typer.Typer(
    name="benchmarks",
    help="Benchmarks management commands",
    invoke_without_command=True,
)

console = Console()


@app.callback()
def benchmarks_callback(ctx: typer.Context) -> None:
    """Manage benchmark commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="web")
def benchmarks_web(
    run_url: Optional[str] = typer.Option(
        None,
        "--run-url",
        help="Datalayer Run URL",
    ),
    disable_xsrf: bool = typer.Option(
        True,
        "--disable-xsrf/--enable-xsrf",
        help="Disable XSRF protection",
    ),
) -> None:
    """Launch the benchmarks web application."""
    try:
        # Get URLs configuration
        urls = DatalayerURLs.from_environment(run_url=run_url)

        # Prepare arguments for Jupyter server
        sys.argv = [
            "",
            f"--ServerApp.disable_check_xsrf={disable_xsrf}",
            "--DatalayerExtensionApp.benchmarks=True",
            f"--DatalayerExtensionApp.run_url={urls.run_url}",
        ]

        console.print("[green]Starting benchmarks web application...[/green]")
        console.print(f"Run URL: {urls.run_url}")
        console.print("[yellow]Press Ctrl+C to stop the server[/yellow]")

        # Launch the Jupyter server
        launch_new_instance()

    except KeyboardInterrupt:
        console.print("\n[yellow]Benchmarks web application stopped.[/yellow]")
    except Exception as e:
        console.print(f"[red]Error starting benchmarks web application: {e}[/red]")
        raise typer.Exit(1)


# Convenience aliases
benchmarks_web_alias = benchmarks_web


if __name__ == "__main__":
    app()
