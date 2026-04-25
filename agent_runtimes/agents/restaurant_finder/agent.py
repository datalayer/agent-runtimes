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


A2UI_BASIC_CATALOG_ID = "https://a2ui.org/specification/v0_9/basic_catalog.json"


def _create_surface_message(surface_id: str, primary_color: str) -> dict[str, Any]:
    """Build a native A2UI v0.9 createSurface message."""
    return {
        "version": "v0.9",
        "createSurface": {
            "surfaceId": surface_id,
            "catalogId": A2UI_BASIC_CATALOG_ID,
            "theme": {"primaryColor": primary_color, "font": "Roboto"},
            "sendDataModel": True,
        },
    }


def _build_restaurant_list_a2ui(
    restaurants: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build native A2UI v0.9 messages for a restaurant list."""
    items = [
        {
            "name": restaurant.get("name", ""),
            "rating": str(restaurant.get("rating", "")),
            "detail": restaurant.get("detail", ""),
            "imageUrl": restaurant.get("imageUrl", ""),
            "address": restaurant.get("address", ""),
        }
        for restaurant in restaurants
    ]

    return [
        _create_surface_message("default", "#FF5722"),
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": "default",
                "components": [
                    {
                        "id": "root",
                        "component": "Column",
                        "children": ["title-heading", "item-list"],
                    },
                    {
                        "id": "title-heading",
                        "component": "Text",
                        "variant": "h1",
                        "text": {"path": "/title"},
                    },
                    {
                        "id": "item-list",
                        "component": "List",
                        "direction": "vertical",
                        "children": {
                            "componentId": "item-card-template",
                            "path": "/items",
                        },
                    },
                    {
                        "id": "item-card-template",
                        "component": "Card",
                        "child": "card-layout",
                    },
                    {
                        "id": "card-layout",
                        "component": "Row",
                        "children": ["template-image", "card-details"],
                    },
                    {
                        "id": "template-image",
                        "component": "Image",
                        "weight": 1,
                        "url": {"path": "imageUrl"},
                    },
                    {
                        "id": "card-details",
                        "component": "Column",
                        "weight": 2,
                        "children": [
                            "template-name",
                            "template-rating",
                            "template-detail",
                            "template-address",
                            "template-book-button",
                        ],
                    },
                    {
                        "id": "template-name",
                        "component": "Text",
                        "variant": "h3",
                        "text": {"path": "name"},
                    },
                    {
                        "id": "template-rating",
                        "component": "Text",
                        "text": {"path": "rating"},
                    },
                    {
                        "id": "template-detail",
                        "component": "Text",
                        "text": {"path": "detail"},
                    },
                    {
                        "id": "template-address",
                        "component": "Text",
                        "variant": "caption",
                        "text": {"path": "address"},
                    },
                    {
                        "id": "template-book-button-label",
                        "component": "Text",
                        "text": "Book Now",
                    },
                    {
                        "id": "template-book-button",
                        "component": "Button",
                        "variant": "primary",
                        "child": "template-book-button-label",
                        "action": {
                            "event": {
                                "name": "book_restaurant",
                                "context": {
                                    "restaurantName": {"path": "name"},
                                    "imageUrl": {"path": "imageUrl"},
                                    "address": {"path": "address"},
                                },
                            }
                        },
                    },
                ],
            },
        },
        {
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": "default",
                "path": "/",
                "value": {
                    "title": f"Top {len(restaurants)} Restaurants",
                    "items": items,
                },
            },
        },
    ]


def _build_booking_form_a2ui(
    restaurant_name: str, address: str, image_url: str
) -> list[dict[str, Any]]:
    """Build native A2UI v0.9 messages for a booking form."""
    return [
        _create_surface_message("booking-form", "#4CAF50"),
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": "booking-form",
                "components": [
                    {
                        "id": "root",
                        "component": "Column",
                        "children": [
                            "form-title",
                            "restaurant-info",
                            "party-size-field",
                            "time-field",
                            "dietary-field",
                            "submit-btn",
                        ],
                    },
                    {
                        "id": "form-title",
                        "component": "Text",
                        "variant": "h2",
                        "text": "Book a Table",
                    },
                    {
                        "id": "restaurant-info",
                        "component": "Row",
                        "children": ["restaurant-image", "restaurant-details"],
                    },
                    {
                        "id": "restaurant-image",
                        "component": "Image",
                        "weight": 1,
                        "url": {"path": "/imageUrl"},
                    },
                    {
                        "id": "restaurant-details",
                        "component": "Column",
                        "weight": 2,
                        "children": ["restaurant-name", "restaurant-address"],
                    },
                    {
                        "id": "restaurant-name",
                        "component": "Text",
                        "variant": "h3",
                        "text": {"path": "/restaurantName"},
                    },
                    {
                        "id": "restaurant-address",
                        "component": "Text",
                        "text": {"path": "/address"},
                    },
                    {
                        "id": "party-size-field",
                        "component": "TextField",
                        "label": "Party Size",
                        "value": {"path": "/partySize"},
                    },
                    {
                        "id": "time-field",
                        "component": "DateTimeInput",
                        "label": "Reservation Time",
                        "value": {"path": "/reservationTime"},
                    },
                    {
                        "id": "dietary-field",
                        "component": "TextField",
                        "label": "Dietary Requirements",
                        "value": {"path": "/dietary"},
                    },
                    {
                        "id": "submit-btn-label",
                        "component": "Text",
                        "text": "Confirm Booking",
                    },
                    {
                        "id": "submit-btn",
                        "component": "Button",
                        "variant": "primary",
                        "child": "submit-btn-label",
                        "action": {
                            "event": {
                                "name": "submit_booking",
                                "context": {
                                    "restaurantName": {"path": "/restaurantName"},
                                    "partySize": {"path": "/partySize"},
                                    "reservationTime": {"path": "/reservationTime"},
                                    "dietary": {"path": "/dietary"},
                                },
                            }
                        },
                    },
                ],
            },
        },
        {
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": "booking-form",
                "path": "/",
                "value": {
                    "restaurantName": restaurant_name,
                    "address": address,
                    "imageUrl": image_url,
                    "partySize": "2",
                    "reservationTime": "",
                    "dietary": "",
                },
            },
        },
    ]


def _build_confirmation_a2ui(
    restaurant_name: str,
    party_size: str,
    reservation_time: str,
    dietary: str,
) -> list[dict[str, Any]]:
    """Build native A2UI v0.9 messages for a booking confirmation."""
    return [
        _create_surface_message("confirmation", "#2196F3"),
        {
            "version": "v0.9",
            "updateComponents": {
                "surfaceId": "confirmation",
                "components": [
                    {
                        "id": "root",
                        "component": "Card",
                        "child": "confirm-column",
                    },
                    {
                        "id": "confirm-column",
                        "component": "Column",
                        "children": [
                            "confirm-icon",
                            "confirm-title",
                            "divider-1",
                            "detail-restaurant",
                            "detail-party",
                            "detail-time",
                            "detail-dietary",
                            "divider-2",
                            "confirm-text",
                        ],
                    },
                    {
                        "id": "confirm-icon",
                        "component": "Text",
                        "variant": "h1",
                        "text": "✓",
                    },
                    {
                        "id": "confirm-title",
                        "component": "Text",
                        "variant": "h2",
                        "text": "Booking Confirmed!",
                    },
                    {"id": "divider-1", "component": "Divider"},
                    {
                        "id": "detail-restaurant",
                        "component": "Text",
                        "text": {"path": "/restaurantText"},
                    },
                    {
                        "id": "detail-party",
                        "component": "Text",
                        "text": {"path": "/partyText"},
                    },
                    {
                        "id": "detail-time",
                        "component": "Text",
                        "text": {"path": "/timeText"},
                    },
                    {
                        "id": "detail-dietary",
                        "component": "Text",
                        "text": {"path": "/dietaryText"},
                    },
                    {"id": "divider-2", "component": "Divider"},
                    {
                        "id": "confirm-text",
                        "component": "Text",
                        "variant": "h5",
                        "text": "We look forward to seeing you!",
                    },
                ],
            },
        },
        {
            "version": "v0.9",
            "updateDataModel": {
                "surfaceId": "confirmation",
                "path": "/",
                "value": {
                    "restaurantText": f"Restaurant: {restaurant_name}",
                    "partyText": f"Party Size: {party_size}",
                    "timeText": f"Time: {reservation_time}",
                    "dietaryText": f"Dietary: {dietary or 'None specified'}",
                },
            },
        },
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
        logger.info("--- TOOL CALLED: get_restaurants ---")
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

        logger.info(
            f"--- RestaurantAgent: Got text response: {text_response[:200]}... ---"
        )

        # Build A2UI response from the stored restaurant data
        if deps.last_restaurants:
            a2ui_messages = _build_restaurant_list_a2ui(deps.last_restaurants)
            logger.info(
                f"--- RestaurantAgent: Built A2UI with {len(deps.last_restaurants)} restaurants ---"
            )

            return {
                "success": True,
                "text": text_response,
                "a2ui_messages": a2ui_messages,
            }
        else:
            # No restaurants found, return just text
            logger.warning(
                "--- RestaurantAgent: No restaurants in deps, returning text only ---"
            )
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
