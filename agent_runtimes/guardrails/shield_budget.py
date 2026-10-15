# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The model budget and the spend limit, soft then hard, on every model request (SHIELD §6.3, SH-32, SH-54).

The limits are the Shield's — ``limits.model_tokens`` (the budget, in tokens)
and ``limits.spend`` (credits, 100 a USD) of the policies in force: the
organization's from IAM, the application's, the session's — and the engine's
:func:`agent_shield.policy.decide_budget` decides each request against them,
strictest scope first. Before a model request, what the last one cost is
taken as what this one will: within every limit it is done; past a **soft**
threshold the person is asked once (through the runtime's tool approvals,
the same path a Rule asks on), and a refusal ends the run in the sentence;
past a **hard** threshold the run ends in a sentence that says what would let
it go on — a cheaper model, a wider budget, a person's word. After the
response, what it spent is counted: its tokens from the response's usage,
its credits from the model's price (``genai-prices``, as pydantic-ai prices
it); a model whose price is unknown cannot be held to a spend limit and the
next request says so rather than spending unmeasured.

The state is per session — ``record.current_session()`` names the one the run
belongs to on a runtime — so a session's budget is its own, and gone with it.

Every path counts. A response is counted when it is whole (after the
request); a run that ends before a response is whole — a client that leaves
the stream as soon as the answer's text has ended, before the provider's
usage chunk, a cancelled turn — has what pydantic-ai itself counted for the
run (``ctx.usage``) reconciled into the session at the run's end, so what a
session spent never stays below what its runs are known to have spent
(found on r1, 15 October 2026: an abandoned stream's response was never
counted).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence

from agent_shield.policy import Context, LimitState, Policy, decide_budget
from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability

from agent_runtimes.guardrails.common import GuardrailBlockedError

logger = logging.getLogger(__name__)

__all__ = ["BudgetState", "ShieldBudgetCapability", "ShieldBudgetExceeded"]

#: One credit is one hundredth of a USD (STUDIO's pricing, 100 credits a USD).
CREDITS_PER_USD = 100

#: What a model request is called in the approvals it raises.
MODEL_REQUEST = "model_request"

#: How many runs a session remembers the count of, for the reconciliation.
RUNS_REMEMBERED = 256


class ShieldBudgetExceeded(GuardrailBlockedError):
    """A model request the limits refuse, or a person refused: the run ends with the sentence."""


@dataclass
class BudgetState:
    """What one session's model requests spent, and what the last one cost."""

    limits: LimitState = field(default_factory=LimitState)
    last_tokens: int = 0
    last_credits: int = 0
    #: USD not yet counted as a whole credit.
    usd_pending: float = 0.0
    #: The model whose price is unknown, when one was met; "" otherwise.
    unpriced: str = ""
    #: What each run of the session counted so far, by run id: reconciled
    #: against the run's own usage when it ends.
    counted_in_run: Dict[str, int] = field(default_factory=dict)


Ask = Callable[[str], Awaitable[None]]


