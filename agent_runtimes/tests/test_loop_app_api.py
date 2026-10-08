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
from agent_runtimes.types import AppSpec


def interview() -> Application:
    app = Application(id="customer-interview", kind="chat", agent="cog-crawler:0.0.1")
    app.starter("Onboarding", "Interview me about my onboarding.")
    app.rule("send the summary by email", applies_to="send", behaviour="ask_first")
    app.setting(
        "tone",
        {"type": "string", "title": "Tone", "enum": ["warm", "dry"], "default": "warm"},
    )
    app.setting(
        "depth",
        {"type": "integer", "title": "Depth", "minimum": 1, "maximum": 5, "default": 3},
    )
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
    assert list(spec.interface.settings["properties"]) == ["tone", "depth"]


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
        app.handler("on_chat_end")


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
    with pytest.raises(
        InvalidAnswer,
        match="“Its settings” was sent what its fields refuse: depth: 9 is greater than the maximum of 5",
    ):
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

    host, channel, sent = hosted(app)
    session = await host.schedule("monday")
    assert channel.messages[-1].session_id == session.id
    # Its record says the schedule woke it (R-14).
    woken = {"kind": "schedule", "schedule": "monday", "cron": "0 9 * * 1"}
    assert sent[-1]["session_uid"] == session.id
    assert sent[-1]["woken_by"] == woken
    assert sent[-1]["entries"][0]["payload"]["woken_by"] == woken
    with pytest.raises(KeyError, match="no schedule"):
        await host.schedule("friday")


# --- C-15: a component placed from Python ------------------------------------------


def test_a_component_is_placed_on_the_surface_and_checked_against_its_schema():
    document = interview().document
    app = Application.from_spec(
        {**document, "interface": {**document["interface"], "layout": "split"}}
    )
    app.component("root", "Column", children=["runs", "hello"])
    node = app.component(
        "runs", "Table", title="Runs", columns=["model", "cost"], rows={"path": "/runs"}
    )
    assert node == {
        "id": "runs",
        "component": "Table",
        "title": "Runs",
        "columns": ["model", "cost"],
        "rows": {"path": "/runs"},
    }
    app.component("hello", "Text", text="Hello")
    surface = app.spec.interface.surface
    assert surface is not None
    assert surface.protocol == "a2ui/v0.9"
    assert [each["id"] for each in surface.components] == ["root", "runs", "hello"]
    # Bound, a required property is the binding's.
    assert app.component("bound", "Table", columns={"path": "/columns"})["columns"] == {
        "path": "/columns"
    }


def test_a_component_its_schema_refuses_is_not_placed():
    app = interview()
    with pytest.raises(
        ValueError,
        match=r"runs is a Table its schema refuses: page_size: 0 is less than the minimum of 1",
    ):
        app.component("runs", "Table", columns=["model"], page_size=0)
    with pytest.raises(ValueError, match=r"'columns' is a required property"):
        app.component("runs", "Table", title="Runs")
    with pytest.raises(ValueError, match="The catalog has no component 'Gauge'"):
        app.component("speed", "Gauge")
    app.component("runs", "Table", columns=["model"])
    with pytest.raises(ValueError, match="already has a component named runs"):
        app.component("runs", "Table", columns=["cost"])
    assert app.document.get("interface", {}).get("surface", {}).get("components") == [
        {"id": "runs", "component": "Table", "columns": ["model"]}
    ]


def test_every_component_is_a_typed_call_writing_the_node_the_canvas_writes():
    """LOOP C-15: ``app.ui.<component>`` for every component of the catalog —
    its properties named and typed from the same JSON Schema — writes the node
    ``app.component`` writes, which the YAML and the Canvas read."""
    import inspect
    import re

    from agent_runtimes.specs.ui_plugins import SurfaceComponents, list_components

    for spec in list_components():
        name = re.sub(r"(?<!^)(?=[A-Z])", "_", spec.id).lower()
        call = getattr(SurfaceComponents, name)
        parameters = inspect.signature(call).parameters
        for field in spec.properties.get("properties", {}):
            assert field in parameters, f"{name}: {field}"
        for field in spec.properties.get("required", []):
            assert parameters[field].default is inspect.Parameter.empty, (
                f"{name}: {field}"
            )
    typed, untyped = interview(), interview()
    node = typed.ui.table(
        "runs", columns=["model", "cost"], page_size=10, rows={"path": "/runs"}
    )
    assert node == untyped.component(
        "runs", "Table", columns=["model", "cost"], page_size=10, rows={"path": "/runs"}
    )
    assert typed.ui.text("hello", text="Hello", variant="h2") == {
        "id": "hello",
        "component": "Text",
        "text": "Hello",
        "variant": "h2",
    }


