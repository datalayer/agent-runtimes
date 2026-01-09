# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Human in the Loop example.

Demonstrates an agent that generates task plans requiring human approval.
The agent creates a list of steps and waits for the user to approve,
modify, or reject them before proceeding.

Features:
- Task planning with step generation
- State snapshot events for plan creation
- Human review/approval workflow

This pattern is useful for:
- Approval workflows
- Code review automation
- Deployment pipelines
- Any multi-step task requiring human oversight
"""

from typing import Literal

from pydantic import BaseModel, Field

from ag_ui.core import EventType, StateSnapshotEvent
from pydantic_ai import Agent


# Define types for task steps (ag-ui standard)
StepStatus = Literal["enabled", "disabled", "executing"]


class TaskStep(BaseModel):
    """A step in a task plan."""

    description: str = Field(description="The description of the step")
    status: StepStatus = Field(
        default="enabled",
        description="The status of the step",
    )


class TaskPlan(BaseModel):
    """A task plan with multiple steps for human review."""

    steps: list[TaskStep] = Field(
        default_factory=list,
        description="The steps in the task plan",
    )


# Create the agent with instructions for human-in-the-loop behavior
agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt="""
        You are a helpful task planning assistant.
        
        When asked to plan or do a task:
        1. Use the `generate_task_steps` tool to create a list of steps
        2. The steps will be displayed to the user for review
        3. Wait for user feedback
        4. If accepted, confirm the plan and the number of enabled steps
        5. If not accepted, ask for clarification
        
        IMPORTANT:
        - Only call `generate_task_steps` ONCE per request
        - Do NOT repeat the plan in your response after showing it
        - Do NOT call the tool again after receiving feedback
        - Keep your responses concise
        - Each step should be a brief imperative command (e.g., "Set up environment", "Install dependencies")
    """,
)


@agent.tool_plain
async def generate_task_steps(steps: list[str]) -> StateSnapshotEvent:
    """Generate a list of task steps for the user to review and approve.

    This creates a task plan that will be displayed to the user.
    The user can enable/disable steps before confirming execution.

    Args:
        steps: List of step descriptions (brief imperative commands).

    Returns:
        StateSnapshotEvent containing the task plan for user review.
    """
    plan = TaskPlan(
        steps=[TaskStep(description=step, status="enabled") for step in steps],
    )
    return StateSnapshotEvent(
        type=EventType.STATE_SNAPSHOT,
        snapshot=plan.model_dump(),
    )


# Create the AG-UI app
app = agent.to_ag_ui()
