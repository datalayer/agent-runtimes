#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML skill specifications.

Usage:
    python generate_skills.py \\
      --specs-dir specs/skills \\
      --python-output agent_runtimes/config/skills.py \\
      --typescript-output src/config/skills.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def load_skill_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all skill YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from skill specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Skill Catalog.",
        "",
        "Predefined skill configurations that can be used by agents.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "import os",
        "from typing import Dict, List",
        "",
        "from agent_runtimes.types import SkillSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Skill Definitions",
        "# " + "=" * 76,
        "",
    ]

    # Generate skill constants
    for spec in specs:
        skill_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{skill_id.upper().replace('-', '_')}_SKILL_SPEC{version_suffix(version)}"
        )

        icon = f'"{spec.get("icon")}"' if spec.get("icon") else "None"
        emoji = f'"{spec.get("emoji")}"' if spec.get("emoji") else "None"
        module_val = f'"{spec["module"]}"' if spec.get("module") else "None"
        package_val = f'"{spec["package"]}"' if spec.get("package") else "None"
        method_val = f'"{spec["method"]}"' if spec.get("method") else "None"
        path_val = f'"{spec["path"]}"' if spec.get("path") else "None"

        spec_lines = [
            f"{const_name} = SkillSpec(",
            f'    id="{skill_id}",',
            f'    version="{version}",',
            f'    name="{spec["name"]}",',
            f'    description="{spec["description"]}",',
            f"    module={module_val},",
            f"    package={package_val},",
            f"    method={method_val},",
            f"    path={path_val},",
        ]

        # Only emit agentskills.io attributes when present in the YAML
        if spec.get("license"):
            spec_lines.append(f'    license="{spec["license"]}",')
        if spec.get("compatibility"):
            spec_lines.append(f'    compatibility="{spec["compatibility"]}",')
        if spec.get("allowed-tools"):
            spec_lines.append(f"    allowed_tools={_fmt_list(spec['allowed-tools'])},")
        if spec.get("skill-metadata"):
            skill_metadata_val = (
                "{"
                + ", ".join(f'"{k}": "{v}"' for k, v in spec["skill-metadata"].items())
                + "}"
            )
            spec_lines.append(f"    skill_metadata={skill_metadata_val},")

        spec_lines.extend(
            [
                f"    envvars={_fmt_list(spec.get('envvars', []))},",
                f"    optional_env_vars={_fmt_list(spec.get('optional_env_vars', []))},",
                f"    dependencies={_fmt_list(spec.get('dependencies', []))},",
                f"    tags={_fmt_list(spec.get('tags', []))},",
                f"    icon={icon},",
                f"    emoji={emoji},",
                f"    enabled={spec.get('enabled', True)},",
                ")",
                "",
            ]
        )

        lines.extend(spec_lines)

    # Generate catalog dictionary
    lines.extend(
        [
            "# " + "=" * 76,
            "# Skill Catalog",
            "# " + "=" * 76,
            "",
            "SKILLS_CATALOG: Dict[str, SkillSpec] = {",
        ]
    )

    for spec in specs:
        skill_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{skill_id.upper().replace('-', '_')}_SKILL_SPEC{version_suffix(version)}"
        )
        lines.append(f'    "{skill_id}": {const_name},')

    lines.extend(
        [
            "}",
            "",
            "",
            "def check_env_vars_available(env_vars: List[str]) -> bool:",
            '    """',
            "    Check if all required environment variables are set.",
            "",
            "    Args:",
            "        env_vars: List of environment variable names to check.",
            "",
            "    Returns:",
            "        True if all env vars are set (non-empty), False otherwise.",
            '    """',
            "    if not env_vars:",
            "        return True",
            "    return all(os.environ.get(var.rsplit(':', 1)[0]) for var in env_vars)",
            "",
            "",
            "def get_skill_spec(skill_id: str) -> SkillSpec | None:",
            '    """',
            "    Get a skill specification by ID (accepts both bare and versioned refs).",
            "",
            "    Args:",
            "        skill_id: The unique identifier of the skill.",
            "",
            "    Returns:",
            "        The SkillSpec, or None if not found.",
            '    """',
            "    spec = SKILLS_CATALOG.get(skill_id)",
            "    if spec is not None:",
            "        return spec",
            "    base, _, ver = skill_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return SKILLS_CATALOG.get(base)",
            "    return None",
            "",
            "",
            "def list_skill_specs() -> List[SkillSpec]:",
            '    """',
            "    List all skill specifications.",
            "",
            "    Returns:",
            "        List of all SkillSpec configurations.",
            '    """',
            "    return list(SKILLS_CATALOG.values())",
            "",
        ]
    )

    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from skill specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Skill Catalog",
        " *",
        " * Predefined skill configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { SkillSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Skill Definitions",
        "// " + "=" * 76,
        "",
    ]

    # Generate skill constants
    for spec in specs:
        skill_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{skill_id.upper().replace('-', '_')}_SKILL_SPEC{version_suffix(version)}"
        )

        # Format arrays for TypeScript
        envvars_json = str(spec.get("envvars", [])).replace("'", '"')
        optional_env_vars_json = str(spec.get("optional_env_vars", [])).replace(
            "'", '"'
        )
        dependencies_json = str(spec.get("dependencies", [])).replace("'", '"')
        tags_json = str(spec.get("tags", [])).replace("'", '"')

        # Format optional fields
        icon = f"'{spec.get('icon')}'" if spec.get("icon") else "undefined"
        emoji = f"'{spec.get('emoji')}'" if spec.get("emoji") else "undefined"
        module_ts = f"'{spec['module']}'" if spec.get("module") else "undefined"
        package_ts = f"'{spec['package']}'" if spec.get("package") else "undefined"
        method_ts = f"'{spec['method']}'" if spec.get("method") else "undefined"
        path_ts = f"'{spec['path']}'" if spec.get("path") else "undefined"

        ts_lines = [
            f"export const {const_name}: SkillSpec = {{",
            f"  id: '{skill_id}',",
            f"  version: '{version}',",
            f"  name: '{spec['name']}',",
            f"  description: '{spec['description']}',",
            f"  module: {module_ts},",
            f"  package: {package_ts},",
            f"  method: {method_ts},",
            f"  path: {path_ts},",
        ]

        # Only emit agentskills.io attributes when present in the YAML
        if spec.get("license"):
            ts_lines.append(f"  license: '{spec['license']}',")
        if spec.get("compatibility"):
            ts_lines.append(f"  compatibility: '{spec['compatibility']}',")
        if spec.get("allowed-tools"):
            allowed_tools_json = str(spec["allowed-tools"]).replace("'", '"')
            ts_lines.append(f"  allowedTools: {allowed_tools_json},")
        if spec.get("skill-metadata"):
            meta_entries = ", ".join(
                f"'{k}': '{v}'" for k, v in spec["skill-metadata"].items()
            )
            ts_lines.append(f"  skillMetadata: {{ {meta_entries} }},")

        ts_lines.extend(
            [
                f"  requiredEnvVars: {envvars_json},",
                f"  optionalEnvVars: {optional_env_vars_json},",
                f"  dependencies: {dependencies_json},",
                f"  tags: {tags_json},",
                f"  icon: {icon},",
                f"  emoji: {emoji},",
                f"  enabled: {str(spec.get('enabled', True)).lower()},",
                "};",
                "",
            ]
        )

        lines.extend(ts_lines)

    # Generate catalog object
    lines.extend(
        [
            "// " + "=" * 76,
            "// Skill Catalog",
            "// " + "=" * 76,
            "",
            "export const SKILLS_CATALOG: Record<string, SkillSpec> = {",
        ]
    )

    for spec in specs:
        skill_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{skill_id.upper().replace('-', '_')}_SKILL_SPEC{version_suffix(version)}"
        )
        lines.append(f"  '{skill_id}': {const_name},")

    lines.extend(
        [
            "};",
            "",
            "export function getSkillSpecs(): SkillSpec[] {",
            "  return Object.values(SKILLS_CATALOG);",
            "}",
            "",
            "function resolveSkillId(skillId: string): string {",
            "  if (skillId in SKILLS_CATALOG) return skillId;",
            "  const idx = skillId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = skillId.slice(0, idx);",
            "    if (base in SKILLS_CATALOG) return base;",
            "  }",
            "  return skillId;",
            "}",
            "",
            "export function getSkillSpec(skillId: string): SkillSpec | undefined {",
            "  return SKILLS_CATALOG[resolveSkillId(skillId)];",
            "}",
            "",
        ]
    )

    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML skill specifications"
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

    # Validate specs directory
    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    # Load specifications
    print(f"Loading skill specs from {args.specs_dir}...")
    specs = load_skill_specs(args.specs_dir)
    print(f"Loaded {len(specs)} skill specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} skill specs")


if __name__ == "__main__":
    main()
