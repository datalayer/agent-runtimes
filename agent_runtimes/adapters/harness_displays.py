# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The ``diff`` and ``terminal`` displays of a harness's tool results (SH-16).

A harness's ``tool_call_update`` carries what it changed as a diff and what
it ran as a terminal. The page and the phone draw them as they draw every
protocol display (M-037, RU-1): beside the tool's result,
in ``_meta["reactor.ui/display"]``, typed here as Reactor displays —

- ``application/vnd.datalayer.shield.diff+json``: ``{path, old_text,
  new_text, language}``, drawn as a unified diff with the file's language;
- ``application/vnd.datalayer.shield.terminal+json``: ``{terminal_id,
  command, output, exit_code, released}``, the output kept after release.

Both are ``both``-audience fields: a model reading the row sees the same
data the page draws. :func:`display_meta_of` builds the ``_meta`` of one
tool result: its first diff, else its first terminal, else nothing.
"""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any, Mapping, Sequence

from reactor.ui import DISPLAY_META_KEY, Display, display_type

__all__ = [
    "DIFF_DISPLAY_TYPE",
    "TERMINAL_DISPLAY_TYPE",
    "DiffDisplay",
    "TerminalDisplay",
    "display_meta_of",
    "language_of",
]

DIFF_DISPLAY_TYPE = "application/vnd.datalayer.shield.diff+json"
TERMINAL_DISPLAY_TYPE = "application/vnd.datalayer.shield.terminal+json"

#: A file's language from its suffix, for the diff's highlighting; the
#: page's own table (``portable/displays``) says the same.
LANGUAGES: dict[str, str] = {
    ".py": "python",
    ".pyi": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".json": "json",
    ".md": "markdown",
    ".mdx": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sh": "bash",
    ".bash": "bash",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".xml": "xml",
    ".sql": "sql",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".rb": "ruby",
    ".ipynb": "json",
    ".txt": "text",
}


def language_of(path: str) -> str:
    """
    The language a file's suffix says, for highlighting; ``text`` when none.

    Parameters
    ----------
    path : str
        The file's path.

    Returns
    -------
    str
        A highlighter's language name.
    """
    name = PurePosixPath(path).name
    if name in ("Dockerfile", "Makefile"):
        return name.lower()
    return LANGUAGES.get(PurePosixPath(path).suffix.lower(), "text")


@display_type(DIFF_DISPLAY_TYPE, version=1)
class DiffDisplay(Display):
    """What a harness changed in one file."""

    path: str
    old_text: str | None = None
    new_text: str
    language: str = "text"

    def text(self) -> str:
        """One line: the file and how many lines came and went."""
        before = (self.old_text or "").splitlines()
        after = self.new_text.splitlines()
        if self.old_text is None:
            return f"Wrote {self.path} ({len(after)} lines)"
        return f"Changed {self.path} (+{len(after)} −{len(before)} lines)"


@display_type(TERMINAL_DISPLAY_TYPE, version=1)
class TerminalDisplay(Display):
    """What a harness ran, its output kept after release."""

    terminal_id: str
    command: str = ""
    output: str = ""
    exit_code: int | None = None
    released: bool = False

    def text(self) -> str:
        """One line: the command and how it ended."""
        what = (
            f"Ran `{self.command}`" if self.command else f"Terminal {self.terminal_id}"
        )
        if self.exit_code is None:
            return f"{what}: running"
        return f"{what}: exit {self.exit_code}"


def display_meta_of(
    displays: Sequence[Mapping[str, Any]],
    *,
    tool_call_id: str,
    command: str = "",
    output: Mapping[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    The ``_meta`` a tool result carries for the page: its first diff, else its first terminal.

    Parameters
    ----------
    displays : Sequence[Mapping[str, Any]]
        The result's displays as the adapter dumps them (``display``: ``diff``
        or ``terminal``, with their fields).
    tool_call_id : str
        The call, which names the display.
    command : str
        What a terminal ran, when known.
    output : Mapping[str, Any], optional
        The result's raw output: a terminal's ``{"output", "exit"}`` when
        the harness reported them.

    Returns
    -------
    dict[str, Any] | None
        ``{"reactor.ui/display": <wire>}``, or ``None`` with no display.
    """
    for shown in displays:
        if shown.get("display") == "diff":
            path = str(shown.get("path") or "")
            wire = DiffDisplay(
                id=f"{tool_call_id}-diff",
                path=path,
                old_text=shown.get("old_text"),
                new_text=str(shown.get("new_text") or ""),
                language=language_of(path),
            ).wire()
            return {DISPLAY_META_KEY: wire.model_dump(mode="json")}
    for shown in displays:
        if shown.get("display") == "terminal":
            ran = output if isinstance(output, Mapping) else {}
            exit_code = ran.get("exit", ran.get("exit_code"))
            wire = TerminalDisplay(
                id=f"{tool_call_id}-terminal",
                terminal_id=str(shown.get("terminal_id") or ""),
                command=command or str(ran.get("command") or ""),
                output=str(ran.get("output") or ""),
                exit_code=int(exit_code) if isinstance(exit_code, int) else None,
                released=bool(ran.get("released", exit_code is not None)),
            ).wire()
            return {DISPLAY_META_KEY: wire.model_dump(mode="json")}
    return None
