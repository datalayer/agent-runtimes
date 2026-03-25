#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML memory specifications.

Usage:
    python generate_memory.py \\
      --specs-dir agentspecs/agentspecs/memory \\
      --python-output agent_runtimes/specs/memory.py \\
      --typescript-output src/specs/memory.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

from versioning import ensure_spec_version, version_suffix, versioned_ref


def _make_const_name(memory_id: str) -> str:
    """Convert a memory ID to a Python/TS constant name (e.g., 'mem0' -> 'MEM0_MEMORY')."""
    return f"{memory_id.upper().replace('-', '_')}_MEMORY"


def _make_enum_name(memory_id: str) -> str:
    """Convert a memory ID to an enum member name (e.g., 'mem0' -> 'MEM0')."""
    return memory_id.upper().replace("-", "_")


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def load_memory_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all memory YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from memory specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Memory Catalog.",
        "",
        "Predefined memory backend configurations that can be used by agents.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from enum import Enum",
        "from typing import Optional",
        "",
        "from pydantic import BaseModel, Field",
        "",
        "",
        "# " + "=" * 76,
        "# MemorySpec Type",
        "# " + "=" * 76,
        "",
        "",
        "class MemorySpec(BaseModel):",
        '    """Specification for a memory backend."""',
        "",
        '    id: str = Field(..., description="Unique memory identifier")',
        '    version: str = Field(default="0.0.1", description="Memory spec version")',
        '    name: str = Field(..., description="Display name for the memory backend")',
        '    description: str = Field(default="", description="Memory backend description")',
        '    persistence: str = Field(default="none", description="Persistence level: none, session, cross-session, permanent")',
        '    scope: str = Field(default="agent", description="Memory scope: agent, team, repository, user, global")',
        '    backend: str = Field(default="in-memory", description="Storage backend identifier")',
        '    icon: str = Field(default="database", description="Icon identifier")',
        '    emoji: str = Field(default="\\U0001f9e0", description="Emoji representation")',
        "",
        "",
        "# " + "=" * 76,
        "# Memories Enum",
        "# " + "=" * 76,
        "",
        "",
        "class Memories(str, Enum):",
        '    """Enumeration of available memory backends."""',
        "",
    ]

    for spec in specs:
        enum_name = _make_enum_name(spec["id"])
        lines.append(f'    {enum_name} = "{spec["id"]}"')

    lines.extend(
        [
            "",
            "",
            "# " + "=" * 76,
            "# Memory Definitions",
            "# " + "=" * 76,
            "",
        ]
    )

    # Generate memory constants
    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)

        # Clean description
        description = (
            spec.get("description", "").replace("\n", " ").replace("  ", " ").strip()
        )
        # Escape double quotes
        description = description.replace('"', '\\"')

        icon = f'"{spec.get("icon", "database")}"'
        emoji = f'"{spec.get("emoji", "🧠")}"'

        lines.extend(
            [
                f"{const_name} = MemorySpec(",
                f'    id="{spec["id"]}",',
                f'    version="{version}",',
                f'    name="{spec["name"]}",',
                f'    description="{description}",',
                f'    persistence="{spec.get("persistence", "none")}",',
                f'    scope="{spec.get("scope", "agent")}",',
                f'    backend="{spec.get("backend", "in-memory")}",',
                f"    icon={icon},",
                f"    emoji={emoji},",
                ")",
                "",
            ]
        )

    # Generate catalog
    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# Memory Catalog",
            "# " + "=" * 76,
            "",
            "MEMORY_CATALOGUE: dict[str, MemorySpec] = {",
        ]
    )

    for spec in specs:
        memory_id = spec["id"]
        version = spec["version"]
        const_name = _make_const_name(memory_id) + version_suffix(version)
        lines.append(f'    "{memory_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
        ]
    )

    # Default memory
    lines.extend(
        [
            "",
            'DEFAULT_MEMORY: str = "ephemeral"',
            "",
            "",
            "def get_memory(memory_id: str) -> Optional[MemorySpec]:",
            '    """',
            "    Get a memory specification by ID (accepts both bare and versioned refs).",
            "",
            "    Args:",
            "        memory_id: The unique identifier of the memory backend.",
            "",
            "    Returns:",
            "        The MemorySpec, or None if not found.",
            '    """',
            "    mem = MEMORY_CATALOGUE.get(memory_id)",
            "    if mem is not None:",
            "        return mem",
            "    base, _, ver = memory_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return MEMORY_CATALOGUE.get(base)",
            "    return None",
            "",
            "",
            "def get_default_memory() -> Optional[MemorySpec]:",
            '    """',
            "    Get the default memory backend.",
            "",
            "    Returns:",
            "        The default MemorySpec, or None if no default is set.",
            '    """',
            "    return MEMORY_CATALOGUE.get(DEFAULT_MEMORY)",
            "",
            "",
            "def list_memories() -> list[MemorySpec]:",
            '    """',
            "    List all available memory backends.",
            "",
            "    Returns:",
            "        List of all MemorySpec specifications.",
            '    """',
            "    return list(MEMORY_CATALOGUE.values())",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from memory specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Memory Catalog",
        " *",
        " * Predefined memory backend configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "// " + "=" * 76,
        "// MemorySpec Type",
        "// " + "=" * 76,
        "",
        "export interface MemorySpec {",
        "  /** Unique memory identifier (e.g., 'ephemeral', 'mem0') */",
        "  id: string;",
        "  /** Version */",
        "  version: string;",
        "  /** Display name for the memory backend */",
        "  name: string;",
        "  /** Memory backend description */",
        "  description: string;",
        "  /** Persistence level: none, session, cross-session, permanent */",
        "  persistence: string;",
        "  /** Memory scope: agent, team, repository, user, global */",
        "  scope: string;",
        "  /** Storage backend identifier */",
        "  backend: string;",
        "  /** Icon identifier */",
        "  icon: string;",
        "  /** Emoji representation */",
        "  emoji: string;",
        "}",
        "",
        "// " + "=" * 76,
        "// Memories Enum",
        "// " + "=" * 76,
        "",
        "export const Memories = {",
    ]

    # Generate enum-like const object
    for spec in specs:
        enum_name = _make_enum_name(spec["id"])
        lines.append(f"  {enum_name}: '{spec['id']}',")

    lines.extend(
        [
            "} as const;",
            "",
            "export type MemoryId = (typeof Memories)[keyof typeof Memories];",
            "",
            "// " + "=" * 76,
            "// Memory Definitions",
            "// " + "=" * 76,
            "",
        ]
    )

    # Generate memory constants
    for spec in specs:
        version = spec["version"]
        const_name = _make_const_name(spec["id"]) + version_suffix(version)

        # Clean description
        description = (
            spec.get("description", "").replace("\n", " ").replace("  ", " ").strip()
        )
        # Escape single quotes
        description = description.replace("'", "\\'")

        lines.extend(
            [
                f"export const {const_name}: MemorySpec = {{",
                f"  id: '{spec['id']}',",
                f"  version: '{version}',",
                f"  name: '{spec['name']}',",
                f"  description: '{description}',",
                f"  persistence: '{spec.get('persistence', 'none')}',",
                f"  scope: '{spec.get('scope', 'agent')}',",
                f"  backend: '{spec.get('backend', 'in-memory')}',",
                f"  icon: '{spec.get('icon', 'database')}',",
                f"  emoji: '{spec.get('emoji', '🧠')}',",
                "};",
                "",
            ]
        )

    # Generate catalog
    lines.extend(
        [
            "// " + "=" * 76,
            "// Memory Catalog",
            "// " + "=" * 76,
            "",
            "export const MEMORY_CATALOGUE: Record<string, MemorySpec> = {",
        ]
    )

    for spec in specs:
        memory_id = spec["id"]
        version = spec["version"]
        const_name = _make_const_name(memory_id) + version_suffix(version)
        lines.append(f"  '{memory_id}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export const DEFAULT_MEMORY: MemoryId = Memories.EPHEMERAL;",
            "",
            "function resolveMemoryId(memoryId: string): string {",
            "  if (memoryId in MEMORY_CATALOGUE) return memoryId;",
            "  const idx = memoryId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = memoryId.slice(0, idx);",
            "    if (base in MEMORY_CATALOGUE) return base;",
            "  }",
            "  return memoryId;",
            "}",
            "",
            "/**",
            " * Get a memory specification by ID.",
            " */",
            "export function getMemory(memoryId: string): MemorySpec | undefined {",
            "  return MEMORY_CATALOGUE[resolveMemoryId(memoryId)];",
            "}",
            "",
            "/**",
            " * Get the default memory backend.",
            " */",
            "export function getDefaultMemory(): MemorySpec | undefined {",
            "  return MEMORY_CATALOGUE[DEFAULT_MEMORY];",
            "}",
            "",
            "/**",
            " * List all available memory backends.",
            " */",
            "export function listMemories(): MemorySpec[] {",
            "  return Object.values(MEMORY_CATALOGUE);",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def update_init_file(specs: list[dict[str, Any]], init_file: Path) -> None:
    """Update the __init__.py file with correct imports based on generated specs."""
    memory_constants = []
    for spec in specs:
        const_name = _make_const_name(spec["id"])
        memory_constants.append(const_name)

    init_content = init_file.read_text()

    # Find the memory import section
    import_start = init_content.find("from .memory import (")
    if import_start == -1:
        # Section doesn't exist yet — append it
        all_names = sorted(
            memory_constants
            + [
                "MemorySpec",
                "Memories",
                "MEMORY_CATALOGUE",
                "DEFAULT_MEMORY",
                "get_default_memory",
                "get_memory",
                "list_memories",
            ],
            key=str.casefold,
        )
        new_imports = ["\nfrom .memory import ("]
        for name in all_names:
            new_imports.append(f"    {name},")
        new_imports.append(")")
        init_content = init_content.rstrip() + "\n" + "\n".join(new_imports) + "\n"
        init_file.write_text(init_content)
        print(f"✓ Added memory imports to {init_file}")
        return

    # Find the end of the import statement
    import_end = init_content.find(")", import_start)
    if import_end == -1:
        print(f"Warning: Could not find end of memory import in {init_file}")
        return

    # Generate new import lines
    all_names = sorted(
        memory_constants
        + [
            "MemorySpec",
            "Memories",
            "MEMORY_CATALOGUE",
            "DEFAULT_MEMORY",
            "get_default_memory",
            "get_memory",
            "list_memories",
        ],
        key=str.casefold,
    )
    new_imports = ["from .memory import ("]
    for name in all_names:
        new_imports.append(f"    {name},")
    new_imports.append(")")

    new_content = (
        init_content[:import_start]
        + "\n".join(new_imports)
        + init_content[import_end + 1 :]
    )

    init_file.write_text(new_content)
    print(f"✓ Updated {init_file}")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML memory specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing YAML memory specification files",
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

    # Validate specs directory
    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    # Load specifications
    print(f"Loading memory specs from {args.specs_dir}...")
    specs = load_memory_specs(args.specs_dir)
    print(f"Loaded {len(specs)} memory specifications")

    # Generate Python code
    print("Generating Python code...")
    python_code = generate_python_code(specs)
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(python_code)
    print(f"✓ Generated {args.python_output}")

    # Generate TypeScript code
    print("Generating TypeScript code...")
    typescript_code = generate_typescript_code(specs)
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(typescript_code)
    print(f"✓ Generated {args.typescript_output}")

    # Update __init__.py with correct imports
    init_file = args.python_output.parent / "__init__.py"
    if init_file.exists():
        print("Updating imports in __init__.py...")
        update_init_file(specs, init_file)

    print(f"\n✓ Successfully generated code from {len(specs)} memory specs")


if __name__ == "__main__":
    main()
