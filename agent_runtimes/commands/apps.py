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
- **setup**: what it names that is not enabled today — a block of its page
  from a UI plugin its organization has turned off among it, with
  ``--organization`` (LOOP C-12: read from IAM with the caller's token; with
  no organization, or offline, none is off and the run says so);
- **its contexts**: a context of its organization's own (``org-…``) is checked
  against the organization's, read from IAM with ``--organization`` (LOOP
  U-32); without one, or when they cannot be read, it is not ready.

Its verdict is said in the Studio's words. *Not ready* when the spec is
wrong; *Needs attention* when a safety check has something to say; otherwise
the instant checks pass, which is not yet *Ready*: that takes its tests.

With ``--safety`` it also asks the safety set every application runs (LOOP
V-09, `agent_runtimes.loop.apps.safety`) — listed alone, asked on this
machine (``--local``) or on Datalayer through the Evals engine (``--cloud``).

An application written in Python, an ``app.py``, is built to its Appspec
first (`loop apps build`, LOOP P-07): `validate`, `run` and `push` take one
as they take a spec, and `run` runs its code in this process (P-08).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, List, Optional

import typer
from rich.console import Console

if TYPE_CHECKING:
    from agent_runtimes.loop.apps.frames import FramesUnread, OrganizationFrames
    from agent_runtimes.loop.apps.plugins_off import PluginsOff

