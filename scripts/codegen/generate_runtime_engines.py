#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from the YAML runtime engine specifications.

One YAML per runtime engine under ``agentspecs/runtime-engines``: what
runs and hosts an agent (``runtime_engine``, on the line after ``harness``) —
Datalayer, Kagent, AWS AgentCore. The specs are read and validated by the
clone's own ``agentspecs.runtime_engines``, in their order, the default first.

Usage:
    python generate_runtime_engines.py \\
      --specs-dir agentspecs/agentspecs/runtime-engines \\
      --python-output agent_runtimes/specs/runtime_engines.py \\
      --typescript-output src/specs/runtimeEngines.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

from agentspecs_clone import import_from_clone
from versioning import ensure_spec_version, version_suffix


def load_runtime_engine_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every runtime engine spec of a directory, validated by the clone, the default first."""
    engines = import_from_clone(specs_dir, "runtime_engines")
    specs = []
    for spec in engines.load_runtime_engines(specs_dir).values():
        raw = spec.model_dump()
        ensure_spec_version(raw)
        specs.append(raw)
    return specs


def _const(spec: dict[str, Any]) -> str:
    return (
        spec["id"].replace("-", "_").upper()
        + "_RUNTIME_ENGINE"
        + version_suffix(spec["version"])
    )


def _s(value: Any) -> str:
    return json.dumps(" ".join(str(value).split()), ensure_ascii=False)


def _py_harnesses(spec: dict[str, Any]) -> str:
    if spec["harnesses"] is None:
        return "None"
    return "[" + ", ".join(_s(each) for each in spec["harnesses"]) + "]"


def _ts_harnesses(spec: dict[str, Any]) -> str:
    if spec["harnesses"] is None:
        return "null"
    return "[" + ", ".join(_s(each) for each in spec["harnesses"]) + "]"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """The Python catalogue of the runtime engines."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Runtime Engine Catalog.",
        "",
        "What runs and hosts an agent (`runtime_engine`): "
        + ", ".join(spec["name"] for spec in specs)
        + ".",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import RuntimeEngineSpec",
        "",
    ]
    for spec in specs:
        lines += [
            f"{_const(spec)} = RuntimeEngineSpec(",
            f"    id={_s(spec['id'])},",
            f"    version={_s(spec['version'])},",
            f"    name={_s(spec['name'])},",
            f"    description={_s(spec['description'])},",
            f"    docs_url={_s(spec['docs_url'])},",
            f"    position={int(spec['position'])},",
            f"    harnesses={_py_harnesses(spec)},",
            f"    enabled={bool(spec['enabled'])},",
            ")",
            "",
        ]
    lines += [
        "#: Every runtime engine, by id, the default first.",
        "RUNTIME_ENGINE_CATALOGUE: Dict[str, RuntimeEngineSpec] = {",
    ]
    lines += [f"    {_s(spec['id'])}: {_const(spec)}," for spec in specs]
    lines += [
        "}",
        "",
        "#: The engines an agent may name, the default first.",
        "RUNTIME_ENGINES: tuple[str, ...] = tuple(RUNTIME_ENGINE_CATALOGUE)",
        "",
        "#: The engine of an agent that names none.",
        "DEFAULT_RUNTIME_ENGINE = RUNTIME_ENGINES[0]",
        "",
        "#: The harnesses each engine can run; an engine absent here runs any.",
        "ENGINE_HARNESSES: Dict[str, tuple[str, ...]] = {",
        "    spec.id: tuple(spec.harnesses)",
        "    for spec in RUNTIME_ENGINE_CATALOGUE.values()",
        "    if spec.harnesses is not None",
        "}",
        "",
        "",
        "def get_runtime_engine(engine_id: str) -> RuntimeEngineSpec | None:",
        '    """The runtime engine an agent\'s `runtime_engine` names, or None."""',
        "    return RUNTIME_ENGINE_CATALOGUE.get(engine_id)",
        "",
        "",
        "def list_runtime_engines() -> list[RuntimeEngineSpec]:",
        "    return list(RUNTIME_ENGINE_CATALOGUE.values())",
        "",
    ]
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """The TypeScript catalogue of the runtime engines."""
    ids = ", ".join(f"'{spec['id']}'" for spec in specs)
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Runtime Engine Catalog.",
        " *",
        " * What runs and hosts an agent (`runtime_engine`): "
        + ", ".join(spec["name"] for spec in specs)
        + ".",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { RuntimeEngineSpec } from '../types/agentspecs';",
        "",
        "/** The engines an agent may name (`runtime_engine`), the default first. */",
        f"export const RUNTIME_ENGINES = [{ids}] as const;",
        "",
        "/** What runs and hosts an agent. */",
        "export type RuntimeEngine = (typeof RUNTIME_ENGINES)[number];",
        "",
        "/** The engine of an agent that names none. */",
        f"export const DEFAULT_RUNTIME_ENGINE: RuntimeEngine = '{specs[0]['id']}';",
        "",
    ]
    for spec in specs:
        lines += [
            f"export const {_const(spec)}: RuntimeEngineSpec = {{",
            f"  id: {_s(spec['id'])},",
            f"  version: {_s(spec['version'])},",
            f"  name: {_s(spec['name'])},",
            f"  description: {_s(spec['description'])},",
            f"  docsUrl: {_s(spec['docs_url'])},",
            f"  position: {int(spec['position'])},",
            f"  harnesses: {_ts_harnesses(spec)},",
            f"  enabled: {'true' if spec['enabled'] else 'false'},",
            "};",
            "",
        ]
    lines += [
        "/** Every runtime engine, by id, the default first. */",
        "export const RUNTIME_ENGINE_CATALOGUE: Record<RuntimeEngine, RuntimeEngineSpec> = {",
    ]
    lines += [f"  {spec['id']}: {_const(spec)}," for spec in specs]
    lines += [
        "};",
        "",
        "/** How an engine is named to a person. */",
        "export const RUNTIME_ENGINE_LABELS: Record<RuntimeEngine, string> = {",
    ]
    lines += [f"  {spec['id']}: {_s(spec['name'])}," for spec in specs]
    lines += [
        "};",
        "",
        "/** The harnesses an engine can run; an engine absent here runs any. */",
        "export const RUNTIME_ENGINE_HARNESSES: Partial<",
        "  Record<RuntimeEngine, readonly string[]>",
        "> = {",
    ]
    lines += [
        f"  {spec['id']}: {_ts_harnesses(spec)},"
        for spec in specs
        if spec["harnesses"] is not None
    ]
    lines += [
        "};",
        "",
        "/** Whether a value names a runtime engine. */",
        "export function isRuntimeEngine(value: unknown): value is RuntimeEngine {",
        "  return (RUNTIME_ENGINES as readonly unknown[]).includes(value);",
        "}",
        "",
        "/** The runtime engine an agent's `runtimeEngine` names, or undefined. */",
        "export function getRuntimeEngine(",
        "  engineId: string,",
        "): RuntimeEngineSpec | undefined {",
        "  return isRuntimeEngine(engineId)",
        "    ? RUNTIME_ENGINE_CATALOGUE[engineId]",
        "    : undefined;",
        "}",
        "",
        "export function listRuntimeEngines(): RuntimeEngineSpec[] {",
        "  return RUNTIME_ENGINES.map(engine => RUNTIME_ENGINE_CATALOGUE[engine]);",
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
    specs = load_runtime_engine_specs(args.specs_dir)
    if not specs:
        raise SystemExit(f"Error: no runtime engine spec in {args.specs_dir}")
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(
        f"Generated {len(specs)} runtime engines: {args.python_output}, {args.typescript_output}"
    )


if __name__ == "__main__":
    main()
