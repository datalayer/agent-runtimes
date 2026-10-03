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
