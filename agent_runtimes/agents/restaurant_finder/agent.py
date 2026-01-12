# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
A2UI Restaurant Finder Agent using pydantic-ai.

This agent provides restaurant search and booking functionality,
generating A2UI protocol messages for rich UI rendering.

This implementation uses a hybrid approach:
- The LLM agent interprets user queries and calls tools
- The A2UI response is built programmatically from tool results
"""

import json
import logging
import os
from typing import Any

from pydantic_ai import Agent, RunContext

from .restaurant_data import get_restaurant_data

logger = logging.getLogger(__name__)


# Agent state for storing context
class RestaurantDeps:
    """Dependencies for the restaurant agent."""

    def __init__(self, base_url: str = "http://localhost:8765"):
        self.base_url = base_url
        self.last_restaurants: list[dict[str, Any]] = []


def _build_restaurant_list_a2ui(restaurants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build A2UI messages for a restaurant list."""
    # Build the data model items
    items = []
    for i, restaurant in enumerate(restaurants):
        items.append({
            "key": f"item{i+1}",
            "valueMap": [
                {"key": "name", "valueString": restaurant.get("name", "")},
                {"key": "rating", "valueString": restaurant.get("rating", "")},
                {"key": "detail", "valueString": restaurant.get("detail", "")},
                {"key": "imageUrl", "valueString": restaurant.get("imageUrl", "")},
                {"key": "address", "valueString": restaurant.get("address", "")},
            ]
        })

    return [
        {
            "beginRendering": {
                "surfaceId": "default",
                "root": "root-column",
                "styles": {"primaryColor": "#FF5722", "font": "Roboto"}
            }
        },
        {
            "surfaceUpdate": {
                "surfaceId": "default",
                "components": [
                    {"id": "root-column", "component": {"Column": {"children": {"explicitList": ["title-heading", "item-list"]}}}},
                    {"id": "title-heading", "component": {"Text": {"usageHint": "h1", "text": {"literalString": f"Top {len(restaurants)} Restaurants"}}}},
                    {"id": "item-list", "component": {"List": {"direction": "vertical", "children": {"template": {"componentId": "item-card-template", "dataBinding": "/items"}}}}},
                    {"id": "item-card-template", "component": {"Card": {"child": "card-layout"}}},
                    {"id": "card-layout", "component": {"Row": {"children": {"explicitList": ["template-image", "card-details"]}}}},
                    {"id": "template-image", "weight": 1, "component": {"Image": {"url": {"path": "imageUrl"}}}},
                    {"id": "card-details", "weight": 2, "component": {"Column": {"children": {"explicitList": ["template-name", "template-rating", "template-detail"]}}}},
                    {"id": "template-name", "component": {"Text": {"usageHint": "h3", "text": {"path": "name"}}}},
                    {"id": "template-rating", "component": {"Text": {"text": {"path": "rating"}}}},
                    {"id": "template-detail", "component": {"Text": {"text": {"path": "detail"}}}}
                ]
            }
        },
        {
            "dataModelUpdate": {
                "surfaceId": "default",
                "path": "/",
                "contents": [
                    {"key": "items", "valueMap": items}
                ]
            }
        }
    ]


