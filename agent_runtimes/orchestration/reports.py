# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The live report of an execution (PLAN_ORCHESTRATOR.md, O1-15).

A document in the account's orchestration space, around one execution tree
node. The node stores which execution it is about and nothing more: the editor
that opens the document draws the tree from the control plane as the run goes
— states, workers, attempts, artifacts, traces — so the document keeps up with
the run without anybody rewriting it. Around the node, the words the report is
read with and room for the people reading it.

The report is registered on its execution as an artifact of its own, named
``orchestration-report``, whose reference is the document. The execution's
page finds it among the artifacts, and asking for the report again answers the
same document rather than a second one. It names no attempt, because no attempt
produced it, so the commit rule leaves it alone.
"""

from __future__ import annotations

from typing import Any

from datalayer_core.orchestration import (
    Artifact,
    ArtifactType,
    ContextKind,
    Execution,
    format_context_uri,
)

__all__ = [
    "EXECUTION_TREE_NODE",
    "REPORT_ARTIFACT_NAME",
    "execution_report_document",
    "report_artifact",
    "report_artifact_id",
]

#: The name a report is registered under on its execution.
REPORT_ARTIFACT_NAME = "orchestration-report"

#: The Lexical type of the node that draws an execution's tree.
EXECUTION_TREE_NODE = "execution-tree"

#: The version a report's reference names: the document is live, not a snapshot.
LIVE_VERSION = "live"


def report_artifact_id(execution_id: str) -> str:
    """
    The one artifact id a report of an execution has.

    Parameters
    ----------
    execution_id : str
        The execution.

    Returns
    -------
    str
        The id, the same every time it is asked for.
    """
    return f"art_report-{execution_id}"


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


def _element(kind: str, children: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    return {
        "children": children,
        "direction": "ltr",
        "format": "",
        "indent": 0,
        "type": kind,
        "version": 1,
        **extra,
    }


def execution_report_document(execution: Execution) -> dict[str, Any]:
    """
    The report's first state: what the run is, its tree, and room for notes.

    Parameters
    ----------
    execution : Execution
        The execution the report is about.

    Returns
    -------
    dict[str, Any]
        The serialized Lexical editor state.
    """
    agent = execution.agent
    return {
        "root": _element(
            "root",
            [
                _element("heading", [_text(execution.objective.goal)], tag="h1"),
                _element(
                    "paragraph",
                    [
                        _text(
                            f"Delegated to {agent.agent_id} over {agent.protocol.value.upper()}. "
                            "The tree below follows the run as it goes; what is written around it "
                            "is the readers'.",
                            2,
                        )
                    ],
                    textFormat=2,
                    textStyle="",
                ),
                {
                    "type": EXECUTION_TREE_NODE,
                    "version": 1,
                    "format": "",
                    "executionId": execution.execution_id,
                },
                _element("heading", [_text("Notes")], tag="h2"),
                _element("paragraph", [], textFormat=0, textStyle=""),
            ],
        )
    }


def report_artifact(execution: Execution, document_uid: str) -> Artifact:
    """
    The report, as the artifact its execution lists.

    Parameters
    ----------
    execution : Execution
        The execution the report is about.
    document_uid : str
        The report's document.

    Returns
    -------
    Artifact
        A registered report naming the live document.
    """
    return Artifact(
        artifact_id=report_artifact_id(execution.execution_id),
        type=ArtifactType.REPORT,
        name=REPORT_ARTIFACT_NAME,
        reference=format_context_uri(ContextKind.DOCUMENT, document_uid, LIVE_VERSION),
        summary="The live report of the execution.",
    )
