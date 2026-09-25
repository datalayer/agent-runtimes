# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an artifact becomes on the platform (PLAN_ORCHESTRATOR.md, O1-10).

A worker's artifact is registered with a summary and a content hash; its body
is what the adapter saw — a turn's text, an A2A artifact's parts. Writing it
to the platform makes it an object somebody can open, in the account's
orchestration space: a notebook when the body is one, and otherwise a
document headed by what produced it, with the text as paragraphs or JSON as a
code block.

Pure. The durable worker holds the credential and the Spacer client and
decides nothing about the shape; this decides nothing about where it goes.
Every block of a document carries the artifact's provenance under ``$``, the
node state the report editor reads and locks, so a worker's words stay marked
as a worker's rather than passing for somebody's edit.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

from datalayer_core.orchestration import Artifact, ArtifactType, ContextKind, Execution

__all__ = [
    "NOTEBOOK_MEDIA_TYPE",
    "PlatformObject",
    "artifact_document",
    "notebook_of",
    "platform_object",
]

#: The media type a notebook arrives under.
NOTEBOOK_MEDIA_TYPE = "application/x-ipynb+json"


@dataclass(frozen=True)
class PlatformObject:
    """What an artifact is to be written as, and what it is to carry."""

    kind: ContextKind
    name: str
    description: str
    #: The notebook, or the Lexical editor state of the document.
    content: dict[str, Any]
    metadata: dict[str, Any] = field(default_factory=dict)


def notebook_of(body: str) -> dict[str, Any] | None:
    """
    The notebook a body holds, when it holds one.

    Parameters
    ----------
    body : str
        The artifact's body, as text.

    Returns
    -------
    dict[str, Any] | None
        The notebook, or ``None`` when the body is not an nbformat document.
    """
    try:
        found = json.loads(body)
    except ValueError:
        return None
    if (
        isinstance(found, dict)
        and isinstance(found.get("cells"), list)
        and "nbformat" in found
    ):
        return found
    return None


# The node shapes the editor writes, as `agent_runtimes.evals.lexical` writes them.


def _text(content: str, fmt: int = 0) -> dict[str, Any]:
    return {
        "detail": 0,
        "format": fmt,
        "mode": "normal",
        "style": "",
        "text": content,
        "type": "text",
        "version": 1,
    }


def _block(
    kind: str, children: list[dict[str, Any]], mark: dict[str, Any], **extra: Any
) -> dict[str, Any]:
    return {
        "children": children,
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": kind,
        "version": 1,
        "$": {"evidence": mark},
        **extra,
    }


def _lines(text: str) -> list[dict[str, Any]]:
    """Text with its line breaks, as a block's children."""
    children: list[dict[str, Any]] = []
    for index, line in enumerate(text.split("\n")):
        if index:
            children.append({"type": "linebreak", "version": 1})
        if line:
            children.append(_text(line))
    return children


# ---------------------------------------------------------------------------
# A worker's prose, read as the markdown it usually is (jupyter-lexical's own
# `convert/markdown/MarkdownTransformers.ts` is the reference for both the
# syntax and the priority a marker is tried in, so a heading or an emphasis a
# worker wrote is a heading or an emphasis here too, not the literal `#` or
# `**` characters a plain-text paragraph would have shown them as — found
# live, 2026-09-13, on an execution's own committed answer.
# ---------------------------------------------------------------------------

_BOLD = 1
_ITALIC = 2
_STRIKETHROUGH = 4
_CODE = 16

#: Longest marker first: `**` must not be read as two `*`s, the same rule
#: the js transformers' own comment states ("then longer tags match").
_INLINE_FORMATS: tuple[tuple[Any, int], ...] = (
    (re.compile(r"\*\*\*(?!\s)(.+?)(?<!\s)\*\*\*"), _BOLD | _ITALIC),
    (re.compile(r"___(?!\s)(.+?)(?<!\s)___"), _BOLD | _ITALIC),
    (re.compile(r"\*\*(?!\s)(.+?)(?<!\s)\*\*"), _BOLD),
    (re.compile(r"__(?!\s)(.+?)(?<!\s)__"), _BOLD),
    (re.compile(r"~~(?!\s)(.+?)(?<!\s)~~"), _STRIKETHROUGH),
    (re.compile(r"`(.+?)`"), _CODE),
    (re.compile(r"\*(?!\s)(.+?)(?<!\s)\*"), _ITALIC),
    (re.compile(r"_(?!\s)(.+?)(?<!\s)_"), _ITALIC),
)

_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_UNORDERED_ITEM = re.compile(r"^\s*[-*+]\s+(.*)$")
_ORDERED_ITEM = re.compile(r"^\s*\d+\.\s+(.*)$")


def _inline_nodes(text: str) -> list[dict[str, Any]]:
    """One line, as the text runs its markdown means: a code span first —
    nothing inside it is read as a marker — then the longest emphasis marker
    left to right. Never empty, so a block always has something to render.
    """
    nodes: list[dict[str, Any]] = []
    rest = text
    while rest:
        found: tuple[Any, int] | None = None
        for pattern, fmt in _INLINE_FORMATS:
            match = pattern.search(rest)
            if match and (found is None or match.start() < found[0].start()):
                found = (match, fmt)
        if found is None:
            nodes.append(_text(rest))
            break
        match, fmt = found
        if match.start() > 0:
            nodes.append(_text(rest[: match.start()]))
        nodes.append(_text(match.group(1), fmt))
        rest = rest[match.end() :]
    return nodes or [_text("")]


