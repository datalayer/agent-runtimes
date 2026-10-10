#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML strategy specifications.

A *strategy* is the control loop an agent reasons with: how it progresses from
one decision to the next (observe/think/act/evaluate), the objective it works
toward, the constraints and success criteria that bound it, where state lives
between iterations, how the human participates, and when it terminates.

Usage:
    python generate_strategies.py \\
      --specs-dir agentspecs/agentspecs/strategies \\
      --python-output agent_runtimes/specs/strategies.py \\
      --typescript-output src/specs/strategies.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


def _make_const_name(strategy_id: str) -> str:
    """Convert a strategy ID to a constant name (e.g., 'ooda' -> 'OODA_STRATEGY')."""
    return f"{strategy_id.upper().replace('-', '_')}_STRATEGY"


def _make_enum_name(strategy_id: str) -> str:
    """Convert a strategy ID to an enum member name (e.g., 'data-analysis' -> 'DATA_ANALYSIS')."""
    return strategy_id.upper().replace("-", "_")


def _clean(text: str) -> str:
    """Collapse whitespace in a multi-line YAML string."""
    return " ".join(str(text or "").split()).strip()


def _py_str(text: str) -> str:
    """Format a Python double-quoted string literal."""
    return '"' + _clean(text).replace("\\", "\\\\").replace('"', '\\"') + '"'


def _py_list(items: list) -> str:
    """Format a Python list of strings."""
    if not items:
        return "[]"
    return "[" + ", ".join(_py_str(item) for item in items) + "]"


def _ts_str(text: str) -> str:
    """Format a TypeScript single-quoted string literal."""
    return "'" + _clean(text).replace("\\", "\\\\").replace("'", "\\'") + "'"


def _ts_list(items: list) -> str:
    """Format a TypeScript list of strings."""
    if not items:
        return "[]"
    return "[" + ", ".join(_ts_str(item) for item in items) + "]"