def test_a_typed_call_its_schema_refuses_is_not_placed_a_standard_one_too():
    app = interview()
    with pytest.raises(ValueError, match="page_size: 0 is less than the minimum of 1"):
        app.ui.table("runs", columns=["model"], page_size=0)
    with pytest.raises(ValueError, match=r"variant: 'huge' is not one of"):
        app.ui.text("hello", text="Hello", variant="huge")
    with pytest.raises(ValueError, match="'max' is a required property"):
        app.component("budget", "Slider", value={"path": "/budget"})
    # Bound, a standard component's value is the binding's.
    assert app.ui.slider("budget", max=100, value={"path": "/budget"})["value"] == {
        "path": "/budget"
    }


def test_python_yaml_and_back_are_one_surface():
    """LOOP C-15: what Python places is the spec's text, and read back from
    that text it is the same surface — one component, three editors."""
    import yaml

    app = Application.from_spec(
        {**interview().document, "interface": {"layout": "page"}}
    )
    app.ui.column("root", children=["quote", "runs"])
    app.ui.form(
        "quote",
        schema={"type": "object", "properties": {"seats": {"type": "integer"}}},
        values={"path": "/quote"},
        action={"event": {"name": "send", "context": {"values": {"path": "/quote"}}}},
    )
    app.ui.table("runs", columns=["model"], rows={"path": "/runs"})
    text = yaml.safe_dump(app.document, sort_keys=False)
    again = Application.from_spec(yaml.safe_load(text))
    assert again.spec.interface.surface == app.spec.interface.surface
    assert [node["component"] for node in again.spec.interface.surface.components] == [
        "Column",
        "Form",
        "Table",
    ]


def quote_app() -> Application:
    app = Application.from_spec(
        {**interview().document, "interface": {"layout": "page"}}
    )
    app.ui.column("root", children=["quote"])
    app.ui.form(
        "quote",
        title="The quote",
        schema={
            "type": "object",
            "required": ["seats"],
            "properties": {"seats": {"type": "integer", "minimum": 1}},
        },
        values={"path": "/quote"},
        action={"event": {"name": "price", "context": {"values": {"path": "/quote"}}}},
    )
    return app


def test_a_forms_values_are_checked_again_when_they_arrive():
    """LOOP C-16: the runtime checks what a form sends against its schema."""
    from agent_runtimes.loop.apps.forms import form_values_refused

    spec = quote_app().spec
    assert form_values_refused(spec, "price", {"values": {"seats": 3}}) is None
    assert form_values_refused(spec, "price", {"values": {"seats": 0}}) == (
        "“The quote” was sent what its fields refuse: seats: 0 is less than the minimum of 1."
    )
    assert "'seats' is a required property" in str(
        form_values_refused(spec, "price", {"values": {}})
    )
    # Another action, or no values carried: not the form's to check.
    assert form_values_refused(spec, "send", {"values": {"seats": 0}}) is None
    assert form_values_refused(spec, "price", {}) is None


async def test_a_refused_forms_action_never_reaches_its_handler():
    app = quote_app()
    seen: list = []

    @app.action("price")
    async def price(session: Session, payload: dict) -> None:
        seen.append(payload)

    host, _, _ = hosted(app)
    session = await host.open()
    with pytest.raises(ValueError, match="seats: 0 is less than the minimum of 1"):
        await host.action(session, "price", {"values": {"seats": 0}})
    await host.action(session, "price", {"values": {"seats": 2}})
    assert seen == [{"values": {"seats": 2}}]


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


