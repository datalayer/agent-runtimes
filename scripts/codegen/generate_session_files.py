#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate Python and TypeScript code from the session file specification.

One spec under ``agentspecs/sessions`` (MH-12): ``datalayer-session-1.yaml``
says the ``datalayer-session/1`` JSONL format — its caps, the states, the
entry kinds a file may carry, the redaction rules by name and the sentences
a reader refuses a file in — and ``session-file.schema.json`` beside it is
the JSON Schema of a line. Both are generated here so the runtime, ``loop``,
the chat and agent-teams refuse the same things in the same words.

Usage:
    python generate_session_files.py \\
      --specs-dir agentspecs/agentspecs/sessions \\
      --python-output agent_runtimes/specs/session_files.py \\
      --typescript-output src/specs/sessionFiles.ts
"""

import argparse
import json
from pathlib import Path
from typing import Any

import yaml

SPEC = "datalayer-session-1.yaml"
SCHEMA = "session-file.schema.json"
STATES = ("open", "paused", "ended")


def load_spec(specs_dir: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    """The format spec and the schema of a line, each checked for what the generator needs."""
    spec = yaml.safe_load((specs_dir / SPEC).read_text()) or {}
    schema = json.loads((specs_dir / SCHEMA).read_text())
    if spec.get("format") != "datalayer-session/1":
        raise ValueError(f"{SPEC}: the format is datalayer-session/1, not {spec.get('format')!r}")
    if tuple(spec.get("states") or ()) != STATES:
        raise ValueError(f"{SPEC}: the states are {STATES}")
    for key in ("entry_kinds", "redaction_rules", "refusals", "caps"):
        if not spec.get(key):
            raise ValueError(f"{SPEC}: says its {key}")
    caps = spec["caps"]
    if int(caps.get("max_bytes") or 0) <= 0 or int(caps.get("max_entries") or 0) <= 0:
        raise ValueError(f"{SPEC}: caps.max_bytes and caps.max_entries are positive")
    if "oneOf" not in schema:
        raise ValueError(f"{SCHEMA}: one of the three lines")
    return spec, schema


def _s(value: Any) -> str:
    return json.dumps(str(value or ""), ensure_ascii=False)


def generate_python_code(spec: dict[str, Any], schema: dict[str, Any]) -> str:
    rules = spec["redaction_rules"]
    lines = [
        "# Copyright (c) 2025-2026 Datalayer, Inc.",
        "# Distributed under the terms of the Modified BSD License.",
        '"""',
        "Session file format (MH-12).",
        "",
        "The datalayer-session/1 JSONL file: its caps, the states, the entry kinds,",
        "the redaction rules and the refusal sentences, as agentspecs says them.",
        "",
        "This file is AUTO-GENERATED from YAML specifications.",
        "DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        '"""',
        "",
        "import json",
        "from typing import Any, Dict, Tuple",
        "",
        "#: The format: what a file's first line says.",
        f"SESSION_FILE_FORMAT = {_s(spec['format'])}",
        "",
        f"SESSION_FILE_MEDIA_TYPE = {_s(spec['media_type'])}",
        f"SESSION_FILE_EXTENSION = {_s(spec['extension'])}",
        "",
        "#: A file over either is refused with its counts.",
        f"SESSION_FILE_MAX_BYTES = {int(spec['caps']['max_bytes'])}",
        f"SESSION_FILE_MAX_ENTRIES = {int(spec['caps']['max_entries'])}",
        "",
        "#: A session's state, as the record says it.",
        "SESSION_STATES: Tuple[str, ...] = ("
        + "".join(f"{_s(state)}, " for state in spec["states"])
        + ")",
        "",
        "#: The kinds an entry line may carry: the record's, and the session's audit rows.",
        "SESSION_ENTRY_KINDS: Tuple[str, ...] = (",
        *[f"    {_s(kind)}," for kind in spec["entry_kinds"]],
        ")",
        "",
        "#: The redaction rules applied at export, by id, each with what it does.",
        "SESSION_REDACTION_RULES: Dict[str, str] = {",
        *[f"    {_s(rule['id'])}: {_s(rule['description'])}," for rule in rules],
        "}",
        "",
        "#: Said, word for word, by whoever refuses a file; `{…}` are filled in.",
        "SESSION_FILE_REFUSALS: Dict[str, str] = {",
        *[f"    {_s(name)}: {_s(sentence)}," for name, sentence in spec["refusals"].items()],
        "}",
        "",
        "",
        "def session_file_refusal(name: str, **facts: Any) -> str:",
        '    """The spec\'s sentence for a refusal, its facts filled in."""',
        "    return SESSION_FILE_REFUSALS[name].format(**facts)",
        "",
        "",
        "#: The JSON Schema of one line of the file: the session, the team session or an entry.",
        "SESSION_FILE_SCHEMA: Dict[str, Any] = json.loads(",
        "    "
        + json.dumps(json.dumps(schema, sort_keys=True, ensure_ascii=False), ensure_ascii=False),
        ")",
        "",
    ]
    return "\n".join(lines)


