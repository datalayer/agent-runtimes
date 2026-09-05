# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Following a task an agent started on the server.

The failures worth testing are the ones a caller cannot detect. A wait that
gave up and returned nothing, which renders as "the tool produced no output".
A failure that came back as an empty result. A client polling a thousand
times a second because a server suggested one millisecond.

Launch the tests:
```
$ pytest agent_runtimes/tests/test_mcp_tasks.py -v
```
"""

from __future__ import annotations

import asyncio

import pytest
from mcp.types import (
    CallToolResult,
    CancelTaskResult,
    CreateTaskResult,
    GetTaskResult,
    ListTasksResult,
    Task,
    TaskStatusNotificationParams,
    TextContent,
)

from agent_runtimes.mcp.tasks import (
    DEFAULT_POLL_SECONDS,
    MIN_POLL_SECONDS,
    TASKS_EXTENSION,
    TaskCancelled,
    TaskFailed,
    TaskHandle,
    TaskTimeout,
    TaskUnsupported,
    TaskWatcher,
    StartedCall,
    await_task,
    call_tool_and_wait,
    call_tool_as_task,
    cancel_task,
    client_extensions,
    durable_call_tool,
    get_task,
    list_tasks,
)


def task(status: str = "working", **overrides) -> Task:
    fields = {
        "task_id": "tsk_1",
        "status": status,
        "created_at": "2026-08-29T10:00:00Z",
        "last_updated_at": "2026-08-29T10:00:00Z",
        "ttl": 900_000,
        "poll_interval": 1000 if status == "working" else None,
    }
    fields.update(overrides)
    return Task(**fields)


def output(text: str = "42") -> CallToolResult:
    return CallToolResult(content=[TextContent(type="text", text=text)])


class Session:
    """A session that answers what it was told to, and records what it was asked.

    Not a mock of `send_request`: the property under test is which request
    this client builds and what it does with each answer, so the fake has to
    see the real request objects.
    """

    def __init__(self, answers: list) -> None:
        self.answers = list(answers)
        self.sent: list = []

    async def send_request(self, request, result_type, **kwargs):
        self.sent.append(request)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    @property
    def methods(self) -> list[str]:
        return [request.method for request in self.sent]


@pytest.fixture(autouse=True)
def instant_sleep(monkeypatch):
    """Waiting for real would make these tests take minutes.

    The *interval chosen* is asserted separately; this only stops the clock
    from being spent.
    """
    slept: list[float] = []

    async def sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", sleep)
    return slept


# ---------------------------------------------------------------------------
# Asking
# ---------------------------------------------------------------------------


class TestAsking:
    @pytest.mark.asyncio
    async def test_a_server_that_makes_a_task_answers_a_handle(self):
        session = Session([CreateTaskResult(task=task())])
        answer = await call_tool_as_task(session, "execute_cell", {"cell_index": 1})
        assert isinstance(answer, TaskHandle)
        assert answer.task_id == "tsk_1" and answer.status == "working"
        assert session.methods == ["tools/call"]

    @pytest.mark.asyncio
    async def test_the_ask_travels_on_the_request(self):
        session = Session([CreateTaskResult(task=task())])
        await call_tool_as_task(session, "execute_cell", {"a": 1}, ttl_ms=60_000)
        params = session.sent[0].params
        assert params.name == "execute_cell" and params.arguments == {"a": 1}
        assert params.task is not None and params.task.ttl == 60_000

    @pytest.mark.asyncio
    async def test_a_server_that_ignores_the_ask_still_answers_the_tool(self):
        """Asking for a task is a hint, not a demand.

        Turning a synchronous answer into an error would make task support a
        hard dependency of calling a tool at all.
        """
        session = Session([output("done")])
        answer = await call_tool_as_task(session, "execute_cell")
        assert isinstance(answer, CallToolResult)
        assert answer.content[0].text == "done"

    def test_the_client_declares_the_extension(self):
        """A server should only answer `CreateTaskResult` to a client that
        will understand it rather than read it as the tool's output."""
        assert client_extensions() == {TASKS_EXTENSION: {}}


# ---------------------------------------------------------------------------
# Waiting
# ---------------------------------------------------------------------------


