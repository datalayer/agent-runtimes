#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Return a random joke from predefined categories.

Usage:
    python random_joke.py
    python random_joke.py --category tech
"""

from __future__ import annotations

import argparse
import random

JOKES: dict[str, list[str]] = {
    "tech": [
        "Why do programmers confuse Halloween and Christmas? Because OCT 31 == DEC 25.",
        "I told my code to behave, but it still threw exceptions.",
        "There are only 10 types of people: those who understand binary and those who don't.",
    ],
    "dad": [
        "I used to hate facial hair, but then it grew on me.",
        "I only know 25 letters of the alphabet. I don't know y.",
        "I would tell you a joke about construction, but I'm still working on it.",
    ],
    "data": [
        "I have a joke about missing values, but it's not available.",
        "A SQL query walks into a bar, walks up to two tables, and asks: 'Can I join you?'",
        "My model is so overfit it memorized my coffee order.",
    ],
}


def random_joke(category: str = "any") -> str:
    """Return a random joke from the selected category."""
    if category == "any":
        pool: list[str] = [j for jokes in JOKES.values() for j in jokes]
        return random.choice(pool)  # nosec B311

    key = category.lower().strip()
    if key not in JOKES:
        valid = ", ".join(sorted(["any", *JOKES.keys()]))
        raise ValueError(f"Unknown category '{category}'. Valid categories: {valid}")

    return random.choice(JOKES[key])  # nosec B311


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Return a random joke")
    parser.add_argument(
        "--category",
        type=str,
        default="any",
        choices=["any", "tech", "dad", "data"],
        help="Joke category",
    )
    args = parser.parse_args()
    print(random_joke(category=args.category))
