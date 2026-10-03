# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Applications: `loop apps …`.

An application is kept as an Appspec, a YAML file reviewed like code
(`agentspecs.apps`). `loop apps validate` runs the checks that take no model
call — the instant checks of the Studio — in a terminal and in CI:

- **the spec**: what the schema refuses, and every reference that does not
  resolve, said in sentences;
- **safety**: what the application can do without a rule of its own saying
  so, what it reaches in whose name, and whether it keeps a record;
- **setup**: what it names that is not enabled today.

Its verdict is said in the Studio's words. *Not ready* when the spec is
wrong; *Needs attention* when a safety check has something to say; otherwise
the instant checks pass, which is not yet *Ready*: that takes its tests.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List

import typer
from rich.console import Console

app = typer.Typer(
    name="apps",
    help="Applications: validate an Appspec.",
    invoke_without_command=True,
)

# Wide and unwrapped: a verdict and a path are read, and grepped, on one line.
console = Console(soft_wrap=True)

#: What each class of action is called, for a person.
_ACTIONS = {
    "write": "create or change things",
    "send": "send",
    "buy": "buy",
    "delete": "delete",
    "publish": "share or publish",
}

NOT_READY = "Not ready"
NEEDS_ATTENTION = "Needs attention"
PASSES = "Passes the instant checks"


@dataclass
class Report:
    """What `validate` found, for one file."""

    path: str
    verdict: str
    problems: List[str] = field(default_factory=list)
    attention: List[str] = field(default_factory=list)
    setup: List[str] = field(default_factory=list)


def _require_agentspecs() -> Any:
    try:
        import agentspecs
        from agentspecs import apps as module
    except ImportError as error:  # pragma: no cover - agentspecs is a dependency
        raise typer.BadParameter(
            "Validating an application needs agentspecs 0.0.16 or later."
        ) from error
    version = tuple(int(part) for part in agentspecs.__version__.split(".")[:3])
    if version < (0, 0, 16):
        raise typer.BadParameter(
            f"Validating an application needs agentspecs 0.0.16 or later; "
            f"{agentspecs.__version__} is installed."
        )
    return module


def safety_notes(module: Any, application: Any) -> List[str]:
    """What the application can do with no rule of its own, and what it keeps.

    Not mistakes: things its builder should have decided rather than left to
    the defaults — anything that acts asks first, but the builder may not
    know that it can.
    """
    notes: List[str] = []
    ruled = {
        target
        for rule in application.rules
        for target in (
            [rule.applies_to] if isinstance(rule.applies_to, str) else rule.applies_to
        )
    }
    from agentspecs.actions import classes_of

    unruled: Dict[str, List[str]] = {}
    for tool in module.tool_behaviours(application):
        for action in classes_of(tool):
            if (
                action.value in _ACTIONS
                and action.value not in ruled
                and tool not in ruled
            ):
                unruled.setdefault(action.value, []).append(tool)
    for action, tools in sorted(unruled.items()):
        names = ", ".join(sorted(tools)[:3]) + (
            f" and {len(tools) - 3} more" if len(tools) > 3 else ""
        )
        notes.append(
            f"It can {_ACTIONS[action]} ({names}), and no rule of its own says what then: "
            "it will ask first. Write the rule."
        )
    for connection in application.connections:
        if connection.acts_as.value == "owner" and connection.access.value == "write":
            notes.append(
                f"It writes through {connection.server} with its builder's account, "
                "for everybody who uses it. Is that meant?"
            )
    if not application.record.include:
        notes.append("It keeps no record of what it did.")
    return notes


def validate_file(path: Path) -> Report:
    """The instant checks of one Appspec file."""
    import yaml

    module = _require_agentspecs()
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except (OSError, yaml.YAMLError) as error:
        return Report(
            str(path), NOT_READY, problems=[f"The file cannot be read: {error}"]
        )
    if not isinstance(data, dict):
        return Report(
            str(path), NOT_READY, problems=["The file is not an application."]
        )
    try:
        application = module.parse_app(data)
    except module.AppError as error:
        return Report(str(path), NOT_READY, problems=[str(error)])
    problems = module.app_problems(application)
    if problems:
        return Report(
            str(path), NOT_READY, problems=problems, setup=module.app_setup(application)
        )
    attention = safety_notes(module, application)
    return Report(
        str(path),
        NEEDS_ATTENTION if attention else PASSES,
        attention=attention,
        setup=module.app_setup(application),
    )


