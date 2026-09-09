# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The report engine's output, frozen.

One engine renders the Markdown and CSV the CLI prints, the GitHub Action
uploads and the AI Agents service serves, and its deep links live in
customers' pull requests for months. This freezes what it produces for the
reference benchmark (BENCHMARK.md, B0-05 and B0-13): a change to a section,
a column or a link is a deliberate edit to the golden files here, never a
surprise in a CI artifact.

The client is a fake shaped like `_StoreReportClient` in the AI Agents
service, which is the surface the engine reads. Time is pinned so the only
moving part is the code. Regenerate with ``UPDATE_GOLDEN=1``.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pytest

from agent_runtimes.evals import report as report_module
from agent_runtimes.evals.report import (
    build_eval_report,
    render_eval_report_markdown,
    write_eval_report_csv,
)

GOLDEN = Path(__file__).parent / "golden"
FROZEN_NOW = "2026-09-09T12:00:00.000000Z"

EVALSET_ID = "evalset-reference"

CASES = [
    ("row-count", "counting", "easy", "2000"),
    ("exact-duplicate-rows", "duplicates", "easy", "0"),
    ("duplicate-customers", "duplicates", "medium", "157"),
    ("duplicate-rows", "duplicates", "medium", "314"),
    ("largest-plan", "aggregation", "easy", "free"),
    ("unique-customers", "counting", "medium", "1843"),
]

EVALSET: dict[str, Any] = {
    "id": EVALSET_ID,
    "owner_uid": "user-1",
    "name": "Data Analysis Agent Benchmark",
    "description": "The reference benchmark.",
    "run_environment": "sdk",
    "kind": "batch",
    "schema": {},
    "evalset_evaluators": [{"name": "pass_rate_threshold", "arguments": {"threshold": 0.6}}],
    "report_evaluators": [],
    "tags": ["reference"],
    "metadata": {"agentspec_ids": ["jupyter-data-analyst", "example-evals"]},
    "cases": [
        {
            "id": f"case-{index}",
            "name": name,
            "inputs": {"prompt": f"Question {index} about customers.csv"},
            "expected_output": expected,
            "evaluators": [{"name": "contains"}],
            "metadata": {"category": category, "difficulty": difficulty},
        }
        for index, (name, category, difficulty, expected) in enumerate(CASES, start=1)
    ],
    "is_public": True,
    "created_at": "2026-09-01T00:00:00Z",
    "updated_at": "2026-09-01T00:00:00Z",
    "archived": False,
}


def _experiment(index: int, agent_spec_id: str) -> dict[str, Any]:
    return {
        "id": f"experiment-{index}",
        "owner_uid": "user-1",
        "evalset_id": EVALSET_ID,
        "name": agent_spec_id,
        "description": "",
        "status": "completed",
        "config": {"run_mode": "batch", "agent_spec_id": agent_spec_id, "execution_target": "cloud"},
        "summary": {"agent_spec_id": agent_spec_id},
        "tags": [],
        "created_at": "2026-09-01T00:00:00Z",
        "updated_at": "2026-09-02T00:00:00Z",
        "archived": False,
    }


def _run(experiment_index: int, run_index: int, outcomes: list[bool], agent_spec_id: str) -> dict[str, Any]:
    case_results = [
        {
            "name": name,
            "passed": passed,
            "status": "passed" if passed else "failed",
            "score": 1.0 if passed else 0.0,
            "category": category,
            "difficulty": difficulty,
            "prompt": f"Question about {name}",
            "output": expected if passed else "unsure",
        }
        for (name, category, difficulty, expected), passed in zip(CASES, outcomes)
    ]
    passed_count = sum(1 for passed in outcomes if passed)
    total = len(outcomes)
    rate = passed_count / total
    return {
        "id": f"run-{experiment_index}-{run_index}",
        "experiment_id": f"experiment-{experiment_index}",
        "owner_uid": "user-1",
        "status": "completed",
        "started_at": f"2026-09-0{run_index}T10:00:00Z",
        "ended_at": f"2026-09-0{run_index}T10:18:24Z",
        "metrics": {
            "pass_rate": rate,
            "total_cases": total,
            "passed": passed_count,
            "failed": total - passed_count,
            "avg_score": rate,
            "case_results": case_results,
            "evaluator_results": [
                {
                    "name": "pass_rate_threshold",
                    "scope": "evalset",
                    "score": round(rate, 4),
                    "passed": rate >= 0.6,
                    "passed_cases": passed_count,
                    "total_cases": total,
                    "threshold": 0.6,
                    "observed": round(rate, 4),
                    "summary": f"pass rate {rate:.2f} {'≥' if rate >= 0.6 else '<'} threshold 0.60",
                }
            ],
            "pydantic_ai_usage": {
                "provider": "bedrock",
                "model": "claude-sonnet-4-6",
                "requests": total,
                "prompt_tokens": 1200 * total,
                "completion_tokens": 300 * total,
                "total_tokens": 1500 * total,
                "duration_ms": 184_000,
                "credits_consumed": 3.2,
            },
        },
        "summary": {
            "agent_spec_id": agent_spec_id,
            "execution_target": "cloud",
            "run_mode": "batch",
            "launch_source": "datalayer-core",
        },
        "report": {"interaction": [{"case": name, "prompt": "…", "output": "…"} for name, *_ in CASES]},
        "created_at": f"2026-09-0{run_index}T10:18:24Z",
        "updated_at": f"2026-09-0{run_index}T10:18:24Z",
    }


