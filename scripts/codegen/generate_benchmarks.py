#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML benchmark specifications.

Usage:
    python generate_benchmarks.py \
      --specs-dir specs/benchmarks \
    --eval-specs-dir specs/evals \
      --python-output agent_runtimes/specs/benchmarks.py \
      --typescript-output src/specs/benchmarks.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


ALLOWED_BENCHMARK_CATEGORIES = {
    "Coding",
    "Knowledge",
    "Reasoning",
    "Agentic",
    "Safety",
}

ALLOWED_DIFFICULTY = {"easy", "medium", "hard", "expert"}

ALLOWED_DATASET_SOURCE = {"hosted", "local", "hybrid"}

ALLOWED_DATASET_EDITABILITY = {"read-only", "editable"}

ALLOWED_SDK_SUPPORT = {"none", "experimental", "stable"}

ALLOWED_EVALUATOR_SHAPES = {
    "pass_rate",
    "numeric",
    "categorical",
    "error_only",
}


def _required_str(spec: dict[str, Any], key: str) -> str:
    """Return required non-empty string key or raise with actionable context."""
    value = spec.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(
            f"Invalid benchmark spec '{spec.get('id', '<unknown>')}': missing required field '{key}'"
        )
    return value.strip()


def _required_int(spec: dict[str, Any], key: str) -> int:
    """Return required integer key or raise with actionable context."""
    value = spec.get(key)
    if not isinstance(value, int):
        raise ValueError(
            f"Invalid benchmark spec '{spec.get('id', '<unknown>')}': field '{key}' must be an integer"
        )
    return value


def _normalize_eval_ref(eval_ref: str) -> str:
    """Normalize evaluator references from id:version to base id."""
    if ":" not in eval_ref:
        return eval_ref
    base, _, suffix = eval_ref.rpartition(":")
    if base and "." in suffix:
        return base
    return eval_ref


def _required_string_list(spec: dict[str, Any], key: str) -> list[str]:
    """Return required non-empty list of strings or raise."""
    value = spec.get(key)
    if not isinstance(value, list) or not value:
        raise ValueError(
            f"Invalid benchmark spec '{spec.get('id', '<unknown>')}': missing required non-empty field '{key}'"
        )
    if not all(isinstance(item, str) and item.strip() for item in value):
        raise ValueError(
            f"Invalid benchmark spec '{spec.get('id', '<unknown>')}': field '{key}' must contain non-empty strings"
        )
    return [item.strip() for item in value]


