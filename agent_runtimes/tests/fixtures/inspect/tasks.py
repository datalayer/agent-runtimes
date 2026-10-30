# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Inspect AI compatibility fixture.

`arithmetic` reads a file-backed dataset, runs a multi-step solver with a tool
call, and scores with one built-in and one custom scorer. With `mock=true`, its
default, it runs on Inspect's own mock model, with no provider and no key:

    inspect eval tasks.py@arithmetic --log-format json

`-T mock=false --model <provider/model>` runs the same task on a real provider.
"""

from __future__ import annotations

from pathlib import Path

from extras import add, answer_length, ask_to_use_the_tool, scripted_model
from inspect_ai import Task, task
from inspect_ai.dataset import json_dataset
from inspect_ai.scorer import includes
from inspect_ai.solver import generate, system_message, use_tools

HERE = Path(__file__).parent


@task
def arithmetic(mock: bool = True) -> Task:
    return Task(
        dataset=json_dataset(str(HERE / "data" / "samples.jsonl")),
        solver=[system_message("You are careful with sums."), ask_to_use_the_tool(), use_tools(add()), generate()],
        scorer=[includes(), answer_length()],
        model=scripted_model() if mock else None,
    )
