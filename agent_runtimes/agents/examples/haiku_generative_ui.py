# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Haiku Generative UI example.

Demonstrates tool-based generative UI where the agent generates
haiku poetry that is rendered as beautiful cards in the frontend.

The agent uses the generate_haiku tool which returns structured
haiku data (Japanese + English + gradient). The frontend renders
this as a card both in the chat and in the main display area.

Features:
- Haiku generation in Japanese and English
- CSS gradient backgrounds for visual appeal
- Tool-based generative UI pattern
- Carousel display in main view

This follows the same pattern as the ag-ui Dojo implementation.
"""

from textwrap import dedent
from pydantic_ai import Agent

# Create the agent
agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt=dedent("""
        You are an expert haiku generator that creates beautiful Japanese haiku poems
        and their English translations.

        When generating a haiku:
        1. Create a traditional 5-7-5 syllable structure haiku in Japanese
        2. Provide an accurate and poetic English translation
        3. Choose a CSS gradient that matches the mood of the haiku

        Always use the generate_haiku tool to create your haiku. The tool will handle
        the formatting and validation of your response.

        Focus on creating haiku that capture the essence of Japanese poetry:
        nature imagery, seasonal references, emotional depth, and moments of beauty
        or contemplation. That said, any topic is fair game.

        Do not repeat the haiku content in your text response - the UI will display it beautifully.
        Just acknowledge that you've created the haiku.
    """),
)

# Create the AG-UI app
app = agent.to_ag_ui()


@agent.tool_plain
async def generate_haiku(
    japanese: list[str],
    english: list[str],
    gradient: str,
) -> str:
    """Generate a haiku and display it in the UI.

    This tool creates a haiku with Japanese text, English translation,
    and a beautiful gradient background. The frontend will render this
    as a card in both the chat and the main display area.

    Args:
        japanese: Array of three lines of the haiku in Japanese (5-7-5 syllables).
        english: Array of three lines of the haiku translated to English.
        gradient: CSS gradient string for the card background 
                  (e.g., "linear-gradient(135deg, #667eea 0%, #764ba2 100%)").

    Returns:
        Confirmation message.
    """
    # The tool just returns confirmation - the frontend handles rendering
    # The tool call arguments are what matter for the UI
    return "Haiku generated!"
