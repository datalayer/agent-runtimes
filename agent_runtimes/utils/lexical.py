# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The nodes of a Lexical document, by hand: the shapes the editor writes.

One place for what every document the runtime writes is made of — an eval
report, an execution's report, an artifact, a page an application saves, the
week's report of its recommendations: text, a block, a heading, a paragraph,
a bulleted list, a table, and the document around them.

A block may carry a mark, under ``$`` — which Lexical keeps through a load,
a save and the collaboration binding even for a key it does not know (a field
beside ``type`` would be dropped the first time the document is opened): the
provenance of a generated block (``{"evidence": …}``), which an editor may
lock. Unmarked, a block is anybody's to edit.
"""

from __future__ import annotations

from typing import Any, Sequence

__all__ = [
    "BOLD",
    "CODE",
    "ITALIC",
    "STRIKETHROUGH",
    "block",
    "bullets",
    "cell",
    "document",
    "heading",
    "paragraph",
    "table",
    "text",
]

#: A text node's formats, as bits.
BOLD = 1
ITALIC = 2
STRIKETHROUGH = 4
CODE = 16


def text(content: str, fmt: int = 0) -> dict[str, Any]:
    """A run of text, in one format."""
    return {
        "detail": 0,
        "format": fmt,
        "mode": "normal",
        "style": "",
        "text": content,
        "type": "text",
        "version": 1,
    }


def block(
    kind: str,
    children: list[dict[str, Any]],
    mark: dict[str, Any] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """An element node of ``kind``; marked with its provenance when given one."""
    return {
        "children": children,
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": kind,
        "version": 1,
        **({"$": {"evidence": mark}} if mark is not None else {}),
        **extra,
    }


def heading(words: str, tag: str, mark: dict[str, Any] | None = None) -> dict[str, Any]:
    return block("heading", [text(words)], mark, tag=tag)


def paragraph(
    content: str | Sequence[dict[str, Any]],
    mark: dict[str, Any] | None = None,
    fmt: int = 0,
) -> dict[str, Any]:
    """A paragraph of words in one format, or of the text nodes given."""
    children = [text(content, fmt)] if isinstance(content, str) else list(content)
    return block("paragraph", children, mark, textFormat=fmt, textStyle="")


def bullets(lines: Sequence[str], mark: dict[str, Any] | None = None) -> dict[str, Any]:
    items = [
        block("listitem", [text(line)], mark, value=index)
        for index, line in enumerate(lines, start=1)
    ]
    return block("list", items, mark, listType="bullet", start=1, tag="ul")


def cell(
    words: str, header: bool, mark: dict[str, Any] | None = None
) -> dict[str, Any]:
    return block(
        "tablecell",
        [paragraph(words, mark)],
        mark,
        headerState=1 if header else 0,
        colSpan=1,
        rowSpan=1,
        backgroundColor=None,
    )


def table(
    head: Sequence[str],
    rows: Sequence[Sequence[str]],
    mark: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """A table: its header row, then its rows."""
    body = [block("tablerow", [cell(words, True, mark) for words in head], mark)]
    body += [
        block("tablerow", [cell(words, False, mark) for words in row], mark)
        for row in rows
    ]
    return block("table", body, mark)


def document(children: list[dict[str, Any]]) -> dict[str, Any]:
    """The serialized editor state around a document's blocks."""
    return {"root": block("root", children)}
