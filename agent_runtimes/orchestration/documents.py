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
        for paragraph in (part.strip("\n") for part in body.split("\n\n")):
            if paragraph.strip():
                children.append(
                    _block(
                        "paragraph", _lines(paragraph), mark, textFormat=0, textStyle=""
                    )
                )
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