async def test_an_answer_shows_components_of_the_catalog():
    """What an answer shows is the catalog the Canvas places (LOOP P-04)."""
    host, channel, _ = hosted(interview())
    session = await host.open()
    sent = await session.send(
        "Three runs.",
        show=[
            session.ui.text("note", text="Cheapest first."),
            session.ui.table("runs", columns=["model", "cost"], rows={"path": "/runs"}),
            session.ui.image("plot", url="https://example.com/plot.png"),
            session.ui.chart(
                "costs", kind="bar", x="model", y="cost", points={"path": "/runs"}
            ),
            session.ui.text("again-label", text="Run again"),
            session.ui.button(
                "again", child="again-label", action={"event": {"name": "again"}}
            ),
            session.ui.download(
                "export", name="runs.csv", url="https://example.com/runs.csv"
            ),
        ],
        data={"runs": [{"model": "a", "cost": 1}]},
    )
    assert [node["component"] for node in sent.components] == [
        "Text",
        "Table",
        "Image",
        "Chart",
        "Text",
        "Button",
        "Download",
    ]
    assert sent.data == {"runs": [{"model": "a", "cost": 1}]}
    assert channel.events[-1] == sent

    # The catalog's schema refuses what it refuses, as on the surface.
    with pytest.raises(ValueError, match="The catalog has no component 'Banner'"):
        await session.send("x", show=[{"id": "b", "component": "Banner"}])
    with pytest.raises(ValueError, match="kind"):
        await session.send(
            "x",
            show=[{"id": "c", "component": "Chart", "kind": "pie", "x": "a", "y": "b"}],
        )
    with pytest.raises(ValueError, match="no component missing-label"):
        await session.send(
            "x",
            show=[
                session.ui.button(
                    "b", child="missing-label", action={"event": {"name": "go"}}
                )
            ],
        )
    with pytest.raises(ValueError, match="one component per id: note twice"):
        await session.send(
            "x",
            show=[session.ui.text("note", text="a"), session.ui.text("note", text="b")],
        )
    # A file is offered by an http(s) link or as a data: URL, nothing else.
    with pytest.raises(ValueError, match="url"):
        await session.send(
            "x",
            show=[session.ui.download("f", name="a.csv", url="javascript:alert(1)")],
        )
    with pytest.raises(ValueError, match="item 1 is not one"):
        await session.send("x", show=["a table"])

    # Changed: what it shows goes with it unless said, and can be taken away.
    kept = await sent.update("Three runs, sorted.")
    assert kept.components == sent.components and kept.data == sent.data
    bare = await kept.update("No runs.", show=[])
    assert bare.components == ()


def test_an_answers_surface_lays_its_components_in_a_column():
    from agent_runtimes.loop.apps.components import answer_components, answer_surface

    nodes = answer_components(
        [
            {"id": "label", "component": "Text", "text": "Go"},
            {
                "id": "go",
                "component": "Button",
                "child": "label",
                "action": {"event": {"name": "go"}},
            },
            {"id": "intro", "component": "Text", "text": "Ready."},
        ]
    )
    surface = answer_surface("m1", "Notes", nodes, {"rows": []})
    create, components, data = surface["messages"]
    assert create["createSurface"]["surfaceId"] == surface["surfaceId"] == "answer-m1"
    root = components["updateComponents"]["components"][0]
    # A child is drawn where its parent puts it, not again in the column.
    assert root == {"id": "root", "component": "Column", "children": ["go", "intro"]}
    assert data["updateDataModel"] == {
        "surfaceId": "answer-m1",
        "path": "/",
        "value": {"rows": []},
    }
    assert len(answer_surface("m2", "Notes", nodes)["messages"]) == 2


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