def _build_booking_form_a2ui(restaurant_name: str, address: str, image_url: str) -> list[dict[str, Any]]:
    """Build A2UI messages for a booking form."""
    return [
        {
            "beginRendering": {
                "surfaceId": "booking-form",
                "root": "form-root",
                "styles": {"primaryColor": "#4CAF50", "font": "Roboto"}
            }
        },
        {
            "surfaceUpdate": {
                "surfaceId": "booking-form",
                "components": [
                    {"id": "form-root", "component": {"Column": {"children": {"explicitList": ["form-title", "restaurant-info", "form-fields", "submit-btn"]}}}},
                    {"id": "form-title", "component": {"Text": {"usageHint": "h2", "text": {"literalString": "Book a Table"}}}},
                    {"id": "restaurant-info", "component": {"Row": {"children": {"explicitList": ["restaurant-image", "restaurant-details"]}}}},
                    {"id": "restaurant-image", "weight": 1, "component": {"Image": {"url": {"path": "imageUrl"}}}},
                    {"id": "restaurant-details", "weight": 2, "component": {"Column": {"children": {"explicitList": ["restaurant-name", "restaurant-address"]}}}},
                    {"id": "restaurant-name", "component": {"Text": {"usageHint": "h3", "text": {"path": "restaurantName"}}}},
                    {"id": "restaurant-address", "component": {"Text": {"text": {"path": "address"}}}},
                    {"id": "form-fields", "component": {"Column": {"children": {"explicitList": ["party-size-field", "time-field", "dietary-field"]}}}},
                    {"id": "party-size-field", "component": {"TextField": {"label": "Party Size", "dataBinding": "/partySize"}}},
                    {"id": "time-field", "component": {"TextField": {"label": "Reservation Time", "dataBinding": "/reservationTime"}}},
                    {"id": "dietary-field", "component": {"TextField": {"label": "Dietary Requirements", "dataBinding": "/dietary"}}},
                    {"id": "submit-btn", "component": {"Button": {"label": "Confirm Booking", "actionId": "submit_booking"}}}
                ]
            }
        },
        {
            "dataModelUpdate": {
                "surfaceId": "booking-form",
                "path": "/",
                "contents": [
                    {"key": "restaurantName", "valueString": restaurant_name},
                    {"key": "address", "valueString": address},
                    {"key": "imageUrl", "valueString": image_url},
                    {"key": "partySize", "valueString": "2"},
                    {"key": "reservationTime", "valueString": ""},
                    {"key": "dietary", "valueString": ""}
                ]
            }
        }
    ]


def _build_confirmation_a2ui(
    restaurant_name: str,
    party_size: str,
    reservation_time: str,
    dietary: str,
) -> list[dict[str, Any]]:
    """Build A2UI messages for a booking confirmation."""
    return [
        {
            "beginRendering": {
                "surfaceId": "confirmation",
                "root": "confirm-root",
                "styles": {"primaryColor": "#2196F3", "font": "Roboto"}
            }
        },
        {
            "surfaceUpdate": {
                "surfaceId": "confirmation",
                "components": [
                    {"id": "confirm-root", "component": {"Column": {"children": {"explicitList": ["confirm-icon", "confirm-title", "confirm-details"]}}}},
                    {"id": "confirm-icon", "component": {"Text": {"usageHint": "h1", "text": {"literalString": "✓"}}}},
                    {"id": "confirm-title", "component": {"Text": {"usageHint": "h2", "text": {"literalString": "Booking Confirmed!"}}}},
                    {"id": "confirm-details", "component": {"Column": {"children": {"explicitList": ["detail-restaurant", "detail-party", "detail-time", "detail-dietary"]}}}},
                    {"id": "detail-restaurant", "component": {"Text": {"text": {"path": "restaurantText"}}}},
                    {"id": "detail-party", "component": {"Text": {"text": {"path": "partyText"}}}},
                    {"id": "detail-time", "component": {"Text": {"text": {"path": "timeText"}}}},
                    {"id": "detail-dietary", "component": {"Text": {"text": {"path": "dietaryText"}}}}
                ]
            }
        },
        {
            "dataModelUpdate": {
                "surfaceId": "confirmation",
                "path": "/",
                "contents": [
                    {"key": "restaurantText", "valueString": f"Restaurant: {restaurant_name}"},
                    {"key": "partyText", "valueString": f"Party Size: {party_size}"},
                    {"key": "timeText", "valueString": f"Time: {reservation_time}"},
                    {"key": "dietaryText", "valueString": f"Dietary: {dietary or 'None specified'}"}
                ]
            }
        }
    ]


