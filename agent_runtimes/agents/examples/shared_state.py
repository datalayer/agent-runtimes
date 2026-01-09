# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Shared State example.

Demonstrates bidirectional state synchronization between the agent
and the UI. The agent can read and update shared state, and the UI
reflects these changes in real-time.

Features:
- State snapshot events (full state updates)
- State delta events (incremental updates)
- Bidirectional state flow (UI → Agent → UI)

This pattern is useful for:
- Recipe builders
- Form assistants  
- Document editors
- Any collaborative editing scenario

Example: Recipe Builder
- User can set ingredients via UI
- Agent can add/modify recipe details
- Both see the same state in real-time
"""

from enum import StrEnum
from textwrap import dedent
from typing import Optional

from pydantic import BaseModel, Field

from ag_ui.core import EventType, StateSnapshotEvent
from pydantic_ai import Agent, RunContext
from pydantic_ai.ag_ui import StateDeps


# Define the state schema
class SkillLevel(StrEnum):
    """The skill level required for the recipe."""

    BEGINNER = "Beginner"
    INTERMEDIATE = "Intermediate"
    ADVANCED = "Advanced"


class SpecialPreferences(StrEnum):
    """Special preferences for the recipe."""

    HIGH_PROTEIN = "High Protein"
    LOW_CARB = "Low Carb"
    SPICY = "Spicy"
    BUDGET_FRIENDLY = "Budget-Friendly"
    ONE_POT_MEAL = "One-Pot Meal"
    VEGETARIAN = "Vegetarian"
    VEGAN = "Vegan"


class CookingTime(StrEnum):
    """The cooking time of the recipe."""

    FIVE_MIN = "5 min"
    FIFTEEN_MIN = "15 min"
    THIRTY_MIN = "30 min"
    FORTY_FIVE_MIN = "45 min"
    SIXTY_PLUS_MIN = "60+ min"


class Ingredient(BaseModel):
    """An ingredient in a recipe."""

    icon: str = Field(
        default="🥕",
        description="The emoji icon for the ingredient (e.g., 🥕, 🧅, 🥩)",
    )
    name: str = Field(description="The name of the ingredient")
    amount: str = Field(description="The amount needed (e.g., '2 cups', '1 lb')")


class Recipe(BaseModel):
    """A recipe with all its details."""

    skill_level: SkillLevel = Field(
        default=SkillLevel.BEGINNER,
        description="The skill level required for the recipe",
    )
    special_preferences: list[SpecialPreferences] = Field(
        default_factory=list,
        description="Any special dietary preferences or requirements",
    )
    cooking_time: CookingTime = Field(
        default=CookingTime.THIRTY_MIN,
        description="The estimated cooking time",
    )
    ingredients: list[Ingredient] = Field(
        default_factory=list,
        description="List of ingredients for the recipe",
    )
    instructions: list[str] = Field(
        default_factory=list,
        description="Step-by-step cooking instructions",
    )


class RecipeSnapshot(BaseModel):
    """The shared state for the recipe builder."""

    recipe: Recipe = Field(
        default_factory=Recipe,
        description="The current state of the recipe",
    )


# Create the agent with state dependency
agent = Agent(
    "openai:gpt-4o-mini",
    deps_type=StateDeps[RecipeSnapshot],
)


@agent.tool_plain
async def display_recipe(recipe: Recipe) -> StateSnapshotEvent:
    """Display the recipe to the user.

    This tool updates the shared state with the new recipe,
    which is then reflected in the UI.

    Args:
        recipe: The complete recipe to display.

    Returns:
        StateSnapshotEvent containing the recipe snapshot.
    """
    return StateSnapshotEvent(
        type=EventType.STATE_SNAPSHOT,
        snapshot={"recipe": recipe.model_dump()},
    )


@agent.instructions
async def recipe_instructions(ctx: RunContext[StateDeps[RecipeSnapshot]]) -> str:
    """Dynamic instructions based on current recipe state.

    Args:
        ctx: The run context containing recipe state.

    Returns:
        Instructions string for the agent.
    """
    current_recipe = ctx.deps.state.recipe.model_dump_json(indent=2)
    
    return dedent(f"""
        You are a helpful recipe assistant.

        IMPORTANT RULES:
        1. Create recipes using the existing ingredients when possible
        2. Add new ingredients to the existing list (don't replace)
        3. Use the `display_recipe` tool to update the recipe
        4. Do NOT repeat the recipe in your message after using the tool
        5. Do NOT call `display_recipe` multiple times in a row

        After updating the recipe, give a brief summary of changes
        (one sentence). Don't describe the full recipe.

        Current recipe state:
        {current_recipe}
    """)


# Create the AG-UI app with initial state
app = agent.to_ag_ui(deps=StateDeps(RecipeSnapshot()))
