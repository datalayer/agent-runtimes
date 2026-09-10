# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
The notebook analyst, served over A2A.

A protocol shell and nothing else: it reads the objective out of the A2A
message, calls ``notebook_analysis.analyse``, publishes what it is doing as it goes,
and registers the report as the task's artifact. The analysis is the module
next door, shared with the ACP worker, so the two workers cannot disagree
about the notebook (PLAN_ORCHESTRATOR.md, O0-13).

Built on ``fasta2a``, which is what ``agent_runtimes.routes.a2a`` serves the
platform's own agents with, so this worker is an A2A server of the same kind
a real one is — the difference is that it runs an analysis rather than a
model, which is what lets the example run with no credentials and give the
same answer every time.
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, AsyncIterator

from fasta2a import FastA2A, Skill
from fasta2a.broker import InMemoryBroker
from fasta2a.schema import Artifact, Message, Part, TaskIdParams, TaskSendParams
from fasta2a.storage import InMemoryStorage
from fasta2a.worker import Worker
from notebook_analysis import Report, analyse

#: What the worker is called on both protocols, so one descriptor's
#: ``agent_id`` is the only thing that changes between the two runs.
AGENT_ID = "notebook-analyst"

#: The capability the descriptor claims and the orchestrator asks for.
CAPABILITY = "notebook.analyse"


def _text_of(message: Any) -> str:
    """
    The text of an A2A message, whatever else it carries.

    Parameters
    ----------
    message : Any
        The incoming message.

    Returns
    -------
    str
        Its text parts, joined.
    """
    parts = (message or {}).get("parts") or []
    return "\n".join(
        str(part.get("text") or "")
        for part in parts
        if isinstance(part, dict) and part.get("text")
    ).strip()


@dataclass
class NotebookAnalystWorker(Worker):  # type: ignore[misc]
    """Runs the analysis for the tasks the A2A app receives.

    ``run_task`` is the whole worker: say it started, do the analysis, say
    what it found, register the report. Progress is published as it happens
    rather than at the end, because the orchestrator's conformance scenario 2
    is about progress arriving before the work is over.
    """

    notebook: Path = Path("notebook.ipynb")

    async def run_task(self, params: TaskSendParams) -> None:
        """
        Analyse the notebook, reporting as it goes.

        Parameters
        ----------
        params : TaskSendParams
            The task, carrying the objective as its message.
        """
        task = await self.storage.load_task(params["id"])
        if task is None:
            raise ValueError(f"Task {params['id']} not found")
        task_id, context_id = task["id"], task["context_id"]
        asked = _text_of(params.get("message"))

        await self.storage.update_task(task_id, state="working")
        await self.publish_status(task_id, context_id, "working")
        await self.publish_status(
            task_id,
            context_id,
            "working",
            _message(context_id, f"Reading {self.notebook.name}."),
        )

        report = analyse(self.notebook)
        await self.publish_status(
            task_id,
            context_id,
            "working",
            _message(
                context_id,
                f"{report.code_cells} code cells read, "
                f"{len(report.findings)} problems found.",
            ),
        )

        answer = _answer(report, asked)
        reply = _message(context_id, answer)
        artifact = Artifact(
            artifact_id=str(uuid.uuid4()),
            name="notebook-analysis",
            parts=[Part(text=answer)],
        )
        await self.storage.update_task(
            task_id,
            state="completed",
            new_artifacts=[artifact],
            new_messages=[reply],
        )
        await self.publish_artifact(task_id, context_id, artifact)

    async def cancel_task(self, params: TaskIdParams) -> None:
        """
        Stop a task.

        The analysis is one read of one file, so there is no window to stop
        in; saying so is better than a method that pretends to have stopped
        something.

        Parameters
        ----------
        params : TaskIdParams
            Which task.
        """
        return None

    def build_message_history(self, history: list[Message]) -> list[Any]:
        """
        The conversation so far, which this worker does not use.

        Parameters
        ----------
        history : list[Message]
            The messages.

        Returns
        -------
        list[Any]
            The same messages.
        """
        return list(history)

    def build_artifacts(self, result: Any) -> list[Artifact]:
        """
        A result as one artifact.

        Parameters
        ----------
        result : Any
            The analysis answer.

        Returns
        -------
        list[Artifact]
            One text artifact.
        """
        return [
            Artifact(
                artifact_id=str(uuid.uuid4()),
                name="notebook-analysis",
                parts=[Part(text=str(result))],
            )
        ]


def _message(context_id: str, text: str) -> Message:
    """
    One agent message.

    Parameters
    ----------
    context_id : str
        The A2A context.
    text : str
        What to say.

    Returns
    -------
    Message
        The message.
    """
    return Message(
        role="agent",
        parts=[Part(text=text)],
        message_id=str(uuid.uuid4()),
        context_id=context_id,
    )


def _answer(report: Report, asked: str) -> str:
    """
    The worker's answer: the report, and what it was asked for.

    Quoting the objective back is what makes the example's claim checkable:
    the orchestrator asserts both workers were asked the same thing, and a
    worker that never received the manifest could not quote it.

    Parameters
    ----------
    report : Report
        What the analysis found.
    asked : str
        The objective as the worker received it.

    Returns
    -------
    str
        The answer.
    """
    lines = [report.as_text()]
    if asked:
        lines += ["", "Asked for:", asked]
    return "\n".join(lines)


def build_app(notebook: Path, url: str) -> FastA2A:
    """
    The A2A application serving this one worker.

    Parameters
    ----------
    notebook : Path
        The notebook to analyse.
    url : str
        The URL the agent card advertises, which is where a client reaches it.

    Returns
    -------
    FastA2A
        The application, ready for uvicorn.
    """
    broker = InMemoryBroker()
    storage = InMemoryStorage()
    worker = NotebookAnalystWorker(broker=broker, storage=storage, notebook=notebook)

    @asynccontextmanager
    async def lifespan(app: FastA2A) -> AsyncIterator[None]:
        # The task manager and the worker start and stop together, as they
        # do in `agent_runtimes.routes.a2a`.
        async with app.task_manager, worker.run():
            yield

    return FastA2A(
        storage=storage,
        broker=broker,
        name="Notebook Analyst",
        url=url,
        version="1.0.0",
        description="Reports what is wrong with a notebook.",
        skills=[
            Skill(
                id=CAPABILITY,
                name="Analyse a notebook",
                description="Read a notebook and report errors, cells that never "
                "ran, and names an earlier cell failed to define.",
                tags=["notebook", "analysis"],
                examples=["Analyse notebook.ipynb and report what is wrong with it."],
            )
        ],
        lifespan=lifespan,
    )
