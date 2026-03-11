#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML trigger specifications.

Usage:
    python generate_triggers.py \\
      --specs-dir specs/triggers \\
      --python-output agent_runtimes/specs/triggers.py \\
      --typescript-output src/specs/triggers.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import yaml


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


def _py_field(f: dict[str, Any]) -> str:
    """Format a TriggerField as a Python dict literal."""
    parts = [
        f'"name": "{f["name"]}"',
        f'"label": "{f["label"]}"',
        f'"type": "{f["type"]}"',
        f'"required": {str(f["required"])}',
    ]
    if "placeholder" in f:
        parts.append(f'"placeholder": "{_esc_dq(f["placeholder"])}"')
    if "help" in f:
        parts.append(f'"help": "{_esc_dq(f["help"])}"')
    if "font" in f:
        parts.append(f'"font": "{f["font"]}"')
    return "{" + ", ".join(parts) + "}"


def _ts_field(f: dict[str, Any]) -> str:
    """Format a TriggerField as a TypeScript object literal."""
    parts = [
        f"name: '{f['name']}'",
        f"label: '{_esc(f['label'])}'",
        f"type: '{f['type']}'",
        f"required: {'true' if f['required'] else 'false'}",
    ]
    if "placeholder" in f:
        parts.append(f"placeholder: '{_esc(f['placeholder'])}'")
    if "help" in f:
        parts.append(f"help: '{_esc(f['help'])}'")
    if "font" in f:
        parts.append(f"font: '{f['font']}'")
    return "{ " + ", ".join(parts) + " }"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from trigger specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Trigger Catalog.",
        "",
        "Predefined trigger type configurations.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Any, Dict, List, Literal, Optional",
        "from dataclasses import dataclass, field",
        "",
        "",
        "@dataclass",
        "class TriggerField:",
        '    """Dynamic field definition for a trigger type."""',
        "",
        "    name: str",
        "    label: str",
        '    type: Literal["string", "boolean", "number"]',
        "    required: bool",
        "    placeholder: Optional[str] = None",
        "    help: Optional[str] = None",
        "    font: Optional[str] = None",
        "",
        "",
        "@dataclass",
        "class TriggerSpec:",
        '    """Trigger type specification."""',
        "",
        "    id: str",
        "    name: str",
        "    description: str",
        '    type: Literal["once", "schedule", "event"]',
        "    fields: List[TriggerField] = field(default_factory=list)",
        "",
        "",
        "# " + "=" * 76,
        "# Trigger Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        trigger_id = spec["id"]
        const_name = f"{trigger_id.upper().replace('-', '_')}_TRIGGER_SPEC"
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))
        fields = spec.get("fields", [])

        lines.extend(
            [
                f"{const_name} = TriggerSpec(",
                f'    id="{trigger_id}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    type="{spec["type"]}",',
            ]
        )
        if fields:
            field_strs = [_py_field(f) for f in fields]
            lines.append("    fields=[")
            for fs in field_strs:
                lines.append(f"        TriggerField(**{fs}),")
            lines.append("    ],")
        lines.extend([")", ""])

    lines.extend(
        [
            "# " + "=" * 76,
            "# Trigger Catalog",
            "# " + "=" * 76,
            "",
            "TRIGGER_CATALOG: Dict[str, TriggerSpec] = {",
        ]
    )
    for spec in specs:
        trigger_id = spec["id"]
        const_name = f"{trigger_id.upper().replace('-', '_')}_TRIGGER_SPEC"
        lines.append(f'    "{trigger_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_trigger_spec(trigger_id: str) -> TriggerSpec | None:",
            '    """Get a trigger specification by ID."""',
            "    return TRIGGER_CATALOG.get(trigger_id)",
            "",
            "",
            "def list_trigger_specs() -> List[TriggerSpec]:",
            '    """List all trigger specifications."""',
            "    return list(TRIGGER_CATALOG.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from trigger specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Trigger Catalog",
        " *",
        " * Predefined trigger type configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { TriggerSpec } from '../types/Types';",
        "",
        "// " + "=" * 76,
        "// Trigger Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        trigger_id = spec["id"]
        const_name = f"{trigger_id.upper().replace('-', '_')}_TRIGGER_SPEC"
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))
        fields = spec.get("fields", [])

        lines.extend(
            [
                f"export const {const_name}: TriggerSpec = {{",
                f"  id: '{trigger_id}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  type: '{spec['type']}',",
            ]
        )
        if fields:
            field_strs = [_ts_field(f) for f in fields]
            lines.append("  fields: [")
            for fs in field_strs:
                lines.append(f"    {fs},")
            lines.append("  ],")
        else:
            lines.append("  fields: [],")
        lines.extend(["};", ""])

    lines.extend(
        [
            "// " + "=" * 76,
            "// Trigger Catalog",
            "// " + "=" * 76,
            "",
            "export const TRIGGER_CATALOG: Record<string, TriggerSpec> = {",
        ]
    )
    for spec in specs:
        trigger_id = spec["id"]
        const_name = f"{trigger_id.upper().replace('-', '_')}_TRIGGER_SPEC"
        lines.append(f"  '{trigger_id}': {const_name},")
    lines.extend(
        [
            "};",
            "",
            "export function getTriggerSpecs(): TriggerSpec[] {",
            "  return Object.values(TRIGGER_CATALOG);",
            "}",
            "",
            "export function getTriggerSpec(triggerId: string): TriggerSpec | undefined {",
            "  return TRIGGER_CATALOG[triggerId];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML trigger specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading trigger specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} trigger specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} trigger specs")


if __name__ == "__main__":
    main()
