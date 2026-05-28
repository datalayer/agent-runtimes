#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML eval specifications.

Usage:
    python generate_evals.py \
      --specs-dir specs/evals \
      --python-output agent_runtimes/specs/evals.py \
      --typescript-output src/specs/evals.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix

ALLOWED_EVAL_CATEGORIES = {
    "Comparison",
    "Type Validation",
    "Performance",
    "LLM-as-a-Judge",
    "Span-Based",
    "Report",
}

ALLOWED_EVALUATOR_TYPES = {"case", "report"}

ALLOWED_OUTPUT_KINDS = {
    "boolean",
    "boolean_with_reason",
    "score",
    "score_and_assertion",
    "report_table",
    "report_curve",
}


def _required_str(spec: dict[str, Any], key: str) -> str:
    """Return required non-empty string key or raise with actionable context."""
    value = spec.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"Invalid eval spec '{spec.get('id', '<unknown>')}': missing required field '{key}'"
        )
    return value.strip()


def _validate_eval_spec(spec: dict[str, Any]) -> dict[str, str]:
    """Validate required eval fields and return normalized values."""
    spec_id = str(spec.get("id") or "<unknown>")
    category = _required_str(spec, "category")
    evaluator_type = _required_str(spec, "evaluator_type").lower()
    pydantic_class = _required_str(spec, "pydantic_class")
    output_kind = _required_str(spec, "output_kind")

    if category not in ALLOWED_EVAL_CATEGORIES:
        raise ValueError(
            f"Invalid eval spec '{spec_id}': category '{category}' not in {sorted(ALLOWED_EVAL_CATEGORIES)}"
        )
    if evaluator_type not in ALLOWED_EVALUATOR_TYPES:
        raise ValueError(
            f"Invalid eval spec '{spec_id}': evaluator_type '{evaluator_type}' not in {sorted(ALLOWED_EVALUATOR_TYPES)}"
        )
    if output_kind not in ALLOWED_OUTPUT_KINDS:
        raise ValueError(
            f"Invalid eval spec '{spec_id}': output_kind '{output_kind}' not in {sorted(ALLOWED_OUTPUT_KINDS)}"
        )

    return {
        "category": category,
        "evaluator_type": evaluator_type,
        "pydantic_class": pydantic_class,
        "output_kind": output_kind,
    }


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def _ts_list(items: list[str]) -> str:
    """Format a list of strings for TypeScript."""
    if not items:
        return "[]"
    return "[" + ", ".join(f"'{item}'" for item in items) + "]"


def _esc(text: str) -> str:
    """Escape single quotes for TypeScript string literals."""
    return text.replace("'", "\\'")


def _esc_dq(text: str) -> str:
    """Escape double quotes for Python string literals."""
    return text.replace('"', '\\"')


def load_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all YAML specifications from a directory (including subdirectories)."""
    specs = []
    for yaml_file in sorted(specs_dir.rglob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from eval specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Eval Catalog.",
        "",
        "Predefined built-in evaluator configurations.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List",
        "",
        "from agent_runtimes.types import EvalSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Eval Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        eval_id = spec["id"]
        version = spec["version"]
        validated = _validate_eval_spec(spec)
        evaluator_type = validated["evaluator_type"]
        output_kind = validated["output_kind"]
        pydantic_class = validated["pydantic_class"]
        category = validated["category"]
        const_name = (
            f"{eval_id.upper().replace('-', '_')}_EVAL_SPEC{version_suffix(version)}"
        )
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))
        default_config = repr(spec.get("default_config", {}))

        lines.extend(
            [
                f"{const_name} = EvalSpec(",
                f'    id="{eval_id}",',
                f'    version="{version}",',
                f'    name="{_esc_dq(spec["name"])}",',
                f'    description="{desc}",',
                f'    category="{category}",',
                f'    evaluator_type="{evaluator_type}",',
                f'    pydantic_class="{pydantic_class}",',
                f'    output_kind="{output_kind}",',
                f'    cost_tier="{spec.get("cost_tier", "free")}",',
                f'    latency="{spec.get("latency", "instant")}",',
                f"    requires={_fmt_list(spec.get('requires', []))},",
                f'    source="{spec.get("source", "")}",',
                f"    default_config={default_config},",
                ")",
                "",
            ]
        )

    lines.extend(
        [
            "# " + "=" * 76,
            "# Eval Catalog",
            "# " + "=" * 76,
            "",
            "EVAL_CATALOG: Dict[str, EvalSpec] = {",
        ]
    )
    for spec in specs:
        eval_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{eval_id.upper().replace('-', '_')}_EVAL_SPEC{version_suffix(version)}"
        )
        lines.append(f'    "{eval_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_eval_spec(eval_id: str) -> EvalSpec | None:",
            '    """Get an eval specification by ID (accepts both bare and versioned refs)."""',
            "    spec = EVAL_CATALOG.get(eval_id)",
            "    if spec is not None:",
            "        return spec",
            "    base, _, ver = eval_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return EVAL_CATALOG.get(base)",
            "    return None",
            "",
            "",
            "def list_eval_specs() -> List[EvalSpec]:",
            '    """List all eval specifications."""',
            "    return list(EVAL_CATALOG.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from eval specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Eval Catalog",
        " *",
        " * Predefined built-in evaluator configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { EvalSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Eval Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        eval_id = spec["id"]
        version = spec["version"]
        validated = _validate_eval_spec(spec)
        evaluator_type = validated["evaluator_type"]
        output_kind = validated["output_kind"]
        pydantic_class = validated["pydantic_class"]
        category = validated["category"]
        const_name = (
            f"{eval_id.upper().replace('-', '_')}_EVAL_SPEC{version_suffix(version)}"
        )
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))
        default_config = json.dumps(spec.get("default_config", {}), ensure_ascii=True)

        lines.extend(
            [
                f"export const {const_name}: EvalSpec = {{",
                f"  id: '{eval_id}',",
                f"  version: '{version}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  category: '{category}',",
                f"  evaluator_type: '{evaluator_type}',",
                f"  pydantic_class: '{pydantic_class}',",
                f"  output_kind: '{output_kind}',",
                f"  cost_tier: '{spec.get('cost_tier', 'free')}',",
                f"  latency: '{spec.get('latency', 'instant')}',",
                f"  requires: {_ts_list(spec.get('requires', []))},",
                f"  source: '{spec.get('source', '')}',",
                f"  default_config: {default_config},",
                "};",
                "",
            ]
        )

    lines.extend(
        [
            "// " + "=" * 76,
            "// Eval Catalog",
            "// " + "=" * 76,
            "",
            "export const EVAL_CATALOG: Record<string, EvalSpec> = {",
        ]
    )
    for spec in specs:
        eval_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{eval_id.upper().replace('-', '_')}_EVAL_SPEC{version_suffix(version)}"
        )
        lines.append(f"  '{eval_id}': {const_name},")
    lines.extend(
        [
            "};",
            "",
            "export function getEvalSpecs(): EvalSpec[] {",
            "  return Object.values(EVAL_CATALOG);",
            "}",
            "",
            "function resolveEvalId(evalId: string): string {",
            "  if (evalId in EVAL_CATALOG) return evalId;",
            "  const idx = evalId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = evalId.slice(0, idx);",
            "    if (base in EVAL_CATALOG) return base;",
            "  }",
            "  return evalId;",
            "}",
            "",
            "export function getEvalSpec(evalId: string): EvalSpec | undefined {",
            "  return EVAL_CATALOG[resolveEvalId(evalId)];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML eval specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading eval specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} eval specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} eval specs")


if __name__ == "__main__":
    main()
