# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Remote evals package.

Provides the remote (platform) evalset/experiment/run helpers, evaluators,
report engine, and orchestration runner (:func:`execute_evalset_spec`) used by
the ``agent-runtimes evals`` CLI, the GitHub Action, and the examples.

"Remote" here means the run is orchestrated against the Datalayer platform
(evalset/experiment/run records are created via the evals API). The agent under
test can execute either on a cloud runtime (``execution_target="cloud"``) or on
a local ``agent-runtimes`` server (``execution_target="local"``); in both cases
the grading and persistence happen through the remote platform API.

For the purely in-process scorer (no platform records, no runtime launch) see
:class:`agent_runtimes.evals.local.EvalRunner`.
"""

from agent_runtimes.evals.remote.evals import (
    build_eval_report,
    load_evalset_spec,
    make_client,
    merge_dicts,
    now_iso,
    parse_json_file,
    parse_json_value,
    render_eval_report_markdown,
    resolve_billable_account_uid,
    timestamp_slug,
    watch_runs,
    write_eval_report_csv,
    write_eval_reports,
)
from agent_runtimes.evals.remote.evaluators import (
    evaluate_evalset,
    evaluate_run,
    run_and_evaluate_evalset,
    run_case_evaluators,
)
from agent_runtimes.evals.remote.report import (
    average_latest_pass_rate,
    collect_report_failures,
    iter_report_runs,
)
from agent_runtimes.evals.remote.runner import execute_evalset_spec

__all__ = [
    "average_latest_pass_rate",
    "build_eval_report",
    "collect_report_failures",
    "evaluate_evalset",
    "evaluate_run",
    "execute_evalset_spec",
    "iter_report_runs",
    "load_evalset_spec",
    "make_client",
    "merge_dicts",
    "now_iso",
    "parse_json_file",
    "parse_json_value",
    "render_eval_report_markdown",
    "resolve_billable_account_uid",
    "run_and_evaluate_evalset",
    "run_case_evaluators",
    "timestamp_slug",
    "watch_runs",
    "write_eval_report_csv",
    "write_eval_reports",
]
