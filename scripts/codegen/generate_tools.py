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

from versioning import ensure_spec_version, version_suffix, versioned_ref


def _fmt_list(items: list[str]) -> str:
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def _require_runtime(spec: dict[str, Any]) -> dict[str, str]:
    runtime = spec.get("runtime")
    if not isinstance(runtime, dict):
        raise ValueError(f"Tool '{spec.get('id', '<unknown>')}' is missing required 'runtime' object")

    language = runtime.get("language")
    package = runtime.get("package")
    method = runtime.get("method")

    if language not in {"python", "typescript"}:
        raise ValueError(
            f"Tool '{spec.get('id', '<unknown>')}' has invalid runtime.language '{language}'. "
            "Expected 'python' or 'typescript'."
        )

    if not package or not method:
        raise ValueError(
            f"Tool '{spec.get('id', '<unknown>')}' runtime must define non-empty 'package' and 'method'"
        )

    return {
        "language": str(language),
        "package": str(package),
        "method": str(method),
    }


def _requires_approval(spec: dict[str, Any]) -> bool:
    explicit = spec.get("requires_approval")
    if explicit is not None:
        return bool(explicit)
    return str(spec.get("approval", "auto")).lower() == "manual"


def load_tool_specs(specs_dir: Path) -> list[dict[str, Any]]:
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
        "Tool Catalog.",
        "",
        "Predefined runtime tools that can be attached to agents.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List",
        "",
        "from agent_runtimes.types import ToolRuntimeSpec, ToolSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Tool Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        tool_id = spec["id"]
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC{version_suffix(version)}"
        runtime = _require_runtime(spec)
        requires_approval = _requires_approval(spec)
        icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
        emoji = f'"{spec.get("emoji")}"' if spec.get("emoji") else "None"

        lines.extend(
            [
                f"{const_name} = ToolSpec(",
                f'    id="{tool_id}",',
                f'    version="{version}",',
                f'    name="{spec["name"]}",',
                f'    description="{spec.get("description", "")}",',
                f"    tags={_fmt_list(spec.get('tags', []))},",
                f"    enabled={spec.get('enabled', True)},",
                f"    approval=\"{spec.get('approval', 'auto')}\",",
                f"    requires_approval={requires_approval},",
                "    runtime=ToolRuntimeSpec(",
                f"        language=\"{runtime['language']}\",",
                f"        package=\"{runtime['package']}\",",
                f"        method=\"{runtime['method']}\",",
                "    ),",
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
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC{version_suffix(version)}"
        lines.append(f'    "{tool_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
            "",
            "def get_tool_spec(tool_id: str) -> ToolSpec | None:",
            '    """Get a tool specification by ID (accepts both bare and versioned refs)."""',
            "    spec = TOOL_CATALOG.get(tool_id)",
            "    if spec is not None:",
            "        return spec",
            "    base, _, ver = tool_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return TOOL_CATALOG.get(base)",
            "    return None",
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
        "import type { ToolSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Tool Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        tool_id = spec["id"]
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC{version_suffix(version)}"
        runtime = _require_runtime(spec)
        requires_approval = _requires_approval(spec)
        tags_json = str(spec.get("tags", [])).replace("'", '"')
        icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
        emoji = f"'{spec.get('emoji')}'" if spec.get("emoji") else "undefined"

        lines.extend(
            [
                f"export const {const_name}: ToolSpec = {{",
                f"  id: '{tool_id}',",
                f"  version: '{version}',",
                f"  name: '{spec['name']}',",
                f"  description: '{spec.get('description', '')}',",
                f"  tags: {tags_json},",
                f"  enabled: {str(spec.get('enabled', True)).lower()},",
                f"  approval: '{spec.get('approval', 'auto')}',",
                f"  requiresApproval: {str(requires_approval).lower()},",
                "  runtime: {",
                f"    language: '{runtime['language']}',",
                f"    package: '{runtime['package']}',",
                f"    method: '{runtime['method']}',",
                "  },",
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
        version = spec["version"]
        const_name = f"{tool_id.upper().replace('-', '_')}_TOOL_SPEC{version_suffix(version)}"
        lines.append(f"  '{tool_id}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export function getToolSpecs(): ToolSpec[] {",
            "  return Object.values(TOOL_CATALOG);",
            "}",
            "",
            "function resolveToolId(toolId: string): string {",
            "  if (toolId in TOOL_CATALOG) return toolId;",
            "  const idx = toolId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = toolId.slice(0, idx);",
            "    if (base in TOOL_CATALOG) return base;",
            "  }",
            "  return toolId;",
            "}",
            "",
            "export function getToolSpec(toolId: string): ToolSpec | undefined {",
            "  return TOOL_CATALOG[resolveToolId(toolId)];",
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
