# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The record of an application, written for every session (LOOP R-07)."""

from typing import Any

import pytest
from pydantic_ai import Agent

from agent_runtimes.loop.apps.guards import (
    AppCheckBlockedError,
    AppChecks,
    AppChecksCapability,
)
from agent_runtimes.loop.apps.record import AppRecordCapability, AppRecorder
from agent_runtimes.tests.test_apps_guards import AWS, scripted
from agent_runtimes.types import AppSpec


def app(include: list[str]) -> AppSpec:
    return AppSpec.model_validate(
        {
            "id": "desk",
            "name": "Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "record": {"keep_for": "90_days", "include": include},
        }
    )


def recorded(spec: AppSpec, *turns: Any, **instance: Any) -> tuple[Agent, list]:
    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    instance = {"deployment_uid": "dep-1", **instance}
    recorder = AppRecorder(app=spec, app_uid="app-1", version=3, send=send, **instance)
    agent: Agent = Agent(
        scripted(*turns),
        capabilities=[
            AppChecksCapability(checks=AppChecks.of(spec), record=recorder.checked),
            AppRecordCapability(recorder=recorder),
        ],
    )

    @agent.tool_plain
    def search(q: str) -> str:
        return f"results for {q}"

    return agent, sent


async def test_a_session_is_sent_with_what_it_did():
    spec = app(["actions", "outputs", "checks"])
    agent, sent = recorded(spec, ("search", {"q": "news"}), "Here is the news.")
    await agent.run("news?")
    assert len(sent) == 1
    body = sent[0]
    assert (
        body["app_uid"],
        body["deployment_uid"],
        body["version"],
        body["keep_days"],
    ) == (
        "app-1",
        "dep-1",
        3,
        90,
    )
    assert [entry["kind"] for entry in body["entries"]] == [
        "session",
        "tool_call",
        "output",
    ]
    assert body["entries"][1]["payload"]["tool"] == "search"
    assert body["entries"][2]["summary"] == "Here is the news."
    # Real use: no purpose named, and a person opened it: nothing woke it.
    assert (body["purpose"], body["launch_uid"]) == ("", "")
    assert body["woken_by"] == {}
    assert "woken_by" not in body["entries"][0]["payload"]


async def test_a_test_session_says_it_is_a_test_and_of_which_launch():
    agent, sent = recorded(
        app(["outputs"]),
        "An answer.",
        deployment_uid="",
        purpose="test",
        launch_uid="launch-1",
    )
    await agent.run("hi")
    body = sent[0]
    assert (body["deployment_uid"], body["version"]) == ("", 3)
    assert (body["purpose"], body["launch_uid"]) == ("test", "launch-1")


async def test_a_session_nobody_opened_says_what_woke_it():
    woken = {"kind": "schedule", "schedule_uid": "sch-1", "cron": "0 9 * * 1"}
    agent, sent = recorded(app(["outputs"]), "The digest.", woken_by=woken)
    await agent.run("Write the Monday digest.")
    body = sent[0]
    assert body["woken_by"] == woken
    opening = body["entries"][0]
    assert opening["kind"] == "session"
    assert opening["summary"] == "A session of Desk started, woken by its schedule"
    assert opening["payload"]["woken_by"] == woken


async def test_only_what_the_application_keeps_is_kept():
    agent, sent = recorded(app([]), ("search", {"q": "news"}), "Here is the news.")
    await agent.run("news?")
    assert [entry["kind"] for entry in sent[0]["entries"]] == ["session"]


async def test_a_stopped_run_is_recorded_with_its_check():
    spec = app(["actions", "outputs", "checks"])
    agent, sent = recorded(spec, ("search", {"q": AWS}), "done")
    with pytest.raises(AppCheckBlockedError):
        await agent.run("search my key")
    kinds = [entry["kind"] for entry in sent[0]["entries"]]
    assert kinds == ["session", "check", "output"]
    assert "AWS access key" in sent[0]["entries"][1]["summary"]
    assert sent[0]["entries"][2]["summary"].startswith("Stopped:")
    # What is recorded withholds what it records.
    assert AWS not in str(sent[0])


