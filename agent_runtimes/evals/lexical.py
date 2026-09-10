# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The report as a Lexical document (BENCHMARK.md, B3-03).

The report engine answers one structured report; this hydrates it into a
serialized Lexical editor state a person can open, read in the order of
section 13.0 and keep working in: overview and rankings, pairwise deltas,
per-task outcomes, failure diagnostics, then methodology, benchmark and
version, subject configurations, dataset and environment versions, cost and
duration, limitations, and the reproduction command.

Scalars become text, tables become Lexical tables, and the line analyses
and the comparison families become Jupyter output nodes carrying the
analysis JSON under one mime type, for a renderer that draws them. Every
block carries a `provenance` naming the evalset, its version, the launch,
the experiment, the run, the task and the analysis it came from, so a
sentence in a report can be traced back to the record it summarises.

Markdown and CSV are untouched: this reads the same report they render.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

__all__ = [
    "ANALYSIS_MIME",
    "REPORT_SECTIONS",
    "build_eval_report_lexical",
]

#: The mime type the analysis JSON travels under inside a Jupyter output.

logger = logging.getLogger(__name__)

ANALYSIS_MIME = "application/vnd.datalayer.evals.analysis+json"

#: The reading order of section 13.0, and the headings the document uses.
REPORT_SECTIONS: tuple[tuple[str, str], ...] = (
    ("overview", "Overview and rankings"),
    ("pairwise", "Pairwise deltas"),
    ("cases", "Per-task outcomes"),
    ("failures", "Failure diagnostics"),
    ("methodology", "Methodology"),
    ("benchmark", "Benchmark and version"),
    ("subjects", "Subject configurations"),
    ("versions", "Dataset and environment versions"),
    ("cost", "Cost and duration"),
    ("limitations", "Limitations"),
    ("reproduction", "Reproduction"),
)

IS_ITALIC = 2
IS_CODE = 16


# ---------------------------------------------------------------------------
# Nodes, by hand: the same shapes the editor writes.
# ---------------------------------------------------------------------------


def _text(content: str, fmt: int = 0) -> dict[str, Any]:
    return {"detail": 0, "format": fmt, "mode": "normal", "style": "", "text": content, "type": "text", "version": 1}