@app.callback()
def apps_callback(ctx: typer.Context) -> None:
    """Applications."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="validate")
def apps_validate(
    paths: List[Path] = typer.Argument(..., help="Appspec files (YAML)."),
    strict: bool = typer.Option(
        False,
        "--strict",
        help="Fail on what needs attention, not only on what is wrong.",
    ),
    as_json: bool = typer.Option(False, "--json", help="Print the reports as JSON."),
) -> None:
    """Run the instant checks of one or more applications.

    Exit 1 when one is not ready; with --strict, exit 2 when one needs attention.
    """
    reports = [validate_file(path) for path in paths]
    if as_json:
        typer.echo(json.dumps([asdict(report) for report in reports], indent=2))
    else:
        for report in reports:
            colour = {NOT_READY: "red", NEEDS_ATTENTION: "yellow"}.get(
                report.verdict, "green"
            )
            console.print(
                f"[bold]{report.path}[/bold]  [{colour}]{report.verdict}[/{colour}]"
            )
            for line in report.problems:
                console.print(f"  ✗ {line}", highlight=False)
            for line in report.attention:
                console.print(f"  ! {line}", highlight=False)
            for line in report.setup:
                console.print(f"  · To set up: {line}", highlight=False)
            if report.verdict == PASSES:
                console.print(
                    "  Its tests decide whether it is ready.", highlight=False
                )
    if any(report.verdict == NOT_READY for report in reports):
        raise typer.Exit(1)
    if strict and any(report.verdict == NEEDS_ATTENTION for report in reports):
        raise typer.Exit(2)


#: The agentspec a local server is started with before an application is
#: configured on it; the application's own agent replaces it.
BOOTSTRAP_AGENT_SPEC_ID = "example-simple"


def configure_on(base_url: str, document: Dict[str, Any]) -> Dict[str, Any]:
    """Configure a runtime with an application; its refusal said in sentences."""
    import httpx

    response = httpx.post(
        f"{base_url}/api/v1/apps/configure", json={"app": document}, timeout=120.0
    )
    if response.status_code == 422:
        detail = response.json().get("detail") or {}
        problems = detail.get("problems") if isinstance(detail, dict) else [str(detail)]
        raise typer.BadParameter(
            " ".join(problems or ["The runtime refused the application."])
        )
    if response.status_code >= 300:
        raise RuntimeError(
            f"The runtime did not take the application ({response.status_code}): {response.text[:300]}"
        )
    return response.json()


@app.command(name="run")
def apps_run(
    path: Path = typer.Argument(
        ..., exists=True, dir_okay=False, help="The Appspec, a YAML or JSON file."
    ),
    local: bool = typer.Option(
        False, "--local", help="Run it on this machine, without asking where."
    ),
    cloud: bool = typer.Option(
        False, "--cloud", help="Run it on Datalayer, without asking where."
    ),
    environment: str = typer.Option(
        None, "--environment", "-e", help="The Datalayer environment (with --cloud)."
    ),
    minutes: int = typer.Option(
        None,
        "--minutes",
        "-m",
        help="How long to reserve the cloud runtime (with --cloud).",
    ),
    keep: bool = typer.Option(
        False, "--keep", help="Leave the cloud runtime running when the session ends."
    ),
    ask: str = typer.Option(
        None, "--ask", help="Ask one question, print the answer and stop."
    ),
) -> None:
    """Run an application in the terminal — here, or on Datalayer (LOOP L-05).

    The runtime is configured with the application, so its rules decide every
    tool call; its starters are the terminal's suggestions.
    """
    import asyncio

    import yaml

    from agent_runtimes.loop.apps.loading import AppNotRunnable, load_app
    from agent_runtimes.loop.launch import (
        CLOUD,
        CLOUD_AGENT_NAME,
        NotSignedIn,
        choose_where,
        finish_cloud,
        launch_cloud,
        speak_ag_ui,
    )

    document = yaml.safe_load(path.read_text())
    if not isinstance(document, dict):
        raise typer.BadParameter(f"{path} does not hold an application.")
    try:
        application = load_app(document)
    except AppNotRunnable as refused:
        for problem in refused.problems:
            console.print(f"[red]✗[/red] {problem}")
        raise typer.Exit(1)
    if application.team:
        console.print(
            "[red]✗[/red] An application run by a team cannot run in the terminal yet."
        )
        raise typer.Exit(1)

    import logging

    # The terminal is the conversation: no request log over it.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    where = choose_where(local=local, cloud=cloud)
    cloud_launch = None
    process = None
    if where == CLOUD:
        try:
            cloud_launch = launch_cloud(
                BOOTSTRAP_AGENT_SPEC_ID,
                label=f"{application.emoji} {application.name}",
                environment=environment,
                minutes=minutes,
                status=lambda message: console.print(f"[cyan]{message}[/cyan]"),
            )
        except NotSignedIn:
            console.print(
                "[yellow]Not signed in to Datalayer: run `datalayer login`, or set DATALAYER_API_KEY.[/yellow]"
            )
            raise typer.Exit(1)
        base_url = cloud_launch.server_url
    else:
        from agent_runtimes.chat.cli import (
            _start_agent_runtime_server,
            _wait_for_server,
        )

        process, port = _start_agent_runtime_server(BOOTSTRAP_AGENT_SPEC_ID)
        if not _wait_for_server("127.0.0.1", port, timeout=60.0):
            process.terminate()
            console.print("[red]✗[/red] The local server did not start.")
            raise typer.Exit(1)
        base_url = f"http://127.0.0.1:{port}"

    try:
        configured = configure_on(base_url, document)
        if not speak_ag_ui(base_url):
            raise RuntimeError("The application's agent did not come up.")
        for note in configured.get("setup") or []:
            console.print(f"[yellow]•[/yellow] {note}")
        agent_url = f"{base_url}/api/v1/ag-ui/{CLOUD_AGENT_NAME}/"
        starters = [starter.message for starter in application.interface.starters]
        where_said = (
            f"on Datalayer ({cloud_launch.runtime_name})"
            if cloud_launch
            else "on this machine"
        )
        startup = f"{application.emoji}  {application.name} is running {where_said}"
        if ask:
            from agent_runtimes.chat.cli import _run_single_query_ag_ui

            console.print(asyncio.run(_run_single_query_ag_ui(agent_url, ask)))
        else:
            from agent_runtimes.chat.tux import run_tux

            asyncio.run(
                run_tux(
                    agent_url,
                    base_url,
                    agent_id=CLOUD_AGENT_NAME,
                    extra_suggestions=starters,
                    startup_message=startup,
                )
            )
    finally:
        if cloud_launch is not None:
            finish_cloud(cloud_launch, keep=keep, can_ask=None if not ask else False)
        elif process is not None:
            process.terminate()
            process.join(timeout=5.0)


@app.command(name="deploy")
def apps_deploy(
    app_uid: str = typer.Argument(
        ..., help="The application's id, as the Studio shows it."
    ),
    version: int = typer.Option(
        None,
        "--version",
        "-v",
        help="The version to deploy; the latest saved by default.",
    ),
    slug: str = typer.Option(
        None, "--slug", help="Its address, /apps/<slug>, on a first deploy."
    ),
    site: str = typer.Option(
        None,
        "--site",
        envvar="DATALAYER_SITE_URL",
        help="The site its address is on.",
    ),
) -> None:
    """Deploy a version at the application's hosted address (LOOP S-06).

    The deployment the Studio's Ship tab shows: deploying another version
    moves it, and deploying a paused one resumes it. Prints the address and
    the snippet that embeds it.
    """
    import logging

    import httpx

    from agent_runtimes.loop.apps.deployments import (
        Deployments,
        DeployRefused,
        deploy,
        deployment_path,
    )
    from agent_runtimes.loop.launch import NotSignedIn, make_client

    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        client, token = make_client()
    except NotSignedIn as refused:
        console.print(f"[red]✗[/red] {refused} Sign in with `datalayer login`.")
        raise typer.Exit(1)
    try:
        deployment, done = deploy(
            Deployments(client.urls.spacer_url, token), app_uid, version, slug
        )
    except (DeployRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    origin = (site or "https://datalayer.ai").rstrip("/")
    said = {
        "created": "Deployed",
        "moved": "Moved to",
        "resumed": "Resumed at",
        "unchanged": "Already at",
    }[done]
    console.print(f"[green]✓[/green] {said} version {deployment.version}.")
    console.print(
        f"  {origin}{deployment_path(deployment.slug)}  (private to you until it is shared)"
    )
    console.print(
        "  To embed it (a private application also needs an embed token, from the Ship tab):"
    )
    console.print(
        f'  <script src="{origin}/embed/datalayer-app.js" async></script>\n'
        f'  <datalayer-app app="{app_uid}" origin="{origin}"></datalayer-app>',
        markup=False,
        highlight=False,
    )


def _store() -> Any:
    """The caller's applications on the Spacer, or a said exit."""
    import logging

    from agent_runtimes.loop.apps.store import AppStore
    from agent_runtimes.loop.launch import NotSignedIn, make_client

    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        client, token = make_client()
    except NotSignedIn as refused:
        console.print(f"[red]✗[/red] {refused} Sign in with `datalayer login`.")
        raise typer.Exit(1)
    return AppStore(client.urls.spacer_url, token)


