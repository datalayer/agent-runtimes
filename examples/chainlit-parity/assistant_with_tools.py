# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An assistant with tools — Chainlit's cookbook ``anthropic-functions-streaming``,
rebuilt with LOOP's API (LOOP P-27).

Chainlit declares two tools to Claude — a hard-coded weather and a
calculator — streams each answer, runs a tool in a ``tool`` step when the
model asks for one, and loops until the model stops asking, keeping the
history in the user session.

Here: each tool is an ``@app.tool``, declared in the Appspec, its parameters
from its typed arguments, and **decided by the application's rules** on
every call (both only read); the agent loops, streams and keeps the history
itself, and each call is a step of the conversation and an entry of the
record. Nothing of Chainlit's loop is the developer's to write.
"""

import json
from typing import Literal, Optional

from agent_runtimes.loop.apps import Application

AGENT = "example-a2a-writer:0.0.1"

app = Application(
    id="assistant-with-tools",
    name="Assistant with Tools",
    agent=AGENT,
    description="A helpful assistant with a weather and a calculator.",
    instructions="You are a helpful assistant. Use your tools for the weather and for arithmetic.",
)


@app.tool(does="read")
def get_current_weather(
    location: str, unit: Optional[Literal["celsius", "fahrenheit"]] = None
) -> str:
    """Get the current weather for a specified location, e.g. 'San Francisco, CA'."""
    return json.dumps(
        {
            "location": location,
            "temperature": "74",
            "unit": unit or "Farenheit",
            "forecast": ["sunny", "windy"],
        }
    )


@app.tool(does="read")
def calculator(
    operation: Literal["add", "subtract", "multiply", "divide"],
    operand1: float,
    operand2: float,
) -> str:
    """A simple calculator that performs basic arithmetic operations."""
    if operation == "divide" and operand2 == 0:
        return json.dumps({"error": "Division by zero is not allowed"})
    result = {
        "add": operand1 + operand2,
        "subtract": operand1 - operand2,
        "multiply": operand1 * operand2,
        "divide": operand1 / operand2 if operand2 else None,
    }[operation]
    return json.dumps(
        {
            "operation": operation,
            "operand1": operand1,
            "operand2": operand2,
            "result": result,
        }
    )
