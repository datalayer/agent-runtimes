# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The marks of a catalogue entry, checked before anything is generated from it.

An MCP server, a skill, a tool and a frontend tool set each have an icon and an
emoji. The icon says its package (`@datalayer/icons-react:odoo`,
`@primer/octicons-react:mark-github`), so the chat loads it from the right one.
The rule is `agentspecs.marks`, imported from the clone the specs are read
from; an entry that breaks it stops the generator, naming the entry.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from agentspecs_clone import import_from_clone


def check_marks(specs: list[dict[str, Any]], specs_dir: Path) -> None:
    """Refuse a catalogue with an entry whose marks are missing or malformed."""
    marks = import_from_clone(specs_dir, "marks")
    problems = [
        f"  {spec.get('id', '?')}: {problem}"
        for spec in specs
        for problem in marks.marks_problems(spec)
    ]
    if problems:
        raise SystemExit(
            f"Error: the marks of {specs_dir.name} are not what agentspecs.marks says:\n"
            + "\n".join(problems)
        )
