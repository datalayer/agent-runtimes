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
        # Every run belongs to a launch, and its link goes through it (B4-08).
        "launch_id": f"launch-12{run_index}",
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
    # The links point at Datalayer's own app unless a deployment is named (B4-08).
    monkeypatch.delenv("DATALAYER_UI_URL", raising=False)
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


def test_the_decisions_are_the_last_section_of_the_markdown(frozen_report):
    """What was decided follows the result, in the order it was decided
    (B4-03); a report nobody decided anything about has no such section."""
    report, markdown, _ = frozen_report
    assert "## Decisions" not in markdown
    decisions = [
        {
            "decided_at": "2026-09-10T09:00:00Z", "kind": "accepted_regression", "outcome": "accepted_with_limitations",
            "scope": "case", "scope_ref": "duplicate-customers", "decided_by_uid": "reviewer-1", "note": "Misses 3 of 157 | known gap",
        },
        {
            "decided_at": "2026-09-10T10:00:00Z", "kind": "evaluator_issue", "outcome": "blocked",
            "scope": "run", "scope_ref": "run-1-3", "decided_by_uid": "reviewer-2", "note": "",
        },
    ]
    decided = render_eval_report_markdown(report, run_limit=10, decisions=decisions)
    assert decided.startswith(markdown.rstrip())
    appendix = decided.split("## Decisions", 1)[1]
    assert "| 2026-09-10 | Accepted regression | Accepted with limitations | case duplicate-customers | reviewer-1 | Misses 3 of 157 \\| known gap |" in appendix
    assert appendix.index("Accepted regression") < appendix.index("Evaluator issue")


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
    # The links point at the benchmark's page on Datalayer's own app when no
    # deployment is named, and at no host written into the code (B4-08).
    from agent_runtimes.evals.links import DEFAULT_UI_URL

    assert f"{DEFAULT_UI_URL}/benchmarks/{EVALSET_ID}" in markdown
    assert "datalayer.ai/evals" not in markdown and "datalayer.ai/evals" not in csv_text


# --- The report as a Lexical document (B3-03) --------------------------------


LAUNCH = {"id": "launch-128", "number": 128, "status": "completed", "evalset_version": 3, "evalset_id": EVALSET_ID}
EVALSET_WITH_DATASET = {**EVALSET, "version": 3, "category": "data", "dataset_ref": {"source_uid": "src-customers", "revision_uid": "rev-7"}}


@pytest.fixture
def lexical_document(frozen_report):
    from agent_runtimes.evals.report import build_eval_report_lexical

    report, _, _ = frozen_report
    return build_eval_report_lexical(report, evalset=EVALSET_WITH_DATASET, launch=LAUNCH)


def test_the_lexical_document_is_the_golden_fixture(lexical_document):
    _check("evals-report.lexical.json", json.dumps(lexical_document, indent=2, sort_keys=True, ensure_ascii=False) + "\n")


def test_the_document_reads_in_the_order_of_section_13(lexical_document):
    from agent_runtimes.evals.lexical import REPORT_SECTIONS

    headings = [
        node["children"][0]["text"]
        for node in lexical_document["root"]["children"]
        if node.get("type") == "heading" and node.get("tag") == "h2"
    ]
    assert headings == [title for _, title in REPORT_SECTIONS]
    first = lexical_document["root"]["children"][0]
    assert first["type"] == "heading" and first["tag"] == "h1"
    assert first["children"][0]["text"] == "Data Analysis Agent Benchmark — Run 128"


def test_every_block_carries_its_provenance(lexical_document):
    from agent_runtimes.evals.lexical import ANALYSIS_MIME

    blocks = lexical_document["root"]["children"]
    # In the node state, which Lexical keeps: a key beside `type` is dropped
    # the first time the document is opened (B4-04).
    assert not any("provenance" in block for block in blocks)
    evidence = [block["$"]["evidence"] for block in blocks]
    assert all(set(mark) == {"evalset", "version", "launch", "experiment", "run", "case", "analysis", "block"} for mark in evidence)
    # Each block has its own anchor, in document order (B4-07).
    assert [mark["block"] for mark in evidence] == [f"block-{index}" for index in range(1, len(blocks) + 1)]
    assert all(mark["evalset"] == EVALSET_ID and mark["launch"] == "launch-128" and mark["version"] == 3 for mark in evidence)
    # Tables are Lexical tables; lines and comparisons are Jupyter outputs carrying the analysis.
    tables = [block for block in blocks if block["type"] == "table"]
    outputs = [block for block in blocks if block["type"] == "jupyter-output"]
    assert tables and outputs
    assert all(ANALYSIS_MIME in output["outputs"][0]["data"] for output in outputs)
    named = {output["$"]["evidence"]["analysis"] for output in outputs}
    assert "Latest Pass Rate By Experiment" in named and "latest_two" in named
    # The same report hydrates to the same uuids twice.
    assert len({output["jupyterOutputNodeUuid"] for output in outputs}) == len(outputs)


