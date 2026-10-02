#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML application specifications.

Applications (agentspecs >= 0.0.15): an agent with an interface, rules, tests
and a place to run — a chat, a widget, a decision or a worker, in one spec,
the Appspec. One YAML per application under ``agentspecs/apps``.

A rule is written in a person's words and enforced on what a tool does, so
the classes of action travel with the applications: this generator also
writes what every tool of the catalogue and every MCP server's tools do —
read, write, send, buy, delete, publish — read from ``agentspecs.actions``.

Each application is validated here, by ``agentspecs`` itself, and arrives
with its layout said and with what it names that is not enabled (`setup`).

Usage:
    python generate_apps.py \\
      --specs-dir agentspecs/agentspecs/apps \\
      --python-output agent_runtimes/specs/apps.py \\
      --typescript-output src/specs/apps.ts \\
      --actions-python-output agent_runtimes/specs/actions.py \\
      --actions-typescript-output src/specs/actions.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from agentspecs_clone import import_from_clone
from versioning import ensure_spec_version, version_suffix

#: The keys of an Appspec, as TypeScript spells them. Keys inside a surface's
#: components are the protocol's own and are left alone.
CAMEL = {
    "applies_to": "appliesTo",
    "ready_at": "readyAt",
    "keep_for": "keepFor",
    "retention_days": "retentionDays",
    "composed_by": "composedBy",
    "composed_at": "composedAt",
    "min_confidence": "minConfidence",
    "judgment_model": "judgmentModel",
}

#: The keys whose value is carried as it is written: a component tree, weights by name.
VERBATIM = ("components", "weights")


def _flat(text: Any) -> str:
    """A text on one line."""
    return " ".join(str(text or "").split())


