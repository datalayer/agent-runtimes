# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Strategy Catalog.

Predefined agent reasoning strategies (control loops) that agents can use.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from enum import Enum
from typing import Optional

from agent_runtimes.types import StrategyHuman, StrategySpec, StrategyTermination

# ============================================================================
# Strategies Enum
# ============================================================================


class Strategies(str, Enum):
    """Enumeration of available agent reasoning strategies."""

    DATA_ANALYSIS = "data-analysis"
    HUMAN_IN_THE_LOOP = "human-in-the-loop"
    OODA = "ooda"
    PLAN_EXECUTE_CRITIC = "plan-execute-critic"


# ============================================================================
# Strategy Definitions
# ============================================================================

DATA_ANALYSIS_STRATEGY_0_0_1 = StrategySpec(
    id="data-analysis",
    version="0.0.1",
    name="Data Analysis Loop",
    description="A generic iterative loop for data analysis. Each iteration the agent observes the current runtime state, decides the next step, executes code in the notebook, and evaluates the result against the objective. Intermediate state (dataframes, charts, tables) is stored outside the model so each LLM call stays small, focused, and inexpensive.",
    objective="Analyze the provided dataset, identify the most important trends and metrics, produce clear visualizations, and summarize actionable findings.",
    strategy="observe-think-act-evaluate",
    phases=["observe", "think", "act", "evaluate"],
    constraints=[
        "Never modify source data files",
        "Prefer reproducible, incremental code cells",
        "Read only the summary of intermediate results, not full datasets",
    ],
    termination=StrategyTermination(
        max_iterations=15,
        success_criteria=[
            "The objective is met and a final summary has been produced",
            "Key metrics and visualizations are available in the notebook",
        ],
        failure_criteria=["The dataset cannot be loaded after repeated attempts"],
        on_blocked="ask-human",
    ),
    human=StrategyHuman(
        mode="initiate",
        approval_required=False,
        approval_for=[],
        description="The human provides the goal and constraints, then observes. The agent runs the loop autonomously and reports the final result.",
    ),
    state_backends=["notebook", "runtime", "filesystem"],
    tags=["data-analysis", "analytics", "generic", "iterative"],
    icon="graph",
    emoji="📊",
)

HUMAN_IN_THE_LOOP_STRATEGY_0_0_1 = StrategySpec(
    id="human-in-the-loop",
    version="0.0.1",
    name="Human-in-the-Loop",
    description="A control loop that runs autonomously but stops for explicit human approval before any sensitive or irreversible action. The human sits outside the loop, defining the goal and constraints, and steps in only when the agent needs a decision it is not permitted to make on its own.",
    objective="Complete the task autonomously while requesting human approval before any sensitive or irreversible action.",
    strategy="observe-think-act-evaluate",
    phases=["observe", "think", "act", "evaluate"],
    constraints=[
        "Never perform an approval-gated action without explicit human sign-off",
        "Surface a clear summary of the pending action when requesting approval",
    ],
    termination=StrategyTermination(
        max_iterations=12,
        success_criteria=["The task is complete and all approvals were obtained"],
        failure_criteria=[
            "The human rejects a required action and no alternative exists"
        ],
        on_blocked="ask-human",
    ),
    human=StrategyHuman(
        mode="approve",
        approval_required=True,
        approval_for=["delete-data", "send-email", "spend-money", "deploy-production"],
        description="The loop pauses and waits for human approval before executing any action listed in approval_for, then resumes with the human's decision.",
    ),
    state_backends=["notebook", "runtime", "filesystem"],
    tags=["human-in-the-loop", "approval", "safety", "generic"],
    icon="person",
    emoji="🙋",
)

