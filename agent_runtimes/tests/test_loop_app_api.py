# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The application API: `Application`, `AppHost` and `Session` (LOOP P-01 to P-03)."""

import asyncio
from pathlib import Path
from typing import Any

import pytest
from pydantic_ai import Agent

from agent_runtimes.loop.apps import (
    AppHost,
    Application,
    AskTimeout,
    ChoiceQuestion,
    Delta,
    FileQuestion,
    FormQuestion,
    InvalidAnswer,
    MemoryChannel,
    Message,
    Session,
    Step,
    UploadedFile,
    load_application,
    local_agent,
)
from agent_runtimes.loop.apps.enforcement import AppRuleBlockedError
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.session import LoopSession
from agent_runtimes.tests.test_apps_guards import scripted
from agent_runtimes.types import AppSettingSpec, AppSpec


def interview() -> Application:
    app = Application(id="customer-interview", kind="chat", agent="cog-crawler:0.0.1")
    app.starter("Onboarding", "Interview me about my onboarding.")
    app.rule("send the summary by email", applies_to="send", behaviour="ask_first")
    app.setting("tone", "select", "Tone", options=["warm", "dry"], default="warm")
    app.setting("depth", "slider", "Depth", default=3, min=1, max=5)
    return app


def hosted(
    app: Application, *turns: Any, include: tuple[str, ...] = ("outputs",)
) -> tuple[AppHost, MemoryChannel, list]:
    sent: list = []

    async def send(body: dict) -> None:
        sent.append(body)

    channel = MemoryChannel()
    spec = app.spec.model_copy(
        update={"record": app.spec.record.model_copy(update={"include": list(include)})}
    )
    recorder = AppRecorder(app=spec, app_uid="app-1", send=send)
    host = AppHost(
        app, channel, agent=lambda spec: Agent(scripted(*turns)), recorder=recorder
    )
    return host, channel, sent


# --- P-01: the module -------------------------------------------------------------


def test_an_application_session_is_not_the_workspace_session():
    assert Session is not LoopSession
    assert Session.__module__ == "agent_runtimes.loop.apps.session"


# --- P-02: declarations, attached to an Appspec ------------------------------------


def test_declarations_are_the_spec():
    spec = interview().spec
    assert isinstance(spec, AppSpec)
    assert spec.name == "Customer interview"
    assert [s.label for s in spec.interface.starters] == ["Onboarding"]
    assert spec.rules[0].applies_to == ["send"]
    assert spec.rules[0].behaviour == "ask_first"
    assert [s.id for s in spec.interface.settings] == ["tone", "depth"]


def test_a_connection_and_a_schedule_are_declared():
    app = Application(
        id="digest", kind="worker", agent="cog-crawler:0.0.1", goal="A weekly digest"
    )
    app.connection("tavily", only=["tavily_search"])

    @app.schedule("0 9 * * 1", description="Monday digest")
    async def monday(session: Session) -> None:
        await session.send("digest")

    spec = app.spec
    assert spec.connections[0].server == "tavily"
    assert spec.connections[0].only == ["tavily_search"]
    assert spec.triggers[0].type == "schedule"
    assert spec.triggers[0].cron == "0 9 * * 1"
    assert app.schedules == {"monday": monday}


def test_a_spec_that_would_not_run_is_refused_with_its_reasons():
    app = Application(id="nameless", kind="chat")
    with pytest.raises(AppNotRunnable):
        app.spec
    with pytest.raises(ValueError, match="behaviour is one of"):
        interview().rule("buy", applies_to="buy", behaviour="sometimes")


def test_an_application_attaches_to_an_existing_appspec():
    document = interview().document
    attached = Application.from_spec(interview().spec)
    assert attached.spec == interview().spec
    assert Application.from_spec(document).spec == interview().spec


def test_one_handler_per_moment():
    app = interview()

    @app.message
    def first(session: Session, text: str) -> None: ...

    with pytest.raises(ValueError, match="already reacts to message"):

        @app.message
        def second(session: Session, text: str) -> None: ...

    with pytest.raises(ValueError, match="A moment is one of"):
        app.handler("logout")


async def test_start_then_message_then_action():
    app = interview()
    seen: list = []

    @app.start
    async def opening(session: Session) -> None:
        session.state["goal"] = await session.ask("What do you want to learn?")

    @app.message
    def reply(session: Session, text: str) -> None:  # sync handlers too
        seen.append((text, session.state["goal"]))

    @app.action("save")
    async def save(session: Session, payload: dict) -> None:
        seen.append(payload)

    host, channel, _ = hosted(app)
    channel.reply("why people leave")
    session = await host.open(user="ada")
    assert session.user == "ada"
    assert session.state == {"goal": "why people leave"}
    await host.message(session, "hello")
    await host.action(session, "save", {"k": 1})
    assert seen == [("hello", "why people leave"), {"k": 1}]
    with pytest.raises(KeyError, match="no action 'delete'"):
        await host.action(session, "delete")