def generate_typescript_code(spec: dict[str, Any], schema: dict[str, Any]) -> str:
    rules = spec["redaction_rules"]
    kinds = spec["entry_kinds"]
    lines = [
        "/*",
        " * Copyright (c) 2025-2026 Datalayer, Inc.",
        " * Distributed under the terms of the Modified BSD License.",
        " */",
        "",
        "/**",
        " * Session file format (MH-12).",
        " *",
        " * The datalayer-session/1 JSONL file: its caps, the states, the entry kinds,",
        " * the redaction rules and the refusal sentences, as agentspecs says them.",
        " *",
        " * This file is AUTO-GENERATED from YAML specifications.",
        " * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.",
        " */",
        "",
        "/** The format: what a file's first line says. */",
        f"export const SESSION_FILE_FORMAT = {_s(spec['format'])};",
        f"export const SESSION_FILE_MEDIA_TYPE = {_s(spec['media_type'])};",
        f"export const SESSION_FILE_EXTENSION = {_s(spec['extension'])};",
        "",
        "/** A file over either is refused with its counts. */",
        f"export const SESSION_FILE_MAX_BYTES = {int(spec['caps']['max_bytes'])};",
        f"export const SESSION_FILE_MAX_ENTRIES = {int(spec['caps']['max_entries'])};",
        "",
        "/** A session's state, as the record says it. */",
        f"export const SESSION_STATES = {json.dumps(list(spec['states']))} as const;",
        "export type SessionState = (typeof SESSION_STATES)[number];",
        "",
        "/** The kinds an entry line may carry: the record's, and the session's audit rows. */",
        "export const SESSION_ENTRY_KINDS = [",
        *[f"  {_s(kind)}," for kind in kinds],
        "] as const;",
        "export type SessionEntryKind = (typeof SESSION_ENTRY_KINDS)[number];",
        "",
        "/** The redaction rules applied at export, by id, each with what it does. */",
        "export const SESSION_REDACTION_RULES: Record<string, string> = {",
        *[f"  {_s(rule['id'])}: {_s(rule['description'])}," for rule in rules],
        "};",
        "",
        "/** Said, word for word, by whoever refuses a file; `{…}` are filled in. */",
        "export const SESSION_FILE_REFUSALS: Record<string, string> = {",
        *[f"  {_s(name)}: {_s(sentence)}," for name, sentence in spec["refusals"].items()],
        "};",
        "",
        "/** The spec's sentence for a refusal, its facts filled in. */",
        "export function sessionFileRefusal(",
        "  name: string,",
        "  facts: Record<string, string | number> = {},",
        "): string {",
        "  return SESSION_FILE_REFUSALS[name].replace(",
        "    /\\{(\\w+)(?:!r)?\\}/g,",
        "    (whole, key) =>",
        "      key in facts",
        "        ? whole.endsWith('!r}')",
        "          ? JSON.stringify(String(facts[key])).replace(/^\"|\"$/g, \"'\")",
        "          : String(facts[key])",
        "        : whole,",
        "  );",
        "}",
        "",
        "/** Where a session came from. */",
        "export interface SessionLineage {",
        "  forkedFrom: { uid: string; atTurn: number } | null;",
        "  importedFrom: {",
        "    digest: string;",
        "    exportedAt: string;",
        "    exportedBy: string;",
        "  } | null;",
        "}",
        "",
        "/** The first line of a session file: the session. */",
        "export interface SessionLine {",
        "  record_type: 'session';",
        "  format: typeof SESSION_FILE_FORMAT;",
        "  uid: string;",
        "  app: { id: string; version: number };",
        "  agent: string;",
        "  harness: string | null;",
        "  owner: { uid: string };",
        "  state: SessionState;",
        "  turns: number;",
        "  title: string;",
        "  archived: boolean;",
        "  lineage: {",
        "    forked_from: { uid: string; at_turn: number } | null;",
        "    imported_from: {",
        "      digest: string;",
        "      exported_at: string;",
        "      exported_by: string;",
        "    } | null;",
        "  };",
        "  kinds: string[];",
        "  entries: number;",
        "  exported_at: string;",
        "  exported_by: { uid: string };",
        "  redactions: number;",
        "}",
        "",
        "/** One entry of the record, as the record holds it, redacted. */",
        "export interface SessionEntryLine {",
        "  record_type: 'entry';",
        "  kind: SessionEntryKind;",
        "  at: string;",
        "  summary?: string;",
        "  payload?: Record<string, unknown>;",
        "}",
        "",
        "/** The first line of a team session's file: the run; each seat's session follows. */",
        "export interface TeamSessionLine {",
        "  record_type: 'team_session';",
        "  format: typeof SESSION_FILE_FORMAT;",
        "  execution_id: string;",
        "  team: { id: string; version: string };",
        "  owner: { uid: string };",
        "  state: SessionState;",
        "  seats: {",
        "    id: string;",
        "    session_uid: string;",
        "    agent: string;",
        "    harness: string | null;",
        "  }[];",
        "  lineage: {",
        "    forked_from: { execution_id: string } | null;",
        "    imported_from: {",
        "      digest: string;",
        "      exported_at: string;",
        "      exported_by: string;",
        "    } | null;",
        "  };",
        "  exported_at: string;",
        "  exported_by: { uid: string };",
        "  redactions: number;",
        "}",
        "",
        "export type SessionFileLine = SessionLine | SessionEntryLine | TeamSessionLine;",
        "",
        "/** The JSON Schema of one line of the file. */",
        "export const SESSION_FILE_SCHEMA: Record<string, unknown> = "
        + json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False)
        + ";",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--specs-dir", type=Path, required=True)
    parser.add_argument("--python-output", type=Path, required=True)
    parser.add_argument("--typescript-output", type=Path, required=True)
    args = parser.parse_args()
    spec, schema = load_spec(args.specs_dir)
    args.python_output.write_text(generate_python_code(spec, schema))
    args.typescript_output.write_text(generate_typescript_code(spec, schema))
    print(
        f"Generated the session file format {spec['format']}: "
        f"{args.python_output}, {args.typescript_output}"
    )


if __name__ == "__main__":
    main()
