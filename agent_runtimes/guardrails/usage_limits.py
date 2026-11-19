# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Usage and budget guardrail capabilities: tokens, model cost, and what a paid API costs (``api_budget``)."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Literal

from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.exceptions import SkipToolExecution
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import (
    DeferredToolRequests,
    DeferredToolResults,
    ToolDefinition,
    ToolDenied,
)

from .common import GuardrailBlockedError

logger = logging.getLogger(__name__)


@dataclass
class TokenLimitCapability(AbstractCapability[Any]):
    """Token/request/tool-call limits using capability hooks."""

    per_run: int = 100_000
    per_day: int = 500_000
    per_month: int = 5_000_000
    request_limit: int | None = None
    tool_calls_limit: int | None = None

    _run_tokens: int = field(default=0, init=False, repr=False)
    _run_requests: int = field(default=0, init=False, repr=False)
    _run_tool_calls: int = field(default=0, init=False, repr=False)
    _day_tokens: int = field(default=0, init=False, repr=False)
    _month_tokens: int = field(default=0, init=False, repr=False)
    _current_day: str = field(default="", init=False, repr=False)
    _current_month: str = field(default="", init=False, repr=False)

    def __post_init__(self) -> None:
        now = datetime.now(timezone.utc)
        self._current_day = now.date().isoformat()
        self._current_month = f"{now.year:04d}-{now.month:02d}"

    def _rollover_windows(self) -> None:
        now = datetime.now(timezone.utc)
        day = now.date().isoformat()
        month = f"{now.year:04d}-{now.month:02d}"
        if day != self._current_day:
            self._day_tokens = 0
            self._current_day = day
        if month != self._current_month:
            self._month_tokens = 0
            self._current_month = month

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_tokens = 0
        self._run_requests = 0
        self._run_tool_calls = 0
        self._rollover_windows()

    async def before_model_request(self, ctx: RunContext[Any], request: Any) -> Any:
        self._run_requests += 1
        if self.request_limit is not None and self._run_requests > self.request_limit:
            raise GuardrailBlockedError(
                f"Request limit exceeded: {self._run_requests}/{self.request_limit}"
            )
        return request

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        self._run_tool_calls += 1
        if (
            self.tool_calls_limit is not None
            and self._run_tool_calls > self.tool_calls_limit
        ):
            raise GuardrailBlockedError(
                f"Tool call limit exceeded: {self._run_tool_calls}/{self.tool_calls_limit}"
            )
        return args

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        self._rollover_windows()
        usage = ctx.usage
        run_tokens = int(getattr(usage, "total_tokens", 0) or 0)
        self._run_tokens += run_tokens
        self._day_tokens += run_tokens
        self._month_tokens += run_tokens

        if self._run_tokens > self.per_run:
            raise GuardrailBlockedError(
                f"Per-run token limit exceeded: {self._run_tokens}/{self.per_run}"
            )
        if self._day_tokens > self.per_day:
            raise GuardrailBlockedError(
                f"Daily token limit exceeded: {self._day_tokens}/{self.per_day}"
            )
        if self._month_tokens > self.per_month:
            raise GuardrailBlockedError(
                f"Monthly token limit exceeded: {self._month_tokens}/{self.per_month}"
            )
        return result


