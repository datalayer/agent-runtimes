#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML model-provider specifications.

A model provider is who serves a model (Anthropic, Amazon Bedrock, Cloudflare,
Ollama…): its site, its documentation, its terms of service, its privacy
policy, what it says about the data a request carries, and whether it runs
the model or the user's machine does. One YAML per provider under
``agentspecs/model-providers``; a model spec's ``provider`` names one.

Usage:
    python generate_model_providers.py \\
      --specs-dir agentspecs/agentspecs/model-providers \\
      --python-output agent_runtimes/specs/model_providers.py \\
      --typescript-output src/specs/modelProviders.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix

FIELDS = ("website", "docs_url", "terms_url", "privacy_url", "data_usage_url")
CAMEL = {
    "website": "website",
    "docs_url": "docsUrl",
    "terms_url": "termsUrl",
    "privacy_url": "privacyUrl",
    "data_usage_url": "dataUsageUrl",
}


def load_provider_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all model-provider YAML specifications from a directory."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            if spec["id"] != yaml_file.stem:
                raise ValueError(
                    f"{yaml_file.name}: the file is named for id {yaml_file.stem!r}, the spec says {spec['id']!r}"
                )
            specs.append(spec)
    return specs


def _const_name(provider_id: str) -> str:
    return provider_id.replace("-", "_").replace(".", "_").upper()


def _py(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _ts(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from model-provider specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Model Provider Catalog.",
        "",
        "Who serves a model: the vendor's own API, a cloud that hosts it, or the",
        "user's machine — with its site, documentation, terms, privacy policy and",
        "what it says about the data a request carries.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import ModelProvider",
        "",
        "",
        "# " + "=" * 76,
        "# Model Provider Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        const = _const_name(spec["id"]) + version_suffix(spec["version"])
        lines.extend(
            [
                f"{const} = ModelProvider(",
                f"    id={_py(spec['id'])},",
                f"    version={_py(str(spec['version']))},",
                f"    name={_py(spec['name'])},",
                f"    description={_py(str(spec.get('description', '')).strip())},",
            ]
        )
        for field in FIELDS:
            value = spec.get(field)
            if value:
                lines.append(f"    {field}={_py(str(value))},")
        lines.append(f"    hosting={_py(spec.get('hosting', 'cloud'))},")
        lines.extend([")", ""])
    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# Model Provider Catalog",
            "# " + "=" * 76,
            "",
            "MODEL_PROVIDER_CATALOGUE: Dict[str, ModelProvider] = {",
        ]
    )
    for spec in specs:
        lines.append(
            f"    {_py(spec['id'])}: {_const_name(spec['id']) + version_suffix(spec['version'])},"
        )
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_model_provider(provider_id: str) -> ModelProvider | None:",
            '    """The provider a model spec\'s `provider` names, or None."""',
            "    return MODEL_PROVIDER_CATALOGUE.get(provider_id)",
            "",
            "",
            "def list_model_providers() -> list[ModelProvider]:",
            "    return list(MODEL_PROVIDER_CATALOGUE.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from model-provider specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Model Provider Catalog.",
        " *",
        " * Who serves a model: the vendor's own API, a cloud that hosts it, or the",
        " * user's machine — with its site, documentation, terms, privacy policy and",
        " * what it says about the data a request carries.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { ModelProvider } from '../types/models';",
        "",
    ]
    for spec in specs:
        const = _const_name(spec["id"]) + version_suffix(spec["version"])
        lines.extend(
            [
                f"export const {const}: ModelProvider = {{",
                f"  id: {_ts(spec['id'])},",
                f"  version: {_ts(str(spec['version']))},",
                f"  name: {_ts(spec['name'])},",
                f"  description: {_ts(str(spec.get('description', '')).strip())},",
            ]
        )
        for field in FIELDS:
            value = spec.get(field)
            if value:
                lines.append(f"  {CAMEL[field]}: {_ts(str(value))},")
        lines.append(f"  hosting: {_ts(spec.get('hosting', 'cloud'))},")
        lines.extend(["};", ""])
    lines.append(
        "export const MODEL_PROVIDER_CATALOGUE: Record<string, ModelProvider> = {"
    )
    for spec in specs:
        lines.append(
            f"  {_ts(spec['id'])}: {_const_name(spec['id']) + version_suffix(spec['version'])},"
        )
    lines.extend(
        [
            "};",
            "",
            "/** The provider a model spec's `provider` names, or undefined. */",
            "export function getModelProvider(providerId: string): ModelProvider | undefined {",
            "  return MODEL_PROVIDER_CATALOGUE[providerId];",
            "}",
            "",
            "export function listModelProviders(): ModelProvider[] {",
            "  return Object.values(MODEL_PROVIDER_CATALOGUE);",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML model-provider specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing model-provider YAML files",
    )
    parser.add_argument(
        "--python-output", type=Path, required=True, help="Output path for Python file"
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
    specs = load_provider_specs(args.specs_dir)
    if not specs:
        print(
            f"Warning: No model-provider specifications found in {args.specs_dir}",
            file=sys.stderr,
        )
        return
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(specs))
    print(f"Generated Python code: {args.python_output}")
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(f"Generated TypeScript code: {args.typescript_output}")
    print(f"\n✓ Successfully generated code from {len(specs)} model-provider specs")


if __name__ == "__main__":
    main()
