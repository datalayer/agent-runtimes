# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The links a report embeds and the CLI prints, pinned (BENCHMARK.md B0-04, B4-08).

A Markdown report lives in a pull request for months. Its links point at the
pages people use — the benchmark and the run — on the deployment
`DATALAYER_UI_URL` names, never at a host written into the code. The landings
UI pins the same shapes in `evalsDeepLinks.spec.ts` and routes each.
"""

import pytest

from agent_runtimes.evals import links


@pytest.fixture(autouse=True)
def _deployment(monkeypatch):
    monkeypatch.setenv("DATALAYER_UI_URL", "https://datalayer.example/")


def test_the_deployment_is_the_one_named_and_datalayers_otherwise(monkeypatch):
    assert links.ui_base_url() == "https://datalayer.example"
    monkeypatch.delenv("DATALAYER_UI_URL")
    assert links.ui_base_url() == links.DEFAULT_UI_URL


def test_the_benchmark_and_its_live_report():
    assert links.benchmark_url("evalset-1") == "https://datalayer.example/benchmarks/evalset-1"
    assert links.benchmark_report_url("evalset-1") == "https://datalayer.example/benchmarks/evalset-1/report"
    assert links.benchmark_url("") == "" and links.benchmark_report_url("") == ""


def test_the_run_and_one_of_its_experiment_runs():
    assert links.launch_url("launch-128") == "https://datalayer.example/runs/launch-128"
    assert links.run_url("launch-128", "run-9") == "https://datalayer.example/runs/launch-128/experiments/run-9"
    # A run is reached through its launch: without one there is no run page.
    assert links.run_url("", "run-9") == "" and links.run_url("launch-128", "") == ""


def test_the_agentspec():
    assert links.agentspec_url("jupyter-data-analyst") == "https://datalayer.example/settings/agentspecs/jupyter-data-analyst"
    assert links.agentspec_url("") == ""


def test_ids_are_encoded_once():
    assert links.benchmark_url("a/b").endswith("/benchmarks/a%2Fb")
    assert links.run_url("l 1", "r/1").endswith("/runs/l%201/experiments/r%2F1")
    assert links.agentspec_url("x y").endswith("/settings/agentspecs/x%20y")