@app.command(name="pull")
def apps_pull(
    app_uid: str = typer.Argument(
        ..., help="The application's id, as the Studio shows it."
    ),
    path: Path = typer.Option(
        None, "--out", "-o", help="Where to write it; app.yaml by default."
    ),
    force: bool = typer.Option(
        False, "--force", help="Overwrite a file that is there."
    ),
) -> None:
    """Write an application's Appspec to a file (LOOP S-04).

    The text the Studio keeps, comments included: a repository holds the same
    file, and `push` saves it back.
    """
    import httpx

    from agent_runtimes.loop.apps.deployments import DeployRefused
    from agent_runtimes.loop.apps.store import pull

    out = path or Path("app.yaml")
    if out.exists() and not force:
        console.print(f"[red]✗[/red] {out} is there already; --force overwrites it.")
        raise typer.Exit(1)
    try:
        text, version = pull(_store(), app_uid)
    except (DeployRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    out.write_text(text)
    console.print(f"[green]✓[/green] Version {version} written to {out}.")


@app.command(name="push")
def apps_push(
    path: Path = typer.Argument(
        ..., exists=True, dir_okay=False, help="The Appspec, a YAML file."
    ),
    app_uid: str = typer.Option(..., "--app", help="The application it is saved as."),
) -> None:
    """Save a file as an application, as the Studio saves it (LOOP S-04).

    A file that is not ready is refused. A changed specification is the next
    version, and the one left behind is kept; the same one is not.
    """
    import httpx

    from agent_runtimes.loop.apps.deployments import DeployRefused
    from agent_runtimes.loop.apps.store import push

    report = validate_file(path)
    if report.verdict == NOT_READY:
        for problem in report.problems:
            console.print(f"[red]✗[/red] {problem}")
        raise typer.Exit(1)
    try:
        version, done = push(_store(), app_uid, path.read_text())
    except (DeployRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    said = {
        "saved": f"Saved as version {version}; the one before is kept.",
        "rewritten": f"Saved; still version {version}, the specification is the same.",
        "unchanged": f"Nothing to save: version {version} is this file.",
    }[done]
    console.print(f"[green]✓[/green] {said}")
