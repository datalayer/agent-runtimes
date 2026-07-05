# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Real evaluation and reporting logic for Datalayer evals.

This module hosts the evals report engine and the helper functions used by the
CLI commands, the Python evals API, and the examples. The CLI command layer in
``agent_runtimes.commands.evals`` imports from here so it can stay a thin
Typer wrapper around this logic.
"""

from __future__ import annotations

import csv
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote

import typer
from rich.console import Console
from rich.table import Table

from agent_runtimes.client import DatalayerClient

console = Console()

WEB_APP_BASE_URL = "https://datalayer.ai"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _timestamp_slug(raw_iso: str) -> str:
    cleaned = raw_iso.replace("-", "").replace(":", "").replace(".", "")
    cleaned = cleaned.replace("+0000", "Z").replace("+00:00", "Z")
    cleaned = cleaned.replace("T", "T")
    if cleaned.endswith("Z"):
        return cleaned
    return f"{cleaned}Z"


def _status_style(status: str) -> str:
    normalized = status.lower()
    if normalized in {"completed", "success", "passed"}:
        return "green"
    if normalized in {"running", "queued", "pending"}:
        return "yellow"
    if normalized in {"failed", "error"}:
        return "red"
    return "white"


def _run_pass_rate(run: dict[str, Any]) -> float | None:
    metrics = run.get("metrics") or {}
    raw = metrics.get("pass_rate")
    if isinstance(raw, (int, float)):
        value = float(raw)
        if value < 0:
            return 0.0
        if value > 1:
            return 1.0
        return value
    return None


def _fmt_pct(raw: float | None) -> str:
    if raw is None:
        return "n/a"
    return f"{raw * 100:.1f}%"


def _parse_csv_values(raw: str | None) -> list[str]:
    if raw is None:
        return []
    values: list[str] = []
    seen: set[str] = set()
    for token in str(raw).split(","):
        item = token.strip()
        if not item or item in seen:
            continue
        seen.add(item)
        values.append(item)
    return values


def _parse_evaluator_specs(raw_values: list[str], option_name: str) -> list[dict[str, Any]]:
    evaluators: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_values, start=1):
        try:
            parsed = json.loads(raw)
        except Exception as error:
            raise typer.BadParameter(
                f"{option_name} entry #{index} is not valid JSON: {error}"
            ) from error
        if not isinstance(parsed, dict):
            raise typer.BadParameter(
                f"{option_name} entry #{index} must be a JSON object"
            )
        name = parsed.get("name")
        if not isinstance(name, str) or not name.strip():
            raise typer.BadParameter(
                f"{option_name} entry #{index} must include a non-empty string field 'name'"
            )
        if "arguments" in parsed and not isinstance(parsed.get("arguments"), dict):
            raise typer.BadParameter(
                f"{option_name} entry #{index} field 'arguments' must be an object when provided"
            )
        if "arguments" not in parsed:
            parsed = {**parsed, "arguments": {}}
        evaluators.append(parsed)
    return evaluators


def _agentspec_details_url(agent_spec_id: str) -> str:
    value = str(agent_spec_id or "").strip()
    if not value:
        return ""
    return f"{WEB_APP_BASE_URL}/settings/agentspecs/{quote(value, safe='')}"


def _evalset_runs_url(evalset_id: str, run_environment: str) -> str:
    evalset_value = str(evalset_id or "").strip()
    if not evalset_value:
        return ""
    encoded_evalset_id = quote(evalset_value, safe='')
    env_value = str(run_environment or "").strip()
    if env_value:
        encoded_env = quote(env_value, safe='')
        return f"{WEB_APP_BASE_URL}/evals/experiments/{encoded_env}/{encoded_evalset_id}"
    return f"{WEB_APP_BASE_URL}/evals/experiments?evalset_id={encoded_evalset_id}"


def _run_overlay_url(evalset_runs_url: str, run_id: str) -> str:
    """Build a deep link that opens the run-details overlay directly.

    The experiments page reads the ``run`` query parameter and opens the
    run-details dialog for that run, so the same overlay shown by the in-app
    "Details" button is reachable straight from the CLI report.
    """
    base = str(evalset_runs_url or "").strip()
    run_value = str(run_id or "").strip()
    if not base or not run_value:
        return base
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}run={quote(run_value, safe='')}"



def _style_text(value: str, style: str | None, colorize: bool) -> str:
    if not colorize or not style:
        return value
    return f"[{style}]{value}[/{style}]"


def _compute_baseline_and_drift(runs: list[dict[str, Any]]) -> tuple[float | None, float | None, float | None]:
    pass_rates = [rate for rate in (_run_pass_rate(run) for run in runs) if rate is not None]
    if not pass_rates:
        return None, None, None
    baseline_size = min(3, max(1, len(pass_rates) // 2))
    baseline_slice = pass_rates[:baseline_size]
    baseline = sum(baseline_slice) / baseline_size
    latest = pass_rates[-1]
    drift = latest - baseline
    return baseline, latest, drift


def _analysis_scalar(name: str, metric: str, value: float | int | None) -> dict[str, Any]:
    return {
        "kind": "scalar",
        "name": name,
        "metric": metric,
        "value": value,
    }


def _analysis_table(name: str, columns: list[str], rows: list[list[Any]]) -> dict[str, Any]:
    return {
        "kind": "table",
        "name": name,
        "columns": columns,
        "rows": rows,
    }


def _analysis_line(name: str, x: list[Any], y: list[float]) -> dict[str, Any]:
    return {
        "kind": "line",
        "name": name,
        "x": x,
        "y": y,
    }


def _build_experiment_report_analyses(
    runs: list[dict[str, Any]],
    consecutive_comparisons: list[dict[str, Any]],
    *,
    baseline: float | None,
    latest: float | None,
    drift: float | None,
    latest_two_delta: float | None,
    mean_pass: float | None,
    stddev_pass: float | None,
) -> list[dict[str, Any]]:
    analyses: list[dict[str, Any]] = [
        _analysis_scalar("Latest Pass Rate", "latest_pass_rate", latest),
        _analysis_scalar("Baseline Pass Rate", "baseline_pass_rate", baseline),
        _analysis_scalar("Drift Delta", "drift_delta", drift),
        _analysis_scalar("Latest Two Delta", "latest_two_delta", latest_two_delta),
        _analysis_scalar("Mean Pass Rate", "mean_pass_rate", mean_pass),
        _analysis_scalar("Stddev Pass Rate", "stddev_pass_rate", stddev_pass),
    ]

    run_rows: list[list[Any]] = []
    line_x: list[str] = []
    line_y: list[float] = []
    for idx, run in enumerate(runs):
        run_id = str(run.get("id") or "")
        run_status = str(run.get("status") or "")
        run_pass_rate = _run_pass_rate(run)
        run_rows.append([idx, run_id, run_status, run_pass_rate])
        if isinstance(run_pass_rate, (int, float)):
            line_x.append(run_id or str(idx))
            line_y.append(float(run_pass_rate))
    analyses.append(
        _analysis_table(
            "Run Pass Rates",
            ["index", "run_id", "status", "pass_rate"],
            run_rows,
        )
    )
    analyses.append(_analysis_line("Run Pass Rate Trend", line_x, line_y))

    delta_rows: list[list[Any]] = []
    for item in consecutive_comparisons:
        delta_rows.append(
            [
                str(item.get("run_a_id") or ""),
                str(item.get("run_b_id") or ""),
                item.get("run_a_pass_rate"),
                item.get("run_b_pass_rate"),
                item.get("delta_pass_rate"),
            ]
        )
    analyses.append(
        _analysis_table(
            "Consecutive Run Deltas",
            ["run_a_id", "run_b_id", "run_a_pass_rate", "run_b_pass_rate", "delta_pass_rate"],
            delta_rows,
        )
    )
    return analyses


def _build_evalset_report_analyses(experiments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest_rows: list[list[Any]] = []
    latest_names: list[str] = []
    latest_values: list[float] = []
    all_run_pass_rates: list[float] = []
    for experiment in experiments:
        experiment_name = str(experiment.get("name") or experiment.get("id") or "")
        latest_pass = experiment.get("latest_pass_rate")
        baseline_pass = experiment.get("baseline_pass_rate")
        drift_delta = experiment.get("drift_delta")
        latest_rows.append([experiment_name, latest_pass, baseline_pass, drift_delta])
        if isinstance(latest_pass, (int, float)):
            latest_names.append(experiment_name)
            latest_values.append(float(latest_pass))

        for run in experiment.get("runs") or []:
            if isinstance(run, dict):
                pass_rate = run.get("pass_rate")
                if isinstance(pass_rate, (int, float)):
                    all_run_pass_rates.append(float(pass_rate))

    overall_mean = (
        (sum(all_run_pass_rates) / len(all_run_pass_rates)) if all_run_pass_rates else None
    )

    return [
        _analysis_scalar("Experiment Count", "experiment_count", len(experiments)),
        _analysis_scalar("Overall Mean Pass Rate", "overall_mean_pass_rate", overall_mean),
        _analysis_table(
            "Experiment Latest/Baseline",
            ["experiment", "latest_pass_rate", "baseline_pass_rate", "drift_delta"],
            latest_rows,
        ),
        _analysis_line("Latest Pass Rate By Experiment", latest_names, latest_values),
    ]


def _classify_legacy_failure(message: str) -> dict[str, Any]:
    """Infer a structured stage/type/url from a free-form legacy error message.

    Older runs (and any path that only persisted a plain error string) lack a
    structured ``failure_cause``. Rather than rendering ``unknown`` /
    ``legacy_error`` with an empty detail excerpt, classify the most common
    error shapes so the report stays actionable.
    """
    text = message.strip()
    lowered = text.lower()

    url_match = re.search(r"https?://[^\s]+", text)
    execution_url = url_match.group(0).rstrip(".,)") if url_match else ""

    stage = "unknown"
    failure_type = "legacy_error"
    if "all connection attempts failed" in lowered or "connection refused" in lowered or "request failed" in lowered:
        stage = "runtime_execution"
        failure_type = "runtime_unreachable"
    elif "returned http" in lowered or re.search(r"\bhttp\s*[45]\d\d\b", lowered):
        stage = "runtime_execution"
        failure_type = "runtime_http_error"
    elif "traceback" in lowered:
        stage = "runtime_execution"
        failure_type = "runtime_traceback"
    elif "no submitted code" in lowered or "missing" in lowered and "code" in lowered:
        stage = "run_preparation"
        failure_type = "missing_submitted_code"
    elif "no interactive runtime url" in lowered or "not configured" in lowered:
        stage = "runtime_resolution"
        failure_type = "no_runtime_url"

    cause: dict[str, Any] = {
        "stage": stage,
        "type": failure_type,
        "message": text,
        "detail_excerpt": text,
    }
    if execution_url:
        cause["execution_url"] = execution_url
    return cause


def _extract_failure_cause(run: dict[str, Any]) -> dict[str, Any] | None:
    """Extract a structured failure cause from a run's report/summary payload."""
    for container_key in ("report", "summary"):
        container = run.get(container_key)
        if isinstance(container, dict):
            cause = container.get("failure_cause")
            if isinstance(cause, dict) and cause:
                return cause
    # Fallback: synthesize a structured cause from legacy error fields.
    summary = run.get("summary") if isinstance(run.get("summary"), dict) else {}
    report = run.get("report") if isinstance(run.get("report"), dict) else {}
    message = (
        summary.get("failure_reason")
        or summary.get("execution_error")
        or report.get("error")
    )
    if isinstance(message, str) and message.strip():
        return _classify_legacy_failure(message)
    return None


def _format_failure_cause(cause: dict[str, Any] | None) -> str:
    """Render a failure cause as a concise single-line string."""
    if not isinstance(cause, dict) or not cause:
        return ""
    failure_type = str(cause.get("type") or "").strip()
    message = str(cause.get("message") or "").strip()
    parts: list[str] = []
    if failure_type:
        parts.append(f"[{failure_type}]")
    if message:
        parts.append(message)
    return " ".join(parts).strip()


def _failure_cause_detail_lines(cause: dict[str, Any]) -> list[str]:
    """Render the full failure cause (message, context, diagnostics, attempts) as markdown lines."""
    lines: list[str] = []
    message = str(cause.get("message") or "").strip()
    if message:
        lines.append(f"- Message: {message}")
    for key, label in (
        ("stage", "Stage"),
        ("type", "Type"),
        ("runtime_pod_name", "Runtime pod"),
        ("runtime_id", "Runtime ID"),
        ("environment_name", "Environment"),
        ("execution_url", "Execution URL"),
    ):
        value = str(cause.get(key) or "").strip()
        if value:
            lines.append(f"- {label}: `{value}`")

    detail = str(cause.get("detail_excerpt") or "").strip()
    if detail:
        lines.append("- Detail excerpt:")
        lines.append("")
        lines.append("```text")
        lines.extend(detail.splitlines() or [detail])
        lines.append("```")

    diagnostics = cause.get("diagnostics")
    if isinstance(diagnostics, dict) and diagnostics:
        for key, label in (
            ("agent_runtimes_url", "Agent runtimes URL"),
            ("run_url", "Run URL"),
        ):
            value = diagnostics.get(key)
            if value:
                lines.append(f"- {label}: `{value}`")
        for key, label in (
            ("route_ids", "Route IDs tried"),
            ("discovered_agent_ids", "Discovered agent IDs"),
            ("candidate_urls", "Candidate URLs"),
        ):
            value = diagnostics.get(key)
            if isinstance(value, list) and value:
                rendered = ", ".join(f"`{item}`" for item in value)
                lines.append(f"- {label}: {rendered}")

        attempts = diagnostics.get("attempts")
        if isinstance(attempts, list) and attempts:
            lines.append("- Connection attempts:")
            attempt_rows: list[list[str]] = []
            for attempt in attempts:
                if not isinstance(attempt, dict):
                    continue
                status_code = attempt.get("status_code")
                attempt_rows.append(
                    [
                        str(attempt.get("url") or "-"),
                        "ok" if attempt.get("ok") else "failed",
                        "-" if status_code is None else str(status_code),
                        str(attempt.get("error") or "-"),
                    ]
                )
            if attempt_rows:
                lines.append("")
                lines.extend(
                    _markdown_table(
                        ["URL", "Result", "HTTP", "Error"],
                        attempt_rows,
                        ["left", "left", "right", "left"],
                    )
                )
    return lines


def _run_detail_record(run: dict[str, Any]) -> dict[str, Any]:
    metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
    summary = run.get("summary") if isinstance(run.get("summary"), dict) else {}
    report = run.get("report") if isinstance(run.get("report"), dict) else {}
    usage = _extract_run_usage(run)
    return {
        "id": str(run.get("id", "")),
        "status": str(run.get("status", "")),
        "created_at": str(run.get("created_at", "")),
        "updated_at": str(run.get("updated_at", "")),
        "pass_rate": _run_pass_rate(run),
        "metrics": metrics,
        "summary": summary,
        "report": report,
        "usage": usage,
        "failure_cause": _extract_failure_cause(run),
    }


