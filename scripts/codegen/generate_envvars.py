#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML environment variable specifications.

Usage:
    python generate_envvars.py \\
      --specs-dir specs/envvars \\
      --python-output agent_runtimes/config/envvars.py \\
      --typescript-output src/config/envvars.ts
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


def load_envvar_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all envvar YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from environment variable specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Environment Variable Catalog.",
        "",
        "Predefined environment variable specifications.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from dataclasses import dataclass",
        "from typing import Dict, List, Optional",
        "",
        "",
        "# " + "=" * 76,
        "# Environment Variable Specification",
        "# " + "=" * 76,
        "",
        "@dataclass",
        "class EnvvarSpec:",
        '    """Environment variable specification."""',
        "",
        "    id: str",
        "    name: str",
        "    description: str",
        "    registrationUrl: Optional[str]",
        "    tags: List[str]",
        "    icon: Optional[str]",
        "    emoji: Optional[str]",
        "",
        "",
        "# " + "=" * 76,
        "# Environment Variable Definitions",
        "# " + "=" * 76,
        "",
    ]

    # Generate envvar constants
    for spec in specs:
        envvar_id = spec["id"]
        const_name = f"{envvar_id}_SPEC"

        registration_url_value = (
            f'"{spec.get("registrationUrl")}"'
            if spec.get("registrationUrl")
            else "None"
        )

        # Format optional fields
        icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
        emoji = f'"{spec.get("emoji")}"' if spec.get("emoji") else "None"

        lines.extend(
            [
                f"{const_name} = EnvvarSpec(",
                f'    id="{envvar_id}",',
                f'    name="{spec["name"]}",',
                f'    description="{spec["description"]}",',
                f"    registrationUrl={registration_url_value},",
                f"    tags={_fmt_list(spec.get('tags', []))},",
                f"    icon={icon},",
                f"    emoji={emoji},",
                ")",
                "",
            ]
        )

    # Generate catalog dictionary
    lines.extend(
        [
            "# " + "=" * 76,
            "# Environment Variable Catalog",
            "# " + "=" * 76,
            "",
            "ENVVAR_CATALOG: Dict[str, EnvvarSpec] = {",
        ]
    )

    for spec in specs:
        envvar_id = spec["id"]
        const_name = f"{envvar_id}_SPEC"
        lines.append(f'    "{envvar_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
            "",
            "def get_envvar_spec(envvar_id: str) -> EnvvarSpec:",
            '    """Get environment variable specification by ID."""',
            "    if envvar_id not in ENVVAR_CATALOG:",
            f'        raise ValueError(f"Unknown environment variable: {{envvar_id}}")',
            "    return ENVVAR_CATALOG[envvar_id]",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from environment variable specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Environment Variable Catalog",
        " *",
        " * Predefined environment variable specifications.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "export interface EnvvarSpec {",
        "  id: string;",
        "  name: string;",
        "  description: string;",
        "  registrationUrl?: string;",
        "  tags: string[];",
        "  icon?: string;",
        "  emoji?: string;",
        "}",
        "",
        "// " + "=" * 76,
        "// Environment Variable Definitions",
        "// " + "=" * 76,
        "",
    ]

    # Generate envvar constants
    for spec in specs:
        envvar_id = spec["id"]
        const_name = f"{envvar_id}_SPEC"

        # Format arrays for TypeScript
        tags_json = str(spec.get("tags", [])).replace("'", '"')
        registration_url = (
            f"registrationUrl: '{spec['registrationUrl']}',"
            if spec.get("registrationUrl")
            else ""
        )

        # Format optional fields
        icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
        emoji = f"'{spec.get('emoji')}'" if spec.get("emoji") else "undefined"

        lines.extend(
            [
                f"export const {const_name}: EnvvarSpec = {{",
                f"  id: '{envvar_id}',",
                f"  name: '{spec['name']}',",
                f"  description: '{spec['description']}',",
            ]
        )

        if registration_url:
            lines.append(f"  {registration_url}")

        lines.extend(
            [
                f"  tags: {tags_json},",
                f"  icon: {icon},",
                f"  emoji: {emoji},",
                "};",
                "",
            ]
        )

    # Generate catalog object
    lines.extend(
        [
            "// " + "=" * 76,
            "// Environment Variable Catalog",
            "// " + "=" * 76,
            "",
            "export const ENVVAR_CATALOG: Record<string, EnvvarSpec> = {",
        ]
    )

    for spec in specs:
        envvar_id = spec["id"]
        const_name = f"{envvar_id}_SPEC"
        lines.append(f"  '{envvar_id}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export function getEnvvarSpec(envvarId: string): EnvvarSpec {",
            "  const spec = ENVVAR_CATALOG[envvarId];",
            "  if (!spec) {",
            "    throw new Error(`Unknown environment variable: ${envvarId}`);",
            "  }",
            "  return spec;",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML environment variable specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing envvar YAML files",
    )
    parser.add_argument(
        "--python-output",
        type=Path,
        required=True,
        help="Output path for Python file",
    )
    parser.add_argument(
        "--typescript-output",
        type=Path,
        required=True,
        help="Output path for TypeScript file",
    )

    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory not found: {args.specs_dir}", file=sys.stderr)
        sys.exit(1)

    # Load specs
    specs = load_envvar_specs(args.specs_dir)
    if not specs:
        print(
            f"Warning: No envvar specifications found in {args.specs_dir}",
            file=sys.stderr,
        )
        return

    # Generate Python code
    python_code = generate_python_code(specs)
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(python_code)
    print(f"Generated Python code: {args.python_output}")

    # Generate TypeScript code
    typescript_code = generate_typescript_code(specs)
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(typescript_code)
    print(f"Generated TypeScript code: {args.typescript_output}")


if __name__ == "__main__":
    main()
