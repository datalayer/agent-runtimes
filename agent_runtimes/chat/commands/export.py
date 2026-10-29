# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Slash command: /export [file] - Export this session as a file (MH-18)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from agent_runtimes.loop.commands import CommandArgSpec

from .sessions_shared import NOT_A_SESSION, ask, current_uid

if TYPE_CHECKING:
    from ..tux import CliTux

NAME = "export"
ALIASES: list[str] = []
DESCRIPTION = "Export this session as a datalayer-session/1 file"
SHORTCUT = None
GROUP = "Session"
ARGS = (
    CommandArgSpec(
        name="file", description="Where to write it; <uid>.session.jsonl unsaid"
    ),
)


async def execute(tux: "CliTux", argv: str = "") -> Optional[str]:
    """Export through the session route; write the file and say what it holds."""
    uid = current_uid(tux)
    if not uid:
        tux.console.print(f"[red]{NOT_A_SESSION}[/red]")
        return None
    try:
        response = ask(tux, "GET", f"/{uid}/export")
    except (RuntimeError, OSError) as refused:
        tux.console.print(f"[red]{refused}[/red]")
        return None
    path = Path((argv or "").strip() or f"{uid}.session.jsonl").expanduser()
    path.write_text(response.text, encoding="utf-8")
    head = json.loads(response.text.split("\n", 1)[0])
    tux.console.print(
        f"Exported {head['turns']} turn{'s' if head['turns'] != 1 else ''}, {head['entries']} entries, "
        f"{head['redactions']} redaction{'s' if head['redactions'] != 1 else ''} → {path} "
        f"({response.headers.get('x-session-digest', '')}).",
        markup=False,
    )
    return None
