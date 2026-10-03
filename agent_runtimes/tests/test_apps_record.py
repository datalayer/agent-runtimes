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


def recorded(spec: AppSpec, *turns: Any) -> tuple[Agent, list]:
    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    recorder = AppRecorder(
        app=spec, app_uid="app-1", deployment_uid="dep-1", version=3, send=send
    )
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
