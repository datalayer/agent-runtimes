# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An execution's model budget, on the way to its worker and back (ORCHESTRATOR.md, O1-07).

The control plane does not count a worker's tokens. It hands the execution's
limits to the worker with the delegation — ``delegation_meta``, which both
adapters put where their protocol keeps extension fields — and the worker
stops its own run when one is reached (``agent_runtimes.guardrails.model_budget``).
What comes back is read by ``budget_refusal`` into the canonical error, so an
execution stopped by its model budget says so, and which limit, rather than
reading as a worker that broke.
"""

from __future__ import annotations

from typing import Any, Mapping

from datalayer_core.orchestration import ErrorCode, Execution, OrchestrationError

from agent_runtimes.context.delegation import CREDENTIAL_FIELD
from agent_runtimes.guardrails.model_budget import DELEGATION_META_KEY

__all__ = ["budget_refusal", "delegation_meta", "model_budget"]


def model_budget(execution: Execution) -> dict[str, Any] | None:
    """
    The part of an execution's budget a worker spends on models, when it sets any.

    Parameters
    ----------
    execution : Execution
        The execution being delegated.

    Returns
    -------
    dict[str, Any] | None
        ``inputTokens``, ``outputTokens`` and ``cost`` with its ``currency``,
        each only when set; nothing when none is.
    """
    budget = execution.policy.budget
    limits: dict[str, Any] = {}
    if budget.input_tokens is not None:
        limits["inputTokens"] = budget.input_tokens
    if budget.output_tokens is not None:
        limits["outputTokens"] = budget.output_tokens
    if budget.cost is not None:
        limits["cost"] = budget.cost
        limits["currency"] = budget.currency
    return limits or None


def delegation_meta(
    execution: Execution, *, credential: str | None = None
) -> dict[str, Any] | None:
    """
    What a delegation carries beside the objective: the model budget and the execution's credential.

    Parameters
    ----------
    execution : Execution
        The execution being delegated.
    credential : str | None
        The execution's own token, which the worker reaches Datalayer with for
        the run (O1-17). The worker takes it out of the message on arrival
        (``agent_runtimes.context.delegation``), so nothing keeps it.

    Returns
    -------
    dict[str, Any] | None
        The A2A message's ``metadata``, or the ACP prompt's ``_meta``; nothing
        when there is neither.
    """
    ours: dict[str, Any] = {}
    budget = model_budget(execution)
    if budget:
        ours["budget"] = budget
    if credential:
        ours[CREDENTIAL_FIELD] = credential
    return {DELEGATION_META_KEY: ours} if ours else None


def budget_refusal(
    meta: Any, *, source: str, delegated: bool = True
) -> OrchestrationError | None:
    """
    The model budget a worker says stopped it, as the canonical error.

    Parameters
    ----------
    meta : Any
        The A2A status message's ``metadata`` or the ACP response's ``_meta``.
    source : str
        The adapter reading it.
    delegated : bool
        Whether the budget was the execution's rather than the worker's own.

    Returns
    -------
    OrchestrationError | None
        ``budget_exhausted``, not retryable, with ``details.budget = model``
        and the limit; nothing when the worker says no such thing.
    """
    if not isinstance(meta, Mapping):
        return None
    ours = meta.get(DELEGATION_META_KEY)
    error = ours.get("error") if isinstance(ours, Mapping) else None
    if (
        not isinstance(error, Mapping)
        or error.get("code") != ErrorCode.BUDGET_EXHAUSTED.value
    ):
        return None
    details = error.get("details") if isinstance(error.get("details"), Mapping) else {}
    return OrchestrationError(
        code=ErrorCode.BUDGET_EXHAUSTED,
        message=str(error.get("message") or "The worker's model budget was reached."),
        retryable=False,
        source=source,
        details={
            "budget": "model",
            "limit": str(details.get("limit") or "tokens"),
            "delegated": delegated,
        },
    )