def _extract_experiment_agentspec(experiment: dict[str, Any], runs: list[dict[str, Any]]) -> tuple[str, str]:
    config = experiment.get("config") if isinstance(experiment.get("config"), dict) else {}
    summary = experiment.get("summary") if isinstance(experiment.get("summary"), dict) else {}
    run_summaries = [
        run.get("summary")
        for run in runs
        if isinstance(run, dict) and isinstance(run.get("summary"), dict)
    ]

    id_candidates: list[Any] = [
        config.get("agent_spec_id"),
        config.get("agentSpecId"),
        summary.get("agent_spec_id"),
        summary.get("agentSpecId"),
    ]
    name_candidates: list[Any] = [
        config.get("agent_spec_name"),
        config.get("agentSpecName"),
        summary.get("agent_spec_name"),
        summary.get("agentSpecName"),
    ]
    for run_summary in run_summaries:
        assert isinstance(run_summary, dict)
        id_candidates.extend(
            [
                run_summary.get("agent_spec_id"),
                run_summary.get("agentSpecId"),
            ]
        )
        name_candidates.extend(
            [
                run_summary.get("agent_spec_name"),
                run_summary.get("agentSpecName"),
            ]
        )

    agent_spec_id = ""
    for candidate in id_candidates:
        if isinstance(candidate, str) and candidate.strip():
            agent_spec_id = candidate.strip()
            break

    agent_spec_name = ""
    for candidate in name_candidates:
        if isinstance(candidate, str) and candidate.strip():
            agent_spec_name = candidate.strip()
            break

    if not agent_spec_name and agent_spec_id:
        agent_spec_name = agent_spec_id
    return agent_spec_id, agent_spec_name


def _first_str(*candidates: Any) -> str:
    """Return the first non-empty stripped string from the candidates."""
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return ""


def _normalize_tags(value: Any) -> list[str]:
    """Normalize a tags value (list or comma-separated string) to a list."""
    if isinstance(value, (list, tuple)):
        tags = [str(item).strip() for item in value if str(item).strip()]
    elif isinstance(value, str):
        tags = [token.strip() for token in value.split(",") if token.strip()]
    else:
        return []
    seen: set[str] = set()
    ordered: list[str] = []
    for tag in tags:
        if tag not in seen:
            seen.add(tag)
            ordered.append(tag)
    return ordered


def _extract_experiment_agentspec_details(
    experiment: dict[str, Any], runs: list[dict[str, Any]]
) -> dict[str, Any]:
    """Extract rich agentspec metadata from experiment/run payloads.

    Mirrors the fields surfaced by the in-app Agentspec Details dialog
    (name, description, version, model, tags, icon/emoji/color) by
    inspecting the experiment config/summary, any inline ``agent_spec``
    object, and the most recent run summaries.
    """
    config = experiment.get("config") if isinstance(experiment.get("config"), dict) else {}
    summary = experiment.get("summary") if isinstance(experiment.get("summary"), dict) else {}
    run_summaries = [
        run.get("summary")
        for run in runs
        if isinstance(run, dict) and isinstance(run.get("summary"), dict)
    ]

    # Inline agent_spec objects can live under several keys/scopes.
    inline_specs: list[dict[str, Any]] = []
    for scope in (config, summary, *run_summaries):
        if not isinstance(scope, dict):
            continue
        for key in ("agent_spec", "agentSpec", "agentspec"):
            candidate = scope.get(key)
            if isinstance(candidate, dict):
                inline_specs.append(candidate)

    def _pick(field: str, camel: str) -> str:
        candidates: list[Any] = []
        for spec in inline_specs:
            candidates.extend([spec.get(field), spec.get(camel)])
        for scope in (config, summary, *run_summaries):
            if isinstance(scope, dict):
                candidates.extend(
                    [
                        scope.get(f"agent_spec_{field}"),
                        scope.get(f"agentSpec{camel[0].upper()}{camel[1:]}"),
                    ]
                )
        return _first_str(*candidates)

    tags_candidates: list[Any] = []
    for spec in inline_specs:
        tags_candidates.extend([spec.get("tags")])
    for scope in (config, summary, *run_summaries):
        if isinstance(scope, dict):
            tags_candidates.extend(
                [scope.get("agent_spec_tags"), scope.get("agentSpecTags")]
            )
    tags: list[str] = []
    for candidate in tags_candidates:
        tags = _normalize_tags(candidate)
        if tags:
            break

    return {
        "description": _pick("description", "description"),
        "version": _pick("version", "version"),
        "model": _pick("model", "model"),
        "icon": _pick("icon", "icon"),
        "emoji": _pick("emoji", "emoji"),
        "color": _pick("color", "color"),
        "tags": tags,
    }


def _merge_agentspec_details(target: dict[str, Any], details: dict[str, Any]) -> None:
    """Merge non-empty agentspec detail fields into the aggregate record."""
    for key in ("description", "version", "model", "icon", "emoji", "color"):
        value = details.get(key)
        if isinstance(value, str) and value.strip() and not str(target.get(key) or "").strip():
            target[key] = value.strip()
    incoming_tags = details.get("tags")
    if isinstance(incoming_tags, list) and incoming_tags:
        existing = target.get("tags")
        if not isinstance(existing, list) or not existing:
            target["tags"] = list(incoming_tags)


_AGENTSPEC_REGISTRY_LOOKUP: Any = None
_AGENTSPEC_REGISTRY_LOADED = False
_AGENTSPEC_REGISTRY_MAP: dict[str, Any] | None = None


def _load_agentspec_registry() -> tuple[dict[str, Any], Any]:
    """Return an empty agentspec registry for core-only report rendering.

    Core report generation must not depend on the optional ``agent_runtimes``
    package. Agentspec enrichment therefore relies only on fields already
    present in report payloads and per-run metadata.
    """
    global _AGENTSPEC_REGISTRY_LOADED, _AGENTSPEC_REGISTRY_LOOKUP, _AGENTSPEC_REGISTRY_MAP
    if _AGENTSPEC_REGISTRY_LOADED:
        return (_AGENTSPEC_REGISTRY_MAP or {}, _AGENTSPEC_REGISTRY_LOOKUP)
    _AGENTSPEC_REGISTRY_LOADED = True
    _AGENTSPEC_REGISTRY_LOOKUP = None
    _AGENTSPEC_REGISTRY_MAP = {}
    return ({}, None)


def _agentspec_registry_details(agent_spec_id: str) -> dict[str, Any]:
    """Look up rich agentspec metadata from the cached local registry.

    Core intentionally keeps this empty unless future core-native catalog
    sources are added.
    """
    value = str(agent_spec_id or "").strip()
    if not value:
        return {}
    catalog, lookup = _load_agentspec_registry()
    spec = catalog.get(value)
    if spec is None:
        base = value.rpartition(":")[0]
        if base:
            spec = catalog.get(base)
    if spec is None and callable(lookup):
        try:
            spec = lookup(value)
        except Exception:
            spec = None
    if spec is None:
        return {}

    def _attr(*names: str) -> str:
        for name in names:
            candidate = getattr(spec, name, None)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return ""

    return {
        "name": _attr("name"),
        "description": _attr("description"),
        "version": _attr("version"),
        "model": _attr("model"),
        "icon": _attr("icon"),
        "emoji": _attr("emoji"),
        "color": _attr("color"),
        "tags": _normalize_tags(getattr(spec, "tags", None)),
    }


