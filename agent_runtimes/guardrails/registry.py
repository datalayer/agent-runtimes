# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Guardrail registry — convenience function for spec-driven wiring.
"""

from __future__ import annotations

import logging
from typing import Any

from .pipeline import GuardrailPipeline

logger = logging.getLogger(__name__)


def build_guardrail_pipeline(
    spec_guardrails: list[dict] | None = None,
    advanced: dict | None = None,
) -> GuardrailPipeline:
    """Build a ``GuardrailPipeline`` from AgentSpec fields.

    This is the main entry point for creating a guardrail pipeline from
    an AgentSpec. It processes both the ``guardrails`` list and any
    relevant ``advanced`` configuration (e.g. ``cost_limit`` → cost guardrail).

    Parameters
    ----------
    spec_guardrails : list[dict] | None
        The ``guardrails`` list from an ``AgentSpec``.
    advanced : dict | None
        The ``advanced`` dict from an ``AgentSpec``.

    Returns
    -------
    GuardrailPipeline
        A configured pipeline.
    """
    guardrail_entries = list(spec_guardrails) if spec_guardrails else []

    # Extract cost_limit from advanced config if not already in guardrails
    if advanced:
        cost_limit = advanced.get("cost_limit")
        if cost_limit is not None:
            has_cost = any("cost_budget" in entry for entry in guardrail_entries)
            if not has_cost:
                guardrail_entries.append({"cost_budget": {"per_run_usd": cost_limit}})
        time_limit = advanced.get("time_limit")
        if time_limit is not None:
            # Time limits are enforced via DBOS timeout, not a guardrail,
            # but we log it for awareness.
            logger.info(
                "Time limit from advanced config: %s (enforced via DBOS)", time_limit
            )

    return GuardrailPipeline.from_spec(guardrail_entries if guardrail_entries else None)
