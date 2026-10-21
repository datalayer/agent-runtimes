#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from the YAML harness specifications.

One YAML per harness under ``agentspecs/harnesses`` (SH-01):
an agent program driven over the Agent Client Protocol, how it is launched,
what it needs, what it honours of an agent spec, and the terms it is served
under. ``register.yaml`` beside them is the register (SH-04): a harness
without an entry is refused here as it is in agentspecs.

Usage:
    python generate_harnesses.py \\
      --specs-dir agentspecs/agentspecs/harnesses \\
      --python-output agent_runtimes/specs/harnesses.py \\
      --typescript-output src/specs/harnesses.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

import yaml
from versioning import ensure_spec_version, version_suffix

MCP = ("lend", "own", "none")
THIRD_PARTIES = ("api_key_only", "permitted", "refused", "organizations_own")
SKILLS_FORMATS = ("skill-md", "none")
RESUMES = ("none", "load", "native")
FORK_HISTORIES = ("none", "replay", "rebuild")
COMPACTIONS = ("own", "none")
NATIVE_SESSIONS = ("meta", "none")
REGISTER = "register.yaml"


def load_register(specs_dir: Path) -> dict[str, dict[str, Any]]:
    """The register, by harness id."""
    register = yaml.safe_load((specs_dir / REGISTER).read_text()) or {}
    return {str(entry["harness"]): entry for entry in register.get("entries") or []}


def load_harness_specs(specs_dir: Path) -> list[dict[str, Any]]:
    """Every harness spec of a directory, each named for its id, registered, its enums known."""
    register = load_register(specs_dir)
    specs = []
    for yaml_file in sorted(specs_dir.glob("*.yaml")):
        if yaml_file.name == REGISTER:
            continue
        spec = yaml.safe_load(yaml_file.read_text()) or {}
        ensure_spec_version(spec)
        if spec["id"] != yaml_file.stem:
            raise ValueError(
                f"{yaml_file.name}: the file is named for {yaml_file.stem!r}, the spec says {spec['id']!r}"
            )
        entry = register.get(spec["id"])
        if entry is None:
            raise ValueError(
                f"{yaml_file.name}: the harness {spec['id']!r} has no entry in the register"
            )
        acp = spec.get("acp")
        if spec["id"] == "custom":
            if acp is not None:
                raise ValueError(f"{yaml_file.name}: custom names no command")
        elif not acp or not acp.get("command"):
            raise ValueError(f"{yaml_file.name}: an acp block with its command")
        if acp is not None and acp.get("mcp") not in MCP:
            raise ValueError(f"{yaml_file.name}: acp.mcp one of {MCP}")
        terms = spec.get("terms") or {}
        if terms.get("served_to_third_parties") not in THIRD_PARTIES:
            raise ValueError(
                f"{yaml_file.name}: terms.served_to_third_parties one of {THIRD_PARTIES}"
            )
        if terms.get("served_to_third_parties") != entry.get("served_to_third_parties"):
            raise ValueError(
                f"{yaml_file.name}: the register and the spec disagree on third parties"
            )
        skills = spec.get("skills") or {}
        if skills.get("format") not in SKILLS_FORMATS:
            raise ValueError(f"{yaml_file.name}: skills.format one of {SKILLS_FORMATS}")
        # The capabilities table (MH-20): required, its words known, agreeing with acp.
        caps = spec.get("capabilities")
        if not isinstance(caps, dict):
            raise ValueError(f"{yaml_file.name}: a harness declares its capabilities table")
        if caps.get("resume") not in RESUMES:
            raise ValueError(f"{yaml_file.name}: capabilities.resume one of {RESUMES}")
        if caps.get("fork_history") not in FORK_HISTORIES:
            raise ValueError(
                f"{yaml_file.name}: capabilities.fork_history one of {FORK_HISTORIES}"
            )
        if caps.get("compaction") not in COMPACTIONS:
            raise ValueError(f"{yaml_file.name}: capabilities.compaction one of {COMPACTIONS}")
        for flag in ("interrupt", "steering", "images"):
            if not isinstance(caps.get(flag), bool):
                raise ValueError(f"{yaml_file.name}: capabilities.{flag} is true or false")
        if acp is not None:
            if acp.get("native_session", "none") not in NATIVE_SESSIONS:
                raise ValueError(
                    f"{yaml_file.name}: acp.native_session one of {NATIVE_SESSIONS}"
                )
            if bool(acp.get("load_session")) != (caps["resume"] != "none"):
                raise ValueError(
                    f"{yaml_file.name}: capabilities.resume and acp.load_session disagree"
                )
            if list(caps.get("modes") or []) != list(acp.get("modes") or []):
                raise ValueError(
                    f"{yaml_file.name}: capabilities.modes and acp.modes disagree"
                )
        spec["_register"] = entry
        specs.append(spec)
    return specs


