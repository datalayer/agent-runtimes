#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from the YAML standard specifications.

One YAML per standard under ``agentspecs/standards`` (SHIELD.md SH-60, §6.9):
its version, domains and controls, each control with its evidence items,
cadence and crosswalks. The catalogue is carried whole: the Studio's
conformance screens read a control's title, status words and crosswalks
from it, never from a hand-written list.

Usage:
    python generate_standards.py \\
      --specs-dir agentspecs/agentspecs/standards \\
      --python-output agent_runtimes/specs/standards.py \\
      --typescript-output src/specs/standards.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version


def load_standard_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every standard spec of a directory, each named for its id."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        spec = yaml.safe_load(yaml_file.read_text()) or {}
        if spec.get("id") != yaml_file.stem:
            raise ValueError(
                f"{yaml_file.name}: the file is named for {yaml_file.stem!r}, the spec says {spec.get('id')!r}"
            )
        if not isinstance(spec.get("controls"), list) or not spec["controls"]:
            raise ValueError(f"{yaml_file.name}: a standard lists its controls")
        # A standard's version is its own (2026.4, 2023): the generated symbol takes it as written.
        spec["spec_version"] = str(spec.get("version"))
        ensure_spec_version(spec, default="0.0.1")
        specs.append(spec)
    return specs


def _const(spec: dict[str, Any]) -> str:
    return spec["id"].replace("-", "_").replace(".", "_").upper() + "_STANDARD"


def _s(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def _dates(value: Any) -> str:
    return _s(value.isoformat() if hasattr(value, "isoformat") else value)


def _py_literal(value: Any, indent: int = 8) -> str:
    text = json.dumps(value, ensure_ascii=False, indent=indent, default=str)
    return (
        text.replace(": true", ": True")
        .replace(": false", ": False")
        .replace(": null", ": None")
    )


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Standard Catalog.",
        "",
        "The standards a conformance report answers (SHIELD.md SH-60, §6.9): each a",
        "catalogue entry carrying the standard's domains and controls whole.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Any, Dict, List, Optional",
        "",
        "from agent_runtimes.types import StandardSpec",
    ]
    for spec in specs:
        lines += [
            "",
            f"{_const(spec)} = StandardSpec(",
            f"    id={_s(spec['id'])},",
            f"    version={_s(spec['spec_version'])},",
            f"    name={_s(spec['name'])},",
            f"    description={_s(spec.get('description'))},",
            f"    enabled={bool(spec.get('enabled', True))},",
            f"    tags={json.dumps(list(spec.get('tags') or []))},",
            f"    published_by={_s(spec.get('published_by'))},",
            f"    url={_s(spec.get('url'))},",
            f"    released_on={_dates(spec.get('released_on'))},",
            f"    next_release_on={_dates(spec.get('next_release_on')) if spec.get('next_release_on') else None},",
            f"    read_on={_dates(spec.get('read_on'))},",
            f"    certificate_valid_months={int(spec.get('certificate_valid_months') or 12)},",
            f"    maps_to={_s(spec['maps_to']) if spec.get('maps_to') else None},",
            f"    evidence_kinds={_py_literal(spec.get('evidence_kinds') or {})},",
            f"    frameworks={_py_literal(spec.get('frameworks') or {})},",
            f"    domains={_py_literal(spec.get('domains') or [])},",
            f"    controls={_py_literal(spec.get('controls') or [])},",
            ")",
        ]
    lines += [
        "",
        "",
        "STANDARD_CATALOGUE: Dict[str, StandardSpec] = {",
        *[f"    {_s(spec['id'])}: {_const(spec)}," for spec in specs],
        "}",
        "",
        "",
        "def get_standard(standard_id: str) -> Optional[StandardSpec]:",
        '    """A standard by id, or None."""',
        "    return STANDARD_CATALOGUE.get(standard_id)",
        "",
        "",
        "def list_standards() -> List[StandardSpec]:",
        '    """Every standard of the catalogue."""',
        "    return list(STANDARD_CATALOGUE.values())",
        "",
        "",
        "def control_of(standard_id: str, control_id: str) -> Optional[Dict[str, Any]]:",
        '    """One control of a standard, as the spec carries it, or None."""',
        "    spec = STANDARD_CATALOGUE.get(standard_id)",
        "    if spec is None:",
        "        return None",
        '    return next((dict(c) for c in spec.controls if c.get("id") == control_id), None)',
        "",
    ]
    return "\n".join(lines)


def _t(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def _ts_value(value: Any, indent: int = 2) -> str:
    text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
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
        " * Standard Catalog.",
        " *",
        " * The standards a conformance report answers (SHIELD.md SH-60, §6.9).",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { StandardControl, StandardSpec } from '../types/agentspecs';",
    ]
    for spec in specs:
        lines += [
            "",
            f"export const {_const(spec)}: StandardSpec = {{",
            f"  id: {_t(spec['id'])},",
            f"  version: {_t(spec['spec_version'])},",
            f"  name: {_t(spec['name'])},",
            f"  description: {_t(spec.get('description'))},",
            f"  enabled: {'true' if spec.get('enabled', True) else 'false'},",
            f"  tags: {json.dumps(list(spec.get('tags') or []))},",
            f"  publishedBy: {_t(spec.get('published_by'))},",
            f"  url: {_t(spec.get('url'))},",
            f"  releasedOn: {_dates(spec.get('released_on'))},",
            f"  nextReleaseOn: {_dates(spec.get('next_release_on')) if spec.get('next_release_on') else 'null'},",
            f"  readOn: {_dates(spec.get('read_on'))},",
            f"  certificateValidMonths: {int(spec.get('certificate_valid_months') or 12)},",
            f"  mapsTo: {_t(spec['maps_to']) if spec.get('maps_to') else 'null'},",
            f"  evidenceKinds: {_ts_value(spec.get('evidence_kinds') or {})},",
            f"  frameworks: {_ts_value(spec.get('frameworks') or {})},",
            f"  domains: {_ts_value(spec.get('domains') or [])},",
            f"  controls: {_ts_value(spec.get('controls') or [])} as StandardControl[],",
            "};",
        ]
    lines += [
        "",
        "export const STANDARD_CATALOGUE: Record<string, StandardSpec> = {",
        *[f"  {_t(spec['id'])}: {_const(spec)}," for spec in specs],
        "};",
        "",
        "/** A standard by id. */",
        "export function getStandard(standardId: string): StandardSpec | undefined {",
        "  return STANDARD_CATALOGUE[standardId];",
        "}",
        "",
        "/** Every standard of the catalogue. */",
        "export function listStandardSpecs(): StandardSpec[] {",
        "  return Object.values(STANDARD_CATALOGUE);",
        "}",
        "",
        "/** One control of a standard, as the spec carries it. */",
        "export function standardControl(standardId: string, controlId: string): StandardControl | undefined {",
        "  return STANDARD_CATALOGUE[standardId]?.controls.find(control => control.id === controlId);",
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
    specs = load_standard_specs(args.specs_dir)
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(
        f"Generated {len(specs)} standards: {args.python_output}, {args.typescript_output}"
    )


if __name__ == "__main__":
    main()
