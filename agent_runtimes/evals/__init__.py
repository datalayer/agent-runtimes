# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Evaluation module – pydantic-evals integration for agent quality scoring."""

from .runner import EvalRunner, EvalReport
from .spec_adapter import build_dataset_from_spec
from .report import format_report, ReportSummary

__all__ = [
    "EvalRunner",
    "EvalReport",
    "build_dataset_from_spec",
    "format_report",
    "ReportSummary",
]
