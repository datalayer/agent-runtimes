#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML reactor-tool specifications.

A reactor tool bundle names a Reactor plugin's commands (`frontend`) and its
backend HTTP API (`backend`). The bundle is emitted whole, as data: the
runtime turns the frontend entries into tools executed in the browser and
the backend entries into tools the harness calls on the server.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix

#: YAML keys are snake_case; the TypeScript types are camelCase.
_TS_KEYS = {"base_url": "baseUrl", "base_url_envvar": "baseUrlEnvvar"}


def load_reactor_tool_specs(specs_dir: Path) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def const_name_of(spec: dict[str, Any]) -> str:
    return (
        spec["id"].upper().replace("-", "_")
        + "_REACTOR_TOOL_SPEC"
        + version_suffix(spec["version"])
    )


def _normalised(spec: dict[str, Any]) -> dict[str, Any]:
    """The spec with its defaults filled, so both outputs agree."""
    backend = spec.get("backend")
    return {
        "id": spec["id"],
        "version": spec["version"],
        "name": spec["name"],
        "description": spec.get("description", ""),
        "tags": list(spec.get("tags", [])),
        "enabled": bool(spec.get("enabled", True)),
        "plugin": spec.get("plugin"),
        "frontend": [
            {
                "name": entry["name"],
                "command": entry["command"],
                "description": entry.get("description", ""),
                "parameters": entry.get("parameters"),
                "approval": entry.get("approval", "auto"),
            }
            for entry in spec.get("frontend", []) or []
        ],
        "backend": (
            {
                "base_url": backend.get("base_url"),
                "base_url_envvar": backend.get("base_url_envvar"),
                "tools": [
                    {
                        "name": entry["name"],
                        "method": str(entry.get("method", "GET")).upper(),
                        "path": entry["path"],
                        "description": entry.get("description", ""),
                        "parameters": entry.get("parameters"),
                        "approval": entry.get("approval", "auto"),
                    }
                    for entry in backend.get("tools", []) or []
                ],
            }
            if backend
            else None
        ),
        "icon": spec.get("icon"),
        "emoji": spec.get("emoji"),
    }


def _camel(value: Any) -> Any:
    if isinstance(value, dict):
        return {_TS_KEYS.get(k, k): _camel(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_camel(v) for v in value]
    return value


def _drop_none(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _drop_none(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_drop_none(v) for v in value]
    return value


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Reactor Tool Catalog.",
        "",
        "Reactor plugins' commands and backends, as tool bundles agents can take.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List",
        "",
        "from agent_runtimes.types import ReactorToolSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Reactor Tool Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        data = _normalised(spec)
        lines.append(f"{const_name_of(spec)} = ReactorToolSpec.model_validate(")
        lines.append(f"    {json.dumps(data, indent=4, ensure_ascii=False)}")
        lines.append(")")
        lines.append("")

    lines.extend(
        [
            "# " + "=" * 76,
            "# Reactor Tool Catalog",
            "# " + "=" * 76,
            "",
            "REACTOR_TOOL_CATALOG: Dict[str, ReactorToolSpec] = {",
        ]
    )
    for spec in specs:
        lines.append(f'    "{spec["id"]}": {const_name_of(spec)},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_reactor_tool_spec(tool_id: str) -> ReactorToolSpec | None:",
            '    """Get a reactor tool specification by ID (accepts both bare and versioned refs)."""',
            "    spec = REACTOR_TOOL_CATALOG.get(tool_id)",
            "    if spec is not None:",
            "        return spec",
            "    base, _, ver = tool_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return REACTOR_TOOL_CATALOG.get(base)",
            "    return None",
            "",
            "",
            "def list_reactor_tool_specs() -> List[ReactorToolSpec]:",
            '    """List all reactor tool specifications."""',
            "    return list(REACTOR_TOOL_CATALOG.values())",
            "",
        ]
    )
    # JSON's literals are not Python's.
    return (
        "\n".join(lines)
        .replace(": true", ": True")
        .replace(": false", ": False")
        .replace(": null", ": None")
    )


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Reactor Tool Catalog",
        " *",
        " * Reactor plugins' commands and backends, as tool bundles agents can take.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { ReactorToolSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Reactor Tool Definitions",
        "// " + "=" * 76,
        "",
    ]
    for spec in specs:
        data = _drop_none(_camel(_normalised(spec)))
        lines.append(
            f"export const {const_name_of(spec)}: ReactorToolSpec = "
            f"{json.dumps(data, indent=2, ensure_ascii=False)};"
        )
        lines.append("")
    lines.extend(
        [
            "// " + "=" * 76,
            "// Reactor Tool Catalog",
            "// " + "=" * 76,
            "",
            "export const REACTOR_TOOL_CATALOG: Record<string, ReactorToolSpec> = {",
        ]
    )
    for spec in specs:
        lines.append(f"  '{spec['id']}': {const_name_of(spec)},")
    lines.extend(
        [
            "};",
            "",
            "export function getReactorToolSpecs(): ReactorToolSpec[] {",
            "  return Object.values(REACTOR_TOOL_CATALOG);",
            "}",
            "",
            "function resolveReactorToolId(toolId: string): string {",
            "  if (toolId in REACTOR_TOOL_CATALOG) return toolId;",
            "  const idx = toolId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = toolId.slice(0, idx);",
            "    if (base in REACTOR_TOOL_CATALOG) return base;",
            "  }",
            "  return toolId;",
            "}",
            "",
            "export function getReactorToolSpec(toolId: string): ReactorToolSpec | undefined {",
            "  return REACTOR_TOOL_CATALOG[resolveReactorToolId(toolId)];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML reactor-tool specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading reactor tool specs from {args.specs_dir}...")
    specs = load_reactor_tool_specs(args.specs_dir)
    print(f"Loaded {len(specs)} reactor tool specifications")

    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(specs))
    print(f"Generated Python code: {args.python_output}")

    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(f"Generated TypeScript code: {args.typescript_output}")


if __name__ == "__main__":
    main()
