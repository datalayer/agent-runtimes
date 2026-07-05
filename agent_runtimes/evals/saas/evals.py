# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Shared helpers for evals CLI and integrations."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Optional

import typer

from agent_runtimes.client import DatalayerClient
from datalayer_core.utils.urls import DatalayerURLs

_TERMINAL_RUN_STATES = {
    "completed",
    "failed",
    "error",
    "cancelled",
    "success",
    "succeeded",
    "passed",
    "done",
}


def parse_json_value(raw: Optional[str], flag_name: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        raise typer.BadParameter(f"Invalid JSON for {flag_name}: {exc}") from exc
    if not isinstance(parsed, dict):
        raise typer.BadParameter(f"{flag_name} must decode to an object")
    return parsed


def parse_json_file(path_value: Optional[str], flag_name: str) -> dict[str, Any]:
    if not path_value:
        return {}
    path = Path(path_value)
    if not path.exists():
        raise typer.BadParameter(f"File not found for {flag_name}: {path}")
    text = path.read_text(encoding="utf-8")
    return parse_json_value(text, flag_name)


def merge_dicts(*parts: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for part in parts:
        merged.update(part)
    return merged


def make_client(
    token: Optional[str] = None,
    api_key: Optional[str] = None,
    *,
    iam_url: Optional[str] = None,
    runtimes_url: Optional[str] = None,
    ai_agents_url: Optional[str] = None,
) -> DatalayerClient:
    """Build a :class:`DatalayerClient` from the environment.

    Optional service-URL overrides are forwarded to
    :meth:`DatalayerURLs.from_environment` so examples and integrations can
    point at local proxies without re-implementing client construction.
    """
    urls = DatalayerURLs.from_environment(
        iam_url=iam_url or None,
        runtimes_url=runtimes_url or None,
        ai_agents_url=ai_agents_url or None,
    )
    return DatalayerClient(urls=urls, token=(token or api_key))


def resolve_billable_account_uid(
    billable_account_uid: Optional[str],
    account_uid: Optional[str],
) -> Optional[str]:
    """Resolve billable account UID with backwards-compatible fallback."""
    return billable_account_uid or account_uid


def load_evalset_spec(
    spec_file: str | Path,
    *,
    expected_kind: Optional[str] = None,
    require_cases: bool = False,
) -> dict[str, Any]:
    """Load and validate a JSON evalset spec file.

    The returned dict can be passed straight to
    :meth:`DatalayerClient.evals_create_eval_from_spec`. Shared by examples,
    the GitHub Action, and any other integration that creates evalsets from a
    declarative JSON spec.
    """
    path = Path(spec_file)
    if not path.exists():
        raise FileNotFoundError(f"Evalset spec file not found: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Evalset spec must be a JSON object: {path}")
    if not str(payload.get("name") or "").strip():
        raise ValueError(f"Evalset spec is missing 'name': {path}")
    if expected_kind is not None:
        kind = str(payload.get("kind") or "").strip().lower()
        if kind and kind != expected_kind:
            raise ValueError(
                f"Evalset spec kind '{kind}' does not match expected "
                f"'{expected_kind}': {path}"
            )
    if require_cases:
        cases = payload.get("cases")
        if not isinstance(cases, list) or not cases:
            raise ValueError(
                f"Evalset spec must include a non-empty 'cases' array: {path}"
            )
    return payload


def watch_runs(
    client: DatalayerClient,
    run_ids: list[str],
    *,
    account_uid: Optional[str] = None,
    timeout_seconds: int = 120,
    interval_seconds: int = 3,
    verbose: bool = True,
) -> dict[str, str]:
    """Poll eval runs until they reach a terminal state or the timeout elapses.

    Returns a mapping of ``run_id`` to its last observed status. Generic helper
    reused by examples and integrations; it intentionally carries no demo-only
    logic.
    """
    started = time.time()
    statuses: dict[str, str] = {}
    while True:
        pending: list[str] = []
        counts: dict[str, int] = {}
        for run_id in run_ids:
            snapshot = client.evals_get_run(run_id, account_uid=account_uid)
            status = (
                str((snapshot.get("run") or {}).get("status") or "").lower()
                or "unknown"
            )
            statuses[run_id] = status
            counts[status] = counts.get(status, 0) + 1
            if status not in _TERMINAL_RUN_STATES:
                pending.append(run_id)
        if verbose:
            elapsed = int(time.time() - started)
            summary = (
                ", ".join(f"{status}={count}" for status, count in sorted(counts.items()))
                or "unknown=0"
            )
            print(f"Run status at t+{elapsed}s: {summary}")
        if not pending:
            return statuses
        if time.time() - started > timeout_seconds:
            if verbose:
                preview = ", ".join(pending[:5])
                suffix = " ..." if len(pending) > 5 else ""
                print(
                    "Run watch timed out before terminal state. "
                    f"Pending ({len(pending)}): {preview}{suffix}"
                )
            return statuses
        time.sleep(max(1, interval_seconds))


def now_iso() -> str:
    """Return the current UTC timestamp in ISO-8601 form."""
    from agent_runtimes.evals.saas.report import _now_iso

    return _now_iso()


def timestamp_slug(raw_iso: str) -> str:
    """Return a filesystem-safe slug for an ISO-8601 timestamp."""
    from agent_runtimes.evals.saas.report import _timestamp_slug

    return _timestamp_slug(raw_iso)


def build_eval_report(
    client: DatalayerClient,
    evalset_id: str,
    *,
    account_uid: Optional[str] = None,
    run_limit: int = 50,
) -> dict[str, Any]:
    """Return the structured eval report for an evalset.

    Thin public facade over the report engine so callers do not import private
    CLI helpers.
    """
    from agent_runtimes.evals.saas.report import _report_data

    return _report_data(
        client=client,
        evalset_id=evalset_id,
        run_limit=run_limit,
        account_uid=account_uid,
    )


def render_eval_report_markdown(
    report: dict[str, Any],
    *,
    run_limit: int = 50,
    colorize: bool = False,
) -> str:
    """Render a structured eval report as markdown."""
    from agent_runtimes.evals.saas.report import _report_markdown

    return _report_markdown(report, run_limit=run_limit, colorize=colorize)


def write_eval_report_csv(report: dict[str, Any], output_path: str | Path) -> Path:
    """Write a structured eval report to a CSV file and return its path."""
    from agent_runtimes.evals.saas.report import _write_report_csv

    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    _write_report_csv(report, path)
    return path


def write_eval_reports(
    client: DatalayerClient,
    evalset_id: str,
    *,
    account_uid: Optional[str] = None,
    run_limit: int = 50,
    output_dir: str | Path = ".",
    basename: str = "report",
    timestamped: bool = True,
    export_csv: bool = True,
) -> dict[str, Any]:
    """Build and persist markdown (and optionally CSV) eval reports.

    Returns a dict with the structured ``report`` plus the written file paths.
    Shared by examples and integrations to avoid duplicating report I/O.
    """
    from agent_runtimes.evals.saas.report import _timestamp_slug

    report = build_eval_report(
        client, evalset_id, account_uid=account_uid, run_limit=run_limit
    )
    markdown = render_eval_report_markdown(report, run_limit=run_limit)

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if timestamped:
        stem = f"{basename}-{_timestamp_slug(str(report.get('generated_at') or ''))}"
    else:
        stem = basename

    markdown_path = out_dir / f"{stem}.md"
    markdown_path.write_text(markdown + "\n", encoding="utf-8")

    result: dict[str, Any] = {"report": report, "markdown_path": markdown_path}
    if export_csv:
        result["csv_path"] = write_eval_report_csv(report, out_dir / f"{stem}.csv")
    return result