def _const(spec: dict[str, Any]) -> str:
    return (
        spec["id"].replace("-", "_").upper()
        + "_HARNESS"
        + version_suffix(spec["version"])
    )


def _s(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def _opt(value: Any) -> str:
    return _s(value) if value else "None"


def generate_python_code(specs: list[dict[str, Any]]) -> str:
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Harness Catalog.",
        "",
        "An agent program driven over the Agent Client Protocol (SH-01).",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "from typing import Dict, List, Optional",
        "",
        "from agent_runtimes.types import (",
        "    HarnessAcpSpec,",
        "    HarnessCapabilitiesSpec,",
        "    HarnessHonoursSpec,",
        "    HarnessRegisterEntry,",
        "    HarnessRequiresSpec,",
        "    HarnessSkillsSpec,",
        "    HarnessSpec,",
        "    HarnessTermsSpec,",
        ")",
    ]
    for spec in specs:
        acp = spec.get("acp")
        requires = spec.get("requires") or {}
        terms = spec.get("terms") or {}
        skills = spec.get("skills") or {}
        honours = spec.get("honours") or {}
        caps = spec["capabilities"]
        entry = spec["_register"]
        lines += [
            "",
            f"{_const(spec)} = HarnessSpec(",
            f"    id={_s(spec['id'])},",
            f"    version={_s(spec['version'])},",
            f"    name={_s(spec['name'])},",
            f"    description={_s(spec.get('description'))},",
            f"    enabled={bool(spec.get('enabled', True))},",
            f"    tags={json.dumps(list(spec.get('tags') or []))},",
            f"    docs={_s(spec.get('docs'))},",
        ]
        if acp is None:
            lines.append("    acp=None,")
        else:
            lines += [
                "    acp=HarnessAcpSpec(",
                f"        command={_s(acp['command'])},",
                f"        args={json.dumps(list(acp.get('args') or []))},",
                f"        protocol_version={int(acp.get('protocol_version', 1))},",
                f"        load_session={bool(acp.get('load_session', False))},",
                f"        mcp={_s(acp['mcp'])},",
                f"        modes={json.dumps(list(acp.get('modes') or []))},",
                f"        env={json.dumps(dict(acp.get('env') or {}))},",
                f"        native_session={_s(acp.get('native_session', 'none'))},",
                "    ),",
            ]
        lines += [
            "    requires=HarnessRequiresSpec(",
            f"        secrets={json.dumps(list(requires.get('secrets') or []))},",
            f"        binaries={json.dumps(list(requires.get('binaries') or []))},",
            "    ),",
            "    terms=HarnessTermsSpec(",
            f"        served_to_third_parties={_s(terms['served_to_third_parties'])},",
            f"        licence={_s(terms.get('licence'))},",
            f"        tier_restrictions={_opt(terms.get('tier_restrictions'))},",
            "    ),",
            "    skills=HarnessSkillsSpec(",
            f"        format={_s(skills['format'])},",
            f"        dir={_s(skills.get('dir'))},",
            "    ),",
            "    honours=HarnessHonoursSpec(",
            f"        model={bool(honours.get('model', False))},",
            f"        subagents={bool(honours.get('subagents', False))},",
            "    ),",
            "    capabilities=HarnessCapabilitiesSpec(",
            f"        resume={_s(caps['resume'])},",
            f"        fork_history={_s(caps['fork_history'])},",
            f"        interrupt={bool(caps['interrupt'])},",
            f"        steering={bool(caps['steering'])},",
            f"        images={bool(caps['images'])},",
            f"        compaction={_s(caps['compaction'])},",
            f"        modes={json.dumps(list(caps.get('modes') or []))},",
            "    ),",
            f"    instructions_file={_s(spec.get('instructions_file'))},",
            "    registered=HarnessRegisterEntry(",
            f"        adapter={_s(entry.get('adapter'))},",
            f"        version={_s(entry.get('version'))},",
            f"        licence_source={_s(entry.get('licence_source'))},",
            f"        terms_source={_s(entry.get('terms_source'))},",
            f"        credential={_s(entry.get('credential'))},",
            f"        binaries={_s(entry.get('binaries'))},",
            f"        note={_s(entry.get('note'))},",
            "    ),",
            ")",
        ]
    lines += [
        "",
        "",
        "HARNESS_CATALOGUE: Dict[str, HarnessSpec] = {",
        *[f"    {_s(spec['id'])}: {_const(spec)}," for spec in specs],
        "}",
        "",
        "",
        "def get_harness(harness_id: str) -> Optional[HarnessSpec]:",
        '    """A harness by id, or None."""',
        "    return HARNESS_CATALOGUE.get(harness_id)",
        "",
        "",
        "def list_harnesses() -> List[HarnessSpec]:",
        '    """Every harness of the catalogue."""',
        "    return list(HARNESS_CATALOGUE.values())",
        "",
    ]
    return "\n".join(lines)