def _markdown_blocks(body: str, mark: dict[str, Any]) -> list[dict[str, Any]]:
    """A worker's whole answer, as headings, lists and paragraphs — a blank
    line still separates paragraphs and a single one is still a soft break
    within one, exactly as plain text was read before; a line is read as a
    heading or a list item first, the same order `HEADING`, `UNORDERED_LIST`
    and `ORDERED_LIST` are tried in `MarkdownTransformers.ts`.
    """
    blocks: list[dict[str, Any]] = []
    paragraph: list[str] = []
    items: list[str] = []
    list_kind: str | None = None

    def flush_paragraph() -> None:
        if not paragraph:
            return
        children: list[dict[str, Any]] = []
        for index, line in enumerate(paragraph):
            if index:
                children.append({"type": "linebreak", "version": 1})
            children.extend(_inline_nodes(line))
        blocks.append(_block("paragraph", children, mark, textFormat=0, textStyle=""))
        paragraph.clear()

    def flush_list() -> None:
        nonlocal list_kind
        if not items:
            return
        made = [
            _block("listitem", _inline_nodes(line), mark, value=index)
            for index, line in enumerate(items, start=1)
        ]
        blocks.append(
            _block(
                "list",
                made,
                mark,
                listType=list_kind,
                start=1,
                tag="ol" if list_kind == "number" else "ul",
            )
        )
        items.clear()
        list_kind = None

    for raw in body.split("\n"):
        line = raw.rstrip("\r")
        if not line.strip():
            flush_paragraph()
            flush_list()
            continue
        heading = _HEADING.match(line)
        if heading:
            flush_paragraph()
            flush_list()
            blocks.append(
                _block(
                    "heading",
                    _inline_nodes(heading.group(2)),
                    mark,
                    tag=f"h{len(heading.group(1))}",
                )
            )
            continue
        ordered = _ORDERED_ITEM.match(line)
        unordered = None if ordered else _UNORDERED_ITEM.match(line)
        if ordered or unordered:
            flush_paragraph()
            kind = "number" if ordered else "bullet"
            if items and list_kind != kind:
                flush_list()
            list_kind = kind
            match = ordered or unordered
            assert match is not None  # one of the two matched, just above
            items.append(match.group(1))
            continue
        flush_list()
        paragraph.append(line)
    flush_paragraph()
    flush_list()
    return blocks


def artifact_document(
    execution: Execution, artifact: Artifact, body: str
) -> dict[str, Any]:
    """
    A document of an artifact: what produced it, then what it says.

    Parameters
    ----------
    execution : Execution
        The execution the artifact belongs to.
    artifact : Artifact
        The artifact.
    body : str
        Its body.

    Returns
    -------
    dict[str, Any]
        The serialized Lexical editor state.
    """
    provenance = artifact.provenance[-1] if artifact.provenance else None
    mark = {
        "execution": execution.execution_id,
        "artifact": artifact.artifact_id,
        "attempt": provenance.attempt_id if provenance else None,
        "agent": execution.agent.agent_id,
    }
    children = [
        _block("heading", [_text(artifact.name)], mark, tag="h1"),
        _block(
            "paragraph",
            [
                _text(
                    f"Produced by {execution.agent.agent_id} for {execution.objective.goal}",
                    2,
                )
            ],
            mark,
            textFormat=2,
            textStyle="",
        ),
    ]
    structured = (
        artifact.type is ArtifactType.JSON or artifact.media_type == "application/json"
    )
    if structured:
        try:
            pretty = json.dumps(json.loads(body), indent=2, ensure_ascii=False)
        except ValueError:
            pretty = body
        children.append(_block("code", _lines(pretty), mark, language="json"))
    else:
        children.extend(_markdown_blocks(body, mark))
    return {
        "root": {
            "children": children,
            "direction": "ltr",
            "format": "",
            "indent": 0,
            "type": "root",
            "version": 1,
        }
    }


def platform_object(
    execution: Execution, artifact: Artifact, body: str
) -> PlatformObject:
    """
    What an artifact is written as: a notebook when its body is one, a document otherwise.

    Parameters
    ----------
    execution : Execution
        The execution the artifact belongs to.
    artifact : Artifact
        The artifact.
    body : str
        Its body.

    Returns
    -------
    PlatformObject
        The object, with metadata naming the execution, the attempt and the
        artifact, so an object opened on its own leads back to the run.
    """
    provenance = artifact.provenance[-1] if artifact.provenance else None
    metadata = {
        "kind": "orchestration-artifact",
        "execution_id": execution.execution_id,
        "root_execution_id": execution.root_execution_id,
        "artifact_id": artifact.artifact_id,
        "attempt_id": provenance.attempt_id if provenance else None,
        "agent_id": execution.agent.agent_id,
        "content_hash": provenance.content_hash if provenance else None,
    }
    description = (
        f"Produced by {execution.agent.agent_id} for {execution.objective.goal}"
    )
    notebook = notebook_of(body)
    if notebook is not None:
        return PlatformObject(
            ContextKind.NOTEBOOK, artifact.name, description, notebook, metadata
        )
    return PlatformObject(
        ContextKind.DOCUMENT,
        artifact.name,
        description,
        artifact_document(execution, artifact, body),
        metadata,
    )
