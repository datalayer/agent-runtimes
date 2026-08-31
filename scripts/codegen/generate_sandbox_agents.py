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

VARIANTS: tuple[str, ...] = (
    "eval",
    "jupyter-server",
    "docker",
    "datalayer",
    "google-colab",
    "kaggle",
    "monty",
    "modal",
)


def _emoji_for_variant(variant: str) -> str:
    mapping = {
        "eval": "A",
        "jupyter": "B",
        "docker": "C",
        "datalayer": "D",
        "colab": "E",
        "kaggle": "H",
        "monty": "F",
        "modal": "G",
    }
    return mapping.get(variant, "A")


def _content_for_variant(variant: str) -> str:
    variant_title = variant.capitalize()
    spec_id = f"example-sandbox-{variant}"
    emoji = _emoji_for_variant(variant)

    return f"""# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Agent Specification: Sandbox Variant ({variant})

id: {spec_id}
version: 0.0.1
name: Example Sandbox {variant_title} Agent
description: >-
  Demonstration agent configured to run codemode code execution with the
  '{variant}' sandbox variant.

tags:
  - sandbox
  - codemode
  - {variant}

enabled: true
model: "bedrock:us.anthropic.claude-sonnet-4-6"
harness: pydantic-ai

sandbox_variant: {variant}
memory: ephemeral

mcp_servers:
  - tavily:0.0.1

skills:
  - events:0.0.1

tools:
  - runtime-echo:0.0.1

frontend_tools:
  - jupyter-notebook:0.0.1
  - lexical-document:0.0.1

environment_name: ai-agents-env

icon: package
emoji: "{emoji}"
color: "#1F6FEB"

suggestions:
  - "Use execute_code to print('sandbox variant: {variant}')"
  - "Use execute_code to compute sum(i*i for i in range(20))"
  - "Use execute_code to load pandas and build a small DataFrame"

welcome_message: >-
  You're connected to the {variant} sandbox variant demo. Ask me to run
  Python code and I will use execute_code in codemode.

system_prompt: >-
  You are a sandbox-variant demonstration assistant. Prefer executing
  Python code via execute_code for computations, data checks, and quick
  experiments, then summarize results clearly.

system_prompt_codemode_addons: >-
  Always use execute_code when the user requests calculations, scripts,
  DataFrame operations, package checks, or shell-style diagnostics.

codemode:
  enabled: true
  token_reduction: "~80%"
  speedup: "~1.5x"

welcome_notebook: null
welcome_document: null
trigger: null
"""


def generate_specs(agents_dir: Path) -> int:
    agents_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for variant in VARIANTS:
        path = agents_dir / f"example-sandbox-{variant}.yaml"
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
