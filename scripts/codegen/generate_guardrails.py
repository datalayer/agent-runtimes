#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML guardrail specifications.

Usage:
    python generate_guardrails.py \\
      --specs-dir specs/guardrails \\
      --python-output agent_runtimes/specs/guardrails.py \\
      --typescript-output src/specs/guardrails.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import yaml


def _fmt_list(items: list[str]) -> str:
    """Format a list of strings with double quotes for ruff compliance."""
    if not items:
        return "[]"
    return "[" + ", ".join(f'"{item}"' for item in items) + "]"


def _ts_list(items: list[str]) -> str:
    """Format a list of strings for TypeScript."""
    if not items:
        return "[]"
    return "[" + ", ".join(f"'{item}'" for item in items) + "]"


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


# ============================================================================
# Python code generation
# ============================================================================

def _py_permissions(perms: dict[str, bool]) -> str:
    """Format permissions dict for Python."""
    lines = []
    for key in ["read:data", "write:data", "execute:code", "access:internet", "send:email", "deploy:production"]:
        lines.append(f'        "{key}": {perms.get(key, False)},')
    return "{\n" + "\n".join(lines) + "\n    }"


def _py_token_limits(tl: dict[str, Any]) -> str:
    """Format token limits for Python."""
    return (
        "{"
        + f'"per_run": "{tl.get("per_run", "0")}", '
        + f'"per_day": "{tl.get("per_day", "0")}", '
        + f'"per_month": "{tl.get("per_month", "0")}"'
        + "}"
    )


def _py_optional_dict(d: dict[str, Any] | None, keys: list[str]) -> str:
    """Format an optional dict for Python."""
    if d is None:
        return "None"
    parts = []
    for k in keys:
        v = d.get(k)
        if isinstance(v, bool):
            parts.append(f'"{k}": {v}')
        elif isinstance(v, int):
            parts.append(f'"{k}": {v}')
        elif isinstance(v, str):
            parts.append(f'"{k}": "{_esc_dq(v)}"')
        elif isinstance(v, list):
            parts.append(f'"{k}": {_fmt_list(v)}')
        elif v is None:
            parts.append(f'"{k}": None')
    return "{" + ", ".join(parts) + "}"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from guardrail specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Guardrail Catalog.",
        "",
        "Predefined guardrail configurations.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Any, Dict, List, Optional",
        "from dataclasses import dataclass, field",
        "",
        "",
        "@dataclass",
        "class GuardrailSpec:",
        '    """Guardrail specification."""',
        "",
        "    id: str",
        "    name: str",
        "    description: str",
        "    identity_provider: str",
        "    identity_name: str",
        "    permissions: Dict[str, bool]",
        "    token_limits: Dict[str, str]",
        "    data_scope: Optional[Dict[str, Any]] = None",
        "    data_handling: Optional[Dict[str, Any]] = None",
        "    approval_policy: Optional[Dict[str, Any]] = None",
        "    tool_limits: Optional[Dict[str, Any]] = None",
        "    audit: Optional[Dict[str, Any]] = None",
        "    content_safety: Optional[Dict[str, Any]] = None",
        "",
        "",
        "# " + "=" * 76,
        "# Guardrail Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        g_id = spec["id"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC"
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))
        perms = spec.get("permissions", {})
        tl = spec.get("token_limits", {})

        lines.extend(
            [
                f"{const_name} = GuardrailSpec(",
                f'    id="{g_id}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    identity_provider="{spec.get("identity_provider", "")}",',
                f'    identity_name="{spec.get("identity_name", "")}",',
                f"    permissions={_py_permissions(perms)},",
                f"    token_limits={_py_token_limits(tl)},",
            ]
        )

        # Optional sections
        ds = spec.get("data_scope")
        if ds:
            lines.append(
                f"    data_scope={_py_optional_dict(ds, ['allowed_systems', 'allowed_objects', 'denied_objects', 'denied_fields'])},"
            )
        dh = spec.get("data_handling")
        if dh:
            lines.append(
                f"    data_handling={_py_optional_dict(dh, ['default_aggregation', 'allow_row_level_output', 'max_rows_in_output', 'redact_fields', 'hash_fields', 'pii_detection', 'pii_action'])},"
            )
        ap = spec.get("approval_policy")
        if ap:
            lines.append(
                f"    approval_policy={_py_optional_dict(ap, ['require_manual_approval_for', 'auto_approved'])},"
            )
        tlim = spec.get("tool_limits")
        if tlim:
            lines.append(
                f"    tool_limits={_py_optional_dict(tlim, ['max_tool_calls', 'max_query_rows', 'max_query_runtime', 'max_time_window_days'])},"
            )
        aud = spec.get("audit")
        if aud:
            lines.append(
                f"    audit={_py_optional_dict(aud, ['log_tool_calls', 'log_query_metadata_only', 'retain_days', 'require_lineage_in_report'])},"
            )
        cs = spec.get("content_safety")
        if cs:
            lines.append(
                f"    content_safety={_py_optional_dict(cs, ['treat_crm_text_fields_as_untrusted', 'do_not_follow_instructions_from_data'])},"
            )

        lines.extend([")", ""])

    lines.extend(
        [
            "# " + "=" * 76,
            "# Guardrail Catalog",
            "# " + "=" * 76,
            "",
            "GUARDRAIL_CATALOG: Dict[str, GuardrailSpec] = {",
        ]
    )
    for spec in specs:
        g_id = spec["id"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC"
        lines.append(f'    "{g_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_guardrail_spec(guardrail_id: str) -> GuardrailSpec | None:",
            '    """Get a guardrail specification by ID."""',
            "    return GUARDRAIL_CATALOG.get(guardrail_id)",
            "",
            "",
            "def list_guardrail_specs() -> List[GuardrailSpec]:",
            '    """List all guardrail specifications."""',
            "    return list(GUARDRAIL_CATALOG.values())",
            "",
        ]
    )
    return "\n".join(lines)


