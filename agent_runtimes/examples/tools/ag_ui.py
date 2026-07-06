# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""AG-UI example tool implementations.

These callables replicate the exact feature set of the former
``/api/v1/examples/*`` AG-UI demo agents, exposed as reusable runtime tools
that can be attached to agents through agentspecs.

Each function is referenced from a ToolSpec ``runtime`` block via
``package`` + ``method`` and registered on a ``pydantic_ai.Agent`` through
``register_agent_tools`` (which wires them with ``tool_plain``).
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any, Literal, Optional
from zoneinfo import ZoneInfo

import httpx
from ag_ui.core import EventType, StateDeltaEvent, StateSnapshotEvent
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# agentic_chat: current_time
# ---------------------------------------------------------------------------


async def current_time(timezone: str = "UTC") -> str:
    """
    Get the current time in ISO format.

    Args:
        timezone: The timezone to use (e.g., 'UTC', 'America/New_York', 'Europe/London').

    Returns:
        The current time in ISO format string.
    """
    try:
        tz = ZoneInfo(timezone)
        return datetime.now(tz=tz).isoformat()
    except Exception:
        # Fallback to UTC if timezone is invalid
        return datetime.now(tz=ZoneInfo("UTC")).isoformat()


# ---------------------------------------------------------------------------
# backend_tool_rendering: get_weather
# ---------------------------------------------------------------------------


def _get_weather_condition(code: int) -> str:
    """
    Map WMO weather code to human-readable condition.

    Args:
        code: WMO weather code.

    Returns:
        Human-readable weather condition string.
    """
    conditions = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Foggy",
        48: "Depositing rime fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        56: "Light freezing drizzle",
        57: "Dense freezing drizzle",
        61: "Slight rain",
        63: "Moderate rain",
        65: "Heavy rain",
        66: "Light freezing rain",
        67: "Heavy freezing rain",
        71: "Slight snow fall",
        73: "Moderate snow fall",
        75: "Heavy snow fall",
        77: "Snow grains",
        80: "Slight rain showers",
        81: "Moderate rain showers",
        82: "Violent rain showers",
        85: "Slight snow showers",
        86: "Heavy snow showers",
        95: "Thunderstorm",
        96: "Thunderstorm with slight hail",
        99: "Thunderstorm with heavy hail",
    }
    return conditions.get(code, "Unknown")


async def get_weather(location: str) -> dict[str, str | float]:
    """
    Get current weather for a location.

    This tool fetches real weather data from Open-Meteo API.
    The frontend can render this data as a weather card.

    Args:
        location: City name (e.g., "New York", "London", "Tokyo").

    Returns:
        Dictionary with weather information:
        - temperature: Current temperature in Celsius
        - feelsLike: Apparent temperature
        - humidity: Relative humidity percentage
        - windSpeed: Wind speed in km/h
        - windGust: Wind gust speed in km/h
        - conditions: Human-readable weather description
        - location: Resolved location name
    """
    async with httpx.AsyncClient() as client:
        # Geocode the location
        geocoding_url = (
            f"https://geocoding-api.open-meteo.com/v1/search?name={location}&count=1"
        )
        geocoding_response = await client.get(geocoding_url)
        geocoding_data = geocoding_response.json()

        if not geocoding_data.get("results"):
            raise ValueError(f"Location '{location}' not found")

        result = geocoding_data["results"][0]
        latitude = result["latitude"]
        longitude = result["longitude"]
        name = result["name"]

        # Get weather data
        weather_url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={latitude}&longitude={longitude}"
            f"&current=temperature_2m,apparent_temperature,relative_humidity_2m,"
            f"wind_speed_10m,wind_gusts_10m,weather_code"
        )
        weather_response = await client.get(weather_url)
        weather_data = weather_response.json()

        current = weather_data["current"]

        return {
            "temperature": current["temperature_2m"],
            "feelsLike": current["apparent_temperature"],
            "humidity": current["relative_humidity_2m"],
            "windSpeed": current["wind_speed_10m"],
            "windGust": current["wind_gusts_10m"],
            "conditions": _get_weather_condition(current["weather_code"]),
            "location": name,
        }


# ---------------------------------------------------------------------------
# haiku_generative_ui: generate_haiku
# ---------------------------------------------------------------------------


async def generate_haiku(
    japanese: list[str],
    english: list[str],
    gradient: str,
) -> str:
    """
    Generate a haiku and display it in the UI.

    This tool creates a haiku with Japanese text, English translation,
    and a beautiful gradient background. The frontend will render this
    as a card in both the chat and the main display area.

    Args:
        japanese: Array of three lines of the haiku in Japanese (5-7-5 syllables).
        english: Array of three lines of the haiku translated to English.
        gradient: CSS gradient string for the card background.
                  Example: linear-gradient(135deg, color1 0%, color2 100%)

    Returns:
        Confirmation message.
    """
    # The tool just returns confirmation - the frontend handles rendering
    # The tool call arguments are what matter for the UI
    return "Haiku generated!"


# ---------------------------------------------------------------------------
# agentic_generative_ui: create_plan / update_plan_step
# ---------------------------------------------------------------------------

StepStatus = Literal["pending", "completed"]


class Step(BaseModel):
    """
    A step in a plan.
    """

    description: str = Field(description="The description of the step")
    status: StepStatus = Field(
        default="pending",
        description="The status of the step",
    )


class Plan(BaseModel):
    """
    A plan with multiple steps.
    """

    steps: list[Step] = Field(
        default_factory=list,
        description="The steps in the plan",
    )


async def create_plan(steps: list[str]) -> StateSnapshotEvent:
    """
    Create a plan with multiple steps.

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


async def update_plan_step(
    index: int,
    description: Optional[str] = None,
    status: Optional[StepStatus] = None,
) -> StateDeltaEvent:
    """
    Update a specific step in the plan.

    Uses JSON Patch (RFC 6902) for efficient incremental updates.

    Args:
        index: The index of the step to update (0-based).
        description: New description for the step (optional).
        status: New status for the step (optional).

    Returns:
        StateDeltaEvent containing the JSON Patch operations.
    """
    changes: list[dict[str, Any]] = []

    if description is not None:
        changes.append(
            {
                "op": "replace",
                "path": f"/steps/{index}/description",
                "value": description,
            }
        )

    if status is not None:
        changes.append(
            {
                "op": "replace",
                "path": f"/steps/{index}/status",
                "value": status,
            }
        )

    return StateDeltaEvent(
        type=EventType.STATE_DELTA,
        delta=changes,
    )


# ---------------------------------------------------------------------------
# human_in_the_loop: generate_task_steps
# ---------------------------------------------------------------------------

TaskStepStatus = Literal["enabled", "disabled", "executing"]


class TaskStep(BaseModel):
    """
    A step in a task plan.
    """

    description: str = Field(description="The description of the step")
    status: TaskStepStatus = Field(
        default="enabled",
        description="The status of the step",
    )


class TaskPlan(BaseModel):
    """
    A task plan with multiple steps for human review.
    """

    steps: list[TaskStep] = Field(
        default_factory=list,
        description="The steps in the task plan",
    )


async def generate_task_steps(steps: list[str]) -> StateSnapshotEvent:
    """
    Generate a list of task steps for the user to review and approve.

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


# ---------------------------------------------------------------------------
# shared_state: display_recipe
# ---------------------------------------------------------------------------


class SkillLevel(StrEnum):
    """
    The skill level required for the recipe.
    """

    BEGINNER = "Beginner"
    INTERMEDIATE = "Intermediate"
    ADVANCED = "Advanced"


class SpecialPreferences(StrEnum):
    """
    Special preferences for the recipe.
    """

    HIGH_PROTEIN = "High Protein"
    LOW_CARB = "Low Carb"
    SPICY = "Spicy"
    BUDGET_FRIENDLY = "Budget-Friendly"
    ONE_POT_MEAL = "One-Pot Meal"
    VEGETARIAN = "Vegetarian"
    VEGAN = "Vegan"


class CookingTime(StrEnum):
    """
    The cooking time of the recipe.
    """

    FIVE_MIN = "5 min"
    FIFTEEN_MIN = "15 min"
    THIRTY_MIN = "30 min"
    FORTY_FIVE_MIN = "45 min"
    SIXTY_PLUS_MIN = "60+ min"


class Ingredient(BaseModel):
    """
    An ingredient in a recipe.
    """

    icon: str = Field(
        default="🥕",
        description="The emoji icon for the ingredient (e.g., 🥕, 🧅, 🥩)",
    )
    name: str = Field(description="The name of the ingredient")
    amount: str = Field(description="The amount needed (e.g., '2 cups', '1 lb')")


class Recipe(BaseModel):
    """
    A recipe with all its details.
    """

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


async def display_recipe(recipe: Recipe) -> StateSnapshotEvent:
    """
    Display the recipe to the user.

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


__all__ = [
    "current_time",
    "get_weather",
    "generate_haiku",
    "create_plan",
    "update_plan_step",
    "generate_task_steps",
    "display_recipe",
]
