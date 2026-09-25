#!/usr/bin/env python3
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Generate the TypeScript types of the Environment specification from its JSON Schema.

The pydantic models of ``code_sandboxes.environments`` are the specification
(PLAN_ENV.md, D-14). ``code-sandboxes`` exports them as
``schemas/environment-v1alpha1.json``; this writes what that schema says, in
TypeScript, to ``src/models/environments.generated.ts``, as ``core`` generates
its orchestration and MCP types.

The schema is read from the first of:

- ``DATALAYER_ENVIRONMENT_SCHEMA``, the path of a copy;
- the ``code-sandboxes`` checkout beside this one;
- the installed ``code_sandboxes`` package, which exports the same text.

The generated file carries the sha256 of the schema text it came from, so
``--check`` fails on any change to the schema: a new pattern or bound, which
changes no TypeScript type, as much as a new field. ``--check`` exits non-zero
when the checked-in file is not what the schema gives.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/models/environments.generated.ts"
SCHEMA_VARIABLE = "DATALAYER_ENVIRONMENT_SCHEMA"
SIBLING_SCHEMA = ROOT.parent / "code-sandboxes/schemas/environment-v1alpha1.json"

#: The licence header every source file here carries. `fix-license-header`
#: would add one to a file without it, and `--check` would then disagree with
#: the formatter forever.
LICENCE = (
    "/*\n"
    " * Copyright (c) 2025-2026 Datalayer, Inc.\n"
    " * Distributed under the terms of the Modified BSD License.\n"
    " */"
)
HEADER = (
    "/* Generated from the Environment JSON Schema of code-sandboxes "
    "(schemas/environment-v1alpha1.json) by "
    "scripts/generate-environments-types.py. Do not edit. */"
)
#: `src` is prettier-checked, so what is written is what prettier would write:
#: single quotes, 80 columns, a long union broken one member per line.
PRINT_WIDTH = 80
INDENT = "  "
_IDENTIFIER = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def read_schema() -> str:
    """
    Return the text of the Environment JSON Schema.

    Returns
    -------
    str
        The schema, exactly as ``code-sandboxes`` exports it.

    Raises
    ------
    SystemExit
        When no copy of the schema can be found.
    """
    given = os.environ.get(SCHEMA_VARIABLE)
    if given:
        path = Path(given)
        if not path.is_file():
            raise SystemExit(f"{SCHEMA_VARIABLE} names {path}, which is not a file.")
        return path.read_text(encoding="utf-8")
    if SIBLING_SCHEMA.is_file():
        return SIBLING_SCHEMA.read_text(encoding="utf-8")
    try:
        from code_sandboxes.environments.schema import schema_text
    except ImportError:
        raise SystemExit(
            f"No Environment JSON Schema: set {SCHEMA_VARIABLE}, check out "
            "code-sandboxes beside agent-runtimes, or install code-sandboxes>=1.5.0."
        ) from None
    return schema_text()


def quote(value: str) -> str:
    """
    Return a TypeScript string literal, quoted the way prettier quotes.

    Parameters
    ----------
    value : str
        The string.

    Returns
    -------
    str
        The literal, in single quotes.
    """
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


