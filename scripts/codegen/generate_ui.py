#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML UI specifications.

A UI spec is one Reactor plugin of this package (``src/apps/plugins/``) a
Maker composes an interface with (AGENTIC_UI R8): its registered name, its
Contributions, the Contribution Points it offers, its settings, the visual
components it renders (LOOP C-13) and the UI renderers it may be exposed
through (``agentspecs/ui-renderers``, ``generate_ui_renderers.py``). One YAML
per plugin under ``agentspecs/ui``; an agent's or an application's ``ui``
names plugins, each with its renderer.

Usage:
    python generate_ui.py \\
      --specs-dir agentspecs/agentspecs/ui \\
      --python-output agent_runtimes/specs/ui.py \\
      --typescript-output src/specs/ui.ts
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
    """Load all UI YAML specifications from a directory.

    A spec of the old shape — a renderer listed as a UI, with no `plugin` —
    is refused, and so is a renderer the `ui-renderers` beside it does not have.
    """
    renderers_dir = specs_dir.parent / "ui-renderers"
    renderers = {path.stem for path in renderers_dir.glob("*.yaml")}
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        with open(yaml_file) as f:
            spec = yaml.safe_load(f)
            ensure_spec_version(spec)
            if spec["id"] != yaml_file.stem:
                raise ValueError(
                    f"{yaml_file.name}: the file is named for id {yaml_file.stem!r}, the spec says {spec['id']!r}"
                )
            if "plugin" not in spec:
                raise ValueError(
                    f"{yaml_file.name}: a UI spec is a Reactor plugin (`plugin`); "
                    "a renderer is a spec of agentspecs/ui-renderers"
                )
            for renderer in spec.get("renderers") or []:
                if renderer not in renderers:
                    raise ValueError(
                        f"{yaml_file.name}: there is no UI renderer {renderer!r} in {renderers_dir}"
                    )
            specs.append(spec)
    return specs


