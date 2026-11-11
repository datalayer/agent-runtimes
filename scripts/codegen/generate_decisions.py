#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML decisions specifications.

A decisions spec says how an agent decides: the model asked typed decisions,
the question types it answers, the limits of one call. The specs are read and
checked by ``agentspecs.decisions`` of the clone they come from, so the rules
are the catalogue's own; this module also holds the two checks the agents'
and the applications' generators make against it.

Usage:
    python generate_decisions.py \\
      --specs-dir agentspecs/agentspecs/decisions \\
      --python-output agent_runtimes/specs/decisions.py \\
      --typescript-output src/specs/decisions.ts
"""

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml
from agentspecs_clone import import_from_clone
from versioning import split_spec_ref, version_suffix, versioned_ref


def _const_name(spec_id: str, version: str) -> str:
    """`jev`, `0.0.1` -> `JEV_DECISIONS_0_0_1`."""
    return f"{spec_id.upper().replace('-', '_')}_DECISIONS{version_suffix(version)}"


def _fmt_list(items: list[str], quote: str = '"') -> str:
    return "[" + ", ".join(f"{quote}{item}{quote}" for item in items) + "]"


def load_decisions_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every decisions spec of the clone, checked by `agentspecs.decisions`, as plain data."""
    module = import_from_clone(specs_dir, "decisions")
    try:
        specs = module.load_decisions(specs_dir)
    except ValueError as refused:
        raise SystemExit(f"Error: {refused}") from None
    return [specs[spec_id].model_dump(mode="json") for spec_id in sorted(specs)]


def apply_agent_decisions(agents: list[dict[str, Any]], agents_dir: Path) -> None:
    """Check every agent's `decisions`, and give those that name one the `decide` tool.

    Refused, in a sentence naming the agent (``agentspecs.decisions``): a spec
    the catalogue does not have or that is not enabled, and `decide` listed
    under `backend_tools` by an agent that names no decisions. An agent that
    names one gets `decide:<version>` among its backend tools, and its
    `decisions` as `id:version`.
    """
    decisions_dir = agents_dir.parent / "decisions"
    module = import_from_clone(decisions_dir, "decisions")
    catalogue = module.load_decisions(decisions_dir)
    tool = yaml.safe_load(
        (agents_dir.parent / "backend-tools" / f"{module.DECIDE_TOOL}.yaml").read_text()
    )
    tool_ref = versioned_ref(tool["id"], str(tool["version"]))
    problems: list[str] = []
    for agent in agents:
        try:
            spec = module.agent_decisions(agent, catalogue)
        except ValueError as refused:
            problems.append(str(refused))
            continue
        if spec is None:
            continue
        agent["decisions"] = versioned_ref(spec.id, spec.version)
        tools = list(agent.get("backend_tools") or [])
        if module.DECIDE_TOOL not in [split_spec_ref(ref)[0] for ref in tools]:
            tools.append(tool_ref)
        agent["backend_tools"] = tools
    if problems:
        raise SystemExit("\n".join(f"Error: {problem}" for problem in problems))


def check_app_decisions(apps: list[dict[str, Any]], apps_dir: Path) -> None:
    """Refuse an application that lists `decide` and runs an agent that names no decisions."""
    module = import_from_clone(apps_dir.parent / "decisions", "decisions")
    agents_dir = apps_dir.parent / "agents"
    problems: list[str] = []
    for app in apps:
        tools = app.get("backendTools") or app.get("backend_tools") or []
        if module.DECIDE_TOOL not in [split_spec_ref(ref)[0] for ref in tools]:
            continue
        agent_id = split_spec_ref(app.get("agent"))[0]
        agent_file = agents_dir / f"{agent_id}.yaml"
        agent = yaml.safe_load(agent_file.read_text()) if agent_file.is_file() else {}
        if not (agent or {}).get("decisions"):
            problems.append(
                f"Error: application {app.get('id')!r} lists the backend tool "
                f"`{module.DECIDE_TOOL}` but its agent "
                f"{agent_id or '(none)'!r} names no decisions: an application "
                "decides through an agent whose spec says `decisions: <id>:<version>`"
            )
    if problems:
        raise SystemExit("\n".join(problems))