async def test_steps_are_kept_in_the_record_with_its_actions():
    """A step that ended is a `step` entry, sent when the outermost one ends (LOOP P-16)."""
    host, _, sent = hosted(interview(), include=("actions",))
    session = await host.open()
    sent.clear()
    async with session.step("Researching", input="q") as outer:
        async with session.step("Searching", kind="tool", input={"q": "x"}) as inner:
            inner.output = [1, 2]
        assert sent == []  # nested: sent with its parent
        outer.output = "done"
    with pytest.raises(RuntimeError):
        async with session.step("Failing", kind="model"):
            raise RuntimeError("no network")
    entries = [
        entry for body in sent for entry in body["entries"] if entry["kind"] == "step"
    ]
    assert [(e["kind"], e["summary"]) for e in entries] == [
        ("step", "Searching"),
        ("step", "Researching"),
        ("step", "Failing: no network"),
    ]
    searching, researching, failing = (e["payload"] for e in entries)
    assert searching["parent_id"] == researching["id"]
    assert (searching["kind"], searching["input"], searching["output"]) == (
        "tool",
        "{'q': 'x'}",
        "[1, 2]",
    )
    assert researching["parent_id"] == "" and researching["output"] == "done"
    assert (failing["error"], failing["output"]) == ("no network", "")
    assert all(e["started_at"] and e["ended_at"] for e in (searching, failing))

    # Not kept by an application whose record does not keep its actions.
    host, _, sent = hosted(interview(), include=("outputs",))
    session = await host.open()
    sent.clear()
    async with session.step("Researching"):
        pass
    assert not [e for body in sent for e in body["entries"] if e["kind"] == "step"]


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
        {
            "type": "object",
            "required": ["name"],
            "properties": {
                "name": {"type": "string", "title": "Name"},
                "team": {"type": "boolean", "title": "Team", "default": False},
            },
        },
    )
    channel.reply({"name": "Ada"})
    assert await session.ask(form) == {"name": "Ada", "team": False}
    channel.reply({"team": True})
    with pytest.raises(InvalidAnswer, match="'name' is a required property"):
        await session.ask(form)
    with pytest.raises(ValueError, match="asks for no named field"):
        FormQuestion("Nothing", {"type": "object", "properties": {}})

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


def test_the_local_agent_is_its_agents_prompt_then_the_applications_instructions():
    app = Application(
        id="writer",
        kind="chat",
        agent="example-a2a-writer",
        instructions="Write short.",
    )
    agent = local_agent(app.spec)
    assert isinstance(agent, Agent)
    assert agent.model is not None
    # As on a runtime: the agent's own prompt first, then the application's.
    written = "".join(part.instruction for part in agent._instructions)
    assert written.startswith("You are a concise writing specialist")
    assert written.endswith("\n\nWrite short.")
    # Its model is never called here: building it is the test.


# --- P-14: the whole life cycle ---------------------------------------------------


async def test_end_cancels_what_runs_reacts_and_takes_nothing_more():
    app = interview()
    said: list = []

    @app.message
    async def slow(session: Session, text: str) -> None:
        await asyncio.sleep(30)

    @app.end
    async def closed(session: Session) -> None:
        said.append(("end", session.id))

    host, _, _ = hosted(app)
    session = await host.open()
    running = asyncio.create_task(host.message(session, "go"))
    await asyncio.sleep(0.01)
    await host.end(session)
    await asyncio.wait_for(running, 1)
    assert said == [("end", session.id)]
    # Ended twice is ended once.
    await host.end(session)
    assert said == [("end", session.id)]
    with pytest.raises(ValueError, match="has ended"):
        await host.message(session, "again")
    with pytest.raises(ValueError, match="has ended"):
        await host.stop(session)
    # Resumed, its thread is open again.
    again = await host.resume(session.id, {"goal": "pricing"})
    await host.settings(again, {"tone": "dry"})


async def test_logout_reacts_then_ends():
    app = interview()
    said: list = []

    @app.logout
    def signed_out(session: Session) -> None:
        said.append("logout")

    @app.end
    def closed(session: Session) -> None:
        said.append("end")

    host, _, _ = hosted(app)
    session = await host.open(user="ada")
    await host.logout(session)
    assert said == ["logout", "end"]
    with pytest.raises(ValueError, match="has ended"):
        await host.logout(session)


def test_end_and_logout_are_one_handler_each_and_marked_as_code():
    from agent_runtimes.loop.apps.application import EVENTS

    app = interview()

    @app.end
    def closed(session: Session) -> None: ...

    with pytest.raises(ValueError, match="already reacts to end"):
        app.end(closed)
    assert app.handler("end") is closed
    assert app.handler("logout") is None
    assert EVENTS[-3:] == ("end", "logout", "page")


# --- P-15: messages that change ---------------------------------------------------


