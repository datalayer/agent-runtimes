# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What one turn of an agent spent, as its answer says it (ORCHESTRATOR.md, O2-10).

The run's own count when its end reports one; otherwise what the agent's
counters grew by during the turn, and a cost only where the model was priced.
"""

from __future__ import annotations

import pytest

from agent_runtimes.context.costs import get_cost_store
from agent_runtimes.context.usage import TurnSpend, get_usage_tracker


def _priced_run(agent_id: str, cost: float, *, priced: bool = True) -> None:
    get_cost_store().record_run(
        agent_id=agent_id,
        model="test:model",
        input_tokens=30,
        output_tokens=10,
        run_cost_usd=cost,
        price_per_input_token=0.001 if priced else None,
        price_per_output_token=0.002 if priced else None,
        pricing_resolved=priced,
    )


def test_the_runs_own_count_is_what_the_turn_spent() -> None:
    turn = TurnSpend.begin("spend-reported")
    turn.reported({"prompt_tokens": 21, "completion_tokens": 8})
    spent = turn.settle()
    assert spent is not None
    assert (spent.input_tokens, spent.output_tokens, spent.cost) == (21, 8, None)
    assert turn.total_tokens == 29


def test_otherwise_what_the_agents_counters_grew_by_during_the_turn() -> None:
    tracker = get_usage_tracker()
    tracker.update_usage("spend-counted", input_tokens=100, output_tokens=40, requests=1)
    _priced_run("spend-counted", 0.5)
    turn = TurnSpend.begin("spend-counted")
    tracker.update_usage("spend-counted", input_tokens=30, output_tokens=10, requests=1)
    _priced_run("spend-counted", 0.07)
    spent = turn.settle()
    assert spent is not None
    assert (spent.input_tokens, spent.output_tokens) == (30, 10)
    assert spent.cost == pytest.approx(0.07)


def test_a_model_nobody_priced_is_not_free() -> None:
    turn = TurnSpend.begin("spend-unpriced")
    get_usage_tracker().update_usage("spend-unpriced", input_tokens=30, output_tokens=10, requests=1)
    _priced_run("spend-unpriced", 0.0, priced=False)
    spent = turn.settle()
    assert spent is not None
    assert (spent.input_tokens, spent.output_tokens, spent.cost) == (30, 10, None)


def test_a_turn_that_counted_nothing_says_nothing() -> None:
    assert TurnSpend.begin("spend-nothing").settle() is None
    assert TurnSpend.begin(None).settle() is None