class TestWaiting:
    @pytest.mark.asyncio
    async def test_a_wait_polls_until_the_task_is_done_and_then_asks_for_it(self):
        session = Session(
            [
                GetTaskResult(**task("working").model_dump()),
                GetTaskResult(**task("working").model_dump()),
                GetTaskResult(**task("completed").model_dump()),
                output("42"),
            ]
        )
        answer = await await_task(session, "tsk_1")
        assert answer.content[0].text == "42"
        assert session.methods == ["tasks/get", "tasks/get", "tasks/get", "tasks/result"]

    @pytest.mark.asyncio
    async def test_a_task_already_finished_is_not_polled_again(self):
        session = Session([GetTaskResult(**task("completed").model_dump()), output()])
        await await_task(session, "tsk_1")
        assert session.methods == ["tasks/get", "tasks/result"]

    @pytest.mark.asyncio
    async def test_the_wait_polls_at_the_interval_the_server_asked_for(self, instant_sleep):
        """The interval is the server saying how much polling it can afford.

        A client that picks its own is answering a question it was not asked.
        """
        session = Session(
            [
                GetTaskResult(**task("working", poll_interval=5000).model_dump()),
                GetTaskResult(**task("completed").model_dump()),
                output(),
            ]
        )
        await await_task(session, "tsk_1")
        assert instant_sleep == [5.0]

    @pytest.mark.asyncio
    async def test_a_server_suggesting_a_millisecond_does_not_get_hammered(
        self, instant_sleep
    ):
        """A thousand requests a second looks, from the server, exactly like
        an attack."""
        session = Session(
            [
                GetTaskResult(**task("working", poll_interval=1).model_dump()),
                GetTaskResult(**task("completed").model_dump()),
                output(),
            ]
        )
        await await_task(session, "tsk_1")
        assert instant_sleep == [MIN_POLL_SECONDS]

    @pytest.mark.asyncio
    async def test_a_server_suggesting_nothing_gets_the_default(self, instant_sleep):
        session = Session(
            [
                GetTaskResult(**task("working", poll_interval=None).model_dump()),
                GetTaskResult(**task("completed").model_dump()),
                output(),
            ]
        )
        await await_task(session, "tsk_1")
        assert instant_sleep == [DEFAULT_POLL_SECONDS]


# ---------------------------------------------------------------------------
# Every unhappy ending raises
# ---------------------------------------------------------------------------


class TestEndings:
    @pytest.mark.asyncio
    async def test_a_failed_task_raises_with_the_servers_message(self):
        """Returning an empty result here renders as "the tool produced
        nothing" for work that broke."""
        session = Session(
            [GetTaskResult(**task("failed", status_message="the kernel is dead").model_dump())]
        )
        with pytest.raises(TaskFailed) as raised:
            await await_task(session, "tsk_1")
        assert "the kernel is dead" in str(raised.value)
        assert raised.value.task_id == "tsk_1"
        # And it did not go on to ask for a result that does not exist.
        assert session.methods == ["tasks/get"]

    @pytest.mark.asyncio
    async def test_a_cancelled_task_raises_something_else(self):
        """"You cancelled this" and "this broke" are different things to tell
        a person, and a caller that retries on failure must not retry here."""
        session = Session([GetTaskResult(**task("cancelled").model_dump())])
        with pytest.raises(TaskCancelled):
            await await_task(session, "tsk_1")

    @pytest.mark.asyncio
    async def test_a_cancelled_task_is_not_caught_as_a_failure(self):
        session = Session([GetTaskResult(**task("cancelled").model_dump())])
        with pytest.raises(TaskCancelled) as raised:
            await await_task(session, "tsk_1")
        assert not isinstance(raised.value, TaskFailed)

    @pytest.mark.asyncio
    async def test_a_wait_that_gives_up_raises_rather_than_answering_nothing(self):
        """A wait that returned `None` is indistinguishable from a tool that
        produced nothing, and the caller renders "no output" for work that is
        still running."""
        moments = iter([0.0, 0.0, 100.0, 200.0, 300.0])
        session = Session([GetTaskResult(**task("working").model_dump())] * 5)
        with pytest.raises(TaskTimeout) as raised:
            await await_task(session, "tsk_1", deadline_seconds=10, now=lambda: next(moments))
        assert raised.value.task_id == "tsk_1"
        # The message has to stop somebody from starting the work again.
        assert "still running" in str(raised.value)


# ---------------------------------------------------------------------------
# The notification
# ---------------------------------------------------------------------------