async def test_a_message_is_updated_and_removed_where_the_user_reads_it():
    from agent_runtimes.loop.apps import Removed

    host, channel, _ = hosted(interview())
    session = await host.open()
    first = await session.send("Searching…")
    other = await session.send("Found 3.", author="Searcher")
    changed = await first.update("Searched: 3 results.")
    assert (changed.id, changed.text, changed.author) == (
        first.id,
        "Searched: 3 results.",
        first.author,
    )
    # The channel is told the same message again, under its id.
    assert channel.events[-1] == changed
    assert [(m.text, m.author) for m in channel.messages] == [
        ("Searched: 3 results.", "Customer interview"),
        ("Found 3.", "Searcher"),
    ]
    await other.remove()
    assert channel.events[-1] == Removed(other.id, session.id)
    assert [m.text for m in channel.messages] == ["Searched: 3 results."]
    with pytest.raises(ValueError, match="was removed"):
        await other.update("back")
    # A streamed message changes the same way.

    streamed = await session.stream(["a", "b"])
    assert (await streamed.update("ab, said again")).text == "ab, said again"
    # Only the session that sent it changes it.
    elsewhere = await host.open()
    with pytest.raises(ValueError, match="not"):
        await elsewhere.update(changed, "x")
    with pytest.raises(ValueError, match="not sent by a session"):
        await Message("m", session.id, "x", "y").update("z")


async def test_run_sync_and_cache():
    import threading

    from agent_runtimes.loop.apps import cache, run_sync

    main = threading.get_ident()
    assert await run_sync(threading.get_ident) != main

    async def not_blocking() -> None: ...

    with pytest.raises(TypeError, match="is async"):
        await run_sync(not_blocking)

    calls: list = []

    @cache
    def square(n: int) -> int:
        calls.append(n)
        return n * n

    assert (square(3), square(3), square(n=3)) == (9, 9, 9)
    assert calls == [3, 3]  # 3 positional, then n=3 by name
    square.cache_clear()
    square(3)
    assert calls == [3, 3, 3]

    fetched: list = []

    @cache
    async def fetch(key: str) -> str:
        fetched.append(key)
        await asyncio.sleep(0.01)
        if key == "bad":
            raise RuntimeError("no")
        return key.upper()

    # Called again while the first call runs: it waits for that one.
    assert await asyncio.gather(fetch("a"), fetch("a")) == ["A", "A"]
    assert await fetch("a") == "A"
    assert fetched == ["a"]
    # What it raised is not kept.
    for _ in range(2):
        with pytest.raises(RuntimeError):
            await fetch("bad")
    assert fetched == ["a", "bad", "bad"]
    with pytest.raises(TypeError, match="hashable"):
        await fetch(["a"])


# --- P-28: an application is a Reactor plugin ----------------------------------------


async def test_an_application_is_its_plugin_each_reaction_a_contribution():
    from reactor import ContributionRegistry, PluginContributions

    from agent_runtimes.loop.apps.plugins import (
        APP_POINT,
        REACTION_POINTS,
        find_app,
        reaction_of,
        reactions_named,
    )

    app = interview()

    @app.start
    async def opening(session: Session) -> None:
        await session.send("Hello.")

    @app.message
    async def reply(session: Session, text: str) -> None:
        await session.send(f"Heard {text}.")

    @app.action("save")
    def save(session: Session, payload: dict) -> None: ...

    registry = ContributionRegistry()
    host, channel, _ = hosted(app)
    host = AppHost(
        app, channel, agent=host._agent, recorder=host.recorder, registry=registry
    )
    # Its identity is the plugin's manifest; its spec and every reaction are
    # contributions of that plugin.
    assert host.plugin.name == "loop-app-customer-interview"
    assert find_app("customer-interview", registry) == app.spec
    assert [(c.plugin, c.id) for c in registry.get(REACTION_POINTS["message"])] == [
        ("loop-app-customer-interview", "customer-interview")
    ]
    assert reaction_of("customer-interview", "action", "save", registry) is save
    assert reactions_named("customer-interview", "action", registry) == ["save"]
    assert reaction_of("customer-interview", "stop", registry=registry) is None
    with pytest.raises(ValueError, match="A reaction is one of"):
        reaction_of("customer-interview", "on_message", registry=registry)

    # Another plugin's later contribution answers in its place.
    async def louder(session: Session, text: str) -> None:
        await session.send(f"HEARD {text.upper()}.")

    PluginContributions(registry, "shouting").contribute(
        REACTION_POINTS["message"], louder, contribution_id="customer-interview"
    )
    session = await host.open()
    await host.message(session, "hi")
    assert [m.text for m in channel.messages] == ["Hello.", "HEARD HI."]
    registry.dispose_plugin("shouting")
    await host.message(session, "hi")
    assert channel.messages[-1].text == "Heard hi."

    # Disposed with its plugin: its spec, its reactions.
    host.dispose()
    assert not registry.get(APP_POINT, plugins=[host.plugin.name])
    assert reaction_of("customer-interview", "message", registry=registry) is None
    with pytest.raises(KeyError, match="no action 'save'"):
        await host.action(session, "save", {})