def _clean(text: str) -> str:
    return " ".join(str(text or "").split())


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from decisions specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Decisions Catalog.",
        "",
        "How an agent decides: the model asked typed decisions, the question",
        "types it answers, the limits of one call. An agent has the capability",
        "when its spec names one of these.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Optional",
        "",
        "from agent_runtimes.types import DecisionsSpec",
        "",
        "# " + "=" * 76,
        "# Decisions Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        description = _clean(spec.get("description")).replace('"', '\\"')
        lines.extend(
            [
                f"{_const_name(spec['id'], spec['version'])} = DecisionsSpec(",
                f'    id="{spec["id"]}",',
                f'    version="{spec["version"]}",',
                f'    name="{spec["name"]}",',
                f'    description="{description}",',
                f"    enabled={bool(spec.get('enabled', False))},",
                f'    model="{spec["model"]}",',
                f"    questions={_fmt_list(spec['questions'])},",
                f"    max_questions={int(spec['max_questions'])},",
                f"    max_text_length={int(spec['max_text_length'])},",
                f"    tags={_fmt_list(spec.get('tags') or [])},",
                f'    icon="{spec.get("icon") or "law"}",',
                f'    emoji="{spec.get("emoji") or "⚖️"}",',
                ")",
                "",
            ]
        )
    lines.extend(
        [
            "# " + "=" * 76,
            "# Decisions Catalog",
            "# " + "=" * 76,
            "",
            "DECISIONS_CATALOGUE: dict[str, DecisionsSpec] = {",
        ]
    )
    for spec in specs:
        lines.append(f'    "{spec["id"]}": {_const_name(spec["id"], spec["version"])},')
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_decisions(decisions_id: str) -> Optional[DecisionsSpec]:",
            '    """',
            "    Get a decisions specification by ID (accepts both bare and versioned refs).",
            "",
            "    Args:",
            "        decisions_id: The identifier of the decisions spec, `id` or `id:version`.",
            "",
            "    Returns:",
            "        The DecisionsSpec, or None if not found.",
            '    """',
            "    spec = DECISIONS_CATALOGUE.get(decisions_id)",
            "    if spec is not None:",
            "        return spec",
            '    base, _, ver = decisions_id.rpartition(":")',
            '    if base and "." in ver:',
            "        return DECISIONS_CATALOGUE.get(base)",
            "    return None",
            "",
            "",
            "def list_decisions() -> list[DecisionsSpec]:",
            '    """',
            "    List all decisions specifications.",
            "",
            "    Returns:",
            "        List of all DecisionsSpec specifications.",
            '    """',
            "    return list(DECISIONS_CATALOGUE.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from decisions specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Decisions Catalog",
        " *",
        " * How an agent decides: the model asked typed decisions, the question",
        " * types it answers, the limits of one call. An agent has the capability",
        " * when its spec names one of these.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { DecisionsSpec } from '../types';",
        "",
        "// " + "=" * 76,
        "// Decisions Definitions",
        "// " + "=" * 76,
        "",
    ]
    for spec in specs:
        description = _clean(spec.get("description")).replace("'", "\\'")
        lines.extend(
            [
                f"export const {_const_name(spec['id'], spec['version'])}: DecisionsSpec = {{",
                f"  id: '{spec['id']}',",
                f"  version: '{spec['version']}',",
                f"  name: '{spec['name']}',",
                f"  description: '{description}',",
                f"  enabled: {'true' if spec.get('enabled', False) else 'false'},",
                f"  model: '{spec['model']}',",
                f"  questions: {_fmt_list(spec['questions'], quote=chr(39))},",
                f"  maxQuestions: {int(spec['max_questions'])},",
                f"  maxTextLength: {int(spec['max_text_length'])},",
                f"  tags: {_fmt_list(spec.get('tags') or [], quote=chr(39))},",
                f"  icon: '{spec.get('icon') or 'law'}',",
                f"  emoji: '{spec.get('emoji') or '⚖️'}',",
                "};",
                "",
            ]
        )
    lines.extend(
        [
            "// " + "=" * 76,
            "// Decisions Catalog",
            "// " + "=" * 76,
            "",
            "export const DECISIONS_CATALOGUE: Record<string, DecisionsSpec> = {",
        ]
    )
    for spec in specs:
        lines.append(f"  '{spec['id']}': {_const_name(spec['id'], spec['version'])},")
    lines.extend(
        [
            "};",
            "",
            "function resolveDecisionsId(decisionsId: string): string {",
            "  if (decisionsId in DECISIONS_CATALOGUE) return decisionsId;",
            "  const idx = decisionsId.lastIndexOf(':');",
            "  if (idx > 0) {",
            "    const base = decisionsId.slice(0, idx);",
            "    if (base in DECISIONS_CATALOGUE) return base;",
            "  }",
            "  return decisionsId;",
            "}",
            "",
            "/**",
            " * Get a decisions specification by ID (`id` or `id:version`).",
            " */",
            "export function getDecisions(",
            "  decisionsId: string,",
            "): DecisionsSpec | undefined {",
            "  return DECISIONS_CATALOGUE[resolveDecisionsId(decisionsId)];",
            "}",
            "",
            "/**",
            " * List all decisions specifications.",
            " */",
            "export function listDecisions(): DecisionsSpec[] {",
            "  return Object.values(DECISIONS_CATALOGUE);",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML decisions specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory not found: {args.specs_dir}", file=sys.stderr)
        sys.exit(1)

    specs = load_decisions_specs(args.specs_dir)
    print(f"Loaded {len(specs)} decisions specification(s)")

    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(specs))
    print("✅ Code generation complete!")


if __name__ == "__main__":
    main()
