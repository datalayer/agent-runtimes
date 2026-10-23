# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Code reads a catalogue entry by its id, never by a version-named constant.

Decided 14 October 2026. ``make specs`` still generates ``SALES_APP_0_0_3``
and the like for anyone outside, but code here reads ``APP_CATALOGUE["sales"]``,
``TEAM_SPECS[...]``, ``SCENE_CATALOGUE[...]`` or ``AGENTSPECS[...]``, so a
version bump touches no caller.

Names are read from the syntax tree: one said in a string (a test of what the
generator writes) is not a use. The generated modules and the generators
themselves (``scripts/codegen``) are not read.
"""

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: The hand-written Python roots of the repository.
SOURCE_ROOTS = ["agent_runtimes", "examples", "scripts", "e2e", "dev", "docs"]

#: Generated: the spec catalogues and the MCP server catalogue; and the generators.
GENERATED = (
    "agent_runtimes/specs/",
    "agent_runtimes/mcp/catalog_mcp_servers.py",
    "scripts/codegen/",
)

VERSION_NAMED = re.compile(r"^[A-Z][A-Z0-9_]*_\d+_\d+_\d+$")

SKIPPED_DIRECTORIES = {"node_modules", "__pycache__", "build", "dist", "lib"}


def _sources() -> list[Path]:
    found: list[Path] = []
    for root in SOURCE_ROOTS:
        for path in (ROOT / root).rglob("*.py"):
            relative = path.relative_to(ROOT).as_posix()
            parts = set(path.relative_to(ROOT).parts)
            if parts & SKIPPED_DIRECTORIES or any(p.startswith(".") for p in parts):
                continue
            if relative.startswith(GENERATED):
                continue
            found.append(path)
    return found


def _version_named(source: str) -> list[tuple[int, str]]:
    names: list[tuple[int, str]] = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.alias):
            candidates = [node.name.rsplit(".", 1)[-1], node.asname or ""]
        elif isinstance(node, ast.Name):
            candidates = [node.id]
        elif isinstance(node, ast.Attribute):
            candidates = [node.attr]
        else:
            continue
        for name in candidates:
            if VERSION_NAMED.match(name):
                names.append((getattr(node, "lineno", 0), name))
    return names


def test_no_hand_written_source_names_a_version_named_constant() -> None:
    sources = _sources()
    assert len(sources) > 100
    offenders = [
        f"{path.relative_to(ROOT).as_posix()}:{line} {name}"
        for path in sources
        for line, name in _version_named(path.read_text(encoding="utf-8"))
    ]
    assert offenders == []


def test_the_check_catches_a_constant_and_not_a_string() -> None:
    assert _version_named("from agent_runtimes.specs.apps import SALES_APP_0_0_3") == [
        (1, "SALES_APP_0_0_3")
    ]
    assert _version_named(
        "import x\nteam = x.SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1"
    ) == [(2, "SALES_AND_ACCOUNTING_TEAM_SPEC_0_0_1")]
    assert _version_named('app = APP_CATALOGUE["sales"]') == []
    assert _version_named('assert "COG_CRAWLER_0_0_1 = CogSpec(" in python') == []
