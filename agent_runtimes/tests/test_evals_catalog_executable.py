# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The catalogue says which evaluators run, and it says the truth.

Nine evaluators are listed; four execute. The others were offered in the
picker and silently recorded as skipped, so a benchmark could claim an
LLM judge it never ran. `executable` on each spec is now generated from
the YAML and must agree with the registries the runner grades with
(BENCHMARK.md, B0-11): a flag that drifts from the code is what this fails on.
"""

from agent_runtimes.evals.remote.evaluators import CASE_EVALUATORS, REPORT_EVALUATORS
from agent_runtimes.specs.evals import list_eval_specs


def _runner_name(spec_id: str) -> str:
    return spec_id.strip().lower().replace("-", "_")


def test_every_executable_flag_matches_the_runner():
    runnable = set(CASE_EVALUATORS) | set(REPORT_EVALUATORS)
    for spec in list_eval_specs():
        assert spec.executable == (_runner_name(spec.id) in runnable), (
            f"{spec.id} says executable={spec.executable} but the runner "
            f"{'has' if _runner_name(spec.id) in runnable else 'lacks'} it"
        )


def test_the_four_that_run_and_the_five_that_do_not():  # noqa: D103 - five run now, with the judge
    by_id = {spec.id: spec.executable for spec in list_eval_specs()}
    assert {name for name, flag in by_id.items() if flag} == {"contains", "equals", "equals-expected", "llm-judge"}
    assert {name for name, flag in by_id.items() if not flag} == {
        "confusion-matrix-evaluator",
        "has-matching-span",
        "is-instance",
        "max-duration",
        "precision-recall-evaluator",
    }
    # The report evaluator is not a catalogue entry yet; it runs all the same.
    assert "pass_rate_threshold" in REPORT_EVALUATORS
