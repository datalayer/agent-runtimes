#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from YAML scene specifications.

A scene (agentspecs >= 0.0.61, LOOP A-11) stages a team: the team says who
is on stage, the scene says what happens there — the setting, the script,
the stage directions, the audience, the rehearsal and where it plays. One
YAML per scene under ``agentspecs/scenes``.

Each scene is validated here, by ``agentspecs`` itself (``scene_problems``),
and arrives with its cast resolved — every member of the team, its persona
filled from its application (``cast_of``) — its ``entry`` said, what each
beat ``shows`` said, and what it names that is not enabled (``setup``).
Empty optional lists are dropped, as ``generate_apps.py`` drops them.

The scene spec's JSON Schema is written beside the TypeScript catalogue as
``sceneSchema.ts`` (``agentspecs.scenes.json_schema``), the way
``generate_apps.py`` writes ``appspecSchema.ts``: what an editor of the text
completes and explains is what the spec accepts (LOOP S-01, A-03).

Usage:
    python generate_scenes.py \\
      --specs-dir agentspecs/agentspecs/scenes \\
      --python-output agent_runtimes/specs/scenes.py \\
      --typescript-output src/specs/scenes.ts
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from agentspecs_clone import import_from_clone
from versioning import ensure_spec_version, version_suffix

#: The keys of a scene spec, as TypeScript spells them.
CAMEL = {
    "runs_in": "runsIn",
    "talks_to": "talksTo",
    "opens_first": "opensFirst",
    "rests_after": "restsAfter",
    "ceiling_per_ask": "ceilingPerAsk",
    "asks_a_day": "asksADay",
    "must_say": "mustSay",
    "must_not_say": "mustNotSay",
}

#: The lists written only when they hold something: TypeScript reads them as optional.
OPTIONAL_LISTS = (
    "talks_to",
    "frames",
    "contents",
    "branch",
    "withhold",
    "must_say",
    "must_not_say",
)


def _flat(text: Any) -> str:
    """A text on one line."""
    return " ".join(str(text or "").split())


def _trim(value: Any, key: str = "") -> Any:
    """A value without the empty optional lists and the keys that hold nothing."""
    if isinstance(value, dict):
        trimmed = {}
        for name, item in value.items():
            if item is None or (name in OPTIONAL_LISTS and item == []):
                continue
            trimmed[name] = _trim(item, name)
        return trimmed
    if isinstance(value, list):
        return [_trim(item) for item in value]
    return value


def load_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every scene, validated, as plain data: its cast resolved, its entry said."""
    scenes_module = import_from_clone(specs_dir, "scenes")
    scenes = scenes_module.load_scenes(specs_dir)
    specs: list[dict[str, Any]] = []
    for identity in sorted(scenes):
        scene = scenes[identity]
        spec = scene.model_dump(mode="json", by_alias=True)
        spec["entry"] = scene.entry_of()
        spec["cast"] = [
            member.model_dump(mode="json", by_alias=True) for member in scene.cast_of()
        ]
        for beat, data in zip(scene.script, spec["script"]):
            data["shows"] = [kind.value for kind in beat.shown]
        spec["setup"] = scenes_module.scene_setup(scene)
        # The last rehearsal played on Datalayer (agentspecs >= 0.0.67): what
        # *Live* is read from; none when it was never played.
        read_played = getattr(scenes_module, "scene_played", None)
        played = read_played(identity, specs_dir) if read_played is not None else None
        spec["played"] = played.model_dump(mode="json") if played is not None else None
        for key in ("description",):
            spec[key] = _flat(spec.get(key))
        spec["setting"]["assumes"] = _flat(spec["setting"].get("assumes"))
        for member in spec["cast"]:
            member["brief"] = _flat(member.get("brief"))
        for beat in spec["script"]:
            beat["expect"] = _flat(beat.get("expect"))
            for branch in beat.get("branch") or []:
                branch["expect"] = _flat(branch.get("expect"))
        ensure_spec_version(spec)
        specs.append(_trim(spec))
    return specs


def _const_name(spec: dict[str, Any]) -> str:
    """`sales-and-accounting` 0.0.1 → `SALES_AND_ACCOUNTING_SCENE_0_0_1`."""
    base = spec["id"].upper().replace("-", "_").replace(".", "_")
    return f"{base}_SCENE" + version_suffix(spec["version"])


def _typescript_value(value: Any) -> Any:
    """A scene as the TypeScript interfaces read it."""
    if isinstance(value, dict):
        return {
            CAMEL.get(key, key): _typescript_value(item) for key, item in value.items()
        }
    if isinstance(value, list):
        return [_typescript_value(item) for item in value]
    return value


HEADER = [
    "This file is AUTO-GENERATED from YAML specifications.",
    "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
]

ABOUT = [
    "Scene Catalog.",
    "",
    "A team, staged: the setting, the script, the stage directions, the",
    "audience, the rehearsal and where it plays. The cast is resolved.",
]


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    """Generate the Python scene catalogue."""
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        *ABOUT,
        "",
        *HEADER,
        '"""',
        "",
        "from typing import Dict",
        "",
        "from agent_runtimes.types import SceneSpec",
        "",
        "# " + "=" * 76,
        "# Scene Definitions",
        "# " + "=" * 76,
        "",
    ]
    for spec in specs:
        lines.extend(
            [
                f"{_const_name(spec)} = SceneSpec.model_validate(",
                f"    {spec!r}",
                ")",
                "",
            ]
        )
    lines.extend(
        [
            "",
            "# " + "=" * 76,
            "# Scene Catalog",
            "# " + "=" * 76,
            "",
            "SCENE_CATALOGUE: Dict[str, SceneSpec] = {",
        ]
    )
    for spec in specs:
        lines.append(f"    {spec['id']!r}: {_const_name(spec)},")
    lines.extend(
        [
            "}",
            "",
            "",
            "def get_scene_spec(scene_id: str) -> SceneSpec | None:",
            '    """A scene, by `id` or `id:version`, or None."""',
            "    found = SCENE_CATALOGUE.get(scene_id)",
            "    if found is not None:",
            "        return found",
            '    base, _, version = scene_id.rpartition(":")',
            '    return SCENE_CATALOGUE.get(base) if base and "." in version else None',
            "",
            "",
            "def list_scene_specs(tag: str | None = None) -> list[SceneSpec]:",
            '    """Every scene of the catalogue, or those carrying a tag."""',
            "    return [",
            "        scene for scene in SCENE_CATALOGUE.values() if tag is None or tag in scene.tags",
            "    ]",
            "",
            "",
            "def scenes_staging(team_id: str) -> list[SceneSpec]:",
            '    """Every scene that stages a team, by its id with or without a version."""',
            '    wanted = team_id.split(":")[0]',
            "    return [",
            "        scene",
            "        for scene in SCENE_CATALOGUE.values()",
            '        if scene.team and scene.team.split(":")[0] == wanted',
            "    ]",
            "",
        ]
    )
    return "\n".join(lines)