OODA_STRATEGY_0_0_1 = StrategySpec(
    id="ooda",
    version="0.0.1",
    name="OODA Loop",
    description="A generic Observe → Orient → Decide → Act control loop. The agent observes the current state, orients by interpreting it in the context of the goal, decides on the next action, and acts. The loop is well suited to decision-oriented and monitoring tasks over a changing environment.",
    objective="Continuously assess the environment and take the best next action toward the goal until it is reached or a stop condition is met.",
    strategy="ooda",
    phases=["observe", "orient", "decide", "act"],
    constraints=[
        "Re-observe fresh state at the start of every iteration",
        "Keep each decision small and reversible when possible",
    ],
    termination=StrategyTermination(
        max_iterations=20,
        success_criteria=["The goal condition is satisfied"],
        failure_criteria=["A hard stop condition or budget limit is reached"],
        on_blocked="retry",
    ),
    human=StrategyHuman(
        mode="none",
        approval_required=False,
        approval_for=[],
        description="Fully autonomous loop with no human interaction during execution.",
    ),
    state_backends=["runtime", "filesystem", "sql"],
    tags=["ooda", "decision-loop", "generic", "monitoring"],
    icon="sync",
    emoji="🔄",
)

PLAN_EXECUTE_CRITIC_STRATEGY_0_0_1 = StrategySpec(
    id="plan-execute-critic",
    version="0.0.1",
    name="Plan / Execute / Critic Loop",
    description="A control loop with three roles. The planner decomposes the goal into the next concrete step, the executor performs it in the runtime, and the critic evaluates the outcome for gaps or errors. The loop repeats until the critic is satisfied or the iteration budget is exhausted, driving higher-quality, self-corrected results.",
    objective="Produce a high-quality analysis or report that has been reviewed and corrected for logical errors before it is finalized.",
    strategy="plan-execute-critic",
    phases=["plan", "execute", "critic"],
    constraints=[
        "The critic must not rewrite results, only identify issues to fix",
        "Each step must build on validated intermediate results",
        "Stop refining once the critic reports no material issues",
    ],
    termination=StrategyTermination(
        max_iterations=8,
        success_criteria=[
            "The critic reports no material issues with the latest result",
            "A final, corrected output has been published",
        ],
        failure_criteria=[
            "The critic reports the goal is not achievable with available data"
        ],
        on_blocked="ask-human",
    ),
    human=StrategyHuman(
        mode="feedback",
        approval_required=False,
        approval_for=[],
        description="The human can inject feedback between iterations to steer the planner and critic without restarting the loop from scratch.",
    ),
    state_backends=["notebook", "runtime", "filesystem"],
    tags=["analysis", "data-quality", "self-correction", "multi-role"],
    icon="checklist",
    emoji="✅",
)


# ============================================================================
# Strategy Catalog
# ============================================================================

STRATEGY_CATALOGUE: dict[str, StrategySpec] = {
    "data-analysis": DATA_ANALYSIS_STRATEGY_0_0_1,
    "human-in-the-loop": HUMAN_IN_THE_LOOP_STRATEGY_0_0_1,
    "ooda": OODA_STRATEGY_0_0_1,
    "plan-execute-critic": PLAN_EXECUTE_CRITIC_STRATEGY_0_0_1,
}


DEFAULT_STRATEGY: str = "data-analysis"


def get_strategy(strategy_id: str) -> Optional[StrategySpec]:
    """
    Get a strategy specification by ID (accepts both bare and versioned refs).

    Args:
        strategy_id: The unique identifier of the strategy.

    Returns:
        The StrategySpec, or None if not found.
    """
    strategy = STRATEGY_CATALOGUE.get(strategy_id)
    if strategy is not None:
        return strategy
    base, _, ver = strategy_id.rpartition(":")
    if base and "." in ver:
        return STRATEGY_CATALOGUE.get(base)
    return None


def get_default_strategy() -> Optional[StrategySpec]:
    """
    Get the default strategy.

    Returns:
        The default StrategySpec, or None if no default is set.
    """
    return STRATEGY_CATALOGUE.get(DEFAULT_STRATEGY)


def list_strategies() -> list[StrategySpec]:
    """
    List all available strategies.

    Returns:
        List of all StrategySpec specifications.
    """
    return list(STRATEGY_CATALOGUE.values())
