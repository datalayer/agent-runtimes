# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Asking for work that outlives the request, and following it.

The server side of this is `jupyter_mcp_server.tasks`. This is the half an
agent needs: ask for a `tools/call` to become a task, get an id back at once,
and pick the answer up later — after a reconnect, from another process, or
from a workflow step that resumed on a different worker.

Three positions worth stating, because each is a place where the obvious
implementation is wrong.

**A server that ignores the ask still works.** Asking for a task is a hint,
not a demand: a server that does not do tasks answers the tool normally, and
this returns that answer rather than inventing a task around it. Anything
else would make task support a hard dependency of calling a tool at all.

**Polling is the ground truth; the notification is an optimisation.** The
server sends `notifications/tasks/status` when it can and says so is best
effort. So the wait polls at the interval the *server* asked for, and a
notification only wakes it early. A client that treated the notification as
the mechanism would hang forever the first time one was dropped.

**A deadline raises.** A wait that gives up and returns `None` is
indistinguishable from a tool that produced nothing, and the caller will
render "no output" for work that is still running.

@module agent_runtimes.mcp.tasks
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from mcp.types import (
    CallToolRequest,
    CallToolRequestParams,
    CallToolResult,
    CancelTaskRequest,
    CancelTaskRequestParams,
    CancelTaskResult,
    CreateTaskResult,
    GetTaskPayloadRequest,
    GetTaskPayloadRequestParams,
    GetTaskRequest,
    GetTaskRequestParams,
    GetTaskResult,
    ListTasksRequest,
    ListTasksResult,
    PaginatedRequestParams,
    TaskStatusNotificationParams,
)

logger = logging.getLogger(__name__)

#: The extension the Datalayer server advertises. Declared by this client so
#: the server knows `CreateTaskResult` will be understood rather than read as
#: a tool's output by something that has never heard of a task.
TASKS_EXTENSION = "io.datalayer/tasks"

#: The statuses from which nothing more happens.
TERMINAL_STATUSES = frozenset({"completed", "failed", "cancelled"})

#: How often to ask when the server suggests nothing.
DEFAULT_POLL_SECONDS = 1.0

#: The fastest this will ever poll, whatever a server suggests. A server
#: answering `pollInterval: 1` would otherwise have this client asking a
#: thousand times a second — a self-inflicted denial of service that looks,
#: from the server, exactly like an attack.
MIN_POLL_SECONDS = 0.2

#: How long a wait runs before giving up. Not the task's lifetime — the task
#: keeps going, and the id is still good; this is only how long *this* call
#: is willing to sit there.
DEFAULT_DEADLINE_SECONDS = 3600.0


class TaskError(RuntimeError):
    """A task did not produce a result."""

    def __init__(self, task_id: str, message: str) -> None:
        super().__init__(message)
        self.task_id = task_id


class TaskFailed(TaskError):
    """The work failed. The message is the server's."""


class TaskCancelled(TaskError):
    """The work was cancelled. Distinct from failure on purpose.

    "You cancelled this" and "this broke" are different things to tell a
    person, and a caller that retries on failure must not retry on a cancel.
    """


class TaskTimeout(TaskError):
    """This wait gave up. The task itself is very likely still running.

    Carries the id, because the answer to this is to ask again later rather
    than to start the work a second time.
    """


class TaskUnsupported(TaskError):
    """The server has no such task, or does not serve `tasks/*` at all."""


@dataclass(frozen=True)
class TaskHandle:
    """A task the server created, as this client last saw it."""

    task_id: str
    status: str
    poll_interval_ms: int | None = None
    ttl_ms: int | None = None
    status_message: str | None = None

    @property
    def is_terminal(self) -> bool:
        return self.status in TERMINAL_STATUSES

    @property
    def poll_seconds(self) -> float:
        """How long to wait before asking again.

        The server's suggestion, floored. Honouring it matters: the interval
        is the server telling this client how much polling it can afford, and
        a client that picks its own is answering a question it was not asked.
        """
        if not self.poll_interval_ms:
            return DEFAULT_POLL_SECONDS
        return max(MIN_POLL_SECONDS, self.poll_interval_ms / 1000)


def _handle_of(task: Any) -> TaskHandle:
    return TaskHandle(
        task_id=str(getattr(task, "task_id", "")),
        status=str(getattr(task, "status", "working")),
        poll_interval_ms=getattr(task, "poll_interval", None),
        ttl_ms=getattr(task, "ttl", None),
        status_message=getattr(task, "status_message", None),
    )


def client_extensions() -> dict[str, dict[str, Any]]:
    """What to pass as `ClientSession(extensions=...)`.

    Declaring it is not decoration. A server that knows the client
    understands tasks may answer `CreateTaskResult`; one that does not know
    should not, because a client that has never heard of a task would read
    that object as the tool's output.
    """
    return {TASKS_EXTENSION: {}}


