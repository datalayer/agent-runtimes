# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What an artifact becomes on the platform, and the body that gets it there (PLAN_ORCHESTRATOR.md, O1-10).

An adapter registers an artifact with a summary and a hash, and hands its
whole body along on the observation, for the durable worker to write into the
account's orchestration space. These hold both halves: the body travels
whole — the A2A adapter once sent only the summary — a notebook a worker
attached is registered as a notebook, and ``documents`` turns a body into the
notebook or the document it is written as.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_orchestration_artifact_bodies.py -v
```
"""

from __future__ import annotations

import base64
import json

import pytest
from datalayer_core.orchestration import (
    ArtifactProvenance,
    ArtifactType,
    ContextKind,
    ExecutionEventType,
)

from agent_runtimes.orchestration import InMemoryExecutionStore, now
from agent_runtimes.orchestration.adapter import answer_artifact
from agent_runtimes.orchestration.adapters.a2a import A2AWorkerAdapter
from agent_runtimes.orchestration.documents import (
    NOTEBOOK_MEDIA_TYPE,
    artifact_document,
    notebook_of,
    platform_object,
)
from agent_runtimes.tests.orchestration_records import an_attempt, an_execution
from agent_runtimes.tests.test_orchestration_a2a_adapter import (
    GOOD_RUN,
    _dispatch,
    _no_task_lookup,
    _relay,
    _worker,
)

NOTEBOOK = {
    "cells": [
        {
            "cell_type": "code",
            "source": "1 + 1",
            "metadata": {},
            "outputs": [],
            "execution_count": None,
        }
    ],
    "metadata": {},
    "nbformat": 4,
    "nbformat_minor": 5,
}

LONG = "A finding worth more than two hundred characters. " * 10


async def _registered_bodies(
    store: InMemoryExecutionStore, execution_id: str
) -> list[str]:
    return [
        str((event.data or {}).get("text"))
        for event in await store.events(execution_id)
        if event.type is ExecutionEventType.ARTIFACT_REGISTERED
    ]


class TestTheBodyTravelsWhole:
    @pytest.mark.asyncio
    async def test_a_workers_artifact_carries_its_whole_text_not_its_summary(
        self, monkeypatch
    ):
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(
            monkeypatch,
            {
                "status": {"state": "completed"},
                "artifacts": [
                    {
                        "artifactId": "art_report",
                        "name": "report",
                        "parts": [{"text": LONG}],
                    }
                ],
            },
        )
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        (artifact,) = await store.artifacts(execution.execution_id)
        assert artifact.summary is not None and len(artifact.summary) < len(LONG)
        assert await _registered_bodies(store, execution.execution_id) == [LONG]

    @pytest.mark.asyncio
    async def test_a_notebook_the_worker_attached_is_registered_as_a_notebook(
        self, monkeypatch
    ):
        encoded = base64.b64encode(json.dumps(NOTEBOOK).encode("utf-8")).decode("ascii")
        _relay(monkeypatch, GOOD_RUN)
        _no_task_lookup(
            monkeypatch,
            {
                "status": {"state": "completed"},
                "artifacts": [
                    {
                        "artifactId": "art_nb",
                        "name": "profiled",
                        "parts": [
                            {
                                "kind": "file",
                                "file": {
                                    "name": "profiled.ipynb",
                                    "mimeType": NOTEBOOK_MEDIA_TYPE,
                                    "bytes": encoded,
                                },
                            }
                        ],
                    }
                ],
            },
        )
        store = InMemoryExecutionStore()

        execution, _, _ = await _dispatch(A2AWorkerAdapter(), store)

        (artifact,) = await store.artifacts(execution.execution_id)
        assert (
            artifact.type is ArtifactType.NOTEBOOK
            and artifact.media_type == NOTEBOOK_MEDIA_TYPE
        )
        assert artifact.summary == "A notebook of 1 cells"
        [body] = await _registered_bodies(store, execution.execution_id)
        assert json.loads(body) == NOTEBOOK

    @pytest.mark.asyncio
    async def test_a_re_attach_collects_the_bodies_too(self, monkeypatch):
        _no_task_lookup(
            monkeypatch,
            {
                "status": {"state": "completed"},
                "artifacts": [{"name": "report", "parts": [{"text": LONG}]}],
            },
        )
        adapter = A2AWorkerAdapter(poll_interval_seconds=0)
        execution = an_execution()
        attempt = an_attempt(execution, protocol_task_id="task-1")

        observations = [
            observation
            async for observation in adapter.subscribe(_worker(), execution, attempt)
        ]

        assert observations[0].type is ExecutionEventType.ARTIFACT_REGISTERED
        assert observations[0].data == {"text": LONG}


def _artifact(**overrides):
    execution = an_execution()
    artifact = answer_artifact(
        execution, an_attempt(execution), "The notebook runs clean."
    )
    return execution, artifact.model_copy(update=overrides)


def _blocks(state):
    return state["root"]["children"]


def _words(block) -> str:
    return "".join(child.get("text", "\n") for child in block["children"])


class TestWhatAnArtifactIsWrittenAs:
    def test_a_text_answer_is_a_document_headed_by_what_produced_it(self):
        execution, artifact = _artifact()

        made = platform_object(
            execution, artifact, "First finding.\nStill the first.\n\nSecond finding."
        )

        assert made.kind is ContextKind.DOCUMENT and made.name == "answer"
        heading, produced, first, second = _blocks(made.content)
        assert heading["type"] == "heading" and _words(heading) == "answer"
        assert "notebook-validator" in _words(produced)
        assert (
            _words(first) == "First finding.\nStill the first."
            and _words(second) == "Second finding."
        )
        assert all(
            block["$"]["evidence"]["artifact"] == artifact.artifact_id
            for block in _blocks(made.content)
        )

    def test_a_json_answer_is_a_code_block(self):
        execution, artifact = _artifact(
            type=ArtifactType.JSON, media_type="application/json"
        )

        [*_, code] = _blocks(
            artifact_document(execution, artifact, '{"cells":12,"errors":0}')
        )

        assert code["type"] == "code" and code["language"] == "json"
        assert json.loads(_words(code)) == {"cells": 12, "errors": 0}

    def test_a_notebook_body_is_a_notebook_whatever_the_artifact_was_called(self):
        execution, artifact = _artifact()

        made = platform_object(execution, artifact, json.dumps(NOTEBOOK))

        assert made.kind is ContextKind.NOTEBOOK and made.content == NOTEBOOK

    def test_the_object_leads_back_to_the_run(self):
        execution, artifact = _artifact()

        made = platform_object(execution, artifact, "clean")

        (provenance,) = artifact.provenance
        assert made.metadata == {
            "kind": "orchestration-artifact",
            "execution_id": execution.execution_id,
            "root_execution_id": execution.root_execution_id,
            "artifact_id": artifact.artifact_id,
            "attempt_id": provenance.attempt_id,
            "agent_id": execution.agent.agent_id,
            "content_hash": provenance.content_hash,
        }

    def test_only_an_nbformat_document_is_a_notebook(self):
        assert notebook_of(json.dumps(NOTEBOOK)) == NOTEBOOK
        assert notebook_of('{"cells": []}') is None
        assert notebook_of("not json") is None
        assert notebook_of(json.dumps([1, 2])) is None

    def test_an_artifact_with_no_provenance_still_says_where_it_came_from(self):
        execution, artifact = _artifact(provenance=[])

        made = platform_object(execution, artifact, "clean")

        assert (
            made.metadata["attempt_id"] is None
            and made.metadata["execution_id"] == execution.execution_id
        )
        assert (
            ArtifactProvenance(
                execution_id="exec_1",
                attempt_id="att_1",
                agent_id="a",
                produced_at=now(),
            ).content_hash
            is None
        )
