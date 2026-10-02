#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML Op, Guard, Gate and Track specifications.

The accountability plane of agentspecs (>= 0.0.14): Guards check, Gates
decide, Tracks record, and an Op orchestrates Cogs under a validation
strategy made of the three. One YAML per spec under ``agentspecs/guards``,
``gates``, ``tracks`` and ``ops``.

Each is resolved here, by ``agentspecs`` itself, so the generated catalogues
are flat: a Guard carries the guardrail it extends, a Gate the signals it
reads, a Track its retention in days, and an Op everything it names.

Usage:
    python generate_ops.py --kind guards \\
      --specs-dir agentspecs/agentspecs/guards \\
      --python-output agent_runtimes/specs/guards.py \\
      --typescript-output src/specs/guards.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from agentspecs_clone import import_from_clone
from versioning import ensure_spec_version, version_suffix

#: What each kind is called, and what its catalogue says of itself.
KINDS: dict[str, dict[str, str]] = {
    "guards": {
        "model": "GuardSpec",
        "suffix": "GUARD",
        "catalogue": "GUARD_CATALOGUE",
        "one": "guard",
        "One": "Guard",
        "title": "Guard Catalog.",
        "about": "Reusable checks: a Guard extends a guardrail — the policy it verifies.\nEvery Guard is resolved: it carries that guardrail's policy.",
    },
    "gates": {
        "model": "GateSpec",
        "suffix": "GATE",
        "catalogue": "GATE_CATALOGUE",
        "one": "gate",
        "One": "Gate",
        "title": "Gate Catalog.",
        "about": "Decision points: what happens on what the Guards found.\nGuards check; Gates decide.",
    },
    "tracks": {
        "model": "TrackSpec",
        "suffix": "TRACK",
        "catalogue": "TRACK_CATALOGUE",
        "one": "track",
        "One": "Track",
        "title": "Track Catalog.",
        "about": "What evidence a run keeps, for how long, and who may read it.",
    },
    "ops": {
        "model": "OpSpec",
        "suffix": "OP",
        "catalogue": "OP_CATALOGUE",
        "one": "op",
        "One": "Op",
        "title": "Op Catalog.",
        "about": "Orchestrated, supervised workflows: Cogs, and how their work is verified.\nEvery Op is resolved: its Guards, its Gates and its Track are in it.",
    },
}

#: The keys this generator owns, as TypeScript spells them. A guardrail's own
#: keys (`token_limits`, `per_run`, …) stay as `GuardrailSpec` declares them.
CAMEL = {
    "max_retries": "maxRetries",
    "retain_for": "retainFor",
    "retention_days": "retentionDays",
    "feeds_memory": "feedsMemory",
    "frame_guards": "frameGuards",
    "in_flight": "inFlight",
    "post_run": "postRun",
}

#: A guardrail's permissions are written `read:data` and typed `read_data`.
PERMISSIONS = (
    "read:data",
    "write:data",
    "execute:code",
    "access:internet",
    "send:email",
    "deploy:production",
)


def _flat(text: Any) -> str:
    return " ".join(str(text or "").split())


#: What a Guard that does not say gets: agentspecs validates these defaults
#: and leaves them out of what `resolve_guard` returns, and the generated
#: types require them.
GUARD_DEFAULTS: dict[str, Any] = {
    "description": "",
    "tags": [],
    "signals": [],
    "icon": "shield-check",
    "emoji": "\U0001f6e1\ufe0f",
}


def _tidy_guard(guard: dict[str, Any]) -> dict[str, Any]:
    """A resolved Guard with every field the generated types require."""
    guard = dict(guard)
    for key, default in GUARD_DEFAULTS.items():
        if guard.get(key) is None:
            guard[key] = list(default) if isinstance(default, list) else default
    for key in ("description", "check"):
        guard[key] = _flat(guard.get(key))
    return guard


def load_specs(kind: str, specs_dir: Path) -> list[dict[str, Any]]:
    """Every spec of a kind, resolved and validated, as plain data."""
    module = import_from_clone(specs_dir, kind)
    specs: list[dict[str, Any]] = []
    if kind == "guards":
        raw = module.load_raw_guards(specs_dir)
        specs = [
            _tidy_guard(module.resolve_guard(raw[identity])) for identity in sorted(raw)
        ]
    elif kind == "gates":
        gates = module.load_gates(specs_dir)
        specs = [
            {
                **gates[identity].model_dump(mode="json"),
                "signals": gates[identity].signals,
            }
            for identity in sorted(gates)
        ]
    elif kind == "tracks":
        tracks = module.load_tracks(specs_dir)
        specs = [
            {
                **tracks[identity].model_dump(mode="json"),
                "retention_days": tracks[identity].retention_days,
            }
            for identity in sorted(tracks)
        ]
    elif kind == "ops":
        raw = module.load_raw_ops(specs_dir)
        for identity in sorted(raw):
            op = module.resolve_op(raw[identity])
            op["guards"] = {
                stage: [_tidy_guard(guard) for guard in guards]
                for stage, guards in op["guards"].items()
            }
            op["supervisor"] = {
                "model": op["supervisor"]["model"],
                "instructions": _flat(op["supervisor"].get("instructions")),
            }
            op["goal"] = _flat(op.get("goal"))
            op["color"] = op.get("color") or None
            specs.append(op)
    for spec in specs:
        ensure_spec_version(spec)
        spec["description"] = _flat(spec.get("description"))
    return specs


