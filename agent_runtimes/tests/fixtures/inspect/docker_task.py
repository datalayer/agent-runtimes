# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The same fixture in Inspect's Docker sandbox, on a real provider.

    inspect eval docker_task.py@arithmetic_in_docker --model anthropic/claude-haiku-4-5 --log-format json

It needs a Docker Engine and a model key, so it is not part of the mock run.
"""

from __future__ import annotations

from pathlib import Path

from extras import answer_length
from inspect_ai import Task, task
from inspect_ai.dataset import json_dataset
from inspect_ai.scorer import includes
from inspect_ai.solver import generate, system_message, use_tools
from inspect_ai.tool import bash

HERE = Path(__file__).parent


@task
def arithmetic_in_docker() -> Task:
    return Task(
        dataset=json_dataset(str(HERE / "data" / "samples.jsonl")),
        solver=[system_message("Compute with the bash tool, then answer with the number only."), use_tools(bash(timeout=30)), generate()],
        scorer=[includes(), answer_length()],
        sandbox=("docker", str(HERE / "compose.yaml")),
    )