def test_a_run_document_narrows_to_its_experiment_and_reads_its_tasks(frozen_report):
    from agent_runtimes.evals.report import build_eval_report_lexical

    report, _, _ = frozen_report
    run = {"id": "run-1-3", "experiment_id": "experiment-1", "launch_id": "launch-128", "status": "completed", "evalset_version": 3}
    cases = [
        {"name": "row-count", "category": "counting", "status": "passed", "score": 1.0, "explanation": ""},
        {"name": "duplicate-customers", "category": "duplicates", "status": "failed", "score": 0.2, "explanation": "It answered 0; 157 customers repeat.", "failure_mode": "wrong_answer"},
    ]
    document = build_eval_report_lexical(report, evalset=EVALSET_WITH_DATASET, run=run, cases=cases)
    text = json.dumps(document, ensure_ascii=False)
    assert "wrong_answer · 1 task" in text and "It answered 0; 157 customers repeat." in text
    assert "example-evals" not in text.split("Pairwise deltas")[0]
    assert document["root"]["children"][0]["$"]["evidence"]["run"] == "run-1-3"


def test_the_comparisons_are_components_with_the_direction_written_down(frozen_report):
    """Heatmaps and pairwise deltas render as components, and A - B is fixed.

    `BENCHMARK.md` section 12.2 fixes the direction and B3-10 asks for these
    two kinds: **A is the candidate, B is the baseline, delta is `A - B`**. Two
    readers who disagree about the sign of a delta disagree about whether a
    change helped, so the convention travels in the payload rather than in
    whoever draws it.
    """
    report, _, _ = frozen_report
    analyses = {item["kind"]: item for item in report["report_analyses"]}
    assert "heatmap" in analyses and "pairwise" in analyses

    heatmap = analyses["heatmap"]
    # The last column is every experiment's latest run, whatever number of runs
    # each one has, so a column reads down as "the most recent".
    assert heatmap["columns"][-1] == "latest"
    assert len(heatmap["rows"]) == len(heatmap["values"])
    for row in heatmap["values"]:
        assert len(row) == len(heatmap["columns"])
        # A run an experiment does not have is absent, not zero: a gap drawn as
        # a zero reads as a total failure.
        assert all(value is None or isinstance(value, float) for value in row)

    pairwise = analyses["pairwise"]
    assert pairwise["convention"] == "delta = candidate - baseline"
    for pair in pairwise["pairs"]:
        assert pair["candidate"] != pair["baseline"]
        if pair["delta_pass_rate"] is not None:
            assert pair["delta_pass_rate"] == pytest.approx(
                pair["candidate_pass_rate"] - pair["baseline_pass_rate"]
            )
    # Both directions, because which one is the candidate is the reader's
    # question and not the report's.
    directions = {(pair["candidate"], pair["baseline"]) for pair in pairwise["pairs"]}
    assert all((b, a) in directions for a, b in directions)


def test_a_comparison_reaches_the_document_as_a_component(lexical_document):
    """Flattened into a table, a heatmap stops being a comparison."""
    from agent_runtimes.evals.lexical import ANALYSIS_MIME, COMPONENT_ANALYSES

    found: list[str] = []

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "jupyter-output":
                for output in node.get("outputs") or []:
                    payload = (output.get("data") or {}).get(ANALYSIS_MIME)
                    if isinstance(payload, dict) and payload.get("kind"):
                        found.append(str(payload["kind"]))
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(lexical_document)
    assert "heatmap" in found and "pairwise" in found
    assert set(found) <= set(COMPONENT_ANALYSES)