def load_specs(specs_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Every application, validated, as plain data — and the action classes."""
    apps_module = import_from_clone(specs_dir, "apps")
    actions_module = sys.modules["agentspecs.actions"]
    apps = apps_module.load_apps(specs_dir)
    specs: list[dict[str, Any]] = []
    behaviours: dict[str, dict[str, str]] = {}
    escalations: dict[str, dict[str, Any]] = {}
    sources: dict[str, Any] = {}
    for identity in sorted(apps):
        app = apps[identity]
        spec = app.model_dump(mode="json", by_alias=True)
        spec["interface"]["layout"] = app.layout.value
        spec["record"]["retention_days"] = app.record.retention_days
        spec["setup"] = apps_module.app_setup(app)
        behaviours[identity] = {
            tool: behaviour.value
            for tool, behaviour in sorted(apps_module.tool_behaviours(app).items())
        }
        escalations[identity] = dict(sorted(apps_module.tool_escalations(app).items()))
        source = apps_module.dump_app(app)
        # The layout of its kind is not written: an editor cannot tell one
        # that was said from one that was not, and writes neither.
        if (source.get("interface") or {}).get("layout") == apps_module.DEFAULT_LAYOUTS[
            app.kind
        ].value:
            del source["interface"]["layout"]
            if not source["interface"]:
                del source["interface"]
        sources[identity] = source
        for rule in spec["rules"]:
            rule["applies_to"] = (
                [rule["applies_to"]]
                if isinstance(rule["applies_to"], str)
                else rule["applies_to"]
            )
        for key in ("description", "instructions", "goal"):
            spec[key] = _flat(spec.get(key))
        spec["interface"]["welcome"] = _flat(spec["interface"].get("welcome"))
        ensure_spec_version(spec)
        specs.append(spec)

    tools = {
        identity: [item.value for item in actions_module.tool_classes(tool)]
        for identity, tool in sorted(actions_module.tool_specs().items())
    }
    servers: dict[str, Any] = {}
    for identity, server in sorted(actions_module.server_specs().items()):
        declared = server.get("actions") or {}
        names = list(declared.get("tools") or {})
        conditions = {
            name: [
                condition.as_data()
                for condition in actions_module.server_tool_conditions(server, name)
            ]
            for name in names
        }
        servers[identity] = {
            "checked": declared.get("checked") or None,
            "default": [
                item.value
                for item in actions_module.classes_from(declared.get("default"))
            ],
            # What each tool does of its own, whatever it is asked.
            "tools": {
                name: [
                    item.value
                    for item in actions_module.server_tool_classes(server, name, {})
                ]
                for name in names
            },
            # What an argument makes it do besides.
            "conditions": {name: found for name, found in conditions.items() if found},
        }
    actions = {
        "classes": [item.value for item in actions_module.ActionClass],
        "tools": tools,
        "servers": servers,
        "behaviours": behaviours,
        "escalations": escalations,
        "sources": sources,
    }
    return specs, actions


def _const_name(spec: dict[str, Any]) -> str:
    """`web-research` 0.0.1 → `WEB_RESEARCH_APP_0_0_1`."""
    base = spec["id"].upper().replace("-", "_").replace(".", "_")
    return f"{base}_APP" + version_suffix(spec["version"])


def _typescript_value(value: Any, verbatim: bool = False) -> Any:
    """An application as the TypeScript interfaces read it; nulls left out."""
    if isinstance(value, dict):
        return {
            (key if verbatim else CAMEL.get(key, key)): _typescript_value(
                item, verbatim or key in VERBATIM
            )
            for key, item in value.items()
            if item is not None
        }
    if isinstance(value, list):
        return [_typescript_value(item, verbatim) for item in value]
    return value


HEADER = [
    "This file is AUTO-GENERATED from YAML specifications.",
    "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
]

ABOUT_APPS = [
    "Application Catalog.",
    "",
    "What a person uses and relies on: an agent with an interface, rules, tests",
    "and a place to run. A chat, a widget, a decision or a worker, in one spec.",
]

ABOUT_ACTIONS = [
    "Action Classes.",
    "",
    "What every tool does to the world: read, write, send, buy, delete, publish.",
    "A tool with no class is unknown, and unknown is the most restricted.",
]


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate the Python application catalogue."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        *ABOUT_APPS,
        "",
        *HEADER,
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import AppSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Application Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        lines.extend(
            [f"{_const_name(spec)} = AppSpec.model_validate(", f"    {spec!r}", ")", ""]
        )
    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# Application Catalog",
            "# " + "=" * 76,
            "",
            "APP_CATALOGUE: Dict[str, AppSpec] = {",
        ]
    )
    for spec in specs:
        lines.append(f"    {spec['id']!r}: {_const_name(spec)},")
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_app(app_id: str) -> AppSpec | None:",
            '    """An application, by `id` or `id:version`, or None."""',
            "    found = APP_CATALOGUE.get(app_id)",
            "    if found is not None:",
            "        return found",
            '    base, _, version = app_id.rpartition(":")',
            '    return APP_CATALOGUE.get(base) if base and "." in version else None',
            "",
            "",
            "def list_apps(kind: str | None = None) -> list[AppSpec]:",
            '    """Every application of the catalogue, or those of a kind."""',
            "    return [app for app in APP_CATALOGUE.values() if kind is None or app.kind == kind]",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(
    specs: list[dict[str, Any]], sources: dict[str, Any]
) -> str:
    """Generate the TypeScript application catalogue."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        *[f" * {line}".rstrip() for line in ABOUT_APPS],
        " *",
        *[f" * {line}" for line in HEADER],
        " */",
        "",
        "import type { AppKind, AppSpec } from '../types/agentspecs';",
        "",
    ]
    for spec in specs:
        body = json.dumps(_typescript_value(spec), indent=2, ensure_ascii=False)
        lines.extend([f"export const {_const_name(spec)}: AppSpec = {body};", ""])
    lines.append("export const APP_CATALOGUE: Record<string, AppSpec> = {")
    for spec in specs:
        lines.append(f"  {json.dumps(spec['id'])}: {_const_name(spec)},")
    lines.extend(
        [
            "};",
            "",
            "/** An application, by `id` or `id:version`, or undefined. */",
            "export function getApp(ref: string): AppSpec | undefined {",
            "  // Own entries only: `constructor` and `toString` are not applications.",
            "  const own = (id: string): AppSpec | undefined =>",
            "    Object.prototype.hasOwnProperty.call(APP_CATALOGUE, id)",
            "      ? APP_CATALOGUE[id]",
            "      : undefined;",
            "  const at = ref.lastIndexOf(':');",
            "  return (",
            "    own(ref) ??",
            "    (at > 0 && ref.slice(at + 1).includes('.')",
            "      ? own(ref.slice(0, at))",
            "      : undefined)",
            "  );",
            "}",
            "",
            "/**",
            " * Each application as the document its file holds: the spec's own words,",
            " * nothing written that is at its default. What reading and writing an",
            " * Appspec have to give back.",
            " */",
            "export const APP_SOURCES: Record<string, Record<string, unknown>> = "
            + json.dumps(sources, indent=2, ensure_ascii=False)
            + ";",
            "",
            "/** Every application of the catalogue, or those of a kind. */",
            "export function listApps(kind?: AppKind): AppSpec[] {",
            "  return Object.values(APP_CATALOGUE).filter(",
            "    app => kind === undefined || app.kind === kind,",
            "  );",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def generate_actions_python_code(actions: dict[str, Any]) -> str:
    """Generate the Python action classes."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        *ABOUT_ACTIONS,
        "",
        *HEADER,
        '"""',
        "",
        "from typing import Any, Dict, List",
        "",
        "from agent_runtimes.types import ServerActionsSpec",
        "",
        "#: The classes of action, from the one that changes nothing.",
        f"ACTION_CLASSES: List[str] = {actions['classes']!r}",
        "",
        "#: What each tool of the tools catalogue does, by id.",
        f"TOOL_ACTIONS: Dict[str, List[str]] = {actions['tools']!r}",
        "",
        "#: What each MCP server's tools do, by server id. `checked` is the day the",
        "#: names were read off the running server, or None when nobody looked.",
        "SERVER_ACTIONS: Dict[str, ServerActionsSpec] = {",
    ]
    for identity, server in actions["servers"].items():
        lines.append(f"    {identity!r}: ServerActionsSpec.model_validate({server!r}),")
    lines.extend(
        [
            "}",
            "",
            "#: What each application of the catalogue does about each classed tool of the",
            "#: servers it connects to, as agentspecs decides it: `do_it`, `if_asked`,",
            "#: `ask_first` or `leave_to_me`. What the rules engine has to reproduce.",
            f"APP_BEHAVIOURS: Dict[str, Dict[str, str]] = {actions['behaviours']!r}",
            "",
            "#: Where what a tool is asked changes what an application does about it: by",
            "#: application and tool, each condition and the behaviour when it holds.",
            f"APP_ESCALATIONS: Dict[str, Dict[str, List[Dict[str, Any]]]] = {actions['escalations']!r}",
            "",
        ]
    )
    return "\n".join(lines)


def generate_actions_typescript_code(actions: dict[str, Any]) -> str:
    """Generate the TypeScript action classes."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        *[f" * {line}".rstrip() for line in ABOUT_ACTIONS],
        " *",
        *[f" * {line}" for line in HEADER],
        " */",
        "",
        "import type {",
        "  ActionClass,",
        "  AppBehaviour,",
        "  AppEscalation,",
        "  ServerActionsSpec,",
        "} from '../types/agentspecs';",
        "",
        "/** The classes of action, from the one that changes nothing. */",
        f"export const ACTION_CLASSES: ActionClass[] = {json.dumps(actions['classes'])};",
        "",
        "/** What each tool of the tools catalogue does, by id. */",
        "export const TOOL_ACTIONS: Record<string, ActionClass[]> = "
        + json.dumps(actions["tools"], indent=2)
        + ";",
        "",
        "/**",
        " * What each MCP server's tools do, by server id. `checked` is the day the",
        " * names were read off the running server; absent when nobody looked.",
        " */",
        "export const SERVER_ACTIONS: Record<string, ServerActionsSpec> = "
        + json.dumps(_drop_nulls(actions["servers"]), indent=2)
        + ";",
        "",
        "/**",
        " * What each application of the catalogue does about each classed tool of the",
        " * servers it connects to, as agentspecs decides it. What the rules engine has",
        " * to reproduce.",
        " */",
        "export const APP_BEHAVIOURS: Record<string, Record<string, AppBehaviour>> = "
        + json.dumps(actions["behaviours"], indent=2)
        + ";",
        "",
        "/**",
        " * Where what a tool is asked changes what an application does about it: by",
        " * application and tool, each condition and the behaviour when it holds.",
        " */",
        "export const APP_ESCALATIONS: Record<",
        "  string,",
        "  Record<string, AppEscalation[]>",
        "> = " + json.dumps(actions["escalations"], indent=2) + ";",
        "",
    ]
    return "\n".join(lines)


def _drop_nulls(value: Any) -> Any:
    """A value without the keys that hold nothing."""
    if isinstance(value, dict):
        return {
            key: _drop_nulls(item) for key, item in value.items() if item is not None
        }
    if isinstance(value, list):
        return [_drop_nulls(item) for item in value]
    return value


def main() -> None:
    """Generate the application catalogue and the action classes."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML application specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    parser.add_argument("--actions-python-output", type=Path, required=True)
    parser.add_argument("--actions-typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory not found: {args.specs_dir}", file=sys.stderr)
        sys.exit(1)
    specs, actions = load_specs(args.specs_dir)
    outputs = [
        (args.python_output, generate_python_code(specs)),
        (
            args.typescript_output,
            generate_typescript_code(specs, actions["sources"]),
        ),
        (args.actions_python_output, generate_actions_python_code(actions)),
        (args.actions_typescript_output, generate_actions_typescript_code(actions)),
    ]
    for path, text in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(f"Generated: {path}")
    print(
        f"\n✓ Successfully generated code from {len(specs)} application specs, "
        f"{len(actions['tools'])} tools and {len(actions['servers'])} MCP servers"
    )


if __name__ == "__main__":
    main()
