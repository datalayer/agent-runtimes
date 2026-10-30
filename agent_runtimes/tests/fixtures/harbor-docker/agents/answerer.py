# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A custom agent: it asks its model and writes what it said in the task's image.

It knows one address, the one its sandbox gives it, and holds no key.
"""

from __future__ import annotations

import asyncio
import json
import os
import shlex
import urllib.request

from harbor.agents.base import BaseAgent


def _ask(model: str, instruction: str) -> dict:
    request = urllib.request.Request(
        f"{os.environ['DATALAYER_BASE_URL']}/chat/completions",
        data=json.dumps(
            {"model": model, "messages": [{"role": "user", "content": instruction}]}
        ).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ['DATALAYER_API_KEY']}",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as answer:
        return json.load(answer)


class Answerer(BaseAgent):
    """Asks once, and leaves the answer where the task's verifier looks."""

    @staticmethod
    def name() -> str:
        """Name the agent."""
        return "answerer"

    def version(self) -> str:
        """Say its version."""
        return "1"

    async def setup(self, environment) -> None:
        """Need nothing."""

    async def run(self, instruction, environment, context) -> None:
        """Ask, and write the answer in the environment."""
        answer = await asyncio.to_thread(_ask, self.model_name, instruction)
        text = answer["choices"][0]["message"]["content"]
        usage = answer.get("usage") or {}
        context.n_input_tokens = usage.get("prompt_tokens")
        context.n_output_tokens = usage.get("completion_tokens")
        written = (
            f"mkdir -p /workspace /logs/artifacts && printf %s {shlex.quote(text)} "
            "> /workspace/answer.txt && cp /workspace/answer.txt /logs/artifacts/answer.txt"
        )
        await environment.exec(written)
