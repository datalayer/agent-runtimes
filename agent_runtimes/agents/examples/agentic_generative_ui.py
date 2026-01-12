# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agentic Generative UI example.

Demonstrates an agent that generates UI through plans and steps.
The agent creates a plan with multiple steps, and can update
individual steps as progress is made.

Features:
- State snapshot events for full plan creation
- State delta events for incremental step updates
- JSON Patch (RFC 6902) for efficient updates

This pattern is useful for:
- Progress tracking
- Multi-step workflows
- Task management
- Project planning
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from ag_ui.core import EventType, StateDeltaEvent, StateSnapshotEvent
from pydantic_ai import Agent

# Define types for the plan
StepStatus = Literal["pending", "completed"]


class Step(BaseModel):
    """A step in a plan."""

    description: str = Field(description="The description of the step")
    status: StepStatus = Field(
        default="pending",
        description="The status of the step",
    )


class Plan(BaseModel):
    """A plan with multiple steps."""

    steps: list[Step] = Field(
        default_factory=list,
        description="The steps in the plan",
    )


class JSONPatchOp(BaseModel):
    """A JSON Patch operation (RFC 6902)."""

    op: Literal["add", "remove", "replace", "move", "copy", "test"] = Field(
        description="The operation to perform",
    )
    path: str = Field(
        description="JSON Pointer (RFC 6901) to the target location",
    )
    value: Optional[Any] = Field(
        default=None,
        description="The value to apply (for add, replace operations)",
    )
    from_: Optional[str] = Field(
        default=None,
        alias="from",
        description="Source path (for move, copy operations)",
    )


# Create the agent
agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt="""
        You are a helpful assistant that creates and executes plans.
        
        When asked to do something:
        1. Call `create_plan` with a list of step descriptions
        2. As you work through steps, call `update_plan_step` to mark them complete
        
        IMPORTANT:
        - Always create a plan first before doing anything
        - Mark steps as completed as you work through them
        - Don't repeat the plan in your messages
        - Give a brief summary (one sentence with emojis) after completing steps
        - Say you actually did the steps, not merely generated them
    """,
)


@agent.tool_plain
async def create_plan(steps: list[str]) -> StateSnapshotEvent:
    """Create a plan with multiple steps.

    This initializes the shared state with a new plan.

    Args:
        steps: List of step descriptions to create the plan.

    Returns:
        StateSnapshotEvent containing the initial plan state.
    """
    plan = Plan(
        steps=[Step(description=step) for step in steps],
    )
    return StateSnapshotEvent(
        type=EventType.STATE_SNAPSHOT,
        snapshot=plan.model_dump(),
    )


@agent.tool_plain
async def update_plan_step(
    index: int,
    description: Optional[str] = None,
    status: Optional[StepStatus] = None,
) -> StateDeltaEvent:
    """Update a specific step in the plan.

    Uses JSON Patch (RFC 6902) for efficient incremental updates.

    Args:
        index: The index of the step to update (0-based).
        description: New description for the step (optional).
        status: New status for the step (optional).

    Returns:
        StateDeltaEvent containing the JSON Patch operations.
    """
    changes: list[dict] = []
    
    if description is not None:
        changes.append({
            "op": "replace",
            "path": f"/steps/{index}/description",
            "value": description,
        })
    
    if status is not None:
        changes.append({
            "op": "replace",
            "path": f"/steps/{index}/status",
            "value": status,
        })
    
    return StateDeltaEvent(
        type=EventType.STATE_DELTA,
        delta=changes,
    )


# Create the AG-UI app
app = agent.to_ag_ui()
