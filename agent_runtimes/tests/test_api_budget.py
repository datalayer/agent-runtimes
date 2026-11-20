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


_MARKETER = get_agent_spec("worker-marketer")
assert _MARKETER is not None
MARKETER = _MARKETER
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
        None,
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


class TestBeforeTheApproval:
    """The estimate runs before the person is asked (15 November 2026): a call
    past a budget is refused with the guardrail's sentence, and the approval
    guardrail is never reached for it.
    """

    @pytest.mark.asyncio
    async def test_a_call_past_the_budget_is_refused_before_any_approval(
        self, store: Any
    ) -> None:
        from pydantic_ai.exceptions import SkipToolExecution

        budget = guardrail(store, Clock(NOON), daily=0.01)
        with pytest.raises(SkipToolExecution) as skipped:
            await budget.before_tool_execute(
                None,
                call=ToolCallPart(tool_name="post_to_x", args={"text": "hi"}),
                tool_def=ToolDefinition(name="post_to_x"),
                args={"text": "hi"},
            )
        assert skipped.value.result.startswith(
            "This agent's X budget for today is used up"
        )

    @pytest.mark.asyncio
    async def test_a_call_within_the_budget_goes_on_to_the_approval_bounded(
        self, store: Any
    ) -> None:
        budget = guardrail(store, Clock(NOON))
        args = await budget.before_tool_execute(
            None,
            call=ToolCallPart(
                tool_name="read_x", args={"what": "search", "query": "q", "limit": 100}
            ),
            tool_def=ToolDefinition(name="read_x"),
            args={"what": "search", "query": "q", "limit": 100},
        )
        assert args["limit"] <= X["results"]["most"]
        # Another tool is not the guardrail's.
        untouched = {"text": "x"}
        assert (
            await budget.before_tool_execute(
                None,
                call=ToolCallPart(tool_name="post_to_bluesky", args=untouched),
                tool_def=ToolDefinition(name="post_to_bluesky"),
                args=untouched,
            )
            is untouched
        )

    def test_the_budget_runs_before_the_approval_guardrail(self, store: Any) -> None:
        from agent_runtimes.capabilities.factory import order_before_approvals
        from agent_runtimes.guardrails.tool_approvals import (
            ToolApprovalConfig,
            ToolsGuardrailCapability,
        )

        approval = ToolsGuardrailCapability(config=ToolApprovalConfig())
        budget = guardrail(store, Clock(NOON))
        other = object()
        ordered = order_before_approvals([other, approval, budget])
        assert [id(each) for each in ordered] == [id(other), id(budget), id(approval)]
        # Already before: kept as it is.
        kept = [budget, approval]
        assert order_before_approvals(kept) is kept
        # Built from the Marketer's spec with an approval guardrail: the budget comes first.
        spec = MARKETER.model_copy(
            update={
                "guardrails": [{"tool_approval": True}, *(MARKETER.guardrails or [])]
            }
        )
        built = build_capabilities_from_agent_spec(spec)
        kinds = [type(each).__name__ for each in built]
        assert kinds.index("ApiBudgetCapability") < kinds.index(
            "ToolsGuardrailCapability"
        )


