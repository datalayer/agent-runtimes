#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from the YAML protocol specifications.

One YAML per agent protocol under ``agentspecs/protocols`` (AGENT_PROTOCOLS
PS-01); an agent spec's or an application's ``protocols`` names the ones it
speaks (PS-02).

Usage:
    python generate_protocols.py \\
      --specs-dir agentspecs/agentspecs/protocols \\
      --python-output agent_runtimes/specs/protocols.py \\
      --typescript-output src/specs/protocols.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix

LAYERS = ("transport", "consent", "identity", "commerce", "ui")
STATUSES = ("shipped", "planned")
BLOCKS = ("pap", "pact", "a2a", "signed_fetch")


def load_protocol_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every protocol spec of a directory, each named for its id, its layer, status and block known."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        spec = yaml.safe_load(yaml_file.read_text()) or {}
        ensure_spec_version(spec)
        if spec["id"] != yaml_file.stem:
            raise ValueError(
                f"{yaml_file.name}: the file is named for {yaml_file.stem!r}, the spec says {spec['id']!r}"
            )
        if spec["layer"] not in LAYERS or spec["status"] not in STATUSES:
            raise ValueError(
                f"{yaml_file.name}: layer one of {LAYERS}, status one of {STATUSES}"
            )
        if spec.get("appspec_block") not in (None, *BLOCKS):
            raise ValueError(f"{yaml_file.name}: appspec_block one of {BLOCKS}")
        specs.append(spec)
    return specs


def _const(spec: dict[str, Any]) -> str:
    return (
        spec["id"].replace("-", "_").upper()
        + "_PROTOCOL"
        + version_suffix(spec["version"])
    )


def _s(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Protocol Catalog.",
        "",
        "The agent protocols Datalayer targets (AGENT_PROTOCOLS PS-01).",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List, Optional",
        "",
        "from agent_runtimes.types import ProtocolPackagesSpec, ProtocolSpec",
    ]
    for spec in specs:
        packages = spec.get("packages") or {}
        block = spec.get("appspec_block")
        lines += [
            "",
            f"{_const(spec)} = ProtocolSpec(",
            f"    id={_s(spec['id'])},",
            f"    version={_s(spec['version'])},",
            f"    name={_s(spec['name'])},",
            f"    description={_s(spec.get('description'))},",
            f"    publisher={_s(spec.get('publisher'))},",
            f"    layer={_s(spec['layer'])},",
            f"    spec_url={_s(spec.get('spec_url'))},",
            f"    spec_version={_s(spec.get('spec_version'))},",
            f"    status={_s(spec['status'])},",
            f"    connects={_s(spec.get('connects'))},",
            "    packages=ProtocolPackagesSpec(",
            f"        python={json.dumps(list(packages.get('python') or []))},",
            f"        typescript={json.dumps(list(packages.get('typescript') or []))},",
            "    ),",
            f"    protocol_tools={json.dumps(list(spec.get('protocol_tools') or []))},",
            f"    appspec_block={_s(block) if block else 'None'},",
            ")",
        ]
    lines += [
        "",
        "",
        "PROTOCOL_CATALOGUE: Dict[str, ProtocolSpec] = {",
        *[f"    {_s(spec['id'])}: {_const(spec)}," for spec in specs],
        "}",
        "",
        "",
        "def get_protocol(protocol_id: str) -> Optional[ProtocolSpec]:",
        '    """A protocol by id, or None."""',
        "    return PROTOCOL_CATALOGUE.get(protocol_id)",
        "",
        "",
        "def list_protocols() -> List[ProtocolSpec]:",
        '    """Every protocol of the catalogue."""',
        "    return list(PROTOCOL_CATALOGUE.values())",
        "",
    ]
    return "\n".join(lines)


def _t(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Protocol Catalog.",
        " *",
        " * The agent protocols Datalayer targets (AGENT_PROTOCOLS PS-01).",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { ProtocolSpec } from '../types/agentspecs';",
    ]
    for spec in specs:
        packages = spec.get("packages") or {}
        block = spec.get("appspec_block")
        lines += [
            "",
            f"export const {_const(spec)}: ProtocolSpec = {{",
            f"  id: {_t(spec['id'])},",
            f"  version: {_t(spec['version'])},",
            f"  name: {_t(spec['name'])},",
            f"  description: {_t(spec.get('description'))},",
            f"  publisher: {_t(spec.get('publisher'))},",
            f"  layer: {_t(spec['layer'])},",
            f"  specUrl: {_t(spec.get('spec_url'))},",
            f"  specVersion: {_t(spec.get('spec_version'))},",
            f"  status: {_t(spec['status'])},",
            f"  connects: {_t(spec.get('connects'))},",
            "  packages: {",
            f"    python: {json.dumps(list(packages.get('python') or []))},",
            f"    typescript: {json.dumps(list(packages.get('typescript') or []))},",
            "  },",
            f"  protocolTools: {json.dumps(list(spec.get('protocol_tools') or []))},",
            *([f"  appspecBlock: {_t(block)},"] if block else []),
            "};",
        ]
    lines += [
        "",
        "export const PROTOCOL_CATALOGUE: Record<string, ProtocolSpec> = {",
        *[f"  {_t(spec['id'])}: {_const(spec)}," for spec in specs],
        "};",
        "",
        "/** A protocol by id. */",
        "export function getProtocol(protocolId: string): ProtocolSpec | undefined {",
        "  return PROTOCOL_CATALOGUE[protocolId];",
        "}",
        "",
        "/** Every protocol of the catalogue. */",
        "export function listProtocolSpecs(): ProtocolSpec[] {",
        "  return Object.values(PROTOCOL_CATALOGUE);",
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
    specs = load_protocol_specs(args.specs_dir)
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(
        f"Generated {len(specs)} protocols: {args.python_output}, {args.typescript_output}"
    )


if __name__ == "__main__":
    main()
