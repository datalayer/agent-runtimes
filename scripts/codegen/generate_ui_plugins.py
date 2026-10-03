#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML UI-plugin specifications.

A UI plugin is how an agent's answer becomes an interface rather than text —
a protocol the host knows how to render (A2UI, MCP Apps, MCP UI). One YAML per
plugin under ``agentspecs/ui-plugins``; an agent spec's ``ui_plugin`` names
one. A plugin hosts the visual components it renders (LOOP C-13).

Usage:
    python generate_ui_plugins.py \\
      --specs-dir agentspecs/agentspecs/ui-plugins \\
      --python-output agent_runtimes/specs/ui_plugins.py \\
      --typescript-output src/specs/uiPlugins.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix


def load_plugin_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Load all UI-plugin YAML specifications from a directory."""
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


def _const_name(plugin_id: str) -> str:
    return plugin_id.replace("-", "_").replace(".", "_").upper() + "_UI_PLUGIN"


def _py(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _ts(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _py_component(component: dict[str, Any]) -> str:
    """A component as the Python that builds it."""
    bindings = component.get("bindings")
    return (
        "ComponentSpec("
        f"id={_py(component['id'])}, name={json.dumps(component['name'], ensure_ascii=False)}, "
        f"description={json.dumps(component['description'].strip(), ensure_ascii=False)}, "
        f"category={_py(component['category'])}, emoji={json.dumps(component['emoji'], ensure_ascii=False)}, "
        f"standard={bool(component['standard'])}, "
        f"properties={component.get('properties')!r}, "
        + (
            f"bindings=ComponentBindingsSpec(shows={bindings['shows']!r}, sends={bindings['sends']!r}), "
            if bindings
            else "bindings=None, "
        )
        + f"events={component.get('events') or []!r}, example={component.get('example')!r})"
    )


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from UI-plugin specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "UI Plugin Catalog.",
        "",
        "How an agent's answer becomes an interface: the protocols a host renders.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import ComponentBindingsSpec, ComponentSpec, UIPluginSpec",
        "",
        "# " + "=" * 76,
        "# UI Plugin Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        const = _const_name(spec["id"]) + version_suffix(spec["version"])
        lines.extend(
            [
                f"{const} = UIPluginSpec(",
                f"    id={_py(spec['id'])},",
                f"    version={_py(str(spec['version']))},",
                f"    name={_py(spec['name'])},",
                f"    description={_py(str(spec.get('description', '')).strip())},",
                f"    docs_url={_py(str(spec.get('docs_url', '')))},",
                f"    enabled={bool(spec.get('enabled', True))},",
                f"    catalog={_py(str(spec.get('catalog', '')))},",
                "    components=[",
                *[f"        {_py_component(c)}," for c in spec.get("components") or []],
                "    ],",
                ")",
                "",
            ]
        )
    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# UI Plugin Catalog",
            "# " + "=" * 76,
            "",
            "UI_PLUGIN_CATALOGUE: Dict[str, UIPluginSpec] = {",
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
            "def get_ui_plugin(plugin_id: str) -> UIPluginSpec | None:",
            '    """The plugin an agent spec\'s `ui_plugin` names, or None."""',
            "    return UI_PLUGIN_CATALOGUE.get(plugin_id)",
            "",
            "",
            "def list_ui_plugins() -> list[UIPluginSpec]:",
            "    return list(UI_PLUGIN_CATALOGUE.values())",
            "",
            "",
            "#: The visual components the enabled UI plugins render, by the name a",
            "#: surface gives them (LOOP C-13).",
            "COMPONENT_CATALOGUE: Dict[str, ComponentSpec] = {",
            "    component.id: component",
            "    for plugin in UI_PLUGIN_CATALOGUE.values()",
            "    if plugin.enabled",
            "    for component in plugin.components",
            "}",
            "",
            "",
            "def get_component(name: str) -> ComponentSpec | None:",
            '    """The component a layout names, or None."""',
            "    return COMPONENT_CATALOGUE.get(name)",
            "",
            "",
            "def list_components() -> list[ComponentSpec]:",
            "    return list(COMPONENT_CATALOGUE.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from UI-plugin specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * UI Plugin Catalog.",
        " *",
        " * How an agent's answer becomes an interface: the protocols a host renders.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { ComponentSpec, UIPluginSpec } from '../types/agentspecs';",
        "",
    ]
    for spec in specs:
        const = _const_name(spec["id"]) + version_suffix(spec["version"])
        lines.extend(
            [
                f"export const {const}: UIPluginSpec = {{",
                f"  id: {_ts(spec['id'])},",
                f"  version: {_ts(str(spec['version']))},",
                f"  name: {_ts(spec['name'])},",
                f"  description: {_ts(str(spec.get('description', '')).strip())},",
                f"  docsUrl: {_ts(str(spec.get('docs_url', '')))},",
                f"  enabled: {'true' if spec.get('enabled', True) else 'false'},",
                f"  catalog: {_ts(str(spec.get('catalog', '')))},",
                f"  components: {json.dumps([{**c, 'events': c.get('events', [])} for c in spec.get('components') or []], indent=2, ensure_ascii=False)},",
                "};",
                "",
            ]
        )
    lines.append("export const UI_PLUGIN_CATALOGUE: Record<string, UIPluginSpec> = {")
    for spec in specs:
        lines.append(
            f"  {_ts(spec['id'])}: {_const_name(spec['id']) + version_suffix(spec['version'])},"
        )
    lines.extend(
        [
            "};",
            "",
            "/** The plugin an agent spec's `uiPlugin` names, or undefined. */",
            "export function getUIPlugin(pluginId: string): UIPluginSpec | undefined {",
            "  return UI_PLUGIN_CATALOGUE[pluginId];",
            "}",
            "",
            "export function listUIPlugins(): UIPluginSpec[] {",
            "  return Object.values(UI_PLUGIN_CATALOGUE);",
            "}",
            "",
            "/** The visual components the enabled UI plugins render, by the name a surface gives them (LOOP C-13). */",
            "export const COMPONENT_CATALOGUE: Record<string, ComponentSpec> = Object.fromEntries(",
            "  Object.values(UI_PLUGIN_CATALOGUE)",
            "    .filter(plugin => plugin.enabled)",
            "    .flatMap(plugin => plugin.components.map(component => [component.id, component])),",
            ");",
            "",
            "/** The component a layout names, or undefined. */",
            "export function getComponent(name: string): ComponentSpec | undefined {",
            "  return COMPONENT_CATALOGUE[name];",
            "}",
            "",
            "export function listComponents(): ComponentSpec[] {",
            "  return Object.values(COMPONENT_CATALOGUE);",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML UI-plugin specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing UI-plugin YAML files",
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
    specs = load_plugin_specs(args.specs_dir)
    if not specs:
        print(
            f"Warning: No UI-plugin specifications found in {args.specs_dir}",
            file=sys.stderr,
        )
        return
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(specs))
    print(f"Generated Python code: {args.python_output}")
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(f"Generated TypeScript code: {args.typescript_output}")
    print(f"\n✓ Successfully generated code from {len(specs)} UI-plugin specs")


if __name__ == "__main__":
    main()
