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

from versioning import ensure_spec_version, version_suffix, versioned_ref


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
            ensure_spec_version(spec)
            specs.append(spec)
    return specs


# ============================================================================
# Python code generation
# ============================================================================


def _py_bool(value: bool) -> str:
    return "True" if value else "False"


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
        "from typing import Dict, List, Optional",
        "",
        "from pydantic import BaseModel, Field",
        "",
        "",
        "class GuardrailPermissions(BaseModel):",
        '    """Permission toggles for a guardrail profile."""',
        "",
        '    read_data: bool = Field(default=False, description="Allow data reads")',
        '    write_data: bool = Field(default=False, description="Allow data writes")',
        '    execute_code: bool = Field(default=False, description="Allow code execution")',
        '    access_internet: bool = Field(default=False, description="Allow internet access")',
        '    send_email: bool = Field(default=False, description="Allow email sending")',
        '    deploy_production: bool = Field(default=False, description="Allow production deploys")',
        "",
        "",
        "class TokenLimitsSpec(BaseModel):",
        '    """Token budget limits."""',
        "",
        '    per_run: str = Field(default="0", description="Token budget per run")',
        '    per_day: str = Field(default="0", description="Token budget per day")',
        '    per_month: str = Field(default="0", description="Token budget per month")',
        "",
        "",
        "class DataScopeSpec(BaseModel):",
        '    """Data-access scoping rules."""',
        "",
        "    allowed_systems: List[str] = Field(default_factory=list)",
        "    allowed_objects: List[str] = Field(default_factory=list)",
        "    denied_objects: List[str] = Field(default_factory=list)",
        "    denied_fields: List[str] = Field(default_factory=list)",
        "",
        "",
        "class DataHandlingSpec(BaseModel):",
        '    """Data output and PII handling policy."""',
        "",
        "    default_aggregation: bool = Field(default=False)",
        "    allow_row_level_output: bool = Field(default=False)",
        "    max_rows_in_output: int = Field(default=0, ge=0)",
        "    redact_fields: List[str] = Field(default_factory=list)",
        "    hash_fields: List[str] = Field(default_factory=list)",
        "    pii_detection: bool = Field(default=False)",
        "    pii_action: str = Field(default='warn')",
        "",
        "",
        "class ApprovalPolicySpec(BaseModel):",
        '    """Manual/automatic approval policy."""',
        "",
        "    require_manual_approval_for: List[str] = Field(default_factory=list)",
        "    auto_approved: List[str] = Field(default_factory=list)",
        "",
        "",
        "class ToolLimitsSpec(BaseModel):",
        '    """Tool-call limits for a run."""',
        "",
        "    max_tool_calls: int = Field(default=0, ge=0)",
        "    max_query_rows: int = Field(default=0, ge=0)",
        "    max_query_runtime: str = Field(default='0s')",
        "    max_time_window_days: int = Field(default=0, ge=0)",
        "",
        "",
        "class AuditSpec(BaseModel):",
        '    """Audit/logging policy."""',
        "",
        "    log_tool_calls: bool = Field(default=True)",
        "    log_query_metadata_only: bool = Field(default=False)",
        "    retain_days: int = Field(default=30, ge=0)",
        "    require_lineage_in_report: bool = Field(default=False)",
        "",
        "",
        "class ContentSafetySpec(BaseModel):",
        '    """Prompt-injection and untrusted-content policy."""',
        "",
        "    treat_crm_text_fields_as_untrusted: bool = Field(default=False)",
        "    do_not_follow_instructions_from_data: bool = Field(default=True)",
        "",
        "",
        "class GuardrailSpec(BaseModel):",
        '    """Guardrail specification."""',
        "",
        "    id: str",
        '    version: str = "0.0.1"',
        "    name: str",
        "    description: str",
        "    identity_provider: str",
        "    identity_name: str",
        "    permissions: GuardrailPermissions",
        "    token_limits: TokenLimitsSpec",
        "    data_scope: Optional[DataScopeSpec] = None",
        "    data_handling: Optional[DataHandlingSpec] = None",
        "    approval_policy: Optional[ApprovalPolicySpec] = None",
        "    tool_limits: Optional[ToolLimitsSpec] = None",
        "    audit: Optional[AuditSpec] = None",
        "    content_safety: Optional[ContentSafetySpec] = None",
        "",
        "",
        "# " + "=" * 76,
        "# Guardrail Definitions",
        "# " + "=" * 76,
        "",
    ]

    for spec in specs:
        g_id = spec["id"]
        version = spec["version"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC{version_suffix(version)}"
        desc = _esc_dq(spec.get("description", "").strip().replace("\n", " "))
        perms = spec.get("permissions", {})
        tl = spec.get("token_limits", {})

        lines.extend(
            [
                f"{const_name} = GuardrailSpec(",
                f'    id="{g_id}",',
                f'    version="{version}",',
                f'    name="{spec["name"]}",',
                f'    description="{desc}",',
                f'    identity_provider="{spec.get("identity_provider", "")}",',
                f'    identity_name="{spec.get("identity_name", "")}",',
                "    permissions=GuardrailPermissions(",
                f"        read_data={_py_bool(perms.get('read:data', False))},",
                f"        write_data={_py_bool(perms.get('write:data', False))},",
                f"        execute_code={_py_bool(perms.get('execute:code', False))},",
                f"        access_internet={_py_bool(perms.get('access:internet', False))},",
                f"        send_email={_py_bool(perms.get('send:email', False))},",
                f"        deploy_production={_py_bool(perms.get('deploy:production', False))},",
                "    ),",
                "    token_limits=TokenLimitsSpec(",
                f'        per_run="{_esc_dq(str(tl.get("per_run", "0")))}",',
                f'        per_day="{_esc_dq(str(tl.get("per_day", "0")))}",',
                f'        per_month="{_esc_dq(str(tl.get("per_month", "0")))}",',
                "    ),",
            ]
        )

        # Optional sections
        ds = spec.get("data_scope")
        if ds:
            lines.extend(
                [
                    "    data_scope=DataScopeSpec(",
                    f"        allowed_systems={_fmt_list(ds.get('allowed_systems', []))},",
                    f"        allowed_objects={_fmt_list(ds.get('allowed_objects', []))},",
                    f"        denied_objects={_fmt_list(ds.get('denied_objects', []))},",
                    f"        denied_fields={_fmt_list(ds.get('denied_fields', []))},",
                    "    ),",
                ]
            )
        dh = spec.get("data_handling")
        if dh:
            lines.extend(
                [
                    "    data_handling=DataHandlingSpec(",
                    f"        default_aggregation={_py_bool(dh.get('default_aggregation', False))},",
                    f"        allow_row_level_output={_py_bool(dh.get('allow_row_level_output', False))},",
                    f"        max_rows_in_output={int(dh.get('max_rows_in_output', 0))},",
                    f"        redact_fields={_fmt_list(dh.get('redact_fields', []))},",
                    f"        hash_fields={_fmt_list(dh.get('hash_fields', []))},",
                    f"        pii_detection={_py_bool(dh.get('pii_detection', False))},",
                    f'        pii_action="{_esc_dq(str(dh.get("pii_action", "warn")))}",',
                    "    ),",
                ]
            )
        ap = spec.get("approval_policy")
        if ap:
            lines.extend(
                [
                    "    approval_policy=ApprovalPolicySpec(",
                    f"        require_manual_approval_for={_fmt_list(ap.get('require_manual_approval_for', []))},",
                    f"        auto_approved={_fmt_list(ap.get('auto_approved', []))},",
                    "    ),",
                ]
            )
        tlim = spec.get("tool_limits")
        if tlim:
            lines.extend(
                [
                    "    tool_limits=ToolLimitsSpec(",
                    f"        max_tool_calls={int(tlim.get('max_tool_calls', 0))},",
                    f"        max_query_rows={int(tlim.get('max_query_rows', 0))},",
                    f'        max_query_runtime="{_esc_dq(str(tlim.get("max_query_runtime", "0s")))}",',
                    f"        max_time_window_days={int(tlim.get('max_time_window_days', 0))},",
                    "    ),",
                ]
            )
        aud = spec.get("audit")
        if aud:
            lines.extend(
                [
                    "    audit=AuditSpec(",
                    f"        log_tool_calls={_py_bool(aud.get('log_tool_calls', True))},",
                    f"        log_query_metadata_only={_py_bool(aud.get('log_query_metadata_only', False))},",
                    f"        retain_days={int(aud.get('retain_days', 30))},",
                    f"        require_lineage_in_report={_py_bool(aud.get('require_lineage_in_report', False))},",
                    "    ),",
                ]
            )
        cs = spec.get("content_safety")
        if cs:
            lines.extend(
                [
                    "    content_safety=ContentSafetySpec(",
                    f"        treat_crm_text_fields_as_untrusted={_py_bool(cs.get('treat_crm_text_fields_as_untrusted', False))},",
                    f"        do_not_follow_instructions_from_data={_py_bool(cs.get('do_not_follow_instructions_from_data', True))},",
                    "    ),",
                ]
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
        version = spec["version"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC{version_suffix(version)}"
        lines.append(f'    "{g_id}": {const_name},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_guardrail_spec(guardrail_id: str) -> GuardrailSpec | None:",
            '    """Get a guardrail specification by ID (accepts both bare and versioned refs)."""',
            "    spec = GUARDRAIL_CATALOG.get(guardrail_id)",
            "    if spec is not None:",
            "        return spec",
            "    base, _, ver = guardrail_id.rpartition(':')",
            "    if base and '.' in ver:",
            "        return GUARDRAIL_CATALOG.get(base)",
            "    return None",
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
    for key in [
        "read:data",
        "write:data",
        "execute:code",
        "access:internet",
        "send:email",
        "deploy:production",
    ]:
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
        "import type { GuardrailSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Guardrail Definitions",
        "// " + "=" * 76,
        "",
    ]

    for spec in specs:
        g_id = spec["id"]
        version = spec["version"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC{version_suffix(version)}"
        desc = _esc(spec.get("description", "").strip().replace("\n", " "))
        perms = spec.get("permissions", {})
        tl = spec.get("token_limits", {})

        lines.extend(
            [
                f"export const {const_name}: GuardrailSpec = {{",
                f"  id: '{g_id}',",
                f"  version: '{version}',",
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
        version = spec["version"]
        const_name = f"{g_id.upper().replace('-', '_')}_GUARDRAIL_SPEC{version_suffix(version)}"
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
            "function resolveGuardrailId(guardrailId: string): string {",
            "  if (guardrailId in GUARDRAIL_CATALOG) return guardrailId;",
            "  const idx = guardrailId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = guardrailId.slice(0, idx);",
            "    if (base in GUARDRAIL_CATALOG) return base;",
            "  }",
            "  return guardrailId;",
            "}",
            "",
            "export function getGuardrailSpec(",
            "  guardrailId: string,",
            "): GuardrailSpec | undefined {",
            "  return GUARDRAIL_CATALOG[resolveGuardrailId(guardrailId)];",
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
