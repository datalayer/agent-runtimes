# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Evaluation report formatting and persistence."""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class CaseResult:
    """Result of a single evaluation case."""

    case_name: str
    passed: bool
    score: float | None = None
    actual_output: str | None = None
    expected_output: str | None = None
    duration_ms: float = 0.0
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ReportSummary:
    """Aggregated summary of an eval report."""

    total_cases: int = 0
    passed: int = 0
    failed: int = 0
    error_count: int = 0
    avg_score: float | None = None
    total_duration_ms: float = 0.0
    categories: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class EvalReportData:
    """Full evaluation report data."""

    eval_id: str
    agent_id: str
    started_at: str = ""
    completed_at: str = ""
    summary: ReportSummary = field(default_factory=ReportSummary)
    case_results: list[CaseResult] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


def format_report(
    eval_id: str,
    agent_id: str,
    case_results: list[CaseResult],
    started_at: datetime | None = None,
    metadata: dict[str, Any] | None = None,
) -> EvalReportData:
    """Build a structured eval report from individual case results.

    Parameters
    ----------
    eval_id : str
        Unique identifier for this eval run.
    agent_id : str
        The agent that was evaluated.
    case_results : list[CaseResult]
        Results for each evaluation case.
    started_at : datetime | None
        When the eval run started.
    metadata : dict | None
        Additional metadata (spec version, model, etc.).
    """
    now = datetime.now(timezone.utc)
    summary = _compute_summary(case_results)

    return EvalReportData(
        eval_id=eval_id,
        agent_id=agent_id,
        started_at=(started_at or now).isoformat(),
        completed_at=now.isoformat(),
        summary=summary,
        case_results=case_results,
        metadata=metadata or {},
    )


def _compute_summary(case_results: list[CaseResult]) -> ReportSummary:
    """Compute aggregate metrics from individual case results."""
    total = len(case_results)
    passed = sum(1 for c in case_results if c.passed)
    failed = sum(1 for c in case_results if not c.passed and not c.error)
    errors = sum(1 for c in case_results if c.error)
    total_duration = sum(c.duration_ms for c in case_results)

    scores = [c.score for c in case_results if c.score is not None]
    avg_score = sum(scores) / len(scores) if scores else None

    # Per-category breakdown
    categories: dict[str, dict[str, Any]] = {}
    for c in case_results:
        cat = c.metadata.get("category", "general")
        if cat not in categories:
            categories[cat] = {"total": 0, "passed": 0, "scores": []}
        categories[cat]["total"] += 1
        if c.passed:
            categories[cat]["passed"] += 1
        if c.score is not None:
            categories[cat]["scores"].append(c.score)

    # Finalize category stats
    for cat_data in categories.values():
        cat_scores = cat_data.pop("scores")
        cat_data["avg_score"] = (
            sum(cat_scores) / len(cat_scores) if cat_scores else None
        )

    return ReportSummary(
        total_cases=total,
        passed=passed,
        failed=failed,
        error_count=errors,
        avg_score=avg_score,
        total_duration_ms=total_duration,
        categories=categories,
    )


def save_report_json(
    report: EvalReportData,
    output_dir: str = "/tmp/agent-evals",
) -> str:
    """Persist an eval report as JSON.  Returns the file path."""
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, f"{report.eval_id}.json")

    # Serialize dataclasses
    import dataclasses

    data = dataclasses.asdict(report)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)

    logger.info("Saved eval report: %s", path)
    return path