# ============================================================================
# TypeScript code generation
# ============================================================================

def _ts_permissions(perms: dict[str, bool]) -> str:
    """Format permissions for TypeScript."""
    lines = []
    for key in ["read:data", "write:data", "execute:code", "access:internet", "send:email", "deploy:production"]:
        lines.append(f"    '{key}': {str(perms.get(key, False)).lower()},")
    return "{\n" + "\n".join(lines) + "\n  }"


def _ts_token_limits(tl: dict[str, Any]) -> str:
    """Format token limits for TypeScript."""
    return (
        "{ "
        + f"per_run: '{tl.get('per_run', '0')}', "
        + f"per_day: '{tl.get('per_day', '0')}', "
        + f"per_month: '{tl.get('per_month', '0')}'"
        + " }"
    )


def _ts_optional_obj(d: dict[str, Any] | None, keys: list[str]) -> str:
    """Format optional object for TypeScript."""
    if d is None:
        return "undefined"
    parts = []
    for k in keys:
        v = d.get(k)
        if isinstance(v, bool):
            parts.append(f"{k}: {str(v).lower()}")
        elif isinstance(v, int):
            parts.append(f"{k}: {v}")
        elif isinstance(v, str):
            parts.append(f"{k}: '{_esc(v)}'")
        elif isinstance(v, list):
            parts.append(f"{k}: {_ts_list(v)}")
    return "{ " + ", ".join(parts) + " }"


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from guardrail specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Guardrail Catalog",
        " *",
        " * Predefined guardrail configurations.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { GuardrailSpec } from '../types/Types';",
        "",
        "// " + "=" * 76,
        "// Guardrail Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        g_id = spec["id"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC"
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))
        perms = spec.get("permissions", {})
        tl = spec.get("token_limits", {})

        lines.extend(
            [
                f"export const {const_name}: GuardrailSpec = {{",
                f"  id: '{g_id}',",
                f"  name: '{_esc(spec['name'])}',",
                f"  description: '{desc}',",
                f"  identity_provider: '{spec.get('identity_provider', '')}',",
                f"  identity_name: '{spec.get('identity_name', '')}',",
                f"  permissions: {_ts_permissions(perms)},",
                f"  token_limits: {_ts_token_limits(tl)},",
            ]
        )

        # Optional sections
        ds = spec.get("data_scope")
        if ds:
            lines.append(
                f"  data_scope: {_ts_optional_obj(ds, ['allowed_systems', 'allowed_objects', 'denied_objects', 'denied_fields'])},"
            )
        dh = spec.get("data_handling")
        if dh:
            lines.append(
                f"  data_handling: {_ts_optional_obj(dh, ['default_aggregation', 'allow_row_level_output', 'max_rows_in_output', 'redact_fields', 'hash_fields', 'pii_detection', 'pii_action'])},"
            )
        ap = spec.get("approval_policy")
        if ap:
            lines.append(
                f"  approval_policy: {_ts_optional_obj(ap, ['require_manual_approval_for', 'auto_approved'])},"
            )
        tlim = spec.get("tool_limits")
        if tlim:
            lines.append(
                f"  tool_limits: {_ts_optional_obj(tlim, ['max_tool_calls', 'max_query_rows', 'max_query_runtime', 'max_time_window_days'])},"
            )
        aud = spec.get("audit")
        if aud:
            lines.append(
                f"  audit: {_ts_optional_obj(aud, ['log_tool_calls', 'log_query_metadata_only', 'retain_days', 'require_lineage_in_report'])},"
            )
        cs = spec.get("content_safety")
        if cs:
            lines.append(
                f"  content_safety: {_ts_optional_obj(cs, ['treat_crm_text_fields_as_untrusted', 'do_not_follow_instructions_from_data'])},"
            )

        lines.extend(["};", ""])

    lines.extend(
        [
            "// " + "=" * 76,
            "// Guardrail Catalog",
            "// " + "=" * 76,
            "",
            "export const GUARDRAIL_CATALOG: Record<string, GuardrailSpec> = {",
        ]
    )
    for spec in specs:
        g_id = spec["id"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC"
        lines.append(f"  '{g_id}': {const_name},")
    lines.extend(
        [
            "};",
            "",
            "/**",
            " * Map identity provider to an icon key for the UI.",
            " */",
            "export const GUARDRAIL_IDENTITY_ICONS: Record<string, string> = {",
            "  datalayer: 'mark-github',",
            "  github: 'mark-github',",
            "  'azure-ad': 'shield-lock',",
            "  google: 'globe',",
            "};",
            "",
            "export function getGuardrailSpecs(): GuardrailSpec[] {",
            "  return Object.values(GUARDRAIL_CATALOG);",
            "}",
            "",
            "export function getGuardrailSpec(",
            "  guardrailId: string,",
            "): GuardrailSpec | undefined {",
            "  return GUARDRAIL_CATALOG[guardrailId];",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML guardrail specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory does not exist: {args.specs_dir}")
        sys.exit(1)

    print(f"Loading guardrail specs from {args.specs_dir}...")
    specs = load_specs(args.specs_dir)
    print(f"Loaded {len(specs)} guardrail specifications")

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

    print(f"\n✓ Successfully generated code from {len(specs)} guardrail specs")


if __name__ == "__main__":
    main()