async def call_tool_as_task(
    session: Any,
    name: str,
    arguments: dict[str, Any] | None = None,
    *,
    ttl_ms: int | None = None,
) -> TaskHandle | CallToolResult:
    """Ask for this call to become a task.

    Answers a :class:`TaskHandle` when the server made one, and the ordinary
    `CallToolResult` when it did not — a server without task support answers
    the tool, and turning that into an error would make tasks a hard
    dependency of calling a tool.
    """
    params = CallToolRequestParams(name=name, arguments=arguments or {})
    # Set through the model rather than the constructor so this keeps working
    # if `task` moves to a `_meta` key: one place to change.
    params.task = _task_metadata(ttl_ms)
    answer = await session.send_request(
        CallToolRequest(params=params),
        # The union, because which one comes back is the server's decision
        # and both are legitimate answers to this request.
        CreateTaskResult | CallToolResult,  # type: ignore[arg-type]
    )
    if isinstance(answer, CreateTaskResult):
        return _handle_of(answer.task)
    return answer


def _task_metadata(ttl_ms: int | None) -> Any:
    from mcp.types import TaskMetadata  # noqa: PLC0415

    return TaskMetadata(ttl=ttl_ms)


async def get_task(session: Any, task_id: str) -> TaskHandle:
    """One task's status."""
    answer = await session.send_request(
        GetTaskRequest(params=GetTaskRequestParams(task_id=task_id)), GetTaskResult
    )
    return _handle_of(answer)


async def list_tasks(session: Any, *, cursor: str | None = None) -> list[TaskHandle]:
    """The tasks the server holds for this client."""
    answer = await session.send_request(
        ListTasksRequest(params=PaginatedRequestParams(cursor=cursor)), ListTasksResult
    )
    return [_handle_of(task) for task in answer.tasks]


async def cancel_task(session: Any, task_id: str) -> TaskHandle:
    """Stop a task. Idempotent: a finished one is answered as it is."""
    answer = await session.send_request(
        CancelTaskRequest(params=CancelTaskRequestParams(task_id=task_id)), CancelTaskResult
    )
    return _handle_of(answer)


async def task_result(session: Any, task_id: str) -> CallToolResult:
    """The output of a finished task.

    Validated into `CallToolResult` rather than `GetTaskPayloadResult`: the
    payload *is* the original request's result, arriving as extra wire fields
    that `GetTaskPayloadResult` does not retain.
    """
    return await session.send_request(
        GetTaskPayloadRequest(params=GetTaskPayloadRequestParams(task_id=task_id)),
        CallToolResult,
    )


class TaskWatcher:
    """Wakes a wait when the server says a task changed.

    Bind it with `NotificationBinding(method="notifications/tasks/status",
    params_type=TaskStatusNotificationParams, handler=watcher.on_status)`.

    An optimisation and never a requirement: every wait still polls, so a
    dropped notification costs one interval rather than the whole answer.
    """

    def __init__(self) -> None:
        self._events: dict[str, asyncio.Event] = {}
        self._last: dict[str, TaskHandle] = {}

    async def on_status(self, params: TaskStatusNotificationParams) -> None:
        handle = _handle_of(params)
        if not handle.task_id:
            return
        self._last[handle.task_id] = handle
        self._events.setdefault(handle.task_id, asyncio.Event()).set()

    def last_seen(self, task_id: str) -> TaskHandle | None:
        return self._last.get(task_id)

    async def wait_for_change(self, task_id: str, timeout: float) -> None:
        """Return when the task changed, or when `timeout` elapses.

        Never raises on the timeout: the caller polls next, which is the
        point — this only decides whether it polls now or in a moment.
        """
        event = self._events.setdefault(task_id, asyncio.Event())
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except (asyncio.TimeoutError, TimeoutError):
            return
        finally:
            event.clear()


async def await_task(
    session: Any,
    task_id: str,
    *,
    deadline_seconds: float = DEFAULT_DEADLINE_SECONDS,
    watcher: TaskWatcher | None = None,
    on_status: Optional[Callable[[TaskHandle], Awaitable[None] | None]] = None,
    #: The clock, for the tests. The running loop's by default, because a
    #: deadline measured on the wall clock moves when NTP does.
    now: Optional[Callable[[], float]] = None,
) -> CallToolResult:
    """Wait for a task and answer what it produced.

    Raises rather than returning anything falsy on every unhappy ending:
    `TaskFailed` with the server's message, `TaskCancelled` for a cancel, and
    `TaskTimeout` when *this wait* gave up — the task is very likely still
    running, and the id is still good.
    """
    clock = now or asyncio.get_running_loop().time
    started = clock()
    handle = await get_task(session, task_id)
    while True:
        if on_status is not None:
            outcome = on_status(handle)
            if hasattr(outcome, "__await__"):
                await outcome
        if handle.is_terminal:
            break
        if clock() - started >= deadline_seconds:
            raise TaskTimeout(
                task_id,
                f"Task {task_id} was still {handle.status} after "
                f"{deadline_seconds:g}s. It is probably still running — ask "
                f"for it again rather than starting the work a second time.",
            )
        pause = handle.poll_seconds
        if watcher is not None:
            await watcher.wait_for_change(task_id, pause)
        else:
            await asyncio.sleep(pause)
        handle = await get_task(session, task_id)

    if handle.status == "failed":
        raise TaskFailed(task_id, handle.status_message or f"Task {task_id} failed")
    if handle.status == "cancelled":
        raise TaskCancelled(task_id, handle.status_message or f"Task {task_id} was cancelled")
    return await task_result(session, task_id)


