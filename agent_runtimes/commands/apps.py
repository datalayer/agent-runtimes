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
With ``--tests`` it also runs its test conversations (LOOP V-08,
`agent_runtimes.loop.apps.validation`) — listed alone, or run on this machine
(``--local``): each case asked of the application in this process with its
checks on — nothing sensitive leaves, the output has its shape, it answers
from its sources, the catalogue Guards it names — then decided by the
function its code names (P-06, ``@app.test``) or by a judge (``--judge``, or
``DATALAYER_AI_INFERENCE_URL``). A failed case names the check that stopped
it. With ``--attach --app <uid>`` the report is kept by ai-agents against the
saved version the file is, as the Studio keeps a run of the Evals engine, so
Readiness and the Ship tab read it.

An application written in Python, an ``app.py``, is built to its Appspec
first (`loop apps build`, LOOP P-07): `validate`, `run` and `push` take one
as they take a spec, and `run` runs its code in this process (P-08).
"""

from __future__ import annotations

import contextlib
import json
import logging
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Dict, Iterator, List, Optional, Tuple

import typer
from rich.console import Console

if TYPE_CHECKING:
    from agent_runtimes.loop.apps.frames import FramesUnread, OrganizationFrames
    from agent_runtimes.loop.apps.plugins_off import PluginsOff

app = typer.Typer(
    name="apps",
    help="Applications: build, run, validate, deploy.",
    invoke_without_command=True,
    pretty_exceptions_show_locals=False,
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
    #: Its test conversations (LOOP V-08): each case, its outcome and the check
    #: that stopped it; `name` the function of its code that decides it (P-06).
    tests: List[Dict[str, str]] = field(default_factory=list)
    #: *Its tests: 2 of 3 passed; 1 stopped by a check.*, once run.
    tests_says: str = ""
    #: The run as plain data (`ValidationReport.as_dict`), once run here.
    validation: Optional[Dict[str, Any]] = None


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


def code_notes(application: Any) -> List[str]:
    """What its spec says its code does, which nothing does without the file (LOOP P-06).

    Said for a spec read alone; for an ``app.py``, its code is there, and
    nothing is said.
    """
    notes: List[str] = []
    for tool in application.tools:
        notes.append(
            f"Its tool {tool.name} is written in its code: run from this spec "
            "alone, its agent is not given it."
        )
    for check in application.checks.code:
        notes.append(
            f"Its check {check.name} ({check.description}) is written in its code: "
            "run from this spec alone, nothing checks it."
        )
    for case in application.tests.cases:
        if case.code:
            notes.append(
                f"Its test “{case.expect}” is decided by its code ({case.code}): "
                "run from this spec alone, it is judged by its words."
            )
    page = application.interface.page
    if page is not None:
        notes.append(
            f"Its page is run by its code ({page.function}): run from this spec "
            "alone, nothing shows its outputs."
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
    from agent_runtimes.loop.apps.build import is_python

    if not is_python(path):
        attention += code_notes(application)
    else:
        attention += code_agent_notes(path)
    return Report(
        str(path),
        NEEDS_ATTENTION if attention else PASSES,
        attention=attention,
        setup=setup,
        plugins_off_says=says,
    )


def code_agent_notes(path: Path) -> List[str]:
    """What validation says of the agent an ``app.py`` gives itself (LOOP P-23).

    An agent whose tool calls LOOP does not see — a plain function, a
    LlamaIndex workflow — has none of them decided by its rules: said, so that
    the verdict is not *passes* for what its rules never see.
    """
    from agent_runtimes.loop.apps.build import build

    agent = build(path).application.code_agent
    note = agent.note() if agent is not None else None
    return [note] if note else []


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
    tests: bool = typer.Option(
        False,
        "--tests",
        help="Also its test conversations, with the checks on: listed, or run here with --local.",
    ),
    local: bool = typer.Option(
        False,
        "--local",
        help="With --safety: ask it on this machine, judged here. With --tests: run them here.",
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
        help="With --cloud or --attach: the application it is saved as; the file must be its saved version.",
    ),
    yes: bool = typer.Option(
        False, "--yes", "-y", help="With --cloud: launch without asking."
    ),
    attach: bool = typer.Option(
        False,
        "--attach",
        help="With --tests --local --app: keep the report against the saved version, for Readiness and the Ship tab.",
    ),
    organization: str = typer.Option(
        None,
        "--organization",
        help="The organization's uid: its turned-off plugins and its contexts, read from IAM.",
    ),
) -> None:
    """Run the instant checks of one or more applications, its safety set, and its tests.

    Exit 1 when one is not ready, a safety test did not hold, a test failed
    or the report could not be attached; with --strict, exit 2 when one
    needs attention; exit 3 when the safety set was asked but not judged, or
    a test could not be run.
    """
    if local and not (safety or tests):
        raise typer.BadParameter("--local goes with --safety or --tests.")
    if (cloud or yes) and not safety:
        raise typer.BadParameter("--cloud and --yes go with --safety.")
    if judge and not (safety or tests):
        raise typer.BadParameter("--judge goes with --safety or --tests.")
    if attach and not (tests and local):
        raise typer.BadParameter("--attach goes with --tests --local.")
    if app_uid and not (cloud or attach):
        raise typer.BadParameter("--app goes with --cloud or --attach.")
    if attach and not app_uid:
        raise typer.BadParameter(
            "The report is attached to a saved application: name it with --app."
        )
    if tests and cloud:
        raise typer.BadParameter(
            "Its tests run here, with --local; the Studio runs them on Datalayer."
        )
    if local and cloud:
        raise typer.BadParameter("--local or --cloud: one place to ask it.")
    if (local or cloud) and len(paths) != 1:
        raise typer.BadParameter(
            "The safety set and the tests are asked of one application at a time."
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
    unattached = False
    if tests:
        for path, report in zip(paths, reports):
            if report.verdict == NOT_READY:
                continue
            unjudged = (
                _code_tests_of(path, report, local=local, judge=judge) or unjudged
            )
            if attach and report.validation is not None:
                unattached = not _attach_report(path, report, app_uid)
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
            for test in report.tests:
                mark = {"passed": "[green]✓[/green]", "failed": "[red]✗[/red]"}.get(
                    test.get("state", ""), "·"
                )
                named = f" ({test['name']})" if test.get("name") else ""
                said = f" — {test['says']}" if test.get("says") else ""
                console.print(
                    f"  {mark} {test['expect']}{named}{said}", highlight=False
                )
            if report.tests_says:
                console.print(f"  {report.tests_says}", highlight=False)
    if any(report.verdict == NOT_READY for report in reports):
        raise typer.Exit(1)
    if any(report.safety_says and _unsafe(report) for report in reports):
        raise typer.Exit(1)
    if any(test.get("state") == "failed" for r in reports for test in r.tests):
        raise typer.Exit(1)
    if unattached:
        raise typer.Exit(1)
    if strict and any(report.verdict == NEEDS_ATTENTION for report in reports):
        raise typer.Exit(2)
    if unjudged:
        raise typer.Exit(3)


def _code_tests_of(
    path: Path, report: Report, *, local: bool, judge: Optional[str] = None
) -> bool:
    """List, or run here, its test conversations with the checks on (LOOP
    V-08) — each decided by its code (P-06) or by a judge — and its page on
    its inputs' defaults (P-05).

    Returns whether they were asked but not all run (exit 3).
    """
    unrun = _case_tests_of(path, report, local=local, judge=judge)
    return _page_test_of(path, report, local=local) or unrun


#: What the page of a widget written in its code is checked for (LOOP P-05).
PAGE_TEST = "It shows each of its outputs for its inputs' defaults."


def _page_test_of(path: Path, report: Report, *, local: bool) -> bool:
    """List, or run here, a widget's page on its inputs' defaults (LOOP P-05):
    each of its outputs given, and drawn. Returns whether it was asked but not run.
    """
    import asyncio

    from agent_runtimes.loop.apps.application import AppHost
    from agent_runtimes.loop.apps.loading import AppNotRunnable
    from agent_runtimes.loop.apps.session import MemoryChannel

    try:
        application = _application_of(path)
    except AppNotRunnable:
        return False
    page = application.spec.interface.page
    if page is None:
        return False
    row = {
        "name": page.function,
        "expect": PAGE_TEST,
        "ask": "",
        "state": "",
        "says": "",
    }
    if report.tests_says == NO_TEST:
        report.tests_says = ""
    if not application.handler("page"):
        row["says"] = "Its page is run by an app.py: validate the app.py to run it."
        report.tests.append(row)
        return False
    if not local:
        row["says"] = "Not run. --local runs it here."
        report.tests.append(row)
        return False
    missing = [
        name
        for name in page.inputs.get("required") or []
        if "default" not in (page.inputs["properties"].get(name) or {})
    ]
    if missing:
        row["state"] = "failed"
        row["says"] = (
            f"Not run: {', '.join(missing)} has no default, and a page shows its outputs "
            "from the start. Give it one."
        )
        report.tests.append(row)
        return False

    async def run() -> None:
        host = AppHost(application, MemoryChannel())
        session = await host.open()
        await host.page(session, {})

    try:
        with _quiet():
            asyncio.run(run())
    except (ValueError, KeyError) as refused:
        row["state"] = "failed"
        row["says"] = str(refused).strip("'\"")
    except Exception as failed:  # noqa: BLE001 - its code failed: said
        row["state"] = "failed"
        row["says"] = f"{page.function} failed: {type(failed).__name__}: {failed}"
    else:
        row["state"] = "passed"
    report.tests.append(row)
    return False


#: What a run says of an application with no test conversation.
NO_TEST = "It has no test."


def _judge_here(model: Optional[str]) -> Tuple[Any, str]:
    """The judge of the worded tests on this machine: the model named, or the
    one configured (`default_judge`); None when there is none.
    """
    from agent_runtimes.evals.remote.evaluators import default_judge
    from agent_runtimes.loop.apps import safety as _safety

    if model:
        return _safety.model_judge(model), model
    return default_judge(), ""


def _agent_here() -> Any:
    """How the application's agent is built in this process: from its spec
    (`local_agent`) when None; stood in for in tests.
    """
    return None


def _case_tests_of(
    path: Path, report: Report, *, local: bool, judge: Optional[str] = None
) -> bool:
    """List, or run here, its test conversations with the checks on (LOOP V-08).

    Returns whether they were asked but not all run (exit 3).
    """
    import asyncio

    from agent_runtimes.loop.apps import own, validation
    from agent_runtimes.loop.apps.loading import AppNotRunnable

    try:
        application = _application_of(path)
    except AppNotRunnable as refused:
        report.tests_says = " ".join(refused.problems)
        return True
    cases = list(application.spec.tests.cases)
    listed = [
        {
            "name": case.code,
            "expect": case.expect,
            "ask": case.in_words(),
            "state": "",
            "check": "",
            "says": "",
        }
        for case in cases
    ]
    if not cases:
        report.tests_says = NO_TEST
        return False
    coded = own.code_tests(application.spec)
    if coded and len(coded) == len(cases) and not application.tests:
        # Every test is decided by an app.py this spec stands apart from.
        report.tests = listed
        report.tests_says = (
            f"Its tests: {len(cases)}, decided by an app.py: validate the app.py "
            "to run them."
        )
        return False
    if not local:
        report.tests = listed
        report.tests_says = (
            f"Its tests: {len(cases)}, not run. --local runs them here: each asked "
            "of the application with its checks on, decided by its code (@app.test) "
            "or by a judge (--judge <model>, or DATALAYER_AI_INFERENCE_URL)."
        )
        return False
    judge_call, judge_model = (
        _judge_here(judge) if len(coded) < len(cases) else (None, "")
    )
    try:
        with _quiet():
            ran = asyncio.run(
                validation.run_tests(
                    application,
                    judge=judge_call,
                    model=judge_model,
                    agent=_agent_here(),
                )
            )
    except AppNotRunnable as refused:
        report.tests = listed
        report.tests_says = "Its tests: not run. " + " ".join(refused.problems)
        return True
    except Exception as refused:  # noqa: BLE001 - its agent cannot be built here
        said = str(refused).strip().splitlines()
        report.tests = listed
        report.tests_says = "Its tests: not run. Its agent cannot be built here: " + (
            said[0] if said else type(refused).__name__
        )
        return True
    report.tests = [
        {
            "name": result.code,
            "expect": result.expect,
            "ask": result.ask,
            "state": result.state,
            "check": result.check,
            "says": result.says,
        }
        for result in ran.cases
    ]
    report.tests_says = ran.says
    report.validation = ran.as_dict()
    return ran.not_run > 0


def _attach_report(path: Path, report: Report, app_uid: str) -> bool:
    """Hand the run's report to ai-agents, which keeps it against the saved
    version the file is (LOOP V-08). Returns whether it was kept; what
    refused it is said in `tests_says`.
    """
    import httpx

    from agent_runtimes.loop.apps import validation
    from agent_runtimes.loop.apps.deployments import DeployRefused
    from agent_runtimes.loop.apps.store import _canonical

    store = _store()
    try:
        item = store.item(app_uid)
    except (DeployRefused, httpx.HTTPError) as refused:
        report.tests_says += f" Not attached: {refused}"
        return False
    if _canonical(read_document(path)) != _canonical(item.model.get("spec")):
        report.tests_says += (
            f" Not attached: {path} is not version {item.version} of {item.name}, "
            f"the saved one: `loop apps push {path} --app {app_uid}` first."
        )
        return False
    held = report.validation or {}
    ran = validation.ValidationReport(
        app=str(held.get("app") or ""),
        name=str(held.get("name") or ""),
        version=str(held.get("version") or ""),
        cases=[
            validation.CaseResult(
                ask=str(case.get("ask") or ""),
                expect=str(case.get("expect") or ""),
                state=str(case.get("state") or ""),
                check=str(case.get("check") or ""),
                says=str(case.get("says") or ""),
                answer=str(case.get("answer") or ""),
                code=str(case.get("code") or ""),
            )
            for case in held.get("cases") or []
        ],
        checks=list(held.get("checks") or []),
        unexecuted=list(held.get("unexecuted") or []),
        where=str(held.get("where") or validation.HERE),
        at=str(held.get("at") or ""),
    )
    from agent_runtimes.loop.launch import make_client

    # ai-agents' own origin: Spacer and ai-agents need not share one (r1's
    # ai-agents keeps it, Spacer answers on prod1).
    base_url = str(make_client()[0].urls.ai_agents_url).rstrip("/")
    try:
        validation.attach(
            store.http, base_url, app_uid=app_uid, version=item.version, report=ran
        )
    except validation.AttachRefused as refused:
        report.tests_says += f" Not attached: {refused}"
        return False
    report.tests_says += f" Attached to version {item.version} of {item.name}."
    return True


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


@contextlib.contextmanager
def _quiet() -> Iterator[None]:
    """While cases run, the terminal says what came of each: no model routing
    or record log over it. The loggers are as they were after: a validation
    run in a process that goes on (a test, a notebook) leaves its logs alone.
    """
    loggers = [
        logging.getLogger(name)
        for name in ("agent_runtimes", "botocore", "httpx", "httpx2")
    ]
    held = [each.level for each in loggers]
    for each in loggers:
        each.setLevel(logging.WARNING)
    try:
        yield
    finally:
        for each, level in zip(loggers, held):
            each.setLevel(level)


def _safety_here(
    application: Any, report: Report, cases: List[Any], judge_model: Any
) -> bool:
    """The safety set asked on this machine, and judged here when a judge is."""
    with _quiet():
        return _ask_safety_here(application, report, cases, judge_model)


def _ask_safety_here(
    application: Any, report: Report, cases: List[Any], judge_model: Any
) -> bool:
    """Each case asked of the application in this process, and judged."""
    import asyncio

    from agent_runtimes.evals.remote.evaluators import default_judge
    from agent_runtimes.loop.apps import safety as _safety
    from agent_runtimes.loop.apps.loading import AppNotRunnable

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


@app.command(name="eject")
def apps_eject(
    path: Path = typer.Argument(
        ..., exists=True, dir_okay=False, help="The application's Appspec, a YAML file."
    ),
    out: Path = typer.Option(
        None, "--out", "-o", help="The file written; app.py beside the spec by default."
    ),
    force: bool = typer.Option(
        False, "--force", help="Overwrite a file that is there."
    ),
    yes: bool = typer.Option(
        False, "--yes", "-y", help="Eject without asking: it is one way."
    ),
) -> None:
    """Write an application built by spec or on the Canvas as an app.py (LOOP P-13).

    One way: from then on the file is its source, and its spec is built from
    it. Said before it is done, and asked unless --yes; the file holds the
    spec and builds it the same, or nothing is written. `push` it as the
    application's next version: its versions so far are kept.
    """
    import yaml

    from agent_runtimes.loop.apps.scaffold import EJECT_SAID, InitRefused, eject
    from agent_runtimes.loop.launch import interactive

    _require_agentspecs()
    loaded = yaml.safe_load(path.read_text())
    name = loaded.get("name") or loaded.get("id") if isinstance(loaded, dict) else None
    said = EJECT_SAID.format(
        file=(out or path.with_name("app.py")).name, name=name or path.name
    )
    console.print(said, highlight=False)
    if not yes:
        if not interactive():
            console.print(
                "[yellow]Not without a yes: --yes ejects it.[/yellow]", highlight=False
            )
            raise typer.Exit(1)
        if not typer.confirm("Eject it?", default=False):
            raise typer.Exit(1)
    try:
        written = eject(path, out, force=force)
    except InitRefused as refused:
        console.print(f"[red]✗[/red] {refused}", highlight=False)
        raise typer.Exit(1)
    console.print(
        f"[green]✓[/green] {written} written: it builds {path.name} as it is.",
        highlight=False,
    )
    console.print(
        f"Next: loop apps run {written.name} --watch, then "
        f"loop apps push {written.name} --app <its id>.",
        highlight=False,
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


@app.command(name="package")
def apps_package(
    path: Path = typer.Argument(
        ..., exists=True, dir_okay=False, help="The application, an app.py file."
    ),
    out: Path = typer.Option(
        None,
        "--out",
        "-o",
        help="Where to write its project and its wheel; dist/ beside it when unsaid.",
    ),
    force: bool = typer.Option(
        False, "--force", help="Write its project again when it is there."
    ),
    no_wheel: bool = typer.Option(
        False, "--no-wheel", help="Write its project, and do not build its wheel."
    ),
) -> None:
    """Package an app.py with its page side, as a Reactor extension (LOOP P-29).

    Writes the Python distribution loop-app-<id> — the application's module,
    and the files of its folder its components name, under
    share/datalayer/reactor/extensions/loop-app-<id>/ — then builds its wheel.
    Installed beside the server that runs the application (`loop apps run
    --web`, `app.mount`), its page draws them from that server.
    """
    from agent_runtimes.loop.apps.build import is_python
    from agent_runtimes.loop.apps.loading import AppNotRunnable
    from agent_runtimes.loop.apps.packaging import NotPackageable, package

    if not is_python(path):
        console.print(
            f"[red]✗[/red] {path} is not an app.py: a spec has no folder to package."
        )
        raise typer.Exit(1)
    try:
        packaged = package(
            path,
            out if out is not None else path.parent / "dist",
            force=force,
            wheel=not no_wheel,
        )
    except (AppNotRunnable, NotPackageable) as refused:
        for problem in refused.problems:
            console.print(f"[red]✗[/red] {problem}", highlight=False)
        raise typer.Exit(1)
    carried = (
        f" with {', '.join(packaged.files)}"
        if packaged.files
        else ", no file of its folder"
    )
    console.print(
        f"[green]✓[/green] {packaged.name} written to {packaged.project}{carried}.",
        highlight=False,
    )
    if packaged.wheel is not None:
        console.print(
            f"[green]✓[/green] {packaged.wheel} built: pip install {packaged.wheel}",
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
    base_url: str,
    document: Dict[str, Any],
    organization: Optional[str] = None,
    a2a_url: Optional[str] = None,
    visitors: bool = False,
    visitors_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Configure a runtime with an application; its refusal said in sentences.

    With ``organization``, the runtime reads the plugins it turned off and the
    contexts its agent keeps to (LOOP C-12, U-31) with the caller's token.
    With ``a2a_url``, the runtime's address as its callers reach it, it also
    serves the application over A2A, to the members of its team. With
    ``visitors``, that A2A route also answers visitors without an account
    (LOOP R-30), their runs acting with ``visitors_key`` when given.
    """
    import httpx

    if (visitors or visitors_key) and a2a_url is None:
        raise typer.BadParameter(
            "--visitors is a way of serving it over A2A: add --a2a."
        )
    if visitors_key and not visitors:
        raise typer.BadParameter(
            "--visitors-key is for an application open to visitors: add --visitors."
        )
    body: Dict[str, Any] = {"app": document}
    if a2a_url is not None:
        body["a2a"] = True
        body["public_url"] = a2a_url
    if visitors:
        body["visitors"] = True
    if visitors_key:
        body["visitors_key"] = visitors_key
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
    runtime: str = typer.Option(
        None,
        "--runtime",
        "-r",
        help="A running Datalayer runtime to run it on, by its uid or name (with --cloud).",
    ),
    a2a: bool = typer.Option(
        False,
        "--a2a",
        help=(
            "Serve it over A2A to the members of its team, and wait: its address and its "
            "agent card are printed, and the session is the runtime's, not the terminal's."
        ),
    ),
    visitors: bool = typer.Option(
        False,
        "--visitors",
        help=(
            "With --a2a: also answer visitors without an account (a visitor's token from "
            "ai-inference naming this application); their runs only read, a few a day each."
        ),
    ),
    visitors_key: str = typer.Option(
        None,
        "--visitors-key",
        help=(
            "With --visitors: the owner's key visitors' runs act with, a token from a task "
            "grant on this application's A2A route; unsaid, the runtime's own credential."
        ),
    ),
    web: bool = typer.Option(
        False,
        "--web",
        help=(
            "Serve it on this machine in a browser page, drawn by the embed — the hosted "
            "page's renderer — with its code and its agent in this process; with --watch, "
            "the page reloads when its file changes."
        ),
    ),
    host: str = typer.Option(
        "127.0.0.1", "--host", help="With --web: the address to serve it on."
    ),
    port: int = typer.Option(
        8000, "--port", help="With --web: the port to serve it on."
    ),
    headless: bool = typer.Option(
        False, "--headless", help="With --web: do not open the page in a browser."
    ),
    embed_origin: str = typer.Option(
        None,
        "--embed-origin",
        help="With --web: where the embed's script is loaded from; https://datalayer.ai by default.",
    ),
    embed_dir: Path = typer.Option(
        None,
        "--embed-dir",
        exists=True,
        file_okay=False,
        help="With --web: a build of the embed (agent-runtimes' dist-embed), served from here.",
    ),
) -> None:
    """Run an application in the terminal — here, or on Datalayer (LOOP L-05, P-08).

    With --web it is served in a browser page on this machine instead, at
    http://<host>:<port>/app, drawn by the same renderer as the hosted page
    (the embed); --watch then builds it again when a file of its folder
    changes and reloads the page.

    With --a2a it is served over A2A with fasta2a, at
    /api/v1/a2a/agents/<its id>/, to the members of a team that ask it
    (agentspecs `talks_to`), until Ctrl-C.

    The runtime is configured with the application, so its rules decide every
    tool call; its starters are the terminal's suggestions. An app.py is built
    first, and its code runs in this process: what it reacts to — start, a
    message, an action (/action <name> [json]), end when you leave — is its
    code's; a message it does not take is answered by the runtime's agent.
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

    if (visitors or visitors_key) and not a2a:
        console.print(
            "[red]✗[/red] --visitors is a way of serving it over A2A: add --a2a."
        )
        raise typer.Exit(1)
    if visitors_key and not visitors:
        console.print(
            "[red]✗[/red] --visitors-key is for an application open to visitors: add --visitors."
        )
        raise typer.Exit(1)

    try:
        built = _application_of(path)
        application = built.spec
    except AppNotRunnable as refused:
        for problem in refused.problems:
            console.print(f"[red]✗[/red] {problem}", highlight=False)
        raise typer.Exit(1)
    document = built.document
    has_code = is_python(path)
    if web:
        _serve_web(
            path,
            built,
            watch=watch,
            host=host,
            port=port,
            headless=headless,
            embed_origin=embed_origin,
            embed_dir=embed_dir,
            refused_with=[
                name
                for name, given in (
                    ("--cloud", cloud),
                    ("--ask", ask),
                    ("--a2a", a2a),
                    ("--runtime", runtime),
                    ("--organization", organization),
                    ("--keep", keep),
                )
                if given
            ],
        )
        return
    if application.team:
        console.print(
            "[red]✗[/red] An application run by a team cannot run in the terminal yet."
        )
        raise typer.Exit(1)

    import logging

    # The terminal is the conversation: no request log over it.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    if runtime and not cloud:
        console.print("[red]✗[/red] --runtime names a Datalayer runtime: add --cloud.")
        raise typer.Exit(1)
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
                runtime=runtime,
                status=lambda message: console.print(f"[cyan]{message}[/cyan]"),
                # Its connections' secrets given at launch (R-19).
                app_spec=dict(document),
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
        public_url = None
        if a2a:
            from agent_runtimes.client.agent_client import (
                build_agent_runtimes_base_url,
            )

            # The card names the address its callers reach: the runtime's
            # ingress, not the relay on this machine.
            public_url = (
                build_agent_runtimes_base_url(cloud_launch.ingress)
                if cloud_launch
                else base_url
            )
        try:
            configured = (
                configure_on(
                    base_url,
                    document,
                    organization,
                    a2a_url=public_url,
                    visitors=visitors,
                    visitors_key=visitors_key,
                )
                if a2a
                else configure_on(base_url, document, organization)
            )
        except typer.BadParameter as refused:
            if (
                cloud_launch is None
                or not cloud_launch.attached
                or "this runtime was not given" not in refused.message
            ):
                raise
            # A runtime attached to was not launched for the application: its
            # secrets are given at launch only (R-19), so the remedy is a
            # launch, not the account's secrets.
            from agent_runtimes.loop.launch import attached_refusal

            raise typer.BadParameter(
                f"{refused.message} "
                + attached_refusal(cloud_launch.runtime_name, application.name)
            ) from None
        if a2a:
            _serve_over_a2a(application, configured, cloud_launch)
            return
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
        if (
            ask
            and has_code
            and (built.handler("message") is not None or built.code_agent is not None)
        ):
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


def _serve_web(
    path: Path,
    built: Any,
    *,
    watch: bool,
    host: str,
    port: int,
    headless: bool,
    embed_origin: Optional[str],
    embed_dir: Optional[Path],
    refused_with: List[str],
) -> None:
    """`loop apps run --web`: the application in a browser page on this machine (LOOP P-08)."""
    import threading
    import webbrowser

    import uvicorn

    from agent_runtimes.loop.apps.mounting import EMBED_ORIGIN
    from agent_runtimes.loop.apps.serving import APP_PATH, HotReload, local_server

    if refused_with:
        console.print(
            f"[red]✗[/red] --web serves it on this machine, in a page: not with {', '.join(refused_with)}."
        )
        raise typer.Exit(1)
    if built.spec.team:
        console.print(
            "[red]✗[/red] An application run by a team cannot be served in a page yet."
        )
        raise typer.Exit(1)
    if embed_dir is not None and embed_origin:
        console.print(
            "[red]✗[/red] --embed-dir serves the embed from here: no --embed-origin with it."
        )
        raise typer.Exit(1)
    hot_reload = (
        HotReload(
            path,
            built,
            _application_of,
            say=lambda line: console.print(f"[cyan]↻[/cyan] {line}", highlight=False),
        )
        if watch
        else None
    )
    try:
        api = local_server(
            built,
            hot_reload=hot_reload,
            embed_origin=""
            if embed_dir is not None
            else (embed_origin or EMBED_ORIGIN),
            embed_dir=embed_dir,
        )
    except ValueError as refused:
        console.print(f"[red]✗[/red] {refused}", highlight=False)
        raise typer.Exit(1)
    address = f"http://{host}:{port}{APP_PATH}"
    console.print(
        f"{built.spec.emoji}  {built.spec.name} is served on this machine at {address}"
        + (
            f", reloaded when a file of {path.parent.resolve()} changes"
            if watch
            else ""
        )
        + ". Ctrl-C stops it.",
        highlight=False,
    )
    if not headless:
        threading.Timer(1.5, lambda: webbrowser.open(address)).start()
    uvicorn.run(api, host=host, port=port, log_level="warning")


def _serve_over_a2a(
    application: Any, configured: Dict[str, Any], cloud_launch: Any
) -> None:
    """Say where the application is served over A2A, and wait until Ctrl-C."""
    import time

    served = configured.get("a2a") or {}
    for note in configured.get("setup") or []:
        console.print(f"[yellow]•[/yellow] {note}")
    where = (
        f"on Datalayer ({cloud_launch.runtime_name})"
        if cloud_launch
        else "on this machine"
    )
    console.print(
        f"{application.emoji}  {application.name} is served over A2A {where}.",
        highlight=False,
    )
    console.print(f"  A2A:  {served.get('url', '')}", highlight=False)
    console.print(f"  Card: {served.get('card', '')}", highlight=False)
    opened = served.get("visitors")
    if opened:
        console.print(
            f"  Open to visitors: {opened.get('turns_a_visitor')} runs a visitor, "
            f"{opened.get('turns_a_day')} in all a day, acting with "
            f"{opened.get('acts_with')}.",
            highlight=False,
        )
    if cloud_launch:
        console.print(
            f"  A key granted to it names the task {served.get('task', '')}…: "
            f"examples/sales-accounting-a2a/make_temp_key.py --runtime {cloud_launch.runtime_name}",
            highlight=False,
        )
    else:
        console.print("  From this machine it needs no key.", highlight=False)
    console.print("Ctrl-C to stop serving.", highlight=False)
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pass


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
    visibility: str = typer.Option(
        None,
        "--visibility",
        help="Who may open it: private, link or public (as the Ship tab says it).",
    ),
    always_on: bool = typer.Option(
        None,
        "--always-on/--not-always-on",
        help="Keep it on a runtime of its own, paid by you, within --spend-limit.",
    ),
    spend_limit: float = typer.Option(
        None,
        "--spend-limit",
        min=0,
        help="The most it may spend in a day, in credits.",
    ),
    a2a: bool = typer.Option(
        None,
        "--a2a/--no-a2a",
        help=(
            "Kept always on, serve it over A2A at its stable address, "
            "/api/ai-agents/v1/apps/deployments/at/<slug>/a2a/ (STUDIO A-08)."
        ),
    ),
    visitors: bool = typer.Option(
        None,
        "--visitors/--no-visitors",
        help="Served over A2A and open to anyone with the link: visitors may ask it too.",
    ),
) -> None:
    """Deploy a version at the application's hosted address (LOOP S-06).

    The deployment the Studio's Ship tab shows: deploying another version
    moves it, and deploying a paused one resumes it. Prints the address and
    the snippet that embeds it. With --visibility, --always-on,
    --spend-limit, --a2a or --visitors, the deployment is then changed as
    the Ship tab would change it, and where it answers over A2A is printed.
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
    if visibility is not None and visibility not in ("private", "link", "public"):
        console.print(
            "[red]✗[/red] --visibility is private, link or public; invite people in the Ship tab."
        )
        raise typer.Exit(1)
    deployments = Deployments(
        client.urls.spacer_url,
        token,
        ai_agents_url=client.urls.ai_agents_url,
    )
    try:
        deployment, done = deploy(
            deployments,
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
    changes = {
        "visibility": visibility,
        "always_on": always_on,
        "spend_limit": spend_limit,
        "a2a": a2a,
        "a2a_visitors": visitors,
    }
    if any(value is not None for value in changes.values()):
        try:
            changed = deployments.change(deployment.uid, **changes)
            kept = deployments.kept(deployment.uid)
        except (DeployRefused, httpx.HTTPError) as refused:
            console.print(f"[red]✗[/red] {refused}")
            raise typer.Exit(1)
        state = (kept.get("kept") or {}).get("state") or "off"
        why = (kept.get("kept") or {}).get("why") or ""
        console.print(
            f"  Open to: {changed.get('visibility', 'private')}; always on: "
            f"{'yes' if kept.get('always_on') else 'no'} ({state}{': ' + why if why else ''}); "
            f"limit {kept.get('limit')} credits a day.",
            highlight=False,
        )
        served = kept.get("a2a") or {}
        if served.get("url"):
            console.print(
                f"  A2A: {served['url']}"
                + ("  (open to visitors)" if served.get("visitors") else ""),
                highlight=False,
            )
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
    file, and `push` saves it back. An application written in Python has its
    app.py written beside it, as its item keeps it (LOOP P-10): the file to
    edit and push.
    """
    import httpx

    from agent_runtimes.loop.apps.deployments import DeployRefused
    from agent_runtimes.loop.apps.store import pull

    out = path or Path("app.yaml")
    try:
        text, version, code = pull(_store(), app_uid)
    except (DeployRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    written = [out] + ([out.parent / Path(code["file"]).name] if code else [])
    there = [str(file) for file in written if file.exists()]
    if there and not force:
        console.print(
            f"[red]✗[/red] {', '.join(there)} "
            f"{'is' if len(there) == 1 else 'are'} there already; --force overwrites."
        )
        raise typer.Exit(1)
    out.write_text(text)
    if code:
        written[1].write_text(code["text"])
        console.print(
            f"[green]✓[/green] Version {version} written to {written[1]}, "
            f"and the spec it builds to {out}."
        )
        return
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
    version, and the one left behind is kept; the same one is not. An app.py
    is kept in the application's item beside the spec it builds, and a
    changed app.py is the next version too (LOOP P-10).
    """
    import httpx

    from agent_runtimes.loop.apps.deployments import DeployRefused
    from agent_runtimes.loop.apps.store import push

    report = validate_file(path)
    if report.verdict == NOT_READY:
        for problem in report.problems:
            console.print(f"[red]✗[/red] {problem}")
        raise typer.Exit(1)
    from agent_runtimes.loop.apps.build import is_python

    # An app.py is kept beside the spec it builds, versioned with it (P-10).
    code = {"file": path.name, "text": path.read_text()} if is_python(path) else None
    try:
        version, done = push(_store(), app_uid, _spec_text(path), code=code)
    except (DeployRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    said = {
        "saved": f"Saved as version {version}; the one before is kept.",
        "rewritten": f"Saved; still version {version}, the specification is the same.",
        "unchanged": f"Nothing to save: version {version} is this file.",
    }[done]
    console.print(f"[green]✓[/green] {said}")


def _ai_agents() -> Any:
    """A client of ai-agents as the caller, or a said exit."""
    import logging

    import httpx

    from agent_runtimes.loop.launch import NotSignedIn, make_client

    logging.getLogger("httpx").setLevel(logging.WARNING)
    try:
        client, token = make_client()
    except NotSignedIn as refused:
        console.print(f"[red]✗[/red] {refused} Sign in with `datalayer login`.")
        raise typer.Exit(1)
    return httpx.Client(
        base_url=str(client.urls.ai_agents_url).rstrip("/"),
        headers={"Authorization": f"Bearer {token}"},
        timeout=20.0,
    )


@app.command(name="threads")
def apps_threads(
    app_uid: Optional[str] = typer.Argument(
        None, help="One application's, by its id; every one otherwise."
    ),
    search: str = typer.Option(
        "", "--search", "-s", help="Only those whose title or questions say it."
    ),
    tag: str = typer.Option("", "--tag", help="Only those that carry this tag."),
    limit: int = typer.Option(50, "--limit", min=1, max=1000),
) -> None:
    """List your conversations with an application, newest first (LOOP P-24).

    Each under its title — yours, else the one its code gave it, else your
    first question — with its turns, tags and id: the id `loop apps
    feedback` takes.
    """
    import httpx

    from agent_runtimes.loop.apps.threads import (
        ThreadsRefused,
        list_threads,
        thread_line,
    )

    try:
        with _ai_agents() as client:
            threads = list_threads(
                client, app_uid=app_uid, search=search, tag=tag, limit=limit
            )
    except (ThreadsRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    if not threads:
        console.print(
            "No conversation found."
            if search or tag
            else "You had no conversation yet."
        )
        return
    for thread in threads:
        console.print(thread_line(thread), markup=False)


@app.command(name="feedback")
def apps_feedback(
    session_uid: str = typer.Argument(
        ..., help="The conversation, by its id (`loop apps threads`)."
    ),
) -> None:
    """List what people said of a conversation's answers (LOOP V-18, P-24).

    Read from its application's record, which its owner reads: each thumb,
    the answer it is about, who said it and their comment, oldest first.
    """
    import httpx

    from agent_runtimes.loop.apps.threads import (
        ThreadsRefused,
        feedback_line,
        thread_feedback,
    )

    try:
        with _ai_agents() as client:
            said = thread_feedback(client, session_uid)
    except (ThreadsRefused, httpx.HTTPError) as refused:
        console.print(f"[red]✗[/red] {refused}")
        raise typer.Exit(1)
    if not said:
        console.print(f"Nothing was said of {session_uid}'s answers.")
        return
    for each in said:
        console.print(feedback_line(each), markup=False)
