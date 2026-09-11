# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
A2A tasks that outlive the runtime (ORCHESTRATOR.md, O1-11).

``fasta2a`` keeps tasks in a dictionary and hands work to the worker through
an in-process stream. A runtime that restarted therefore answered
``tasks/get`` for a task it had issued with nothing, and the task it had been
running was neither finished nor failed: it was gone, and the control plane
could only retry it as a new attempt. Here the task, its conversation context
and the work still owed are records of the runtime's protocol state store.

The stream between the server and its worker stays in-process — a runtime
has one worker — and a broker made at startup first hands the worker every
task that was submitted or working when the previous process stopped, so the
work a client was promised is done by the process that replaced it.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator
from datetime import datetime
from typing import Any

from fasta2a.broker import InMemoryBroker, TaskOperation, _RunTask
from fasta2a.schema import (
    Artifact,
    Message,
    Task,
    TaskSendParams,
    TaskState,
    TaskStatus,
)
from fasta2a.storage import Storage
from opentelemetry.trace import get_current_span

from .store import ProtocolStateStore

logger = logging.getLogger(__name__)

#: The kinds of record kept here.
TASK = "a2a.task"
CONTEXT = "a2a.context"
OWED = "a2a.owed"

#: The states in which a task is still owed its run.
UNFINISHED = frozenset({"submitted", "working"})


def _key(scope: str, identifier: str) -> str:
    return f"{scope}/{identifier}"


class DurableStorage(Storage[Any]):
    """
    fasta2a's storage, kept in the protocol state store under one agent.

    Parameters
    ----------
    store : ProtocolStateStore
        Where the records are kept.
    scope : str
        The agent whose tasks these are: two agents of one runtime never read
        each other's tasks.
    """

    def __init__(self, store: ProtocolStateStore, scope: str) -> None:
        self._store = store
        self._scope = scope

    async def load_task(
        self, task_id: str, history_length: int | None = None
    ) -> Task | None:
        task = await self._store.get(TASK, _key(self._scope, task_id))
        if task is None:
            return None
        if history_length and "history" in task:
            task["history"] = task["history"][-history_length:]
        return task  # type: ignore[return-value]

    async def submit_task(self, context_id: str, message: Message) -> Task:
        task_id = str(uuid.uuid4())
        message["task_id"] = task_id
        message["context_id"] = context_id
        task = Task(
            id=task_id,
            context_id=context_id,
            status=TaskStatus(state="submitted", timestamp=datetime.now().isoformat()),
            history=[message],
        )
        await self._store.put(TASK, _key(self._scope, task_id), dict(task))
        return task

    async def update_task(
        self,
        task_id: str,
        state: TaskState,
        new_artifacts: list[Artifact] | None = None,
        new_messages: list[Message] | None = None,
    ) -> Task:
        key = _key(self._scope, task_id)
        task: Any = await self._store.get(TASK, key)
        if task is None:
            raise KeyError(f"Task {task_id} not found")
        task["status"] = TaskStatus(state=state, timestamp=datetime.now().isoformat())
        if new_artifacts:
            task.setdefault("artifacts", []).extend(new_artifacts)
        if new_messages:
            for message in new_messages:
                message["task_id"] = task_id
                message["context_id"] = task["context_id"]
                task.setdefault("history", []).append(message)
        await self._store.put(TASK, key, task)
        if state not in UNFINISHED:
            # Finished, failed, cancelled, or waiting on the client: nothing is
            # owed any more, and a restart must not run it again.
            await self._store.delete(OWED, key)
        return task  # type: ignore[no-any-return]

    async def load_context(self, context_id: str) -> Any | None:
        record = await self._store.get(CONTEXT, _key(self._scope, context_id))
        return None if record is None else record.get("context")

    async def update_context(self, context_id: str, context: Any) -> None:
        await self._store.put(
            CONTEXT, _key(self._scope, context_id), {"context": context}
        )


class DurableBroker(InMemoryBroker):
    """
    fasta2a's in-process broker, which remembers the work it still owes.

    Every run it is given is written down before the worker is told, and
    written off when the task stops being unfinished. What was owed when the
    broker is entered — read before the server takes any request, so nothing a
    new request owes is handed over twice — is what the worker receives first.

    Parameters
    ----------
    store : ProtocolStateStore
        Where the owed runs are kept.
    scope : str
        The agent whose work this is.
    """

    def __init__(self, store: ProtocolStateStore, scope: str) -> None:
        super().__init__()
        self._store = store
        self._scope = scope
        self._owed_at_start: list[TaskSendParams] = []

    async def __aenter__(self) -> "DurableBroker":
        await super().__aenter__()
        self._owed_at_start = await self._owed()
        if self._owed_at_start:
            logger.info(
                "A2A agent %s was owed %d unfinished task(s) by the previous process; running them again",
                self._scope,
                len(self._owed_at_start),
            )
        return self

    async def run_task(self, params: TaskSendParams) -> None:
        await self._store.put(OWED, _key(self._scope, params["id"]), dict(params))
        await super().run_task(params)

    async def receive_task_operations(self) -> AsyncIterator[TaskOperation]:
        owed, self._owed_at_start = self._owed_at_start, []
        for params in owed:
            yield _RunTask(operation="run", params=params, _current_span=get_current_span())
        async for operation in super().receive_task_operations():
            yield operation

    async def _owed(self) -> list[TaskSendParams]:
        """The runs still owed, writing off those whose task no longer needs one."""
        owed: list[TaskSendParams] = []
        for params in await self._store.list(OWED, prefix=f"{self._scope}/"):
            key = _key(self._scope, str(params["id"]))
            task = await self._store.get(TASK, key)
            if task is None or task["status"]["state"] not in UNFINISHED:
                await self._store.delete(OWED, key)
                continue
            owed.append(params)  # type: ignore[arg-type]
        return owed
