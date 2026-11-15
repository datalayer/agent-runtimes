# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What X costs Datalayer, held to budgets by the agent's guardrail (15 November 2026).

The user: "move X read/write to iam but create a guardrail to cap the usage to
a limited amount to avoid paying too much", then "we want to use a agent
guardrail, not a iam cap". The Marketer's ``api_budget`` guardrail
(``x-api-budget``) prices each X tool call from X's price table, refuses one
past the person's day or month or the platform's month, bounds how many posts a
read asks for, and counts what X returned. Its counters are protocol-state
records, which a fresh runtime over the same store reads back.
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import Any

import pytest
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

from agent_runtimes.capabilities.factory import build_capabilities_from_agent_spec
from agent_runtimes.guardrails import ApiBudgetCapability
from agent_runtimes.guardrails.usage_limits import (
    API_BUDGET_KIND,
    budget_keys,
    budget_periods,
)
from agent_runtimes.protocol_state.store import (
    PostgresProtocolStateStore,
    SqliteProtocolStateStore,
)
from agent_runtimes.specs.agents import get_agent_spec

ANA = "01ANA0000000000000000000AA"
BEN = "01BEN0000000000000000000BB"


def x_budget(spec: Any) -> dict[str, Any]:
    """The Marketer's x-api-budget, as its spec declares it."""
    for entry in spec.guardrails or []:
        if (
            isinstance(entry, dict)
            and entry.get("api_budget", {}).get("id") == "x-api-budget"
        ):
            return entry["api_budget"]
    raise AssertionError("worker-marketer declares no x-api-budget guardrail")


MARKETER = get_agent_spec("worker-marketer")
X = x_budget(MARKETER)


class Clock:
    def __init__(self, moment: datetime) -> None:
        self.moment = moment

    def __call__(self) -> datetime:
        return self.moment


def guardrail(
    store: Any,
    clock: Clock,
    person: str = ANA,
    budget_id: str = "",
    **budgets: float | None,
) -> ApiBudgetCapability:
    """The Marketer's guardrail with its prices and tools, the budgets given (the spec's otherwise)."""
    spec_budgets = X["budgets"]
    return ApiBudgetCapability(
        budget_id=budget_id or X["id"],
        provider=X["provider"],
        currency=X["currency"],
        prices=X["prices"],
        tools=X["tools"],
        per_person_daily=budgets.get("daily", spec_budgets["per_person_daily"]),
        per_person_monthly=budgets.get("monthly", spec_budgets["per_person_monthly"]),
        platform_monthly=budgets.get("platform", spec_budgets["platform_monthly"]),
        results=X["results"],
        counted_by=X["counted_by"],
        store=store,
        person=lambda: person,
        clock=clock,
    )


class Tool:
    """A tool the guardrail wraps: what it was called with, and what it answers."""

    def __init__(self, answer: Any) -> None:
        self.answer = answer
        self.calls: list[dict[str, Any]] = []

    async def __call__(self, args: dict[str, Any]) -> Any:
        self.calls.append(args)
        return self.answer(args) if callable(self.answer) else self.answer


async def call(
    capability: ApiBudgetCapability, name: str, args: dict[str, Any], tool: Tool
) -> Any:
    return await capability.wrap_tool_execute(
        None,  # type: ignore[arg-type]
        call=ToolCallPart(tool_name=name, args=args),
        tool_def=ToolDefinition(name=name),
        args=args,
        handler=tool,
    )


def posts(n: int) -> dict[str, Any]:
    return {"posts": [{"id": str(i)} for i in range(n)], "resources": n}


@pytest.fixture
def store(tmp_path: Any) -> SqliteProtocolStateStore:
    return SqliteProtocolStateStore(tmp_path / "state.sqlite")


NOON = datetime(2026, 11, 15, 12, 0, tzinfo=timezone.utc)