class TestTheWatcher:
    @pytest.mark.asyncio
    async def test_a_notification_wakes_the_wait_early(self):
        watcher = TaskWatcher()
        session = Session(
            [
                GetTaskResult(**task("working").model_dump()),
                GetTaskResult(**task("completed").model_dump()),
                output(),
            ]
        )
        await watcher.on_status(
            TaskStatusNotificationParams(**task("completed").model_dump())
        )
        answer = await await_task(session, "tsk_1", watcher=watcher)
        assert answer is not None

    @pytest.mark.asyncio
    async def test_a_dropped_notification_costs_one_interval_and_not_the_answer(self):
        """Polling is the ground truth. A client that treated the
        notification as the mechanism would hang the first time one was
        dropped."""
        watcher = TaskWatcher()
        session = Session(
            [
                GetTaskResult(**task("working").model_dump()),
                GetTaskResult(**task("completed").model_dump()),
                output("42"),
            ]
        )
        answer = await await_task(session, "tsk_1", watcher=watcher)
        assert answer.content[0].text == "42"

    @pytest.mark.asyncio
    async def test_the_watcher_remembers_the_last_status_it_saw(self):
        watcher = TaskWatcher()
        await watcher.on_status(TaskStatusNotificationParams(**task("failed").model_dump()))
        assert watcher.last_seen("tsk_1").status == "failed"
        assert watcher.last_seen("tsk_missing") is None

    @pytest.mark.asyncio
    async def test_a_notification_without_a_task_id_is_ignored(self):
        watcher = TaskWatcher()
        await watcher.on_status(TaskStatusNotificationParams(**task(task_id="").model_dump()))
        assert watcher.last_seen("") is None


# ---------------------------------------------------------------------------
# The other methods
# ---------------------------------------------------------------------------


class TestTheOtherMethods:
    @pytest.mark.asyncio
    async def test_get_asks_tasks_get(self):
        session = Session([GetTaskResult(**task("working").model_dump())])
        handle = await get_task(session, "tsk_1")
        assert session.methods == ["tasks/get"] and handle.status == "working"

    @pytest.mark.asyncio
    async def test_cancel_asks_tasks_cancel_and_answers_the_task(self):
        session = Session([CancelTaskResult(**task("cancelled").model_dump())])
        handle = await cancel_task(session, "tsk_1")
        assert session.methods == ["tasks/cancel"] and handle.status == "cancelled"

    @pytest.mark.asyncio
    async def test_list_answers_handles(self):
        session = Session([ListTasksResult(tasks=[task("working"), task("completed")])])
        listed = await list_tasks(session)
        assert [handle.status for handle in listed] == ["working", "completed"]


# ---------------------------------------------------------------------------
# The one-call form
# ---------------------------------------------------------------------------


class TestCallAndWait:
    @pytest.mark.asyncio
    async def test_it_follows_a_task_through_to_the_answer(self):
        session = Session(
            [
                CreateTaskResult(task=task("working")),
                GetTaskResult(**task("completed").model_dump()),
                output("42"),
            ]
        )
        answer = await call_tool_and_wait(session, "execute_cell")
        assert answer.content[0].text == "42"
        assert session.methods == ["tools/call", "tasks/get", "tasks/result"]

    @pytest.mark.asyncio
    async def test_a_synchronous_server_needs_no_special_handling_by_the_caller(self):
        session = Session([output("done")])
        answer = await call_tool_and_wait(session, "execute_cell")
        assert answer.content[0].text == "done"
        assert session.methods == ["tools/call"]


# ---------------------------------------------------------------------------
# Inside a durable workflow
# ---------------------------------------------------------------------------


class Journal:
    """A workflow engine's recorded steps, replayed the way DBOS replays them.

    `run()` executes; `replay()` hands back what was recorded and refuses to
    execute anything — which is what makes "this step ran twice" a failure
    here rather than a second sandbox in production.
    """

    def __init__(self) -> None:
        self.entries: dict[str, object] = {}
        self.executed: list[str] = []
        self.replaying = False

    async def __call__(self, key: str, factory):
        if key in self.entries:
            return self.entries[key]
        if self.replaying:
            raise AssertionError(f"step {key!r} ran during a replay")
        self.executed.append(key)
        self.entries[key] = await factory()
        return self.entries[key]


