#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from the YAML UI renderer specifications.

One YAML per UI renderer under ``agentspecs/ui-renderers`` (AGENTIC_UI R8,
F-01): how a UI plugin's interface reaches a host that is not Datalayer's own
page — A2UI, MCP Apps, MCP UI. A UI plugin (``agentspecs/ui``) says the
renderers it may be exposed through; an agent's or an application's ``ui``
names, per plugin, the one it uses.

Usage:
    python generate_ui_renderers.py \\
      --specs-dir agentspecs/agentspecs/ui-renderers \\
      --python-output agent_runtimes/specs/ui_renderers.py \\
      --typescript-output src/specs/uiRenderers.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix

FIELDS = {"id", "version", "name", "description", "docs_url", "enabled"}


def load_ui_renderer_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every UI renderer spec of a directory, each named for its id, with its fields and no other."""
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        spec = yaml.safe_load(yaml_file.read_text()) or {}
        ensure_spec_version(spec)
        if spec["id"] != yaml_file.stem:
            raise ValueError(
                f"{yaml_file.name}: the file is named for {yaml_file.stem!r}, the spec says {spec['id']!r}"
            )
        if set(spec) != FIELDS:
            raise ValueError(f"{yaml_file.name}: a UI renderer says {sorted(FIELDS)}")
        specs.append(spec)
    return specs


def _const(spec: dict[str, Any]) -> str:
    return (
        spec["id"].replace("-", "_").upper()
        + "_UI_RENDERER"
        + version_suffix(spec["version"])
    )


def _s(value: Any) -> str:
    return json.dumps(" ".join(str(value).split()), ensure_ascii=False)


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """The Python catalogue of the UI renderers."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "UI Renderer Catalog.",
        "",
        "How a UI plugin's interface reaches a host that is not Datalayer's own page",
        "(AGENTIC_UI R8): A2UI, MCP Apps, MCP UI.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import UiRendererSpec",
        "",
    ]
    for spec in specs:
        lines += [
            f"{_const(spec)} = UiRendererSpec(",
            f"    id={_s(spec['id'])},",
            f"    version={_s(spec['version'])},",
            f"    name={_s(spec['name'])},",
            f"    description={_s(spec['description'])},",
            f"    docs_url={_s(spec['docs_url'])},",
            f"    enabled={bool(spec['enabled'])},",
            ")",
            "",
        ]
    lines += ["UI_RENDERER_CATALOGUE: Dict[str, UiRendererSpec] = {"]
    lines += [f"    {_s(spec['id'])}: {_const(spec)}," for spec in specs]
    lines += [
        "}",
        "",
        "",
        "def get_ui_renderer(renderer_id: str) -> UiRendererSpec | None:",
        '    """The UI renderer a plugin\'s `renderers` or a `ui` choice names, or None."""',
        "    return UI_RENDERER_CATALOGUE.get(renderer_id)",
        "",
        "",
        "def list_ui_renderers() -> list[UiRendererSpec]:",
        "    return list(UI_RENDERER_CATALOGUE.values())",
        "",
    ]
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """The TypeScript catalogue of the UI renderers."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * UI Renderer Catalog.",
        " *",
        " * How a UI plugin's interface reaches a host that is not Datalayer's own",
        " * page (AGENTIC_UI R8): A2UI, MCP Apps, MCP UI.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { UiRendererSpec } from '../types/agentspecs';",
        "",
    ]
    for spec in specs:
        lines += [
            f"export const {_const(spec)}: UiRendererSpec = {{",
            f"  id: {_s(spec['id'])},",
            f"  version: {_s(spec['version'])},",
            f"  name: {_s(spec['name'])},",
            f"  description: {_s(spec['description'])},",
            f"  docsUrl: {_s(spec['docs_url'])},",
            f"  enabled: {'true' if spec['enabled'] else 'false'},",
            "};",
            "",
        ]
    lines += ["export const UI_RENDERER_CATALOGUE: Record<string, UiRendererSpec> = {"]
    lines += [f"  {_s(spec['id'])}: {_const(spec)}," for spec in specs]
    lines += [
        "};",
        "",
        "/** The UI renderer a plugin's `renderers` or a `ui` choice names, or undefined. */",
        "export function getUiRenderer(rendererId: string): UiRendererSpec | undefined {",
        "  return UI_RENDERER_CATALOGUE[rendererId];",
        "}",
        "",
        "export function listUiRenderers(): UiRendererSpec[] {",
        "  return Object.values(UI_RENDERER_CATALOGUE);",
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
    specs = load_ui_renderer_specs(args.specs_dir)
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(
        f"Generated {len(specs)} UI renderers: {args.python_output}, {args.typescript_output}"
    )


if __name__ == "__main__":
    main()