EXPERIMENTS = [_experiment(1, "jupyter-data-analyst"), _experiment(2, "example-evals")]
RUNS: dict[str, list[dict[str, Any]]] = {
    # Newest first, the way the store lists them.
    "experiment-1": [
        _run(1, 3, [True, True, False, True, True, True], "jupyter-data-analyst"),
        _run(1, 2, [True, True, False, False, True, True], "jupyter-data-analyst"),
        _run(1, 1, [True, True, False, False, True, False], "jupyter-data-analyst"),
    ],
    "experiment-2": [
        _run(2, 2, [True, False, False, False, True, False], "example-evals"),
        _run(2, 1, [True, False, False, False, True, True], "example-evals"),
    ],
}


class FakeStoreClient:
    """`_StoreReportClient` from the AI Agents service, answered from fixtures."""

    def evals_list_evals(self, q=None, limit=200, offset=0, **_):
        return {"evalsets": [EVALSET] if q in (None, "", EVALSET_ID) else []}

    def evals_list_experiments(self, evalset_id=None, limit=200, offset=0, **_):
        rows = [row for row in EXPERIMENTS if evalset_id in (None, row["evalset_id"])]
        return {"experiments": rows[offset : offset + limit], "total": len(rows)}

    def evals_list_runs(self, experiment_id, limit=50, offset=0, **_):
        rows = RUNS.get(experiment_id, [])
        return {"runs": rows[offset : offset + limit], "total": len(rows)}

    def evals_compare_runs(self, run_ids, **_):
        by_id = {run["id"]: run for rows in RUNS.values() for run in rows}
        return {"runs": [by_id[run_id] for run_id in run_ids if run_id in by_id]}


@pytest.fixture
def frozen_report(monkeypatch, tmp_path):
    monkeypatch.setattr(report_module, "_now_iso", lambda: FROZEN_NOW)
    report = build_eval_report(FakeStoreClient(), EVALSET_ID, run_limit=10)
    markdown = render_eval_report_markdown(report, run_limit=10)
    csv_path = write_eval_report_csv(report, tmp_path / "report.csv")
    csv_text = Path(csv_path).read_text(encoding="utf-8")
    return report, markdown, csv_text


def _check(name: str, produced: str) -> None:
    path = GOLDEN / name
    if os.environ.get("UPDATE_GOLDEN"):
        GOLDEN.mkdir(parents=True, exist_ok=True)
        path.write_text(produced, encoding="utf-8")
        return
    assert path.exists(), f"{path} is missing; run with UPDATE_GOLDEN=1 to write it"
    expected = path.read_text(encoding="utf-8")
    assert produced == expected, (
        f"{name} changed. If the change is intended, run with UPDATE_GOLDEN=1 "
        "and review the diff of the golden file."
    )


def test_the_report_data_is_the_golden_json(frozen_report):
    report, _, _ = frozen_report
    _check("evals-report.json", json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def test_the_markdown_is_the_golden_markdown(frozen_report):
    _, markdown, _ = frozen_report
    _check("evals-report.md", markdown)


def test_the_csv_is_the_golden_csv(frozen_report):
    _, _, csv_text = frozen_report
    _check("evals-report.csv", csv_text)


def test_the_report_reads_the_fixture(frozen_report):
    report, markdown, csv_text = frozen_report
    assert report["evalset_id"] == EVALSET_ID
    assert [experiment["id"] for experiment in report["experiments"]] == ["experiment-1", "experiment-2"]
    assert report["experiments"][0]["runs_fetched"] == 3
    assert report["generated_at"] == FROZEN_NOW
    assert "## Comparison Combinations" in markdown
    assert csv_text.splitlines()[0].startswith("row_type")
    # The deep links the contract of B0-04 keeps.
    assert f"/evals/experiments/sdk/{EVALSET_ID}" in markdown