class TestTheSpec:
    def test_the_marketer_declares_x_s_prices_and_its_budgets(self) -> None:
        assert X["prices"] == {
            "post_read": 0.005,
            "user_read": 0.010,
            "owned_read": 0.001,
            "create_post": 0.015,
            "create_post_with_url": 0.200,
        }
        assert X["budgets"] == {
            "per_person_daily": 0.5,
            "per_person_monthly": 5.0,
            "platform_monthly": 100.0,
        }
        assert X["results"]["most"] == 20
        assert set(X["tools"]) == {
            "read_x",
            "post_to_x",
            "reply_on_x",
            "like_on_x",
            "repost_on_x",
        }
        # Every X tool the Marketer has is priced, and it reads X with no pasted key.
        assert "x:0.0.1" not in (MARKETER.mcp_servers or [])
        assert {
            "social-read-x:0.0.1",
            "social-reply-x:0.0.1",
            "social-like-x:0.0.1",
            "social-repost-x:0.0.1",
        } <= set(MARKETER.backend_tools or [])

    def test_the_runtime_builds_it_from_the_spec(self) -> None:
        built = [
            c
            for c in build_capabilities_from_agent_spec(
                MARKETER, agent_id="worker-marketer"
            )
            if isinstance(c, ApiBudgetCapability)
        ]
        assert len(built) == 1
        budget = built[0]
        assert (
            budget.budget_id,
            budget.provider,
            budget.per_person_daily,
            budget.per_person_monthly,
            budget.platform_monthly,
        ) == (
            "x-api-budget",
            "X",
            0.5,
            5.0,
            100.0,
        )

    def test_a_tool_priced_in_a_unit_the_table_lacks_is_refused(self) -> None:
        with pytest.raises(ValueError, match="price table"):
            ApiBudgetCapability(
                budget_id="b",
                provider="X",
                prices={"post_read": 0.005},
                tools={"post_to_x": {"unit": "create_post"}},
            )


class TestPricing:
    @pytest.mark.asyncio
    async def test_a_read_asks_for_twenty_posts_at_most_and_counts_what_x_returned(
        self, store: Any
    ) -> None:
        budget = guardrail(store, Clock(NOON))
        tool = Tool(lambda args: posts(3))
        answer = await call(
            budget,
            "read_x",
            {"what": "search", "query": "datalayer", "limit": 100},
            tool,
        )

        assert tool.calls == [{"what": "search", "query": "datalayer", "limit": 20}]
        spent = await budget.spent(ANA, NOON)
        # 3 posts returned at USD 0.005: reconciled after the call, not the 20 estimated.
        assert spent == {
            "person_day": 15_000,
            "person_month": 15_000,
            "platform_month": 15_000,
        }
        assert answer["budget"] == {"cost": "USD 0.015", "left_today": "USD 0.485"}

    @pytest.mark.asyncio
    async def test_no_limit_asks_for_the_default(self, store: Any) -> None:
        tool = Tool(lambda args: posts(10))
        await call(guardrail(store, Clock(NOON)), "read_x", {"what": "timeline"}, tool)
        assert tool.calls[0]["limit"] == 10

    @pytest.mark.parametrize(
        "args, micros",
        [
            ({"what": "me"}, 1_000),
            ({"what": "user", "username": "bob"}, 10_000),
            ({"what": "post", "post": "7"}, 5_000),
        ],
    )
    @pytest.mark.asyncio
    async def test_one_resource_reads_by_their_unit(
        self, store: Any, args: dict[str, Any], micros: int
    ) -> None:
        budget = guardrail(store, Clock(NOON))
        await call(budget, "read_x", args, Tool({"profile": {}, "resources": 1}))
        assert (await budget.spent(ANA, NOON))["person_day"] == micros

    @pytest.mark.parametrize(
        "name, args, micros",
        [
            ("post_to_x", {"text": "Hello"}, 15_000),
            ("post_to_x", {"text": "Read https://datalayer.ai"}, 200_000),
            ("reply_on_x", {"post": "7", "text": "Thanks http://a.b"}, 200_000),
            ("like_on_x", {"post": "7"}, 15_000),
            ("repost_on_x", {"post": "7"}, 15_000),
        ],
    )
    @pytest.mark.asyncio
    async def test_a_post_with_a_link_costs_twenty_cents(
        self, store: Any, name: str, args: dict[str, Any], micros: int
    ) -> None:
        budget = guardrail(store, Clock(NOON))
        await call(budget, name, args, Tool({"post_id": "1"}))
        assert (await budget.spent(ANA, NOON))["person_day"] == micros

    @pytest.mark.asyncio
    async def test_a_call_that_did_nothing_costs_nothing(self, store: Any) -> None:
        budget = guardrail(store, Clock(NOON))
        await call(
            budget,
            "read_x",
            {"what": "timeline"},
            Tool("X was not read (403): link X again."),
        )
        await call(
            budget, "post_to_x", {"text": "Hi"}, Tool("Nothing was posted to X (429).")
        )
        assert await budget.spent(ANA, NOON) == {
            "person_day": 0,
            "person_month": 0,
            "platform_month": 0,
        }

    @pytest.mark.asyncio
    async def test_a_tool_it_does_not_price_runs_as_it_is(self, store: Any) -> None:
        tool = Tool({"ok": True})
        assert await call(
            guardrail(store, Clock(NOON)), "post_to_bluesky", {"text": "Hi"}, tool
        ) == {"ok": True}
        assert await store.list(API_BUDGET_KIND) == []


