#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML output specifications.

Usage:
    python generate_outputs.py \\
      --specs-dir specs/outputs \\
      --python-output agent_runtimes/specs/outputs.py \\
      --typescript-output src/specs/outputs.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml


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
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from output specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Output Catalog.",
        "",
        "Predefined output format configurations.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List",
        "",
        "from pydantic import BaseModel, Field",
        "",
        "",
        "class OutputSpec(BaseModel):",
        '    """Output format specification."""',
        "",
        '    id: str = Field(..., description="Unique output identifier")',
        '    name: str = Field(..., description="Display name")',
        '    description: str = Field(default="", description="Output description")',
        '    icon: str = Field(default="", description="Icon identifier")',
        '    supports_template: bool = Field(default=False, description="Whether this output supports templating")',
        '    supports_storage: bool = Field(default=False, description="Whether this output can be persisted")',
        '    mime_types: List[str] = Field(default_factory=list, description="Supported MIME types")',
        "",
        "",
        "# " + "=" * 76,
        "# Output Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        output_id = spec["id"]
        const_name = f"{output_id.upper().replace('-', '_')}_OUTPUT_SPEC"
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))

        lines.extend(
            [
                f"{const_name} = OutputSpec(",
                f'    id="{output_id}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    icon="{spec.get("icon", "")}",',
                f"    supports_template={spec.get('supports_template', False)},",
                f"    supports_storage={spec.get('supports_storage', False)},",
                f"    mime_types={_fmt_list(spec.get('mime_types', []))},",
                ")",
                "",
            ]
        )

    lines.extend(
        [
            "# " + "=" * 76,
            "# Output Catalog",
            "# " + "=" * 76,
            "",
            "OUTPUT_CATALOG: Dict[str, OutputSpec] = {",
        ]
    )
    for spec in specs:
        output_id = spec["id"]
        const_name = f"{output_id.upper().replace('-', '_')}_OUTPUT_SPEC"
        lines.append(f'    "{output_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_output_spec(output_id: str) -> OutputSpec | None:",
            '    """Get an output specification by ID."""',
            "    return OUTPUT_CATALOG.get(output_id)",
            "",
            "",
            "def list_output_specs() -> List[OutputSpec]:",
            '    """List all output specifications."""',
            "    return list(OUTPUT_CATALOG.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from output specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Output Catalog",
        " *",
        " * Predefined output format configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { OutputSpec } from '../types/Types';",
        "",
        "// " + "=" * 76,
        "// Output Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        output_id = spec["id"]
        const_name = f"{output_id.upper().replace('-', '_')}_OUTPUT_SPEC"
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))

        lines.extend(
            [
                f"export const {const_name}: OutputSpec = {{",
                f"  id: '{output_id}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  icon: '{spec.get('icon', '')}',",
                f"  supports_template: {str(spec.get('supports_template', False)).lower()},",
                f"  supports_storage: {str(spec.get('supports_storage', False)).lower()},",
                f"  mime_types: {_ts_list(spec.get('mime_types', []))},",
                "};",
                "",
            ]
        )

    lines.extend(
        [
            "// " + "=" * 76,
            "// Output Catalog",
            "// " + "=" * 76,
            "",
            "export const OUTPUT_CATALOG: Record<string, OutputSpec> = {",
        ]
    )
    for spec in specs:
        output_id = spec["id"]
        const_name = f"{output_id.upper().replace('-', '_')}_OUTPUT_SPEC"
        lines.append(f"  '{output_id}': {const_name},")
    lines.extend(
        [
            "};",
            "",
            "export function getOutputSpecs(): OutputSpec[] {",
            "  return Object.values(OUTPUT_CATALOG);",
            "}",
            "",
            "export function getOutputSpec(outputId: string): OutputSpec | undefined {",
            "  return OUTPUT_CATALOG[outputId];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML output specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading output specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} output specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} output specs")


if __name__ == "__main__":
    main()