async def test_a_record_that_cannot_be_sent_never_fails_the_run():
    async def fail(body: dict) -> None:
        raise ConnectionError("ai-agents is away")

    spec = app(["outputs"])
    recorder = AppRecorder(app=spec, send=fail)
    agent: Agent = Agent(
        scripted("hello"), capabilities=[AppRecordCapability(recorder=recorder)]
    )
    assert (await agent.run("hi")).output == "hello"


async def test_a_client_that_goes_once_it_has_its_answer_leaves_a_record():
    import asyncio

    from pydantic_ai.messages import PartDeltaEvent, PartStartEvent

    spec = app(["outputs"])
    agent, sent = recorded(spec, ["The news ", "is good."])
    async with agent.run_stream_events("news?") as events:
        async for event in events:
            if isinstance(event, (PartStartEvent, PartDeltaEvent)):
                break  # the client has what it came for, and goes
    for _ in range(20):
        if sent:
            break
        await asyncio.sleep(0.05)
    assert [entry["kind"] for entry in sent[0]["entries"]] == ["session", "output"]


async def test_an_ag_ui_client_that_stops_at_run_finished_leaves_a_record():
    """The terminal stops reading at RUN_FINISHED, and stops its runtime."""
    import asyncio

    import httpx

    # AG-UI is the `ui` extra: without it there is no AG-UI client to drill.
    pytest.importorskip("ag_ui")
    from pydantic_ai.ui.ag_ui._adapter import AGUIAdapter
    from starlette.applications import Starlette
    from starlette.routing import Route

    spec = app(["outputs"])
    agent, sent = recorded(spec, ["Python is ", "a language."])

    async def endpoint(request: Any) -> Any:
        return await AGUIAdapter.dispatch_request(request, agent=agent)

    server = Starlette(routes=[Route("/", endpoint, methods=["POST"])])
    body = {
        "threadId": "t-1",
        "runId": "r-1",
        "state": {},
        "messages": [{"id": "m1", "role": "user", "content": "What is Python?"}],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }
    transport = httpx.ASGITransport(app=server)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://runtime"
    ) as client:
        async with client.stream("POST", "/", json=body) as response:
            async for line in response.aiter_lines():
                if "RUN_FINISHED" in line:
                    break
    for _ in range(20):
        if sent:
            break
        await asyncio.sleep(0.05)
    assert [entry["kind"] for entry in sent[0]["entries"]] == ["session", "output"]
    assert sent[0]["session_uid"] == "t-1"
    assert sent[0]["entries"][1]["summary"] == "Python is a language."


async def test_a_stream_whose_closing_raises_still_sends_the_record():
    """Closing an MCP server's stream from another task raises (anyio)."""
    import asyncio
    from types import SimpleNamespace

    from pydantic_ai.messages import FinalResultEvent, PartStartEvent, TextPart

    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    capability = AppRecordCapability(
        recorder=AppRecorder(app=app(["outputs"]), send=send)
    )
    ctx: Any = SimpleNamespace(run_id="r-1", conversation_id="t-1")
    await capability.before_run(ctx)

    class Stream:
        def __init__(self) -> None:
            self.events = iter(
                [
                    FinalResultEvent(tool_name=None, tool_call_id=None),
                    PartStartEvent(index=0, part=TextPart(content="An answer.")),
                ]
            )

        def __aiter__(self) -> "Stream":
            return self

        async def __anext__(self) -> Any:
            try:
                return next(self.events)
            except StopIteration:
                raise StopAsyncIteration from None

        async def aclose(self) -> None:
            raise RuntimeError("Attempted to exit cancel scope in a different task")

    with pytest.raises(RuntimeError):
        async for _ in capability.wrap_run_event_stream(ctx, stream=Stream()):
            pass
    for _ in range(20):
        if sent:
            break
        await asyncio.sleep(0.05)
    assert [entry["summary"] for entry in sent[0]["entries"]][-1] == "An answer."
