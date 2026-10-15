#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from the YAML policy specifications.

One YAML per policy under ``agentspecs/policies`` (SHIELD.md SH-50, §6.7):
the Shield's policy document under the catalogue's fields. The document's
schema is the ``agent-shield`` package's, carried by agentspecs verbatim
(``policies/shield-policy.schema.json``); each document is validated against
it here before it is written out.

Usage:
    python generate_policies.py \\
      --specs-dir agentspecs/agentspecs/policies \\
      --python-output agent_runtimes/specs/policies.py \\
      --typescript-output src/specs/policies.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

import jsonschema
import yaml
from versioning import ensure_spec_version, version_suffix

SHIELD_SCHEMA = "shield-policy.schema.json"


def load_policy_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every policy spec of a directory, each named for its id, its document valid."""
    validator = jsonschema.Draft202012Validator(
        json.loads((specs_dir / SHIELD_SCHEMA).read_text())
    )
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        spec = yaml.safe_load(yaml_file.read_text()) or {}
        ensure_spec_version(spec)
        if spec["id"] != yaml_file.stem:
            raise ValueError(
                f"{yaml_file.name}: the file is named for {yaml_file.stem!r}, the spec says {spec['id']!r}"
            )
        problems = sorted(
            validator.iter_errors(spec.get("policy")),
            key=lambda e: list(e.absolute_path),
        )
        if problems:
            where = (
                ".".join(str(part) for part in problems[0].absolute_path)
                or "the document"
            )
            raise ValueError(
                f"{yaml_file.name}: policy: {where}: {problems[0].message}"
            )
        specs.append(spec)
    return specs


def _const(spec: dict[str, Any]) -> str:
    return (
        spec["id"].replace("-", "_").upper()
        + "_POLICY"
        + version_suffix(spec["version"])
    )


def _s(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Policy Catalog.",
        "",
        "The Shield's policy documents the platform ships or shows (SHIELD.md SH-50):",
        "each a catalogue entry whose ``policy`` is a document of ``agent_shield.policy``.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Any, Dict, List, Optional",
        "",
        "from agent_runtimes.types import PolicySpec",
    ]
    for spec in specs:
        lines += [
            "",
            f"{_const(spec)} = PolicySpec(",
            f"    id={_s(spec['id'])},",
            f"    version={_s(spec['version'])},",
            f"    name={_s(spec['name'])},",
            f"    description={_s(spec.get('description'))},",
            f"    enabled={bool(spec.get('enabled', True))},",
            f"    tags={json.dumps(list(spec.get('tags') or []))},",
            f"    policy={json.dumps(spec['policy'], ensure_ascii=False, indent=8).replace('true', 'True').replace('false', 'False').replace('null', 'None')},",
            ")",
        ]
    lines += [
        "",
        "",
        "POLICY_CATALOGUE: Dict[str, PolicySpec] = {",
        *[f"    {_s(spec['id'])}: {_const(spec)}," for spec in specs],
        "}",
        "",
        "",
        "def get_policy(policy_id: str) -> Optional[PolicySpec]:",
        '    """A policy by id, or None."""',
        "    return POLICY_CATALOGUE.get(policy_id)",
        "",
        "",
        "def list_policies() -> List[PolicySpec]:",
        '    """Every policy of the catalogue."""',
        "    return list(POLICY_CATALOGUE.values())",
        "",
        "",
        "def policy_documents() -> Dict[str, Dict[str, Any]]:",
        '    """Each policy\'s Shield document, by id."""',
        "    return {key: dict(spec.policy) for key, spec in POLICY_CATALOGUE.items()}",
        "",
    ]
    return "\n".join(lines)


def _t(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def _ts_value(value: Any, indent: int = 2) -> str:
    text = json.dumps(value, ensure_ascii=False, indent=2)
    pad = " " * indent
    return "\n".join(
        pad + line if i else line for i, line in enumerate(text.splitlines())
    )


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Policy Catalog.",
        " *",
        " * The Shield's policy documents the platform ships or shows (SHIELD.md SH-50).",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { PolicySpec } from '../types/agentspecs';",
    ]
    for spec in specs:
        lines += [
            "",
            f"export const {_const(spec)}: PolicySpec = {{",
            f"  id: {_t(spec['id'])},",
            f"  version: {_t(spec['version'])},",
            f"  name: {_t(spec['name'])},",
            f"  description: {_t(spec.get('description'))},",
            f"  enabled: {'true' if spec.get('enabled', True) else 'false'},",
            f"  tags: {json.dumps(list(spec.get('tags') or []))},",
            f"  policy: {_ts_value(spec['policy'])},",
            "};",
        ]
    lines += [
        "",
        "export const POLICY_CATALOGUE: Record<string, PolicySpec> = {",
        *[f"  {_t(spec['id'])}: {_const(spec)}," for spec in specs],
        "};",
        "",
        "/** A policy by id. */",
        "export function getPolicy(policyId: string): PolicySpec | undefined {",
        "  return POLICY_CATALOGUE[policyId];",
        "}",
        "",
        "/** Every policy of the catalogue. */",
        "export function listPolicySpecs(): PolicySpec[] {",
        "  return Object.values(POLICY_CATALOGUE);",
        "}",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()
    specs = load_policy_specs(args.specs_dir)
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(
        f"Generated {len(specs)} policies: {args.python_output}, {args.typescript_output}"
    )


if __name__ == "__main__":
    main()
