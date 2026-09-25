# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An execution's model budget, to the worker and back (PLAN_ORCHESTRATOR.md, O1-07).

The delegation carries the limits the execution's policy sets, the worker
turns them into pydantic-ai's per-run ``UsageLimits``, a limit reached is said
back naming the limit, and the adapters read that into ``budget_exhausted``
with ``details.budget = model`` — a reason of its own beside the platform
budget's.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from datalayer_core.orchestration import Budget, ErrorCode
from pydantic_ai.exceptions import UsageLimitExceeded

from agent_runtimes.guardrails.model_budget import (
    ModelBudgetReached,
    acp_stop_reason,
    delegated_budget,
    reached,
    refusal_meta,
    usage_limits_for,
)
from agent_runtimes.orchestration.budget import (
    budget_refusal,
    delegation_meta,
    model_budget,
)
from agent_runtimes.tests.orchestration_records import an_execution


def _with_budget(**limits):
    execution = an_execution(references=())
    return execution.model_copy(
        update={
            "policy": execution.policy.model_copy(update={"budget": Budget(**limits)})
        }
    )


class TestTheDelegationCarriesIt:
    def test_only_the_limits_the_policy_sets_travel(self) -> None:
        assert model_budget(_with_budget(output_tokens=100, cost=0.5)) == {
            "outputTokens": 100,
            "cost": 0.5,
            "currency": "USD",
        }
        assert delegation_meta(_with_budget(input_tokens=1000)) == {
            "datalayer": {"budget": {"inputTokens": 1000}}
        }

    def test_a_policy_with_no_model_limit_carries_nothing(self) -> None:
        # Credits are the platform's budget, held in IAM, not the worker's.
        assert delegation_meta(_with_budget(credits=5.0, wall_clock_seconds=60)) is None

    def test_the_worker_reads_it_back_from_where_it_was_put(self) -> None:
        meta = delegation_meta(_with_budget(output_tokens=100))
        assert delegated_budget(meta) == {"outputTokens": 100}
        assert (
            delegated_budget({"other": {}}) is None and delegated_budget(None) is None
        )


class TestTheWorkerAppliesItToTheRun:
    def test_the_limits_are_pydantic_ais_own(self) -> None:
        limits = usage_limits_for(
            {"inputTokens": 1000, "outputTokens": 100, "cost": 0.5, "currency": "USD"}
        )
        assert (
            limits.input_tokens_limit,
            limits.output_tokens_limit,
            limits.cost_limit,
        ) == (1000, 100, Decimal("0.5"))

    def test_no_limit_is_no_usage_limits(self) -> None:
        assert (
            usage_limits_for(None) is None
            and usage_limits_for({"currency": "USD"}) is None
        )

    @pytest.mark.parametrize(
        ("message", "limit", "stop"),
        (
            (
                "Exceeded the output_tokens_limit of 100 (output_tokens=150)",
                "output_tokens",
                "max_tokens",
            ),
            (
                "Exceeded the input_tokens_limit of 10 (input_tokens=12)",
                "input_tokens",
                "max_tokens",
            ),
            (
                "Exceeded the `cost_limit` of 0.5 (`usage.cost`=Decimal('0.7'))",
                "cost",
                "max_tokens",
            ),
            (
                "The next request would exceed the request_limit of 50",
                "requests",
                "max_turn_requests",
            ),
        ),
    )
    def test_a_limit_reached_names_the_limit(self, message, limit, stop) -> None:
        said = reached(UsageLimitExceeded(message))
        # pydantic-ai adds a pointer to its docs after its own words.
        assert isinstance(said, ModelBudgetReached) and str(said).startswith(message)
        assert said.limit == limit and acp_stop_reason(said.limit) == stop


class TestTheAdaptersReadItBack:
    def test_what_the_worker_says_is_budget_exhausted_on_the_model_budget(self) -> None:
        said = ModelBudgetReached(
            "Exceeded the output_tokens_limit of 100 (output_tokens=150)",
            "output_tokens",
        )
        error = budget_refusal(refusal_meta(said), source="adapter:a2a")
        assert (
            error is not None
            and error.code is ErrorCode.BUDGET_EXHAUSTED
            and error.retryable is False
        )
        assert error.details == {
            "budget": "model",
            "limit": "output_tokens",
            "delegated": True,
        }
        assert error.message == str(said)

    def test_anything_else_is_not_read_as_a_budget(self) -> None:
        assert budget_refusal(None, source="adapter:acp") is None
        assert (
            budget_refusal(
                {"datalayer": {"error": {"code": "internal"}}}, source="adapter:acp"
            )
            is None
        )
