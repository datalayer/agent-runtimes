#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML Cog specifications.

A Cog is an AI worker you can hold to account: it extends an agent spec and is
equipped with Frames. One YAML per Cog under ``agentspecs/cogs``.

A Cog is resolved here, by ``agentspecs`` itself: the agent it extends, the
Cog's own changes, then its Frames — their skills, tools and MCP servers added
to the agent's and their context rendered onto its system prompt. What is
generated is flat: each Cog carries a complete agent spec, written by the
agent generator, with the Frames it works under and the Guards it answers to.

Usage:
    python generate_cogs.py \\
      --specs-dir agentspecs/agentspecs/cogs \\
      --python-output agent_runtimes/specs/cogs.py \\
      --typescript-output src/specs/cogs.ts
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import generate_agents
from agentspecs_clone import import_from_clone
from versioning import ensure_spec_version, version_suffix


def load_cog_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every Cog of a directory, resolved to a flat agent spec with its Frames."""
    cogs = import_from_clone(specs_dir, "cogs")
    raw = cogs.load_raw_cogs(specs_dir)
    specs = []
    for identity in sorted(raw):
        ensure_spec_version(raw[identity])
        flat = cogs.resolve_cog(raw[identity])
        ensure_spec_version(flat)
        specs.append(flat)
    return specs


def _agent_const(spec: dict[str, Any]) -> str:
    """The constant the agent generator gives a spec."""
    base = spec["id"].upper().replace("-", "_")
    suffix = "_SPEC" if spec["id"].endswith("-agent") else "_AGENTSPEC"
    return base + suffix + version_suffix(spec["version"])


def _cog_const(spec: dict[str, Any]) -> str:
    """The constant of a Cog: `cog-crawler` 0.0.1 → `COG_CRAWLER_0_0_1`."""
    base = spec["id"].upper().replace("-", "_")
    if not base.startswith("COG_"):
        base += "_COG"
    return base + version_suffix(spec["version"])


def _cog_fields(spec: dict[str, Any]) -> dict[str, Any]:
    context = spec["frame_context"]
    return {
        "id": spec["id"],
        "version": spec["version"],
        "name": spec["name"],
        "description": " ".join(str(spec.get("description") or "").split()),
        "agent": spec["agent"],
        "frames": list(spec["frames"]),
        "lineage": list(context["lineage"]),
        "kind": spec["kind"],
        "enabled": bool(spec["enabled"]),
        "guards": list(context["guards"]),
    }


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from resolved Cog specifications."""
    code = generate_agents.generate_python_code([("", spec) for spec in specs])
    # The agent generator writes an agent library; this is the same specs,
    # under the names of a Cog catalogue.
    head, registry = code.split(
        "# ============================================================================\n# Agent Specs Registry",
        1,
    )
    head = head.replace(
        '"""\nAgent Library.\n\nPredefined agent specifications that can be instantiated as Agent Runtimes.\nTHIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.\nGenerated from YAML specifications in specs/agents/\n"""',
        '"""\nCog Catalog.\n\nAI workers you can hold to account: a Cog extends an agent spec and is\nequipped with Frames. Every Cog is resolved — its `spec` is a complete agent\nspec, with its Frames\' capability and context already in it.\n\nTHIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.\nGenerated from YAML specifications in specs/cogs/\n"""',
    )
    if "Cog Catalog." not in head:
        raise SystemExit(
            "Error: the agent generator's header changed; update generate_cogs.py"
        )
    head = head.replace(
        "from agent_runtimes.types import (\n",
        "from agent_runtimes.types import (\n    CogSpec,\n    FrameGuardSpec,\n",
    ).replace(
        "# Agent Specs\n",
        "# Cog Agent Specs: each Cog, resolved to the agent spec a runtime launches\n",
    )
    del registry

    lines = [
        head.rstrip("\n"),
        "",
        "",
        "# " + "=" * 76,
        "# Cog Catalog",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        fields = _cog_fields(spec)
        const = _cog_const(spec)
        lines.append(f"{const} = CogSpec(")
        for name, value in fields.items():
            if name == "guards":
                rendered = (
                    "["
                    + ", ".join(f"FrameGuardSpec(**{guard!r})" for guard in value)
                    + "]"
                )
            else:
                rendered = repr(value)
            lines.append(f"    {name}={rendered},")
        lines.extend([f"    spec={_agent_const(spec)},", ")", ""])
    lines.extend(["", "COG_CATALOGUE: Dict[str, CogSpec] = {"])
    for spec in specs:
        const = _cog_const(spec)
        lines.append(f"    {spec['id']!r}: {const},")
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_cog(cog_id: str) -> CogSpec | None:",
            '    """A Cog, by `id` or `id:version`, or None."""',
            "    cog = COG_CATALOGUE.get(cog_id)",
            "    if cog is not None:",
            "        return cog",
            '    base, _, version = cog_id.rpartition(":")',
            '    return COG_CATALOGUE.get(base) if base and "." in version else None',
            "",
            "",
            "def list_cogs() -> list[CogSpec]:",
            '    """Every Cog of the catalogue, resolved."""',
            "    return list(COG_CATALOGUE.values())",
            "",
            "",
            "def cogs_using(frame_id: str) -> list[CogSpec]:",
            '    """The Cogs that work under a Frame, directly or through one that extends it."""',
            '    base, _, version = frame_id.rpartition(":")',
            '    wanted = base if base and "." in version else frame_id',
            "    return [cog for cog in COG_CATALOGUE.values() if wanted in cog.lineage]",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]], specs_dir: Path) -> str:
    """Generate TypeScript code from resolved Cog specifications."""
    root = specs_dir.resolve().parent
    code = generate_agents.generate_typescript_code(
        [("", spec) for spec in specs],
        str(root / "mcp-servers"),
        str(root / "skills"),
        str(root / "backend-tools"),
    )
    marker = "// ============================================================================\n// Agent Specs Registry"
    if marker not in code:
        raise SystemExit(
            "Error: the agent generator's registry changed; update generate_cogs.py"
        )
    head = code.split(marker, 1)[0]
    if "import type { Agentspec }" in head:
        head = head.replace(
            "import type { Agentspec }", "import type { Agentspec, CogSpec }", 1
        )
    elif "import type {\n  Agentspec," in head:
        head = head.replace(
            "import type {\n  Agentspec,", "import type {\n  Agentspec,\n  CogSpec,", 1
        )
    else:
        raise SystemExit(
            "Error: the agent generator's type import changed; update generate_cogs.py"
        )
    # The resolved agent specs are this module's own: a Cog's `spec` exposes them.
    head = head.replace("export const ", "const ").replace(
        "Generated from YAML specifications in specs/agents/",
        "Generated from YAML specifications in specs/cogs/",
    )
    described = (
        " * Cog Catalog.\n *\n * AI workers you can hold to account: a Cog extends an agent spec and is\n"
        " * equipped with Frames. Every Cog is resolved — its `spec` is a complete\n"
        " * agent spec, with its Frames' capability and context already in it.\n"
    )
    library = " * Agent Library.\n *\n * Predefined agent specifications that can be instantiated as Agent Runtimes.\n"
    if library not in head:
        raise SystemExit(
            "Error: the agent generator's header changed; update generate_cogs.py"
        )
    head = head.replace(library, described)
    # The agent generator writes for `src/specs/agents/agents.ts`; this file
    # is one directory up, beside the catalogues it imports.
    head = head.replace("from '../../types'", "from '../types'")
    head = re.sub(
        r"from '\.\./(mcpServers|skills|backendTools|frontendTools)'", r"from './\1'", head
    )

    lines = [
        head.rstrip("\n"),
        "",
        "// " + "=" * 76,
        "// Cog Catalog",
        "// " + "=" * 76,
        "",
    ]
    for spec in specs:
        fields = _cog_fields(spec)
        const = _cog_const(spec)
        body = json.dumps(fields, indent=2, ensure_ascii=False)
        body = (
            body.rstrip().rstrip("}").rstrip()
            + f',\n  "spec": {_agent_const(spec)}\n}}'
        )
        lines.extend([f"export const {const}: CogSpec = {body};", ""])
    lines.append("export const COG_CATALOGUE: Record<string, CogSpec> = {")
    for spec in specs:
        const = _cog_const(spec)
        lines.append(f"  {json.dumps(spec['id'])}: {const},")
    lines.extend(
        [
            "};",
            "",
            "function cogId(ref: string): string {",
            "  const at = ref.lastIndexOf(':');",
            "  return at > 0 && ref.slice(at + 1).includes('.') ? ref.slice(0, at) : ref;",
            "}",
            "",
            "/** A Cog, by `id` or `id:version`, or undefined. */",
            "export function getCog(ref: string): CogSpec | undefined {",
            "  // Own entries only: `constructor` and `toString` are not Cogs.",
            "  const id = cogId(ref);",
            "  return Object.prototype.hasOwnProperty.call(COG_CATALOGUE, id)",
            "    ? COG_CATALOGUE[id]",
            "    : undefined;",
            "}",
            "",
            "export function listCogs(): CogSpec[] {",
            "  return Object.values(COG_CATALOGUE);",
            "}",
            "",
            "/** The Cogs that work under a Frame, directly or through one that extends it. */",
            "export function cogsUsing(frameId: string): CogSpec[] {",
            "  const wanted = cogId(frameId);",
            "  return listCogs().filter(cog => cog.lineage.includes(wanted));",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML Cog specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing Cog YAML files",
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
    specs = load_cog_specs(args.specs_dir)
    if not specs:
        print(
            f"Warning: No Cog specifications found in {args.specs_dir}", file=sys.stderr
        )
        return
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(specs))
    print(f"Generated Python code: {args.python_output}")
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(specs, args.specs_dir))
    print(f"Generated TypeScript code: {args.typescript_output}")
    print(f"\n✓ Successfully generated code from {len(specs)} Cog specs")


if __name__ == "__main__":
    main()
