# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Evals commands for Datalayer CLI."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Optional

import typer
from rich.console import Console
from rich.table import Table
from rich.tree import Tree

from agent_runtimes.evals.saas.evals import (
    load_evalset_spec,
)
from agent_runtimes.evals.saas.evals import (
    make_client as _make_client,
)
from agent_runtimes.evals.saas.evals import (
    merge_dicts as _merge_dicts,
)
from agent_runtimes.evals.saas.evals import (
    parse_json_file as _parse_json_file,
)
from agent_runtimes.evals.saas.evals import (
    parse_json_value as _parse_json_value,
)
from agent_runtimes.evals.saas.evals import (
    resolve_billable_account_uid as _resolve_billable_account_uid,
)
from agent_runtimes.evals.saas.evaluators import evaluate_evalset
from agent_runtimes.evals.saas.report import (
    _now_iso,
    _parse_csv_values,
    _parse_evaluator_specs,
    _print_report_console,
    _report_data,
    _report_markdown,
    _status_style,
    _timestamp_slug,
    _write_report_csv,
)

app = typer.Typer(
    name="evals",
    help="Launch and monitor SaaS evalsets, experiments, runs, and live monitoring.",
    invoke_without_command=True,
)

evals_app = typer.Typer(name="evalsets", help="Manage evalsets.")
experiments_app = typer.Typer(name="experiments", help="Manage evalset experiments.")
runs_app = typer.Typer(name="runs", help="Launch and monitor evalset runs.")
live_app = typer.Typer(name="live", help="Inspect live evalset monitoring.")

console = Console()


@app.callback()
def evals_callback(ctx: typer.Context) -> None:
    """Show evals command group help."""
    if ctx.invoked_subcommand is None:
        typer.echo(ctx.get_help())


@app.command(name="ls")
def evals_ls(
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    run_environment: Optional[str] = typer.Option(
        None, "--run-environment", help="Filter by run environment (ui/sdk)."
    ),
    kind: Optional[str] = typer.Option(
        None, "--kind", help="Filter by kind (batch/interactive)."
    ),
    q: Optional[str] = typer.Option(None, "--q", help="Search query."),
    limit: int = typer.Option(50, "--limit", min=1, max=200),
    offset: int = typer.Option(0, "--offset", min=0),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """List all evalsets and their experiments."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    evalsets_payload = client.evals_list_evals(
        run_environment=run_environment,
        kind=kind,
        q=q,
        limit=limit,
        offset=offset,
        account_uid=resolved_account_uid,
    )
    evalsets = [
        item
        for item in (evalsets_payload.get("evalsets") or [])
        if isinstance(item, dict)
    ]

    experiments_by_evalset: dict[str, list[dict[str, Any]]] = {}
    for evalset in evalsets:
        evalset_id = str(evalset.get("id", ""))
        if not evalset_id:
            continue
        experiments_payload = client.evals_list_experiments(
            evalset_id=evalset_id,
            limit=200,
            offset=0,
            account_uid=resolved_account_uid,
        )
        experiments_by_evalset[evalset_id] = [
            item
            for item in (experiments_payload.get("experiments") or [])
            if isinstance(item, dict)
        ]

    if raw:
        console.print(
            {
                "evalsets": evalsets,
                "experiments": experiments_by_evalset,
            }
        )
        return

    total_experiments = sum(len(items) for items in experiments_by_evalset.values())
    tree = Tree(
        f"[bold]Evals[/bold] ([cyan]{len(evalsets)}[/cyan] evalsets, "
        f"[cyan]{total_experiments}[/cyan] experiments)"
    )
    for evalset in evalsets:
        evalset_id = str(evalset.get("id", ""))
        evalset_node = tree.add(
            f"[cyan]{evalset_id}[/cyan] [white]{evalset.get('name', '')}[/white] "
            f"(env={evalset.get('run_environment', '')}, "
            f"kind={evalset.get('kind', '')}, "
            f"cases={len(evalset.get('cases') or [])})"
        )
        experiments = experiments_by_evalset.get(evalset_id, [])
        if not experiments:
            evalset_node.add("[dim]no experiments[/dim]")
            continue
        for experiment in experiments:
            status_value = str(experiment.get("status", ""))
            evalset_node.add(
                f"[cyan]{experiment.get('id', '')}[/cyan] "
                f"[white]{experiment.get('name', '')}[/white] "
                f"[{_status_style(status_value)}]{status_value}[/{_status_style(status_value)}]"
            )
    console.print(tree)


@app.command(name="delete")
def evals_delete_top(
    evalset_id: str = typer.Argument(..., help="Evalset UID to delete."),
    yes: bool = typer.Option(
        False, "--yes", "-y", help="Skip the confirmation prompt."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
) -> None:
    """Delete an evalset and its associated experiments, runs, and cases."""
    if not yes:
        typer.confirm(
            f"Delete evalset {evalset_id} and all associated experiments, runs, and cases?",
            abort=True,
        )
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_delete_eval(evalset_id, account_uid=resolved_account_uid)
    cascade = payload.get("cascade") or {}
    console.print(
        f"[green]Eval deleted:[/green] {evalset_id} "
        f"(experiments={cascade.get('experiments_deleted', 0)}, "
        f"runs={cascade.get('runs_deleted', 0)}, "
        f"cases={cascade.get('cases_deleted', 0)})"
    )


@evals_app.command(name="ls")
def evals_list(
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    run_environment: Optional[str] = typer.Option(
        None, "--run-environment", help="Filter by run environment (ui/sdk)."
    ),
    kind: Optional[str] = typer.Option(
        None, "--kind", help="Filter by kind (batch/interactive)."
    ),
    q: Optional[str] = typer.Option(None, "--q", help="Search query."),
    limit: int = typer.Option(50, "--limit", min=1, max=200),
    offset: int = typer.Option(0, "--offset", min=0),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """List evalsets."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_list_evals(
        run_environment=run_environment,
        kind=kind,
        q=q,
        limit=limit,
        offset=offset,
        account_uid=resolved_account_uid,
    )
    if raw:
        console.print(payload)
        return

    evalsets = payload.get("evalsets") or []
    table = Table(title=f"Evals ({len(evalsets)})")
    table.add_column("ID", style="cyan")
    table.add_column("Name", style="white")
    table.add_column("Run Environment", style="white")
    table.add_column("Kind", style="white")
    table.add_column("Cases", style="white")
    table.add_column("Updated", style="white")
    for item in evalsets:
        table.add_row(
            str(item.get("id", "")),
            str(item.get("name", "")),
            str(item.get("run_environment", "")),
            str(item.get("kind", "")),
            str(len(item.get("cases") or [])),
            str(item.get("updated_at", "")),
        )
    console.print(table)