class TestTheBudgets:
    @pytest.mark.asyncio
    async def test_past_the_person_s_day_it_refuses_and_says_when_it_resets(
        self, store: Any
    ) -> None:
        budget = guardrail(store, Clock(NOON), daily=0.03)
        tool = Tool({"post_id": "1"})
        await call(budget, "post_to_x", {"text": "one"}, tool)
        await call(budget, "post_to_x", {"text": "two"}, tool)
        refused = await call(budget, "post_to_x", {"text": "three"}, tool)

        assert len(tool.calls) == 2
        assert (
            refused
            == "This agent's X budget for today is used up (USD 0.03 a day); it resets at 00:00 UTC on 2026-11-16."
        )

    @pytest.mark.asyncio
    async def test_a_read_that_could_pass_the_day_is_refused_before_it_runs(
        self, store: Any
    ) -> None:
        # 20 posts may cost USD 0.10: with USD 0.05 left, the read is not asked.
        budget = guardrail(store, Clock(NOON), daily=0.05)
        tool = Tool(lambda args: posts(1))
        refused = await call(
            budget, "read_x", {"what": "search", "query": "q", "limit": 20}, tool
        )
        assert tool.calls == [] and refused.startswith(
            "This agent's X budget for today is used up"
        )
        # Fewer posts fit.
        assert (
            await call(
                budget, "read_x", {"what": "search", "query": "q", "limit": 10}, tool
            )
            != refused
        )

    @pytest.mark.asyncio
    async def test_past_the_person_s_month_it_refuses_until_the_first(
        self, store: Any
    ) -> None:
        clock = Clock(datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc))
        budget = guardrail(store, clock, daily=1.0, monthly=0.4)
        tool = Tool({"post_id": "1"})
        await call(budget, "post_to_x", {"text": "a link https://a.b"}, tool)
        clock.moment = datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc)
        await call(budget, "post_to_x", {"text": "a link https://a.b"}, tool)
        refused = await call(budget, "post_to_x", {"text": "Hi"}, tool)
        assert (
            refused
            == "This agent's X budget for this month is used up (USD 0.40 a month); it resets at 00:00 UTC on 2026-12-01."
        )

    @pytest.mark.asyncio
    async def test_past_the_platform_s_month_everyone_is_refused(
        self, store: Any
    ) -> None:
        clock = Clock(NOON)
        ana = guardrail(store, clock, ANA, platform=0.2)
        ben = guardrail(store, clock, BEN, platform=0.2)
        tool = Tool({"post_id": "1"})
        await call(ana, "post_to_x", {"text": "https://a.b"}, tool)
        refused = await call(ben, "post_to_x", {"text": "Hi"}, tool)

        assert (
            refused
            == "Datalayer's X budget for this month is used up for everyone; it resets at 00:00 UTC on 2026-12-01."
        )
        assert (await ben.spent(BEN, NOON))["person_day"] == 0

    @pytest.mark.asyncio
    async def test_the_day_resets_at_midnight_utc(self, store: Any) -> None:
        clock = Clock(datetime(2026, 11, 15, 23, 59, tzinfo=timezone.utc))
        budget = guardrail(store, clock, daily=0.015)
        tool = Tool({"post_id": "1"})
        await call(budget, "post_to_x", {"text": "a"}, tool)
        assert (await call(budget, "post_to_x", {"text": "b"}, tool)).startswith(
            "This agent's X budget for today"
        )
        clock.moment = datetime(2026, 11, 16, 0, 0, tzinfo=timezone.utc)
        assert await call(budget, "post_to_x", {"text": "c"}, tool) == {
            "post_id": "1",
            "budget": {"cost": "USD 0.015", "left_today": "USD 0.00"},
        }
        spent = await budget.spent(ANA, clock.moment)
        assert spent == {
            "person_day": 15_000,
            "person_month": 30_000,
            "platform_month": 30_000,
        }

    @pytest.mark.asyncio
    async def test_the_month_resets_on_the_first_and_december_into_january(
        self, store: Any
    ) -> None:
        clock = Clock(datetime(2026, 12, 31, 23, 0, tzinfo=timezone.utc))
        budget = guardrail(store, clock, daily=1.0, monthly=0.015, platform=0.015)
        tool = Tool({"post_id": "1"})
        await call(budget, "post_to_x", {"text": "a"}, tool)
        assert "resets at 00:00 UTC on 2027-01-01" in await call(
            budget, "post_to_x", {"text": "b"}, tool
        )
        clock.moment = datetime(2027, 1, 1, 0, 0, tzinfo=timezone.utc)
        assert await budget.spent(ANA, clock.moment) == {
            "person_day": 0,
            "person_month": 0,
            "platform_month": 0,
        }
        assert "budget" in await call(budget, "post_to_x", {"text": "c"}, tool)

    def test_the_periods_and_their_keys(self) -> None:
        periods = budget_periods(datetime(2026, 2, 28, 23, 30, tzinfo=timezone.utc))
        assert periods["day"] == "2026-02-28" and periods["month"] == "2026-02"
        assert periods["day_resets_at"] == datetime(2026, 3, 1, tzinfo=timezone.utc)
        assert periods["month_resets_at"] == datetime(2026, 3, 1, tzinfo=timezone.utc)
        assert budget_keys("x-api-budget", ANA, NOON) == {
            "person_day": f"x-api-budget:person:{ANA}:day:2026-11-15",
            "person_month": f"x-api-budget:person:{ANA}:month:2026-11",
            "platform_month": "x-api-budget:platform:month:2026-11",
        }