async def test_without_a_message_handler_the_agent_answers_streamed():
    host, channel, _ = hosted(interview(), ["Hello", " there"])
    session = await host.open()
    await host.message(session, "hi")
    deltas = [e.text for e in channel.events if isinstance(e, Delta)]
    assert len(deltas) > 1 and "".join(deltas) == "Hello there"
    assert channel.messages[-1].text == "Hello there"
    assert channel.messages[-1].author == "Customer interview"


async def test_settings_are_checked_kept_and_reacted_to():
    app = interview()
    changed: list = []

    @app.settings
    async def on_settings(session: Session, settings: dict) -> None:
        changed.append(settings)

    host, _, _ = hosted(app)
    session = await host.open(settings={"depth": 4})
    assert session.settings == {"tone": "warm", "depth": 4}
    await host.settings(session, {"tone": "dry"})
    assert changed == [{"tone": "dry", "depth": 4}]
    with pytest.raises(InvalidAnswer, match="at most 5"):
        await host.settings(session, {"depth": 9})
    with pytest.raises(InvalidAnswer, match="no field"):
        await host.settings(session, {"colour": "red"})


async def test_stop_cancels_what_runs_then_reacts():
    app = interview()
    stopped: list = []

    @app.message
    async def slow(session: Session, text: str) -> None:
        await asyncio.sleep(30)

    @app.stop
    async def on_stop(session: Session) -> None:
        stopped.append(session.id)

    host, _, _ = hosted(app)
    session = await host.open()
    running = asyncio.create_task(host.message(session, "go"))
    await asyncio.sleep(0.01)
    await host.stop(session)
    await asyncio.wait_for(running, 1)
    assert stopped == [session.id]


async def test_resume_brings_the_state_back():
    app = interview()

    @app.resume
    async def again(session: Session) -> None:
        await session.send(f"Back to {session.state['goal']}.")

    host, channel, _ = hosted(app)
    session = await host.resume("s-1", {"goal": "pricing"})
    assert session.id == "s-1"
    assert channel.messages[-1].text == "Back to pricing."


async def test_a_schedule_runs_in_a_session_of_its_own():
    app = Application(
        id="digest", kind="worker", agent="cog-crawler:0.0.1", goal="A weekly digest"
    )

    @app.schedule("0 9 * * 1")
    async def monday(session: Session) -> None:
        await session.send("digest")

    host, channel, _ = hosted(app)
    session = await host.schedule("monday")
    assert channel.messages[-1].session_id == session.id
    with pytest.raises(KeyError, match="no schedule"):
        await host.schedule("friday")


# --- P-03: the session --------------------------------------------------------------


async def test_send_and_stream():
    host, channel, _ = hosted(interview())
    session = await host.open()
    sent = await session.send("Hi", author="Interviewer")
    assert sent == Message(sent.id, session.id, "Hi", "Interviewer")

    async def tokens():
        for token in ["a", "b"]:
            yield token

    streamed = await session.stream(tokens())
    assert streamed.text == "ab"
    assert [e.message_id for e in channel.events if isinstance(e, Delta)] == [
        streamed.id,
        streamed.id,
    ]


async def test_steps_nest_and_say_how_they_ended():
    host, channel, _ = hosted(interview())
    session = await host.open()
    async with session.step("Researching", input="q") as outer:
        async with session.step("Searching", kind="tool") as inner:
            inner.output = 3
        outer.output = "done"
    with pytest.raises(RuntimeError):
        async with session.step("Failing"):
            raise RuntimeError("no network")
    steps = [e for e in channel.events if isinstance(e, Step)]
    assert [(s.name, s.ended_at is not None) for s in steps] == [
        ("Researching", False),
        ("Searching", False),
        ("Searching", True),
        ("Researching", True),
        ("Failing", False),
        ("Failing", True),
    ]
    assert steps[1].parent_id == steps[0].id
    assert steps[2].output == 3 and steps[3].output == "done"
    assert steps[4].parent_id is None and steps[5].error == "no network"
    with pytest.raises(ValueError, match="A step is one of"):
        async with session.step("x", kind="dream"):
            pass


