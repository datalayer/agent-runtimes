#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML benchmark specifications.

Usage:
    python generate_benchmarks.py \
      --specs-dir specs/benchmarks \
      --python-output agent_runtimes/specs/benchmarks.py \
      --typescript-output src/specs/benchmarks.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'\"{item}\"' for item in items) + "]"


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
        const_name = (
            f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        )
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))

        lines.extend(
            [
                f"{const_name} = BenchmarkSpec(",
                f'    id="{benchmark_id}",',
                f'    version="{version}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    category="{spec["category"]}",',
                f"    task_count={spec['task_count']},",
                f'    metric="{spec["metric"]}",',
                f'    source="{spec.get("source", "")}",',
                f'    difficulty="{spec.get("difficulty", "medium")}",',
                f"    languages={_fmt_list(spec.get('languages', []))},",
                f'    dataset_source="{spec.get("dataset_source", "local")}",',
                f"    supports_live_monitoring={str(spec.get('supports_live_monitoring', False))},",
                f"    supports_experiment_comparison={str(spec.get('supports_experiment_comparison', True))},",
                f"    evaluator_shapes={_fmt_list(spec.get('evaluator_shapes', []))},",
                f"    recommended_windows={_fmt_list(spec.get('recommended_windows', ['1h', '6h', '24h', '7d', '30d']))},",
                f"    trace_integration={str(spec.get('trace_integration', True))},",
                f'    dataset_editability="{spec.get("dataset_editability", "read-only")}",',
                f'    sdk_support="{spec.get("sdk_support", "experimental")}",',
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
        const_name = (
            f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        )
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


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
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
        const_name = (
            f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        )
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))

        lines.extend(
            [
                f"export const {const_name}: BenchmarkSpec = {{",
                f"  id: '{benchmark_id}',",
                f"  version: '{version}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  category: '{spec['category']}',",
                f"  task_count: {spec['task_count']},",
                f"  metric: '{spec['metric']}',",
                f"  source: '{spec.get('source', '')}',",
                f"  difficulty: '{spec.get('difficulty', 'medium')}',",
                f"  languages: {_ts_list(spec.get('languages', []))},",
                f"  dataset_source: '{spec.get('dataset_source', 'local')}',",
                f"  supports_live_monitoring: {str(spec.get('supports_live_monitoring', False)).lower()},",
                f"  supports_experiment_comparison: {str(spec.get('supports_experiment_comparison', True)).lower()},",
                f"  evaluator_shapes: {_ts_list(spec.get('evaluator_shapes', []))},",
                f"  recommended_windows: {_ts_list(spec.get('recommended_windows', ['1h', '6h', '24h', '7d', '30d']))},",
                f"  trace_integration: {str(spec.get('trace_integration', True)).lower()},",
                f"  dataset_editability: '{spec.get('dataset_editability', 'read-only')}',",
                f"  sdk_support: '{spec.get('sdk_support', 'experimental')}',",
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
        const_name = (
            f"{benchmark_id.upper().replace('-', '_')}_BENCHMARK_SPEC{version_suffix(version)}"
        )
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
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading benchmark specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} benchmark specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} benchmark specs")


if __name__ == "__main__":
    main()