def literal(value: Any) -> str:
    """
    Return a JSON scalar as a TypeScript literal.

    Parameters
    ----------
    value : Any
        A string, number, boolean or null.

    Returns
    -------
    str
        Its TypeScript spelling.
    """
    if isinstance(value, str):
        return quote(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return json.dumps(value)


def members(node: dict[str, Any]) -> list[str]:
    """
    Return the members of the union a schema node is, or its one type.

    Parameters
    ----------
    node : dict[str, Any]
        The schema node.

    Returns
    -------
    list[str]
        Each member spelled in TypeScript, without duplicates.
    """
    if "$ref" in node:
        return [node["$ref"].rsplit("/", 1)[-1]]
    if "const" in node:
        return [literal(node["const"])]
    if "enum" in node:
        return [literal(value) for value in node["enum"]]
    for keyword in ("anyOf", "oneOf"):
        if keyword in node:
            found = [member for option in node[keyword] for member in members(option)]
            return list(dict.fromkeys(found))
    kind = node.get("type")
    if isinstance(kind, list):
        found = [member for item in kind for member in members({**node, "type": item})]
        return list(dict.fromkeys(found))
    if kind == "array":
        item = ts_type(node.get("items", {}))
        return [f"{item}[]" if _IDENTIFIER.match(item) else f"Array<{item}>"]
    if kind == "object":
        extra = node.get("additionalProperties")
        if isinstance(extra, dict):
            return [f"Record<string, {ts_type(extra)}>"]
        return ["Record<string, unknown>"]
    return [
        {
            "integer": "number",
            "number": "number",
            "string": "string",
            "boolean": "boolean",
            "null": "null",
        }.get(str(kind), "unknown")
    ]


def ts_type(node: dict[str, Any]) -> str:
    """
    Return the TypeScript type of one schema node.

    Parameters
    ----------
    node : dict[str, Any]
        The schema node.

    Returns
    -------
    str
        Its TypeScript spelling.
    """
    return " | ".join(members(node))


def notes(node: dict[str, Any]) -> str | None:
    """
    Return what a property's type cannot say: its description, bounds and default.

    Parameters
    ----------
    node : dict[str, Any]
        The property's schema node.

    Returns
    -------
    str | None
        One line for a doc comment, or None when there is nothing to say.
    """
    parts: list[str] = []
    description = node.get("description")
    if description:
        parts.append(" ".join(description.strip().split("\n\n")[0].split()))
    for option in [node, *node.get("anyOf", []), *node.get("oneOf", [])]:
        if "pattern" in option:
            parts.append(f"Pattern: `{option['pattern']}`.")
        if "minimum" in option:
            parts.append(f"Minimum: {option['minimum']}.")
        if "exclusiveMinimum" in option:
            parts.append(f"Greater than {option['exclusiveMinimum']}.")
    if node.get("default") is not None and "const" not in node:
        parts.append(f"Default: `{json.dumps(node['default'])}`.")
    if not parts:
        return None
    return " ".join(parts).replace("*/", "*\\/")


def key(name: str) -> str:
    """
    Return a property name, quoted only when TypeScript needs it quoted.

    Parameters
    ----------
    name : str
        The property name.

    Returns
    -------
    str
        The name as an interface member is written.
    """
    return name if _IDENTIFIER.match(name) else quote(name)


def summary(description: str | None) -> str | None:
    """
    Return the first paragraph of a description, as one line.

    Parameters
    ----------
    description : str | None
        The description, if any.

    Returns
    -------
    str | None
        One line, or None when there is nothing to say.
    """
    if not description:
        return None
    return " ".join(description.strip().split("\n\n")[0].split()).replace("*/", "*\\/")


def interface(name: str, schema: dict[str, Any]) -> list[str]:
    """
    Render one object schema as an exported interface.

    Parameters
    ----------
    name : str
        The interface name.
    schema : dict[str, Any]
        The object schema.

    Returns
    -------
    list[str]
        The lines of the interface.
    """
    lines: list[str] = []
    described = summary(schema.get("description"))
    if described:
        lines.append(f"/** {described} */")
    properties = schema.get("properties") or {}
    if not properties:
        return [*lines, f"export interface {name} {{}}"]
    lines.append(f"export interface {name} {{")
    required = set(schema.get("required", []))
    for property_name, node in properties.items():
        note = notes(node)
        if note:
            lines.append(f"{INDENT}/** {note} */")
        head = (
            f"{INDENT}{key(property_name)}{'' if property_name in required else '?'}:"
        )
        union = members(node)
        single = f"{head} {' | '.join(union)};"
        if len(single) <= PRINT_WIDTH or len(union) == 1:
            lines.append(single)
            continue
        lines.append(head)
        lines.extend(f"{INDENT * 2}| {member}" for member in union[:-1])
        lines.append(f"{INDENT * 2}| {union[-1]};")
    lines.append("}")
    return lines


def declare(name: str, value: str, comment: str) -> list[str]:
    """
    Render one exported string constant, broken after `=` as prettier breaks it.

    Parameters
    ----------
    name : str
        The constant's name.
    value : str
        Its value.
    comment : str
        What it is.

    Returns
    -------
    list[str]
        The lines of the declaration.
    """
    opening = f"export const {name} = "
    flat = quote(value)
    if len(opening) + len(flat) + 1 <= PRINT_WIDTH:
        return [f"/** {comment} */", f"{opening}{flat};"]
    return [f"/** {comment} */", opening.rstrip(), f"{INDENT}{flat};"]


def generate(text: str) -> str:
    """
    Return the whole of the generated TypeScript file.

    Parameters
    ----------
    text : str
        The schema text.

    Returns
    -------
    str
        The file's content.
    """
    schema = json.loads(text)
    root = schema.get("title") or "Environment"
    properties = schema.get("properties") or {}
    blocks: list[list[str]] = [
        [LICENCE],
        [HEADER],
        declare(
            "ENVIRONMENT_SCHEMA_ID",
            schema["$id"],
            "The `$id` of the JSON Schema these types are generated from.",
        ),
        declare(
            "ENVIRONMENT_SCHEMA_SHA256",
            hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "The sha256 of the schema text these types are generated from.",
        ),
        declare(
            "ENVIRONMENT_API_VERSION",
            properties["apiVersion"]["const"],
            "The `apiVersion` an Environment document carries.",
        ),
        declare(
            "ENVIRONMENT_KIND",
            properties["kind"]["const"],
            "The `kind` an Environment document carries.",
        ),
    ]
    for name, definition in sorted((schema.get("$defs") or {}).items()):
        blocks.append(interface(name, definition))
    blocks.append(interface(root, schema))
    return "\n\n".join("\n".join(block) for block in blocks) + "\n"


def main() -> None:
    """
    Write the generated file, or check that the checked-in one is current.

    Raises
    ------
    SystemExit
        When `--check` is given and the file is stale.
    """
    expected = generate(read_schema())
    if "--check" in sys.argv[1:]:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != expected:
            raise SystemExit(
                f"Stale generated environment types ({OUTPUT.relative_to(ROOT)}): "
                "run `npm run generate:environments`"
            )
        return
    OUTPUT.write_text(expected, encoding="utf-8")


if __name__ == "__main__":
    main()
