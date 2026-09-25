#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Generate example sandbox agent specs for each sandbox variant.

This keeps sandbox demonstration specs aligned with supported sandbox variants
so examples can offer a consistent variant picker.
"""

from __future__ import annotations

import argparse
from pathlib import Path

# Variant → the short key its spec goes by, so the ids stay the ones the
# examples and the code-sandboxes capacity plugins already name.
VARIANTS: dict[str, str] = {
    "eval": "eval",
    "jupyter-server": "jupyter",
    "docker": "docker",
    "datalayer": "datalayer",
    "google-colab": "colab",
    "kaggle": "kaggle",
    "monty": "monty",
    "modal": "modal",
}

_TITLES = {
    "eval": "Eval",
    "jupyter-server": "Jupyter",
    "docker": "Docker",
    "datalayer": "Datalayer",
    "google-colab": "Colab",
    "kaggle": "Kaggle",
    "monty": "Monty",
    "modal": "Modal",
}

_WHERE = {
    "eval": "in this server's own Python process",
    "jupyter-server": "in a Jupyter kernel the server starts beside itself",
    "docker": "in a container",
    "datalayer": "on a Datalayer runtime in the cloud",
    "google-colab": "on a Google Colab runtime",
    "kaggle": "on a Kaggle kernel",
    "monty": "in the Monty interpreter, a restricted in-process sandbox",
    "modal": "on a Modal cloud sandbox",
}


def _content_for_variant(variant: str) -> str:
    key = VARIANTS[variant]
    title = _TITLES[variant]
    where = _WHERE[variant]
    spec_id = f"example-sandbox-{key}"
    return f"""# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Agent Specification: Sandbox Variant ({variant})
# Scaffolded by scripts/codegen/generate_sandbox_agents.py — edit the template
# there, not this file. Used by AgentCodeSandboxesExample.

id: {spec_id}
version: 0.0.1
name: Example Sandbox {title} Agent
description: >-
  Demonstrates the '{variant}' code sandbox: Python the agent runs through
  execute_code executes {where}.

tags:
  - sandbox
  - code-execution
  - {key}

enabled: true
model: "bedrock:us.anthropic.claude-sonnet-4-6"
harness: pydantic-ai

sandbox_variant: {variant}
memory: ephemeral

mcp_servers: []

skills: []

tools: []

frontend_tools: []

environment_name: ai-agents-env

icon: package
emoji: "📦"
color: "#1F6FEB"

suggestions:
  # First: proof of where the code runs — the point of a variant.
  - text: >-
      Run Python that prints platform.platform(), sys.version and
      os.getenv("DATALAYER_CODE_SANDBOX_VARIANT"), and tell me where this
      code ran.
    summary: "Where does my code run?"
  - text: "Run Python that prints sum(i*i for i in range(20))."
    summary: "Sum of squares"
  - text: >-
      Run Python that builds a small pandas DataFrame of three cities and
      their populations and prints it sorted by population.
    summary: "Small DataFrame"

welcome_message: >-
  You're connected to the {variant} sandbox. Ask me to run Python: it
  executes {where}.

system_prompt: >-
  You are the {title} sandbox example agent. Any computation, script or
  check the person asks for is done by running Python in the sandbox with
  `execute_code` — never by working it out yourself. Run the code, report
  what it printed, briefly, and when asked where the code ran, answer from
  what the code printed. Answer in the conversation, and only with the
  tools you actually have; never call a tool you were not given.

system_prompt_codemode_addons: null

welcome_notebook: null
welcome_document: null

trigger: null
"""


def generate_specs(agents_dir: Path) -> int:
    agents_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for variant, key in VARIANTS.items():
        path = agents_dir / f"example-sandbox-{key}.yaml"
        path.write_text(_content_for_variant(variant), encoding="utf-8")
        count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate example sandbox agentspec files by sandbox variant."
    )
    parser.add_argument(
        "--agents-dir",
        type=Path,
        required=True,
        help="Path to agentspecs/agents directory.",
    )
    args = parser.parse_args()

    generated = generate_specs(args.agents_dir)
    print(f"Generated {generated} sandbox variant agentspec files in {args.agents_dir}")


if __name__ == "__main__":
    main()
