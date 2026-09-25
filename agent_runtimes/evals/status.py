# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The one vocabulary for what a run and a case are doing.

The evals service stores ``status`` as free text, and over time the writers
disagreed: the UI wrote ``queued``, the runner ``running`` and ``completed``,
the online path ``failed``, older code ``init``, ``pending``, ``error``,
``success``, ``done``. Every reader then kept its own set of "finished"
words, and a run the poller did not recognise as finished polled forever.

This module is the mapping every reader uses (BENCHMARK.md, B0-08): the
legacy words map onto the product vocabulary of section 11.4, and
"terminal" is answered here rather than by each caller. The service
enforces the vocabulary on write in a later phase (B2-01); until then a
value that means nothing maps to itself, lower-cased, so it is at least
visible rather than misread.

@module agent_runtimes.evals.status
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "RUN_STATUSES",
    "CASE_STATUSES",
    "TERMINAL_RUN_STATUSES",
    "TERMINAL_CASE_STATUSES",
    "normalize_run_status",
    "normalize_case_status",
    "is_terminal_run_status",
    "is_terminal_case_status",
]

#: What a run can be, in the order it moves.
RUN_STATUSES: tuple[str, ...] = (
    "queued",
    "provisioning",
    "running",
    "scoring",
    "completed",
    "failed",
    "review",
    "blocked",
    "cancelled",
)

#: What a case can be.
CASE_STATUSES: tuple[str, ...] = (
    "waiting",
    "provisioning",
    "running",
    "scoring",
    "passed",
    "failed",
    "review",
    "blocked",
    "cancelled",
)

#: A run in one of these is over: nothing will move it again.
TERMINAL_RUN_STATUSES: frozenset[str] = frozenset({"completed", "failed", "cancelled"})

#: A case in one of these is over.
TERMINAL_CASE_STATUSES: frozenset[str] = frozenset({"passed", "failed", "cancelled"})

#: Every word a writer has used for a run, and what it means today.
_LEGACY_RUN_STATUS: dict[str, str] = {
    "": "queued",
    "init": "queued",
    "pending": "queued",
    "queued": "queued",
    "provisioning": "provisioning",
    "starting": "provisioning",
    "running": "running",
    "in_progress": "running",
    "scoring": "scoring",
    "evaluating": "scoring",
    "completed": "completed",
    "complete": "completed",
    "success": "completed",
    "succeeded": "completed",
    "passed": "completed",
    "done": "completed",
    "finished": "completed",
    "failed": "failed",
    "failure": "failed",
    "error": "failed",
    "errored": "failed",
    "review": "review",
    "needs_review": "review",
    "blocked": "blocked",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "aborted": "cancelled",
}

#: Every word a writer has used for a case.
_LEGACY_CASE_STATUS: dict[str, str] = {
    "": "waiting",
    "waiting": "waiting",
    "queued": "waiting",
    "pending": "waiting",
    "provisioning": "provisioning",
    "running": "running",
    "scoring": "scoring",
    "passed": "passed",
    "pass": "passed",
    "success": "passed",
    "completed": "passed",
    "failed": "failed",
    "fail": "failed",
    "error": "failed",
    "review": "review",
    "needs_review": "review",
    "blocked": "blocked",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "skipped": "cancelled",
}


def _word(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def normalize_run_status(value: Any) -> str:
    """The section 11.4 word for a run status, whatever a writer wrote.

    A word nobody has used maps to itself, lower-cased, so an unexpected
    value shows up as what it is rather than as a guess.
    """
    word = _word(value)
    return _LEGACY_RUN_STATUS.get(word, word)


def normalize_case_status(value: Any) -> str:
    """The section 11.4 word for a case status."""
    word = _word(value)
    return _LEGACY_CASE_STATUS.get(word, word)


def is_terminal_run_status(value: Any) -> bool:
    """Whether a run with this status is over."""
    return normalize_run_status(value) in TERMINAL_RUN_STATUSES


def is_terminal_case_status(value: Any) -> bool:
    """Whether a case with this status is over."""
    return normalize_case_status(value) in TERMINAL_CASE_STATUSES
