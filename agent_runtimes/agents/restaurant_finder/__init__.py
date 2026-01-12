# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A2UI Restaurant Finder agent using pydantic-ai."""

from .agent import (
    RestaurantDeps,
    create_restaurant_agent,
    run_restaurant_agent,
    handle_a2ui_action,
)

__all__ = [
    "RestaurantDeps",
    "create_restaurant_agent",
    "run_restaurant_agent",
    "handle_a2ui_action",
]
