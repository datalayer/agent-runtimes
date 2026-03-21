# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Evaluation module – pydantic-evals integration for agent quality scoring."""

from .report import ReportSummary, format_report
from .runner import EvalReport, EvalRunner
from .spec_adapter import build_dataset_from_spec

__all__ = [
    "EvalRunner",
    "EvalReport",
    "build_dataset_from_spec",
    "format_report",
    "ReportSummary",
]
