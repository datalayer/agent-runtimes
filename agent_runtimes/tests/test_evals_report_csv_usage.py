# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

import csv

from agent_runtimes.evals.saas.report import _report_appendix_lines, _write_report_csv


def test_write_report_csv_includes_usage_columns_and_values(tmp_path):
    report = {
        "evalset_id": "evalset-1",
        "run_environment": "ui",
        "generated_at": "2026-06-20T00:00:00Z",
        "experiments": [
            {
                "id": "exp-1",
                "name": "Experiment One",
                "agent_spec_id": "agent-1",
                "agent_spec_name": "Agent One",
                "runs_fetched": 1,
                "runs_total": 1,
                "baseline_pass_rate": 1.0,
                "latest_pass_rate": 1.0,
                "drift_delta": 0.0,
                "latest_two_delta": 0.0,
                "mean_pass_rate": 1.0,
                "stddev_pass_rate": 0.0,
                "runs": [
                    {
                        "id": "run-1",
                        "status": "completed",
                        "pass_rate": 1.0,
                        "failure_cause": {},
                        "metrics": {
                            "pydantic_ai_usage": {
                                "source": "reconciled",
                                "provider": "openai",
                                "model": "gpt-test",
                                "requests": 2,
                                "prompt_tokens": 100,
                                "completion_tokens": 20,
                                "total_tokens": 120,
                                "credits_consumed": 0.15,
                            },
                            "case_results": [
                                {
                                    "name": "case-1",
                                    "passed": True,
                                    "score": 1.0,
                                    "category": "basic",
                                    "difficulty": "easy",
                                }
                            ],
                        },
                    }
                ],
            }
        ],
        "evaluator_results": [],
    }

    output_path = tmp_path / "report.csv"
    _write_report_csv(report, output_path)

    with output_path.open("r", encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))

    assert rows

    run_row = next(row for row in rows if row.get("row_type") == "run")
    case_row = next(row for row in rows if row.get("row_type") == "case")

    assert run_row["usage_source"] == "reconciled"
    assert run_row["usage_provider"] == "openai"
    assert run_row["usage_model"] == "gpt-test"
    assert run_row["usage_requests"] == "2"
    assert run_row["usage_prompt_tokens"] == "100"
    assert run_row["usage_completion_tokens"] == "20"
    assert run_row["usage_total_tokens"] == "120"
    assert run_row["usage_credits_consumed"] == "0.15"

    assert case_row["usage_total_tokens"] == "120"
    assert case_row["usage_provider"] == "openai"


def test_write_report_csv_falls_back_to_report_usage_when_metrics_usage_missing(tmp_path):
    report = {
        "evalset_id": "evalset-1",
        "run_environment": "ui",
        "generated_at": "2026-06-20T00:00:00Z",
        "experiments": [
            {
                "id": "exp-1",
                "name": "Experiment One",
                "agent_spec_id": "agent-1",
                "agent_spec_name": "Agent One",
                "runs_fetched": 1,
                "runs_total": 1,
                "baseline_pass_rate": 1.0,
                "latest_pass_rate": 1.0,
                "drift_delta": 0.0,
                "latest_two_delta": 0.0,
                "mean_pass_rate": 1.0,
                "stddev_pass_rate": 0.0,
                "runs": [
                    {
                        "id": "run-1",
                        "status": "completed",
                        "pass_rate": 1.0,
                        "failure_cause": {},
                        "metrics": {
                            "case_results": [
                                {
                                    "name": "case-1",
                                    "passed": True,
                                    "score": 1.0,
                                    "category": "basic",
                                    "difficulty": "easy",
                                }
                            ],
                        },
                        "report": {
                            "usage": {
                                "pydantic_ai_usage": {
                                    "source": "reconciled",
                                    "provider": "openai",
                                    "model": "gpt-test",
                                    "requests": 2,
                                    "prompt_tokens": 100,
                                    "completion_tokens": 20,
                                    "total_tokens": 120,
                                    "credits_consumed": 0.15,
                                }
                            }
                        },
                    }
                ],
            }
        ],
        "evaluator_results": [],
    }

    output_path = tmp_path / "report.csv"
    _write_report_csv(report, output_path)

    with output_path.open("r", encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))

    run_row = next(row for row in rows if row.get("row_type") == "run")
    case_row = next(row for row in rows if row.get("row_type") == "case")

    assert run_row["usage_source"] == "reconciled"
    assert run_row["usage_total_tokens"] == "120"
    assert run_row["usage_credits_consumed"] == "0.15"
    assert case_row["usage_provider"] == "openai"


def test_write_report_csv_supports_direct_usage_alias_keys(tmp_path):
    report = {
        "evalset_id": "evalset-1",
        "run_environment": "ui",
        "generated_at": "2026-06-20T00:00:00Z",
        "experiments": [
            {
                "id": "exp-1",
                "name": "Experiment One",
                "agent_spec_id": "agent-1",
                "agent_spec_name": "Agent One",
                "runs_fetched": 1,
                "runs_total": 1,
                "baseline_pass_rate": 1.0,
                "latest_pass_rate": 1.0,
                "drift_delta": 0.0,
                "latest_two_delta": 0.0,
                "mean_pass_rate": 1.0,
                "stddev_pass_rate": 0.0,
                "runs": [
                    {
                        "id": "run-1",
                        "status": "completed",
                        "pass_rate": 1.0,
                        "failure_cause": {},
                        "metrics": {
                            "case_results": [
                                {
                                    "name": "case-1",
                                    "passed": True,
                                    "score": 1.0,
                                    "category": "basic",
                                    "difficulty": "easy",
                                }
                            ],
                        },
                        "usage": {
                            "provider": "openai",
                            "promptTokens": 90,
                            "completionTokens": 30,
                            "creditsConsumed": 0.2,
                        },
                    }
                ],
            }
        ],
        "evaluator_results": [],
    }

    output_path = tmp_path / "report.csv"
    _write_report_csv(report, output_path)

    with output_path.open("r", encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))

    run_row = next(row for row in rows if row.get("row_type") == "run")
    assert run_row["usage_provider"] == "openai"
    assert run_row["usage_prompt_tokens"] == "90"
    assert run_row["usage_completion_tokens"] == "30"
    assert run_row["usage_total_tokens"] == "120"
    assert run_row["usage_credits_consumed"] == "0.2"


def test_report_appendix_run_table_reads_direct_report_usage_payload():
    experiments = [
        {
            "name": "exp-1",
            "agent_spec_name": "Agent One",
            "runs": [
                {
                    "id": "run-1",
                    "status": "completed",
                    "pass_rate": 1.0,
                    "created_at": "2026-06-24T15:56:22Z",
                    "failure_cause": {},
                    "metrics": {
                        "passed": 5,
                        "total_cases": 5,
                        "avg_score": 1.0,
                    },
                    "report": {
                        "usage": {
                            "total_tokens": 321,
                            "credits_consumed": 0.42,
                        }
                    },
                }
            ],
        }
    ]

    lines = _report_appendix_lines(
        experiments,
        evalset_runs_url="",
        case_by_name={},
        representative_case_name=None,
    )
    content = "\n".join(lines)

    assert "| Total Tokens | Credits |" in content
    assert "321" in content
    assert "0.42" in content