def _block(kind: str, children: list[dict[str, Any]], provenance: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {"children": children, "direction": "ltr", "format": "", "indent": 0, "type": kind, "version": 1, "provenance": provenance, **extra}


def _heading(words: str, tag: str, provenance: dict[str, Any]) -> dict[str, Any]:
    return _block("heading", [_text(words)], provenance, tag=tag)


def _paragraph(words: str, provenance: dict[str, Any], fmt: int = 0) -> dict[str, Any]:
    return _block("paragraph", [_text(words, fmt)], provenance, textFormat=fmt, textStyle="")


def _bullets(lines: list[str], provenance: dict[str, Any]) -> dict[str, Any]:
    items = [_block("listitem", [_text(line)], provenance, value=index) for index, line in enumerate(lines, start=1)]
    return _block("list", items, provenance, listType="bullet", start=1, tag="ul")


def _cell(words: str, header: bool, provenance: dict[str, Any]) -> dict[str, Any]:
    return _block("tablecell", [_paragraph(words, provenance)], provenance, headerState=1 if header else 0, colSpan=1, rowSpan=1, backgroundColor=None)


def _table(head: list[str], rows: list[list[str]], provenance: dict[str, Any]) -> dict[str, Any]:
    body = [_block("tablerow", [_cell(words, True, provenance) for words in head], provenance)]
    body += [_block("tablerow", [_cell(words, False, provenance) for words in row], provenance) for row in rows]
    return _block("table", body, provenance)


def _analysis_output(analysis: dict[str, Any], provenance: dict[str, Any]) -> dict[str, Any]:
    """A Jupyter output node holding one analysis, for an interactive renderer.

    The uuids are derived from the provenance, so the same report hydrates
    to the same document twice.
    """
    seed = "|".join(str(provenance.get(key) or "") for key in ("evalset", "launch", "experiment", "run", "analysis"))
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()  # noqa: S324 - an identifier, not a secret
    summary = str(analysis.get("name") or analysis.get("metric") or "analysis")
    return {
        "type": "jupyter-output",
        "version": 1,
        "source": "",
        "outputs": [{"output_type": "display_data", "data": {ANALYSIS_MIME: analysis, "text/plain": summary}, "metadata": {}}],
        "jupyterInputNodeUuid": f"in-{digest[:12]}",
        "jupyterOutputNodeUuid": f"out-{digest[12:24]}",
        "provenance": provenance,
    }


# ---------------------------------------------------------------------------
# Reading the report
# ---------------------------------------------------------------------------


def _from_ci(launch: dict[str, Any]) -> str:
    """Where a launch made by CI came from (B6-02), or nothing."""
    config = launch.get("config") if isinstance(launch.get("config"), dict) else {}
    git = config.get("git") if isinstance(config.get("git"), dict) else {}
    if not git:
        return ""
    parts: list[str] = []
    if git.get("sha"):
        parts.append(f"commit {str(git['sha'])[:12]}")
    if git.get("ref"):
        parts.append(f"on {git['ref']}")
    if git.get("pr_number"):
        parts.append(f"pull request #{git['pr_number']}")
    if git.get("repository"):
        parts.append(f"of {git['repository']}")
    if git.get("run_id"):
        parts.append(f"action run {git['run_id']}")
    return "From CI: " + ", ".join(parts) if parts else ""


def _pct(value: Any) -> str:
    try:
        return f"{float(value) * 100:.1f}%"
    except (TypeError, ValueError):
        return "n/a"


def _signed_pct(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "n/a"
    return f"{'+' if number >= 0 else ''}{number * 100:.1f} pts"


def _credits(value: Any) -> str:
    try:
        return f"{float(value):.2f} credits"
    except (TypeError, ValueError):
        return "n/a"


def _duration(ms: Any) -> str:
    try:
        seconds = float(ms) / 1000.0
    except (TypeError, ValueError):
        return "n/a"
    minutes, rest = divmod(int(round(seconds)), 60)
    return f"{minutes} min {rest:02d} s" if minutes else f"{rest} s"


def _latest_run(experiment: dict[str, Any]) -> dict[str, Any]:
    runs = [run for run in (experiment.get("runs") or []) if isinstance(run, dict)]
    return runs[0] if runs else {}


def _usage_of(run: dict[str, Any]) -> dict[str, Any]:
    usage = run.get("usage") if isinstance(run.get("usage"), dict) else {}
    if not usage:
        metrics = run.get("metrics") if isinstance(run.get("metrics"), dict) else {}
        usage = metrics.get("pydantic_ai_usage") if isinstance(metrics.get("pydantic_ai_usage"), dict) else {}
    return usage


def _case_rows(experiment: dict[str, Any]) -> list[dict[str, Any]]:
    metrics = _latest_run(experiment).get("metrics") if isinstance(_latest_run(experiment).get("metrics"), dict) else {}
    return [row for row in (metrics.get("case_results") or []) if isinstance(row, dict)]


#: The analysis kinds that are drawn rather than written out (B3-10).
#:
#: A heatmap and a pairwise table are grids a reader compares across; flattened
#: into prose or a plain table they stop being comparisons. They reach the
#: document as a Jupyter output carrying the analysis, which is what the
#: interactive renderer picks up — the same route `line` already took, named
#: here so a new kind is a decision rather than a fall-through.
COMPONENT_ANALYSES = ("line", "heatmap", "pairwise", "comparison")


def _analysis_block(analysis: dict[str, Any], provenance: dict[str, Any]) -> dict[str, Any]:
    kind = str(analysis.get("kind") or "")
    named = {**provenance, "analysis": analysis.get("metric") or analysis.get("name")}
    if kind == "scalar":
        value = analysis.get("value")
        shown = _pct(value) if isinstance(value, float) and 0 <= value <= 1 and "rate" in str(analysis.get("metric") or "") else str(value)
        if "delta" in str(analysis.get("metric") or "") and isinstance(value, (int, float)):
            shown = _signed_pct(value)
        return _paragraph(f"{analysis.get('name') or analysis.get('metric')}: {shown}", named)
    if kind == "table":
        columns = [str(column) for column in (analysis.get("columns") or [])]
        rows = [[_cell_text(value) for value in row] for row in (analysis.get("rows") or []) if isinstance(row, (list, tuple))]
        return _table(columns, rows, named)
    if kind not in COMPONENT_ANALYSES:
        # An unknown kind is still shown rather than dropped, but it is worth
        # noticing: a report is the record of a run, and a silent hole in it is
        # worse than an unrecognised block.
        logger.info("The report has an analysis of an unknown kind: %s", kind or "(none)")
    return _analysis_output(analysis, named)


def _cell_text(value: Any) -> str:
    if isinstance(value, float):
        return f"{value:.4f}".rstrip("0").rstrip(".") if value != int(value) else str(int(value))
    if value is None:
        return ""
    return str(value)


# ---------------------------------------------------------------------------
# The document
# ---------------------------------------------------------------------------


def build_eval_report_lexical(
    report: dict[str, Any],
    *,
    evalset: dict[str, Any] | None = None,
    launch: dict[str, Any] | None = None,
    run: dict[str, Any] | None = None,
    cases: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """The report as a serialized editor state, in the section 13.0 order.

    `report` is what `build_eval_report` answers. `evalset` adds what the
    report does not carry (version, category, dataset reference); `launch`
    names the launch the document is about ("Run 128"), `run` narrows the
    document to one run of it, and `cases` are the task documents of that
    run when the caller has them — they carry explanations and failure modes
    a run's metrics do not.
    """
    evalset = evalset or {}
    launch = launch or {}
    run = run or {}
    cases = [row for row in (cases or []) if isinstance(row, dict)]
    experiments = [item for item in (report.get("experiments") or []) if isinstance(item, dict)]
    if run:
        experiments = [item for item in experiments if str(item.get("id") or "") == str(run.get("experiment_id") or "")] or experiments
    evalset_id = str(report.get("evalset_id") or evalset.get("id") or "")
    evalset_name = str(report.get("evalset_name") or evalset.get("name") or evalset_id)
    version = evalset.get("version") or launch.get("evalset_version") or run.get("evalset_version")
    base = {
        "evalset": evalset_id,
        "version": version,
        "launch": str(launch.get("id") or run.get("launch_id") or "") or None,
        "experiment": None,
        "run": str(run.get("id") or "") or None,
        "case": None,
        "analysis": None,
    }

    def on(**names: Any) -> dict[str, Any]:
        return {**base, **names}

    children: list[dict[str, Any]] = []
    titles = dict(REPORT_SECTIONS)

    # --- Overview and rankings ------------------------------------------
    number = launch.get("number")
    title = f"{evalset_name} — Run {number}" if number else evalset_name
    if run and not number:
        title = f"{evalset_name} — run {run.get('id')}"
    children.append(_heading(title, "h1", on()))
    status = str(launch.get("status") or run.get("status") or "")
    if status:
        children.append(_paragraph(f"{status[:1].upper()}{status[1:]}.", on(), IS_ITALIC))
    ranked = sorted(experiments, key=lambda item: float(item.get("latest_pass_rate") or 0.0), reverse=True)
    best = ranked[0] if ranked else {}
    total_cases = len(report.get("cases") or [])
    overview = (
        f"{len(experiments)} experiment{'s' if len(experiments) != 1 else ''} on {total_cases} task{'s' if total_cases != 1 else ''}"
        + (f"; {best.get('name')} leads at {_pct(best.get('latest_pass_rate'))}." if best else ".")
    )
    children.append(_heading(titles["overview"], "h2", on()))
    children.append(_paragraph(overview, on()))
    children.append(
        _table(
            ["Rank", "Experiment", "Subject", "Latest pass rate", "Mean", "Runs", "Latest cost"],
            [
                [
                    str(index),
                    str(item.get("name") or item.get("id")),
                    str(item.get("agent_spec_name") or item.get("agent_spec_id") or ""),
                    _pct(item.get("latest_pass_rate")),
                    _pct(item.get("mean_pass_rate")),
                    str(item.get("runs_total") or len(item.get("runs") or [])),
                    _credits(_usage_of(_latest_run(item)).get("credits_consumed")),
                ]
                for index, item in enumerate(ranked, start=1)
            ],
            on(),
        )
    )
    # The benchmark-wide analyses compare every experiment; a document about
    # one run keeps to its own experiment.
    if not run:
        for analysis in (report.get("report_analyses") or []):
            if isinstance(analysis, dict):
                children.append(_analysis_block(analysis, on()))

    # --- Pairwise deltas ------------------------------------------------
    children.append(_heading(titles["pairwise"], "h2", on()))
    pairs: list[list[str]] = []
    for index, left in enumerate(ranked):
        for right in ranked[index + 1 :]:
            delta = float(left.get("latest_pass_rate") or 0.0) - float(right.get("latest_pass_rate") or 0.0)
            pairs.append([str(left.get("name") or left.get("id")), str(right.get("name") or right.get("id")), _signed_pct(delta)])
    if pairs:
        children.append(_table(["Experiment", "Against", "Latest pass-rate delta"], pairs, on()))
    else:
        children.append(_paragraph("One experiment: nothing to compare against.", on()))
    for item in ranked:
        comparison = item.get("latest_two_comparison") if isinstance(item.get("latest_two_comparison"), dict) else None
        if comparison and comparison.get("run_ids"):
            summary = {
                "kind": "comparison",
                "family": "latest_two",
                "name": f"{item.get('name')}: latest two runs",
                "run_ids": comparison.get("run_ids"),
                "delta_pass_rate": comparison.get("delta_pass_rate"),
                "consecutive": item.get("consecutive_comparisons") or [],
            }
            children.append(_analysis_output(summary, on(experiment=item.get("id"), analysis="latest_two")))

    # --- Per-task outcomes ---------------------------------------------
    children.append(_heading(titles["cases"], "h2", on()))
    if cases:
        children.append(
            _table(
                ["Task", "Category", "Status", "Score", "Explanation"],
                [
                    [
                        str(row.get("name") or row.get("case_id")),
                        str(row.get("category") or ""),
                        str(row.get("status") or ""),
                        _cell_text(row.get("score")),
                        str(row.get("explanation") or ""),
                    ]
                    for row in cases
                ],
                on(),
            )
        )
    elif experiments:
        names: list[str] = []
        for item in ranked:
            for row in _case_rows(item):
                name = str(row.get("name") or "")
                if name and name not in names:
                    names.append(name)
        head = ["Task", "Category", "Difficulty"] + [str(item.get("name") or item.get("id")) for item in ranked]
        rows = []
        for name in names:
            first = next((row for item in ranked for row in _case_rows(item) if str(row.get("name") or "") == name), {})
            line = [name, str(first.get("category") or ""), str(first.get("difficulty") or "")]
            for item in ranked:
                found = next((row for row in _case_rows(item) if str(row.get("name") or "") == name), None)
                line.append("passed" if found and found.get("passed") else "failed" if found else "—")
            rows.append(line)
        children.append(_table(head, rows, on()))
    else:
        children.append(_paragraph("No run has produced task outcomes yet.", on()))

    # --- Failure diagnostics --------------------------------------------
    children.append(_heading(titles["failures"], "h2", on()))
    failed_rows = [row for row in cases if str(row.get("status") or "") == "failed"] if cases else [
        row for item in ranked for row in _case_rows(item) if not row.get("passed")
    ]
    modes: dict[str, int] = {}
    for row in failed_rows:
        mode = str(row.get("failure_mode") or row.get("failure_stage") or "unclassified")
        modes[mode] = modes.get(mode, 0) + 1
    if failed_rows:
        children.append(_bullets([f"{mode} · {count} task{'s' if count != 1 else ''}" for mode, count in sorted(modes.items(), key=lambda pair: -pair[1])], on()))
        explained = [row for row in failed_rows if row.get("explanation")]
        if explained:
            children.append(_bullets([f"{row.get('name')}: {row.get('explanation')}" for row in explained[:12]], on()))
    else:
        children.append(_paragraph("No task failed in the latest runs.", on()))
    for result in (report.get("evaluator_results") or []):
        if isinstance(result, dict) and result.get("latest_passed") is False:
            children.append(_paragraph(f"Report gate {result.get('name')} failed: {result.get('summary') or ''}", on(analysis=result.get("name"))))

    # --- Methodology ----------------------------------------------------
    children.append(_heading(titles["methodology"], "h2", on()))
    evaluators = [item for item in (report.get("evalset_evaluators") or []) if isinstance(item, dict)]
    report_evaluators = [item for item in (report.get("report_evaluators") or []) if isinstance(item, dict)]
    case_evaluators: list[str] = []
    for case in (report.get("cases") or []):
        for ref in (case.get("evaluators") or []) if isinstance(case, dict) else []:
            name = str((ref or {}).get("name") or "") if isinstance(ref, dict) else str(ref)
            if name and name not in case_evaluators:
                case_evaluators.append(name)
    method = [
        f"Task scorers: {', '.join(case_evaluators) or 'none declared'}.",
        f"Benchmark gates: {', '.join(str(item.get('name')) + (' ' + str(item.get('arguments')) if item.get('arguments') else '') for item in evaluators) or 'none'}.",
        f"Report gates: {', '.join(str(item.get('name')) for item in report_evaluators) or 'none'}.",
        "Every task runs in a fresh session on a pooled sandbox; its snapshot and evidence notebook are kept with the result.",
    ]
    children.append(_bullets(method, on()))

    # --- Benchmark and version ------------------------------------------
    children.append(_heading(titles["benchmark"], "h2", on()))
    children.append(
        _bullets(
            [
                f"Benchmark: {evalset_name} ({evalset_id})",
                f"Version: {version if version is not None else 'unversioned'}",
                f"Category: {evalset.get('category') or 'unset'}",
                f"Tasks: {total_cases}",
            ]
            + ([f"Launch: Run {number} ({launch.get('id')})"] if number else [])
            + ([_from_ci(launch)] if _from_ci(launch) else []),
            on(),
        )
    )

    # --- Subject configurations -----------------------------------------
    children.append(_heading(titles["subjects"], "h2", on()))
    for item in ranked:
        usage = _usage_of(_latest_run(item))
        line = f"{item.get('name') or item.get('id')}: agentspec {item.get('agent_spec_id') or 'unknown'}"
        if usage.get("model"):
            line += f", model {usage.get('model')}"
            if usage.get("provider"):
                line += f" ({usage.get('provider')})"
        children.append(_paragraph(line, on(experiment=item.get("id"))))
    if not ranked:
        children.append(_paragraph("No experiment yet.", on()))

    # --- Dataset and environment versions -------------------------------
    children.append(_heading(titles["versions"], "h2", on()))
    dataset = evalset.get("dataset_ref") if isinstance(evalset.get("dataset_ref"), dict) else None
    environments = sorted({str(_latest_run(item).get("summary", {}).get("environment") or "") for item in ranked} - {""})
    children.append(
        _bullets(
            [
                f"Dataset: {dataset.get('source_uid')} at revision {dataset.get('revision_uid')}" if dataset else "Dataset: none declared on the benchmark",
                f"Environment: {', '.join(environments) or 'the launch default'}",
                f"Run environment: {report.get('run_environment') or 'unknown'}",
            ],
            on(),
        )
    )

    # --- Cost and duration ----------------------------------------------
    children.append(_heading(titles["cost"], "h2", on()))
    children.append(
        _table(
            ["Experiment", "Latest run", "Credits", "Duration", "Tokens"],
            [
                [
                    str(item.get("name") or item.get("id")),
                    str(_latest_run(item).get("id") or ""),
                    _credits(_usage_of(_latest_run(item)).get("credits_consumed")),
                    _duration(_usage_of(_latest_run(item)).get("duration_ms")),
                    str(_usage_of(_latest_run(item)).get("total_tokens") or ""),
                ]
                for item in ranked
            ],
            on(),
        )
    )

    # --- Limitations ----------------------------------------------------
    children.append(_heading(titles["limitations"], "h2", on()))
    limits: list[str] = []
    for item in ranked:
        fetched, total = int(item.get("runs_fetched") or 0), int(item.get("runs_total") or 0)
        if total > fetched:
            limits.append(f"{item.get('name')}: {fetched} of {total} runs read; older runs are not in these numbers.")
    if any(name in {"llm_judge", "llm-judge"} for name in case_evaluators):
        limits.append("Some tasks are graded by an LLM judge; its explanation is on each task, and a judge can be wrong.")
    if not cases:
        limits.append("Task explanations and failure modes come from the task documents of a run; this report reads run metrics only.")
    limits.append("Pass rates are per run; a single run does not show variance.")
    children.append(_bullets(limits, on()))

    # --- Reproduction ---------------------------------------------------
    children.append(_heading(titles["reproduction"], "h2", on()))
    children.append(_paragraph("Every number above traces to a task and the notebook that produced it. To run the benchmark again:", on()))
    experiment_flags = " ".join(f"--experiment-id {item.get('id')}" for item in ranked[:1]) or "--experiment-id <experiment>"
    children.append(_paragraph(f"datalayer evals runs launch {experiment_flags} --run-mode batch", on(), IS_CODE))

    return {"root": {"children": children, "direction": "ltr", "format": "", "indent": 0, "type": "root", "version": 1}}
