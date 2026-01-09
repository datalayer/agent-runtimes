# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tool Based Generative UI example.

Demonstrates an agent that uses tools to render dynamic UI components.
The frontend defines "render tools" that the agent can call to display
rich content like cards, tables, charts, etc.

Features:
- Frontend-defined render tools
- Dynamic UI generation based on agent decisions
- Rich content beyond plain text

This pattern is useful for:
- Data visualization
- Product recommendations
- Interactive dashboards
- Any scenario requiring rich UI rendering

Note: This example relies on frontend render tools. The actual UI
rendering happens in the React frontend using CopilotKit's
useFrontendTools or similar mechanism.
"""

from pydantic_ai import Agent

# Create a simple agent - the generative UI magic happens on the frontend
agent = Agent(
    "openai:gpt-4o-mini",
    system_prompt=(
        "You are a helpful assistant that can display rich content. "
        "When asked to show or display something, use the appropriate render tool. "
        "Available render tools will be provided by the frontend."
    ),
)

# Convert to AG-UI app
app = agent.to_ag_ui()


# Note: Tool-based generative UI works as follows:
#
# 1. Frontend defines render tools (e.g., render_weather_card, render_chart)
# 2. These tools are registered with CopilotKit
# 3. Agent sees these tools and can call them
# 4. When agent calls a render tool, the frontend renders the component
# 5. The rendered UI becomes part of the conversation
#
# For examples of render tools, see:
# - CopilotKit documentation: https://docs.copilotkit.ai/reference/hooks/useFrontendTools
# - The frontend components in src/examples/
