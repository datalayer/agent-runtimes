#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML tool specifications.
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml


def _fmt_list(items: list[str]) -> str:
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def load_tool_specs(specs_dir: Path) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            specs.append(yaml.safe_load(f))
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Tool Catalog.",
        "",
        "Predefined runtime tools that can be attached to agents.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List, Literal, Optional",
        "",
        "from pydantic import BaseModel, Field",
        "",
        "",
        "class ToolSpec(BaseModel):",
        '    """Tool specification."""',
        "",
        '    id: str = Field(..., description="Tool identifier")',
        '    name: str = Field(..., description="Display name")',
        '    description: str = Field(default="", description="Tool description")',
        '    tags: List[str] = Field(default_factory=list, description="Search/discovery tags")',
        '    enabled: bool = Field(default=True, description="Whether tool is enabled")',
        "    approval: Literal['auto', 'manual'] = Field(default='auto', description='Approval policy')",
        '    icon: Optional[str] = Field(default=None, description="Icon identifier")',
        '    emoji: Optional[str] = Field(default=None, description="Emoji representation")',
        "",
        "",
        "# " + "=" * 76,
        "# Tool Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        tool_id = spec["id"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC"
        icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
        emoji = f'"{spec.get("emoji")}"' if spec.get("emoji") else "None"

        lines.extend(
            [
                f"{const_name} = ToolSpec(",
                f'    id="{tool_id}",',
                f'    name="{spec["name"]}",',
                f'    description="{spec.get("description", "")}",',
                f"    tags={_fmt_list(spec.get('tags', []))},",
                f"    enabled={spec.get('enabled', True)},",
                f"    approval=\"{spec.get('approval', 'auto')}\",",
                f"    icon={icon},",
                f"    emoji={emoji},",
                ")",
                "",
            ]
        )

    lines.extend(
        [
            "# " + "=" * 76,
            "# Tool Catalog",
            "# " + "=" * 76,
            "",
            "TOOL_CATALOG: Dict[str, ToolSpec] = {",
        ]
    )

    for spec in specs:
        tool_id = spec["id"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC"
        lines.append(f'    "{tool_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
            "",
            "def get_tool_spec(tool_id: str) -> ToolSpec | None:",
            '    """Get a tool specification by ID."""',
            "    return TOOL_CATALOG.get(tool_id)",
            "",
            "",
            "def list_tool_specs() -> List[ToolSpec]:",
            '    """List all tool specifications."""',
            "    return list(TOOL_CATALOG.values())",
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
        " * Tool Catalog",
        " *",
        " * Predefined runtime tools that can be attached to agents.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "export interface ToolSpec {",
        "  id: string;",
        "  name: string;",
        "  description: string;",
        "  tags: string[];",
        "  enabled: boolean;",
        "  approval: 'auto' | 'manual';",
        "  icon?: string;",
        "  emoji?: string;",
        "}",
        "",
        "// " + "=" * 76,
        "// Tool Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        tool_id = spec["id"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC"
        tags_json = str(spec.get("tags", [])).replace("'", '"')
        icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
        emoji = f"'{spec.get('emoji')}'" if spec.get("emoji") else "undefined"

        lines.extend(
            [
                f"export const {const_name}: ToolSpec = {{",
                f"  id: '{tool_id}',",
                f"  name: '{spec['name']}',",
                f"  description: '{spec.get('description', '')}',",
                f"  tags: {tags_json},",
                f"  enabled: {str(spec.get('enabled', True)).lower()},",
                f"  approval: '{spec.get('approval', 'auto')}',",
                f"  icon: {icon},",
                f"  emoji: {emoji},",
                "};",
                "",
            ]
        )

    lines.extend(
        [
            "// " + "=" * 76,
            "// Tool Catalog",
            "// " + "=" * 76,
            "",
            "export const TOOL_CATALOG: Record<string, ToolSpec> = {",
        ]
    )

    for spec in specs:
        tool_id = spec["id"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC"
        lines.append(f"  '{tool_id}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export function getToolSpecs(): ToolSpec[] {",
            "  return Object.values(TOOL_CATALOG);",
            "}",
            "",
            "export function getToolSpec(toolId: string): ToolSpec | undefined {",
            "  return TOOL_CATALOG[toolId];",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML tool specifications"
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

    print(f"Loading tool specs from {args.specs_dir}...")
    specs = load_tool_specs(args.specs_dir)
    print(f"Loaded {len(specs)} tool specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} tool specs")


if __name__ == "__main__":
    main()
