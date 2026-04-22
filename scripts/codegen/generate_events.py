#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML event specifications.

Usage:
    python generate_events.py \\
      --specs-dir specs/events \\
      --python-output agent_runtimes/specs/events.py \\
      --typescript-output src/specs/events.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


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
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


def _py_field(f: dict[str, Any]) -> str:
    """Format an EventField dict body.

    Returns the lines inside ``EventField(\n    **{\n        ...\n    }\n)``
    so that the generated output matches ``ruff format`` exactly.
    """
    parts = [
        f'                "name": "{f["name"]}"',
        f'                "label": "{f["label"]}"',
        f'                "type": "{f["type"]}"',
        f'                "required": {str(f["required"])}',
    ]
    if "description" in f:
        parts.append(f'                "description": "{_esc_dq(f["description"])}"')
    if "placeholder" in f:
        parts.append(f'                "placeholder": "{_esc_dq(f["placeholder"])}"')
    return ",\n".join(parts)


def _ts_field(f: dict[str, Any]) -> str:
    """Format an EventField as a TypeScript object literal."""
    parts = [
        f"name: '{f['name']}'",
        f"label: '{_esc(f['label'])}'",
        f"type: '{f['type']}'",
        f"required: {'true' if f['required'] else 'false'}",
    ]
    if "description" in f:
        parts.append(f"description: '{_esc(f['description'])}'")
    if "placeholder" in f:
        parts.append(f"placeholder: '{_esc(f['placeholder'])}'")
    return "{ " + ", ".join(parts) + " }"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from event specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Event Catalog.",
        "",
        "Predefined event type specifications for agent lifecycle and guardrail events.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List",
        "",
        "from agent_runtimes.types import EventField, EventSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Event Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        event_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{event_id.upper().replace('-', '_')}_EVENT_SPEC{version_suffix(version)}"
        )
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))
        kind = spec.get("kind", event_id)
        fields = spec.get("fields", [])

        lines.extend(
            [
                f"{const_name} = EventSpec(",
                f'    id="{event_id}",',
                f'    version="{version}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    kind="{kind}",',
            ]
        )
        if fields:
            lines.append("    fields=[")
            for f in fields:
                field_body = _py_field(f)
                lines.extend(
                    [
                        "        EventField(",
                        "            **{",
                        field_body + ",",
                        "            }",
                        "        ),",
                    ]
                )
            lines.append("    ],")
        lines.extend([")", ""])

    lines.extend(
        [
            "# " + "=" * 76,
            "# Event Catalog",
            "# " + "=" * 76,
            "",
            "EVENT_CATALOG: Dict[str, EventSpec] = {",
        ]
    )
    for spec in specs:
        event_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{event_id.upper().replace('-', '_')}_EVENT_SPEC{version_suffix(version)}"
        )
        lines.append(f'    "{event_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "# Event kind constants for programmatic use",
        ]
    )

    spec_kinds = {spec.get("kind", spec["id"]) for spec in specs}

    for spec in specs:
        kind = spec.get("kind", spec["id"])
        const = kind.upper().replace("-", "_")
        lines.append(f'EVENT_KIND_{const} = "{kind}"')

    # Backward-compat constants used by older runtime code paths.
    if "agent-assigned" not in spec_kinds:
        lines.append('EVENT_KIND_AGENT_ASSIGNED = "agent-assigned"')
    lines.extend(
        [
            "",
            "",
            "def get_event_spec(event_id: str) -> EventSpec | None:",
            '    """Get an event specification by ID (accepts both bare and versioned refs)."""',
            "    spec = EVENT_CATALOG.get(event_id)",
            "    if spec is not None:",
            "        return spec",
            '    base, _, ver = event_id.rpartition(":")',
            '    if base and "." in ver:',
            "        return EVENT_CATALOG.get(base)",
            "    return None",
            "",
            "",
            "def list_event_specs() -> List[EventSpec]:",
            '    """List all event specifications."""',
            "    return list(EVENT_CATALOG.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from event specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Event Catalog",
        " *",
        " * Predefined event type specifications for agent lifecycle and guardrail events.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { EventSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Event Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        event_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{event_id.upper().replace('-', '_')}_EVENT_SPEC{version_suffix(version)}"
        )
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))
        kind = spec.get("kind", event_id)
        fields = spec.get("fields", [])

        lines.extend(
            [
                f"export const {const_name}: EventSpec = {{",
                f"  id: '{event_id}',",
                f"  version: '{version}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  kind: '{kind}',",
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

    # Event kind constants
    spec_kinds = {spec.get("kind", spec["id"]) for spec in specs}
    lines.append("// Event kind constants for programmatic use")
    for spec in specs:
        kind = spec.get("kind", spec["id"])
        const = kind.upper().replace("-", "_")
        lines.append(f"export const EVENT_KIND_{const} = '{kind}';")
    if "agent-assigned" not in spec_kinds:
        lines.append("export const EVENT_KIND_AGENT_ASSIGNED = 'agent-assigned';")
    lines.append("")

    lines.extend(
        [
            "// " + "=" * 76,
            "// Event Catalog",
            "// " + "=" * 76,
            "",
            "export const EVENT_CATALOG: Record<string, EventSpec> = {",
        ]
    )
    for spec in specs:
        event_id = spec["id"]
        version = spec["version"]
        const_name = (
            f"{event_id.upper().replace('-', '_')}_EVENT_SPEC{version_suffix(version)}"
        )
        lines.append(f"  '{event_id}': {const_name},")
    lines.extend(
        [
            "};",
            "",
            "export function getEventSpecs(): EventSpec[] {",
            "  return Object.values(EVENT_CATALOG);",
            "}",
            "",
            "function resolveEventIdTs(eventId: string): string {",
            "  if (eventId in EVENT_CATALOG) return eventId;",
            "  const idx = eventId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = eventId.slice(0, idx);",
            "    if (base in EVENT_CATALOG) return base;",
            "  }",
            "  return eventId;",
            "}",
            "",
            "export function getEventSpec(eventId: string): EventSpec | undefined {",
            "  return EVENT_CATALOG[resolveEventIdTs(eventId)];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML event specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading event specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} event specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} event specs")


if __name__ == "__main__":
    main()
