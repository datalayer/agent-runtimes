# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Decisions Catalog.

How an agent decides: the model asked typed decisions, the question
types it answers, the limits of one call. An agent has the capability
when its spec names one of these.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Optional

from agent_runtimes.types import DecisionsSpec

# ============================================================================
# Decisions Definitions
# ============================================================================

JEV_DECISIONS_0_0_1 = DecisionsSpec(
    id="jev",
    version="0.0.1",
    name="Jev",
    description="Typed decisions about a text, asked of Jev at Cloudflare Workers AI: does a statement hold (yes or no, with its probability), which of named options fits, or where something sits on a scale — each answered with calibrated probabilities and paid from the account's credits.",
    enabled=True,
    model="cloudflare:wrk/typesafe/jev",
    questions=["noul", "choice", "score"],
    max_questions=10,
    max_text_length=20000,
    tags=["decisions", "jev", "cloudflare"],
    icon="@primer/octicons-react:law",
    emoji="⚖️",
)

# ============================================================================
# Decisions Catalog
# ============================================================================

DECISIONS_CATALOGUE: dict[str, DecisionsSpec] = {
    "jev": JEV_DECISIONS_0_0_1,
}


def get_decisions(decisions_id: str) -> Optional[DecisionsSpec]:
    """
    Get a decisions specification by ID (accepts both bare and versioned refs).

    Args:
        decisions_id: The identifier of the decisions spec, `id` or `id:version`.

    Returns:
        The DecisionsSpec, or None if not found.
    """
    spec = DECISIONS_CATALOGUE.get(decisions_id)
    if spec is not None:
        return spec
    base, _, ver = decisions_id.rpartition(":")
    if base and "." in ver:
        return DECISIONS_CATALOGUE.get(base)
    return None


def list_decisions() -> list[DecisionsSpec]:
    """
    List all decisions specifications.

    Returns:
        List of all DecisionsSpec specifications.
    """
    return list(DECISIONS_CATALOGUE.values())