app = typer.Typer(
    name="apps",
    help="Applications: build, run, validate, deploy.",
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
    #: The safety set: each case's title, and what came of it when it was asked.
    safety: List[Dict[str, str]] = field(default_factory=list)
    #: *Safety: 4 of 4 held.*, once asked.
    safety_says: str = ""
    #: Where the plugins taken as off came from, in a sentence (LOOP C-12).
    plugins_off_says: str = ""


def _require_agentspecs() -> Any:
    try:
        import agentspecs
        from agentspecs import apps as module
    except ImportError as error:  # pragma: no cover - agentspecs is a dependency
        raise typer.BadParameter(
            "Validating an application needs agentspecs 0.0.28 or later."
        ) from error
    version = tuple(int(part) for part in agentspecs.__version__.split(".")[:3])
    if version < (0, 0, 28):
        raise typer.BadParameter(
            f"Validating an application needs agentspecs 0.0.28 or later; "
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
    # A Guard the runtime does not run checks nothing (LOOP R-06).
    from agent_runtimes.loop.apps.guards import EXECUTORS
    from agent_runtimes.specs.guards import get_guard

    for ref in application.checks.guards:
        guard = get_guard(str(ref).split(":")[0])
        if guard is not None and guard.id not in EXECUTORS:
            judge = {"cog": "a Cog", "human": "a person"}.get(guard.method, "a method")
            notes.append(
                f"The {guard.name} is judged by {judge} the runtime does not run yet: "
                "nothing is checked by it."
            )
    return notes


def read_document(path: Path) -> Dict[str, Any]:
    """The Appspec a file holds or, for an ``app.py``, amounts to (LOOP P-09).

    Raises
    ------
    AppNotRunnable
        When an ``app.py`` does not build, with the reasons.
    OSError, yaml.YAMLError
        When a spec cannot be read.
    """
    import yaml

    from agent_runtimes.loop.apps.build import build, is_python

    if is_python(path):
        return build(path).document
    return yaml.safe_load(path.read_text()) or {}


def validate_file(
    path: Path,
    plugins_off: Optional[PluginsOff] = None,
    frames: "Optional[OrganizationFrames | FramesUnread]" = None,
) -> Report:
    """The instant checks of one Appspec file, or of the spec an ``app.py`` builds.

    Parameters
    ----------
    path : Path
        The Appspec, or the ``app.py`` that builds one.
    plugins_off : PluginsOff or None
        The plugins its organization has turned off; none when not given.
    frames : OrganizationFrames, FramesUnread or None
        Its organization's contexts, or why they were not read; with none, a
        context of an organization's own is refused (LOOP U-32).

    Returns
    -------
    Report
        Its verdict and what the checks found.
    """
    import yaml

    from agent_runtimes.loop.apps.loading import AppNotRunnable
    from agent_runtimes.loop.apps.plugins_off import plugins_off_setup_notes

    off = plugins_off.plugins if plugins_off else []

    module = _require_agentspecs()
    try:
        data = read_document(path)
    except AppNotRunnable as refused:
        return Report(str(path), NOT_READY, problems=refused.problems)
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
    from agent_runtimes.loop.apps.frames import FramesUnread

    if isinstance(frames, FramesUnread):
        problems = module.app_problems(application)
        if application.context:
            problems.append(str(frames))
    else:
        known = list(frames.versions) if frames and frames.organization_uid else None
        problems = module.app_problems(application, known)
    setup = [
        *module.app_setup(application),
        *plugins_off_setup_notes(application.interface, off),
    ]
    says = plugins_off.says if plugins_off else ""
    if problems:
        return Report(
            str(path), NOT_READY, problems=problems, setup=setup, plugins_off_says=says
        )
    attention = safety_notes(module, application)
    return Report(
        str(path),
        NEEDS_ATTENTION if attention else PASSES,
        attention=attention,
        setup=setup,
        plugins_off_says=says,
    )


@app.callback()
def apps_callback(ctx: typer.Context) -> None:
    """Applications."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="validate")
def apps_validate(
    paths: List[Path] = typer.Argument(
        ..., help="Appspec files (YAML), or app.py files, built first."
    ),
    strict: bool = typer.Option(
        False,
        "--strict",
        help="Fail on what needs attention, not only on what is wrong.",
    ),
    as_json: bool = typer.Option(False, "--json", help="Print the reports as JSON."),
    safety: bool = typer.Option(
        False,
        "--safety",
        help="Also the safety set every application runs: listed, or asked with --local or --cloud.",
    ),
    local: bool = typer.Option(
        False, "--local", help="With --safety: ask it on this machine, judged here."
    ),
    cloud: bool = typer.Option(
        False,
        "--cloud",
        help="With --safety: ask it on Datalayer, through the Evals engine (billed).",
    ),
    judge: str = typer.Option(
        None,
        "--judge",
        help="With --local: the model that judges the answers, with its key on this machine.",
    ),
    app_uid: str = typer.Option(
        None,
        "--app",
        help="With --cloud: the application it is saved as; the file must be its saved version.",
    ),
    yes: bool = typer.Option(
        False, "--yes", "-y", help="With --cloud: launch without asking."
    ),
    organization: str = typer.Option(
        None,
        "--organization",
        help="The organization's uid: its turned-off plugins and its contexts, read from IAM.",
    ),
) -> None:
    """Run the instant checks of one or more applications, and its safety set.

    Exit 1 when one is not ready, or a safety test did not hold; with
    --strict, exit 2 when one needs attention; exit 3 when the safety set was
    asked but not judged.
    """
    if (local or cloud or judge or app_uid or yes) and not safety:
        raise typer.BadParameter(
            "--local, --cloud, --judge, --app and --yes go with --safety."
        )
    if local and cloud:
        raise typer.BadParameter("--local or --cloud: one place to ask it.")
    if (local or cloud) and len(paths) != 1:
        raise typer.BadParameter(
            "The safety set is asked of one application at a time."
        )
    if cloud and not app_uid:
        raise typer.BadParameter(
            "On Datalayer the engine runs a saved application: name it with --app."
        )
    plugins_off = organization_plugins_off(organization)
    frames = organization_frames(organization)
    reports = [validate_file(path, plugins_off, frames) for path in paths]
    unjudged = False
    if safety:
        for path, report in zip(paths, reports):
            if report.verdict == NOT_READY:
                continue
            unjudged = (
                _safety_of(
                    path,
                    report,
                    local=local,
                    cloud=cloud,
                    judge=judge,
                    app_uid=app_uid,
                    yes=yes,
                    quiet=as_json,
                )
                or unjudged
            )
    if as_json:
        typer.echo(json.dumps([asdict(report) for report in reports], indent=2))
    else:
        console.print(f"· Plugins: {plugins_off.says}", highlight=False)
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
            for check in report.safety:
                mark = {
                    "held": "[green]✓[/green]",
                    "failed": "[red]✗[/red]",
                    "not_answered": "[red]✗[/red]",
                }.get(check.get("state", ""), "·")
                said = f" — {check['says']}" if check.get("says") else ""
                console.print(f"  {mark} {check['title']}{said}", highlight=False)
            if report.safety_says:
                console.print(f"  {report.safety_says}", highlight=False)
    if any(report.verdict == NOT_READY for report in reports):
        raise typer.Exit(1)
    if any(report.safety_says and _unsafe(report) for report in reports):
        raise typer.Exit(1)
    if strict and any(report.verdict == NEEDS_ATTENTION for report in reports):
        raise typer.Exit(2)
    if unjudged:
        raise typer.Exit(3)


def _unsafe(report: Report) -> bool:
    from agent_runtimes.loop.apps import safety as _safety

    return any(
        line.get("state") in (_safety.FAILED, _safety.NOT_ANSWERED)
        for line in report.safety
    )


def _say_safety(report: Report, reading: Any) -> None:
    report.safety = [
        {
            "kind": result.case.kind,
            "title": result.case.title,
            "state": result.state,
            "says": result.says,
            "answer": result.answer,
        }
        for result in reading.results
    ]
    report.safety_says = reading.says


def _list_safety(report: Report, cases: List[Any], why: str) -> None:
    report.safety = [
        {
            "kind": case.kind,
            "title": case.title,
            "state": "listed",
            "says": f"asks “{_clip(case.ask)}”; judged for {case.failure_mode}",
        }
        for case in cases
    ]
    report.safety_says = why


def _clip(text: str, length: int = 72) -> str:
    return text if len(text) <= length else text[:length].rstrip() + "…"


def _safety_of(
    path: Path,
    report: Report,
    *,
    local: bool,
    cloud: bool,
    judge: Any,
    app_uid: Any,
    yes: bool,
    quiet: bool,
) -> bool:
    """Ask, or list, one application's safety set into its report.

    Returns whether it was asked but not judged (exit 3).
    """
    from agent_runtimes.loop.apps import safety as _safety
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    try:
        application = _application_of(path)
    except AppNotRunnable as refused:
        report.safety_says = " ".join(refused.problems)
        return True
    cases = _safety.safety_cases(application.spec)
    if not local and not cloud:
        _list_safety(
            report,
            cases,
            f"Safety: {len(cases)} tests, not asked. Each answer is judged by a model "
            "against the test's rubric; --local asks them here, --cloud on Datalayer.",
        )
        return False
    if cloud:
        return _safety_in_cloud(path, report, cases, app_uid, yes=yes, quiet=quiet)
    return _safety_here(application, report, cases, judge)


def _safety_here(
    application: Any, report: Report, cases: List[Any], judge_model: Any
) -> bool:
    """The safety set asked on this machine, and judged here when a judge is."""
    import asyncio
    import logging

    from agent_runtimes.evals.remote.evaluators import default_judge
    from agent_runtimes.loop.apps import safety as _safety
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    # The terminal says what came of each case: no model routing or record log over it.
    for name in ("agent_runtimes", "botocore", "httpx", "httpx2"):
        logging.getLogger(name).setLevel(logging.WARNING)
    judge = _safety.model_judge(judge_model) if judge_model else default_judge()
    if judge is None:
        _list_safety(
            report,
            cases,
            "Safety: not asked — no judge on this machine. Name one with --judge "
            "<model> (its key set here), or set DATALAYER_AI_INFERENCE_URL; or ask it "
            "on Datalayer with --cloud.",
        )
        return True
    try:
        answers = asyncio.run(_safety.answer_in_process(application, cases))
    except AppNotRunnable:
        # What only a runtime brings — its connections, tools, skills: asked
        # on a runtime on this machine, configured with it, as `run --local`.
        try:
            answers = _answers_on_local_runtime(application.document, cases)
        except (RuntimeError, typer.BadParameter) as refused:
            said = getattr(refused, "message", None) or str(refused)
            _list_safety(report, cases, f"Safety: not asked. {said}")
            return True
    except Exception as refused:  # noqa: BLE001 - its agent cannot be built here
        said = str(refused).strip().splitlines()
        _list_safety(
            report,
            cases,
            f"Safety: not asked. Its agent cannot be built here: {said[0] if said else type(refused).__name__}",
        )
        return True
    reading = _safety.SafetyReading(
        [
            _safety.judge_answered(case, answer, judge, model=judge_model or "")
            for case, answer in zip(cases, answers)
        ]
    )
    _say_safety(report, reading)
    return any(result.state == _safety.NOT_JUDGED for result in reading.results)


def _answers_on_local_runtime(document: Dict[str, Any], cases: List[Any]) -> List[Any]:
    """Each case asked of the application on a runtime started on this machine."""
    import asyncio
    import logging

    from agent_runtimes.chat.cli import (
        _run_single_query_ag_ui,
        _start_agent_runtime_server,
        _wait_for_server,
    )
    from agent_runtimes.loop.apps.safety import Answered
    from agent_runtimes.loop.launch import CLOUD_AGENT_NAME, speak_ag_ui

    logging.getLogger("httpx").setLevel(logging.WARNING)
    process, port = _start_agent_runtime_server(BOOTSTRAP_AGENT_SPEC_ID)
    try:
        if not _wait_for_server("127.0.0.1", port, timeout=60.0):
            raise RuntimeError("The local server did not start.")
        base_url = f"http://127.0.0.1:{port}"
        configure_on(base_url, document)
        if not speak_ag_ui(base_url):
            raise RuntimeError("The application's agent did not come up.")
        agent_url = f"{base_url}/api/v1/ag-ui/{CLOUD_AGENT_NAME}/"
        answers: List[Any] = []
        for case in cases:
            try:
                text = asyncio.run(_run_single_query_ag_ui(agent_url, case.ask))
            except Exception as error:  # noqa: BLE001 - a turn that fails is the outcome
                answers.append(Answered("", f"{type(error).__name__}: {error}"))
                continue
            answers.append(Answered(str(text)))
        return answers
    finally:
        process.terminate()
        process.join(timeout=5.0)


def _safety_in_cloud(
    path: Path,
    report: Report,
    cases: List[Any],
    app_uid: str,
    *,
    yes: bool,
    quiet: bool,
) -> bool:
    """The safety set run by the Evals engine on the saved application (its `app` subject)."""
    import httpx

    from agent_runtimes.loop.apps import safety as _safety
    from agent_runtimes.loop.apps.deployments import DeployRefused
    from agent_runtimes.loop.apps.store import _canonical
    from agent_runtimes.loop.launch import NotSignedIn, interactive, make_client

    try:
        client, _token = make_client()
    except NotSignedIn as refused:
        report.safety_says = (
            f"Safety: not asked. {refused} Sign in with `datalayer login`."
        )
        return True
    store = _store()
    try:
        item = store.item(app_uid)
        version = item.version
    except (DeployRefused, httpx.HTTPError) as refused:
        report.safety_says = f"Safety: not asked. {refused}"
        return True
    if _canonical(read_document(path)) != _canonical(item.model.get("spec")):
        report.safety_says = (
            f"Safety: not asked. {path} is not version {version} of {item.name}, "
            f"which the engine would run: `loop apps push {path} --app {app_uid}` first."
        )
        return True

    def confirm(plan: Dict[str, Any]) -> bool:
        if yes:
            return True
        estimate = plan.get("estimate") or {}
        credits = estimate.get("credits_reserved")
        cost = (
            f"at most {credits:g} credits"
            if credits is not None
            else "its cost unknown"
        )
        question = (
            f"Run the safety set of {item.name} version {version} on Datalayer — "
            f"{len(cases)} tests, {cost}?"
        )
        if not interactive():
            console.print(
                f"[yellow]{question} Not without a yes: --yes launches it.[/yellow]",
                highlight=False,
            )
            return False
        return typer.confirm(question, default=False)

    try:
        reading = _safety.run_in_cloud(
            client,
            app_uid=app_uid,
            version=version,
            name=item.name,
            cases=cases,
            confirm=confirm,
            log=None if quiet else (lambda line: console.print(line, highlight=False)),
        )
    except (_safety.SafetyCloudRefused, httpx.HTTPError, TimeoutError) as refused:
        report.safety_says = f"Safety: not asked. {refused}"
        return True
    if reading is None:
        _list_safety(report, cases, "Safety: not asked — the launch was not made.")
        return True
    _say_safety(report, reading)
    return any(result.state == _safety.NOT_JUDGED for result in reading.results)


@app.command(name="init")
def apps_init(
    app_id: Optional[str] = typer.Argument(
        None, help="The application's id, and the folder written for it."
    ),
    example: str = typer.Option(
        None, "--from", help="An example of the catalogue to start from."
    ),
    python: bool = typer.Option(
        False, "--python", help="Written in Python: an app.py beside its spec."
    ),
    kind: str = typer.Option(
        "chat", "--kind", help="A blank application's kind: chat or widget."
    ),
    where: Path = typer.Option(
        Path("."), "--dir", file_okay=False, help="Where its folder is written."
    ),
    list_examples: bool = typer.Option(
        False, "--examples", help="List the examples to start from, and write nothing."
    ),
) -> None:
    """Write a new application's folder: its spec and, in Python, its app.py (LOOP P-01).

    Blank, or from an example of the catalogue with --from. What is written
    passes the checks `validate` makes of a spec; a folder that is there is
    never overwritten.
    """
    from agent_runtimes.loop.apps.scaffold import (
        PYTHON_FILE,
        InitRefused,
        examples,
        init,
    )

    _require_agentspecs()
    if list_examples:
        for name in examples():
            typer.echo(name)
        return
    if not app_id:
        console.print("[red]✗[/red] Name the application: loop apps init <id>.")
        raise typer.Exit(1)
    try:
        written = init(app_id, where, kind=kind, example=example, python=python)
    except InitRefused as refused:
        console.print(f"[red]✗[/red] {refused}", highlight=False)
        raise typer.Exit(1)
    origin = f" from the {written.example} example" if written.example else ""
    console.print(
        f"[green]✓[/green] {app_id} written to {written.folder}{origin}: "
        + ", ".join(written.files)
        + ".",
        highlight=False,
    )
    source = PYTHON_FILE if PYTHON_FILE in written.files else "app.yaml"
    console.print(
        f"Next: cd {written.folder} && loop apps run {source}", highlight=False
    )


@app.command(name="build")
def apps_build(
    path: Path = typer.Argument(
        ..., exists=True, dir_okay=False, help="The application, an app.py file."
    ),
    out: Path = typer.Option(
        None, "--out", "-o", help="Where to write the Appspec; printed when unsaid."
    ),
    force: bool = typer.Option(
        False, "--force", help="Overwrite a file that is there."
    ),
) -> None:
    """Write the Appspec an app.py amounts to (LOOP P-07).

    What its code decides is marked as code at the top of the spec. Refused,
    with the reasons, when the file defines no application or more than one,
    or its spec does not validate.
    """
    from agent_runtimes.loop.apps.build import build, is_python
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    if not is_python(path):
        console.print(f"[red]✗[/red] {path} is not an app.py: a spec is built already.")
        raise typer.Exit(1)
    try:
        built = build(path)
    except AppNotRunnable as refused:
        for problem in refused.problems:
            console.print(f"[red]✗[/red] {problem}", highlight=False)
        raise typer.Exit(1)
    if out is None:
        typer.echo(built.text, nl=False)
        return
    if out.exists() and not force:
        console.print(f"[red]✗[/red] {out} is there already; --force overwrites it.")
        raise typer.Exit(1)
    out.write_text(built.text)
    decided = len(built.marks)
    console.print(
        f"[green]✓[/green] {built.application.spec.name} written to {out}"
        + (
            f"; its code decides {decided} thing{'s' if decided != 1 else ''}."
            if decided
            else "."
        ),
        highlight=False,
    )


def _watcher(path: Path, base_url: str) -> Any:
    """What builds the application again when its file changed, and reconfigures the runtime."""
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    seen = [path.stat().st_mtime]

    def reload() -> Any:
        mtime = path.stat().st_mtime
        if mtime == seen[0]:
            return None
        seen[0] = mtime
        try:
            application = _application_of(path)
            configure_on(base_url, application.document)
        except typer.BadParameter as refused:
            raise AppNotRunnable([str(refused.message)]) from None
        return application

    return reload


def _application_of(path: Path) -> Any:
    """The application of a file: built from an app.py, or attached to a spec.

    Raises
    ------
    AppNotRunnable
        When it would not run, with the reasons.
    """
    from agent_runtimes.loop.apps.application import Application
    from agent_runtimes.loop.apps.build import build, is_python
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    if is_python(path):
        return build(path).application
    import yaml

    try:
        document = yaml.safe_load(path.read_text())
    except (OSError, yaml.YAMLError) as error:
        raise AppNotRunnable([f"{path} cannot be read: {error}"]) from None
    if not isinstance(document, dict):
        raise AppNotRunnable([f"{path} does not hold an application."])
    return Application.from_spec(document)


#: The agentspec a local server is started with before an application is
#: configured on it; the application's own agent replaces it.
BOOTSTRAP_AGENT_SPEC_ID = "example-simple"


def configure_on(
    base_url: str, document: Dict[str, Any], organization: Optional[str] = None
) -> Dict[str, Any]:
    """Configure a runtime with an application; its refusal said in sentences.

    With ``organization``, the runtime reads the plugins it turned off and the
    contexts its agent keeps to (LOOP C-12, U-31) with the caller's token.
    """
    import httpx

    body: Dict[str, Any] = {"app": document}
    if organization:
        from agent_runtimes.loop.launch import NotSignedIn, make_client

        body["organization_uid"] = organization
        try:
            body["user_token"] = make_client()[1]
        except NotSignedIn:
            pass
    response = httpx.post(f"{base_url}/api/v1/apps/configure", json=body, timeout=120.0)
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
        ...,
        exists=True,
        dir_okay=False,
        help="The Appspec, a YAML or JSON file, or an app.py, built first.",
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
    watch: bool = typer.Option(
        False,
        "--watch",
        "-w",
        help="Build the application again when its file changes, before the next turn.",
    ),
    organization: str = typer.Option(
        None,
        "--organization",
        help="The organization's uid: its turned-off plugins and its contexts, read from IAM.",
    ),
) -> None:
    """Run an application in the terminal — here, or on Datalayer (LOOP L-05, P-08).

    The runtime is configured with the application, so its rules decide every
    tool call; its starters are the terminal's suggestions. An app.py is built
    first, and its code runs in this process: what it reacts to — start, a
    message, an action (/action <name> [json]), stop — is its code's; a
    message it does not take is answered by the runtime's agent.
    """
    import asyncio

    from agent_runtimes.loop.apps.build import is_python
    from agent_runtimes.loop.apps.loading import AppNotRunnable
    from agent_runtimes.loop.launch import (
        CLOUD,
        CLOUD_AGENT_NAME,
        CloudRefused,
        NotSignedIn,
        choose_where,
        finish_cloud,
        launch_cloud,
        speak_ag_ui,
    )

    try:
        built = _application_of(path)
        application = built.spec
    except AppNotRunnable as refused:
        for problem in refused.problems:
            console.print(f"[red]✗[/red] {problem}", highlight=False)
        raise typer.Exit(1)
    document = built.document
    has_code = is_python(path)
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
        except CloudRefused as refused:
            console.print(f"[red]✗[/red] {refused}")
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
        configured = configure_on(base_url, document, organization)
        if not speak_ag_ui(base_url):
            raise RuntimeError("The application's agent did not come up.")
        from agent_runtimes.loop.apps.plugins_off import plugins_off_setup_notes

        plugins_off = organization_plugins_off(organization)
        console.print(
            f"[yellow]•[/yellow] Plugins: {plugins_off.says}", highlight=False
        )
        for note in [
            *(configured.get("setup") or []),
            *plugins_off_setup_notes(application.interface, plugins_off.plugins),
        ]:
            console.print(f"[yellow]•[/yellow] {note}")
        agent_url = f"{base_url}/api/v1/ag-ui/{CLOUD_AGENT_NAME}/"
        starters = [starter.message for starter in application.interface.starters]
        where_said = (
            f"on Datalayer ({cloud_launch.runtime_name})"
            if cloud_launch
            else "on this machine"
        )
        startup = f"{application.emoji}  {application.name} is running {where_said}"
        if ask and has_code and built.handler("message") is not None:
            from agent_runtimes.loop.apps.terminal import ask_once

            asyncio.run(ask_once(built, ask, console))
        elif ask:
            from agent_runtimes.chat.cli import _run_single_query_ag_ui

            console.print(asyncio.run(_run_single_query_ag_ui(agent_url, ask)))
        elif has_code or watch:
            from agent_runtimes.loop.apps.terminal import run_app_tux

            asyncio.run(
                run_app_tux(
                    built,
                    reload=_watcher(path, base_url) if watch else None,
                    agent_url=agent_url,
                    server_url=base_url,
                    agent_id=CLOUD_AGENT_NAME,
                    extra_suggestions=starters,
                    startup_message=startup,
                )
            )
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
            Deployments(
                client.urls.spacer_url,
                token,
                ai_agents_url=client.urls.ai_agents_url,
            ),
            app_uid,
            version,
            slug,
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


def organization_frames(
    organization: Optional[str],
) -> "OrganizationFrames | FramesUnread":
    """An organization's contexts, read from IAM with the caller's token, or why not (LOOP U-32).

    Parameters
    ----------
    organization : str or None
        The organization's uid; none is read without one.

    Returns
    -------
    OrganizationFrames or FramesUnread
        Its contexts — none with no organization — or the sentence saying why
        they were not read.
    """
    from agent_runtimes.loop.apps.frames import FramesUnread, read_organization_frames
    from agent_runtimes.loop.launch import NotSignedIn, make_client

    try:
        if not organization:
            return read_organization_frames(None, iam_url="", token=None)
        try:
            client, token = make_client()
        except NotSignedIn:
            return read_organization_frames(organization, iam_url="", token=None)
        return read_organization_frames(
            organization, iam_url=client.urls.iam_url, token=token
        )
    except FramesUnread as unread:
        return unread


def organization_plugins_off(organization: Optional[str]) -> PluginsOff:
    """The plugins an organization has turned off, read from IAM with the caller's token.

    Parameters
    ----------
    organization : str or None
        The organization's uid; none is read without one.

    Returns
    -------
    PluginsOff
        The list — empty with no organization, signed out or offline — and why.
    """
    from agent_runtimes.loop.apps.plugins_off import read_plugins_off
    from agent_runtimes.loop.launch import NotSignedIn, make_client

    if not organization:
        return read_plugins_off(None, iam_url="", token=None)
    try:
        client, token = make_client()
    except NotSignedIn:
        return read_plugins_off(organization, iam_url="", token=None)
    return read_plugins_off(organization, iam_url=client.urls.iam_url, token=token)


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


def _spec_text(path: Path) -> str:
    """The Appspec's text: the file's own, or the spec an app.py builds, its code marked."""
    from agent_runtimes.loop.apps.build import build, is_python

    return build(path).text if is_python(path) else path.read_text()


@app.command(name="push")
def apps_push(
    path: Path = typer.Argument(
        ...,
        exists=True,
        dir_okay=False,
        help="The Appspec, a YAML file, or an app.py, built first.",
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
        version, done = push(_store(), app_uid, _spec_text(path))
    except (DeployRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    said = {
        "saved": f"Saved as version {version}; the one before is kept.",
        "rewritten": f"Saved; still version {version}, the specification is the same.",
        "unchanged": f"Nothing to save: version {version} is this file.",
    }[done]
    console.print(f"[green]✓[/green] {said}")
