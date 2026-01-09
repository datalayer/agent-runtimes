# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Restaurant data for the A2UI Restaurant Finder agent."""

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Placeholder images from Unsplash (public domain food images)
# Using direct URLs that don't require local static files
FOOD_IMAGES = {
    "noodles": "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=300&fit=crop",
    "mapo_tofu": "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=400&h=300&fit=crop",
    "beef": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop",
    "spring_rolls": "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400&h=300&fit=crop",
    "kung_pao": "https://images.unsplash.com/photo-1525755662778-989d0524087e?w=400&h=300&fit=crop",
    "dim_sum": "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=400&h=300&fit=crop",
    "dumplings": "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&h=300&fit=crop",
    "fried_rice": "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=300&fit=crop",
}

# Default restaurant data (New York Chinese restaurants)
DEFAULT_RESTAURANT_DATA = [
    {
        "name": "Xi'an Famous Foods",
        "detail": "Spicy and savory hand-pulled noodles.",
        "imageUrl": FOOD_IMAGES["noodles"],
        "rating": "★★★★☆",
        "infoLink": "[More Info](https://www.xianfoods.com/)",
        "address": "81 St Marks Pl, New York, NY 10003",
    },
    {
        "name": "Han Dynasty",
        "detail": "Authentic Szechuan cuisine.",
        "imageUrl": FOOD_IMAGES["mapo_tofu"],
        "rating": "★★★★☆",
        "infoLink": "[More Info](https://www.handynasty.net/)",
        "address": "90 3rd Ave, New York, NY 10003",
    },
    {
        "name": "RedFarm",
        "detail": "Modern Chinese with a farm-to-table approach.",
        "imageUrl": FOOD_IMAGES["dim_sum"],
        "rating": "★★★★☆",
        "infoLink": "[More Info](https://www.redfarmnyc.com/)",
        "address": "529 Hudson St, New York, NY 10014",
    },
    {
        "name": "Mott 32",
        "detail": "Upscale Cantonese dining.",
        "imageUrl": FOOD_IMAGES["spring_rolls"],
        "rating": "★★★★★",
        "infoLink": "[More Info](https://mott32.com/newyork/)",
        "address": "111 W 57th St, New York, NY 10019",
    },
    {
        "name": "Hwa Yuan Szechuan",
        "detail": "Famous for its cold noodles with sesame sauce.",
        "imageUrl": FOOD_IMAGES["kung_pao"],
        "rating": "★★★★☆",
        "infoLink": "[More Info](https://hwayuannyc.com/)",
        "address": "40 E Broadway, New York, NY 10002",
    },
    {
        "name": "Cafe China",
        "detail": "Szechuan food in a 1930s Shanghai setting.",
        "imageUrl": FOOD_IMAGES["beef"],
        "rating": "★★★★☆",
        "infoLink": "[More Info](https://www.cafechinanyc.com/)",
        "address": "59 W 37th St, New York, NY 10018",
    },
    {
        "name": "Philippe Chow",
        "detail": "High-end Beijing-style cuisine.",
        "imageUrl": FOOD_IMAGES["dumplings"],
        "rating": "★★★★☆",
        "infoLink": "[More Info](https://www.philippechow.com/)",
        "address": "33 E 60th St, New York, NY 10022",
    },
    {
        "name": "Chinese Tuxedo",
        "detail": "Contemporary Chinese in a former opera house.",
        "imageUrl": FOOD_IMAGES["fried_rice"],
        "rating": "★★★★☆",
        "infoLink": "[More Info](https://chinesetuxedo.com/)",
        "address": "5 Doyers St, New York, NY 10013",
    },
]


def get_restaurant_data(
    base_url: str = "http://localhost:8765",
    count: int = 5,
) -> list[dict[str, Any]]:
    """
    Get restaurant data with base_url substituted.

    Args:
        base_url: The base URL for static assets.
        count: Maximum number of restaurants to return.

    Returns:
        List of restaurant dictionaries.
    """
    # Process the data with base_url substitution
    restaurants = []
    for restaurant in DEFAULT_RESTAURANT_DATA[:count]:
        processed = {}
        for key, value in restaurant.items():
            if isinstance(value, str):
                processed[key] = value.replace("{base_url}", base_url)
            else:
                processed[key] = value
        restaurants.append(processed)

    logger.info(f"Returning {len(restaurants)} restaurants with base_url: {base_url}")
    return restaurants
