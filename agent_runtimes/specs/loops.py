# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Loop Catalog.

Predefined agent execution-loop specifications that can be used by agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from enum import Enum
from typing import Optional

from agent_runtimes.types import LoopHuman, LoopSpec, LoopTermination

# ============================================================================
# Loops Enum
# ============================================================================


class Loops(str, Enum):
    """Enumeration of available agent execution loops."""

    DATA_ANALYSIS = "data-analysis"
    HUMAN_IN_THE_LOOP = "human-in-the-loop"
    OODA = "ooda"
    PLAN_EXECUTE_CRITIC = "plan-execute-critic"


# ============================================================================
# Loop Definitions
# ============================================================================

DATA_ANALYSIS_LOOP_0_0_1 = LoopSpec(
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
    termination=LoopTermination(
        max_iterations=15,
        success_criteria=[
            "The objective is met and a final summary has been produced",
            "Key metrics and visualizations are available in the notebook",
        ],
        failure_criteria=["The dataset cannot be loaded after repeated attempts"],
        on_blocked="ask-human",
    ),
    human=LoopHuman(
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

HUMAN_IN_THE_LOOP_LOOP_0_0_1 = LoopSpec(
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
    termination=LoopTermination(
        max_iterations=12,
        success_criteria=["The task is complete and all approvals were obtained"],
        failure_criteria=[
            "The human rejects a required action and no alternative exists"
        ],
        on_blocked="ask-human",
    ),
    human=LoopHuman(
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

OODA_LOOP_0_0_1 = LoopSpec(
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
    termination=LoopTermination(
        max_iterations=20,
        success_criteria=["The goal condition is satisfied"],
        failure_criteria=["A hard stop condition or budget limit is reached"],
        on_blocked="retry",
    ),
    human=LoopHuman(
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

PLAN_EXECUTE_CRITIC_LOOP_0_0_1 = LoopSpec(
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
    termination=LoopTermination(
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
    human=LoopHuman(
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
# Loop Catalog
# ============================================================================

LOOP_CATALOGUE: dict[str, LoopSpec] = {
    "data-analysis": DATA_ANALYSIS_LOOP_0_0_1,
    "human-in-the-loop": HUMAN_IN_THE_LOOP_LOOP_0_0_1,
    "ooda": OODA_LOOP_0_0_1,
    "plan-execute-critic": PLAN_EXECUTE_CRITIC_LOOP_0_0_1,
}


DEFAULT_LOOP: str = "data-analysis"


def get_loop(loop_id: str) -> Optional[LoopSpec]:
    """
    Get a loop specification by ID (accepts both bare and versioned refs).

    Args:
        loop_id: The unique identifier of the loop.

    Returns:
        The LoopSpec, or None if not found.
    """
    loop = LOOP_CATALOGUE.get(loop_id)
    if loop is not None:
        return loop
    base, _, ver = loop_id.rpartition(":")
    if base and "." in ver:
        return LOOP_CATALOGUE.get(base)
    return None


def get_default_loop() -> Optional[LoopSpec]:
    """
    Get the default loop.

    Returns:
        The default LoopSpec, or None if no default is set.
    """
    return LOOP_CATALOGUE.get(DEFAULT_LOOP)


def list_loops() -> list[LoopSpec]:
    """
    List all available loops.

    Returns:
        List of all LoopSpec specifications.
    """
    return list(LOOP_CATALOGUE.values())
