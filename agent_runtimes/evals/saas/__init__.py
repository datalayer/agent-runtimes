# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2023-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""SaaS evals package (migrated from datalayer-core).

Provides the SaaS evalset/experiment/run helpers, evaluators, report engine, and
runner used by the ``agent-runtimes evals`` CLI, the GitHub Action, and the
examples.
"""

from agent_runtimes.evals.saas.evals import (
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
from agent_runtimes.evals.saas.evaluators import (
    evaluate_evalset,
    evaluate_run,
    run_and_evaluate_evalset,
    run_case_evaluators,
)
from agent_runtimes.evals.saas.report import (
    average_latest_pass_rate,
    collect_report_failures,
    iter_report_runs,
)
from agent_runtimes.evals.saas.runner import execute_evalset_spec

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