def _const_name(kind: str, spec: dict[str, Any]) -> str:
    """`schema-guard` 0.0.1 → `SCHEMA_GUARD_0_0_1`; `standard` → `STANDARD_TRACK_0_0_1`."""
    suffix = KINDS[kind]["suffix"]
    base = spec["id"].upper().replace("-", "_").replace(".", "_")
    if not (base.endswith(f"_{suffix}") or base.startswith(f"{suffix}_")):
        base += f"_{suffix}"
    return base + version_suffix(spec["version"])


def _python_value(value: Any) -> Any:
    """A resolved spec as the Python models read it."""
    if isinstance(value, dict):
        converted = {key: _python_value(item) for key, item in value.items()}
        permissions = converted.get("permissions")
        if isinstance(permissions, dict):
            converted["permissions"] = {
                (key.replace(":", "_") if key in PERMISSIONS else key): item
                for key, item in permissions.items()
            }
        return converted
    if isinstance(value, list):
        return [_python_value(item) for item in value]
    return value


def _typescript_value(value: Any) -> Any:
    """A resolved spec as the TypeScript interfaces read it; nulls left out."""
    if isinstance(value, dict):
        return {
            CAMEL.get(key, key): _typescript_value(item)
            for key, item in value.items()
            if item is not None
        }
    if isinstance(value, list):
        return [_typescript_value(item) for item in value]
    return value


def generate_python_code(kind: str, specs: list[dict[str, Any]]) -> str:
    """Generate Python code for one kind."""
    names = KINDS[kind]
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        names["title"],
        "",
        *names["about"].split("\n"),
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict",
        "",
        f"from agent_runtimes.types import {names['model']}",
        "",
        "",
        "# " + "=" * 76,
        f"# {names['One']} Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        lines.extend(
            [
                f"{_const_name(kind, spec)} = {names['model']}.model_validate(",
                f"    {_python_value(spec)!r}",
                ")",
                "",
            ]
        )
    article = "An" if kind == "ops" else "A"
    lines.extend(
        [
            "",
            "# " + "=" * 76,
            f"# {names['One']} Catalog",
            "# " + "=" * 76,
            "",
            f"{names['catalogue']}: Dict[str, {names['model']}] = {{",
        ]
    )
    for spec in specs:
        lines.append(f"    {spec['id']!r}: {_const_name(kind, spec)},")
    lines.extend(
        [
            "}",
            "",
            "",
            f"def get_{names['one']}({names['one']}_id: str) -> {names['model']} | None:",
            f'    """{article} {names["One"]}, by `id` or `id:version`, or None."""',
            f"    found = {names['catalogue']}.get({names['one']}_id)",
            "    if found is not None:",
            "        return found",
            f'    base, _, version = {names["one"]}_id.rpartition(":")',
            f'    return {names["catalogue"]}.get(base) if base and "." in version else None',
            "",
            "",
            f"def list_{kind}() -> list[{names['model']}]:",
            f'    """Every {names["One"]} of the catalogue, resolved."""',
            f"    return list({names['catalogue']}.values())",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(kind: str, specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code for one kind."""
    names = KINDS[kind]
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        f" * {names['title']}",
        " *",
        *[f" * {line}" for line in names["about"].split("\n")],
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        f"import type {{ {names['model']} }} from '../types/agentspecs';",
        "",
    ]
    for spec in specs:
        body = json.dumps(_typescript_value(spec), indent=2, ensure_ascii=False)
        lines.extend(
            [f"export const {_const_name(kind, spec)}: {names['model']} = {body};", ""]
        )
    lines.append(
        f"export const {names['catalogue']}: Record<string, {names['model']}> = {{"
    )
    for spec in specs:
        lines.append(f"  {json.dumps(spec['id'])}: {_const_name(kind, spec)},")
    article = "An" if kind == "ops" else "A"
    lines.extend(
        [
            "};",
            "",
            f"/** {article} {names['One']}, by `id` or `id:version`, or undefined. */",
            f"export function get{names['One']}(ref: string): {names['model']} | undefined {{",
            f"  // Own entries only: `constructor` and `toString` are not {names['One']}s.",
            f"  const own = (id: string): {names['model']} | undefined =>",
            f"    Object.prototype.hasOwnProperty.call({names['catalogue']}, id)",
            f"      ? {names['catalogue']}[id]",
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
            f"export function list{names['One']}s(): {names['model']}[] {{",
            f"  return Object.values({names['catalogue']});",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    """Generate one kind's catalogues."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML Op, Guard, Gate and Track specifications"
    )
    parser.add_argument(
        "--kind",
        choices=sorted(KINDS),
        required=True,
        help="Which catalogue to generate",
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing the YAML files",
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
    specs = load_specs(args.kind, args.specs_dir)
    if not specs:
        print(
            f"Warning: No {args.kind} specifications found in {args.specs_dir}",
            file=sys.stderr,
        )
        return
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(args.kind, specs))
    print(f"Generated Python code: {args.python_output}")
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(args.kind, specs))
    print(f"Generated TypeScript code: {args.typescript_output}")
    print(f"\n✓ Successfully generated code from {len(specs)} {args.kind} specs")


if __name__ == "__main__":
    main()
