#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML loop specifications.

A *loop* describes how an agent progresses from one decision to the next: the
control cycle (observe/think/act/evaluate), the objective it works toward, the
constraints and success criteria that bound it, where state lives between
iterations, how the human participates, and when the loop terminates.

Usage:
    python generate_loops.py \\
      --specs-dir agentspecs/agentspecs/loops \\
      --python-output agent_runtimes/specs/loops.py \\
      --typescript-output src/specs/loops.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


def _make_const_name(loop_id: str) -> str:
    """Convert a loop ID to a constant name (e.g., 'ooda' -> 'OODA_LOOP')."""
    return f"{loop_id.upper().replace('-', '_')}_LOOP"


def _make_enum_name(loop_id: str) -> str:
    """Convert a loop ID to an enum member name (e.g., 'data-analysis' -> 'DATA_ANALYSIS')."""
    return loop_id.upper().replace("-", "_")


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


def load_loop_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all loop YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from loop specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Loop Catalog.",
        "",
        "Predefined agent execution-loop specifications that can be used by agents.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from enum import Enum",
        "from typing import Optional",
        "",
        "from agent_runtimes.types import LoopHuman, LoopSpec, LoopTermination",
        "",
        "",
        "# " + "=" * 76,
        "# Loops Enum",
        "# " + "=" * 76,
        "",
        "",
        "class Loops(str, Enum):",
        '    """Enumeration of available agent execution loops."""',
        "",
    ]

    for spec in specs:
        lines.append(f'    {_make_enum_name(spec["id"])} = "{spec["id"]}"')

    lines.extend(
        [
            "",
            "",
            "# " + "=" * 76,
            "# Loop Definitions",
            "# " + "=" * 76,
            "",
        ]
    )

    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)

        lines.append(f"{const_name} = LoopSpec(")
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
            lines.append("    termination=LoopTermination(")
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
            lines.append("    human=LoopHuman(")
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
            "# Loop Catalog",
            "# " + "=" * 76,
            "",
            "LOOP_CATALOGUE: dict[str, LoopSpec] = {",
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
            'DEFAULT_LOOP: str = "data-analysis"',
            "",
            "",
            "def get_loop(loop_id: str) -> Optional[LoopSpec]:",
            '    """',
            "    Get a loop specification by ID (accepts both bare and versioned refs).",
            "",
            "    Args:",
            "        loop_id: The unique identifier of the loop.",
            "",
            "    Returns:",
            "        The LoopSpec, or None if not found.",
            '    """',
            "    loop = LOOP_CATALOGUE.get(loop_id)",
            "    if loop is not None:",
            "        return loop",
            "    base, _, ver = loop_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return LOOP_CATALOGUE.get(base)",
            "    return None",
            "",
            "",
            "def get_default_loop() -> Optional[LoopSpec]:",
            '    """',
            "    Get the default loop.",
            "",
            "    Returns:",
            "        The default LoopSpec, or None if no default is set.",
            '    """',
            "    return LOOP_CATALOGUE.get(DEFAULT_LOOP)",
            "",
            "",
            "def list_loops() -> list[LoopSpec]:",
            '    """',
            "    List all available loops.",
            "",
            "    Returns:",
            "        List of all LoopSpec specifications.",
            '    """',
            "    return list(LOOP_CATALOGUE.values())",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from loop specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Loop Catalog",
        " *",
        " * Predefined agent execution-loop specifications.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { LoopSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Loops Enum",
        "// " + "=" * 76,
        "",
        "export const Loops = {",
    ]

    for spec in specs:
        lines.append(f"  {_make_enum_name(spec['id'])}: '{spec['id']}',")

    lines.extend(
        [
            "} as const;",
            "",
            "export type LoopId = (typeof Loops)[keyof typeof Loops];",
            "",
            "// " + "=" * 76,
            "// Loop Definitions",
            "// " + "=" * 76,
            "",
        ]
    )

    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)

        lines.append(f"export const {const_name}: LoopSpec = {{")
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
            "// Loop Catalog",
            "// " + "=" * 76,
            "",
            "export const LOOP_CATALOGUE: Record<string, LoopSpec> = {",
        ]
    )

    for spec in specs:
        const_name = _make_const_name(spec["id"]) + version_suffix(spec["version"])
        lines.append(f"  '{spec['id']}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export const DEFAULT_LOOP: LoopId = Loops.DATA_ANALYSIS;",
            "",
            "function resolveLoopId(loopId: string): string {",
            "  if (loopId in LOOP_CATALOGUE) return loopId;",
            "  const idx = loopId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = loopId.slice(0, idx);",
            "    if (base in LOOP_CATALOGUE) return base;",
            "  }",
            "  return loopId;",
            "}",
            "",
            "/**",
            " * Get a loop specification by ID.",
            " */",
            "export function getLoop(loopId: string): LoopSpec | undefined {",
            "  return LOOP_CATALOGUE[resolveLoopId(loopId)];",
            "}",
            "",
            "/**",
            " * Get the default loop.",
            " */",
            "export function getDefaultLoop(): LoopSpec | undefined {",
            "  return LOOP_CATALOGUE[DEFAULT_LOOP];",
            "}",
            "",
            "/**",
            " * List all available loops.",
            " */",
            "export function listLoops(): LoopSpec[] {",
            "  return Object.values(LOOP_CATALOGUE);",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML loop specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing YAML loop specification files",
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

    print(f"Loading loop specs from {args.specs_dir}...")
    specs = load_loop_specs(args.specs_dir)
    print(f"Loaded {len(specs)} loop specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} loop specs")


if __name__ == "__main__":
    main()