def _t(value: Any) -> str:
    return json.dumps(" ".join(str(value or "").split()), ensure_ascii=False)


def load_listed(specs_dir: Path) -> list[dict[str, Any]]:
    """The register's listed tier (SH-57): known to speak ACP, not drilled, offered by nothing."""
    register = yaml.safe_load((specs_dir / REGISTER).read_text()) or {}
    return sorted(
        (
            entry
            for entry in register.get("entries") or []
            if entry.get("tier") == "listed"
        ),
        key=lambda entry: str(entry["harness"]),
    )


def generate_typescript_code(
    specs: list[dict[str, Any]], listed: list[dict[str, Any]] = ()
) -> str:
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Harness Catalog.",
        " *",
        " * An agent program driven over the Agent Client Protocol (SH-01).",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "import type { HarnessSpec, ListedHarness } from '../types/agentspecs';",
    ]
    for spec in specs:
        acp = spec.get("acp")
        requires = spec.get("requires") or {}
        terms = spec.get("terms") or {}
        skills = spec.get("skills") or {}
        honours = spec.get("honours") or {}
        caps = spec["capabilities"]
        entry = spec["_register"]
        lines += [
            "",
            f"export const {_const(spec)}: HarnessSpec = {{",
            f"  id: {_t(spec['id'])},",
            f"  version: {_t(spec['version'])},",
            f"  name: {_t(spec['name'])},",
            f"  description: {_t(spec.get('description'))},",
            f"  enabled: {json.dumps(bool(spec.get('enabled', True)))},",
            f"  tags: {json.dumps(list(spec.get('tags') or []))},",
            f"  docs: {_t(spec.get('docs'))},",
        ]
        if acp is not None:
            lines += [
                "  acp: {",
                f"    command: {_t(acp['command'])},",
                f"    args: {json.dumps(list(acp.get('args') or []))},",
                f"    protocolVersion: {int(acp.get('protocol_version', 1))},",
                f"    loadSession: {json.dumps(bool(acp.get('load_session', False)))},",
                f"    mcp: {_t(acp['mcp'])},",
                f"    modes: {json.dumps(list(acp.get('modes') or []))},",
                f"    env: {json.dumps(dict(acp.get('env') or {}))},",
                f"    nativeSession: {_t(acp.get('native_session', 'none'))},",
                "  },",
            ]
        lines += [
            "  requires: {",
            f"    secrets: {json.dumps(list(requires.get('secrets') or []))},",
            f"    binaries: {json.dumps(list(requires.get('binaries') or []))},",
            "  },",
            "  terms: {",
            f"    servedToThirdParties: {_t(terms['served_to_third_parties'])},",
            f"    licence: {_t(terms.get('licence'))},",
            *(
                [f"    tierRestrictions: {_t(terms.get('tier_restrictions'))},"]
                if terms.get("tier_restrictions")
                else []
            ),
            "  },",
            "  skills: {",
            f"    format: {_t(skills['format'])},",
            f"    dir: {_t(skills.get('dir'))},",
            "  },",
            "  honours: {",
            f"    model: {json.dumps(bool(honours.get('model', False)))},",
            f"    subagents: {json.dumps(bool(honours.get('subagents', False)))},",
            "  },",
            "  capabilities: {",
            f"    resume: {_t(caps['resume'])},",
            f"    forkHistory: {_t(caps['fork_history'])},",
            f"    interrupt: {json.dumps(bool(caps['interrupt']))},",
            f"    steering: {json.dumps(bool(caps['steering']))},",
            f"    images: {json.dumps(bool(caps['images']))},",
            f"    compaction: {_t(caps['compaction'])},",
            f"    modes: {json.dumps(list(caps.get('modes') or []))},",
            "  },",
            f"  instructionsFile: {_t(spec.get('instructions_file'))},",
            "  registered: {",
            f"    adapter: {_t(entry.get('adapter'))},",
            f"    version: {_t(entry.get('version'))},",
            f"    licenceSource: {_t(entry.get('licence_source'))},",
            f"    termsSource: {_t(entry.get('terms_source'))},",
            f"    credential: {_t(entry.get('credential'))},",
            f"    binaries: {_t(entry.get('binaries'))},",
            f"    note: {_t(entry.get('note'))},",
            "  },",
            "};",
        ]
    lines += [
        "",
        "export const HARNESS_CATALOGUE: Record<string, HarnessSpec> = {",
        *[f"  {_t(spec['id'])}: {_const(spec)}," for spec in specs],
        "};",
        "",
        "/** A harness by id. */",
        "export function getHarness(harnessId: string): HarnessSpec | undefined {",
        "  return HARNESS_CATALOGUE[harnessId];",
        "}",
        "",
        "/** Every harness of the catalogue. */",
        "export function listHarnesses(): HarnessSpec[] {",
        "  return Object.values(HARNESS_CATALOGUE);",
        "}",
        "",
        "/**",
        " * The register's listed tier (SH-57): agents known to speak ACP, registered",
        " * with their documented command and their terms, not drilled — offered by",
        " * nothing until moved to the catalogue.",
        " */",
        "export const LISTED_HARNESSES: ListedHarness[] = [",
        *[
            "  {"
            + f" id: {_t(entry['harness'])}, name: {_t(entry.get('name'))}, docs: {_t(entry.get('docs'))},"
            + f" adapter: {_t(entry.get('adapter'))}, version: {_t(entry.get('version'))},"
            + f" command: {_t(entry['command']) if entry.get('command') else 'null'},"
            + f" licence: {_t(entry.get('licence'))}, licenceSource: {_t(entry.get('licence_source'))},"
            + f" termsSource: {_t(entry.get('terms_source'))}, credential: {_t(entry.get('credential'))},"
            + f" servedToThirdParties: {_t(entry.get('served_to_third_parties'))}, note: {_t(entry.get('note'))} }},"
            for entry in listed
        ],
        "];",
        "",
        "/** The sentence a listed harness is refused in (agentspecs' LISTED_NOT_DRILLED). */",
        "export const LISTED_NOT_DRILLED = 'listed, not drilled yet';",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()
    specs = load_harness_specs(args.specs_dir)
    args.python_output.write_text(generate_python_code(specs))
    args.typescript_output.write_text(
        generate_typescript_code(specs, load_listed(args.specs_dir))
    )
    print(
        f"Generated {len(specs)} harnesses: {args.python_output}, {args.typescript_output}"
    )


if __name__ == "__main__":
    main()
