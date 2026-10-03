#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML component specifications.

The catalog of visual components (LOOP C-13): what a layout is made of, one
catalog for the spec, the Canvas and Python. One YAML per component under
``agentspecs/components``; its ``properties`` are a JSON Schema, emitted as
it is so that every editor reads the schema agentspecs tested.

Usage:
    python generate_components.py \\
      --specs-dir agentspecs/agentspecs/components \\
      --python-output agent_runtimes/specs/components.py \\
      --typescript-output src/specs/components.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix

FIELDS = ("id", "version", "name", "description", "category", "emoji", "properties", "bindings", "events", "example")


def load_component_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every component YAML of a directory; one that is not whole is refused."""
    if not specs_dir.is_dir():
        raise SystemExit(f"No component specifications at {specs_dir}")
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        spec = yaml.safe_load(yaml_file.read_text())
        ensure_spec_version(spec)
        if spec["id"] != yaml_file.stem:
            raise SystemExit(f"{yaml_file.name}: named for {yaml_file.stem!r}, the spec says {spec['id']!r}")
        missing = [name for name in FIELDS if name not in spec]
        if missing:
            raise SystemExit(f"{yaml_file.name}: no {', '.join(missing)}")
        specs.append(spec)
    if not specs:
        raise SystemExit(f"No component specifications in {specs_dir}")
    return specs


def _const_name(spec: dict[str, Any]) -> str:
    return spec["id"].replace("-", "_").upper() + "_COMPONENT" + version_suffix(spec["version"])


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Component Catalog (LOOP C-13).",
        "",
        "The visual components a layout is made of: one catalog for the spec, the",
        "Canvas and Python, each with its properties as a JSON Schema.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import ComponentBindingsSpec, ComponentSpec",
        "",
        "",
    ]
    for spec in specs:
        lines.extend(
            [
                f"{_const_name(spec)} = ComponentSpec(",
                f"    id={json.dumps(spec['id'])},",
                f"    version={json.dumps(str(spec['version']))},",
                f"    name={json.dumps(spec['name'], ensure_ascii=False)},",
                f"    description={json.dumps(spec['description'].strip(), ensure_ascii=False)},",
                f"    category={json.dumps(spec['category'])},",
                f"    emoji={json.dumps(spec['emoji'], ensure_ascii=False)},",
                f"    a2ui={json.dumps(spec['a2ui']) if spec.get('a2ui') else 'None'},",
                f"    properties={spec['properties']!r},",
                "    bindings=ComponentBindingsSpec(",
                f"        shows={spec['bindings']['shows']!r}, sends={spec['bindings']['sends']!r}",
                "    ),",
                f"    events={spec['events']!r},",
                f"    example={spec['example']!r},",
                ")",
                "",
            ]
        )
    lines.append("COMPONENT_CATALOGUE: Dict[str, ComponentSpec] = {")
    for spec in specs:
        lines.append(f"    {json.dumps(spec['id'])}: {_const_name(spec)},")
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_component(component_id: str) -> ComponentSpec | None:",
            '    """The component a layout names, or None."""',
            "    return COMPONENT_CATALOGUE.get(component_id)",
            "",
            "",
            "def list_components() -> list[ComponentSpec]:",
            "    return list(COMPONENT_CATALOGUE.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Component Catalog (LOOP C-13).",
        " *",
        " * The visual components a layout is made of: one catalog for the spec, the",
        " * Canvas and Python, each with its properties as a JSON Schema.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { ComponentSpec } from '../types/agentspecs';",
        "",
    ]
    for spec in specs:
        body = {
            "id": spec["id"],
            "version": str(spec["version"]),
            "name": spec["name"],
            "description": spec["description"].strip(),
            "category": spec["category"],
            "emoji": spec["emoji"],
            **({"a2ui": spec["a2ui"]} if spec.get("a2ui") else {}),
            "properties": spec["properties"],
            "bindings": spec["bindings"],
            "events": spec["events"],
            "example": spec["example"],
        }
        lines.append(
            f"export const {_const_name(spec)}: ComponentSpec = {json.dumps(body, indent=2, ensure_ascii=False)};"
        )
        lines.append("")
    lines.append("export const COMPONENT_CATALOGUE: Record<string, ComponentSpec> = {")
    for spec in specs:
        lines.append(f"  {json.dumps(spec['id'])}: {_const_name(spec)},")
    lines.extend(
        [
            "};",
            "",
            "/** The component a layout names, or undefined. */",
            "export function getComponent(componentId: string): ComponentSpec | undefined {",
            "  return COMPONENT_CATALOGUE[componentId];",
            "}",
            "",
            "export function listComponents(): ComponentSpec[] {",
            "  return Object.values(COMPONENT_CATALOGUE);",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()
    specs = load_component_specs(args.specs_dir)
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(f"✓ {len(specs)} components → {args.python_output}, {args.typescript_output}")


if __name__ == "__main__":
    main()