def load_strategy_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all strategy YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from strategy specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Strategy Catalog.",
        "",
        "Predefined agent reasoning strategies (control loops) that agents can use.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from enum import Enum",
        "from typing import Optional",
        "",
        "from agent_runtimes.types import StrategyHuman, StrategySpec, StrategyTermination",
        "",
        "",
        "# " + "=" * 76,
        "# Strategies Enum",
        "# " + "=" * 76,
        "",
        "",
        "class Strategies(str, Enum):",
        '    """Enumeration of available agent reasoning strategies."""',
        "",
    ]

    for spec in specs:
        lines.append(f'    {_make_enum_name(spec["id"])} = "{spec["id"]}"')

    lines.extend(
        [
            "",
            "",
            "# " + "=" * 76,
            "# Strategy Definitions",
            "# " + "=" * 76,
            "",
        ]
    )

    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)

        lines.append(f"{const_name} = StrategySpec(")
        lines.append(f'    id="{spec["id"]}",')
        lines.append(f'    version="{version}",')
        lines.append(f'    name="{spec["name"]}",')
        lines.append(f"    description={_py_str(spec.get('description', ''))},")
        lines.append(f"    objective={_py_str(spec.get('objective', ''))},")
        lines.append(
            f"    strategy={_py_str(spec.get('strategy', 'observe-think-act-evaluate'))},"
        )
        lines.append(f"    phases={_py_list(spec.get('phases', []))},")
        lines.append(f"    constraints={_py_list(spec.get('constraints', []))},")

        term = spec.get("termination")
        if term:
            lines.append("    termination=StrategyTermination(")
            lines.append(
                f"        max_iterations={int(term.get('max_iterations', 10))},"
            )
            lines.append(
                f"        success_criteria={_py_list(term.get('success_criteria', []))},"
            )
            lines.append(
                f"        failure_criteria={_py_list(term.get('failure_criteria', []))},"
            )
            lines.append(
                f"        on_blocked={_py_str(term.get('on_blocked', 'ask-human'))},"
            )
            lines.append("    ),")

        human = spec.get("human")
        if human:
            lines.append("    human=StrategyHuman(")
            lines.append(f"        mode={_py_str(human.get('mode', 'initiate'))},")
            lines.append(
                f"        approval_required={bool(human.get('approval_required', False))},"
            )
            lines.append(
                f"        approval_for={_py_list(human.get('approval_for', []))},"
            )
            lines.append(
                f"        description={_py_str(human.get('description', ''))},"
            )
            lines.append("    ),")

        lines.append(f"    state_backends={_py_list(spec.get('state_backends', []))},")
        lines.append(f"    tags={_py_list(spec.get('tags', []))},")
        lines.append(f"    icon={_py_str(spec.get('icon', 'sync'))},")
        lines.append(f"    emoji={_py_str(spec.get('emoji', '🔄'))},")
        lines.append(")")
        lines.append("")

    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# Strategy Catalog",
            "# " + "=" * 76,
            "",
            "STRATEGY_CATALOGUE: dict[str, StrategySpec] = {",
        ]
    )

    for spec in specs:
        const_name = _make_const_name(spec["id"]) + version_suffix(spec["version"])
        lines.append(f'    "{spec["id"]}": {const_name},')

    lines.extend(
        [
            "}",
            "",
            "",
            'DEFAULT_STRATEGY: str = "data-analysis"',
            "",
            "",
            "def get_strategy(strategy_id: str) -> Optional[StrategySpec]:",
            '    """',
            "    Get a strategy specification by ID (accepts both bare and versioned refs).",
            "",
            "    Args:",
            "        strategy_id: The unique identifier of the strategy.",
            "",
            "    Returns:",
            "        The StrategySpec, or None if not found.",
            '    """',
            "    strategy = STRATEGY_CATALOGUE.get(strategy_id)",
            "    if strategy is not None:",
            "        return strategy",
            "    base, _, ver = strategy_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return STRATEGY_CATALOGUE.get(base)",
            "    return None",
            "",
            "",
            "def get_default_strategy() -> Optional[StrategySpec]:",
            '    """',
            "    Get the default strategy.",
            "",
            "    Returns:",
            "        The default StrategySpec, or None if no default is set.",
            '    """',
            "    return STRATEGY_CATALOGUE.get(DEFAULT_STRATEGY)",
            "",
            "",
            "def list_strategies() -> list[StrategySpec]:",
            '    """',
            "    List all available strategies.",
            "",
            "    Returns:",
            "        List of all StrategySpec specifications.",
            '    """',
            "    return list(STRATEGY_CATALOGUE.values())",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from strategy specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Strategy Catalog",
        " *",
        " * Predefined agent reasoning strategies (control loops).",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { StrategySpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Strategies Enum",
        "// " + "=" * 76,
        "",
        "export const Strategies = {",
    ]

    for spec in specs:
        lines.append(f"  {_make_enum_name(spec['id'])}: '{spec['id']}',")

    lines.extend(
        [
            "} as const;",
            "",
            "export type StrategyId = (typeof Strategies)[keyof typeof Strategies];",
            "",
            "// " + "=" * 76,
            "// Strategy Definitions",
            "// " + "=" * 76,
            "",
        ]
    )

    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)

        lines.append(f"export const {const_name}: StrategySpec = {{")
        lines.append(f"  id: '{spec['id']}',")
        lines.append(f"  version: '{version}',")
        lines.append(f"  name: {_ts_str(spec['name'])},")
        lines.append(f"  description: {_ts_str(spec.get('description', ''))},")
        lines.append(f"  objective: {_ts_str(spec.get('objective', ''))},")
        lines.append(
            f"  strategy: {_ts_str(spec.get('strategy', 'observe-think-act-evaluate'))},"
        )
        lines.append(f"  phases: {_ts_list(spec.get('phases', []))},")
        lines.append(f"  constraints: {_ts_list(spec.get('constraints', []))},")

        term = spec.get("termination")
        if term:
            lines.append("  termination: {")
            lines.append(f"    maxIterations: {int(term.get('max_iterations', 10))},")
            lines.append(
                f"    successCriteria: {_ts_list(term.get('success_criteria', []))},"
            )
            lines.append(
                f"    failureCriteria: {_ts_list(term.get('failure_criteria', []))},"
            )
            lines.append(
                f"    onBlocked: {_ts_str(term.get('on_blocked', 'ask-human'))},"
            )
            lines.append("  },")

        human = spec.get("human")
        if human:
            lines.append("  human: {")
            lines.append(f"    mode: {_ts_str(human.get('mode', 'initiate'))},")
            lines.append(
                f"    approvalRequired: {str(bool(human.get('approval_required', False))).lower()},"
            )
            lines.append(f"    approvalFor: {_ts_list(human.get('approval_for', []))},")
            lines.append(f"    description: {_ts_str(human.get('description', ''))},")
            lines.append("  },")

        lines.append(f"  stateBackends: {_ts_list(spec.get('state_backends', []))},")
        lines.append(f"  tags: {_ts_list(spec.get('tags', []))},")
        lines.append(f"  icon: {_ts_str(spec.get('icon', 'sync'))},")
        lines.append(f"  emoji: {_ts_str(spec.get('emoji', '🔄'))},")
        lines.append("};")
        lines.append("")

    lines.extend(
        [
            "// " + "=" * 76,
            "// Strategy Catalog",
            "// " + "=" * 76,
            "",
            "export const STRATEGY_CATALOGUE: Record<string, StrategySpec> = {",
        ]
    )

    for spec in specs:
        const_name = _make_const_name(spec["id"]) + version_suffix(spec["version"])
        lines.append(f"  '{spec['id']}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export const DEFAULT_STRATEGY: StrategyId = Strategies.DATA_ANALYSIS;",
            "",
            "function resolveStrategyId(strategyId: string): string {",
            "  if (strategyId in STRATEGY_CATALOGUE) return strategyId;",
            "  const idx = strategyId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = strategyId.slice(0, idx);",
            "    if (base in STRATEGY_CATALOGUE) return base;",
            "  }",
            "  return strategyId;",
            "}",
            "",
            "/**",
            " * Get a strategy specification by ID.",
            " */",
            "export function getStrategy(strategyId: string): StrategySpec | undefined {",
            "  return STRATEGY_CATALOGUE[resolveStrategyId(strategyId)];",
            "}",
            "",
            "/**",
            " * Get the default strategy.",
            " */",
            "export function getDefaultStrategy(): StrategySpec | undefined {",
            "  return STRATEGY_CATALOGUE[DEFAULT_STRATEGY];",
            "}",
            "",
            "/**",
            " * List all available strategies.",
            " */",
            "export function listStrategies(): StrategySpec[] {",
            "  return Object.values(STRATEGY_CATALOGUE);",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML strategy specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing YAML strategy specification files",
    )
    parser.add_argument(
        "--python-output",
        type=Path,
        required=True,
        help="Output path for generated Python file",
    )
    parser.add_argument(
        "--typescript-output",
        type=Path,
        required=True,
        help="Output path for generated TypeScript file",
    )

    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading strategy specs from {args.specs_dir}...")
    specs = load_strategy_specs(args.specs_dir)
    print(f"Loaded {len(specs)} strategy specifications")

    print("Generating Python code...")
    python_code = generate_python_code(specs)
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(python_code)
    print(f"✓ Generated {args.python_output}")

    print("Generating TypeScript code...")
    typescript_code = generate_typescript_code(specs)
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(typescript_code)
    print(f"✓ Generated {args.typescript_output}")

    print(f"\n✓ Successfully generated code from {len(specs)} strategy specs")


if __name__ == "__main__":
    main()