class TestTheCounters:
    @pytest.mark.asyncio
    async def test_a_new_runtime_reads_what_the_last_one_spent(
        self, tmp_path: Any
    ) -> None:
        first = guardrail(
            SqliteProtocolStateStore(tmp_path / "state.sqlite"), Clock(NOON), daily=0.03
        )
        tool = Tool({"post_id": "1"})
        await call(first, "post_to_x", {"text": "a"}, tool)
        await call(first, "post_to_x", {"text": "b"}, tool)
        # The runtime restarted: a new guardrail, a new store object, the same database.
        again = guardrail(
            SqliteProtocolStateStore(tmp_path / "state.sqlite"), Clock(NOON), daily=0.03
        )
        assert (await call(again, "post_to_x", {"text": "c"}, tool)).startswith(
            "This agent's X budget for today"
        )

    @pytest.mark.asyncio
    async def test_the_records_say_whose_what_and_the_limit(self, store: Any) -> None:
        await call(
            guardrail(store, Clock(NOON)),
            "read_x",
            {"what": "timeline", "limit": 5},
            Tool(posts(4)),
        )
        record = await store.get(
            API_BUDGET_KIND, f"x-api-budget:person:{ANA}:month:2026-11"
        )
        assert record is not None
        assert {
            k: record[k]
            for k in (
                "micros",
                "calls",
                "resources",
                "post_read_resources",
                "person",
                "scope",
                "period",
                "limit_micros",
                "provider",
                "currency",
            )
        } == {
            "micros": 20_000,
            "calls": 1,
            "resources": 4,
            "post_read_resources": 4,
            "person": ANA,
            "scope": "person_month",
            "period": "2026-11",
            "limit_micros": 5_000_000,
            "provider": "X",
            "currency": "USD",
        }
        platform = await store.get(
            API_BUDGET_KIND, "x-api-budget:platform:month:2026-11"
        )
        assert platform["person"] == "" and platform["limit_micros"] == 100_000_000

    @pytest.mark.asyncio
    async def test_two_runtimes_counting_at_once_both_count(self, store: Any) -> None:
        budgets = [guardrail(store, Clock(NOON), person) for person in (ANA, BEN) * 5]
        await asyncio.gather(
            *(
                call(b, "like_on_x", {"post": "7"}, Tool({"post_id": "7"}))
                for b in budgets
            )
        )
        platform = await store.get(
            API_BUDGET_KIND, "x-api-budget:platform:month:2026-11"
        )
        assert platform["micros"] == 10 * 15_000 and platform["calls"] == 10

    @pytest.mark.asyncio
    async def test_a_store_it_cannot_read_refuses_the_call(self) -> None:
        class Broken:
            async def get(self, kind: str, key: str) -> None:
                raise ConnectionError("down")

        tool = Tool({"post_id": "1"})
        answer = await call(
            guardrail(Broken(), Clock(NOON)), "post_to_x", {"text": "Hi"}, tool
        )
        assert tool.calls == [] and "could not be read" in answer


