# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Code sandbox commands: the providers, and the sandboxes themselves.

A code sandbox is a place code runs, and there is more than one kind of place:
the Datalayer platform, a Jupyter Server, Kaggle, Modal, a container of this
machine. Each is a PROVIDER; each provider ships the environments it offers —
Datalayer ships `ai-agents-env`, Kaggle ships a CPU and a GPU session — and each
needs its own credentials before it can be used at all.

Two things follow, and the commands here are those two:

- `providers` and `environments` answer what can be used from this machine and
  what it offers. A provider whose credentials are absent is not offered, since
  every call to it would fail; `--all` says what each one is missing.
- `ls`, `get`, `create`, `update` and `rm` act on the sandboxes themselves,
  through the manager each provider has in `code_sandboxes.manage` — the same
  operations whatever the provider, which is the point of naming them alike.

Nothing here reads the value of a secret: availability is what is present, not
what it says.
"""

from typing import Any, Optional

import typer
from rich.console import Console
from rich.table import Table

app = typer.Typer(
    name="sandboxes",
    help="Code sandbox providers, environments and sandboxes.",
    invoke_without_command=True,
)

console = Console()


@app.callback()
def sandboxes_callback(ctx: typer.Context) -> None:
    """Code sandbox commands."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


def _providers() -> Any:
    """The provider registry, or a clear failure when it is not installed."""
    try:
        from code_sandboxes.providers import PROVIDERS

        return PROVIDERS
    except ImportError as error:  # pragma: no cover - depends on the install
        console.print(
            "[red]The code sandboxes are not available: "
            f"{error}[/red]\nInstall them with: pip install code-sandboxes"
        )
        raise typer.Exit(code=1) from error


def _manager(variant: str) -> Any:
    """The manager of a provider, or a clear failure when there is none."""
    from code_sandboxes.manage import (
        SandboxManagementError,
        get_manager,
        manageable_variants,
    )

    try:
        return get_manager(variant)
    except ValueError as error:
        console.print(
            f"[red]{error}[/red]\nManageable providers: "
            f"{', '.join(manageable_variants())}"
        )
        raise typer.Exit(code=1) from error
    except SandboxManagementError as error:
        console.print(f"[red]{error}[/red]")
        raise typer.Exit(code=1) from error


def _report(action: str, error: Exception) -> None:
    """Say what failed, and stop."""
    console.print(f"[red]Failed to {action}: {error}[/red]")
    raise typer.Exit(code=1)


def _sandbox_table(title: str) -> Table:
    """The columns every sandbox is shown with."""
    table = Table(title=title)
    table.add_column("ID", style="bold")
    table.add_column("Provider")
    table.add_column("Name")
    table.add_column("Status")
    return table


def _add(table: Table, provider: str, info: Any) -> None:
    """One sandbox, as a row."""
    status = getattr(info.status, "value", info.status)
    table.add_row(info.id, provider, info.name or "", str(status))


providers_app = typer.Typer(
    name="providers",
    help="The places sandboxes can run, and what each of them requires.",
    invoke_without_command=True,
)
app.add_typer(providers_app)


@providers_app.callback()
def providers_callback(ctx: typer.Context) -> None:
    """List the providers when no subcommand is given."""
    if ctx.invoked_subcommand is None:
        # `providers` on its own means `providers list`: the bare word asks
        # the same question, and answering with a help page would be a step
        # for nothing.
        list_providers(all_providers=False)


def _requirement_lines(provider: Any) -> str:
    """Every way of satisfying a provider, and whether it is satisfied.

    All of them are shown, not just the missing ones: knowing that the token
    is set but the file is not is what tells someone which of the two the
    sandbox will actually use.
    """
    if not provider.needs_credentials or not provider.requirements:
        return "[green]nothing required[/green]"
    lines = []
    for requirement in provider.requirements:
        met = requirement.is_met()
        mark = "[green]✓[/green]" if met else "[red]✗[/red]"
        if requirement.env_vars:
            what = " + ".join(requirement.env_vars)
        elif requirement.file:
            what = requirement.file
        else:
            what = requirement.hint
        lines.append(f"{mark} {what}")
    return "\n".join(lines)


@providers_app.command(name="list")
def list_providers(
    all_providers: bool = typer.Option(
        False,
        "--all",
        "-a",
        help="Include the providers this machine has no credentials for.",
    ),
) -> None:
    """List the sandbox providers, and whether they can be used here."""
    every = _providers()
    shown = [p for p in every if all_providers or p.is_available()]
    if not shown:
        console.print(
            "No sandbox provider is available. Run with --all to see what "
            "each of them requires."
        )
        return

    table = Table(title="Code Sandbox Providers")
    table.add_column("Provider", style="bold")
    table.add_column("Usable")
    table.add_column("Credentials")
    table.add_column("Environments")
    table.add_column("Description")
    for provider in shown:
        usable = (
            "[green]yes[/green]" if provider.is_available() else "[yellow]no[/yellow]"
        )
        # Only a provider that can be asked is asked: reading the environments
        # of one with no credentials is a call that fails.
        environments = (
            ", ".join(e.name for e in provider.environments())
            if provider.is_available()
            else ""
        )
        # Escaped: square brackets are markup to rich, and an extra written
        # plainly came out with the extra silently gone.
        extra = (
            f" (pip install code-sandboxes\\[{provider.extra}])"
            if provider.extra
            else ""
        )
        table.add_row(
            provider.name,
            usable,
            _requirement_lines(provider),
            environments,
            f"{provider.description}{extra}",
        )
    console.print(table)
    if not all_providers and len(shown) < len(every):
        hidden = len(every) - len(shown)
        console.print(
            f"{hidden} more provider(s) need credentials — "
            "`agent-runtimes sandboxes providers list --all` says which."
        )