# --- P-19: commands and modes in the composer ---------------------------------------


def test_commands_and_modes_are_declared_in_the_spec():
    from agent_runtimes.loop.apps.build import code_marks

    app = interview()
    app.command("summarise", "Summarise what was said", prompt="Summarise: {input}")

    @app.command("export", "Export the notes")
    async def export(session: Session, words: str) -> None: ...

    app.mode(
        "depth",
        "Depth",
        [
            {"id": "quick", "label": "Quick", "instructions": "Two sentences."},
            {"id": "thorough", "label": "Thorough"},
        ],
        default="thorough",
    )
    spec = app.spec
    assert [(c.name, c.prompt) for c in spec.interface.commands] == [
        ("summarise", "Summarise: {input}"),
        ("export", "/export {input}"),
    ]
    assert [
        (m.id, m.default, [o.id for o in m.options]) for m in spec.interface.modes
    ] == [("depth", "thorough", ["quick", "thorough"])]
    assert app.commands == {"export": export}
    assert app.document["interface"]["modes"][0]["options"][1] == {
        "id": "thorough",
        "label": "Thorough",
    }
    # What the code answers is marked as code by `loop apps build`.
    assert [m.moment for m in code_marks(app)] == ["command export"]
    with pytest.raises(ValueError, match="already has a command /export"):
        app.command("export", "Again")
    with pytest.raises(ValueError, match="sends its prompt"):
        app.command("brief", "Brief", prompt="Be brief.")(export)
    # What the spec refuses, it refuses here too.
    app.command("Bad Name", "No")
    with pytest.raises(AppNotRunnable, match="interface"):
        app.spec  # noqa: B018


# --- P-20, P-26: profiles, starters, the nine inputs, translations -------------------


async def test_profiles_starters_settings_inputs_and_translations_are_declared():
    from agent_runtimes.loop.apps.composer import run_effect

    app = interview()
    app.starter("Hello", "Hello!", category="Start")
    app.profile("support", "Support", instructions="Answer briefly.")
    app.profile("sales", "Sales", description="Plans", model="alibaba:qwen-max")
    app.starter("Pricing", "What does it cost?", category="Plans", profile="sales")
    app.setting(
        "seats",
        {"type": "integer", "minimum": 1, "maximum": 50, "title": "Seats"},
        widget="range",
    )
    app.setting("live", {"type": "boolean", "title": "Live"}, widget="switch")
    app.setting(
        "topics",
        {"type": "array", "items": {"type": "string"}, "title": "Topics"},
        widget="tags",
    )
    app.translation(
        "fr",
        {
            "starters": {"Pricing": {"label": "Tarifs"}},
            "categories": {"Plans": "Offres"},
            "settings": {"seats": {"title": "Places"}},
            "profiles": {"sales": {"label": "Ventes"}},
        },
    )
    spec = app.spec
    ui = spec.interface
    assert [p.id for p in ui.profiles] == ["support", "sales"]
    assert [(s.label, s.category) for s in ui.profiles[1].starters] == [
        ("Pricing", "Plans")
    ]
    assert ui.starters[-1].category == "Start"
    assert ui.settings_ui == {
        "seats": {"ui:widget": "range"},
        "live": {"ui:widget": "switch"},
        "topics": {"ui:widget": "tags"},
    }
    assert ui.translations["fr"].profiles["sales"].label == "Ventes"
    assert run_effect(spec, "sales").model == "alibaba:qwen-max"
    assert run_effect(spec).instructions.startswith("Answer briefly.")
    # The code reads the profile its session is with: the first when unsaid.
    host, _, _ = hosted(app)
    assert (await host.open()).profile == "support"
    assert (await host.open(profile="sales")).profile == "sales"
    with pytest.raises(ValueError, match="no profile 'buyer'"):
        await host.open(profile="buyer")
    with pytest.raises(ValueError, match="no profile 'buyer'"):
        app.starter("Buy", "Buy it", profile="buyer")
    with pytest.raises(ValueError, match="already has a profile 'sales'"):
        app.profile("sales", "Again")
    with pytest.raises(ValueError, match="already translated into 'fr'"):
        app.translation("fr", {})
    # What the spec refuses, it refuses here too: a slider without bounds,
    # a translation of what it does not say.
    app.setting("tone", {"type": "string", "title": "Tone"}, widget="range")
    with pytest.raises(AppNotRunnable, match="is a slider"):
        app.spec  # noqa: B018