@pytest.mark.skipif(
    not os.environ.get("AGENT_RUNTIMES_TEST_POSTGRES"),
    reason="no PostgreSQL to count in (AGENT_RUNTIMES_TEST_POSTGRES)",
)
class TestInThePostgreSQL:
    @pytest.mark.asyncio
    async def test_the_database_sums_and_keeps_the_fields(self) -> None:
        store = PostgresProtocolStateStore(os.environ["AGENT_RUNTIMES_TEST_POSTGRES"])
        key = f"test:{os.getpid()}:{datetime.now().timestamp()}"
        try:
            first = await store.increment(
                API_BUDGET_KIND,
                key,
                {"micros": 15_000, "calls": 1},
                {"person": ANA, "limit_micros": 500_000},
            )
            together = await asyncio.gather(
                *(
                    store.increment(
                        API_BUDGET_KIND,
                        key,
                        {"micros": 5_000, "calls": 1},
                        {"person": ANA},
                    )
                    for _ in range(5)
                )
            )
            assert first == {
                "person": ANA,
                "limit_micros": 500_000,
                "micros": 15_000,
                "calls": 1,
            }
            assert max(r["micros"] for r in together) == 40_000
            assert await store.get(API_BUDGET_KIND, key) == {
                "person": ANA,
                "limit_micros": 500_000,
                "micros": 40_000,
                "calls": 6,
            }
            # A budget of its own: the platform's real counters are never touched.
            budget = guardrail(
                store, Clock(NOON), ANA, budget_id=f"test-{key}", daily=0.015
            )
            tool = Tool({"post_id": "1"})
            await call(budget, "post_to_x", {"text": "a"}, tool)
            assert (await call(budget, "post_to_x", {"text": "b"}, tool)).startswith(
                "This agent's X budget for today"
            )
        finally:
            await store.delete(API_BUDGET_KIND, key)
            for scope_key in budget_keys(f"test-{key}", ANA, NOON).values():
                await store.delete(API_BUDGET_KIND, scope_key)
            await store.close()