def _validate_benchmark_spec(
    spec: dict[str, Any], eval_ids: set[str]
) -> dict[str, Any]:
    """Validate benchmark spec fields and evaluator dependencies."""
    spec_id = str(spec.get("id") or "<unknown>")
    category = _required_str(spec, "category")
    task_count = _required_int(spec, "task_count")
    metric = _required_str(spec, "metric")
    difficulty = str(spec.get("difficulty", "medium"))
    dataset_source = str(spec.get("dataset_source", "local"))
    dataset_editability = str(spec.get("dataset_editability", "read-only"))
    sdk_support = str(spec.get("sdk_support", "experimental"))
    evaluators = _required_string_list(spec, "evaluators")
    evaluator_shapes = spec.get("evaluator_shapes", [])

    if category not in ALLOWED_BENCHMARK_CATEGORIES:
        raise ValueError(
            f"Invalid benchmark spec '{spec_id}': category '{category}' not in {sorted(ALLOWED_BENCHMARK_CATEGORIES)}"
        )
    if task_count < 0:
        raise ValueError(
            f"Invalid benchmark spec '{spec_id}': task_count must be >= 0"
        )
    if not metric:
        raise ValueError(f"Invalid benchmark spec '{spec_id}': metric is required")
    if difficulty not in ALLOWED_DIFFICULTY:
        raise ValueError(
            f"Invalid benchmark spec '{spec_id}': difficulty '{difficulty}' not in {sorted(ALLOWED_DIFFICULTY)}"
        )
    if dataset_source not in ALLOWED_DATASET_SOURCE:
        raise ValueError(
            f"Invalid benchmark spec '{spec_id}': dataset_source '{dataset_source}' not in {sorted(ALLOWED_DATASET_SOURCE)}"
        )
    if dataset_editability not in ALLOWED_DATASET_EDITABILITY:
        raise ValueError(
            f"Invalid benchmark spec '{spec_id}': dataset_editability '{dataset_editability}' not in {sorted(ALLOWED_DATASET_EDITABILITY)}"
        )
    if sdk_support not in ALLOWED_SDK_SUPPORT:
        raise ValueError(
            f"Invalid benchmark spec '{spec_id}': sdk_support '{sdk_support}' not in {sorted(ALLOWED_SDK_SUPPORT)}"
        )
    if not isinstance(evaluator_shapes, list):
        raise ValueError(
            f"Invalid benchmark spec '{spec_id}': evaluator_shapes must be a list"
        )
    for shape in evaluator_shapes:
        if shape not in ALLOWED_EVALUATOR_SHAPES:
            raise ValueError(
                f"Invalid benchmark spec '{spec_id}': evaluator_shapes item '{shape}' not in {sorted(ALLOWED_EVALUATOR_SHAPES)}"
            )
    for evaluator_ref in evaluators:
        evaluator_id = _normalize_eval_ref(evaluator_ref)
        if evaluator_id not in eval_ids:
            raise ValueError(
                f"Invalid benchmark spec '{spec_id}': evaluator '{evaluator_ref}' not found in eval specs"
            )

    return {
        "category": category,
        "task_count": task_count,
        "metric": metric,
        "difficulty": difficulty,
        "dataset_source": dataset_source,
        "dataset_editability": dataset_editability,
        "sdk_support": sdk_support,
        "evaluators": evaluators,
        "evaluator_shapes": evaluator_shapes,
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


def generate_python_code(specs: list[dict[str, Any]], eval_ids: set[str]) -> str:
    """Generate Python code from benchmark specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Benchmark Catalog.",
        "",
        "Predefined evaluation benchmark configurations.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List",
        "",
        "from agent_runtimes.types import BenchmarkSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Benchmark Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        benchmark_id = spec["id"]
        version = spec["version"]
        validated = _validate_benchmark_spec(spec, eval_ids)
        const_name = f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))

        lines.extend(
            [
                f"{const_name} = BenchmarkSpec(",
                f'    id="{benchmark_id}",',
                f'    version="{version}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    category="{validated["category"]}",',
                f"    task_count={validated['task_count']},",
                f'    metric="{validated["metric"]}",',
                f'    source="{spec.get("source", "")}",',
                f'    difficulty="{validated["difficulty"]}",',
                f"    languages={_fmt_list(spec.get('languages', []))},",
                f'    dataset_source="{validated["dataset_source"]}",',
                f"    supports_live_monitoring={str(spec.get('supports_live_monitoring', False))},",
                f"    supports_experiment_comparison={str(spec.get('supports_experiment_comparison', True))},",
                f"    evaluator_shapes={_fmt_list(validated['evaluator_shapes'])},",
                f"    evaluators={_fmt_list(validated['evaluators'])},",
                f"    recommended_windows={_fmt_list(spec.get('recommended_windows', ['1h', '6h', '24h', '7d', '30d']))},",
                f"    trace_integration={str(spec.get('trace_integration', True))},",
                f'    dataset_editability="{validated["dataset_editability"]}",',
                f'    sdk_support="{validated["sdk_support"]}",',
                ")",
                "",
            ]
        )

    lines.extend(
        [
            "# " + "=" * 76,
            "# Benchmark Catalog",
            "# " + "=" * 76,
            "",
            "BENCHMARK_CATALOG: Dict[str, BenchmarkSpec] = {",
        ]
    )
    for spec in specs:
        benchmark_id = spec["id"]
        version = spec["version"]
        const_name = f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        lines.append(f'    "{benchmark_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_benchmark_spec(benchmark_id: str) -> BenchmarkSpec | None:",
            '    """Get a benchmark specification by ID (accepts both bare and versioned refs)."""',
            "    spec = BENCHMARK_CATALOG.get(benchmark_id)",
            "    if spec is not None:",
            "        return spec",
            "    base, _, ver = benchmark_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return BENCHMARK_CATALOG.get(base)",
            "    return None",
            "",
            "",
            "def list_benchmark_specs() -> List[BenchmarkSpec]:",
            '    """List all benchmark specifications."""',
            "    return list(BENCHMARK_CATALOG.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]], eval_ids: set[str]) -> str:
    """Generate TypeScript code from benchmark specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Benchmark Catalog",
        " *",
        " * Predefined evaluation benchmark configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { BenchmarkSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Benchmark Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        benchmark_id = spec["id"]
        version = spec["version"]
        validated = _validate_benchmark_spec(spec, eval_ids)
        const_name = f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))

        lines.extend(
            [
                f"export const {const_name}: BenchmarkSpec = {{",
                f"  id: '{benchmark_id}',",
                f"  version: '{version}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  category: '{validated['category']}',",
                f"  task_count: {validated['task_count']},",
                f"  metric: '{validated['metric']}',",
                f"  source: '{spec.get('source', '')}',",
                f"  difficulty: '{validated['difficulty']}',",
                f"  languages: {_ts_list(spec.get('languages', []))},",
                f"  dataset_source: '{validated['dataset_source']}',",
                f"  supports_live_monitoring: {str(spec.get('supports_live_monitoring', False)).lower()},",
                f"  supports_experiment_comparison: {str(spec.get('supports_experiment_comparison', True)).lower()},",
                f"  evaluator_shapes: {_ts_list(validated['evaluator_shapes'])},",
                f"  evaluators: {_ts_list(validated['evaluators'])},",
                f"  recommended_windows: {_ts_list(spec.get('recommended_windows', ['1h', '6h', '24h', '7d', '30d']))},",
                f"  trace_integration: {str(spec.get('trace_integration', True)).lower()},",
                f"  dataset_editability: '{validated['dataset_editability']}',",
                f"  sdk_support: '{validated['sdk_support']}',",
                "};",
                "",
            ]
        )

    lines.extend(
        [
            "// " + "=" * 76,
            "// Benchmark Catalog",
            "// " + "=" * 76,
            "",
            "export const BENCHMARK_CATALOG: Record<string, BenchmarkSpec> = {",
        ]
    )
    for spec in specs:
        benchmark_id = spec["id"]
        version = spec["version"]
        const_name = f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        lines.append(f"  '{benchmark_id}': {const_name},")
    lines.extend(
        [
            "};",
            "",
            "export function getBenchmarkSpecs(): BenchmarkSpec[] {",
            "  return Object.values(BENCHMARK_CATALOG);",
            "}",
            "",
            "function resolveBenchmarkId(benchmarkId: string): string {",
            "  if (benchmarkId in BENCHMARK_CATALOG) return benchmarkId;",
            "  const idx = benchmarkId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = benchmarkId.slice(0, idx);",
            "    if (base in BENCHMARK_CATALOG) return base;",
            "  }",
            "  return benchmarkId;",
            "}",
            "",
            "export function getBenchmarkSpec(benchmarkId: string): BenchmarkSpec | undefined {",
            "  return BENCHMARK_CATALOG[resolveBenchmarkId(benchmarkId)];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML benchmark specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--eval-specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)
    if not args.eval_specs_dir.exists():
        print(f"Error: Eval specs directory does not exist: {args.eval_specs_dir}")
        sys.exit(1)

    print(f"Loading benchmark specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} benchmark specifications")
    print(f"Loading eval specs from {args.eval_specs_dir}...")
    eval_specs = load_specs(args.eval_specs_dir)
    eval_ids = {
        str(spec["id"])
        for spec in eval_specs
        if isinstance(spec, dict) and isinstance(spec.get("id"), str)
    }
    if not eval_ids:
        print("Error: No eval specifications found for benchmark evaluator validation")
        sys.exit(1)

    print("Generating Python code...")
    python_code = generate_python_code(specs, eval_ids)
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(python_code)
    print(f"✓ Generated {args.python_output}")

    print("Generating TypeScript code...")
    typescript_code = generate_typescript_code(specs, eval_ids)
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(typescript_code)
    print(f"✓ Generated {args.typescript_output}")

    print(f"\n✓ Successfully generated code from {len(specs)} benchmark specs")


if __name__ == "__main__":
    main()