@dataclass
class CostBudgetCapability(AbstractCapability[Any]):
    """Cost budget guardrail with cumulative tracking."""

    per_run_usd: float | None = None
    cumulative_usd: float | None = None
    on_budget_exceeded: Literal["stop", "notify", "degrade"] = "stop"
    model_name: str | None = None

    _run_cost_usd: float = field(default=0.0, init=False, repr=False)
    _cumulative_cost_usd: float = field(default=0.0, init=False, repr=False)
    _price_input: float | None = field(default=None, init=False, repr=False)
    _price_output: float | None = field(default=None, init=False, repr=False)
    _resolved_prices: bool = field(default=False, init=False, repr=False)

    async def before_run(self, ctx: RunContext[Any]) -> None:
        self._run_cost_usd = 0.0
        if not self._resolved_prices:
            self._resolve_prices(getattr(ctx.model, "model_id", None))
        if (
            self.cumulative_usd is not None
            and self._cumulative_cost_usd > self.cumulative_usd
        ):
            self._handle_exceeded(
                f"Cumulative cost ${self._cumulative_cost_usd:.4f} exceeds ${self.cumulative_usd:.4f}"
            )

    def _resolve_prices(self, model_id: Any = None) -> None:
        model_name = str(model_id) if model_id else self.model_name
        if not model_name:
            self._resolved_prices = True
            return
        try:
            from genai_prices import get_model_prices

            short_name = (
                model_name.split(":", 1)[1] if ":" in model_name else model_name
            )
            prices = get_model_prices(short_name)
            if prices:
                self._price_input = prices.get("input", 0.0)
                self._price_output = prices.get("output", 0.0)
        except Exception:
            pass
        self._resolved_prices = True

    def _calculate_cost(self, input_tokens: int, output_tokens: int) -> float:
        if self._price_input is None or self._price_output is None:
            return 0.0
        return input_tokens * self._price_input + output_tokens * self._price_output

    def _handle_exceeded(self, message: str) -> None:
        if self.on_budget_exceeded == "notify":
            return
        if self.on_budget_exceeded == "degrade":
            return
        raise GuardrailBlockedError(message)

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        usage = ctx.usage
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        run_cost = self._calculate_cost(input_tokens, output_tokens)

        self._run_cost_usd += run_cost
        self._cumulative_cost_usd += run_cost

        if self.per_run_usd is not None and self._run_cost_usd > self.per_run_usd:
            self._handle_exceeded(
                f"Run cost ${self._run_cost_usd:.4f} exceeds ${self.per_run_usd:.4f}"
            )
        if (
            self.cumulative_usd is not None
            and self._cumulative_cost_usd > self.cumulative_usd
        ):
            self._handle_exceeded(
                f"Cumulative cost ${self._cumulative_cost_usd:.4f} exceeds ${self.cumulative_usd:.4f}"
            )
        return result


# ---------------------------------------------------------------------------
# What a paid API costs, held to budgets (the user, 15 November 2026: "we want
# to use a agent guardrail, not a iam cap").
# ---------------------------------------------------------------------------

#: Where the counters are kept: the runtime's protocol-state store, which on
#: Kubernetes is the agent-memories PostgreSQL every runtime shares, so a
#: person's counters outlive their runtime and the platform's are one.
API_BUDGET_KIND = "guardrail.api_budget"

#: Amounts are counted in millionths of the currency: whole numbers, summed by
#: the database, never drifting as floats do.
MICROS = 1_000_000


class ApiBudgetRefused(GuardrailBlockedError):
    """A call the budget refused, with the sentence the agent says."""


def _micros(value: Any) -> int:
    return int(round(float(value) * MICROS))


def _money(micros: int, currency: str) -> str:
    return (
        f"{currency} {micros / MICROS:.2f}"
        if micros % 10_000 == 0
        else f"{currency} {micros / MICROS:.3f}"
    )


def budget_periods(now: datetime) -> dict[str, Any]:
    """The day and the month ``now`` is in (UTC), and when each resets."""
    now = now.astimezone(timezone.utc)
    day = now.date()
    next_day = datetime(day.year, day.month, day.day, tzinfo=timezone.utc) + timedelta(
        days=1
    )
    next_month = (
        datetime(day.year + 1, 1, 1, tzinfo=timezone.utc)
        if day.month == 12
        else datetime(day.year, day.month + 1, 1, tzinfo=timezone.utc)
    )
    return {
        "day": day.isoformat(),
        "month": f"{day.year:04d}-{day.month:02d}",
        "day_resets_at": next_day,
        "month_resets_at": next_month,
    }


def budget_keys(budget_id: str, person: str, now: datetime) -> dict[str, str]:
    """The keys of the three counters a call adds to: the person's day and month, the platform's month."""
    periods = budget_periods(now)
    return {
        "person_day": f"{budget_id}:person:{person}:day:{periods['day']}",
        "person_month": f"{budget_id}:person:{person}:month:{periods['month']}",
        "platform_month": f"{budget_id}:platform:month:{periods['month']}",
    }


def _resets(moment: datetime) -> str:
    return moment.strftime("%H:%M UTC on %Y-%m-%d")


def _default_person() -> str:
    from ..memory.identity import resolve_memory_identity  # noqa: PLC0415

    return resolve_memory_identity().user_id


async def _mail_support(subject: str, text: str) -> Any:
    """A mail to Datalayer's support through IAM's mailer, with the runtime's social token."""
    from ..tools.social import send_mail  # noqa: PLC0415

    return await send_mail("support", subject, text)


def _default_store() -> Any:
    from ..protocol_state.store import protocol_state_store  # noqa: PLC0415

    return protocol_state_store()