class TestInsideADurableWorkflow:
    @pytest.mark.asyncio
    async def test_it_starts_the_task_and_waits_for_it(self):
        journal = Journal()
        session = Session(
            [
                CreateTaskResult(task=task("working")),
                GetTaskResult(**task("completed").model_dump()),
                output("42"),
            ]
        )
        answer = await durable_call_tool(session, "execute_cell", record=journal)
        assert answer.content[0].text == "42"
        assert journal.executed == ["mcp:execute_cell:start", "mcp:execute_cell:await"]

    @pytest.mark.asyncio
    async def test_a_replay_does_not_call_the_tool_a_second_time(self):
        """The property this function exists for.

        A workflow replays because the worker running it was replaced, which
        is the ordinary thing for a durable workflow to survive. Calling
        `tools/call` again would launch a second sandbox, execute the cell
        twice and bill for both, with nothing to say it happened.
        """
        journal = Journal()
        session = Session(
            [
                CreateTaskResult(task=task("working")),
                GetTaskResult(**task("completed").model_dump()),
                output("42"),
            ]
        )
        await durable_call_tool(session, "execute_cell", record=journal)
        calls_first_time = list(session.methods)

        journal.replaying = True
        session.answers = []  # anything sent now is a bug, not a slow test
        answer = await durable_call_tool(session, "execute_cell", record=journal)

        assert answer.content[0].text == "42"
        assert session.methods == calls_first_time, "the replay reached the server"

    @pytest.mark.asyncio
    async def test_a_replay_after_the_start_but_before_the_wait_follows_the_same_task(self):
        """The crash a durable workflow is actually for: the worker died
        while the cell was running. The task id is recorded, so the second
        worker follows the work rather than starting it again."""
        journal = Journal()
        session = Session([CreateTaskResult(task=task("working"))])

        async def start_only(key, factory):
            return await journal(key, factory)

        await start_only("mcp:execute_cell:start", lambda: _start_of(session))

        session.answers = [GetTaskResult(**task("completed").model_dump()), output("42")]
        answer = await durable_call_tool(session, "execute_cell", record=journal)
        assert answer.content[0].text == "42"
        # One `tools/call`, from before the crash.
        assert session.methods.count("tools/call") == 1

    @pytest.mark.asyncio
    async def test_a_synchronous_server_records_the_answer_and_never_replays_the_call(self):
        journal = Journal()
        session = Session([output("done")])
        answer = await durable_call_tool(session, "execute_cell", record=journal)
        assert answer.content[0].text == "done"
        assert journal.executed == ["mcp:execute_cell:start"]

        journal.replaying = True
        session.answers = []
        again = await durable_call_tool(session, "execute_cell", record=journal)
        assert again.content[0].text == "done"

    @pytest.mark.asyncio
    async def test_two_calls_in_one_workflow_do_not_share_a_step(self):
        """Without distinct keys the second call would replay the first's
        answer, which is a cell that never ran reported as having run."""
        journal = Journal()
        session = Session(
            [
                CreateTaskResult(task=task("working", task_id="tsk_a")),
                GetTaskResult(**task("completed", task_id="tsk_a").model_dump()),
                output("a"),
                CreateTaskResult(task=task("working", task_id="tsk_b")),
                GetTaskResult(**task("completed", task_id="tsk_b").model_dump()),
                output("b"),
            ]
        )
        first = await durable_call_tool(session, "execute_cell", record=journal, key="cell-1")
        second = await durable_call_tool(session, "execute_cell", record=journal, key="cell-2")
        assert (first.content[0].text, second.content[0].text) == ("a", "b")

    @pytest.mark.asyncio
    async def test_a_failed_task_still_raises_inside_a_workflow(self):
        journal = Journal()
        session = Session(
            [
                CreateTaskResult(task=task("working")),
                GetTaskResult(**task("failed", status_message="the kernel is dead").model_dump()),
            ]
        )
        with pytest.raises(TaskFailed):
            await durable_call_tool(session, "execute_cell", record=journal)

    @pytest.mark.asyncio
    async def test_an_unusable_recorded_start_is_refused_rather_than_retried(self):
        """A recorded step with neither an id nor a result cannot be replayed
        into anything; retrying it would call the tool again."""
        journal = Journal()
        journal.entries["mcp:execute_cell:start"] = {"task_id": "", "result": None}
        journal.replaying = True
        with pytest.raises(TaskUnsupported):
            await durable_call_tool(Session([]), "execute_cell", record=journal)


async def _start_of(session):
    answer = await call_tool_as_task(session, "execute_cell", None)
    return StartedCall(task_id=answer.task_id).to_record()


# ---------------------------------------------------------------------------
# The handle
# ---------------------------------------------------------------------------


def test_terminal_is_the_three_that_end():
    for status in ("completed", "failed", "cancelled"):
        assert TaskHandle(task_id="t", status=status).is_terminal
    for status in ("working", "input_required"):
        assert not TaskHandle(task_id="t", status=status).is_terminal
