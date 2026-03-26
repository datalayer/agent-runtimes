#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML frontend-tool specifications.
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

from versioning import ensure_spec_version, version_suffix


def _fmt_list(items: list[str]) -> str:
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def load_frontend_tool_specs(specs_dir: Path) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Frontend Tool Catalog.",
        "",
        "Predefined frontend tool sets that can be attached to agents.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List",
        "",
        "from agent_runtimes.types import FrontendToolSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Frontend Tool Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        tool_id = spec["id"]
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_FRONTEND_TOOL_SPEC{version_suffix(version)}"
        icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
        emoji = f'"{spec.get("emoji")}"' if spec.get("emoji") else "None"

        lines.extend(
            [
                f"{const_name} = FrontendToolSpec(",
                f'    id="{tool_id}",',
                f'    version="{version}",',
                f'    name="{spec["name"]}",',
                f'    description="{spec.get("description", "")}",',
                f"    tags={_fmt_list(spec.get('tags', []))},",
                f"    enabled={spec.get('enabled', True)},",
                f'    toolset="{spec.get("toolset", "all")}",',
                f"    icon={icon},",
                f"    emoji={emoji},",
                ")",
                "",
            ]
        )

    lines.extend(
        [
            "# " + "=" * 76,
            "# Frontend Tool Catalog",
            "# " + "=" * 76,
            "",
            "FRONTEND_TOOL_CATALOG: Dict[str, FrontendToolSpec] = {",
        ]
    )

    for spec in specs:
        tool_id = spec["id"]
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_FRONTEND_TOOL_SPEC{version_suffix(version)}"
        lines.append(f'    "{tool_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
            "",
            "def get_frontend_tool_spec(tool_id: str) -> FrontendToolSpec | None:",
            '    """Get a frontend tool specification by ID (accepts both bare and versioned refs)."""',
            "    spec = FRONTEND_TOOL_CATALOG.get(tool_id)",
            "    if spec is not None:",
            "        return spec",
            "    base, _, ver = tool_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return FRONTEND_TOOL_CATALOG.get(base)",
            "    return None",
            "",
            "",
            "def list_frontend_tool_specs() -> List[FrontendToolSpec]:",
            '    """List all frontend tool specifications."""',
            "    return list(FRONTEND_TOOL_CATALOG.values())",
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
        " * Frontend Tool Catalog",
        " *",
        " * Predefined frontend tool sets that can be attached to agents.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { FrontendToolSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Frontend Tool Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        tool_id = spec["id"]
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_FRONTEND_TOOL_SPEC{version_suffix(version)}"
        tags_json = str(spec.get("tags", [])).replace("'", '"')
        icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
        emoji = f"'{spec.get('emoji')}'" if spec.get("emoji") else "undefined"

        lines.extend(
            [
                f"export const {const_name}: FrontendToolSpec = {{",
                f"  id: '{tool_id}',",
                f"  version: '{version}',",
                f"  name: '{spec['name']}',",
                f"  description: '{spec.get('description', '')}',",
                f"  tags: {tags_json},",
                f"  enabled: {str(spec.get('enabled', True)).lower()},",
                f"  toolset: '{spec.get('toolset', 'all')}',",
                f"  icon: {icon},",
                f"  emoji: {emoji},",
                "};",
                "",
            ]
        )

    lines.extend(
        [
            "// " + "=" * 76,
            "// Frontend Tool Catalog",
            "// " + "=" * 76,
            "",
            "export const FRONTEND_TOOL_CATALOG: Record<string, FrontendToolSpec> = {",
        ]
    )

    for spec in specs:
        tool_id = spec["id"]
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_FRONTEND_TOOL_SPEC{version_suffix(version)}"
        lines.append(f"  '{tool_id}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export function getFrontendToolSpecs(): FrontendToolSpec[] {",
            "  return Object.values(FRONTEND_TOOL_CATALOG);",
            "}",
            "",
            "function resolveFrontendToolId(toolId: string): string {",
            "  if (toolId in FRONTEND_TOOL_CATALOG) return toolId;",
            "  const idx = toolId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = toolId.slice(0, idx);",
            "    if (base in FRONTEND_TOOL_CATALOG) return base;",
            "  }",
            "  return toolId;",
            "}",
            "",
            "export function getFrontendToolSpec(toolId: string): FrontendToolSpec | undefined {",
            "  return FRONTEND_TOOL_CATALOG[resolveFrontendToolId(toolId)];",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML frontend-tool specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing YAML specification files",
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

    print(f"Loading frontend tool specs from {args.specs_dir}...")
    specs = load_frontend_tool_specs(args.specs_dir)
    print(f"Loaded {len(specs)} frontend tool specifications")

    # Generate Python code
    python_code = generate_python_code(specs)
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.python_output, "w") as f:
        f.write(python_code)
    print(f"Generated Python code: {args.python_output}")

    # Generate TypeScript code
    typescript_code = generate_typescript_code(specs)
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.typescript_output, "w") as f:
        f.write(typescript_code)
    print(f"Generated TypeScript code: {args.typescript_output}")


if __name__ == "__main__":
    main()
