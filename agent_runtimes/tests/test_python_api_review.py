# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The Python API as its review asked for it (REVIEWS P-11, 28 October 2026).

A reviewer who did not design the API built three applications from the
reference alone and wrote back the names to change. Each is held here: the
package is ``agent_runtimes.apps``; ``AppRecorder`` is exported and the
record is kept in memory unless a recorder is given; ``app.record(include=…)``
is a plain call, and ``from_spec`` validates when the host reads the spec;
``@app.schedule`` is refused at the decorator on anything but a worker, and
names its schedule; ``host.tick(name)`` runs a tick, in a new session or an
open one; ``app.rule(says, …)``; a session's one word is ``uid``, a press is
``host.press``, the opener ``opened_by``; a rule's question names the tool
and its arguments; ``MemoryChannel.steps``; every kind the record keeps is
under one of the Appspec's ``record.include`` words.
"""

from __future__ import annotations

import importlib

import pytest
from pydantic_ai import Agent

from agent_runtimes.apps import (
    AppHost,
    Application,
    AppRecorder,
    AppRuleBlockedError,
    ChoiceQuestion,
    MemoryChannel,
    Session,
)
from agent_runtimes.apps.record import INCLUDED_BY
from agent_runtimes.tests.test_apps_guards import scripted


def desk() -> Application:
    app = Application(id="reply-desk", kind="chat", agent="example-blank:0.0.1")
    app.rule("send a reply", applies_to="send", behaviour="ask_first")
    app.record(include=["decisions", "outputs"])

    @app.tool(does="send")
    def send_reply(to: str, text: str) -> str:
        """Send a reply."""
        return f"Sent to {to}."

    return app


def test_the_package_is_agent_runtimes_apps_and_the_old_path_is_gone():
    assert Application.__module__ == "agent_runtimes.apps.application"
    assert Session.__module__ == "agent_runtimes.apps.session"
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("agent_runtimes.loop.apps")


@pytest.mark.asyncio
async def test_the_record_is_kept_in_memory_unless_a_recorder_is_given():
    app = desk()

    @app.message
    async def reply(session: Session, text: str) -> None:
        await session.record({"text": text}, summary="kept")

    host = AppHost(app, MemoryChannel(), agent=lambda spec: Agent(scripted("Done.")))
    assert isinstance(host.recorder, AppRecorder) and host.recorder.sent == []
    session = await host.open(opened_by="ada")
    await host.message(session, "hello")
    [output] = [e for e in host.recorder.entries if e["kind"] == "output"]
    assert output["session_uid"] == session.uid and output["opened_by"] == "ada"
    # A recorder given sends; it keeps nothing in memory.
    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    given = AppHost(
        app,
        MemoryChannel(),
        agent=lambda spec: Agent(scripted("Done.")),
        recorder=AppRecorder(app=app.spec, send=send),
    )
    await given.message(await given.open(), "hello")
    assert sent and given.recorder.entries == [] and given.recorder.sent is None


def test_record_is_a_plain_call_and_from_spec_validates_when_the_spec_is_read():
    app = Application(
        id="digest", kind="worker", agent="example-blank:0.0.1", goal="A digest"
    )
    assert app.record(include=["outputs"], keep_for="90_days") == {
        "include": ["outputs"],
        "keep_for": "90_days",
    }

    @app.schedule("0 9 * * *")
    async def digest(session: Session) -> None:
        pass

    assert (
        app.spec.record.include == ["outputs"] and app.spec.record.keep_for == "90_days"
    )
    # A worker read from a spec without triggers is not refused at `from_spec`:
    # the schedule the code adds comes after, and the host reads the spec then.
    without = {k: v for k, v in app.document.items() if k != "triggers"}
    bare = Application.from_spec(without)

    @bare.schedule("0 9 * * *")
    async def morning(session: Session) -> None:
        pass

    assert bare.spec.triggers[0].cron == "0 9 * * *"
    with pytest.raises(Exception, match="triggers"):
        Application.from_spec(without).spec


@pytest.mark.asyncio
async def test_a_schedule_is_a_workers_refused_at_the_decorator_and_ticked_by_name():
    chat = Application(id="chat", kind="chat", agent="example-blank:0.0.1")
    with pytest.raises(
        ValueError, match='chat is a chat, and a schedule is a worker\'s.*kind="worker"'
    ):
        chat.schedule("0 9 * * *")
    worker = Application(
        id="digest", kind="worker", agent="example-blank:0.0.1", goal="A digest"
    )
    worker.record(include=["outputs"])
    ticks: list = []

    @worker.schedule("0 9 * * 1-5", name="morning")
    async def digest(session: Session) -> None:
        ticks.append(session.uid)
        await session.send("Digest sent.")

    assert worker.schedule_at(0) == "morning" and "digest" not in worker.schedules
    channel = MemoryChannel()
    host = AppHost(worker, channel, agent=lambda spec: Agent(scripted("Done.")))
    own = await host.tick("morning")
    assert ticks == [own.uid] and channel.messages[-1].text == "Digest sent."
    assert host.recorder.sent[-1]["woken_by"]["schedule"] == "morning"
    opened = await host.open()
    assert await host.tick("morning", session=opened) is opened
    assert ticks == [own.uid, opened.uid]
    with pytest.raises(KeyError):
        await host.tick("evening")


@pytest.mark.asyncio
async def test_one_word_each_uid_press_and_opened_by():
    app = desk()
    pressed: list = []

    @app.action("save")
    async def save(session: Session) -> None:
        pressed.append(session.opened_by)

    host = AppHost(app, MemoryChannel(), agent=lambda spec: Agent(scripted("Done.")))
    session = await host.open(opened_by="ada", uid="s-42")
    assert session.uid == "s-42" and session.opened_by == "ada"
    assert not hasattr(session, "id") and not hasattr(session, "user")
    await host.press(session, "save")
    assert pressed == ["ada"] and not hasattr(host, "action")
    resumed = await host.resume("s-42", {"kept": 1}, opened_by="ada")
    assert resumed.uid == "s-42" and resumed.state == {"kept": 1}


def test_a_rule_is_declared_by_what_it_says():
    app = Application(id="desk", kind="chat", agent="example-blank:0.0.1")
    rule = app.rule(says="refund an order", applies_to="send", behaviour="ask_first")
    assert (
        rule.action == "refund an order"
        and app.spec.rules[0].action == "refund an order"
    )


@pytest.mark.asyncio
async def test_a_rules_question_names_the_tool_and_its_arguments():
    app = desk()
    host, channel = None, MemoryChannel()
    host = AppHost(
        app,
        channel,
        agent=lambda spec: Agent(
            scripted(
                ("send_reply", {"to": "ada@example.com", "text": "x" * 100}), "Done."
            )
        ),
    )
    session = await host.open(opened_by="ada")
    channel.reply("Refuse")
    with pytest.raises(AppRuleBlockedError) as refused:
        await session.agent.run("reply to Ada")
    asked = channel.questions[-1]
    assert isinstance(asked, ChoiceQuestion) and asked.options == ("Allow", "Refuse")
    assert asked.prompt == (
        "send_reply(to='ada@example.com', text='" + "x" * 78 + "…) — "
        "Your rule “send a reply”: ask you first."
    )
    assert str(refused.value).startswith("You refused send_reply(to='ada@example.com'")
    assert str(refused.value).endswith("…): it was not run.")
    channel.reply("Allow")
    assert (await session.agent.run("reply to Ada")).text == "Done."


@pytest.mark.asyncio
async def test_a_memory_channel_says_its_steps_as_they_are_now():
    app = desk()

    @app.message
    async def reply(session: Session, text: str) -> None:
        async with session.step("Finding", kind="retrieval", input=text) as step:
            step.output = "found"
        async with session.step("Answering", kind="model") as step:
            step.output = "said"

    channel = MemoryChannel()
    host = AppHost(app, channel, agent=lambda spec: Agent(scripted("Done.")))
    await host.message(await host.open(), "hello")
    assert [
        (s.name, s.kind, s.output, s.ended_at is not None) for s in channel.steps
    ] == [
        ("Finding", "retrieval", "found", True),
        ("Answering", "model", "said", True),
    ]


def test_every_kind_the_record_keeps_is_under_an_include_word():
    app = Application(id="desk", kind="chat", agent="example-blank:0.0.1")
    # `audio` is kept only by an application that listens (`interface.voice`).
    for word in sorted(set(INCLUDED_BY.values()) - {"audio"}):
        app.record(include=[word])
        assert app.spec.record.include == [word], word
    app.record(include=["audio"])
    with pytest.raises(Exception, match="keeps audio only when it listens"):
        app.spec