def generate_typescript_code(specs: list[dict[str, Any]]) -> str:
    """Generate the TypeScript scene catalogue."""
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        *[f" * {line}".rstrip() for line in ABOUT],
        " *",
        *[f" * {line}" for line in HEADER],
        " */",
        "",
        "import type { SceneSpec } from '../types/scenes';",
        "",
    ]
    for spec in specs:
        body = json.dumps(_typescript_value(spec), indent=2, ensure_ascii=False)
        lines.extend([f"export const {_const_name(spec)}: SceneSpec = {body};", ""])
    lines.append("export const SCENE_CATALOGUE: Record<string, SceneSpec> = {")
    for spec in specs:
        lines.append(f"  {json.dumps(spec['id'])}: {_const_name(spec)},")
    lines.extend(
        [
            "};",
            "",
            "/** A scene, by `id` or `id:version`, or undefined. */",
            "export function getSceneSpec(ref: string): SceneSpec | undefined {",
            "  // Own entries only: `constructor` and `toString` are not scenes.",
            "  const own = (id: string): SceneSpec | undefined =>",
            "    Object.prototype.hasOwnProperty.call(SCENE_CATALOGUE, id)",
            "      ? SCENE_CATALOGUE[id]",
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
            "/** Every scene of the catalogue, in the catalogue's order, or those carrying a tag. */",
            "export function listSceneSpecs(tag?: string): SceneSpec[] {",
            "  return Object.values(SCENE_CATALOGUE).filter(",
            "    scene => tag === undefined || scene.tags.includes(tag),",
            "  );",
            "}",
            "",
            "/** Every scene that stages a team, by its id with or without a version. */",
            "export function scenesStaging(teamId: string): SceneSpec[] {",
            "  const wanted = teamId.split(':')[0];",
            "  return Object.values(SCENE_CATALOGUE).filter(",
            "    scene => scene.team !== '' && scene.team.split(':')[0] === wanted,",
            "  );",
            "}",
            "",
        ]
    )
    return "\n".join(lines)


def generate_schema_typescript_code(specs_dir: Path) -> str:
    """The scene spec's JSON Schema, for the editor of its text (LOOP S-01, A-03).

    Taken from the agentspecs the catalogue is generated from, so that what
    the editor completes and explains is what the spec accepts. The
    ``JsonSchema`` type is ``appspecSchema.ts``'s.
    """
    scenes_module = import_from_clone(specs_dir, "scenes")
    schema = json.dumps(
        scenes_module.json_schema(), indent=2, ensure_ascii=False, sort_keys=False
    )
    return "\n".join(
        [
            "/*",
            " * Copyright (c) 2025-2026 Datalayer, Inc.",
            " * Distributed under the terms of the Modified BSD License.",
            " */",
            "",
            "/**",
            " * The scene spec's JSON Schema (`loop.scene/v1`), generated from agentspecs by",
            " * `scripts/codegen/generate_scenes.py`. Do not edit.",
            " *",
            " * @module specs/sceneSchema",
            " */",
            "",
            "import type { JsonSchema } from './appspecSchema';",
            "",
            f"export const SCENE_SCHEMA: JsonSchema = {schema};",
            "",
        ]
    )


def main() -> None:
    """Generate the scene catalogue, and the scene spec's JSON Schema."""
    parser = argparse.ArgumentParser(
        description="Generate Python and TypeScript code from YAML scene specifications"
    )
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()

    if not args.specs_dir.exists():
        print(f"Error: Specs directory not found: {args.specs_dir}", file=sys.stderr)
        sys.exit(1)
    specs = load_specs(args.specs_dir)
    for path, text in (
        (args.python_output, generate_python_code(specs)),
        (args.typescript_output, generate_typescript_code(specs)),
        (
            args.typescript_output.with_name("sceneSchema.ts"),
            generate_schema_typescript_code(args.specs_dir),
        ),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        print(f"Generated: {path}")
    print(f"\n✓ Successfully generated code from {len(specs)} scene specs")


if __name__ == "__main__":
    main()
