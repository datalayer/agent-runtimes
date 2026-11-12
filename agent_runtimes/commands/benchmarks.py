# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Benchmarks commands for Datalayer CLI."""

import json
import sys
from pathlib import Path
from typing import Optional

import typer
from datalayer_core.base.serverapplication import launch_new_instance
from datalayer_core.utils.urls import DatalayerURLs
from rich.console import Console

from agent_runtimes.commands import evals as evals_commands

# Create a Typer app for benchmarks commands
app = typer.Typer(
    name="benchmarks",
    help="Manage benchmarks.",
    invoke_without_command=True,
    pretty_exceptions_show_locals=False,
)

console = Console()


@app.callback()
def benchmarks_callback(ctx: typer.Context) -> None:
    """Manage benchmark commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="import")
def benchmarks_import(
    framework: str = typer.Argument(
        ..., help="The framework, as `evals adapters ls` names it."
    ),
    source: Optional[Path] = typer.Argument(
        None, exists=True, help="An archive, or a directory to pack."
    ),
    git: str = typer.Option("", "--git", help="A Harbor repository, fetched here."),
    commit: str = typer.Option("", "--commit", help="The full commit of `--git`."),
    subfolder: str = typer.Option("", "--path", help="The folder of `--git` to read."),
    registry: str = typer.Option(
        "", "--registry", help="A Harbor registry reference, pinned, fetched here."
    ),
    task_arg: list[str] = typer.Option(
        [], "--task-arg", help="name=json, as the task takes it."
    ),
    entry_point: list[str] = typer.Option(
        [], "--entry-point", help="A task; every one when none is named."
    ),
    model: list[str] = typer.Option(
        [],
        "--model",
        help="A catalogue model of AI Inference (bedrock:..., alibaba:...): one experiment each.",
    ),
    scorer: Optional[str] = typer.Option(
        None, "--scorer", help="The scorer that is the headline."
    ),
    threshold: Optional[float] = typer.Option(
        None, "--threshold", help="The score a task must reach to pass."
    ),
    limit: Optional[int] = typer.Option(None, "--limit", min=1, help="How many tasks."),
    name: Optional[str] = typer.Option(None, "--name", help="The benchmark's name."),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """Inspect a source in a sandbox and import it as a benchmark."""
    client = evals_commands._make_client(token=token)
    data, filename = evals_commands.source_bytes(
        source, git=git, commit=commit, subfolder=subfolder, registry=registry
    )
    record = evals_commands.inspected_source(
        client, framework, data, filename, task_arg
    )
    if record.get("status") != "ready":
        console.print(f"[red]The source could not be read:[/red] {record.get('error')}")
        raise typer.Exit(1)
    payload = client.evals_import_external(
        inspection_id=str(record.get("id")),
        selection=evals_commands.import_selection(
            entry_point, model, scorer, threshold, limit, name
        ),
    )
    if raw:
        console.print_json(json.dumps(payload))
        return
    evalset = payload.get("evalset") or {}
    console.print(
        f"Benchmark {evalset.get('id')} {evalset.get('name')}: "
        f"{len(evalset.get('cases') or [])} tasks, source sha256:{record.get('digest')}"
    )


@app.command(name="publish")
def benchmarks_publish(
    evalset_id: str = typer.Argument(..., help="The benchmark."),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    """Publish a benchmark, and its source read-only: anybody can then read them."""
    evals_commands._make_client(token=token).evals_set_public(evalset_id, public=True)
    console.print(f"Benchmark {evalset_id} is public.")


@app.command(name="unpublish")
def benchmarks_unpublish(
    evalset_id: str = typer.Argument(..., help="The benchmark."),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    """Take a benchmark back, and its source with it."""
    evals_commands._make_client(token=token).evals_set_public(evalset_id, public=False)
    console.print(f"Benchmark {evalset_id} is private.")


@app.command(name="download")
def benchmarks_download(
    evalset_id: str = typer.Argument(..., help="The benchmark."),
    output: Optional[Path] = typer.Option(
        None, "--output", "-o", help="Where to write it: its own name here by default."
    ),
    version: Optional[int] = typer.Option(
        None, "--version", min=1, help="A version of the benchmark."
    ),
    public: bool = typer.Option(
        False,
        "--public",
        help="As anybody reading its Library page: no credential is sent.",
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
) -> None:
    """Download an imported benchmark's original source, checked against its digest."""
    client = evals_commands._make_client(token=token)
    data, filename, digest = client.evals_download_source(
        evalset_id, version=version, public=public
    )
    target = output or Path(Path(filename).name)
    target.write_bytes(data)
    console.print(f"{target}: {len(data)} bytes, sha256:{digest}")


@app.command(name="web")
def benchmarks_web(
    iam_url: Optional[str] = typer.Option(
        None,
        "--iam-url",
        help="Datalayer URL",
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
        urls = DatalayerURLs.from_environment(iam_url=iam_url)

        # Prepare arguments for Jupyter server
        sys.argv = [
            "",
            f"--ServerApp.disable_check_xsrf={disable_xsrf}",
            "--DatalayerExtensionApp.benchmarks=True",
            f"--DatalayerExtensionApp.iam_url={urls.iam_url}",
        ]

        console.print("[green]Starting benchmarks web application...[/green]")
        console.print(f"Datalayer IAM URL: {urls.iam_url}")
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