def _const_name(plugin_id: str) -> str:
    return plugin_id.replace("-", "_").replace(".", "_").upper() + "_UI"


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
    """Generate Python code from UI specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "UI Catalog.",
        "",
        "The UI plugins: the Reactor plugins an interface is made of (AGENTIC_UI R8).",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Any, Callable, Dict, List, Literal, Mapping, Optional, Union",
        "",
        "from agent_runtimes.types import (",
        "    ComponentBindingsSpec,",
        "    ComponentSpec,",
        "    UiContributionsSpec,",
        "    UISpec,",
        ")",
        "",
        "# " + "=" * 76,
        "# UI Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        const = _const_name(spec["id"]) + version_suffix(spec["version"])
        lines.extend(
            [
                f"{const} = UISpec(",
                f"    id={_py(spec['id'])},",
                f"    version={_py(str(spec['version']))},",
                f"    name={_py(spec['name'])},",
                f"    description={_py(str(spec.get('description', '')).strip())},",
                f"    emoji={json.dumps(spec['emoji'], ensure_ascii=False)},",
                f"    octicon={_py(spec['octicon']) if spec.get('octicon') else 'None'},",
                f"    plugin={_py(spec['plugin'])},",
                f"    folder={_py(spec['folder'])},",
                f"    per={_py(spec['per']) if spec.get('per') else 'None'},",
                "    contributions=UiContributionsSpec(",
                f"        slots={list((spec.get('contributions') or {}).get('slots') or [])!r},",
                f"        points={list((spec.get('contributions') or {}).get('points') or [])!r},",
                f"        commands={list((spec.get('contributions') or {}).get('commands') or [])!r},",
                "    ),",
                f"    contribution_points={list(spec.get('contribution_points') or [])!r},",
                f"    settings={spec.get('settings') or {}!r},",
                f"    renderers={list(spec.get('renderers') or [])!r},",
                f"    catalog={_py(str(spec.get('catalog') or ''))},",
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
            "# UI Catalog",
            "# " + "=" * 76,
            "",
            "UI_CATALOGUE: Dict[str, UISpec] = {",
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
            "def get_ui(plugin_id: str) -> UISpec | None:",
            '    """The UI plugin an agent\'s or an application\'s `ui` names, or None."""',
            "    return UI_CATALOGUE.get(plugin_id)",
            "",
            "",
            "def list_ui() -> list[UISpec]:",
            "    return list(UI_CATALOGUE.values())",
            "",
            "",
            "#: The visual components the UI plugins render, by the name a",
            "#: surface gives them (LOOP C-13).",
            "COMPONENT_CATALOGUE: Dict[str, ComponentSpec] = {",
            "    component.id: component",
            "    for plugin in UI_CATALOGUE.values()",
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
    """Generate TypeScript code from UI specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * UI Catalog.",
        " *",
        " * The UI plugins: the Reactor plugins an interface is made of (AGENTIC_UI R8).",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { ComponentSpec, UISpec } from '../types/agentspecs';",
        "",
    ]
    for spec in specs:
        const = _const_name(spec["id"]) + version_suffix(spec["version"])
        lines.extend(
            [
                f"export const {const}: UISpec = {{",
                f"  id: {_ts(spec['id'])},",
                f"  version: {_ts(str(spec['version']))},",
                f"  name: {_ts(spec['name'])},",
                f"  description: {_ts(str(spec.get('description', '')).strip())},",
                f"  emoji: {json.dumps(spec['emoji'], ensure_ascii=False)},",
                *(
                    [f"  octicon: {_ts(spec['octicon'])},"]
                    if spec.get("octicon")
                    else []
                ),
                f"  plugin: {_ts(spec['plugin'])},",
                f"  folder: {_ts(spec['folder'])},",
                *([f"  per: {_ts(spec['per'])},"] if spec.get("per") else []),
                "  contributions: {",
                f"    slots: {json.dumps(list((spec.get('contributions') or {}).get('slots') or []))},",
                f"    points: {json.dumps(list((spec.get('contributions') or {}).get('points') or []))},",
                f"    commands: {json.dumps(list((spec.get('contributions') or {}).get('commands') or []))},",
                "  },",
                f"  contributionPoints: {json.dumps(list(spec.get('contribution_points') or []))},",
                f"  settings: {json.dumps(spec.get('settings') or {}, ensure_ascii=False)},",
                f"  renderers: {json.dumps(list(spec.get('renderers') or []))},",
                f"  catalog: {_ts(str(spec.get('catalog') or ''))},",
                f"  components: {json.dumps([{**c, 'events': c.get('events', [])} for c in spec.get('components') or []], indent=2, ensure_ascii=False)},",
                "};",
                "",
            ]
        )
    lines.append("export const UI_CATALOGUE: Record<string, UISpec> = {")
    for spec in specs:
        lines.append(
            f"  {_ts(spec['id'])}: {_const_name(spec['id']) + version_suffix(spec['version'])},"
        )
    lines.extend(
        [
            "};",
            "",
            "/** The UI plugin an agent's or an application's `ui` names, or undefined. */",
            "export function getUI(pluginId: string): UISpec | undefined {",
            "  return UI_CATALOGUE[pluginId];",
            "}",
            "",
            "export function listUI(): UISpec[] {",
            "  return Object.values(UI_CATALOGUE);",
            "}",
            "",
            "/** The visual components the UI plugins render, by the name a surface gives them (LOOP C-13). */",
            "export const COMPONENT_CATALOGUE: Record<string, ComponentSpec> = Object.fromEntries(",
            "  Object.values(UI_CATALOGUE)",
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
        description="Generate Python and TypeScript code from YAML UI specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing UI YAML files",
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
            f"Warning: No UI specifications found in {args.specs_dir}",
            file=sys.stderr,
        )
        return
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(specs))
    print(f"Generated Python code: {args.python_output}")
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(f"Generated TypeScript code: {args.typescript_output}")
    print(f"\n✓ Successfully generated code from {len(specs)} UI specs")


if __name__ == "__main__":
    main()
