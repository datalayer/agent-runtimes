# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Evaluation module.

Two evaluation entry points are provided:

- **Local, in-process scorer** — :class:`agent_runtimes.evals.local.EvalRunner`
  scores an agentspec ``evals`` config against an in-process ``agent_fn`` using
  pydantic-evals (or a manual fallback). No platform records are created and no
  runtime is launched. Used by the FastAPI route
  ``POST /api/v1/agents/{id}/evals/run``.
- **Remote, platform orchestrator** —
  :func:`agent_runtimes.evals.remote.execute_evalset_spec` creates an evalset,
  launches cloud or local agent execution, grades via the evals API, and
  persists runs. Used by the CLI, the GitHub Action, and the examples.

Shared, transport-agnostic helpers live in
:mod:`agent_runtimes.evals.common`.
"""

from .common import (
    compose_case_prompt,
    extract_case_usage,
    extract_text,
    merge_run_usage,
)
from .local import (
    EvalReport,
    EvalRunner,
    ReportSummary,
    build_dataset_from_spec,
    format_report,
)
from .remote import execute_evalset_spec

__all__ = [
    # Local in-process scorer
    "EvalRunner",
    "EvalReport",
    "build_dataset_from_spec",
    "format_report",
    "ReportSummary",
    # Remote platform orchestrator
    "execute_evalset_spec",
    # Shared helpers
    "compose_case_prompt",
    "extract_case_usage",
    "extract_text",
    "merge_run_usage",
]