def create_restaurant_agent(base_url: str) -> Agent[RestaurantDeps, str]:
    """
    Create a new restaurant agent instance with the given base URL.
    """
    agent: Agent[RestaurantDeps, str] = Agent(
        model=os.getenv("PYDANTIC_AI_MODEL", "openai:gpt-4o-mini"),
        deps_type=RestaurantDeps,
        system_prompt="""You are a helpful restaurant finding assistant.

When users ask about restaurants, use the get_restaurants tool to search.
When users want to book a restaurant, acknowledge their request.

Keep your responses brief and friendly.""",
    )

    @agent.tool
    async def get_restaurants(
        ctx: RunContext[RestaurantDeps],
        cuisine: str,
        location: str,
        count: int = 5,
    ) -> str:
        """
        Get a list of restaurants based on cuisine and location.

        Args:
            cuisine: The type of cuisine (e.g., "Chinese", "Italian").
            location: The location to search in (e.g., "New York").
            count: Number of restaurants to return (default: 5).

        Returns:
            A description of the restaurants found.
        """
        logger.info(f"--- TOOL CALLED: get_restaurants ---")
        logger.info(f"  - Cuisine: {cuisine}, Location: {location}, Count: {count}")

        # Get restaurant data and store it for A2UI generation
        restaurants = get_restaurant_data(ctx.deps.base_url, count)
        ctx.deps.last_restaurants = restaurants
        
        logger.info(f"  - Found {len(restaurants)} restaurants")

        # Return a text summary for the LLM
        names = [r["name"] for r in restaurants]
        return f"Found {len(restaurants)} {cuisine} restaurants in {location}: {', '.join(names)}"

    return agent


async def run_restaurant_agent(
    query: str,
    base_url: str = "http://localhost:8765",
    max_retries: int = 2,
) -> dict[str, Any]:
    """
    Run the restaurant agent with a query.

    Args:
        query: User's query (e.g., "Top 5 Chinese restaurants in New York")
        base_url: Base URL for static assets
        max_retries: Maximum number of retries on failure

    Returns:
        Dict containing the agent response with A2UI messages
    """
    deps = RestaurantDeps(base_url=base_url)
    agent = create_restaurant_agent(base_url)

    try:
        logger.info(f"--- RestaurantAgent: Processing query: {query[:100]}... ---")
        
        result = await agent.run(query, deps=deps)
        text_response = result.output
        
        logger.info(f"--- RestaurantAgent: Got text response: {text_response[:200]}... ---")

        # Build A2UI response from the stored restaurant data
        if deps.last_restaurants:
            a2ui_messages = _build_restaurant_list_a2ui(deps.last_restaurants)
            logger.info(f"--- RestaurantAgent: Built A2UI with {len(deps.last_restaurants)} restaurants ---")
            
            return {
                "success": True,
                "text": text_response,
                "a2ui_messages": a2ui_messages,
            }
        else:
            # No restaurants found, return just text
            logger.warning("--- RestaurantAgent: No restaurants in deps, returning text only ---")
            return {
                "success": True,
                "text": text_response,
                "a2ui_messages": [],
            }

    except Exception as e:
        logger.error(f"--- RestaurantAgent: Error: {e} ---")
        return {
            "success": False,
            "error": str(e),
        }


async def handle_a2ui_action(
    action_id: str,
    context: dict[str, Any],
    base_url: str = "http://localhost:8765",
) -> dict[str, Any]:
    """
    Handle an A2UI action (button click, form submission, etc.).

    Args:
        action_id: The action identifier (e.g., "book_restaurant", "submit_booking")
        context: The action context with relevant data
        base_url: Base URL for static assets

    Returns:
        Dict containing the agent response with A2UI messages
    """
    logger.info(f"--- A2UI Action: {action_id} ---")
    logger.info(f"  - Context: {context}")

    if action_id == "book_restaurant":
        restaurant_name = context.get("restaurantName", "Unknown Restaurant")
        image_url = context.get("imageUrl", "")
        address = context.get("address", "")

        a2ui_messages = _build_booking_form_a2ui(restaurant_name, address, image_url)
        
        return {
            "success": True,
            "text": f"Let's book a table at {restaurant_name}!",
            "a2ui_messages": a2ui_messages,
        }

    elif action_id == "submit_booking":
        restaurant_name = context.get("restaurantName", "Unknown Restaurant")
        party_size = context.get("partySize", "2")
        reservation_time = context.get("reservationTime", "Not specified")
        dietary = context.get("dietary", "")

        a2ui_messages = _build_confirmation_a2ui(
            restaurant_name, party_size, reservation_time, dietary
        )
        
        return {
            "success": True,
            "text": f"Your booking at {restaurant_name} is confirmed!",
            "a2ui_messages": a2ui_messages,
        }

    else:
        return {
            "success": False,
            "error": f"Unknown action: {action_id}",
        }