class TestADeferredCall:
    """A post asks first: pydantic-ai defers it for approval before any execute
    hook, and the approval guardrail asks the person in `handle_deferred_tool_calls`.
    The budget answers there first.
    """

    @pytest.mark.asyncio
    async def test_a_post_past_the_budget_is_denied_before_the_person_is_asked(
        self, store: Any
    ) -> None:
        from pydantic_ai.tools import DeferredToolRequests, ToolDenied

        budget = guardrail(store, Clock(NOON), daily=0.01)
        post = ToolCallPart(
            tool_name="post_to_x", args={"text": "hi"}, tool_call_id="p1"
        )
        other = ToolCallPart(
            tool_name="post_to_bluesky", args={"text": "hi"}, tool_call_id="b1"
        )
        answered = await budget.handle_deferred_tool_calls(
            None,
            requests=DeferredToolRequests(approvals=[post, other]),
        )
        assert answered is not None
        assert list(answered.approvals) == ["p1"]
        denied = answered.approvals["p1"]
        assert isinstance(denied, ToolDenied)
        assert denied.message.startswith("This agent's X budget for today is used up")
        # Within the budget, nothing is answered: the person is asked as before.
        roomy = guardrail(store, Clock(NOON))
        assert (
            await roomy.handle_deferred_tool_calls(
                None,
                requests=DeferredToolRequests(approvals=[post]),
            )
            is None
        )

    @pytest.mark.asyncio
    async def test_in_a_run_the_approver_never_sees_a_post_past_the_budget(
        self, store: Any
    ) -> None:
        """Through pydantic-ai: the budget, then an approver, on a tool that asks first."""
        from dataclasses import dataclass, field

        from pydantic_ai import Agent
        from pydantic_ai.capabilities import AbstractCapability
        from pydantic_ai.models.test import TestModel
        from pydantic_ai.tools import DeferredToolResults

        @dataclass
        class Approver(AbstractCapability[Any]):
            asked: list[str] = field(default_factory=list)

            async def handle_deferred_tool_calls(self, ctx, *, requests):
                self.asked += [call.tool_name for call in requests.approvals]
                return DeferredToolResults(
                    approvals={call.tool_call_id: True for call in requests.approvals}
                )

        approver = Approver()
        posted: list[str] = []
        agent = Agent(
            TestModel(call_tools=["post_to_x"]),
            capabilities=[guardrail(store, Clock(NOON), daily=0.01), approver],
        )

        @agent.tool_plain(requires_approval=True)
        def post_to_x(text: str) -> dict[str, Any]:
            posted.append(text)
            return {"post_id": "1"}

        result = await agent.run("post it")
        assert approver.asked == []
        assert posted == []
        assert "X budget for today is used up" in str(result.all_messages())


class Mailbox:
    """Support's mailbox, as the guardrail mails it: each (subject, text), or a refusal to answer."""

    def __init__(self, refuse: str | None = None) -> None:
        self.sent: list[tuple[str, str]] = []
        self.refuse = refuse

    async def __call__(self, subject: str, text: str) -> Any:
        if self.refuse:
            return self.refuse
        self.sent.append((subject, text))
        return {"sent": True, "to": "support"}


def alerting(
    store: Any, clock: Clock, mailbox: Mailbox, person: str = ANA, platform: float = 1.0
) -> ApiBudgetCapability:
    """The Marketer's guardrail with a USD 1 platform month, generous people, mailing support to `mailbox`."""
    budget = guardrail(
        store, clock, person, daily=100.0, monthly=100.0, platform=platform
    )
    budget.alert = mailbox
    return budget


