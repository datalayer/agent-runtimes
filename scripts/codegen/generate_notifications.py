#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML notification channel specifications.

Usage:
    python generate_notifications.py \\
      --specs-dir specs/notifications \\
      --python-output agent_runtimes/specs/notifications.py \\
      --typescript-output src/specs/notifications.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml


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
            specs.append(spec)
    return specs


def _py_field(f: dict[str, Any]) -> str:
    """Format a NotificationField as a Python dict literal."""
    parts = [
        f'"name": "{f["name"]}"',
        f'"label": "{f["label"]}"',
        f'"type": "{f["type"]}"',
        f'"required": {str(f["required"])}',
    ]
    if "placeholder" in f:
        parts.append(f'"placeholder": "{_esc_dq(f["placeholder"])}"')
    if "default" in f:
        val = f["default"]
        if isinstance(val, bool):
            parts.append(f'"default": {str(val)}')
        elif isinstance(val, str):
            parts.append(f'"default": "{val}"')
        else:
            parts.append(f'"default": {val}')
    return "{" + ", ".join(parts) + "}"


def _ts_field(f: dict[str, Any]) -> str:
    """Format a NotificationField as a TypeScript object literal."""
    parts = [
        f"name: '{f['name']}'",
        f"label: '{_esc(f['label'])}'",
        f"type: '{f['type']}'",
        f"required: {'true' if f['required'] else 'false'}",
    ]
    if "placeholder" in f:
        parts.append(f"placeholder: '{_esc(f['placeholder'])}'")
    if "default" in f:
        val = f["default"]
        if isinstance(val, bool):
            parts.append(f"default: {'true' if val else 'false'}")
        elif isinstance(val, str):
            parts.append(f"default: '{val}'")
        else:
            parts.append(f"default: {val}")
    return "{ " + ", ".join(parts) + " }"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from notification specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Notification Channel Catalog.",
        "",
        "Predefined notification channel configurations.",
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
        "class NotificationField(BaseModel):",
        '    """Dynamic field definition for a notification channel."""',
        "",
        '    name: str = Field(..., description="Field key")',
        '    label: str = Field(..., description="Display label")',
        '    type: Literal["string", "boolean", "number"] = Field(..., description="Input type")',
        '    required: bool = Field(default=False, description="Whether this field is required")',
        '    placeholder: Optional[str] = Field(default=None, description="UI placeholder")',
        '    default: str | bool | int | float | None = Field(default=None, description="Default value")',
        "",
        "",
        "class NotificationChannelSpec(BaseModel):",
        '    """Notification channel specification."""',
        "",
        '    id: str = Field(..., description="Unique channel identifier")',
        '    name: str = Field(..., description="Display name")',
        '    description: str = Field(default="", description="Channel description")',
        '    icon: str = Field(default="bell", description="Icon identifier")',
        '    available: bool = Field(default=True, description="Whether channel is currently available")',
        '    coming_soon: bool = Field(default=False, description="Whether channel is planned but not available yet")',
        '    fields: List[NotificationField] = Field(default_factory=list, description="Channel configuration fields")',
        "",
        "",
        "# " + "=" * 76,
        "# Notification Channel Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        ch_id = spec["id"]
        const_name = f"{ch_id.upper().replace('-', '_')}_NOTIFICATION_SPEC"
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))
        fields = spec.get("fields", [])

        lines.extend(
            [
                f"{const_name} = NotificationChannelSpec(",
                f'    id="{ch_id}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    icon="{spec.get("icon", "bell")}",',
                f"    available={spec.get('available', True)},",
                f"    coming_soon={spec.get('coming_soon', False)},",
            ]
        )
        if fields:
            field_strs = [_py_field(f) for f in fields]
            lines.append("    fields=[")
            for fs in field_strs:
                lines.append(f"        NotificationField(**{fs}),")
            lines.append("    ],")
        lines.extend([")", ""])

    lines.extend(
        [
            "# " + "=" * 76,
            "# Notification Channel Catalog",
            "# " + "=" * 76,
            "",
            "NOTIFICATION_CATALOG: Dict[str, NotificationChannelSpec] = {",
        ]
    )
    for spec in specs:
        ch_id = spec["id"]
        const_name = f"{ch_id.upper().replace('-', '_')}_NOTIFICATION_SPEC"
        lines.append(f'    "{ch_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_notification_spec(channel_id: str) -> NotificationChannelSpec | None:",
            '    """Get a notification channel specification by ID."""',
            "    return NOTIFICATION_CATALOG.get(channel_id)",
            "",
            "",
            "def list_notification_specs() -> List[NotificationChannelSpec]:",
            '    """List all notification channel specifications."""',
            "    return list(NOTIFICATION_CATALOG.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from notification specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Notification Channel Catalog",
        " *",
        " * Predefined notification channel configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { NotificationChannelSpec } from '../types/types';",
        "",
        "// " + "=" * 76,
        "// Notification Channel Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        ch_id = spec["id"]
        const_name = f"{ch_id.upper().replace('-', '_')}_NOTIFICATION_SPEC"
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))
        fields = spec.get("fields", [])

        lines.extend(
            [
                f"export const {const_name}: NotificationChannelSpec = {{",
                f"  id: '{ch_id}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  icon: '{spec.get('icon', 'bell')}',",
                f"  available: {str(spec.get('available', True)).lower()},",
                f"  coming_soon: {str(spec.get('coming_soon', False)).lower()},",
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

    lines.extend(
        [
            "// " + "=" * 76,
            "// Notification Channel Catalog",
            "// " + "=" * 76,
            "",
            "export const NOTIFICATION_CATALOG: Record<string, NotificationChannelSpec> = {",
        ]
    )
    for spec in specs:
        ch_id = spec["id"]
        const_name = f"{ch_id.upper().replace('-', '_')}_NOTIFICATION_SPEC"
        lines.append(f"  '{ch_id}': {const_name},")
    lines.extend(
        [
            "};",
            "",
            "export function getNotificationSpecs(): NotificationChannelSpec[] {",
            "  return Object.values(NOTIFICATION_CATALOG);",
            "}",
            "",
            "export function getNotificationSpec(",
            "  channelId: string,",
            "): NotificationChannelSpec | undefined {",
            "  return NOTIFICATION_CATALOG[channelId];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML notification specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading notification specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} notification specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} notification specs")


if __name__ == "__main__":
    main()
