#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML persona specifications.

Usage:
    python generate_personas.py \\
      --specs-dir agentspecs/agentspecs/personas \\
      --python-output agent_runtimes/specs/personas.py \\
      --typescript-output src/specs/personas.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


def _make_const_name(persona_id: str) -> str:
    """Convert a persona ID to a constant name (e.g., 'tutor' -> 'TUTOR_PERSONA')."""
    return f"{persona_id.upper().replace('-', '_')}_PERSONA"


def _make_enum_name(persona_id: str) -> str:
    """Convert a persona ID to an enum member name (e.g., 'tutor' -> 'TUTOR')."""
    return persona_id.upper().replace("-", "_")


def _fmt_str_list_py(items: list[str]) -> str:
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def _fmt_str_list_ts(items: list[str]) -> str:
    if not items:
        return "[]"
    return "[" + ", ".join(f"'{item}'" for item in items) + "]"


def _clean(text: str) -> str:
    return text.replace("\n", " ").replace("  ", " ").strip()


def load_persona_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all persona YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from persona specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Persona Catalog.",
        "",
        "Predefined Persona configurations built on top of agent specs.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from enum import Enum",
        "from typing import Optional",
        "",
        "from agent_runtimes.types import PersonaSpec",
        "",
        "# " + "=" * 76,
        "# Personas Enum",
        "# " + "=" * 76,
        "",
        "",
        "class Personas(str, Enum):",
        '    """Enumeration of available personas."""',
        "",
    ]

    for spec in specs:
        lines.append(f'    {_make_enum_name(spec["id"])} = "{spec["id"]}"')

    lines.extend(
        [
            "",
            "",
            "# " + "=" * 76,
            "# Persona Definitions",
            "# " + "=" * 76,
            "",
        ]
    )

    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)
        description = _clean(spec.get("description", "")).replace('"', '\\"')
        tags = _fmt_str_list_py(spec.get("tags", []) or [])
        icon = spec.get("icon")
        emoji = spec.get("emoji")
        agent = spec.get("agent")

        body = [
            f"{const_name} = PersonaSpec(",
            f'    id="{spec["id"]}",',
            f'    version="{version}",',
            f'    name="{spec["name"]}",',
            f'    description="{description}",',
            f"    tags={tags},",
        ]
        if icon is not None:
            body.append(f'    icon="{icon}",')
        if emoji is not None:
            body.append(f'    emoji="{emoji}",')
        if agent is not None:
            body.append(f'    agent="{agent}",')
        body.append(")")
        body.append("")
        lines.extend(body)

    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# Persona Catalog",
            "# " + "=" * 76,
            "",
            "PERSONA_CATALOGUE: dict[str, PersonaSpec] = {",
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
            "def get_persona(persona_id: str) -> Optional[PersonaSpec]:",
            '    """Get a persona specification by ID (accepts bare or versioned refs)."""',
            "    persona = PERSONA_CATALOGUE.get(persona_id)",
            "    if persona is not None:",
            "        return persona",
            '    base, _, ver = persona_id.rpartition(":")',
            '    if base and "." in ver:',
            "        return PERSONA_CATALOGUE.get(base)",
            "    return None",
            "",
            "",
            "def list_personas() -> list[PersonaSpec]:",
            '    """List all available personas."""',
            "    return list(PERSONA_CATALOGUE.values())",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from persona specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Persona Catalog",
        " *",
        " * Predefined Persona configurations built on top of agent specs.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { PersonaSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Personas Enum",
        "// " + "=" * 76,
        "",
        "export const Personas = {",
    ]

    for spec in specs:
        lines.append(f"  {_make_enum_name(spec['id'])}: '{spec['id']}',")

    lines.extend(
        [
            "} as const;",
            "",
            "export type PersonaId = (typeof Personas)[keyof typeof Personas];",
            "",
            "// " + "=" * 76,
            "// Persona Definitions",
            "// " + "=" * 76,
            "",
        ]
    )

    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)
        description = _clean(spec.get("description", "")).replace("'", "\\'")
        name = spec["name"].replace("'", "\\'")
        tags = _fmt_str_list_ts(spec.get("tags", []) or [])
        icon = spec.get("icon")
        emoji = spec.get("emoji")
        agent = spec.get("agent")

        block = [
            f"export const {const_name}: PersonaSpec = {{",
            f"  id: '{spec['id']}',",
            f"  version: '{version}',",
            f"  name: '{name}',",
            f"  description: '{description}',",
            f"  tags: {tags},",
        ]
        if icon is not None:
            block.append(f"  icon: '{icon}',")
        if emoji is not None:
            block.append(f"  emoji: '{emoji}',")
        if agent is not None:
            block.append(f"  agent: '{agent}',")
        block.append("};")
        block.append("")
        lines.extend(block)

    lines.extend(
        [
            "// " + "=" * 76,
            "// Persona Catalog",
            "// " + "=" * 76,
            "",
            "export const PERSONA_CATALOGUE: Record<string, PersonaSpec> = {",
        ]
    )

    for spec in specs:
        const_name = _make_const_name(spec["id"]) + version_suffix(spec["version"])
        lines.append(f"  '{spec['id']}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "function resolvePersonaId(personaId: string): string {",
            "  if (personaId in PERSONA_CATALOGUE) return personaId;",
            "  const idx = personaId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = personaId.slice(0, idx);",
            "    if (base in PERSONA_CATALOGUE) return base;",
            "  }",
            "  return personaId;",
            "}",
            "",
            "/** Get a persona specification by ID. */",
            "export function getPersona(personaId: string): PersonaSpec | undefined {",
            "  return PERSONA_CATALOGUE[resolvePersonaId(personaId)];",
            "}",
            "",
            "/** List all available personas. */",
            "export function listPersonas(): PersonaSpec[] {",
            "  return Object.values(PERSONA_CATALOGUE);",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML persona specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading persona specs from {args.specs_dir}...")
    specs = load_persona_specs(args.specs_dir)
    print(f"Loaded {len(specs)} persona specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} persona specs")


if __name__ == "__main__":
    main()
