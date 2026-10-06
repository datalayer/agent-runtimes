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
import re
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
        f"version={_py(str(component['version']))}, standard={bool(component['standard'])}, "
        f"properties={component.get('properties')!r}, "
        + (
            f"bindings=ComponentBindingsSpec(shows={bindings['shows']!r}, sends={bindings['sends']!r}), "
            if bindings
            else "bindings=None, "
        )
        + f"events={component.get('events') or []!r}, example={component.get('example')!r})"
    )


def call_name(component_id: str) -> str:
    """The Python call of a component: ``Table`` → ``table``, ``TextField`` → ``text_field``."""
    return re.sub(r"(?<!^)(?=[A-Z])", "_", component_id).lower()


def _py_type(prop: dict[str, Any]) -> str:
    """The Python type of a property of a component's JSON Schema."""
    if "enum" in prop:
        return "Literal[" + ", ".join(json.dumps(value) for value in prop["enum"]) + "]"
    kind = prop.get("type")
    if kind == "array":
        return f"List[{_py_type(prop.get('items') or {})}]"
    return {
        "string": "str",
        "integer": "int",
        "number": "float",
        "boolean": "bool",
        "object": "Dict[str, Any]",
    }.get(str(kind), "Any")


def _py_calls(specs: list[dict[str, Any]]) -> list[str]:
    """The catalog's components as typed calls (LOOP C-15), one method each."""
    lines = [
        "",
        "",
        "# " + "=" * 76,
        "# The components as typed calls (LOOP C-15)",
        "# " + "=" * 76,
        "",
        '#: A property bound to what the application publishes or takes: ``{"path": "/runs"}``.',
        "Bound = Mapping[str, str]",
        "",
        "",
        "class SurfaceComponents:",
        '    """Every component of the catalog as a typed call: ``app.ui.table("runs", columns=[...])``.',
        "",
        "    Each places the node the Canvas and the YAML write, through",
        "    `Application.component`, which checks it against the same JSON Schema; an",
        "    IDE completes its properties, and a type checker refuses a wrong value",
        "    before the application runs. A property may be bound instead",
        '    (``{"path": ...}``); a property left as ``None`` is not written.',
        '    """',
        "",
        "    def __init__(self, place: Callable[..., Dict[str, Any]]) -> None:",
        "        self._place = place",
    ]
    for spec in specs:
        if not spec.get("enabled", True):
            continue
        for component in spec.get("components") or []:
            schema = component.get("properties") or {}
            required = set(schema.get("required") or [])
            fields = dict(schema.get("properties") or {})
            bindings = component.get("bindings") or {}
            extra = [
                name
                for name in dict.fromkeys(
                    [*(bindings.get("shows") or []), *(bindings.get("sends") or [])]
                )
                if name not in fields
            ]
            params = ["        self,", "        id: str,", "        *,"]
            ordered = [n for n in fields if n in required] + [
                n for n in fields if n not in required
            ]
            for name in ordered:
                kind = f"Union[{_py_type(fields[name])}, Bound]"
                params.append(
                    f"        {name}: {kind},"
                    if name in required
                    else f"        {name}: Optional[{kind}] = None,"
                )
            for name in extra:
                params.append(f"        {name}: Optional[Bound] = None,")
            if component.get("events") and "action" not in fields:
                params.append("        action: Optional[Dict[str, Any]] = None,")
            params.append("        visible_when: Optional[Bound] = None,")
            params.append("        weight: Optional[float] = None,")
            doc = [
                f'        """{component["name"]}, version {component["version"]}: {component["description"].strip()}',
                "",
                "        Parameters",
                "        ----------",
                "        id : str",
                "            Its id on the surface, unique; ``root`` is where the surface starts.",
            ]
            for name in ordered:
                field = fields[name]
                doc += [
                    f"        {name} : {_py_type(field)} or Bound",
                    f"            {field.get('title', name)}: {field.get('description', '')}",
                ]
            for name in extra:
                said = (
                    "What it shows"
                    if name in (bindings.get("shows") or [])
                    else "Where what a person does is written"
                )
                doc += [f"        {name} : Bound", f"            {said}."]
            doc += ['        """']
            names = [*ordered, *extra]
            if component.get("events") and "action" not in fields:
                names.append("action")
            names += ["visible_when", "weight"]
            lines += [
                "",
                f"    def {call_name(component['id'])}(",
                *params,
                "    ) -> Dict[str, Any]:",
                *[d.replace("\\", "\\\\") for d in doc],
                "        given = {",
                *[f"            {json.dumps(name)}: {name}," for name in names],
                "        }",
                "        return self._place(",
                f"            id, {_py(component['id'])}, **{{name: value for name, value in given.items() if value is not None}}",
                "        )",
            ]
    return lines


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
        "from typing import Any, Callable, Dict, List, Literal, Mapping, Optional, Union",
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
            *_py_calls(specs),
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