@dataclass
class ShieldBudgetCapability(AbstractCapability[Any]):
    """Hold every model request to the model limits of the policies in force."""

    policies: Callable[[], Sequence[Policy]]
    """The policies in force now: read at every request, so a change from IAM is in force at once."""

    session: Callable[[], str]
    """Which session the current run belongs to (``record.current_session``)."""

    ask: Optional[Ask] = None
    """How the person is asked past a soft threshold; the tool-approval path when unsaid."""

    agent_id: Optional[str] = None
    """The runtime's id of the agent, for the tool-approval path."""

    record: Optional[Callable[[Dict[str, Any]], None]] = None
    """Told of each decision past a threshold, for the application's record."""

    said: Optional[Callable[[Any, Context, int, int], str]] = None
    """The decision's sentence as the person reads it: given the decision, the
    context and the estimate (tokens, credits); the engine's own when unsaid.
    A deployment's spend limit is told apart from the session's here
    (``shield_policy.deployment_said``)."""

    states: Dict[str, BudgetState] = field(default_factory=dict, init=False, repr=False)

    # -- the state -----------------------------------------------------------------------

    def state_of(self, session: str) -> BudgetState:
        return self.states.setdefault(session, BudgetState())

    def forget(self, session: str) -> None:
        self.states.pop(session, None)

    # -- asking ------------------------------------------------------------------------

    async def _ask(self, sentence: str) -> None:
        if self.ask is not None:
            await self.ask(sentence)
            return
        from agent_runtimes.guardrails.tool_approvals import (
            ToolApprovalConfig,
            ToolApprovalManager,
        )

        config = ToolApprovalConfig.from_env()
        config.agent_id = self.agent_id or config.agent_id
        manager = ToolApprovalManager(config)
        await manager.request_and_wait(
            tool_name=MODEL_REQUEST, tool_args={"_rule": sentence, "sentence": sentence}
        )

    # -- the hooks ---------------------------------------------------------------------

    async def before_model_request(
        self, ctx: RunContext[Any], request_context: Any
    ) -> Any:
        session = self.session()
        state = self.state_of(session)
        policies = list(self.policies())
        if state.unpriced and any(p.limits.spend is not None for p in policies):
            raise ShieldBudgetExceeded(
                f"a model request: refused — the price of {state.unpriced} is unknown, so the spend "
                "limit cannot be held; a priced model, or a policy without a spend limit, would let it go on"
            )
        context = Context(workspace="", session_id=session or None, state=state.limits)
        decision = decide_budget(
            context,
            policies,
            tokens=state.last_tokens,
            cost=state.last_credits,
        )
        if decision.verdict == "allow":
            return request_context
        if self.said is not None:
            decision = decision.model_copy(
                update={
                    "sentence": self.said(
                        decision, context, state.last_tokens, state.last_credits
                    )
                }
            )
        if self.record is not None:
            self.record(
                {
                    "what": MODEL_REQUEST,
                    "decision": decision.verdict,
                    "limit": decision.rule,
                    "scope": decision.scope,
                    "sentence": decision.sentence,
                }
            )
        if decision.verdict == "deny":
            raise ShieldBudgetExceeded(decision.sentence)
        if decision.scope and decision.rule:
            state.limits.soft_asked.add((decision.scope, decision.rule))
        try:
            await self._ask(decision.sentence)
        except GuardrailBlockedError as refused:
            raise ShieldBudgetExceeded(
                f"{decision.sentence}; the person did not allow it ({refused})"
            ) from None
        return request_context

    async def after_model_request(
        self, ctx: RunContext[Any], *, request_context: Any, response: Any
    ) -> Any:
        session = self.session()
        state = self.state_of(session)
        usage = getattr(response, "usage", None)
        tokens = int(getattr(usage, "input_tokens", 0) or 0) + int(
            getattr(usage, "output_tokens", 0) or 0
        )
        credits = 0
        try:
            priced = response.cost()
            state.usd_pending += float(priced.total_price)
        except LookupError:
            # A model nobody priced: the next request says so when a spend limit holds.
            state.unpriced = str(getattr(response, "model_name", "") or "the model")
        except Exception as error:  # noqa: BLE001 - a price that cannot be read is an unpriced model
            logger.warning("The model's price could not be read: %s", error)
            state.unpriced = str(getattr(response, "model_name", "") or "the model")
        else:
            whole = int(state.usd_pending * CREDITS_PER_USD)
            if whole:
                credits = whole
                state.usd_pending -= whole / CREDITS_PER_USD
        self._count(state, session, self._run_of(ctx), tokens, credits)
        return response

    async def after_run(self, ctx: RunContext[Any], *, result: Any) -> Any:
        self._reconcile(ctx)
        return result

    async def on_run_error(self, ctx: RunContext[Any], *, error: BaseException) -> Any:
        self._reconcile(ctx)
        raise error

    # -- counting ----------------------------------------------------------------------

    @staticmethod
    def _run_of(ctx: RunContext[Any]) -> str:
        return str(getattr(ctx, "run_id", "") or "")

    def _count(
        self, state: BudgetState, session: str, run: str, tokens: int, credits: int
    ) -> None:
        state.limits.spent(tokens=tokens, cost=credits)
        state.last_tokens = tokens
        state.last_credits = credits
        if run:
            state.counted_in_run[run] = state.counted_in_run.get(run, 0) + tokens
        logger.info(
            "Shield budget: session %s spent %d tokens and %d credits on a model request; "
            "the session's total is %d tokens, %d credits",
            session or "-",
            tokens,
            credits,
            state.limits.model_tokens,
            state.limits.spend,
        )

    def _reconcile(self, ctx: RunContext[Any]) -> None:
        """Count what the run spent that no whole response was counted for.

        pydantic-ai counts a run's usage as each response is committed, the
        partial response of an abandoned stream among them; what it knows
        above what this capability counted for the run is counted now, in
        tokens (a partial response has no price to read).
        """
        session = self.session()
        state = self.state_of(session)
        run = self._run_of(ctx)
        usage = getattr(ctx, "usage", None)
        known = int(getattr(usage, "input_tokens", 0) or 0) + int(
            getattr(usage, "output_tokens", 0) or 0
        )
        counted = state.counted_in_run.get(run, 0) if run else 0
        missing = known - counted
        if missing <= 0:
            return
        # Once: a run whose end is told twice (pydantic-ai 2.40 tells a left
        # stream's end to both run-end hooks) is reconciled once.
        if run:
            state.counted_in_run[run] = known
            while len(state.counted_in_run) > RUNS_REMEMBERED:
                state.counted_in_run.pop(next(iter(state.counted_in_run)))
        logger.info(
            "Shield budget: session %s's run ended with %d tokens no whole response was "
            "counted for (a stream left early); counted now",
            session or "-",
            missing,
        )
        self._count(state, session, "", missing, 0)

    def spent(self, session: str) -> Dict[str, int]:
        """What a session spent so far, for the panel."""
        state = self.state_of(session)
        return {"model_tokens": state.limits.model_tokens, "spend": state.limits.spend}


def budget_states(capabilities: Sequence[Any]) -> List[ShieldBudgetCapability]:
    return [item for item in capabilities if isinstance(item, ShieldBudgetCapability)]