class TestSupportIsMailed:
    """15 November 2026: support is told once a month at 80% of the platform's X budget, and once at the cap."""

    @pytest.mark.asyncio
    async def test_nothing_below_80_percent(self, store: Any) -> None:
        mailbox = Mailbox()
        budget = alerting(store, Clock(NOON), mailbox)
        for _ in range(3):  # USD 0.60 of USD 1.00
            await call(
                budget, "post_to_x", {"text": "https://a.b"}, Tool({"post_id": "1"})
            )
        assert mailbox.sent == []

    @pytest.mark.asyncio
    async def test_once_at_80_percent_once_at_the_cap_never_again_that_month(
        self, store: Any
    ) -> None:
        mailbox = Mailbox()
        clock = Clock(NOON)
        ana = alerting(store, clock, mailbox, ANA)
        ben = alerting(store, clock, mailbox, BEN)
        tool = Tool({"post_id": "1"})
        for _ in range(4):  # USD 0.80: 80%
            await call(ana, "post_to_x", {"text": "https://a.b"}, tool)
        assert [subject for subject, _ in mailbox.sent] == [
            "X budget for 2026-11 at 80% (USD 0.80 of USD 1.00)"
        ]
        await call(
            ben, "post_to_x", {"text": "Hi"}, tool
        )  # 81.5%: no second mail at 80%
        assert len(mailbox.sent) == 1
        # USD 0.815 + 0.20 would pass the cap: refused, and support told once, at that first refusal.
        assert (await call(ben, "post_to_x", {"text": "https://a.b"}, tool)).startswith(
            "Datalayer's X budget for this month is used up"
        )
        assert [subject for subject, _ in mailbox.sent][
            1
        ] == "X budget for 2026-11 used up (USD 0.815 of USD 1.00)"
        assert "the next call would pass it" in mailbox.sent[1][1]
        # Refused for everyone from now on, and nobody is mailed again this month, by any runtime.
        assert (await call(ana, "post_to_x", {"text": "https://c.d"}, tool)).startswith(
            "Datalayer's X budget for this month is used up"
        )
        assert len(mailbox.sent) == 2
        again = alerting(store, clock, mailbox, ANA)
        await again._alert_support(
            await store.get(API_BUDGET_KIND, "x-api-budget:platform:month:2026-11"),
            clock.moment,
        )
        assert len(mailbox.sent) == 2

    @pytest.mark.asyncio
    async def test_the_mail_names_the_month_the_total_the_cap_and_the_top_spenders_never_content(
        self, store: Any
    ) -> None:
        mailbox = Mailbox()
        clock = Clock(NOON)
        tool = Tool({"post_id": "1"})
        await call(
            alerting(store, clock, mailbox, BEN),
            "post_to_x",
            {"text": "a private draft"},
            tool,
        )
        for _ in range(4):
            await call(
                alerting(store, clock, mailbox, ANA),
                "post_to_x",
                {"text": "my secret launch https://a.b"},
                tool,
            )
        ((subject, text),) = mailbox.sent
        assert "Month: 2026-11\nTotal: USD 0.815\nCap: USD 1.00" in text
        assert f"{ANA}: USD 0.80 in 4 calls\n{BEN}: USD 0.015 in 1 calls" in text
        assert "refused until 00:00 UTC on 2026-12-01" in text
        assert "secret" not in text and "draft" not in text and "secret" not in subject

    @pytest.mark.asyncio
    async def test_a_fresh_month_starts_again(self, store: Any) -> None:
        mailbox = Mailbox()
        clock = Clock(datetime(2026, 11, 30, 23, 0, tzinfo=timezone.utc))
        budget = alerting(store, clock, mailbox)
        tool = Tool({"post_id": "1"})
        for _ in range(4):
            await call(budget, "post_to_x", {"text": "https://a.b"}, tool)
        clock.moment = datetime(2026, 12, 1, 0, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await call(budget, "post_to_x", {"text": "https://a.b"}, tool)
        assert len(mailbox.sent) == 1
        await call(budget, "post_to_x", {"text": "https://a.b"}, tool)
        assert [subject for subject, _ in mailbox.sent] == [
            "X budget for 2026-11 at 80% (USD 0.80 of USD 1.00)",
            "X budget for 2026-12 at 80% (USD 0.80 of USD 1.00)",
        ]

    @pytest.mark.asyncio
    async def test_a_mail_that_was_not_sent_is_tried_again(self, store: Any) -> None:
        refusing = Mailbox(
            refuse="The mail was not sent (502): Datalayer's mailer could not send it just now."
        )
        clock = Clock(NOON)
        budget = alerting(store, clock, refusing)
        tool = Tool({"post_id": "1"})
        for _ in range(4):
            await call(budget, "post_to_x", {"text": "https://a.b"}, tool)
        mailbox = Mailbox()
        budget.alert = mailbox
        await call(budget, "post_to_x", {"text": "Hi"}, tool)
        assert len(mailbox.sent) == 1 and "at 80%" in mailbox.sent[0][0]

    @pytest.mark.asyncio
    async def test_two_runtimes_crossing_at_once_mail_once(self, store: Any) -> None:
        mailbox = Mailbox()
        clock = Clock(NOON)
        budgets = [alerting(store, clock, mailbox, person) for person in (ANA, BEN) * 3]
        # USD 0.60 first, then six USD 0.20 posts at once: 80% is crossed, then the cap refuses.
        for _ in range(3):
            await call(
                budgets[0], "post_to_x", {"text": "https://a.b"}, Tool({"post_id": "1"})
            )
        await asyncio.gather(
            *(
                call(b, "post_to_x", {"text": "https://a.b"}, Tool({"post_id": "1"}))
                for b in budgets
            )
        )
        await asyncio.gather(
            *(
                call(b, "post_to_x", {"text": "https://a.b"}, Tool({"post_id": "1"}))
                for b in budgets
            )
        )
        subjects = [subject for subject, _ in mailbox.sent]
        assert (
            len(subjects) == 2 and "at 80%" in subjects[0] and "used up" in subjects[1]
        )

    def test_the_spec_says_when(self) -> None:
        built = [
            c
            for c in build_capabilities_from_agent_spec(
                MARKETER, agent_id="worker-marketer"
            )
            if isinstance(c, ApiBudgetCapability)
        ]
        assert built[0].alert_at == (0.8, 1.0)