async def test_ask_text_choice_file_and_form():
    host, channel, _ = hosted(interview())
    session = await host.open()

    channel.reply("blue")
    assert await session.ask("Colour?") == "blue"

    channel.reply("b")
    assert await session.ask(ChoiceQuestion("Pick", ("a", "b"))) == "b"
    channel.reply("c")
    with pytest.raises(InvalidAnswer, match="one of a, b"):
        await session.ask(ChoiceQuestion("Pick", ("a", "b")))

    pdf = UploadedFile("notes.pdf", "application/pdf", b"%PDF")
    channel.reply(pdf)
    assert await session.ask(FileQuestion("Your notes", accept=(".pdf",))) is pdf
    channel.reply(pdf)
    with pytest.raises(InvalidAnswer, match="not one of image/"):
        await session.ask(FileQuestion("A picture", accept=("image/*",)))
    channel.reply(pdf)
    with pytest.raises(InvalidAnswer, match="larger than"):
        await session.ask(FileQuestion("Tiny", max_bytes=2))

    form = FormQuestion(
        "About you",
        (
            AppSettingSpec(id="name", type="text", label="Name"),
            AppSettingSpec(id="team", type="toggle", label="Team", default=False),
        ),
    )
    channel.reply({"name": "Ada"})
    assert await session.ask(form) == {"name": "Ada", "team": False}

    with pytest.raises(AskTimeout, match="was not answered in 0.01 seconds"):
        await session.ask("Still there?", timeout=0.01)


async def test_state_is_the_sessions_own():
    host, _, _ = hosted(interview())
    first, second = await host.open(), await host.open()
    first.state["n"] = 1
    assert second.state == {} and first.id != second.id


async def test_record_writes_to_the_applications_recorder():
    host, _, sent = hosted(interview(), include=("outputs",))
    session = await host.open()
    assert await session.record({"insight": "pricing"}) is True
    assert sent[-1]["session_uid"] == session.id
    assert sent[-1]["app_uid"] == "app-1"
    assert [entry["kind"] for entry in sent[-1]["entries"]] == ["session", "output"]
    assert sent[-1]["entries"][-1]["payload"] == {"insight": "pricing"}
    assert await session.record({"x": 1}, kind="feedback") is False
    with pytest.raises(ValueError, match="record entry is one of"):
        await session.record({}, kind="diary")


async def test_the_agent_runs_with_the_session_history_and_record():
    host, _, sent = hosted(interview(), "First.", "Second.")
    session = await host.open()
    first = await session.agent.run("one", goal="pricing")
    assert first.text == "First."
    second = await session.agent.run("two")
    assert second.text == "Second."
    assert len(session.agent.history) == 4  # two turns, kept
    outputs = [e for body in sent for e in body["entries"] if e["kind"] == "output"]
    assert [e["summary"] for e in outputs] == ["First.", "Second."]
    assert {body["session_uid"] for body in sent} == {session.id}


async def test_a_rule_asks_the_user_of_the_session():
    app = interview()
    app.rule("search the web", applies_to="tavily.tavily_search", behaviour="ask_first")
    app.connection("tavily")
    host, channel, _ = hosted(app, ("tavily__tavily_search", {"query": "x"}), "Done.")
    session = await host.open()

    @session.agent.agent.tool_plain(name="tavily__tavily_search")
    def search(query: str) -> str:
        return "found"

    channel.reply("Refuse")
    with pytest.raises(AppRuleBlockedError):
        await session.agent.run("look it up")
    assert isinstance(channel.questions[-1], ChoiceQuestion)
    assert channel.questions[-1].options == ("Allow", "Refuse")

    channel.reply("Allow")
    assert (await session.agent.run("look it up")).text == "Done."


def test_the_local_agent_refuses_what_only_a_runtime_brings():
    app = interview()
    app.connection("tavily")
    with pytest.raises(AppNotRunnable, match="connections"):
        local_agent(app.spec)
    # Past validation, as a runtime may hold a spec its catalogue lost.
    unknown = interview().spec.model_copy(update={"agent": "no-such-agent"})
    with pytest.raises(AppNotRunnable, match="not known here.*names no model"):
        local_agent(unknown)


def test_load_application_finds_the_one_in_the_file(tmp_path: Path):
    file = tmp_path / "app.py"
    file.write_text(
        "from agent_runtimes.loop.apps import Application\n"
        "app = Application(id='from-file', kind='chat', agent='cog-crawler:0.0.1')\n"
        "same = app\n"
    )
    assert load_application(file).id == "from-file"
    file.write_text("x = 1\n")
    with pytest.raises(ValueError, match="defines 0 applications"):
        load_application(file)


def test_the_local_agent_is_the_applications_instructions_and_its_agents_model():
    app = Application(
        id="writer",
        kind="chat",
        agent="example-a2a-writer",
        instructions="Write short.",
    )
    agent = local_agent(app.spec)
    assert isinstance(agent, Agent)
    assert agent.model is not None
    # Its model is never called here: building it is the test.