async def call_tool_and_wait(
    session: Any,
    name: str,
    arguments: dict[str, Any] | None = None,
    *,
    ttl_ms: int | None = None,
    deadline_seconds: float = DEFAULT_DEADLINE_SECONDS,
    watcher: TaskWatcher | None = None,
) -> CallToolResult:
    """Call a tool as a task and wait for it, in one call.

    For a caller that wants a long call to survive a *transport* hiccup
    without restructuring around task ids. A server that does not do tasks
    answers synchronously and this returns that, so the caller does not have
    to know which happened.
    """
    answer = await call_tool_as_task(session, name, arguments, ttl_ms=ttl_ms)
    if isinstance(answer, CallToolResult):
        return answer
    return await await_task(
        session, answer.task_id, deadline_seconds=deadline_seconds, watcher=watcher
    )


# ---------------------------------------------------------------------------
# Awaiting a task from inside a durable workflow
# ---------------------------------------------------------------------------


@dataclass
class StartedCall:
    """What starting a call produced: a task to follow, or the answer itself."""

    task_id: str = ""
    #: Set when the server answered synchronously, so there is no task.
    result: dict[str, Any] | None = None

    def to_record(self) -> dict[str, Any]:
        """The plain shape a workflow engine can store and hand back."""
        return {"task_id": self.task_id, "result": self.result}

    @classmethod
    def from_record(cls, stored: dict[str, Any]) -> "StartedCall":
        return cls(task_id=str(stored.get("task_id") or ""), result=stored.get("result"))


#: What a workflow engine gives this module: run `factory` and remember the
#: answer under `key`, or — on a replay — hand back what was remembered
#: without running anything. `DBOS.step` is one; a dict is another.
Recorder = Callable[[str, Callable[[], Awaitable[Any]]], Awaitable[Any]]


async def durable_call_tool(
    session: Any,
    name: str,
    arguments: dict[str, Any] | None = None,
    *,
    record: Recorder,
    ttl_ms: int | None = None,
    deadline_seconds: float = DEFAULT_DEADLINE_SECONDS,
    watcher: TaskWatcher | None = None,
    key: str = "",
) -> CallToolResult:
    """Call a tool from a durable workflow, and wait for it, replay-safe.

    The whole point of this function is where the recorded boundary falls.

    **Starting is recorded and must never repeat.** A workflow that replays —
    because the worker running it was replaced, which is the ordinary thing
    for a durable workflow to survive — must not send `tools/call` a second
    time. That would launch a second sandbox, execute a cell twice, and bill
    for both, with nothing to say it happened. So the start is one recorded
    step whose value is the task id, and a replay reads the id.

    **Waiting is recorded but safe to repeat.** Polling reads; re-running the
    wait after a crash costs a few requests and converges on the same answer.
    Recording it means a replay after the work finished returns the result
    without waiting again.

    So the durable workflow *follows* the work rather than owning it. The
    server is running the task; this workflow holds an id and asks. That is
    what makes a ten-minute cell survive the worker that started it.
    """
    prefix = key or f"mcp:{name}"

    async def start() -> dict[str, Any]:
        answer = await call_tool_as_task(session, name, arguments, ttl_ms=ttl_ms)
        if isinstance(answer, CallToolResult):
            return StartedCall(result=answer.model_dump(mode="json")).to_record()
        return StartedCall(task_id=answer.task_id).to_record()

    started = StartedCall.from_record(await record(f"{prefix}:start", start))
    if started.result is not None:
        # The server answered synchronously. Nothing to follow, and the
        # answer is already recorded — a replay will not call the tool again.
        return CallToolResult.model_validate(started.result)
    if not started.task_id:
        raise TaskUnsupported(
            "",
            f"Starting {name!r} as a task produced neither a task id nor a "
            f"result; the recorded step is unusable and the workflow cannot "
            f"safely retry it",
        )

    async def finish() -> dict[str, Any]:
        answer = await await_task(
            session,
            started.task_id,
            deadline_seconds=deadline_seconds,
            watcher=watcher,
        )
        return answer.model_dump(mode="json")

    return CallToolResult.model_validate(await record(f"{prefix}:await", finish))