@app.command(name="environments")
def list_environments(
    provider: Optional[str] = typer.Argument(
        None,
        help="Only the environments of that provider; all of them by default.",
    ),
    all_providers: bool = typer.Option(
        False,
        "--all",
        "-a",
        help="Include providers this machine has no credentials for.",
    ),
) -> None:
    """List the environments the providers ship."""
    from code_sandboxes.providers import get_provider

    if provider:
        found = get_provider(provider)
        if found is None:
            console.print(f"[red]No such sandbox provider: {provider}[/red]")
            raise typer.Exit(code=1)
        selection = [found]
    else:
        selection = [p for p in _providers() if all_providers or p.is_available()]

    table = Table(title="Code Sandbox Environments")
    table.add_column("Provider", style="bold")
    table.add_column("Environment")
    table.add_column("Title")
    table.add_column("Language")
    rows = 0
    for entry in selection:
        for environment in entry.environments():
            table.add_row(
                entry.name, environment.name, environment.title, environment.language
            )
            rows += 1
    if not rows:
        console.print(
            "No environment to show. A provider lists its environments only "
            "once its credentials are in place — `agent-runtimes sandboxes "
            "providers --all` says what each one needs."
        )
        return
    console.print(table)


@app.command(name="ls")
def list_sandboxes(
    provider: Optional[str] = typer.Argument(
        None,
        help="Only the sandboxes of that provider; every available one by default.",
    ),
) -> None:
    """List the running sandboxes."""
    from code_sandboxes.manage import manageable_variants

    if provider:
        variants = [provider]
    else:
        # Only what can be asked: a provider with no credentials would fail on
        # the first call, and it has nothing running here anyway.
        available = {p.name for p in _providers() if p.is_available()}
        variants = [v for v in manageable_variants() if v in available]

    table = _sandbox_table("Code Sandboxes")
    rows = 0
    for variant in variants:
        try:
            for info in _manager(variant).list():
                _add(table, variant, info)
                rows += 1
        except typer.Exit:
            raise
        except Exception as error:  # noqa: BLE001
            # One provider that cannot answer must not hide the others.
            console.print(f"[yellow]{variant}: {error}[/yellow]")
    if not rows:
        console.print("No sandbox is running.")
        return
    console.print(table)


@app.command(name="get")
def get_sandbox(
    provider: str = typer.Argument(..., help="Provider the sandbox belongs to."),
    sandbox_id: str = typer.Argument(..., help="Identifier of the sandbox."),
) -> None:
    """Show one sandbox."""
    try:
        info = _manager(provider).get(sandbox_id)
    except typer.Exit:
        raise
    except Exception as error:  # noqa: BLE001
        _report(f"read the sandbox {sandbox_id}", error)
        return
    if info is None:
        console.print(f"[yellow]No such sandbox: {sandbox_id}[/yellow]")
        raise typer.Exit(code=1)
    table = _sandbox_table("Code Sandbox")
    _add(table, provider, info)
    console.print(table)
    if info.metadata:
        console.print(info.metadata)


@app.command(name="create")
def create_sandbox(
    provider: str = typer.Argument(..., help="Provider to create the sandbox in."),
    environment: Optional[str] = typer.Option(
        None,
        "--environment",
        "-e",
        help="Environment the provider ships, e.g. `kaggle-gpu`.",
    ),
    name: Optional[str] = typer.Option(
        None, "--name", "-n", help="Name to give the sandbox."
    ),
) -> None:
    """Create a sandbox."""
    options: dict[str, Any] = {}
    if environment:
        options["environment_name"] = environment
    if name:
        options["name"] = name
    try:
        info = _manager(provider).create(**options)
    except typer.Exit:
        raise
    except Exception as error:  # noqa: BLE001
        _report(f"create a sandbox in {provider}", error)
        return
    table = _sandbox_table("Code Sandbox Created")
    _add(table, provider, info)
    console.print(table)


@app.command(name="update")
def update_sandbox(
    provider: str = typer.Argument(..., help="Provider the sandbox belongs to."),
    sandbox_id: str = typer.Argument(..., help="Identifier of the sandbox."),
    name: Optional[str] = typer.Option(
        None, "--name", "-n", help="New name for the sandbox."
    ),
) -> None:
    """Change a sandbox."""
    if name is None:
        console.print("[yellow]Nothing to change. Pass --name.[/yellow]")
        raise typer.Exit(code=1)
    try:
        info = _manager(provider).update(sandbox_id, name=name)
    except typer.Exit:
        raise
    except Exception as error:  # noqa: BLE001
        _report(f"update the sandbox {sandbox_id}", error)
        return
    table = _sandbox_table("Code Sandbox Updated")
    _add(table, provider, info)
    console.print(table)


@app.command(name="rm")
def delete_sandbox(
    provider: str = typer.Argument(..., help="Provider the sandbox belongs to."),
    sandbox_id: str = typer.Argument(..., help="Identifier of the sandbox."),
) -> None:
    """Delete a sandbox."""
    try:
        deleted = _manager(provider).delete(sandbox_id)
    except typer.Exit:
        raise
    except Exception as error:  # noqa: BLE001
        _report(f"delete the sandbox {sandbox_id}", error)
        return
    if deleted:
        console.print(f"[green]Deleted the sandbox {sandbox_id}.[/green]")
        return
    console.print(f"[yellow]No sandbox was deleted: {sandbox_id}[/yellow]")
    raise typer.Exit(code=1)
