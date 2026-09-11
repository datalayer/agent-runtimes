# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The model budget a delegation sets on one run (ORCHESTRATOR.md, O1-07).

An execution's policy may bound what its worker spends on models — input
tokens, output tokens, cost. The orchestration adapters carry that budget with
the delegation, under ``datalayer`` in the A2A message's ``metadata`` and in the
ACP prompt's ``_meta``, and the worker applies it to the run it starts as
pydantic-ai's own per-run ``UsageLimits``, which stop the run when a limit is
reached rather than after it. The worker then says which limit stopped it:
``refusal_meta`` is what goes back in the same place, and the adapters read it
into ``budget_exhausted`` with ``details.budget = model``.

Nothing here knows orchestration's records: this is the worker's half, and it
runs in any agent-runtimes process whatever asked it.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Any, Mapping

from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.usage import UsageLimits

__all__ = [
    "DELEGATION_META_KEY",
    "ModelBudgetExceeded",
    "ModelBudgetReached",
    "acp_stop_reason",
    "delegated_budget",
    "reached",
    "refusal_meta",
    "usage_limits_for",
]

#: Where a delegation carries Datalayer's own fields beside a protocol's.
DELEGATION_META_KEY = "datalayer"

#: pydantic-ai's limit names, as the budget's limits are called.
_LIMITS = {
    "request_limit": "requests",
    "tool_calls_limit": "tool_calls",
    "input_tokens_limit": "input_tokens",
    "output_tokens_limit": "output_tokens",
    "total_tokens_limit": "total_tokens",
    "cost_limit": "cost",
}
_LIMIT_NAMED = re.compile("|".join(_LIMITS))


def delegated_budget(meta: Any) -> dict[str, Any] | None:
    """
    The model budget a delegation carries, when it carries one.

    Parameters
    ----------
    meta : Any
        The A2A message's ``metadata`` or the ACP prompt's ``_meta``.

    Returns
    -------
    dict[str, Any] | None
        The budget, camel case as the canonical record spells it.
    """
    if not isinstance(meta, Mapping):
        return None
    ours = meta.get(DELEGATION_META_KEY)
    budget = ours.get("budget") if isinstance(ours, Mapping) else None
    return dict(budget) if isinstance(budget, Mapping) and budget else None


def usage_limits_for(budget: Mapping[str, Any] | None) -> UsageLimits | None:
    """
    The run's ``UsageLimits`` for a delegated budget, or none when it sets no limit.

    Parameters
    ----------
    budget : Mapping[str, Any] | None
        The delegated budget: ``inputTokens``, ``outputTokens``, ``cost``.

    Returns
    -------
    UsageLimits | None
        pydantic-ai's limits, its request limit left as its default.
    """
    if not budget:
        return None
    limits: dict[str, Any] = {}
    if budget.get("inputTokens") is not None:
        limits["input_tokens_limit"] = int(budget["inputTokens"])
    if budget.get("outputTokens") is not None:
        limits["output_tokens_limit"] = int(budget["outputTokens"])
    if budget.get("cost") is not None:
        limits["cost_limit"] = Decimal(str(budget["cost"]))
    return UsageLimits(**limits) if limits else None


class ModelBudgetReached(str):
    """What a run stopped by its model budget said, and which limit it was.

    A string, so that a transport which only knows how to show an error shows
    it as it always did; the limit rides along for the ones that can say it.
    """

    limit: str

    def __new__(cls, message: str, limit: str) -> "ModelBudgetReached":
        made = super().__new__(cls, message)
        made.limit = limit
        return made


class ModelBudgetExceeded(RuntimeError):
    """Raised where a transport ends a run its model budget stopped."""

    def __init__(self, reached: ModelBudgetReached) -> None:
        self.reached = reached
        super().__init__(str(reached))


def reached(error: UsageLimitExceeded) -> ModelBudgetReached:
    """
    The run's budget, reached, from pydantic-ai's refusal.

    Parameters
    ----------
    error : UsageLimitExceeded
        What pydantic-ai raised.

    Returns
    -------
    ModelBudgetReached
        Its words, with the limit named in them.
    """
    message = str(error)
    found = _LIMIT_NAMED.search(message)
    return ModelBudgetReached(message, _LIMITS[found.group(0)] if found else "tokens")


def acp_stop_reason(limit: str) -> str:
    """
    The ACP stop reason for a limit: the schema has one for requests and one for
    tokens, and a cost is spent in tokens.
    """
    return "max_turn_requests" if limit in {"requests", "tool_calls"} else "max_tokens"


def refusal_meta(budget_reached: ModelBudgetReached) -> dict[str, Any]:
    """
    What a worker says back, in the delegation's own place, when its budget stopped it.

    Parameters
    ----------
    budget_reached : ModelBudgetReached
        The limit reached.

    Returns
    -------
    dict[str, Any]
        The A2A status message's ``metadata``, or the ACP response's ``_meta``.
    """
    return {
        DELEGATION_META_KEY: {
            "error": {
                "code": "budget_exhausted",
                "message": str(budget_reached),
                "details": {"budget": "model", "limit": budget_reached.limit},
            }
        }
    }
