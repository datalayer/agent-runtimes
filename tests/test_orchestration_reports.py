# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The live report of an execution (PLAN_ORCHESTRATOR.md, O1-15).

The document is the goal, one execution tree node that names the execution
and nothing it did, and room for notes. The report is one artifact per
execution, naming the live document, and the commit rule never settles it:
no attempt produced it.
"""

from __future__ import annotations

import json
from pathlib import Path

import datalayer_core.orchestration as canonical
from datalayer_core.orchestration import (
    Artifact,
    ArtifactProvenance,
    ArtifactStatus,
    ArtifactType,
    Execution,
    commit_artifacts,
)

from agent_runtimes.orchestration.reports import (
    EXECUTION_TREE_NODE,
    REPORT_ARTIFACT_NAME,
    execution_report_document,
    report_artifact,
    report_artifact_id,
)

FIXTURE = json.loads(
    (Path(canonical.__file__).parent / "fixtures" / "orchestration-v1.json").read_text()
)


def _execution() -> Execution:
    return Execution.from_wire(FIXTURE["Execution"])


def _produced(artifact_id: str, execution_id: str, attempt_id: str) -> Artifact:
    return Artifact(
        artifact_id=artifact_id,
        type=ArtifactType.NOTEBOOK,
        name="profile",
        provenance=[
            ArtifactProvenance(
                execution_id=execution_id,
                attempt_id=attempt_id,
                agent_id="acp-analyst",
                produced_at="2026-09-11T10:00:00+00:00",
            )
        ],
    )


def test_the_document_is_the_goal_the_tree_and_room_for_notes() -> None:
    execution = _execution()
    children = execution_report_document(execution)["root"]["children"]
    assert [node["type"] for node in children] == [
        "heading",
        "paragraph",
        EXECUTION_TREE_NODE,
        "heading",
        "paragraph",
    ]
    assert children[0]["children"][0]["text"] == execution.objective.goal
    assert execution.agent.agent_id in children[1]["children"][0]["text"]


def test_the_tree_node_names_the_execution_and_nothing_it_did() -> None:
    """What the run does moves; the editor draws it, so the node keeps only the id."""
    execution = _execution()
    [tree] = [
        node
        for node in execution_report_document(execution)["root"]["children"]
        if node["type"] == EXECUTION_TREE_NODE
    ]
    assert tree == {
        "type": "execution-tree",
        "version": 1,
        "format": "",
        "executionId": execution.execution_id,
    }


def test_the_report_is_one_artifact_per_execution_naming_its_live_document() -> None:
    execution = _execution()
    artifact = report_artifact(execution, "doc-1")
    assert (
        artifact.artifact_id
        == report_artifact_id(execution.execution_id)
        == report_artifact(execution, "doc-2").artifact_id
    )
    assert (artifact.type, artifact.name, artifact.reference) == (
        ArtifactType.REPORT,
        REPORT_ARTIFACT_NAME,
        "datalayer:document/doc-1@live",
    )
    assert artifact.status is ArtifactStatus.REGISTERED and artifact.provenance == []


def test_the_commit_rule_leaves_the_report_alone() -> None:
    execution = _execution()
    report = report_artifact(execution, "doc-1")
    first = commit_artifacts(
        [report, _produced("art_profile", execution.execution_id, "att_1")],
        execution_id=execution.execution_id,
        attempt_id="att_1",
    )
    assert [(one.artifact_id, one.status) for one in first.artifacts] == [
        (report.artifact_id, ArtifactStatus.REGISTERED),
        ("art_profile", ArtifactStatus.COMMITTED),
    ]
    later = commit_artifacts(
        [*first.artifacts, _produced("art_profile_2", execution.execution_id, "att_2")],
        execution_id=execution.execution_id,
        attempt_id="att_2",
    )
    assert later.artifacts[0] == report
    assert later.artifacts[2].status is ArtifactStatus.SUPERSEDED
