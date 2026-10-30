# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Components no adapter knows: a solver, a tool, a scorer and a metric of this project's own.

They run because the framework runs them. Nothing outside this file knows what
they are.
"""

from __future__ import annotations

import re

from inspect_ai.model import ChatMessageUser, ModelOutput, get_model
from inspect_ai.scorer import Metric, SampleScore, Score, Scorer, Target, metric, scorer
from inspect_ai.solver import Generate, Solver, TaskState, solver
from inspect_ai.tool import Tool, tool


@tool
def add() -> Tool:
    async def execute(x: int, y: int) -> int:
        """Add two integers.

        Args:
            x: The first integer.
            y: The second integer.

        Returns:
            Their sum.
        """
        return x + y

    return execute


@solver
def ask_to_use_the_tool(
    reminder: str = "Use the add tool, then answer with the number only.",
) -> Solver:
    async def solve(state: TaskState, generate: Generate) -> TaskState:
        state.messages.append(ChatMessageUser(content=reminder))
        return state

    return solve


@metric
def longest() -> Metric:
    """The longest answer of the run, in characters."""

    def compute(scores: list[SampleScore]) -> float:
        return max((float(item.score.value) for item in scores), default=0.0)

    return compute


@scorer(metrics=[longest()])
def answer_length() -> Scorer:
    async def score(state: TaskState, target: Target) -> Score:
        answer = state.output.completion
        return Score(
            value=len(answer), answer=answer, explanation=f"{len(answer)} characters"
        )

    return score


def _scripted(messages, tools, tool_choice, config) -> ModelOutput:
    """A model that calls the tool, then says what it answered. No provider, no key."""
    answered = [item for item in messages if item.role == "tool"]
    if answered:
        return ModelOutput.from_content(
            "mockllm/model", f"The answer is {answered[-1].text}"
        )
    asked = next(item.text for item in messages if item.role == "user")
    first, second = re.findall(r"\d+", asked)[:2]
    return ModelOutput.for_tool_call(
        "mockllm/model", "add", {"x": int(first), "y": int(second)}
    )


def scripted_model():
    return get_model("mockllm/model", custom_outputs=_scripted)


__all__ = ["add", "answer_length", "ask_to_use_the_tool", "scripted_model"]