async def test_a_command_its_code_answers_runs_in_place_of_message():
    app = interview()
    seen: list = []
    app.command("summarise", "Summarise", prompt="Summarise: {input}")

    @app.command("export", "Export the notes")
    async def export(session: Session, words: str) -> None:
        seen.append(("export", words))

    @app.message
    async def reply(session: Session, text: str) -> None:
        seen.append(("message", text))

    host, _, _ = hosted(app)
    session = await host.open()
    await host.message(session, "/export  as csv ")
    await host.message(session, "/export")
    # A command with a prompt arrives as the prompt the page sent; written
    # out as a command, it is a message like any other.
    await host.message(session, "/summarise the call")
    await host.message(session, "/exporter now")
    assert seen == [
        ("export", "as csv"),
        ("export", ""),
        ("message", "/summarise the call"),
        ("message", "/exporter now"),
    ]


async def test_the_mode_the_user_is_in_is_told_to_the_agent(monkeypatch):
    from pydantic_ai.messages import ModelRequest

    from agent_runtimes.models import models

    app = interview()
    app.mode(
        "depth",
        "Depth",
        [
            {
                "id": "quick",
                "label": "Quick",
                "instructions": "Answer in two sentences.",
            },
            {
                "id": "thorough",
                "label": "Thorough",
                "instructions": "Cite what you read.",
                "model": "alibaba:qwen-max",
            },
        ],
    )
    host, _, _ = hosted(app, "First.", "Second.")
    session = await host.open()
    assert session.modes == {"depth": "quick"}
    await session.agent.run("one", goal="pricing")
    first = session.agent.history[0]
    assert isinstance(first, ModelRequest)
    assert first.instructions is not None
    assert "Answer in two sentences.\n\ngoal: pricing" in first.instructions
    assert "model" not in session.agent._run_kwargs({})

    assert session._update_modes({"depth": "thorough"}) == {"depth": "thorough"}
    assert session.agent.mode.instructions == "Cite what you read."
    monkeypatch.setattr(
        models,
        "resolve_model_for_inference_provider",
        lambda model, provider, app_instance=None: f"resolved {model}",
    )
    kwargs = session.agent._run_kwargs({})
    assert (kwargs["model"], kwargs["instructions"]) == (
        "resolved alibaba:qwen-max",
        "Cite what you read.",
    )
    for wrong, sentence in (
        ({"speed": "fast"}, "has no mode 'speed'"),
        ({"depth": "deep"}, "Depth has no option 'deep'"),
    ):
        with pytest.raises(ValueError, match=sentence):
            session._update_modes(wrong)
        with pytest.raises(ValueError, match=sentence):
            await host.open(modes=wrong)
    assert session.modes == {"depth": "thorough"}
    opened = await host.open(modes={"depth": "thorough"})
    assert opened.modes == {"depth": "thorough"}


def test_composer_rules_on_the_runtimes_types():
    from agent_runtimes.loop.apps.composer import (
        command_called,
        command_prompt,
        mode_effect,
    )

    app = interview()
    app.command("summarise", "Summarise", prompt="Summarise: {input}")
    app.command("brief", "Brief", prompt="Be brief.")
    app.mode(
        "tone",
        "Tone",
        [
            {"id": "plain", "label": "Plain"},
            {"id": "warm", "label": "Warm", "instructions": "Be warm."},
        ],
    )
    spec = app.spec
    summarise, brief = spec.interface.commands
    assert command_prompt(summarise, " the call ") == "Summarise: the call"
    assert command_prompt(brief) == "Be brief."
    assert command_prompt(brief, "please") == "Be brief.\n\nplease"
    called = command_called(spec, "  /summarise the\ncall")
    assert called is not None and called[0] is summarise and called[1] == "the\ncall"
    assert command_called(spec, "/nothing") is None
    assert command_called(spec, "summarise") is None
    assert command_called(spec, "/") is None
    assert mode_effect(spec).instructions == ""
    assert mode_effect(spec, {"tone": "warm"}).instructions == "Be warm."
