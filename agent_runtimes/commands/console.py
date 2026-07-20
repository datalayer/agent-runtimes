# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Console commands for Datalayer CLI."""

import sys
from typing import List, Optional

import typer
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console

from agent_runtimes.console.consoleapp import RuntimesConsoleApp

# Create a Typer app for console commands
app = typer.Typer(
    name="console", help="Agent console commands", invoke_without_command=True
)

console = Console()


@app.callback()
def console_callback(ctx: typer.Context) -> None:
    """Agent console commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="connect")
def console_connect(
    runtime_name: Optional[str] = typer.Option(
        None,
        "--agent",
        help="The name of the Agent to connect to",
    ),
    datalayer_url: Optional[str] = typer.Option(
        None,
        "--datalayer-url",
        help="Datalayer URL",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key",
    ),
    external_token: Optional[str] = typer.Option(
        None,
        "--external-token",
        help="External authentication token",
    ),
    no_browser: bool = typer.Option(
        False,
        "--no-browser",
        help="Will prompt for user and password on the CLI",
    ),
    kernel_name: Optional[str] = typer.Option(
        None,
        "--kernel-name",
        help="The name of the kernel to connect to",
    ),
    kernel_path: Optional[str] = typer.Option(
        None,
        "--kernel-path",
        help="The path where the kernel should be started",
    ),
    existing: Optional[str] = typer.Option(
        None,
        "--existing",
        help="Connect to an existing kernel instead of starting a new one",
    ),
    extra_args: Optional[List[str]] = typer.Argument(
        None, help="Additional arguments to pass to the console application"
    ),
) -> None:
    """Connect to a Datalayer agent console."""
    try:
        # Get URLs configuration
        urls = DatalayerURLs.from_environment(datalayer_url=datalayer_url)

        console.print("[green]Starting Datalayer agent console...[/green]")
        console.print(f"Datalayer URL: {urls.datalayer_url}")
        if runtime_name:
            console.print(f"Agent: {runtime_name}")
        console.print("[yellow]Press Ctrl+D or Ctrl+C to exit the console[/yellow]")

        # Prepare sys.argv for the RuntimesConsoleApp
        args = []

        if runtime_name:
            args.extend(["--agent", runtime_name])
        if urls.datalayer_url:
            args.extend(["--datalayer-url", urls.datalayer_url])
        if token:
            args.extend(["--api-key", token])
        if external_token:
            args.extend(["--external-token", external_token])
        if no_browser:
            args.append("--no-browser")
        if kernel_name:
            args.extend(["--kernel-name", kernel_name])
        if kernel_path:
            args.extend(["--kernel-path", kernel_path])
        if existing:
            args.extend(["--existing", existing])

        # Add any extra arguments
        if extra_args:
            args.extend(extra_args)

        # Modify sys.argv to pass arguments to RuntimesConsoleApp
        original_argv = sys.argv.copy()
        sys.argv = ["datalayer-console"] + args

        try:
            # Launch the RuntimesConsoleApp
            app_instance = RuntimesConsoleApp()
            app_instance.initialize()
            app_instance.start()
        finally:
            # Restore original sys.argv
            sys.argv = original_argv

    except KeyboardInterrupt:
        console.print("\n[yellow]Console session ended.[/yellow]")
    except Exception as e:
        console.print(f"[red]Error connecting to agent console: {e}[/red]")
        raise typer.Exit(1)


# For backward compatibility, make connect the default command
@app.callback(invoke_without_command=True)
def console_callback_default(
    ctx: typer.Context,
    runtime_name: Optional[str] = typer.Option(
        None,
        "--agent",
        help="The name of the Agent to connect to",
    ),
    datalayer_url: Optional[str] = typer.Option(
        None,
        "--datalayer-url",
        help="Datalayer URL",
    ),
    token: Optional[str] = typer.Option(
        None,
        "--api-key",
        help="API key",
    ),
    external_token: Optional[str] = typer.Option(
        None,
        "--external-token",
        help="External authentication token",
    ),
    no_browser: bool = typer.Option(
        False,
        "--no-browser",
        help="Will prompt for user and password on the CLI",
    ),
    kernel_name: Optional[str] = typer.Option(
        None,
        "--kernel-name",
        help="The name of the kernel to connect to",
    ),
    kernel_path: Optional[str] = typer.Option(
        None,
        "--kernel-path",
        help="The path where the kernel should be started",
    ),
    existing: Optional[str] = typer.Option(
        None,
        "--existing",
        help="Connect to an existing kernel instead of starting a new one",
    ),
) -> None:
    """Connect to a Datalayer agent console (default behavior)."""
    if ctx.invoked_subcommand is None:
        # Get any remaining arguments that weren't parsed
        extra_args: list[str] = []
        if hasattr(ctx, "params") and ctx.params:
            # Add any extra arguments from context
            pass

        # Call console_connect with the parameters
        console_connect(
            runtime_name=runtime_name,
            datalayer_url=datalayer_url,
            token=token,
            external_token=external_token,
            no_browser=no_browser,
            kernel_name=kernel_name,
            kernel_path=kernel_path,
            existing=existing,
            extra_args=extra_args,
        )


if __name__ == "__main__":
    app()
