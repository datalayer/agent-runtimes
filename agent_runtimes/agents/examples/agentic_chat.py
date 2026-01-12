# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Agentic Chat example.

Demonstrates a basic conversational agent with tools.
This is the simplest AG-UI example - an agent that can chat
and use tools to get real-time information.

Features:
- Text streaming
- Tool calling with results
- Simple conversation flow
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from pydantic_ai import Agent

# Create the agent with a simple system prompt
agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt=(
        "You are a helpful assistant that can provide the current time in any timezone. "
        "Use the current_time tool when asked about the time. "
        "Keep your responses concise and helpful."
    ),
)

# Convert to AG-UI app
app = agent.to_ag_ui()


@agent.tool_plain
async def current_time(timezone: str = "UTC") -> str:
    """Get the current time in ISO format.

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
