# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Local evals package.

Provides the in-process eval scorer (:class:`EvalRunner`), its report
formatting helpers, and the agentspec-to-dataset adapter.

"Local" here means the evaluation runs entirely in-process against an async
``agent_fn`` callable: no runtime is launched and no platform
evalset/experiment/run records are created. It is used by the FastAPI route
``POST /api/v1/agents/{id}/evals/run``.

For the remote (platform) orchestrator that launches runtimes and persists
runs via the evals API see
:func:`agent_runtimes.evals.remote.execute_evalset_spec`.
"""

from agent_runtimes.evals.local.report import (
    CaseResult,
    EvalReportData,
    ReportSummary,
    format_report,
    save_report_json,
)
from agent_runtimes.evals.local.runner import EvalReport, EvalRunner
from agent_runtimes.evals.local.spec_adapter import (
    build_dataset_from_spec,
    parse_eval_spec,
)

__all__ = [
    "CaseResult",
    "EvalReport",
    "EvalReportData",
    "EvalRunner",
    "ReportSummary",
    "build_dataset_from_spec",
    "format_report",
    "parse_eval_spec",
    "save_report_json",
]