@dataclass
class ApiBudgetCapability(AbstractCapability[Any]):
    """What each call to a paid API costs Datalayer, held to budgets.

    Declared in an agent spec's ``guardrails`` as ``api_budget`` — the X
    budget of the Marketer (``x-api-budget``) is the first — with the API's
    price table as data. Before a priced tool runs, what it may cost is
    estimated from the table (a read billed per result at the most results it
    may return, which the guardrail itself bounds by lowering the tool's
    result count), and the call is refused, in a sentence the agent says, when
    it would pass the person's budget for the day or the month, or the
    platform's for the month. After it ran, what it actually cost is counted:
    the resources its answer says the API returned. A call the person
    refused, or that failed, costs nothing.

    The counters are records of the runtime's protocol-state store, the
    agent-memories PostgreSQL every runtime on Kubernetes shares: a person's
    outlive their runtime, and the platform's is one for all the runtimes.
    The day and the month are UTC's; their records are new each period, so
    the budgets reset at 00:00 UTC. A store that cannot be read refuses the
    call: an unknown spend is never taken for none.

    The estimate runs before the person is asked (15 November 2026): a call
    that would pass a budget is refused with its sentence and no approval is
    asked for it (``handle_deferred_tool_calls`` for a tool deferred for
    approval, ``before_tool_execute`` for the others, both ordered before the
    approval guardrail, ``CHECKS_BEFORE_APPROVAL``); the call is checked again as it
    runs, since a budget may be spent while the person decides, and counted
    after it.
    """

    #: Its check runs before a tool approval is asked (`order_before_approvals`).
    CHECKS_BEFORE_APPROVAL = True

    budget_id: str
    provider: str
    prices: dict[str, float]
    tools: dict[str, dict[str, Any]]
    currency: str = "USD"
    per_person_daily: float | None = None
    per_person_monthly: float | None = None
    platform_monthly: float | None = None
    results: dict[str, Any] = field(default_factory=dict)
    counted_by: str = "resources"
    store: Any = None
    person: Callable[[], str] | None = None
    clock: Callable[[], datetime] = field(default=lambda: datetime.now(timezone.utc))
    #: The shares of the platform's month at which support is mailed, once each a month.
    alert_at: tuple[float, ...] = (0.8, 1.0)
    #: How support is mailed: ``(subject, text)``, answering a sentence when it was not sent.
    alert: Callable[[str, str], Any] | None = None

    def __post_init__(self) -> None:
        self._prices = {unit: _micros(price) for unit, price in self.prices.items()}
        for name, rule in self.tools.items():
            units = [rule.get("unit"), rule.get("with_url")] + [
                read.get("unit") for read in (rule.get("reads") or {}).values()
            ]
            unknown = [unit for unit in units if unit and unit not in self._prices]
            if unknown:
                raise ValueError(
                    f"{self.budget_id}: {name} is priced in {unknown}, which the price table does not hold"
                )

    # -- what a call may cost ------------------------------------------------

    def _most(self) -> int:
        return int(self.results.get("most") or 20)

    def estimate(
        self, tool: str, args: dict[str, Any]
    ) -> tuple[str, int, bool, dict[str, Any]]:
        """``(unit, resources, per_result, args)``: what a call is billed in, the most resources it may return, and its arguments with the result count bounded."""
        rule = self.tools[tool]
        reads = rule.get("reads")
        if reads:
            what = str(args.get(rule.get("by") or "what") or "")
            read = reads.get(what)
            if read is None:
                # The tool says what it reads; one it does not know reads nothing.
                return "", 0, False, args
            if not read.get("per_result"):
                return str(read["unit"]), 1, False, args
            argument = str(self.results.get("argument") or "limit")
            asked = args.get(argument)
            try:
                asked = (
                    int(asked)
                    if asked not in (None, "")
                    else int(self.results.get("default") or 10)
                )
            except (TypeError, ValueError):
                asked = int(self.results.get("default") or 10)
            bounded = max(1, min(asked, self._most()))
            fewest = int(read.get("fewest") or 1)
            return (
                str(read["unit"]),
                max(bounded, fewest),
                True,
                {**args, argument: bounded},
            )
        unit = str(rule["unit"])
        text = str(args.get(rule.get("text_argument") or "text") or "")
        if rule.get("with_url") and re.search(r"https?://", text):
            unit = str(rule["with_url"])
        return unit, 1, False, args

    def price_of(self, unit: str, resources: int) -> int:
        return self._prices.get(unit, 0) * max(0, resources)

    def counted(self, result: Any, estimated: int, per_result: bool) -> int:
        """The resources a call's answer says the API returned; nothing for a call that said why it did nothing."""
        if isinstance(result, str) or result is None:
            return 0
        if not per_result:
            return 1
        if isinstance(result, dict):
            value = result.get(self.counted_by)
            if isinstance(value, int) and not isinstance(value, bool):
                return max(0, value)
        # An answer that does not say: the most it may have been.
        return estimated

    # -- the counters ----------------------------------------------------------

    def _store(self) -> Any:
        return self.store if self.store is not None else _default_store()

    def _who(self) -> str:
        return (self.person or _default_person)() or "default"

    def _caps(self) -> dict[str, int | None]:
        def cap(value: float | None) -> int | None:
            return None if value is None else _micros(value)

        return {
            "person_day": cap(self.per_person_daily),
            "person_month": cap(self.per_person_monthly),
            "platform_month": cap(self.platform_monthly),
        }

    async def spent(self, person: str, now: datetime | None = None) -> dict[str, int]:
        """What the person spent today and this month, and the platform this month, in millionths."""
        keys = budget_keys(self.budget_id, person, now or self.clock())
        store = self._store()
        spent: dict[str, int] = {}
        for scope, key in keys.items():
            record = await store.get(API_BUDGET_KIND, key)
            spent[scope] = int((record or {}).get("micros") or 0)
        return spent

    def refusal(self, scope: str, cap: int, now: datetime) -> str:
        periods = budget_periods(now)
        if scope == "person_day":
            return (
                f"This agent's {self.provider} budget for today is used up "
                f"({_money(cap, self.currency)} a day); it resets at {_resets(periods['day_resets_at'])}."
            )
        if scope == "person_month":
            return (
                f"This agent's {self.provider} budget for this month is used up "
                f"({_money(cap, self.currency)} a month); it resets at {_resets(periods['month_resets_at'])}."
            )
        return (
            f"Datalayer's {self.provider} budget for this month is used up for everyone; "
            f"it resets at {_resets(periods['month_resets_at'])}."
        )

    async def check(self, person: str, cost: int, now: datetime) -> str | None:
        """The sentence refusing a call of this cost, or ``None`` when every budget holds it."""
        spent = await self.spent(person, now)
        for scope, cap in self._caps().items():
            if cap is not None and spent[scope] + cost > cap:
                if scope == "platform_month":
                    # The platform's total never passes its cap — the call that
                    # would is refused — so support is told at the first refusal.
                    key = budget_keys(self.budget_id, person, now)["platform_month"]
                    platform = await self._store().get(API_BUDGET_KIND, key) or {}
                    await self._alert_support(platform, now, at_cap=True)
                return self.refusal(scope, cap, now)
        return None

    async def count(
        self, person: str, unit: str, resources: int, now: datetime
    ) -> dict[str, Any]:
        """Add what a call cost to the three counters; answer the person's day and month as they are now."""
        cost = self.price_of(unit, resources)
        keys = budget_keys(self.budget_id, person, now)
        periods = budget_periods(now)
        caps = self._caps()
        store = self._store()
        records: dict[str, Any] = {}
        for scope, key in keys.items():
            records[scope] = await store.increment(
                API_BUDGET_KIND,
                key,
                {
                    "micros": cost,
                    "calls": 1,
                    "resources": resources,
                    f"{unit}_resources": resources,
                },
                {
                    "budget": self.budget_id,
                    "provider": self.provider,
                    "currency": self.currency,
                    "scope": scope,
                    "period": periods["month"]
                    if scope.endswith("month")
                    else periods["day"],
                    "person": "" if scope.startswith("platform") else person,
                    "limit_micros": caps[scope],
                    "updated_at": now.isoformat(),
                },
            )
        platform_cap = caps["platform_month"]
        if (
            platform_cap is not None
            and int(records["platform_month"].get("micros") or 0) >= platform_cap
        ):
            logger.warning(
                "%s: the platform's %s budget for %s is used up: every call is refused until %s",
                self.budget_id,
                self.provider,
                periods["month"],
                periods["month_resets_at"].isoformat(),
            )
        await self._alert_support(records["platform_month"], now)
        return records

    async def top_spenders(self, month: str, most: int = 5) -> list[dict[str, Any]]:
        """The people who spent most of a month, by uid: their spend and calls, never what they did."""
        rows = await self._store().list(
            API_BUDGET_KIND, prefix=f"{self.budget_id}:person:"
        )
        months = [
            row
            for row in rows
            if row.get("scope") == "person_month" and row.get("period") == month
        ]
        months.sort(key=lambda row: int(row.get("micros") or 0), reverse=True)
        return [
            {
                "person": str(row.get("person") or ""),
                "micros": int(row.get("micros") or 0),
                "calls": int(row.get("calls") or 0),
            }
            for row in months[:most]
        ]

    def alert_words(
        self,
        share: float,
        platform: dict[str, Any],
        top: list[dict[str, Any]],
        now: datetime,
    ) -> tuple[str, str]:
        """The mail support is sent at a share of the platform's month: its subject and its text."""
        periods = budget_periods(now)
        month = periods["month"]
        cap = int(self._caps()["platform_month"] or 0)
        total = int(platform.get("micros") or 0)
        spent = f"{_money(total, self.currency)} of {_money(cap, self.currency)}"
        if share >= 1:
            subject = f"{self.provider} budget for {month} used up ({spent})"
            lead = (
                f"Datalayer's {self.provider} budget for {month} is used up: {spent}, and the next "
                f"call would pass it. Every "
                f"{self.provider} call of every agent is refused until {_resets(periods['month_resets_at'])}."
            )
        else:
            subject = f"{self.provider} budget for {month} at {int(round(share * 100))}% ({spent})"
            lead = (
                f"Datalayer's {self.provider} budget for {month} has reached {int(round(share * 100))}%: "
                f"{spent}. At the cap every {self.provider} call is refused until "
                f"{_resets(periods['month_resets_at'])}."
            )
        lines = [
            lead,
            f"Month: {month}\nTotal: {_money(total, self.currency)}\nCap: {_money(cap, self.currency)}\n"
            f"Calls: {int(platform.get('calls') or 0)}\nResources: {int(platform.get('resources') or 0)}",
            "Top spenders this month, by person:\n"
            + (
                "\n".join(
                    f"{row['person']}: {_money(row['micros'], self.currency)} in {row['calls']} calls"
                    for row in top
                )
                or "none recorded"
            ),
            f"The budget is the agents' {self.budget_id} guardrail; the month's spend, per person, "
            "is on /admin/usage/platform (X spend).",
        ]
        return subject, "\n\n".join(lines)

    async def _alert_support(
        self, platform: dict[str, Any], now: datetime, at_cap: bool = False
    ) -> None:
        """Mail support once a month at each share of the platform's budget it has reached.

        The mark is a counter of the same store: the first runtime to add to
        it mails, every other finds it at more than one and does not. A mail
        that was not sent takes its mark back, so the next call tries again.
        """
        cap = self._caps()["platform_month"]
        if not cap:
            return
        total = int(platform.get("micros") or 0)
        month = budget_periods(now)["month"]
        store = self._store()
        for share in sorted(self.alert_at):
            if total < share * cap and not (at_cap and share >= 1):
                continue
            key = f"{self.budget_id}:platform:alert:{month}:{int(round(share * 100))}"
            try:
                mark = await store.increment(
                    API_BUDGET_KIND,
                    key,
                    {"sent": 1},
                    {
                        "budget": self.budget_id,
                        "scope": "platform_alert",
                        "period": month,
                    },
                )
            except Exception as error:  # noqa: BLE001 - the call is counted; the alert waits for the next one
                logger.warning(
                    "%s: an alert could not be marked (%s)",
                    self.budget_id,
                    type(error).__name__,
                )
                return
            if int(mark.get("sent") or 0) != 1:
                continue
            try:
                subject, text = self.alert_words(
                    share, platform, await self.top_spenders(month), now
                )
                answer = await (self.alert or _mail_support)(subject, text)
                failed = isinstance(answer, str)
            except Exception as error:  # noqa: BLE001 - taken back below, tried again
                failed = True
                answer = type(error).__name__
            if failed:
                logger.warning(
                    "%s: support was not mailed at %s: %s", self.budget_id, key, answer
                )
                await store.increment(API_BUDGET_KIND, key, {"sent": -1})
            else:
                logger.info("%s: support mailed at %s", self.budget_id, key)

    # -- the hook ----------------------------------------------------------------

    async def before_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Refuse a call past a budget before anyone is asked to approve it.

        Parameters
        ----------
        ctx : RunContext
            The run.
        call : ToolCallPart
            The call.
        tool_def : ToolDefinition
            Its tool.
        args : dict
            Its arguments.

        Returns
        -------
        dict
            The arguments, a read's result count bounded.

        Raises
        ------
        SkipToolExecution
            With the guardrail's sentence, for a call that would pass a
            budget or whose budget cannot be read: the tool does not run and
            no approval is asked.
        """
        name = tool_def.name
        if name not in self.tools:
            return args
        unit, most, _, bounded = self.estimate(name, dict(args))
        if not unit:
            return bounded
        try:
            refused = await self.check(
                self._who(), self.price_of(unit, most), self.clock()
            )
        except Exception as error:  # noqa: BLE001 - an unknown spend is never taken for none
            logger.warning(
                "%s: the budget could not be read (%s)",
                self.budget_id,
                type(error).__name__,
            )
            raise SkipToolExecution(
                f"This agent's {self.provider} budget could not be read just now, so nothing was "
                f"asked of {self.provider}. Try again in a moment."
            ) from None
        if refused:
            raise SkipToolExecution(refused)
        return bounded

    async def handle_deferred_tool_calls(
        self,
        ctx: RunContext[Any],
        *,
        requests: DeferredToolRequests,
    ) -> DeferredToolResults | None:
        """
        Deny a call waiting for approval that would pass a budget, before the person is asked.

        A tool that asks first (a post, a reply) is deferred for approval
        before any execute hook runs; the approval guardrail asks the person
        in this same hook, after this one (`order_before_approvals`). A call
        past a budget is answered here with the guardrail's sentence, so it is
        never put to the person; the others go on to be asked.

        Parameters
        ----------
        ctx : RunContext
            The run.
        requests : DeferredToolRequests
            The calls waiting.

        Returns
        -------
        DeferredToolResults or None
            The calls denied, with the guardrail's sentence; ``None`` when none is.
        """
        denied: dict[str, Any] = {}
        for call in requests.approvals:
            if call.tool_name not in self.tools:
                continue
            try:
                args = call.args_as_dict()
            except Exception as error:  # noqa: BLE001 - unreadable arguments are the approval's to show
                logger.debug(
                    "Usage limit: %s's arguments could not be read (%s); left to the approval.",
                    call.tool_name,
                    error,
                )
                continue
            unit, most, _, _ = self.estimate(call.tool_name, dict(args))
            if not unit:
                continue
            try:
                refused = await self.check(
                    self._who(), self.price_of(unit, most), self.clock()
                )
            except Exception as error:  # noqa: BLE001 - an unknown spend is never taken for none
                logger.warning(
                    "%s: the budget could not be read (%s)",
                    self.budget_id,
                    type(error).__name__,
                )
                refused = (
                    f"This agent's {self.provider} budget could not be read just now, so nothing was "
                    f"asked of {self.provider}. Try again in a moment."
                )
            if refused:
                denied[call.tool_call_id] = ToolDenied(refused)
        return DeferredToolResults(approvals=denied) if denied else None

    async def wrap_tool_execute(
        self,
        ctx: RunContext[Any],
        *,
        call: ToolCallPart,
        tool_def: ToolDefinition,
        args: dict[str, Any],
        handler: Any,
    ) -> Any:
        name = tool_def.name
        if name not in self.tools:
            return await handler(args)
        unit, most, per_result, bounded = self.estimate(name, dict(args))
        if not unit:
            return await handler(bounded)
        now = self.clock()
        person = self._who()
        try:
            refused = await self.check(person, self.price_of(unit, most), now)
        except Exception as error:  # noqa: BLE001 - an unknown spend is never taken for none
            logger.warning(
                "%s: the budget could not be read (%s)",
                self.budget_id,
                type(error).__name__,
            )
            return (
                f"This agent's {self.provider} budget could not be read just now, so nothing was "
                f"asked of {self.provider}. Try again in a moment."
            )
        if refused:
            return refused
        result = await handler(bounded)
        resources = self.counted(result, most, per_result)
        if resources:
            try:
                records = await self.count(person, unit, resources, now)
            except Exception as error:  # noqa: BLE001 - the call happened; say so, keep its answer
                logger.warning(
                    "%s: a call was not counted (%s)",
                    self.budget_id,
                    type(error).__name__,
                )
                return result
            if isinstance(result, dict):
                caps = self._caps()
                day = int(records["person_day"].get("micros") or 0)
                left = (
                    None
                    if caps["person_day"] is None
                    else max(0, caps["person_day"] - day)
                )
                result = {
                    **result,
                    "budget": {
                        "cost": _money(self.price_of(unit, resources), self.currency),
                        "left_today": None
                        if left is None
                        else _money(left, self.currency),
                    },
                }
        return result