@evals_app.command(name="create")
def evals_create(
    name: Optional[str] = typer.Argument(None, help="Evalset name."),
    description: Optional[str] = typer.Option(
        None, "--description", help="Evalset description."
    ),
    run_environment: Optional[str] = typer.Option(
        None, "--run-environment", help="Evalset run environment (ui/sdk)."
    ),
    kind: Optional[str] = typer.Option(
        None, "--kind", help="Evalset kind (batch/interactive)."
    ),
    spec_file: Optional[str] = typer.Option(
        None, "--spec-file", help="Path to evalset spec JSON file."
    ),
    schema_json: Optional[str] = typer.Option(
        None, "--schema-json", help="Schema JSON object."
    ),
    metadata_json: Optional[str] = typer.Option(
        None, "--metadata-json", help="Metadata JSON object."
    ),
    cases_file: Optional[str] = typer.Option(
        None, "--cases-file", help="Path to JSON array of cases."
    ),
    evalset_evaluator_json: list[str] = typer.Option(
        [],
        "--evalset-evaluator-json",
        help="Repeatable JSON object applied as an evalset-level evaluator for the evalset.",
    ),
    report_evaluator_json: list[str] = typer.Option(
        [],
        "--report-evaluator-json",
        help="Repeatable JSON object applied as a report-level evaluator for the evalset.",
    ),
    case_evaluator_json: list[str] = typer.Option(
        [],
        "--case-evaluator-json",
        help="Repeatable JSON object applied as a case evaluator to every case in the payload.",
    ),
    tags: list[str] = typer.Option([], "--tag", help="Repeatable tag."),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """Create an evalset."""
    spec = _parse_json_file(spec_file, "--spec-file")
    schema = _merge_dicts(
        spec.get("schema") if isinstance(spec.get("schema"), dict) else {},
        _parse_json_value(schema_json, "--schema-json"),
    )
    metadata = _merge_dicts(
        spec.get("metadata") if isinstance(spec.get("metadata"), dict) else {},
        _parse_json_value(metadata_json, "--metadata-json"),
    )

    cases: list[dict[str, Any]] = []
    if isinstance(spec.get("cases"), list):
        cases = [case for case in spec.get("cases") if isinstance(case, dict)]
    if cases_file:
        text = Path(cases_file).read_text(encoding="utf-8")
        decoded = json.loads(text)
        if not isinstance(decoded, list):
            raise typer.BadParameter("--cases-file must contain a JSON array")
        cases = [case for case in decoded if isinstance(case, dict)]

    evalset_evaluators = [
        item
        for item in (spec.get("evalset_evaluators") or [])
        if isinstance(item, dict)
    ]
    report_evaluators = [
        item for item in (spec.get("report_evaluators") or []) if isinstance(item, dict)
    ]
    evalset_evaluators.extend(
        _parse_evaluator_specs(evalset_evaluator_json, "--evalset-evaluator-json")
    )
    report_evaluators.extend(
        _parse_evaluator_specs(report_evaluator_json, "--report-evaluator-json")
    )

    default_case_evaluators = _parse_evaluator_specs(
        case_evaluator_json,
        "--case-evaluator-json",
    )
    if default_case_evaluators:
        for case in cases:
            existing = case.get("evaluators")
            if isinstance(existing, list):
                case["evaluators"] = [
                    item for item in existing if isinstance(item, dict)
                ] + default_case_evaluators
            else:
                case["evaluators"] = list(default_case_evaluators)

    resolved_name = str(name or spec.get("name") or "").strip()
    if not resolved_name:
        raise typer.BadParameter(
            "name argument is required unless provided in --spec-file"
        )
    resolved_description = str(
        description if description is not None else spec.get("description") or ""
    )
    resolved_run_environment = str(
        run_environment
        if run_environment is not None
        else spec.get("run_environment") or "sdk"
    )
    resolved_kind = str(kind if kind is not None else spec.get("kind") or "batch")

    spec_tags = spec.get("tags") if isinstance(spec.get("tags"), list) else []
    resolved_tags = (
        tags if tags else [str(tag) for tag in spec_tags if str(tag).strip()]
    )

    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_create_eval(
        name=resolved_name,
        description=resolved_description,
        run_environment=resolved_run_environment,
        kind=resolved_kind,
        schema=schema,
        evalset_evaluators=evalset_evaluators,
        report_evaluators=report_evaluators,
        metadata=metadata,
        tags=resolved_tags,
        cases=cases,
        account_uid=resolved_account_uid,
    )
    if raw:
        typer.echo(json.dumps(payload))
        return
    eval_record = payload.get("evalset") or {}
    console.print(
        f"[green]Eval created:[/green] {eval_record.get('id', '')} ({eval_record.get('name', '')})"
    )


@evals_app.command(name="delete")
def evals_delete(
    evalset_id: str = typer.Argument(..., help="Evalset ID."),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
) -> None:
    """Delete an evalset (cascade delete runs/experiments)."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_delete_eval(evalset_id, account_uid=resolved_account_uid)
    cascade = payload.get("cascade") or {}
    console.print(
        "[green]Eval deleted.[/green] "
        f"experiments={cascade.get('experiments_deleted', 0)} "
        f"runs={cascade.get('runs_deleted', 0)} "
        f"cases={cascade.get('cases_deleted', 0)}"
    )


def _render_report(
    evalset_id: Optional[str],
    run_limit: int = typer.Option(
        50, "--run-limit", min=2, max=200, help="Runs fetched per experiment."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    output_file: Optional[str] = typer.Option(
        None, "--output", help="Write markdown report to file."
    ),
    export: bool = typer.Option(
        False,
        "--export",
        help="Export timestamped report files report-<timestamp>.md and report-<timestamp>.csv.",
    ),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON report output."),
) -> None:
    """Generate a full evalset report with cross-experiment comparisons."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    resolved_evalset_id = (evalset_id or "").strip()
    if not resolved_evalset_id:
        payload = client.evals_list_evals(
            limit=200,
            offset=0,
            account_uid=resolved_account_uid,
        )
        evalsets = [
            item for item in (payload.get("evalsets") or []) if isinstance(item, dict)
        ]
        if not evalsets:
            raise typer.BadParameter(
                "No evalsets found. Provide <evalset_id> explicitly."
            )

        def _updated_key(item: dict[str, Any]) -> str:
            return str(item.get("updated_at") or item.get("created_at") or "")

        latest_evalset = max(evalsets, key=_updated_key)
        resolved_evalset_id = str(latest_evalset.get("id") or "").strip()
        if not resolved_evalset_id:
            raise typer.BadParameter("Latest evalset does not contain an id.")
        console.print(
            f"[yellow]No evalset id provided.[/yellow] Using latest evalset: "
            f"[cyan]{resolved_evalset_id}[/cyan]"
        )

    report = _report_data(
        client=client,
        evalset_id=resolved_evalset_id,
        run_limit=run_limit,
        account_uid=resolved_account_uid,
    )
    experiments = report.get("experiments") or []
    if not experiments:
        console.print(
            f"[yellow]No experiments found for evalset[/yellow] {resolved_evalset_id}"
        )
        raise typer.Exit(0)

    if raw:
        console.print(report)
        return

    markdown_report = _report_markdown(report, run_limit=run_limit, colorize=False)
    if export:
        timestamp = _timestamp_slug(str(report.get("generated_at", _now_iso())))
        export_markdown_path = Path(f"report-{timestamp}.md")
        export_csv_path = Path(f"report-{timestamp}.csv")
        export_markdown_path.write_text(markdown_report + "\n", encoding="utf-8")
        _write_report_csv(report, export_csv_path)
        console.print(f"[green]Markdown export written:[/green] {export_markdown_path}")
        console.print(f"[green]CSV export written:[/green] {export_csv_path}")
    if output_file:
        output_path = Path(output_file)
        output_path.write_text(markdown_report + "\n", encoding="utf-8")
        console.print(f"[green]Report written:[/green] {output_path}")
    _print_report_console(report, run_limit=run_limit)


@app.command(name="report")
def evals_report(
    evalset_id: Optional[str] = typer.Argument(
        None, help="Evalset ID to report. Defaults to latest updated evalset."
    ),
    run_limit: int = typer.Option(
        50, "--run-limit", min=2, max=200, help="Runs fetched per experiment."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    output_file: Optional[str] = typer.Option(
        None, "--output", help="Write markdown report to file."
    ),
    export: bool = typer.Option(
        False,
        "--export",
        help="Export timestamped report files report-<timestamp>.md and report-<timestamp>.csv.",
    ),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON report output."),
) -> None:
    """Generate an evalset report in markdown with comparison combinations and ASCII plots."""
    _render_report(
        evalset_id=evalset_id,
        run_limit=run_limit,
        token=token,
        billable_account_uid=billable_account_uid,
        account_uid=account_uid,
        output_file=output_file,
        export=export,
        raw=raw,
    )


@app.command(name="evaluate")
def evals_evaluate(
    evalset_spec: str = typer.Argument(
        ..., help="Path to an evalset spec JSON file (with cases and evaluators)."
    ),
    outputs_file: str = typer.Option(
        ...,
        "--outputs",
        help='JSON file of agent outputs aligned with the evalset cases (list of strings or {text} objects, or {"outputs": [...]}).',
    ),
    statuses_file: Optional[str] = typer.Option(
        None,
        "--statuses",
        help="Optional JSON file of per-case run statuses aligned with cases.",
    ),
    output_file: Optional[str] = typer.Option(
        None, "--output", help="Write the computed metrics JSON to this file."
    ),
    raw: bool = typer.Option(False, "--raw", help="Print the full metrics JSON."),
) -> None:
    """Run per-case and global evaluators over real agent outputs.

    Grades the provided outputs against an evalset spec using the shared evals
    API (``agent_runtimes.evals.saas.evaluate_evalset``) and emits run metrics
    (``case_results`` + ``evaluator_results``). Callers produce outputs and
    delegate all evaluator execution here instead of re-implementing it.
    """
    spec = load_evalset_spec(evalset_spec, require_cases=True)
    outputs_payload = json.loads(Path(outputs_file).read_text(encoding="utf-8"))
    if isinstance(outputs_payload, dict) and "outputs" in outputs_payload:
        outputs = outputs_payload["outputs"]
    else:
        outputs = outputs_payload
    if not isinstance(outputs, list):
        raise typer.BadParameter(
            '--outputs must be a JSON list (or {"outputs": [...]}).'
        )
    statuses: Optional[list] = None
    if statuses_file:
        statuses_payload = json.loads(Path(statuses_file).read_text(encoding="utf-8"))
        if isinstance(statuses_payload, dict) and "statuses" in statuses_payload:
            statuses_payload = statuses_payload["statuses"]
        if statuses_payload is not None and not isinstance(statuses_payload, list):
            raise typer.BadParameter("--statuses must be a JSON list.")
        statuses = statuses_payload

    metrics = evaluate_evalset(spec, outputs, statuses=statuses)

    if output_file:
        Path(output_file).write_text(
            json.dumps(metrics, indent=2) + "\n", encoding="utf-8"
        )
        console.print(f"[green]Metrics written:[/green] {output_file}")

    if raw:
        console.print_json(json.dumps(metrics))
        return

    summary = Table(title="Eval Metrics")
    summary.add_column("Metric", style="cyan")
    summary.add_column("Value", style="white")
    summary.add_row("Pass rate", f"{float(metrics.get('pass_rate', 0.0)):.2%}")
    summary.add_row("Cases", str(metrics.get("total_cases", 0)))
    summary.add_row("Passed", str(metrics.get("passed", 0)))
    summary.add_row("Failed", str(metrics.get("failed", 0)))
    summary.add_row("Avg score", f"{float(metrics.get('avg_score', 0.0)):.4f}")
    console.print(summary)

    evaluator_results = metrics.get("evaluator_results") or []
    if evaluator_results:
        evaluators_table = Table(title="Evaluator Results")
        evaluators_table.add_column("Evaluator", style="cyan")
        evaluators_table.add_column("Scope", style="white")
        evaluators_table.add_column("Score", style="white")
        evaluators_table.add_column("Passed", style="white")
        evaluators_table.add_column("Summary", style="white")
        for item in evaluator_results:
            if not isinstance(item, dict):
                continue
            score = item.get("score")
            passed = bool(item.get("passed"))
            evaluators_table.add_row(
                str(item.get("name", "")),
                str(item.get("scope", "")),
                "n/a" if score is None else f"{float(score):.4f}",
                f"[{'green' if passed else 'red'}]{'pass' if passed else 'fail'}[/{'green' if passed else 'red'}]",
                str(item.get("summary", "")),
            )
        console.print(evaluators_table)


@experiments_app.command(name="ls")
def experiments_list(
    evalset_id: Optional[str] = typer.Option(
        None, "--evalset-id", help="Filter by evalset ID."
    ),
    status: Optional[str] = typer.Option(None, "--status", help="Filter by status."),
    limit: int = typer.Option(50, "--limit", min=1, max=200),
    offset: int = typer.Option(0, "--offset", min=0),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """List evalset experiments."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_list_experiments(
        evalset_id=evalset_id,
        status=status,
        limit=limit,
        offset=offset,
        account_uid=resolved_account_uid,
    )
    if raw:
        console.print(payload)
        return
    experiments = payload.get("experiments") or []
    table = Table(title=f"Eval Experiments ({len(experiments)})")
    table.add_column("ID", style="cyan")
    table.add_column("Name", style="white")
    table.add_column("Eval", style="white")
    table.add_column("Status", style="white")
    table.add_column("Updated", style="white")
    for item in experiments:
        status_value = str(item.get("status", ""))
        table.add_row(
            str(item.get("id", "")),
            str(item.get("name", "")),
            str(item.get("evalset_id", "")),
            f"[{_status_style(status_value)}]{status_value}[/{_status_style(status_value)}]",
            str(item.get("updated_at", "")),
        )
    console.print(table)


@experiments_app.command(name="create")
def experiments_create(
    name: Optional[str] = typer.Argument(None, help="Experiment name."),
    evalset_id: Optional[str] = typer.Option(None, "--evalset-id", help="Evalset ID."),
    description: Optional[str] = typer.Option(
        None, "--description", help="Description."
    ),
    status: Optional[str] = typer.Option(None, "--status", help="Initial status."),
    spec_file: Optional[str] = typer.Option(
        None, "--spec-file", help="Path to experimentspec JSON file."
    ),
    agent_spec_id: Optional[str] = typer.Option(
        None, "--agent-spec-id", help="Single agentspec id."
    ),
    agent_spec_ids: Optional[str] = typer.Option(
        None,
        "--agent-spec-ids",
        help="Comma-separated agentspec ids for multi-experiment creation.",
    ),
    config_json: Optional[str] = typer.Option(
        None, "--config-json", help="Config JSON object."
    ),
    summary_json: Optional[str] = typer.Option(
        None, "--summary-json", help="Summary JSON object."
    ),
    tags: list[str] = typer.Option([], "--tag", help="Repeatable tag."),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """Create an evalset experiment."""
    spec = _parse_json_file(spec_file, "--spec-file")

    resolved_name = str(name or spec.get("name") or "").strip()
    if not resolved_name:
        raise typer.BadParameter(
            "name argument is required unless provided in --spec-file"
        )
    resolved_evalset_id = (
        str(evalset_id or spec.get("evalset_id") or "").strip() or None
    )
    resolved_description = str(
        description if description is not None else spec.get("description") or ""
    )
    resolved_status = str(
        status if status is not None else spec.get("status") or "draft"
    )
    resolved_config = _merge_dicts(
        spec.get("config") if isinstance(spec.get("config"), dict) else {},
        _parse_json_value(config_json, "--config-json"),
    )
    resolved_summary = _merge_dicts(
        spec.get("summary") if isinstance(spec.get("summary"), dict) else {},
        _parse_json_value(summary_json, "--summary-json"),
    )
    spec_tags = spec.get("tags") if isinstance(spec.get("tags"), list) else []
    resolved_tags = (
        tags if tags else [str(tag) for tag in spec_tags if str(tag).strip()]
    )

    selected_agent_specs = _parse_csv_values(agent_spec_ids)
    if agent_spec_id:
        selected_agent_specs = [str(agent_spec_id).strip(), *selected_agent_specs]
    selected_agent_specs = [
        value for value in _parse_csv_values(",".join(selected_agent_specs)) if value
    ]

    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payloads: list[dict[str, Any]] = []
    targets = selected_agent_specs or [""]
    for spec_index, target_agent_spec_id in enumerate(targets, start=1):
        config_payload = dict(resolved_config)
        summary_payload = dict(resolved_summary)
        experiment_name = resolved_name
        if target_agent_spec_id:
            config_payload["agent_spec_id"] = target_agent_spec_id
            if not str(config_payload.get("agent_spec_name") or "").strip():
                config_payload["agent_spec_name"] = target_agent_spec_id
            summary_payload["agent_spec_id"] = target_agent_spec_id
            if not str(summary_payload.get("agent_spec_name") or "").strip():
                summary_payload["agent_spec_name"] = str(
                    config_payload.get("agent_spec_name") or target_agent_spec_id
                )
            if len(targets) > 1:
                experiment_name = f"{resolved_name}-{target_agent_spec_id}"
                summary_payload["agentspec_variant_index"] = spec_index

        payload = client.evals_create_experiment(
            name=experiment_name,
            evalset_id=resolved_evalset_id,
            description=resolved_description,
            status=resolved_status,
            config=config_payload,
            summary=summary_payload,
            tags=resolved_tags,
            account_uid=resolved_account_uid,
        )
        payloads.append(payload)

    if raw:
        typer.echo(
            json.dumps({"experiments": [item.get("experiment") for item in payloads]})
        )
        return

    if len(payloads) == 1:
        experiment = payloads[0].get("experiment") or {}
        console.print(
            f"[green]Experiment created:[/green] {experiment.get('id', '')} ({experiment.get('name', '')})"
        )
        return

    table = Table(title=f"Experiments Created ({len(payloads)})")
    table.add_column("ID", style="cyan")
    table.add_column("Name", style="white")
    table.add_column("Agentspec", style="white")
    for payload in payloads:
        experiment = payload.get("experiment") or {}
        config = (
            experiment.get("config")
            if isinstance(experiment.get("config"), dict)
            else {}
        )
        table.add_row(
            str(experiment.get("id", "")),
            str(experiment.get("name", "")),
            str(config.get("agent_spec_id") or "-"),
        )
    console.print(table)


@runs_app.command(name="ls")
def runs_list(
    experiment_id: str = typer.Option(..., "--experiment-id", help="Experiment ID."),
    limit: int = typer.Option(50, "--limit", min=1, max=200),
    offset: int = typer.Option(0, "--offset", min=0),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """List runs for an experiment."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_list_runs(
        experiment_id,
        limit=limit,
        offset=offset,
        account_uid=resolved_account_uid,
    )
    if raw:
        console.print(payload)
        return
    runs = payload.get("runs") or []
    table = Table(title=f"Eval Runs ({len(runs)})")
    table.add_column("Run", style="cyan")
    table.add_column("Status", style="white")
    table.add_column("Pass Rate", style="white")
    table.add_column("Run Environment", style="white")
    table.add_column("Created", style="white")
    for run in runs:
        status_value = str(run.get("status", ""))
        metrics = run.get("metrics") or {}
        summary = run.get("summary") or {}
        pass_rate = metrics.get("pass_rate")
        if isinstance(pass_rate, (float, int)):
            pass_rate_text = f"{float(pass_rate) * 100:.1f}%"
        else:
            pass_rate_text = "n/a"
        run_environment = str(
            summary.get("run_environment") or summary.get("launch_source") or ""
        )
        table.add_row(
            str(run.get("id", "")),
            f"[{_status_style(status_value)}]{status_value}[/{_status_style(status_value)}]",
            pass_rate_text,
            run_environment,
            str(run.get("created_at", "")),
        )
    console.print(table)


@runs_app.command(name="launch")
def runs_launch(
    experiment_id: str = typer.Option(..., "--experiment-id", help="Experiment ID."),
    status: str = typer.Option("queued", "--status", help="Initial run status."),
    run_mode: Optional[str] = typer.Option(
        None, "--run-mode", help="Run mode hint (batch/interactive)."
    ),
    agent_pod_name: Optional[str] = typer.Option(
        None, "--agent-pod-name", help="Agent pod for interactive execution."
    ),
    submitted_code_file: Optional[str] = typer.Option(
        None,
        "--submitted-code-file",
        help="Python file to execute in interactive mode.",
    ),
    evalset_evaluator_json: list[str] = typer.Option(
        [],
        "--evalset-evaluator-json",
        help="Repeatable JSON object for evalset-level evaluators attached to this run context.",
    ),
    report_evaluator_json: list[str] = typer.Option(
        [],
        "--report-evaluator-json",
        help="Repeatable JSON object for evalset-level report evaluators attached to this run context.",
    ),
    metrics_json: Optional[str] = typer.Option(
        None, "--metrics-json", help="Inline metrics JSON object."
    ),
    summary_json: Optional[str] = typer.Option(
        None, "--summary-json", help="Inline summary JSON object."
    ),
    report_json: Optional[str] = typer.Option(
        None, "--report-json", help="Inline report JSON object."
    ),
    metrics_file: Optional[str] = typer.Option(
        None, "--metrics-file", help="Path to metrics JSON object."
    ),
    summary_file: Optional[str] = typer.Option(
        None, "--summary-file", help="Path to summary JSON object."
    ),
    report_file: Optional[str] = typer.Option(
        None, "--report-file", help="Path to report JSON object."
    ),
    started_at: Optional[str] = typer.Option(
        None, "--started-at", help="ISO timestamp override."
    ),
    ended_at: Optional[str] = typer.Option(
        None, "--ended-at", help="ISO timestamp override."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
) -> None:
    """Launch an evalset run on SaaS and tag it as CLI-launched."""
    cli_summary: dict[str, Any] = {
        "launch_source": "datalayer-cli",
        "launched_at": _now_iso(),
    }
    if run_mode:
        cli_summary["run_mode"] = run_mode
    if agent_pod_name:
        cli_summary["runtime_pod_name"] = agent_pod_name
    if submitted_code_file:
        path = Path(submitted_code_file)
        if not path.exists():
            raise typer.BadParameter(
                f"submitted code file not found: {submitted_code_file}"
            )
        cli_summary["submitted_code"] = path.read_text(encoding="utf-8")

    evalset_evaluators = _parse_evaluator_specs(
        evalset_evaluator_json,
        "--evalset-evaluator-json",
    )
    report_evaluators = _parse_evaluator_specs(
        report_evaluator_json,
        "--report-evaluator-json",
    )
    if evalset_evaluators:
        cli_summary["evalset_evaluators"] = evalset_evaluators
    if report_evaluators:
        cli_summary["report_evaluators"] = report_evaluators

    metrics = _merge_dicts(
        _parse_json_file(metrics_file, "--metrics-file"),
        _parse_json_value(metrics_json, "--metrics-json"),
    )
    summary = _merge_dicts(
        _parse_json_file(summary_file, "--summary-file"),
        _parse_json_value(summary_json, "--summary-json"),
        cli_summary,
    )
    report = _merge_dicts(
        _parse_json_file(report_file, "--report-file"),
        _parse_json_value(report_json, "--report-json"),
    )
    if evalset_evaluators or report_evaluators:
        report = _merge_dicts(
            report,
            {
                "evalset_evaluators": {
                    "evalset_evaluators": evalset_evaluators,
                    "report_evaluators": report_evaluators,
                }
            },
        )

    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_create_run(
        experiment_id,
        status=status,
        started_at=started_at,
        ended_at=ended_at,
        metrics=metrics,
        summary=summary,
        report=report,
        account_uid=resolved_account_uid,
    )
    run = payload.get("run") or {}
    run_id = str(run.get("id", ""))
    ui_url = f"{client.urls.ai_agents_url}/agents/evals"
    console.print(f"[green]Run launched:[/green] {run_id}")
    console.print(f"Track in UI: {ui_url}")


@runs_app.command(name="watch")
def runs_watch(
    run_id: str = typer.Argument(..., help="Run ID."),
    interval_seconds: float = typer.Option(
        3.0, "--interval", min=0.5, help="Polling interval."
    ),
    timeout_seconds: int = typer.Option(
        600, "--timeout", min=5, help="Timeout in seconds."
    ),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
) -> None:
    """Watch a run until completion/failure."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    started = time.time()
    last_status = ""

    while True:
        payload = client.evals_get_run(run_id, account_uid=resolved_account_uid)
        run = payload.get("run") or {}
        status = str(run.get("status", "unknown"))
        if status != last_status:
            metrics = run.get("metrics") or {}
            pass_rate = metrics.get("pass_rate")
            pass_rate_text = (
                f"{float(pass_rate) * 100:.1f}%"
                if isinstance(pass_rate, (int, float))
                else "n/a"
            )
            console.print(
                f"[{_status_style(status)}]{status}[/{_status_style(status)}] "
                f"pass_rate={pass_rate_text} updated={run.get('updated_at', '')}"
            )
            last_status = status

        if status.lower() in {"completed", "failed", "cancelled", "error"}:
            return

        if time.time() - started >= timeout_seconds:
            raise typer.Exit(1)

        time.sleep(interval_seconds)


@live_app.command(name="targets")
def live_targets(
    window: str = typer.Option("24h", "--window", help="Window: 1h, 6h, 24h, 7d, 30d."),
    limit: int = typer.Option(50, "--limit", min=1, max=200),
    token: Optional[str] = typer.Option(None, "--api-key", help="API key."),
    billable_account_uid: Optional[str] = typer.Option(
        None,
        "--billable-account-uid",
        help="Billable account UID context (organization/team/user).",
    ),
    account_uid: Optional[str] = typer.Option(
        None, "--account-uid", help="Deprecated alias for --billable-account-uid."
    ),
    raw: bool = typer.Option(False, "--raw", help="Print raw JSON output."),
) -> None:
    """List live monitoring targets."""
    resolved_account_uid = _resolve_billable_account_uid(
        billable_account_uid, account_uid
    )
    client = _make_client(token=token)
    payload = client.evals_list_live_targets(
        window=window,
        limit=limit,
        account_uid=resolved_account_uid,
    )
    if raw:
        console.print(payload)
        return
    targets = payload.get("targets") or []
    table = Table(title=f"Live Eval Targets ({len(targets)})")
    table.add_column("Target", style="cyan")
    table.add_column("Type", style="white")
    table.add_column("Events", style="white")
    table.add_column("Pass Rate", style="white")
    table.add_column("Avg Value", style="white")
    table.add_column("Last Event", style="white")
    for item in targets:
        pass_rate = item.get("pass_rate")
        pass_rate_text = (
            f"{float(pass_rate) * 100:.1f}%"
            if isinstance(pass_rate, (int, float))
            else "n/a"
        )
        table.add_row(
            str(item.get("target_id", "")),
            str(item.get("target_type", "")),
            str(item.get("event_count", 0)),
            pass_rate_text,
            str(item.get("avg_value", "n/a")),
            str(item.get("last_event_at", "")),
        )
    console.print(table)


app.add_typer(evals_app)
app.add_typer(experiments_app)
app.add_typer(runs_app)
app.add_typer(live_app)