def _aggregate_evaluator_results(
    samples: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Aggregate per-run global-evaluator results across an evalset's runs.

    ``samples`` are the ``evaluator_results`` entries collected from each run's
    metrics (newest first). The aggregate exposes the mean score, how many runs
    passed, and the latest run's outcome for each ``(name, scope)`` evaluator so
    the report can show results, not just evaluator configuration.
    """
    order: list[tuple[str, str]] = []
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for sample in samples:
        if not isinstance(sample, dict):
            continue
        name = str(sample.get("name") or "evaluator")
        scope = str(sample.get("scope") or "evalset")
        key = (name, scope)
        bucket = grouped.get(key)
        if bucket is None:
            bucket = {
                "name": name,
                "scope": scope,
                "scores": [],
                "passed_runs": 0,
                "runs": 0,
                "latest": sample,
            }
            grouped[key] = bucket
            order.append(key)
        bucket["runs"] += 1
        score = sample.get("score")
        if isinstance(score, (int, float)):
            bucket["scores"].append(float(score))
        if sample.get("passed"):
            bucket["passed_runs"] += 1

    aggregated: list[dict[str, Any]] = []
    for key in order:
        bucket = grouped[key]
        scores = bucket["scores"]
        latest = bucket["latest"]
        latest_score = latest.get("score")
        entry: dict[str, Any] = {
            "name": bucket["name"],
            "scope": bucket["scope"],
            "runs": bucket["runs"],
            "passed_runs": bucket["passed_runs"],
            "mean_score": round(sum(scores) / len(scores), 4) if scores else None,
            "latest_score": (
                round(float(latest_score), 4)
                if isinstance(latest_score, (int, float))
                else None
            ),
            "latest_passed": bool(latest.get("passed")),
            "summary": str(latest.get("summary") or ""),
        }
        for optional in ("threshold", "observed", "passed_cases", "total_cases"):
            if latest.get(optional) is not None:
                entry[optional] = latest.get(optional)
        aggregated.append(entry)
    return aggregated


def _report_data(
    client: DatalayerClient,
    evalset_id: str,
    run_limit: int,
    account_uid: Optional[str],
) -> dict[str, Any]:
    evalset_record: dict[str, Any] = {}
    evalsets_payload = client.evals_list_evals(
        q=evalset_id,
        limit=200,
        offset=0,
        account_uid=account_uid,
    )
    for item in (evalsets_payload.get("evalsets") or []):
        if isinstance(item, dict) and str(item.get("id") or "") == evalset_id:
            evalset_record = item
            break

    experiments_payload = client.evals_list_experiments(
        evalset_id=evalset_id,
        limit=200,
        offset=0,
        account_uid=account_uid,
    )
    experiments = experiments_payload.get("experiments") or []

    report: dict[str, Any] = {
        "evalset_id": evalset_id,
        "evalset_name": str(evalset_record.get("name") or ""),
        "run_environment": str(evalset_record.get("run_environment") or ""),
        "generated_at": _now_iso(),
        "agentspecs": [],
        "evalset_evaluators": [
            item
            for item in (evalset_record.get("evalset_evaluators") or [])
            if isinstance(item, dict)
        ],
        "report_evaluators": [
            item
            for item in (evalset_record.get("report_evaluators") or [])
            if isinstance(item, dict)
        ],
        "cases": [
            case for case in (evalset_record.get("cases") or []) if isinstance(case, dict)
        ],
        "report_analyses": [],
        "experiments": [],
    }
    agentspec_by_id: dict[str, dict[str, Any]] = {}
    evaluator_result_samples: list[dict[str, Any]] = []

    for experiment in experiments:
        experiment_id = str(experiment.get("id", ""))
        experiment_name = str(experiment.get("name", experiment_id))

        runs_payload = client.evals_list_runs(
            experiment_id,
            limit=run_limit,
            offset=0,
            account_uid=account_uid,
        )
        runs = runs_payload.get("runs") or []
        for run in runs:
            if not isinstance(run, dict):
                continue
            metrics = run.get("metrics")
            if not isinstance(metrics, dict):
                continue
            samples = metrics.get("evaluator_results")
            if isinstance(samples, list):
                evaluator_result_samples.extend(
                    sample for sample in samples if isinstance(sample, dict)
                )
        agent_spec_id, agent_spec_name = _extract_experiment_agentspec(experiment, runs)
        registry_details = (
            _agentspec_registry_details(agent_spec_id) if agent_spec_id else {}
        )
        registry_name = str(registry_details.get("name") or "").strip()
        if registry_name:
            agent_spec_name = registry_name
        if agent_spec_id and agent_spec_id not in agentspec_by_id:
            agentspec_by_id[agent_spec_id] = {
                "id": agent_spec_id,
                "name": agent_spec_name or agent_spec_id,
                "experiments": 0,
                "runs": 0,
                "experiment_names": [],
            }
        if agent_spec_id:
            record = agentspec_by_id[agent_spec_id]
            record["experiments"] += 1
            record["runs"] += len(runs)
            if experiment_name:
                names = record.setdefault("experiment_names", [])
                if experiment_name not in names:
                    names.append(experiment_name)
            # The agent_runtimes catalog is authoritative; fall back to any
            # metadata embedded in the experiment/run payloads for fields the
            # catalog does not provide (or when the catalog is unavailable).
            _merge_agentspec_details(record, registry_details)
            _merge_agentspec_details(
                record,
                _extract_experiment_agentspec_details(experiment, runs),
            )
        total_runs = int(runs_payload.get("total") or len(runs))
        baseline, latest, drift = _compute_baseline_and_drift(runs)

        latest_two_delta: float | None = None
        latest_two_run_ids: list[str] = []
        latest_two_compare: dict[str, Any] | None = None
        if len(runs) >= 2:
            latest_two_run_ids = [str(runs[0].get("id", "")), str(runs[1].get("id", ""))]
            compare_payload = client.evals_compare_runs(
                latest_two_run_ids,
                account_uid=account_uid,
            )
            compared_runs = compare_payload.get("runs") or []
            compared_by_id = {
                str(run.get("id", "")): run
                for run in compared_runs
                if isinstance(run, dict)
            }
            run_a = compared_by_id.get(latest_two_run_ids[0], runs[0])
            run_b = compared_by_id.get(latest_two_run_ids[1], runs[1])
            pass_a = _run_pass_rate(run_a)
            pass_b = _run_pass_rate(run_b)
            if pass_a is not None and pass_b is not None:
                latest_two_delta = pass_a - pass_b
            latest_two_compare = {
                "run_ids": latest_two_run_ids,
                "run_a": _run_detail_record(run_a),
                "run_b": _run_detail_record(run_b),
                "delta_pass_rate": latest_two_delta,
            }

        consecutive_comparisons: list[dict[str, Any]] = []
        for idx in range(max(0, len(runs) - 1)):
            run_a = runs[idx]
            run_b = runs[idx + 1]
            pass_a = _run_pass_rate(run_a)
            pass_b = _run_pass_rate(run_b)
            delta = None
            if pass_a is not None and pass_b is not None:
                delta = pass_a - pass_b
            consecutive_comparisons.append(
                {
                    "run_a_id": str(run_a.get("id", "")),
                    "run_b_id": str(run_b.get("id", "")),
                    "run_a_status": str(run_a.get("status", "")),
                    "run_b_status": str(run_b.get("status", "")),
                    "run_a_pass_rate": pass_a,
                    "run_b_pass_rate": pass_b,
                    "delta_pass_rate": delta,
                }
            )

        pass_rates = [
            _run_pass_rate(run)
            for run in runs
            if isinstance(_run_pass_rate(run), (int, float))
        ]
        numeric_pass_rates = [float(value) for value in pass_rates if isinstance(value, (int, float))]
        mean_pass = sum(numeric_pass_rates) / len(numeric_pass_rates) if numeric_pass_rates else None
        stddev_pass = None
        if numeric_pass_rates:
            variance = sum((value - mean_pass) ** 2 for value in numeric_pass_rates) / len(numeric_pass_rates)
            stddev_pass = math.sqrt(variance)

        report["experiments"].append(
            {
                "id": experiment_id,
                "name": experiment_name,
                "runs_total": total_runs,
                "runs_fetched": len(runs),
                "agent_spec_id": agent_spec_id,
                "agent_spec_name": agent_spec_name,
                "latest_pass_rate": latest,
                "baseline_pass_rate": baseline,
                "drift_delta": drift,
                "latest_two_run_ids": latest_two_run_ids,
                "latest_two_delta": latest_two_delta,
                "latest_two_comparison": latest_two_compare,
                "mean_pass_rate": mean_pass,
                "stddev_pass_rate": stddev_pass,
                "runs": [_run_detail_record(run) for run in runs],
                "consecutive_comparisons": consecutive_comparisons,
                "report_analyses": _build_experiment_report_analyses(
                    runs,
                    consecutive_comparisons,
                    baseline=baseline,
                    latest=latest,
                    drift=drift,
                    latest_two_delta=latest_two_delta,
                    mean_pass=mean_pass,
                    stddev_pass=stddev_pass,
                ),
            }
        )
    report["agentspecs"] = list(agentspec_by_id.values())
    report["evaluator_results"] = _aggregate_evaluator_results(evaluator_result_samples)
    report["report_analyses"] = _build_evalset_report_analyses(report["experiments"])
    return report


def _ascii_bar(
    value: float | None,
    width: int = 28,
    *,
    full_blocks: bool = True,
    colorize: bool = False,
) -> str:
    if value is None:
        return "-"
    bounded = max(0.0, min(1.0, float(value)))
    filled = int(round(bounded * width))
    fill_char = "█" if full_blocks else "#"
    empty_char = "░" if full_blocks else "."
    filled_part = fill_char * filled
    empty_part = empty_char * (width - filled)
    if not colorize:
        return filled_part + empty_part
    if bounded >= 0.85:
        style = "green"
    elif bounded >= 0.75:
        style = "yellow"
    else:
        style = "red"
    return _style_text(filled_part, style, True) + _style_text(empty_part, "grey39", True)


def _fmt_pts(value: float) -> str:
    return f"{value * 100:.1f}"


def _ascii_histogram(
    values: list[float],
    *,
    bins: int = 8,
    width: int = 22,
    min_value: float | None = None,
    max_value: float | None = None,
    full_blocks: bool = True,
    colorize: bool = False,
    drift_palette: bool = False,
) -> list[str]:
    if not values:
        return ["n/a"]

    lo = min_value if isinstance(min_value, (int, float)) else min(values)
    hi = max_value if isinstance(max_value, (int, float)) else max(values)
    if hi <= lo:
        hi = lo + 1e-9

    bins = max(2, bins)
    counts = [0 for _ in range(bins)]
    span = hi - lo
    for value in values:
        ratio = (value - lo) / span
        idx = int(ratio * bins)
        idx = max(0, min(bins - 1, idx))
        counts[idx] += 1

    peak = max(counts) if counts else 1
    fill_char = "█" if full_blocks else "#"
    empty_char = "░" if full_blocks else "."
    lines: list[str] = []
    for idx, count in enumerate(counts):
        left = lo + (span * idx / bins)
        right = lo + (span * (idx + 1) / bins)
        filled = int(round((count / peak) * width)) if peak > 0 else 0
        filled_part = fill_char * filled
        empty_part = empty_char * (width - filled)
        if colorize:
            if drift_palette:
                if right <= 0:
                    bar_style = "red"
                elif left >= 0:
                    bar_style = "green"
                else:
                    bar_style = "yellow"
            elif peak > 0 and count / peak >= 0.67:
                bar_style = "cyan"
            elif peak > 0 and count / peak >= 0.34:
                bar_style = "blue"
            else:
                bar_style = "magenta"
            bar = _style_text(filled_part, bar_style, True) + _style_text(empty_part, "grey39", True)
        else:
            bar = filled_part + empty_part
        lines.append(
            f"{_fmt_pts(left):>6} to {_fmt_pts(right):>6} pts |{bar}| {count}"
        )
    return lines


def _fmt_delta(value: float | None, *, colorize: bool = False) -> str:
    if value is None:
        return "n/a"
    rendered = f"{value * 100:+.1f} pts"
    if value > 0:
        return f"🟢 {_style_text(rendered, 'green', colorize)}"
    if value < 0:
        return f"🔴 {_style_text(rendered, 'red', colorize)}"
    return f"⚪ {_style_text(rendered, 'yellow', colorize)}"


def _sparkline(values: list[float], *, colorize: bool = False) -> str:
    if not values:
        return "n/a"
    ticks = "▁▂▃▄▅▆▇█"
    lo = min(values)
    hi = max(values)
    if hi <= lo:
        base = ticks[-2] * len(values)
    else:
        span = hi - lo
        chars = []
        for value in values:
            idx = int(round(((value - lo) / span) * (len(ticks) - 1)))
            idx = max(0, min(len(ticks) - 1, idx))
            chars.append(ticks[idx])
        base = "".join(chars)
    if not colorize:
        return base
    if values[-1] >= 0.85:
        style = "green"
    elif values[-1] >= 0.75:
        style = "yellow"
    else:
        style = "red"
    return _style_text(base, style, True)


def _clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


def _heat_char(value: float) -> str:
    shades = "░▒▓█"
    bounded = _clamp_unit(value)
    idx = int(round(bounded * (len(shades) - 1)))
    return shades[idx]


def _fit_label(text: str, width: int = 20) -> str:
    raw = str(text or "")
    if len(raw) <= width:
        return raw.ljust(width)
    if width <= 3:
        return raw[:width]
    return (raw[: width - 3] + "...")


def _ascii_passrate_heatmap(
    experiments: list[dict[str, Any]],
    *,
    max_columns: int = 12,
    colorize: bool = False,
) -> list[str]:
    if not experiments:
        return ["n/a"]

    max_columns = max(1, max_columns)
    header = f"{'Experiment':<20} | " + " ".join(
        f"r{idx:02d}" for idx in range(1, max_columns + 1)
    )
    lines = [header, "-" * len(header)]

    for experiment in experiments:
        runs = [run for run in (experiment.get("runs") or []) if isinstance(run, dict)]
        cells: list[str] = []
        for idx in range(max_columns):
            value: float | None = None
            if idx < len(runs):
                raw = runs[idx].get("pass_rate")
                if isinstance(raw, (int, float)):
                    value = float(raw)
            if value is None:
                cells.append("·")
                continue

            token = _heat_char(value)
            if colorize:
                if value >= 0.85:
                    token = _style_text(token, "green", True)
                elif value >= 0.75:
                    token = _style_text(token, "yellow", True)
                else:
                    token = _style_text(token, "red", True)
            cells.append(token)

        label = _fit_label(str(experiment.get("name", "")), width=20)
        lines.append(f"{label} | " + " ".join(cells))

    lines.append("Legend: low='░' .. high='█' (r01=latest fetched run, '·'=no run)")
    return lines


def _ascii_drift_heatmap(
    experiments: list[dict[str, Any]],
    *,
    max_columns: int = 12,
    colorize: bool = False,
) -> list[str]:
    if not experiments:
        return ["n/a"]

    max_columns = max(1, max_columns)
    header = f"{'Experiment':<20} | " + " ".join(
        f"d{idx:02d}" for idx in range(1, max_columns + 1)
    )
    lines = [header, "-" * len(header)]

    for experiment in experiments:
        comparisons = [
            item for item in (experiment.get("consecutive_comparisons") or [])
            if isinstance(item, dict)
        ]
        cells: list[str] = []
        for idx in range(max_columns):
            delta: float | None = None
            if idx < len(comparisons):
                raw = comparisons[idx].get("delta_pass_rate")
                if isinstance(raw, (int, float)):
                    delta = float(raw)
            if delta is None:
                cells.append("··")
                continue

            sign = "+" if delta >= 0 else "-"
            magnitude = _heat_char(abs(delta))
            token = f"{sign}{magnitude}"
            if colorize:
                if delta > 0:
                    token = _style_text(token, "green", True)
                elif delta < 0:
                    token = _style_text(token, "red", True)
                else:
                    token = _style_text(token, "yellow", True)
            cells.append(token)

        label = _fit_label(str(experiment.get("name", "")), width=20)
        lines.append(f"{label} | " + " ".join(cells))

    lines.append("Legend: dNN are consecutive deltas (A-B), sign shows direction, magnitude uses '░'..'█', '··'=no comparison")
    return lines


def _pairwise_latest_deltas(experiments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []
    for idx, left in enumerate(experiments):
        left_latest = left.get("latest_pass_rate")
        if not isinstance(left_latest, (int, float)):
            continue
        left_agent_spec_id = str(left.get("agent_spec_id") or "")
        left_agent_spec_name = str(left.get("agent_spec_name") or left_agent_spec_id or "")
        for right in experiments[idx + 1 :]:
            right_latest = right.get("latest_pass_rate")
            if not isinstance(right_latest, (int, float)):
                continue
            right_agent_spec_id = str(right.get("agent_spec_id") or "")
            right_agent_spec_name = str(right.get("agent_spec_name") or right_agent_spec_id or "")
            comparison_group = (
                "within_agentspec"
                if left_agent_spec_id and right_agent_spec_id and left_agent_spec_id == right_agent_spec_id
                else "cross_agentspec"
            )
            pairs.append(
                {
                    "left_id": str(left.get("id", "")),
                    "left": str(left.get("name", "")),
                    "left_agent_spec_id": left_agent_spec_id,
                    "left_agent_spec_name": left_agent_spec_name,
                    "right_id": str(right.get("id", "")),
                    "right": str(right.get("name", "")),
                    "right_agent_spec_id": right_agent_spec_id,
                    "right_agent_spec_name": right_agent_spec_name,
                    "left_latest": float(left_latest),
                    "right_latest": float(right_latest),
                    "delta": float(left_latest) - float(right_latest),
                    "group": comparison_group,
                }
            )
    pairs.sort(key=lambda item: abs(item["delta"]), reverse=True)
    return pairs


def _markdown_table(headers: list[str], rows: list[list[str]], aligns: list[str]) -> list[str]:
    widths = [len(header) for header in headers]
    for row in rows:
        for idx, cell in enumerate(row):
            widths[idx] = max(widths[idx], len(cell))

    def _pad(cell: str, width: int, align: str) -> str:
        if align == "right":
            return cell.rjust(width)
        return cell.ljust(width)

    header_line = "| " + " | ".join(headers[idx].ljust(widths[idx]) for idx in range(len(headers))) + " |"

    sep_parts: list[str] = []
    for idx, align in enumerate(aligns):
        width = max(3, widths[idx])
        if align == "right":
            sep_parts.append("-" * (width - 1) + ":")
        else:
            sep_parts.append(":" + "-" * (width - 1))
    sep_line = "| " + " | ".join(sep_parts) + " |"

    body_lines = [
        "| " + " | ".join(_pad(row[idx], widths[idx], aligns[idx]) for idx in range(len(headers))) + " |"
        for row in rows
    ]
    return [header_line, sep_line, *body_lines]


def _compact_json(value: Any, max_len: int = 140) -> str:
    if value is None:
        return "-"
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        except Exception:
            text = str(value)
    text = " ".join(text.split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _aggregate_case_outcomes(
    experiments: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Aggregate per-case pass/score stats across every fetched run.

    Returns ``(case_stats, agentspec_names)`` where ``case_stats`` maps a case
    name to ``{"runs", "passed", "score_sum", "score_count", "by_spec"}`` and
    ``by_spec`` maps an agentspec label to ``{"runs", "passed"}``.
    """
    case_stats: dict[str, dict[str, Any]] = {}
    case_order: list[str] = []
    agentspec_names: list[str] = []
    for experiment in experiments:
        spec_label = str(
            experiment.get("agent_spec_name")
            or experiment.get("agent_spec_id")
            or "-"
        )
        if spec_label not in agentspec_names:
            agentspec_names.append(spec_label)
        for run in experiment.get("runs") or []:
            if not isinstance(run, dict):
                continue
            metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
            case_results = metrics.get("case_results")
            if not isinstance(case_results, list):
                continue
            for case_result in case_results:
                if not isinstance(case_result, dict):
                    continue
                name = str(case_result.get("name") or "-")
                if name not in case_stats:
                    case_stats[name] = {
                        "runs": 0,
                        "passed": 0,
                        "score_sum": 0.0,
                        "score_count": 0,
                        "by_spec": {},
                    }
                    case_order.append(name)
                stat = case_stats[name]
                passed = bool(case_result.get("passed"))
                stat["runs"] += 1
                stat["passed"] += 1 if passed else 0
                score = case_result.get("score")
                if isinstance(score, (int, float)):
                    stat["score_sum"] += float(score)
                    stat["score_count"] += 1
                spec_entry = stat["by_spec"].setdefault(
                    spec_label, {"runs": 0, "passed": 0}
                )
                spec_entry["runs"] += 1
                spec_entry["passed"] += 1 if passed else 0
    ordered = {name: case_stats[name] for name in case_order}
    return ordered, agentspec_names


def _per_case_outcome_lines(
    experiments: list[dict[str, Any]],
    *,
    colorize: bool = False,
) -> list[str]:
    """Render the per-case outcomes section (pass rate per case across runs)."""
    lines: list[str] = []
    lines.append("## Per-Case Outcomes")
    lines.append("")
    case_stats, agentspec_names = _aggregate_case_outcomes(experiments)
    if not case_stats:
        lines.append(
            "No per-case results were recorded on the fetched runs. Runs that "
            "store `case_results` in their metrics populate this section."
        )
        lines.append("")
        return lines

    lines.append(
        "Pass rate for each case across every fetched run (all experiments and "
        "agentspecs combined). This reveals which cases are reliable and which "
        "ones regress, instead of only the aggregate run pass rate."
    )
    lines.append("")
    overall_rows: list[list[str]] = []
    for name, stat in case_stats.items():
        runs = int(stat["runs"])
        passed = int(stat["passed"])
        pass_rate = (passed / runs) if runs else None
        avg_score = (
            stat["score_sum"] / stat["score_count"] if stat["score_count"] else None
        )
        overall_rows.append(
            [
                name,
                str(runs),
                f"{passed}/{runs}",
                _fmt_pct(pass_rate),
                "n/a" if avg_score is None else f"{avg_score:.3f}",
            ]
        )
    lines.extend(
        _markdown_table(
            ["Case", "Runs", "Passed", "Pass Rate", "Avg Score"],
            overall_rows,
            ["left", "right", "right", "right", "right"],
        )
    )
    lines.append("")

    if len(agentspec_names) > 1:
        lines.append("### Per-Case Pass Rate By Agentspec")
        lines.append("")
        lines.append(
            "Compare how each case performs across agentspecs (for example "
            "codemode vs no-codemode)."
        )
        lines.append("")
        spec_rows: list[list[str]] = []
        for name, stat in case_stats.items():
            row = [name]
            for spec_label in agentspec_names:
                spec_entry = stat["by_spec"].get(spec_label)
                if not spec_entry or not spec_entry.get("runs"):
                    row.append("n/a")
                    continue
                spec_pass = spec_entry["passed"] / spec_entry["runs"]
                row.append(_fmt_pct(spec_pass))
            spec_rows.append(row)
        lines.extend(
            _markdown_table(
                ["Case", *agentspec_names],
                spec_rows,
                ["left", *["right"] * len(agentspec_names)],
            )
        )
        lines.append("")

    return lines


def _report_analyses_lines(report: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    analyses = [
        item for item in (report.get("report_analyses") or []) if isinstance(item, dict)
    ]
    lines.append("## Appendix: Structured Report Analyses")
    lines.append("")
    lines.append(
        "The JSON block below is rendered directly from the top-level "
        "`report_analyses` payload."
    )
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(analyses, ensure_ascii=False, indent=2, sort_keys=True))
    lines.append("```")
    lines.append("")
    return lines


def _report_markdown(report: dict[str, Any], run_limit: int, *, colorize: bool = False) -> str:
    evalset_id = str(report.get("evalset_id", ""))
    run_environment = str(report.get("run_environment") or "")
    generated_at = str(report.get("generated_at", ""))
    experiments = [item for item in (report.get("experiments") or []) if isinstance(item, dict)]
    agentspecs = [item for item in (report.get("agentspecs") or []) if isinstance(item, dict)]
    cases = [item for item in (report.get("cases") or []) if isinstance(item, dict)]
    case_by_name: dict[str, dict[str, Any]] = {}
    representative_case_name: str | None = None
    for case in cases:
        name = str(case.get("name") or "")
        if not name:
            continue
        if representative_case_name is None:
            representative_case_name = name
        if name not in case_by_name:
            case_by_name[name] = case
    evalset_runs_url = _evalset_runs_url(evalset_id, run_environment)

    lines: list[str] = []
    # Verbose, drill-down content is collected here and emitted under a single
    # "# Appendices" heading at the end so the body stays scannable.
    appendix_lines: list[str] = []
    lines.append(f"# Evals Report: {evalset_id}")
    lines.append("")
    lines.append(f"- Generated at: {generated_at}")
    lines.append(f"- Experiments: {len(experiments)}")
    lines.append(f"- Agentspecs: {len(agentspecs)}")
    lines.append(f"- Cases: {len(cases)}")
    lines.append(
        f"- Evalset evaluators: {len([item for item in (report.get('evalset_evaluators') or []) if isinstance(item, dict)])}"
    )
    lines.append(
        f"- Report evaluators: {len([item for item in (report.get('report_evaluators') or []) if isinstance(item, dict)])}"
    )
    lines.append(f"- Run window per experiment: {run_limit}")
    if evalset_runs_url:
        lines.append(f"- Evalset run details: [Open in Datalayer]({evalset_runs_url})")
    lines.append("")
    lines.append(
        "> The body summarises results (evaluators, per-case outcomes, drift, and "
        "comparisons). Full configuration, cases, heatmaps, per-experiment timelines, "
        "and per-run details are in the appendices at the end."
    )
    lines.append("")

    lines.append("## Agentspec Coverage")
    lines.append("")
    if agentspecs:
        agentspec_rows: list[list[str]] = []
        for item in agentspecs:
            agent_spec_id = str(item.get("id") or "")
            agent_spec_link = _agentspec_details_url(agent_spec_id)
            agentspec_rows.append(
                [
                    agent_spec_id,
                    str(item.get("name") or item.get("id") or ""),
                    str(item.get("model") or "-"),
                    str(item.get("version") or "-"),
                    str(int(item.get("experiments") or 0)),
                    str(int(item.get("runs") or 0)),
                    f"[Open]({agent_spec_link})" if agent_spec_link else "-",
                ]
            )
        lines.extend(
            _markdown_table(
                [
                    "Agentspec ID",
                    "Agentspec",
                    "Model",
                    "Version",
                    "Experiments",
                    "Runs",
                    "Details",
                ],
                agentspec_rows,
                ["left", "left", "left", "left", "right", "right", "left"],
            )
        )
        lines.append("")
        appendix_lines.append("## Appendix: Agentspec Details")
        appendix_lines.append("")
        for item in agentspecs:
            agent_spec_id = str(item.get("id") or "")
            agent_spec_link = _agentspec_details_url(agent_spec_id)
            display_name = str(item.get("name") or agent_spec_id or "-")
            emoji = str(item.get("emoji") or "").strip()
            heading = f"{emoji} {display_name}".strip()
            appendix_lines.append(f"### {heading}")
            appendix_lines.append("")
            appendix_lines.append(f"- ID: `{agent_spec_id or '-'}`")
            description = str(item.get("description") or "").strip()
            if description:
                appendix_lines.append(f"- Description: {description}")
            model = str(item.get("model") or "").strip()
            if model:
                appendix_lines.append(f"- Model: {model}")
            version = str(item.get("version") or "").strip()
            if version:
                appendix_lines.append(f"- Version: {version}")
            color = str(item.get("color") or "").strip()
            if color:
                appendix_lines.append(f"- Color: {color}")
            tags = item.get("tags")
            if isinstance(tags, list) and tags:
                appendix_lines.append(f"- Tags: {', '.join(str(tag) for tag in tags)}")
            experiment_names = item.get("experiment_names")
            if isinstance(experiment_names, list) and experiment_names:
                appendix_lines.append(
                    f"- Experiments ({len(experiment_names)}): "
                    + ", ".join(str(name) for name in experiment_names)
                )
            appendix_lines.append(
                f"- Runs analysed: {int(item.get('runs') or 0)}"
            )
            if agent_spec_link:
                appendix_lines.append(f"- Details: [Open in Datalayer]({agent_spec_link})")
            appendix_lines.append("")
    else:
        lines.append("No agentspec metadata found in experiment/run payloads.")
    lines.append("")

    evalset_evaluators = [
        item for item in (report.get("evalset_evaluators") or []) if isinstance(item, dict)
    ]
    report_evaluators = [
        item for item in (report.get("report_evaluators") or []) if isinstance(item, dict)
    ]
    evaluator_results = [
        item for item in (report.get("evaluator_results") or []) if isinstance(item, dict)
    ]
    lines.append("## Evaluator Results")
    lines.append("")
    lines.append(
        "Evalset-scoped evaluators run for each case; report-scoped evaluators run once "
        "over the aggregated report. Scores are aggregated across all runs in the run "
        "window (full evaluator configuration is in the appendix)."
    )
    lines.append("")
    if evaluator_results:
        lines.append(
            "Runs Passed counts runs where the evaluator passed; Latest reflects the "
            "most recent run."
        )
        lines.append("")
        result_rows: list[list[str]] = []
        for item in evaluator_results:
            runs_count = int(item.get("runs") or 0)
            passed_runs = int(item.get("passed_runs") or 0)
            mean_score = item.get("mean_score")
            latest_score = item.get("latest_score")
            result_rows.append(
                [
                    str(item.get("name") or "-"),
                    str(item.get("scope") or "-"),
                    f"{passed_runs}/{runs_count}",
                    f"{float(mean_score):.3f}" if isinstance(mean_score, (int, float)) else "-",
                    f"{float(latest_score):.3f}" if isinstance(latest_score, (int, float)) else "-",
                    "pass" if item.get("latest_passed") else "fail",
                    str(item.get("summary") or "-"),
                ]
            )
        lines.extend(
            _markdown_table(
                ["Evaluator", "Scope", "Runs Passed", "Mean Score", "Latest Score", "Latest", "Summary"],
                result_rows,
                ["left", "left", "right", "right", "right", "left", "left"],
            )
        )
    else:
        lines.append(
            "No evaluator results recorded. Runs that store `evaluator_results` "
            "in their metrics populate this section."
        )
    lines.append("")

    appendix_lines.append("## Appendix: Evaluator Configuration")
    appendix_lines.append("")
    appendix_lines.append(
        "Evalset-level evaluators run for each case; report-level evaluators run once "
        "after all cases. Evaluator names are resolved at runtime via the Pydantic "
        "evaluator registries."
    )
    appendix_lines.append("")
    appendix_lines.append("### Evalset Evaluators")
    appendix_lines.append("")
    if evalset_evaluators:
        appendix_lines.append("```json")
        appendix_lines.append(json.dumps(evalset_evaluators, ensure_ascii=False, indent=2, sort_keys=True))
        appendix_lines.append("```")
    else:
        appendix_lines.append("No evalset-level evaluators configured.")
    appendix_lines.append("")
    appendix_lines.append("### Report Evaluators")
    appendix_lines.append("")
    if report_evaluators:
        appendix_lines.append("```json")
        appendix_lines.append(json.dumps(report_evaluators, ensure_ascii=False, indent=2, sort_keys=True))
        appendix_lines.append("```")
    else:
        appendix_lines.append("No report-level evaluators configured.")
    appendix_lines.append("")

    appendix_lines.append("## Appendix: Evalset Cases")
    appendix_lines.append("")
    appendix_lines.append(f"{len(cases)} case(s) in this evalset.")
    appendix_lines.append("")
    if cases:
        case_rows: list[list[str]] = []
        for case in cases:
            expected_output = case.get("expected_output")
            if expected_output is None:
                expected_output = case.get("expected")
            case_rows.append(
                [
                    str(case.get("name") or "-"),
                    str(case.get("id") or "-"),
                    _compact_json(case.get("inputs")),
                    _compact_json(expected_output),
                    _compact_json(case.get("evaluators")),
                    _compact_json(case.get("metadata")),
                ]
            )
        appendix_lines.extend(
            _markdown_table(
                ["Case", "ID", "Inputs", "Expected Output", "Evaluators", "Metadata"],
                case_rows,
                ["left", "left", "left", "left", "left", "left"],
            )
        )
    else:
        appendix_lines.append("No cases returned for this evalset.")
    appendix_lines.append("")

    lines.extend(_per_case_outcome_lines(experiments, colorize=colorize))

    lines.append("## Experiment Overview")
    lines.append("")
    overview_rows: list[list[str]] = []
    for experiment in experiments:
        runs_fetched = int(experiment.get("runs_fetched") or 0)
        runs_total = int(experiment.get("runs_total") or 0)
        overview_rows.append(
            [
                f"{experiment.get('name', '')}",
                str(experiment.get('agent_spec_name') or experiment.get('agent_spec_id') or '-'),
                f"{runs_fetched}/{runs_total}",
                _fmt_pct(experiment.get('latest_pass_rate') if isinstance(experiment.get('latest_pass_rate'), (int, float)) else None),
                _fmt_pct(experiment.get('baseline_pass_rate') if isinstance(experiment.get('baseline_pass_rate'), (int, float)) else None),
                _fmt_delta(experiment.get('drift_delta') if isinstance(experiment.get('drift_delta'), (int, float)) else None, colorize=colorize),
                _fmt_delta(experiment.get('latest_two_delta') if isinstance(experiment.get('latest_two_delta'), (int, float)) else None, colorize=colorize),
            ]
        )
    lines.extend(
        _markdown_table(
            ["Experiment", "Agentspec", "Runs (fetched/total)", "Latest", "Baseline", "Drift", "Latest-2 Delta"],
            overview_rows,
            ["left", "left", "right", "right", "right", "right", "right"],
        )
    )
    lines.append("")

    appendix_lines.extend(_report_analyses_lines(report))

    lines.append("## Comparison Combinations")
    lines.append("")

    ranked_latest = sorted(
        [item for item in experiments if isinstance(item.get("latest_pass_rate"), (int, float))],
        key=lambda item: float(item.get("latest_pass_rate") or 0.0),
        reverse=True,
    )
    lines.append("### By Latest Pass Rate")
    lines.append("")
    latest_rows: list[list[str]] = []
    for idx, item in enumerate(ranked_latest, start=1):
        latest_rows.append([str(idx), f"{item.get('name', '')}", _fmt_pct(float(item.get('latest_pass_rate') or 0.0))])
    lines.extend(_markdown_table(["Rank", "Experiment", "Latest"], latest_rows, ["right", "left", "right"]))
    latest_values = [
        float(item.get("latest_pass_rate"))
        for item in ranked_latest
        if isinstance(item.get("latest_pass_rate"), (int, float))
    ]
    lines.append("")
    lines.append("Latest pass-rate histogram (pts):")
    for hist_line in _ascii_histogram(
        latest_values,
        bins=8,
        width=20,
        min_value=0.0,
        max_value=1.0,
        full_blocks=True,
        colorize=colorize,
    ):
        lines.append(f"`{hist_line}`")
    lines.append("")

    ranked_drift = sorted(
        [item for item in experiments if isinstance(item.get("drift_delta"), (int, float))],
        key=lambda item: float(item.get("drift_delta") or 0.0),
    )
    lines.append("### By Drift (Most Negative To Most Positive)")
    lines.append("")
    drift_rows: list[list[str]] = []
    for idx, item in enumerate(ranked_drift, start=1):
        drift_rows.append([str(idx), f"{item.get('name', '')}", _fmt_delta(float(item.get('drift_delta') or 0.0), colorize=colorize)])
    lines.extend(_markdown_table(["Rank", "Experiment", "Drift"], drift_rows, ["right", "left", "right"]))
    drift_values = [
        float(item.get("drift_delta"))
        for item in ranked_drift
        if isinstance(item.get("drift_delta"), (int, float))
    ]
    lines.append("")
    lines.append("Drift histogram (delta pts):")
    for hist_line in _ascii_histogram(
        drift_values,
        bins=8,
        width=20,
        full_blocks=True,
        colorize=colorize,
        drift_palette=True,
    ):
        lines.append(f"`{hist_line}`")
    lines.append("")

    ranked_stability = sorted(
        [item for item in experiments if isinstance(item.get("stddev_pass_rate"), (int, float))],
        key=lambda item: float(item.get("stddev_pass_rate") or 0.0),
    )
    lines.append("### By Stability (Lowest Pass-Rate StdDev)")
    lines.append("")
    stability_rows: list[list[str]] = []
    for idx, item in enumerate(ranked_stability, start=1):
        stddev = item.get("stddev_pass_rate")
        mean = item.get("mean_pass_rate")
        stability_rows.append(
            [
                str(idx),
                f"{item.get('name', '')}",
                (f"{float(stddev) * 100:.2f} pts" if isinstance(stddev, (int, float)) else "n/a"),
                (_fmt_pct(float(mean)) if isinstance(mean, (int, float)) else "n/a"),
            ]
        )
    lines.extend(_markdown_table(["Rank", "Experiment", "StdDev", "Mean"], stability_rows, ["right", "left", "right", "right"]))
    lines.append("")

    lines.append("### Token Usage Across Runs By Experiment")
    lines.append("")
    lines.append(
        "Total tokens across fetched runs for each experiment. Trends are ordered oldest to newest run."
    )
    lines.append("")
    token_rows: list[list[str]] = []
    for experiment in experiments:
        experiment_name = str(experiment.get("name") or "")
        runs = [run for run in (experiment.get("runs") or []) if isinstance(run, dict)]
        runs_sorted = sorted(
            runs,
            key=lambda run: datetime.fromisoformat(
                str(run.get("created_at") or "").replace("Z", "+00:00")
            )
            if str(run.get("created_at") or "").strip()
            else datetime.min.replace(tzinfo=timezone.utc),
        )
        token_values = [
            float(tokens)
            for tokens in (_run_total_tokens(run) for run in runs_sorted)
            if isinstance(tokens, (int, float))
        ]
        latest_tokens = token_values[-1] if token_values else None
        mean_tokens = (sum(token_values) / len(token_values)) if token_values else None
        total_tokens = sum(token_values) if token_values else None
        token_rows.append(
            [
                experiment_name,
                f"{len(token_values)}/{len(runs_sorted)}",
                (f"{int(round(latest_tokens)):,}" if isinstance(latest_tokens, (int, float)) else "-"),
                (f"{int(round(mean_tokens)):,}" if isinstance(mean_tokens, (int, float)) else "-"),
                (f"{int(round(total_tokens)):,}" if isinstance(total_tokens, (int, float)) else "-"),
                f"`{_sparkline(token_values, colorize=colorize) if token_values else 'n/a'}`",
            ]
        )
    if not token_rows:
        token_rows.append(["n/a", "0/0", "-", "-", "-", "`n/a`"])
    lines.extend(
        _markdown_table(
            ["Experiment", "Runs With Tokens", "Latest Tokens", "Mean Tokens", "Total Tokens", "Token Trend"],
            token_rows,
            ["left", "right", "right", "right", "right", "left"],
        )
    )
    lines.append("")

    pairwise = _pairwise_latest_deltas(experiments)
    within_agentspec_pairs = [
        pair for pair in pairwise if str(pair.get("group") or "") == "within_agentspec"
    ]
    cross_agentspec_pairs = [
        pair for pair in pairwise if str(pair.get("group") or "") == "cross_agentspec"
    ]
    lines.append("### Pairwise Latest-Pass Deltas")
    lines.append("")
    pair_rows: list[list[str]] = []
    for pair in pairwise:
        pair_rows.append(
            [
                f"{pair['left']} vs {pair['right']}",
                _fmt_pct(pair['left_latest']),
                _fmt_pct(pair['right_latest']),
                _fmt_delta(pair['delta'], colorize=colorize),
            ]
        )
    if not pairwise:
        pair_rows.append(["n/a", "n/a", "n/a", "n/a"])
    lines.extend(
        _markdown_table(
            ["Pair", "Left Latest", "Right Latest", "Delta (Left-Right)"],
            pair_rows,
            ["left", "right", "right", "right"],
        )
    )
    pair_deltas = [float(pair["delta"]) for pair in pairwise if isinstance(pair.get("delta"), (int, float))]
    lines.append("")
    lines.append("Pairwise latest-delta histogram (pts):")
    for hist_line in _ascii_histogram(
        pair_deltas,
        bins=8,
        width=20,
        full_blocks=True,
        colorize=colorize,
        drift_palette=True,
    ):
        lines.append(f"`{hist_line}`")
    lines.append("")

    lines.append("### Within-Agentspec Pairwise Latest-Pass Deltas")
    lines.append("")
    within_pair_rows: list[list[str]] = []
    for pair in within_agentspec_pairs:
        within_pair_rows.append(
            [
                f"{pair['left']} vs {pair['right']}",
                str(pair.get('left_agent_spec_name') or pair.get('left_agent_spec_id') or '-'),
                _fmt_pct(pair['left_latest']),
                _fmt_pct(pair['right_latest']),
                _fmt_delta(pair['delta'], colorize=colorize),
            ]
        )
    if not within_pair_rows:
        within_pair_rows.append(["n/a", "n/a", "n/a", "n/a", "n/a"])
    lines.extend(
        _markdown_table(
            ["Pair", "Agentspec", "Left Latest", "Right Latest", "Delta (Left-Right)"],
            within_pair_rows,
            ["left", "left", "right", "right", "right"],
        )
    )
    lines.append("")

    lines.append("### Cross-Agentspec Pairwise Latest-Pass Deltas")
    lines.append("")
    cross_pair_rows: list[list[str]] = []
    for pair in cross_agentspec_pairs:
        cross_pair_rows.append(
            [
                f"{pair['left']} ({pair.get('left_agent_spec_name') or pair.get('left_agent_spec_id') or '-'}) vs {pair['right']} ({pair.get('right_agent_spec_name') or pair.get('right_agent_spec_id') or '-'})",
                _fmt_pct(pair['left_latest']),
                _fmt_pct(pair['right_latest']),
                _fmt_delta(pair['delta'], colorize=colorize),
            ]
        )
    if not cross_pair_rows:
        cross_pair_rows.append(["n/a", "n/a", "n/a", "n/a"])
    lines.extend(
        _markdown_table(
            ["Pair", "Left Latest", "Right Latest", "Delta (Left-Right)"],
            cross_pair_rows,
            ["left", "right", "right", "right"],
        )
    )
    lines.append("")

    appendix_lines.append("## Appendix: Heatmaps")
    appendix_lines.append("")
    appendix_lines.append("Pass-rate heatmap by experiment and run window:")
    appendix_lines.append("")
    appendix_lines.append("```text")
    appendix_lines.extend(_ascii_passrate_heatmap(experiments, max_columns=12, colorize=False))
    appendix_lines.append("```")
    appendix_lines.append("")
    appendix_lines.append("Consecutive delta heatmap (A-B) by experiment:")
    appendix_lines.append("")
    appendix_lines.append("```text")
    appendix_lines.extend(_ascii_drift_heatmap(experiments, max_columns=12, colorize=False))
    appendix_lines.append("```")
    appendix_lines.append("")

    lines.append("### Insight Highlights")
    lines.append("")
    best_latest = ranked_latest[0] if ranked_latest else None
    worst_latest = ranked_latest[-1] if ranked_latest else None
    most_negative = ranked_drift[0] if ranked_drift else None
    most_positive = ranked_drift[-1] if ranked_drift else None
    most_stable = ranked_stability[0] if ranked_stability else None
    if best_latest:
        lines.append(
            "- Top latest pass-rate: "
            + f"{best_latest.get('name', '')} ({_fmt_pct(float(best_latest.get('latest_pass_rate') or 0.0))})."
        )
    if worst_latest:
        lines.append(
            "- Lowest latest pass-rate: "
            + f"{worst_latest.get('name', '')} ({_fmt_pct(float(worst_latest.get('latest_pass_rate') or 0.0))})."
        )
    if most_positive:
        drift_pos = float(most_positive.get("drift_delta") or 0.0)
        lines.append(
            "- Strongest positive drift: "
            + f"{most_positive.get('name', '')} ({_fmt_delta(drift_pos, colorize=colorize)})."
        )
    if most_negative:
        drift_neg = float(most_negative.get("drift_delta") or 0.0)
        lines.append(
            "- Strongest negative drift: "
            + f"{most_negative.get('name', '')} ({_fmt_delta(drift_neg, colorize=colorize)})."
        )
    if most_stable:
        std = most_stable.get("stddev_pass_rate")
        mean = most_stable.get("mean_pass_rate")
        lines.append(
            "- Stability leader: "
            + f"{most_stable.get('name', '')} "
            + f"(stddev={(float(std) * 100):.2f} pts, mean={_fmt_pct(float(mean)) if isinstance(mean, (int, float)) else 'n/a'})."
        )

    drift_neg_count = len([value for value in drift_values if value < 0])
    drift_flat_count = len([value for value in drift_values if value == 0])
    drift_pos_count = len([value for value in drift_values if value > 0])
    total = max(1, drift_neg_count + drift_flat_count + drift_pos_count)
    neg_meter = "█" * int(round((drift_neg_count / total) * 14))
    flat_meter = "█" * int(round((drift_flat_count / total) * 14))
    pos_meter = "█" * int(round((drift_pos_count / total) * 14))
    neg_meter = neg_meter or "·"
    flat_meter = flat_meter or "·"
    pos_meter = pos_meter or "·"
    lines.append("")
    lines.append("Drift balance meter:")
    lines.append(
        "`NEG "
        + _style_text(neg_meter, "red", colorize)
        + f" ({drift_neg_count}) | FLAT "
        + _style_text(flat_meter, "yellow", colorize)
        + f" ({drift_flat_count}) | POS "
        + _style_text(pos_meter, "green", colorize)
        + f" ({drift_pos_count})`"
    )
    lines.append("")

    appendix_lines.append("## Appendix: Per-Experiment Details")
    appendix_lines.append("")
    for experiment in experiments:
        appendix_lines.append(f"### {experiment.get('name', '')}")
        appendix_lines.append("")
        agent_spec_id = str(experiment.get("agent_spec_id") or "")
        agent_spec_label = str(experiment.get('agent_spec_name') or agent_spec_id or '-')
        agent_spec_link = _agentspec_details_url(agent_spec_id)
        if agent_spec_link:
            appendix_lines.append(f"Agentspec: [{agent_spec_label}]({agent_spec_link})")
        else:
            appendix_lines.append(f"Agentspec: {agent_spec_label}")
        if evalset_runs_url:
            appendix_lines.append(f"Evalset run details: [Open run page]({evalset_runs_url})")
        appendix_lines.append("")
        appendix_lines.append("#### Run Timeline")
        appendix_lines.append("")
        run_rows: list[list[str]] = []
        runs = [run for run in (experiment.get("runs") or []) if isinstance(run, dict)]
        token_timeline_values: list[float] = []
        for idx, run in enumerate(runs, start=1):
            pass_rate = run.get("pass_rate") if isinstance(run.get("pass_rate"), (int, float)) else None
            total_tokens = _run_total_tokens(run)
            if isinstance(total_tokens, (int, float)):
                token_timeline_values.append(float(total_tokens))
            cause_text = _format_failure_cause(run.get("failure_cause"))
            run_id = str(run.get('id', ''))
            run_link = _run_overlay_url(evalset_runs_url, run_id)
            run_rows.append(
                [
                    str(idx),
                    (f"[{run_id}]({run_link})" if run_link and run_id else run_id),
                    str(run.get('status', '')),
                    _fmt_pct(float(pass_rate)) if isinstance(pass_rate, (int, float)) else 'n/a',
                    (f"{int(round(total_tokens)):,}" if isinstance(total_tokens, (int, float)) else "-"),
                    f"`{_ascii_bar(float(pass_rate), full_blocks=True, colorize=colorize) if isinstance(pass_rate, (int, float)) else '-'}`",
                    cause_text or "-",
                ]
            )
        if not runs:
            run_rows.append(["1", "n/a", "n/a", "n/a", "-", "`-`", "-"])
        appendix_lines.extend(
            _markdown_table(
                ["#", "Run ID", "Status", "Pass Rate", "Total Tokens", "ASCII Trend", "Failure Cause"],
                run_rows,
                ["right", "left", "left", "right", "right", "left", "left"],
            )
        )
        appendix_lines.append("")
        failure_rows: list[list[str]] = []
        for idx, run in enumerate(runs, start=1):
            cause = run.get("failure_cause")
            if not isinstance(cause, dict) or not cause:
                continue
            detail = str(cause.get("detail_excerpt") or "").strip()
            detail_single = " ".join(detail.split())
            if len(detail_single) > 240:
                detail_single = detail_single[:237] + "..."
            failure_rows.append(
                [
                    str(idx),
                    str(run.get("id", "")),
                    str(cause.get("stage") or "-"),
                    str(cause.get("type") or "-"),
                    str(cause.get("message") or "-"),
                    detail_single or "-",
                ]
            )
        if failure_rows:
            appendix_lines.append("#### Failure Causes")
            appendix_lines.append("")
            appendix_lines.extend(
                _markdown_table(
                    ["#", "Run ID", "Stage", "Type", "Message", "Detail Excerpt"],
                    failure_rows,
                    ["right", "left", "left", "left", "left", "left"],
                )
            )
            appendix_lines.append("")
            for idx, run in enumerate(runs, start=1):
                cause = run.get("failure_cause")
                if not isinstance(cause, dict) or not cause:
                    continue
                detail_lines = _failure_cause_detail_lines(cause)
                if not detail_lines:
                    continue
                appendix_lines.append(f"<details><summary>Run {idx} failure detail ({run.get('id', '')})</summary>")
                appendix_lines.append("")
                appendix_lines.extend(detail_lines)
                appendix_lines.append("")
                appendix_lines.append("</details>")
                appendix_lines.append("")
        timeline_values = [
            float(run.get("pass_rate"))
            for run in runs
            if isinstance(run.get("pass_rate"), (int, float))
        ]
        appendix_lines.append(
            "Pass-rate sparkline: "
            + f"`{_sparkline(timeline_values, colorize=colorize) if timeline_values else 'n/a'}`"
        )
        appendix_lines.append(
            "Token usage sparkline: "
            + f"`{_sparkline(token_timeline_values, colorize=colorize) if token_timeline_values else 'n/a'}`"
        )
        appendix_lines.append("")

        comparisons = [
            item for item in (experiment.get("consecutive_comparisons") or [])
            if isinstance(item, dict)
        ]
        appendix_lines.append("#### Consecutive Run Deltas (A-B)")
        appendix_lines.append("")
        comparison_rows: list[list[str]] = []
        for item in comparisons:
            run_a = item.get("run_a_pass_rate") if isinstance(item.get("run_a_pass_rate"), (int, float)) else None
            run_b = item.get("run_b_pass_rate") if isinstance(item.get("run_b_pass_rate"), (int, float)) else None
            delta = item.get("delta_pass_rate") if isinstance(item.get("delta_pass_rate"), (int, float)) else None
            comparison_rows.append(
                [
                    str(item.get('run_a_id', '')),
                    str(item.get('run_b_id', '')),
                    _fmt_pct(float(run_a)) if isinstance(run_a, (int, float)) else 'n/a',
                    _fmt_pct(float(run_b)) if isinstance(run_b, (int, float)) else 'n/a',
                    _fmt_delta(float(delta), colorize=colorize) if isinstance(delta, (int, float)) else 'n/a',
                ]
            )
        if not comparisons:
            comparison_rows.append(["n/a", "n/a", "n/a", "n/a", "n/a"])
        appendix_lines.extend(_markdown_table(["Run A", "Run B", "A Pass", "B Pass", "Delta"], comparison_rows, ["left", "left", "right", "right", "right"]))
        appendix_lines.append("")

    lines.append("## Notes")
    lines.append("")
    lines.append("- Drift is computed as latest - baseline.")
    lines.append("- Baseline uses the first half of fetched runs (minimum 1, maximum 3).")
    lines.append("- Latest-2 delta uses the latest two runs returned in the fetched window.")
    lines.append("")

    appendix_lines.extend(
        _report_appendix_lines(
            experiments,
            evalset_runs_url,
            case_by_name=case_by_name,
            representative_case_name=representative_case_name,
        )
    )

    if appendix_lines:
        lines.append("# Appendices")
        lines.append("")
        lines.append(
            "Full configuration, cases, heatmaps, per-experiment timelines, and per-run "
            "details are collected below to keep the summary above readable."
        )
        lines.append("")
        lines.extend(appendix_lines)

    return "\n".join(lines)


def _appendix_metric_int(metrics: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = metrics.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return str(int(value))
    return "-"


def _appendix_metric_float(metrics: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = metrics.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return f"{float(value):.3f}"
    return "-"


# Candidate paths mirror the in-app run-details overlay
# (`getRunInteractionDetails` in AIEvals.tsx) so the report renders the same
# prompt/output the UI shows.
_PROMPT_CANDIDATE_PATHS: tuple[tuple[str, str], ...] = (
    ("summary", "agent_prompt"),
    ("summary", "sent_prompt"),
    ("summary", "prompt"),
    ("report", "agent_prompt"),
    ("report", "sent_prompt"),
    ("report", "prompt"),
)

_OUTPUT_CANDIDATE_PATHS: tuple[tuple[str, str], ...] = (
    ("summary", "agent_output"),
    ("summary", "output"),
    ("report", "agent_output"),
    ("report", "output"),
    ("report", "parsed"),
    ("summary", "agent_output_text"),
    ("report", "agent_output_text"),
    ("report", "raw_excerpt"),
)


def _run_interaction_value(
    run: dict[str, Any], paths: tuple[tuple[str, str], ...]
) -> Any:
    """Return the first non-empty value found along the candidate paths."""
    for container_key, field in paths:
        container = run.get(container_key)
        if isinstance(container, dict):
            value = container.get(field)
            if value is not None:
                return value
    return None


def _format_display_value(value: Any) -> tuple[str, str]:
    """Render a value the way the UI overlay does.

    Returns a ``(language, text)`` tuple so callers can fence the content
    with the right code-block language hint.
    """
    if value is None:
        return "text", "(none)"
    if isinstance(value, str):
        return "text", value
    try:
        return "json", json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
    except Exception:
        return "text", str(value)


def _fenced_block(language: str, text: str) -> list[str]:
    """Emit a fenced code block, guarding against backtick collisions."""
    body = text if text != "" else "(empty)"
    return [f"```{language}", *body.splitlines(), "```"]


def _extract_case_prompt(case_record: dict[str, Any] | None) -> Any:
    if not isinstance(case_record, dict):
        return None
    inputs = case_record.get("inputs")
    if not isinstance(inputs, dict):
        return None
    for key in ("prompt", "text", "query", "message"):
        value = inputs.get(key)
        if value is not None:
            return value
    return inputs


def _extract_case_prompt_from_result(case_result: dict[str, Any]) -> Any:
    for key in ("prompt", "input", "inputs", "case_input"):
        value = case_result.get(key)
        if value is not None:
            return value
    return None


def _extract_case_output_from_result(case_result: dict[str, Any]) -> Any:
    for key in ("output", "actual_output", "response", "result"):
        value = case_result.get(key)
        if value is not None:
            return value
    return None


def _is_synthetic_run(run: dict[str, Any]) -> bool:
    summary = run.get("summary") if isinstance(run.get("summary"), dict) else {}
    report = run.get("report") if isinstance(run.get("report"), dict) else {}
    if summary.get("synthetic") is True or report.get("synthetic") is True:
        return True
    output = summary.get("agent_output")
    if isinstance(output, dict):
        if output.get("synthetic") is True:
            return True
        if output.get("mode") == "synthetic":
            return True
    return False


def _synthetic_case_output(
    run: dict[str, Any],
    case_record: dict[str, Any] | None,
    case_result: dict[str, Any],
    *,
    representative_case_name: str | None,
    case_name: str,
) -> Any:
    """Build per-case output for synthetic runs to mirror UI case switching."""
    run_output = _run_interaction_value(run, _OUTPUT_CANDIDATE_PATHS)
    if representative_case_name and case_name == representative_case_name:
        return run_output
    if case_result.get("passed"):
        if isinstance(case_record, dict) and "expected_output" in case_record:
            return case_record.get("expected_output")
        return None
    if isinstance(case_record, dict):
        inputs = case_record.get("inputs")
        if isinstance(inputs, dict):
            return (
                inputs.get("text")
                or inputs.get("prompt")
                or inputs.get("query")
                or inputs.get("message")
                or "(no usable answer — regressed run)"
            )
    return "(no usable answer — regressed run)"


def _run_detail_block_lines(
    idx: int,
    run: dict[str, Any],
    case_by_name: dict[str, dict[str, Any]],
    *,
    representative_case_name: str | None,
) -> list[str]:
    """Render the full per-run detail shown by the in-app overlay.

    Mirrors the run-details dialog in AIEvals.tsx: prompt sent, agent output
    received, run summary, and run report.
    """
    run_id = str(run.get("id", "") or "")
    status = str(run.get("status", "") or "unknown")
    created = str(run.get("created_at", "") or "-")
    pass_rate = run.get("pass_rate")
    pass_text = (
        _fmt_pct(float(pass_rate)) if isinstance(pass_rate, (int, float)) else "n/a"
    )

    lines: list[str] = []
    summary_label = run_id or f"run {idx}"
    lines.append(
        f"<details><summary>Run {idx} — {summary_label} "
        f"(status: {status}, pass rate: {pass_text})</summary>"
    )
    lines.append("")
    lines.append(f"- Run ID: `{run_id or '-'}`")
    lines.append(f"- Status: {status}")
    lines.append(f"- Pass rate: {pass_text}")
    lines.append(f"- Created: {created}")
    summary_for_header = (
        run.get("summary") if isinstance(run.get("summary"), dict) else {}
    )
    runtime_pod = str(summary_for_header.get("runtime_pod_name") or "").strip()
    if runtime_pod:
        lines.append(f"- Runtime: `{runtime_pod}`")
    runtime_id = str(summary_for_header.get("runtime_id") or "").strip()
    if runtime_id:
        lines.append(f"- Runtime ID: `{runtime_id}`")
    lines.append("")

    metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
    case_results = metrics.get("case_results")
    if isinstance(case_results, list) and case_results:
        lines.append("**Per-Case Results**")
        lines.append("")
        case_rows: list[list[str]] = []
        for case_result in case_results:
            if not isinstance(case_result, dict):
                continue
            score = case_result.get("score")
            case_rows.append(
                [
                    str(case_result.get("name") or "-"),
                    "✅ pass" if case_result.get("passed") else "❌ fail",
                    f"{float(score):.3f}" if isinstance(score, (int, float)) else "-",
                    str(case_result.get("category") or "-"),
                    str(case_result.get("difficulty") or "-"),
                ]
            )
        if case_rows:
            lines.extend(
                _markdown_table(
                    ["Case", "Result", "Score", "Category", "Difficulty"],
                    case_rows,
                    ["left", "left", "right", "left", "left"],
                )
            )
            lines.append("")

        lines.append("**Per-Case Prompts and Outputs**")
        lines.append("")
        synthetic_run = _is_synthetic_run(run)
        for case_result in case_results:
            if not isinstance(case_result, dict):
                continue
            case_name = str(case_result.get("name") or "-")
            case_record = case_by_name.get(case_name)
            prompt_value = _extract_case_prompt(case_record)
            if prompt_value is None:
                prompt_value = _extract_case_prompt_from_result(case_result)
            if synthetic_run:
                output_value = _synthetic_case_output(
                    run,
                    case_record,
                    case_result,
                    representative_case_name=representative_case_name,
                    case_name=case_name,
                )
            else:
                output_value = _extract_case_output_from_result(case_result)
                if output_value is None:
                    output_value = "(per-case output not captured for this run)"
            expected_value = (
                case_record.get("expected_output") if isinstance(case_record, dict) else None
            )
            metadata_value = (
                case_record.get("metadata") if isinstance(case_record, dict) else None
            )
            evaluators_value = (
                case_record.get("evaluators") if isinstance(case_record, dict) else None
            )
            prompt_lang, prompt_text = _format_display_value(prompt_value)
            output_lang, output_text = _format_display_value(output_value)
            expected_lang, expected_text = _format_display_value(expected_value)
            metadata_lang, metadata_text = _format_display_value(metadata_value)
            evaluators_lang, evaluators_text = _format_display_value(evaluators_value)
            result_text = "pass" if case_result.get("passed") else "fail"
            score = case_result.get("score")
            score_text = f"{float(score):.3f}" if isinstance(score, (int, float)) else "-"
            category_text = str(case_result.get("category") or "-")
            difficulty_text = str(case_result.get("difficulty") or "-")
            lines.append(
                f"<details><summary>Case {case_name} ({result_text}, score: {score_text})</summary>"
            )
            lines.append("")
            lines.append(f"- Category: {category_text}")
            lines.append(f"- Difficulty: {difficulty_text}")
            lines.append("")
            lines.append("**Prompt**")
            lines.append("")
            lines.extend(_fenced_block(prompt_lang, prompt_text))
            lines.append("")
            lines.append("**Output**")
            lines.append("")
            lines.extend(_fenced_block(output_lang, output_text))
            lines.append("")
            lines.append("**Expected Output**")
            lines.append("")
            lines.extend(_fenced_block(expected_lang, expected_text))
            lines.append("")
            lines.append("**Case Metadata**")
            lines.append("")
            lines.extend(_fenced_block(metadata_lang, metadata_text))
            lines.append("")
            lines.append("**Case Evaluators**")
            lines.append("")
            lines.extend(_fenced_block(evaluators_lang, evaluators_text))
            lines.append("")
            lines.append("</details>")
            lines.append("")

    prompt_lang, prompt_text = _format_display_value(
        _run_interaction_value(run, _PROMPT_CANDIDATE_PATHS)
    )
    lines.append("**Prompt Sent**")
    lines.append("")
    lines.extend(_fenced_block(prompt_lang, prompt_text))
    lines.append("")

    output_lang, output_text = _format_display_value(
        _run_interaction_value(run, _OUTPUT_CANDIDATE_PATHS)
    )
    lines.append("**Agent Output Received**")
    lines.append("")
    lines.extend(_fenced_block(output_lang, output_text))
    lines.append("")

    usage = _extract_run_usage(run)
    if usage:
        lines.append("**Pydantic AI Usage**")
        lines.append("")
        preferred_keys = [
            "source",
            "provider",
            "model",
            "requests",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "input_cached_tokens",
            "tool_calls",
            "duration_ms",
            "credits_consumed",
            "captured_at",
            "reservation_id",
            "runtime_pod_name",
        ]
        usage_rows: list[list[str]] = []
        for key in preferred_keys:
            if key not in usage:
                continue
            usage_rows.append([key, str(usage.get(key) or "-")])
        for key in sorted(str(k) for k in usage.keys()):
            if key in preferred_keys:
                continue
            usage_rows.append([key, str(usage.get(key) or "-")])
        if usage_rows:
            lines.extend(_markdown_table(["Metric", "Value"], usage_rows, ["left", "left"]))
            lines.append("")
        usage_lang, usage_text = _format_display_value(usage)
        lines.append("Raw usage payload:")
        lines.append("")
        lines.extend(_fenced_block(usage_lang, usage_text))
        lines.append("")

    summary = run.get("summary") if isinstance(run.get("summary"), dict) else {}
    summary_lang, summary_text = _format_display_value(summary)
    lines.append("**Run Summary**")
    lines.append("")
    lines.extend(_fenced_block(summary_lang, summary_text))
    lines.append("")

    report = run.get("report") if isinstance(run.get("report"), dict) else {}
    report_lang, report_text = _format_display_value(report)
    lines.append("**Run Report**")
    lines.append("")
    lines.extend(_fenced_block(report_lang, report_text))
    lines.append("")

    cause = run.get("failure_cause")
    if isinstance(cause, dict) and cause:
        detail_lines = _failure_cause_detail_lines(cause)
        if detail_lines:
            lines.append("**Failure Cause**")
            lines.append("")
            lines.extend(detail_lines)
            lines.append("")

    lines.append("</details>")
    lines.append("")
    return lines


def _extract_run_usage(run: dict[str, Any]) -> dict[str, Any]:
    def _coerce_usage(candidate: Any) -> dict[str, Any]:
        if not isinstance(candidate, dict) or not candidate:
            return {}
        nested = candidate.get("pydantic_ai_usage")
        if isinstance(nested, dict) and nested:
            merged = dict(nested)
            for key, value in candidate.items():
                if key == "pydantic_ai_usage":
                    continue
                merged.setdefault(str(key), value)
            return merged
        return dict(candidate)

    # Prefer usage already normalized onto run detail records.
    direct_usage = _coerce_usage(run.get("usage"))
    if direct_usage:
        return direct_usage

    metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
    for key in ("pydantic_ai_usage", "usage"):
        usage = _coerce_usage(metrics.get(key))
        if usage:
            return usage

    summary = run.get("summary") if isinstance(run.get("summary"), dict) else {}
    for key in ("pydantic_ai_usage", "usage"):
        usage = _coerce_usage(summary.get(key))
        if usage:
            return usage

    report_payload = run.get("report") if isinstance(run.get("report"), dict) else {}
    report_usage = _coerce_usage(report_payload.get("usage"))
    if report_usage:
        return report_usage
    return {}


def _usage_pick(usage: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = usage.get(key)
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None


def _usage_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except Exception:
            return None
    return None


def _usage_total_tokens_value(usage: dict[str, Any]) -> str:
    total_value = _usage_number(
        _usage_pick(
            usage,
            "total_tokens",
            "totalTokens",
            "tokens_total",
            "token_total",
        )
    )
    if total_value is None:
        prompt = _usage_number(_usage_pick(usage, "prompt_tokens", "promptTokens", "input_tokens", "inputTokens"))
        completion = _usage_number(
            _usage_pick(usage, "completion_tokens", "completionTokens", "output_tokens", "outputTokens")
        )
        if prompt is not None and completion is not None:
            total_value = prompt + completion
    if total_value is None:
        return "-"
    return str(int(round(total_value)))


def _usage_credits_value(usage: dict[str, Any]) -> str:
    credits = _usage_number(
        _usage_pick(
            usage,
            "credits_consumed",
            "creditsConsumed",
            "credits",
            "total_credits",
            "cost_credits",
        )
    )
    if credits is None:
        return "-"
    return f"{credits:.6f}".rstrip("0").rstrip(".")


def _run_total_tokens(run: dict[str, Any]) -> float | None:
    usage = _extract_run_usage(run)
    if not usage:
        return None
    total_value = _usage_number(
        _usage_pick(
            usage,
            "total_tokens",
            "totalTokens",
            "tokens_total",
            "token_total",
        )
    )
    if total_value is None:
        prompt = _usage_number(
            _usage_pick(usage, "prompt_tokens", "promptTokens", "input_tokens", "inputTokens")
        )
        completion = _usage_number(
            _usage_pick(usage, "completion_tokens", "completionTokens", "output_tokens", "outputTokens")
        )
        if prompt is not None and completion is not None:
            total_value = prompt + completion
    return total_value


def _report_appendix_lines(
    experiments: list[dict[str, Any]],
    evalset_runs_url: str,
    *,
    case_by_name: dict[str, dict[str, Any]] | None = None,
    representative_case_name: str | None = None,
) -> list[str]:
    """Render an appendix that lists every fetched run with its details.

    Each Run ID links back to the experiments page with a ``run`` query
    parameter, which opens the run-details overlay directly.
    """
    lines: list[str] = []
    lines.append("## Appendix: Run Details")
    lines.append("")
    lines.append(
        "Per-run detail for every run fetched in the window above. "
        "Each Run ID opens the run-details overlay directly in Datalayer, and "
        "the collapsible blocks below reproduce the same prompt, agent output, "
        "summary, and report shown by the in-app run-details dialog."
    )
    lines.append("")

    any_runs = False
    case_by_name = case_by_name or {}
    for experiment in experiments:
        runs = [run for run in (experiment.get("runs") or []) if isinstance(run, dict)]
        if not runs:
            continue
        any_runs = True
        agent_spec_label = str(
            experiment.get("agent_spec_name")
            or experiment.get("agent_spec_id")
            or "-"
        )
        lines.append(f"### {experiment.get('name', '')}")
        lines.append("")
        lines.append(f"Agentspec: {agent_spec_label}")
        lines.append("")
        run_rows: list[list[str]] = []
        for idx, run in enumerate(runs, start=1):
            metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
            usage = _extract_run_usage(run)
            run_id = str(run.get("id", ""))
            run_link = _run_overlay_url(evalset_runs_url, run_id)
            pass_rate = run.get("pass_rate")
            passed = _appendix_metric_int(metrics, "passed", "passed_cases")
            total = _appendix_metric_int(metrics, "total_cases", "total", "cases")
            cases_cell = (
                f"{passed}/{total}" if passed != "-" or total != "-" else "-"
            )
            run_rows.append(
                [
                    str(idx),
                    (f"[{run_id}]({run_link})" if run_link and run_id else (run_id or "-")),
                    str(run.get("status", "") or "-"),
                    _fmt_pct(float(pass_rate)) if isinstance(pass_rate, (int, float)) else "n/a",
                    cases_cell,
                    _appendix_metric_float(metrics, "avg_score", "average_score"),
                    _usage_total_tokens_value(usage),
                    _usage_credits_value(usage),
                    str(run.get("created_at", "") or "-"),
                    _format_failure_cause(run.get("failure_cause")) or "-",
                ]
            )
        lines.extend(
            _markdown_table(
                [
                    "#",
                    "Run ID",
                    "Status",
                    "Pass Rate",
                    "Cases (pass/total)",
                    "Avg Score",
                    "Total Tokens",
                    "Credits",
                    "Created",
                    "Failure Cause",
                ],
                run_rows,
                ["right", "left", "left", "right", "right", "right", "right", "right", "left", "left"],
            )
        )
        lines.append("")
        lines.append("#### Full Run Detail (as shown in the UI)")
        lines.append("")
        for idx, run in enumerate(runs, start=1):
            lines.extend(
                _run_detail_block_lines(
                    idx,
                    run,
                    case_by_name,
                    representative_case_name=representative_case_name,
                )
            )

    if not any_runs:
        lines.append("No runs were fetched for any experiment.")
        lines.append("")

    return lines


def _write_report_csv(report: dict[str, Any], output_path: Path) -> None:
    experiments = [item for item in (report.get("experiments") or []) if isinstance(item, dict)]

    def _run_usage_fields(run: dict[str, Any]) -> dict[str, Any]:
        usage = _extract_run_usage(run)
        return {
            "usage_source": _usage_pick(usage, "source"),
            "usage_provider": _usage_pick(usage, "provider"),
            "usage_model": _usage_pick(usage, "model"),
            "usage_requests": _usage_pick(usage, "requests"),
            "usage_prompt_tokens": _usage_pick(usage, "prompt_tokens", "promptTokens", "input_tokens", "inputTokens"),
            "usage_completion_tokens": _usage_pick(usage, "completion_tokens", "completionTokens", "output_tokens", "outputTokens"),
            "usage_total_tokens": _usage_total_tokens_value(usage),
            "usage_input_cached_tokens": _usage_pick(usage, "input_cached_tokens", "inputCachedTokens"),
            "usage_tool_calls": _usage_pick(usage, "tool_calls", "toolCalls"),
            "usage_duration_ms": _usage_pick(usage, "duration_ms", "durationMs"),
            "usage_credits_consumed": _usage_credits_value(usage),
            "usage_captured_at": _usage_pick(usage, "captured_at", "capturedAt"),
        }

    fieldnames = [
        "row_type",
        "evalset_id",
        "evalset_runs_url",
        "agent_spec_id",
        "agent_spec_name",
        "agent_spec_url",
        "experiment_id",
        "experiment_name",
        "run_index",
        "run_id",
        "run_status",
        "run_pass_rate",
        "runs_fetched",
        "runs_total",
        "baseline_pass_rate",
        "latest_pass_rate",
        "drift_delta",
        "latest_two_delta",
        "mean_pass_rate",
        "stddev_pass_rate",
        "failure_stage",
        "failure_type",
        "failure_message",
        "usage_source",
        "usage_provider",
        "usage_model",
        "usage_requests",
        "usage_prompt_tokens",
        "usage_completion_tokens",
        "usage_total_tokens",
        "usage_input_cached_tokens",
        "usage_tool_calls",
        "usage_duration_ms",
        "usage_credits_consumed",
        "usage_captured_at",
        "case_name",
        "case_status",
        "case_score",
        "case_category",
        "case_difficulty",
        "evaluator_name",
        "evaluator_scope",
        "evaluator_runs",
        "evaluator_passed_runs",
        "evaluator_mean_score",
        "evaluator_latest_score",
        "evaluator_latest_passed",
        "generated_at",
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        evalset_id = str(report.get("evalset_id", ""))
        run_environment = str(report.get("run_environment") or "")
        evalset_runs_url = _evalset_runs_url(evalset_id, run_environment)
        for experiment in experiments:
            agent_spec_id = str(experiment.get("agent_spec_id", ""))
            writer.writerow(
                {
                    "row_type": "experiment",
                    "evalset_id": evalset_id,
                    "evalset_runs_url": evalset_runs_url,
                    "agent_spec_id": agent_spec_id,
                    "agent_spec_name": str(experiment.get("agent_spec_name", "")),
                    "agent_spec_url": _agentspec_details_url(agent_spec_id),
                    "experiment_id": str(experiment.get("id", "")),
                    "experiment_name": str(experiment.get("name", "")),
                    "run_index": "",
                    "run_id": "",
                    "run_status": "",
                    "run_pass_rate": "",
                    "runs_fetched": int(experiment.get("runs_fetched") or 0),
                    "runs_total": int(experiment.get("runs_total") or 0),
                    "baseline_pass_rate": experiment.get("baseline_pass_rate"),
                    "latest_pass_rate": experiment.get("latest_pass_rate"),
                    "drift_delta": experiment.get("drift_delta"),
                    "latest_two_delta": experiment.get("latest_two_delta"),
                    "mean_pass_rate": experiment.get("mean_pass_rate"),
                    "stddev_pass_rate": experiment.get("stddev_pass_rate"),
                    "failure_stage": "",
                    "failure_type": "",
                    "failure_message": "",
                    "usage_source": "",
                    "usage_provider": "",
                    "usage_model": "",
                    "usage_requests": "",
                    "usage_prompt_tokens": "",
                    "usage_completion_tokens": "",
                    "usage_total_tokens": "",
                    "usage_input_cached_tokens": "",
                    "usage_tool_calls": "",
                    "usage_duration_ms": "",
                    "usage_credits_consumed": "",
                    "usage_captured_at": "",
                    "generated_at": str(report.get("generated_at", "")),
                }
            )
            runs = [run for run in (experiment.get("runs") or []) if isinstance(run, dict)]
            for idx, run in enumerate(runs, start=1):
                cause = run.get("failure_cause") if isinstance(run.get("failure_cause"), dict) else {}
                usage_fields = _run_usage_fields(run)
                writer.writerow(
                    {
                        "row_type": "run",
                        "evalset_id": evalset_id,
                        "evalset_runs_url": evalset_runs_url,
                        "agent_spec_id": agent_spec_id,
                        "agent_spec_name": str(experiment.get("agent_spec_name", "")),
                        "agent_spec_url": _agentspec_details_url(agent_spec_id),
                        "experiment_id": str(experiment.get("id", "")),
                        "experiment_name": str(experiment.get("name", "")),
                        "run_index": idx,
                        "run_id": str(run.get("id", "")),
                        "run_status": str(run.get("status", "")),
                        "run_pass_rate": run.get("pass_rate"),
                        "runs_fetched": int(experiment.get("runs_fetched") or 0),
                        "runs_total": int(experiment.get("runs_total") or 0),
                        "baseline_pass_rate": experiment.get("baseline_pass_rate"),
                        "latest_pass_rate": experiment.get("latest_pass_rate"),
                        "drift_delta": experiment.get("drift_delta"),
                        "latest_two_delta": experiment.get("latest_two_delta"),
                        "mean_pass_rate": experiment.get("mean_pass_rate"),
                        "stddev_pass_rate": experiment.get("stddev_pass_rate"),
                        "failure_stage": str(cause.get("stage", "")),
                        "failure_type": str(cause.get("type", "")),
                        "failure_message": str(cause.get("message", "")),
                        **usage_fields,
                        "generated_at": str(report.get("generated_at", "")),
                    }
                )
                run_metrics = (
                    run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
                )
                case_results = run_metrics.get("case_results")
                if isinstance(case_results, list):
                    for case_result in case_results:
                        if not isinstance(case_result, dict):
                            continue
                        writer.writerow(
                            {
                                "row_type": "case",
                                "evalset_id": evalset_id,
                                "evalset_runs_url": evalset_runs_url,
                                "agent_spec_id": agent_spec_id,
                                "agent_spec_name": str(
                                    experiment.get("agent_spec_name", "")
                                ),
                                "agent_spec_url": _agentspec_details_url(agent_spec_id),
                                "experiment_id": str(experiment.get("id", "")),
                                "experiment_name": str(experiment.get("name", "")),
                                "run_index": idx,
                                "run_id": str(run.get("id", "")),
                                "run_status": str(run.get("status", "")),
                                "run_pass_rate": run.get("pass_rate"),
                                "case_name": str(case_result.get("name", "")),
                                "case_status": (
                                    "passed"
                                    if case_result.get("passed")
                                    else "failed"
                                ),
                                "case_score": case_result.get("score"),
                                "case_category": str(
                                    case_result.get("category") or ""
                                ),
                                "case_difficulty": str(
                                    case_result.get("difficulty") or ""
                                ),
                                **usage_fields,
                                "generated_at": str(report.get("generated_at", "")),
                            }
                        )

        evaluator_results = [
            item
            for item in (report.get("evaluator_results") or [])
            if isinstance(item, dict)
        ]
        for item in evaluator_results:
            writer.writerow(
                {
                    "row_type": "evaluator",
                    "evalset_id": evalset_id,
                    "evalset_runs_url": evalset_runs_url,
                    "evaluator_name": str(item.get("name") or ""),
                    "evaluator_scope": str(item.get("scope") or ""),
                    "evaluator_runs": int(item.get("runs") or 0),
                    "evaluator_passed_runs": int(item.get("passed_runs") or 0),
                    "evaluator_mean_score": item.get("mean_score"),
                    "evaluator_latest_score": item.get("latest_score"),
                    "evaluator_latest_passed": bool(item.get("latest_passed")),
                    "usage_source": "",
                    "usage_provider": "",
                    "usage_model": "",
                    "usage_requests": "",
                    "usage_prompt_tokens": "",
                    "usage_completion_tokens": "",
                    "usage_total_tokens": "",
                    "usage_input_cached_tokens": "",
                    "usage_tool_calls": "",
                    "usage_duration_ms": "",
                    "usage_credits_consumed": "",
                    "usage_captured_at": "",
                    "generated_at": str(report.get("generated_at", "")),
                }
            )


def _print_report_console(report: dict[str, Any], run_limit: int) -> None:
    evalset_id = str(report.get("evalset_id", ""))
    run_environment = str(report.get("run_environment") or "")
    generated_at = str(report.get("generated_at", ""))
    experiments = [item for item in (report.get("experiments") or []) if isinstance(item, dict)]
    agentspecs = [item for item in (report.get("agentspecs") or []) if isinstance(item, dict)]
    evalset_runs_url = _evalset_runs_url(evalset_id, run_environment)

    console.rule(f"[bold cyan]Evals Report[/bold cyan] {evalset_id}")
    console.print(f"Generated at: {generated_at}")
    console.print(f"Experiments: {len(experiments)} | Run window per experiment: {run_limit}")
    if evalset_runs_url:
        console.print(f"Evalset run details: {evalset_runs_url}")
    console.print("")

    if agentspecs:
        agentspec_table = Table(title="Agentspec Coverage")
        agentspec_table.add_column("Agentspec ID", style="cyan")
        agentspec_table.add_column("Agentspec", style="white")
        agentspec_table.add_column("Model", style="white")
        agentspec_table.add_column("Version", style="white")
        agentspec_table.add_column("Experiments", justify="right")
        agentspec_table.add_column("Runs", justify="right")
        for item in agentspecs:
            agentspec_table.add_row(
                str(item.get("id") or ""),
                str(item.get("name") or item.get("id") or ""),
                str(item.get("model") or "-"),
                str(item.get("version") or "-"),
                str(int(item.get("experiments") or 0)),
                str(int(item.get("runs") or 0)),
            )
        console.print(agentspec_table)

    overview = Table(title="Experiment Overview")
    overview.add_column("Experiment", style="white")
    overview.add_column("Agentspec", style="white")
    overview.add_column("Runs", justify="right")
    overview.add_column("Latest", justify="right")
    overview.add_column("Baseline", justify="right")
    overview.add_column("Drift", justify="right")
    overview.add_column("Latest-2", justify="right")
    for experiment in experiments:
        overview.add_row(
            str(experiment.get("name", "")),
            str(experiment.get("agent_spec_name") or experiment.get("agent_spec_id") or "-"),
            f"{int(experiment.get('runs_fetched') or 0)}/{int(experiment.get('runs_total') or 0)}",
            _fmt_pct(experiment.get("latest_pass_rate") if isinstance(experiment.get("latest_pass_rate"), (int, float)) else None),
            _fmt_pct(experiment.get("baseline_pass_rate") if isinstance(experiment.get("baseline_pass_rate"), (int, float)) else None),
            _fmt_delta(experiment.get("drift_delta") if isinstance(experiment.get("drift_delta"), (int, float)) else None, colorize=True),
            _fmt_delta(experiment.get("latest_two_delta") if isinstance(experiment.get("latest_two_delta"), (int, float)) else None, colorize=True),
        )
    console.print(overview)

    ranked_latest = sorted(
        [item for item in experiments if isinstance(item.get("latest_pass_rate"), (int, float))],
        key=lambda item: float(item.get("latest_pass_rate") or 0.0),
        reverse=True,
    )
    latest_table = Table(title="By Latest Pass Rate")
    latest_table.add_column("Rank", justify="right", no_wrap=True)
    latest_table.add_column("Experiment", style="white")
    latest_table.add_column("Latest", justify="right", no_wrap=True)
    for idx, item in enumerate(ranked_latest, start=1):
        latest_table.add_row(str(idx), str(item.get("name", "")), _fmt_pct(float(item.get("latest_pass_rate") or 0.0)))
    console.print(latest_table)
    latest_values = [
        float(item.get("latest_pass_rate"))
        for item in ranked_latest
        if isinstance(item.get("latest_pass_rate"), (int, float))
    ]
    console.print("Latest histogram:")
    for hist_line in _ascii_histogram(
        latest_values,
        bins=8,
        width=20,
        min_value=0.0,
        max_value=1.0,
        full_blocks=True,
        colorize=True,
    ):
        console.print(hist_line)

    ranked_drift = sorted(
        [item for item in experiments if isinstance(item.get("drift_delta"), (int, float))],
        key=lambda item: float(item.get("drift_delta") or 0.0),
    )
    drift_table = Table(title="By Drift (Negative To Positive)")
    drift_table.add_column("Rank", justify="right", no_wrap=True)
    drift_table.add_column("Experiment", style="white")
    drift_table.add_column("Drift", justify="right", no_wrap=True)
    for idx, item in enumerate(ranked_drift, start=1):
        drift_table.add_row(
            str(idx),
            str(item.get("name", "")),
            _fmt_delta(float(item.get("drift_delta") or 0.0), colorize=True),
        )
    console.print(drift_table)
    drift_values = [
        float(item.get("drift_delta"))
        for item in ranked_drift
        if isinstance(item.get("drift_delta"), (int, float))
    ]
    console.print("Drift histogram:")
    for hist_line in _ascii_histogram(
        drift_values,
        bins=8,
        width=20,
        full_blocks=True,
        colorize=True,
        drift_palette=True,
    ):
        console.print(hist_line)

    pairwise = _pairwise_latest_deltas(experiments)
    pairwise_table = Table(title="Pairwise Latest-Pass Deltas")
    pairwise_table.add_column("Pair", style="white")
    pairwise_table.add_column("Left", justify="right", no_wrap=True)
    pairwise_table.add_column("Right", justify="right", no_wrap=True)
    pairwise_table.add_column("Delta", justify="right", no_wrap=True)
    for pair in pairwise:
        pairwise_table.add_row(
            f"{pair['left']} vs {pair['right']}",
            _fmt_pct(pair["left_latest"]),
            _fmt_pct(pair["right_latest"]),
            _fmt_delta(pair["delta"], colorize=True),
        )
    if not pairwise:
        pairwise_table.add_row("n/a", "n/a", "n/a", "n/a")
    console.print(pairwise_table)

    within_agentspec_pairs = [
        pair for pair in pairwise if str(pair.get("group") or "") == "within_agentspec"
    ]
    cross_agentspec_pairs = [
        pair for pair in pairwise if str(pair.get("group") or "") == "cross_agentspec"
    ]

    within_table = Table(title="Within-Agentspec Pairwise Latest-Pass Deltas")
    within_table.add_column("Pair", style="white")
    within_table.add_column("Agentspec", style="white")
    within_table.add_column("Left", justify="right", no_wrap=True)
    within_table.add_column("Right", justify="right", no_wrap=True)
    within_table.add_column("Delta", justify="right", no_wrap=True)
    for pair in within_agentspec_pairs:
        within_table.add_row(
            f"{pair['left']} vs {pair['right']}",
            str(pair.get("left_agent_spec_name") or pair.get("left_agent_spec_id") or "-"),
            _fmt_pct(pair["left_latest"]),
            _fmt_pct(pair["right_latest"]),
            _fmt_delta(pair["delta"], colorize=True),
        )
    if not within_agentspec_pairs:
        within_table.add_row("n/a", "n/a", "n/a", "n/a", "n/a")
    console.print(within_table)

    cross_table = Table(title="Cross-Agentspec Pairwise Latest-Pass Deltas")
    cross_table.add_column("Pair", style="white")
    cross_table.add_column("Left", justify="right", no_wrap=True)
    cross_table.add_column("Right", justify="right", no_wrap=True)
    cross_table.add_column("Delta", justify="right", no_wrap=True)
    for pair in cross_agentspec_pairs:
        cross_table.add_row(
            (
                f"{pair['left']} ({pair.get('left_agent_spec_name') or pair.get('left_agent_spec_id') or '-'}) "
                f"vs {pair['right']} ({pair.get('right_agent_spec_name') or pair.get('right_agent_spec_id') or '-'})"
            ),
            _fmt_pct(pair["left_latest"]),
            _fmt_pct(pair["right_latest"]),
            _fmt_delta(pair["delta"], colorize=True),
        )
    if not cross_agentspec_pairs:
        cross_table.add_row("n/a", "n/a", "n/a", "n/a")
    console.print(cross_table)

    console.print("[bold]Pass-rate heatmap (r01=latest fetched run):[/bold]")
    for line in _ascii_passrate_heatmap(experiments, max_columns=12, colorize=True):
        console.print(line)
    console.print("[bold]Consecutive delta heatmap (A-B):[/bold]")
    for line in _ascii_drift_heatmap(experiments, max_columns=12, colorize=True):
        console.print(line)

    if ranked_latest:
        console.print(
            "[bold]Insight:[/bold] top latest "
            f"[green]{ranked_latest[0].get('name', '')}[/green] "
            f"({_fmt_pct(float(ranked_latest[0].get('latest_pass_rate') or 0.0))})"
        )
    if ranked_drift:
        console.print(
            "[bold]Insight:[/bold] strongest drift "
            f"{ranked_drift[-1].get('name', '')} "
            f"({_fmt_delta(float(ranked_drift[-1].get('drift_delta') or 0.0), colorize=True)})"
        )
    console.print("")

    for experiment in experiments:
        console.print("")
        console.print(f"[bold]Run Timeline:[/bold] {experiment.get('name', '')}")
        run_table = Table()
        run_table.add_column("#", justify="right", style="cyan", no_wrap=True)
        run_table.add_column("Run ID", style="white", no_wrap=True)
        run_table.add_column("Status", no_wrap=True)
        run_table.add_column("Pass Rate", justify="right", no_wrap=True)
        run_table.add_column("Trend", style="white", no_wrap=True)
        run_table.add_column("Failure Cause", style="red", overflow="fold")

        runs = [run for run in (experiment.get("runs") or []) if isinstance(run, dict)]
        for idx, run in enumerate(runs, start=1):
            status_value = str(run.get("status", ""))
            pass_rate = float(run.get("pass_rate")) if isinstance(run.get("pass_rate"), (int, float)) else None
            cause_text = _format_failure_cause(run.get("failure_cause"))
            run_table.add_row(
                str(idx),
                str(run.get("id", "")),
                f"[{_status_style(status_value)}]{status_value}[/{_status_style(status_value)}]",
                _fmt_pct(pass_rate),
                _ascii_bar(pass_rate, width=28, full_blocks=True, colorize=True) if pass_rate is not None else "-",
                cause_text or "-",
            )
        if not runs:
            run_table.add_row("1", "n/a", "n/a", "n/a", "-", "-")
        console.print(run_table)

        for idx, run in enumerate(runs, start=1):
            cause = run.get("failure_cause")
            if not isinstance(cause, dict) or not cause:
                continue
            console.print(
                f"[red bold]Run {idx} failure:[/red bold] "
                f"[red]{str(cause.get('message') or 'Unknown failure.')}[/red]"
            )
            for key, label in (
                ("stage", "stage"),
                ("type", "type"),
                ("execution_url", "execution url"),
            ):
                value = str(cause.get(key) or "").strip()
                if value:
                    console.print(f"    {label}: {value}")
            diagnostics = cause.get("diagnostics")
            if isinstance(diagnostics, dict):
                for key, label in (
                    ("agent_runtimes_url", "agent runtimes url"),
                    ("run_url", "run url"),
                ):
                    value = diagnostics.get(key)
                    if value:
                        console.print(f"    {label}: {value}")
                candidate_urls = diagnostics.get("candidate_urls")
                if isinstance(candidate_urls, list) and candidate_urls:
                    console.print(f"    candidate urls: {', '.join(str(u) for u in candidate_urls)}")
                attempts = diagnostics.get("attempts")
                if isinstance(attempts, list) and attempts:
                    for attempt in attempts:
                        if not isinstance(attempt, dict):
                            continue
                        outcome = "ok" if attempt.get("ok") else "failed"
                        console.print(
                            f"    attempt: {attempt.get('url', '')} -> {outcome} "
                            f"{attempt.get('error') or ''}".rstrip()
                        )
            detail = str(cause.get("detail_excerpt") or "").strip()
            if detail:
                console.print(f"    detail: {detail}")

        deltas_table = Table(title="Consecutive Run Deltas")
        deltas_table.add_column("Run A", style="white", no_wrap=True)
        deltas_table.add_column("Run B", style="white", no_wrap=True)
        deltas_table.add_column("A Pass", justify="right", no_wrap=True)
        deltas_table.add_column("B Pass", justify="right", no_wrap=True)
        deltas_table.add_column("Delta", justify="right", no_wrap=True)
        comparisons = [
            item for item in (experiment.get("consecutive_comparisons") or [])
            if isinstance(item, dict)
        ]
        for item in comparisons:
            run_a = item.get("run_a_pass_rate") if isinstance(item.get("run_a_pass_rate"), (int, float)) else None
            run_b = item.get("run_b_pass_rate") if isinstance(item.get("run_b_pass_rate"), (int, float)) else None
            delta = item.get("delta_pass_rate") if isinstance(item.get("delta_pass_rate"), (int, float)) else None
            deltas_table.add_row(
                str(item.get("run_a_id", "")),
                str(item.get("run_b_id", "")),
                _fmt_pct(float(run_a)) if isinstance(run_a, (int, float)) else "n/a",
                _fmt_pct(float(run_b)) if isinstance(run_b, (int, float)) else "n/a",
                _fmt_delta(float(delta), colorize=True) if isinstance(delta, (int, float)) else "n/a",
            )
        if not comparisons:
            deltas_table.add_row("n/a", "n/a", "n/a", "n/a", "n/a")
        console.print(deltas_table)


def iter_report_runs(report: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Return ``(experiment_name, run)`` tuples for every run in a report.

    Operates on the structured report produced by :func:`build_eval_report`, so
    consumers (the GitHub Action, dashboards, alerts) don't re-walk the nested
    ``experiments -> runs`` shape themselves.
    """
    pairs: list[tuple[str, dict[str, Any]]] = []
    for experiment in report.get("experiments") or []:
        if not isinstance(experiment, dict):
            continue
        experiment_name = str(experiment.get("name") or experiment.get("id") or "")
        for run in experiment.get("runs") or []:
            if isinstance(run, dict):
                pairs.append((experiment_name, run))
    return pairs


def collect_report_failures(report: dict[str, Any]) -> dict[str, Any]:
    """Aggregate failure information across every run in a report.

    Returns a dict with the failed-run count, failed-status run count, a
    breakdown by failure type, and structured failure records (experiment, run
    id, stage, type, message, trimmed detail excerpt, execution URL). This is
    the shared aggregation the GitHub Action renders into its step summary.
    """
    failures: list[dict[str, Any]] = []
    type_counts: dict[str, int] = {}
    failed_status_runs = 0

    for experiment_name, run in iter_report_runs(report):
        status = str(run.get("status") or "").strip().lower()
        cause = run.get("failure_cause")
        cause = cause if isinstance(cause, dict) else None
        is_failed = status in {"failed", "error"} or bool(cause)
        if not is_failed:
            continue
        if status in {"failed", "error"}:
            failed_status_runs += 1

        failure_type = str((cause or {}).get("type") or "unknown")
        type_counts[failure_type] = type_counts.get(failure_type, 0) + 1

        detail = str((cause or {}).get("detail_excerpt") or "").strip()
        detail_single = " ".join(detail.split())
        if len(detail_single) > 300:
            detail_single = detail_single[:297] + "..."

        failures.append(
            {
                "experiment": experiment_name,
                "run_id": str(run.get("id") or ""),
                "status": status or "unknown",
                "stage": str((cause or {}).get("stage") or "-"),
                "type": failure_type,
                "message": str((cause or {}).get("message") or "-"),
                "detail_excerpt": detail_single or "-",
                "execution_url": str((cause or {}).get("execution_url") or ""),
            }
        )

    return {
        "failed_run_count": len(failures),
        "failed_status_runs": failed_status_runs,
        "type_counts": type_counts,
        "failures": failures,
    }


def average_latest_pass_rate(report: dict[str, Any]) -> float | None:
    """Return the mean of each experiment's ``latest_pass_rate`` (or ``None``)."""
    values = [
        float(experiment.get("latest_pass_rate"))
        for experiment in (report.get("experiments") or [])
        if isinstance(experiment, dict)
        and isinstance(experiment.get("latest_pass_rate"), (int, float))
    ]
    if not values:
        return None
    return sum(values) / len(values)
