# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The links a report embeds, pinned.

A Markdown report lives in a pull request for months; the links it carries
must keep opening the right page through every route change the plan makes
(BENCHMARK.md, B0-04). The landings UI pins the same three shapes in
`evalsDeepLinks.spec.ts` and keeps a route or a redirect for each.
"""

from agent_runtimes.evals.report import (
    WEB_APP_BASE_URL,
    _agentspec_details_url,
    _evalset_runs_url,
    _run_overlay_url,
)


def test_the_agentspec_link():
    assert _agentspec_details_url("jupyter-data-analyst") == (
        f"{WEB_APP_BASE_URL}/settings/agentspecs/jupyter-data-analyst"
    )
    assert _agentspec_details_url("") == ""


def test_the_evalset_runs_link_carries_the_environment():
    assert _evalset_runs_url("evalset-1", "sdk") == f"{WEB_APP_BASE_URL}/evals/experiments/sdk/evalset-1"
    assert _evalset_runs_url("evalset-1", "ui") == f"{WEB_APP_BASE_URL}/evals/experiments/ui/evalset-1"
    # Without an environment the page is asked to find the evalset itself.
    assert _evalset_runs_url("evalset-1", "").startswith(f"{WEB_APP_BASE_URL}/evals/experiments")
    assert "evalset-1" in _evalset_runs_url("evalset-1", "")


def test_the_run_link_is_the_runs_page_with_the_run_named():
    runs = _evalset_runs_url("evalset-1", "sdk")
    assert _run_overlay_url(runs, "run-9") == f"{runs}?run=run-9"
    assert _run_overlay_url(runs, "") == runs


def test_ids_are_encoded_once():
    assert _evalset_runs_url("a/b", "sdk").endswith("/evals/experiments/sdk/a%2Fb")
    assert _agentspec_details_url("x y").endswith("/settings/agentspecs/x%20y")
