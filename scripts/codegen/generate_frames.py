#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML Frame specifications.

A Frame is the context work happens in, written down — rules, terminology,
goals, style, norms, process — owned, scoped, versioned and inherited, with
the Guards an output has to pass. One YAML per Frame under
``agentspecs/frames``; a Cog names the Frames it works under.

A Frame inherits with ``extends``. It is resolved here, by ``agentspecs``
itself, so the generated catalogue is flat: every Frame carries what it
inherits, and ``lineage`` says from which Frames.

Usage:
    python generate_frames.py \\
      --specs-dir agentspecs/agentspecs/frames \\
      --python-output agent_runtimes/specs/frames.py \\
      --typescript-output src/specs/frames.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from agentspecs_clone import import_from_clone
from versioning import ensure_spec_version, version_suffix

#: The fields of a generated Frame, in the order they are written.
FIELDS = (
    "id",
    "version",
    "name",
    "description",
    "scope",
    "owner",
    "extends",
    "lineage",
    "tags",
    "enabled",
    "icon",
    "emoji",
    "rules",
    "terminology",
    "goals",
    "style",
    "norms",
    "process",
    "architecture",
    "prompts",
    "skills",
    "tools",
    "mcp_servers",
    "guards",
)

#: Python field → TypeScript property, where they differ.
CAMEL = {"mcp_servers": "mcpServers"}


def load_frame_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every Frame of a directory, resolved and validated, as plain data."""
    frames = import_from_clone(specs_dir, "frames")
    raw = frames.load_raw_frames(specs_dir)
    specs = []
    for identity in sorted(raw):
        ensure_spec_version(raw[identity])
        resolved = frames.resolve_frame(raw[identity], raw)
        lineage = list(resolved["lineage"])
        spec = frames.FrameSpec(
            **{key: value for key, value in resolved.items() if key != "lineage"}
        ).model_dump(mode="json")
        spec["description"] = " ".join(str(spec["description"]).split())
        spec["extends"] = raw[identity].get("extends") or None
        # Tags describe the Frame itself; its parent's are the parent's.
        spec["tags"] = list(raw[identity].get("tags") or [])
        spec["lineage"] = lineage
        specs.append({field: spec.get(field) for field in FIELDS})
    return specs


def _const_name(spec: dict[str, Any]) -> str:
    base = spec["id"].replace("-", "_").replace(".", "_").upper()
    return f"{base}_FRAME{version_suffix(spec['version'])}"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate Python code from Frame specifications."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Frame Catalog.",
        "",
        "The context work happens in, written down: owned, scoped and inherited.",
        "Every Frame is resolved — what it inherits is already in it.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import FrameGuardSpec, FramePromptSpec, FrameSpec",
        "",
        "",
        "# " + "=" * 76,
        "# Frame Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        lines.append(f"{_const_name(spec)} = FrameSpec(")
        for field in FIELDS:
            value = spec[field]
            if field == "guards":
                rendered = (
                    "["
                    + ", ".join(f"FrameGuardSpec(**{guard!r})" for guard in value)
                    + "]"
                )
            elif field == "prompts":
                rendered = (
                    "["
                    + ", ".join(f"FramePromptSpec(**{prompt!r})" for prompt in value)
                    + "]"
                )
            else:
                rendered = repr(value)
            lines.append(f"    {field}={rendered},")
        lines.extend([")", ""])
    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# Frame Catalog",
            "# " + "=" * 76,
            "",
            "FRAME_CATALOGUE: Dict[str, FrameSpec] = {",
        ]
    )
    for spec in specs:
        lines.append(f"    {spec['id']!r}: {_const_name(spec)},")
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_frame(frame_id: str) -> FrameSpec | None:",
            '    """The Frame a Cog names, by `id` or `id:version`, or None."""',
            "    frame = FRAME_CATALOGUE.get(frame_id)",
            "    if frame is not None:",
            "        return frame",
            '    base, _, version = frame_id.rpartition(":")',
            '    return FRAME_CATALOGUE.get(base) if base and "." in version else None',
            "",
            "",
            "def list_frames() -> list[FrameSpec]:",
            '    """Every Frame of the catalogue, resolved."""',
            "    return list(FRAME_CATALOGUE.values())",
            "",
        ]
    )
    return "\n".join(lines)


def _ts_object(spec: dict[str, Any]) -> str:
    camel = {
        CAMEL.get(field, field): spec[field]
        for field in FIELDS
        if spec[field] is not None
    }
    return json.dumps(camel, indent=2, ensure_ascii=False)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate TypeScript code from Frame specifications."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Frame Catalog.",
        " *",
        " * The context work happens in, written down: owned, scoped and inherited.",
        " * Every Frame is resolved — what it inherits is already in it.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { FrameSpec } from '../types/agentspecs';",
        "",
    ]
    for spec in specs:
        lines.extend(
            [f"export const {_const_name(spec)}: FrameSpec = {_ts_object(spec)};", ""]
        )
    lines.append("export const FRAME_CATALOGUE: Record<string, FrameSpec> = {")
    for spec in specs:
        lines.append(f"  {json.dumps(spec['id'])}: {_const_name(spec)},")
    lines.extend(
        [
            "};",
            "",
            "/** The Frame a Cog names, by `id` or `id:version`, or undefined. */",
            "export function getFrame(frameId: string): FrameSpec | undefined {",
            "  // Own entries only: `constructor` and `toString` are not Frames.",
            "  const own = (id: string): FrameSpec | undefined =>",
            "    Object.prototype.hasOwnProperty.call(FRAME_CATALOGUE, id)",
            "      ? FRAME_CATALOGUE[id]",
            "      : undefined;",
            "  const at = frameId.lastIndexOf(':');",
            "  return (",
            "    own(frameId) ??",
            "    (at > 0 && frameId.slice(at + 1).includes('.')",
            "      ? own(frameId.slice(0, at))",
            "      : undefined)",
            "  );",
            "}",
            "",
            "export function listFrames(): FrameSpec[] {",
            "  return Object.values(FRAME_CATALOGUE);",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML Frame specifications"
    )
    parser.add_argument(
        "--specs-dir",
        type=Path,
        required=True,
        help="Directory containing Frame YAML files",
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
    specs = load_frame_specs(args.specs_dir)
    if not specs:
        print(
            f"Warning: No Frame specifications found in {args.specs_dir}",
            file=sys.stderr,
        )
        return
    args.python_output.parent.mkdir(parents=True, exist_ok=True)
    args.python_output.write_text(generate_python_code(specs))
    print(f"Generated Python code: {args.python_output}")
    args.typescript_output.parent.mkdir(parents=True, exist_ok=True)
    args.typescript_output.write_text(generate_typescript_code(specs))
    print(f"Generated TypeScript code: {args.typescript_output}")
    print(f"\n✓ Successfully generated code from {len(specs)} Frame specs")


if __name__ == "__main__":
    main()
