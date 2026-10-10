# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A widget's page written in its code (LOOP P-05): ``@app.page``, its inputs
and outputs declared as values, run again as an input changes.
"""

import enum
import inspect
import json
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import pytest
from rich.console import Console

from agent_runtimes.loop.apps import (
    AppHost,
    Application,
    MemoryChannel,
    PageShown,
    Session,
    sessions,
)
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.forms import form_values_refused
from agent_runtimes.loop.apps.loading import AppNotRunnable
from agent_runtimes.loop.apps.pages import (
    LOOP_PAGE,
    PAGE_ACTION,
    field_of,
    page_signature,
)
from agent_runtimes.loop.apps.plugins import reaction_of
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.terminal import TerminalChannel

pytest.importorskip("agentspecs.apps")


async def _nothing(_body: Any = None) -> None:
    return None


class Term(enum.Enum):
    MONTHLY = "Monthly"
    ANNUAL = "Annual"


def quote_app() -> Application:
    app = Application(id="quote", kind="widget", agent="jupyter-data-analyst:0.0.1")
    app.output("total", title="Total")
    app.output("lines", "Table", columns=["item", "amount"])

    @app.page
    def quote(
        seats: int = 10,
        plan: Literal["Team", "Business"] = "Team",
        term: Term = Term.ANNUAL,
    ) -> Dict[str, Any]:
        price = (12 if plan == "Team" else 30) * (10 if term == "Annual" else 1)
        return {
            "total": f"{seats * price} €",
            "lines": [{"item": f"{plan}, {term}", "amount": seats * price}],
        }

    app.input(
        "seats",
        {
            "type": "integer",
            "title": "Seats",
            "minimum": 1,
            "maximum": 1000,
            "default": 10,
        },
    )
    return app


def host_of(application: Application, channel: Any = None) -> AppHost:
    return AppHost(
        application,
        channel or MemoryChannel(),
        recorder=AppRecorder(app=application.spec, send=_nothing),
    )


# --- what the code declares ---------------------------------------------------


def test_the_inputs_are_the_function_s_parameters() -> None:
    def page(
        session: Session,
        seats: int,
        ratio: float = 0.5,
        live: bool = True,
        note: str = "",
        tags: List[str] = ["a"],  # noqa: B006 - a default, read only
        regions: List[Literal["EU", "US"]] = ["EU"],  # noqa: B006
        maybe: Optional[int] = None,
        **rest: Any,
    ) -> None: ...

    signature = page_signature(page)
    assert signature.session is True and signature.open is True
    assert signature.required == ["seats"]
    fields = signature.fields
    assert fields["seats"] == {"title": "Seats", "type": "integer"}
    assert fields["ratio"] == {"title": "Ratio", "type": "number", "default": 0.5}
    assert fields["live"]["type"] == "boolean" and fields["note"]["type"] == "string"
    assert fields["tags"] == {
        "title": "Tags",
        "type": "array",
        "items": {"type": "string"},
        "default": ["a"],
    }
    assert fields["regions"]["items"] == {"type": "string", "enum": ["EU", "US"]}
    assert fields["maybe"] == {"title": "Maybe", "type": "integer", "default": None}
    assert field_of("term", Term, Term.ANNUAL) == {
        "title": "Term",
        "type": "string",
        "enum": ["Monthly", "Annual"],
        "default": "Annual",
    }
    assert field_of("n", inspect.Parameter.empty, 3)["type"] == "integer"
    with pytest.raises(TypeError, match="an input is a bool, an int"):
        field_of("when", dict, {})
    with pytest.raises(TypeError, match="takes values of several types"):
        field_of("x", Literal["a", 1], "a")

    def by_position(*values: int) -> None: ...

    with pytest.raises(TypeError, match="a page's inputs are given by name"):
        page_signature(by_position)


def test_the_page_is_in_its_spec() -> None:
    spec = quote_app().spec
    page = spec.interface.page
    assert page is not None and page.function == "quote" and page.live is True
    assert list(page.inputs["properties"]) == ["seats", "plan", "term"]
    # Said with app.input, the field wins over what the parameter says.
    assert page.inputs["properties"]["seats"]["maximum"] == 1000
    assert page.inputs["properties"]["plan"]["enum"] == ["Team", "Business"]
    assert [(o.name, o.component) for o in page.outputs] == [
        ("total", "Text"),
        ("lines", "Table"),
    ]
    assert page.outputs[1].props == {"columns": ["item", "amount"]}


def test_a_page_of_no_output_shows_its_result() -> None:
    app = Application(id="square", kind="widget", agent="jupyter-data-analyst:0.0.1")

    @app.page(live=False)
    def square(n: int = 3) -> int:
        return n * n

    page = app.spec.interface.page
    assert page is not None and page.live is False
    assert [(o.name, o.title) for o in page.outputs] == [("result", "Result")]
    assert app.document["interface"]["page"]["outputs"] == [
        {"name": "result", "title": "Result"}
    ]


def test_what_the_page_declares_is_refused_in_sentences() -> None:
    app = Application(id="quote", kind="widget", agent="jupyter-data-analyst:0.0.1")
    with pytest.raises(
        ValueError, match="an output is one of Text, Image, Table, Chart"
    ):
        app.output("clip", "Video")
    with pytest.raises(ValueError, match="columns"):
        app.output("lines", "Table")
    app.output("total")
    with pytest.raises(ValueError, match="already has an output 'total'"):
        app.output("total")
    with pytest.raises(TypeError, match="its JSON Schema"):
        app.input("seats", "integer")  # type: ignore[arg-type]
    app.input("colour", {"type": "string"})
    with pytest.raises(AppNotRunnable, match="decorate one with @app.page"):
        app.spec  # noqa: B018

    def page(seats: int = 1) -> str:
        return ""

    with pytest.raises(
        TypeError, match="does not take colour, declared with app.input"
    ):
        app.page(page)
    with pytest.raises(ValueError, match="'page' is the action that runs its page"):
        app.action("page")
    chat = Application(id="desk", kind="chat", agent="jupyter-data-analyst:0.0.1")

    @chat.page
    def desk(n: int = 1) -> str:
        return ""

    with pytest.raises(
        AppNotRunnable, match="a page of inputs and outputs is a widget's"
    ):
        chat.spec  # noqa: B018
    later = quote_app()
    with pytest.raises(TypeError, match="quote does not take the input 'region'"):
        later.input("region", {"type": "string"})


def test_the_page_is_a_contribution_of_its_plugin_and_marked_as_code() -> None:
    from agent_runtimes.loop.apps.build import code_marks

    application = quote_app()
    host = host_of(application)
    reaction = reaction_of("quote", "page", platform=host.platform)
    assert reaction is not None and reaction.__name__ == "quote"
    marks = [(m.moment, m.handler) for m in code_marks(application, "app.py")]
    assert ("page", "quote") in marks


# --- running it -----------------------------------------------------------------


async def test_an_input_changed_runs_the_page_and_shows_its_outputs() -> None:
    channel = MemoryChannel()
    host = host_of(quote_app(), channel)
    session = await host.open()
    shown = await host.page(session, {"seats": 3, "plan": "Business"})
    assert shown == {
        "total": "900 €",
        "lines": [{"item": "Business, Annual", "amount": 900}],
    }
    pages = [event for event in channel.events if isinstance(event, PageShown)]
    assert pages == [
        PageShown(session.id, {"seats": 3, "plan": "Business", "term": "Annual"}, shown)
    ]
    # Each with its default: the page from the start.
    assert (await host.page(session, {}))["total"] == "1200 €"


async def test_inputs_its_form_refuses_are_refused_in_a_sentence() -> None:
    application = quote_app()
    host = host_of(application)
    session = await host.open()
    for inputs, sentence in (
        ({"seats": 0}, "seats: 0 is less than the minimum of 1"),
        ({"plan": "Free"}, "'Free' is not one of ['Team', 'Business']"),
        ({"colour": "red"}, "The page of Quote has no input colour"),
    ):
        with pytest.raises(
            ValueError, match=sentence.replace("[", r"\[").replace("]", r"\]")
        ):
            await host.page(session, inputs)
        refused = form_values_refused(application.spec, PAGE_ACTION, {"inputs": inputs})
        assert refused is not None and sentence in refused
    assert form_values_refused(application.spec, PAGE_ACTION, {"inputs": "x"}) == (
        'A page\'s inputs are values by name: {"inputs": {...}}.'
    )
    assert form_values_refused(application.spec, PAGE_ACTION, {"inputs": {}}) is None


async def test_outputs_it_cannot_show_are_refused_in_a_sentence() -> None:
    def app_returning(value: Any, *outputs: Dict[str, Any]) -> Application:
        app = Application(id="odd", kind="widget", agent="jupyter-data-analyst:0.0.1")
        for output in outputs:
            app.output(**output)

        @app.page
        async def odd(session: Session, n: int = 1) -> Any:
            assert isinstance(session, Session)
            return value

        return app

    two = (
        {"name": "a"},
        {"name": "b", "component": "Chart", "kind": "bar", "x": "x", "y": "y"},
    )
    for application, sentence in (
        (app_returning(["x"], *two), "a page of several outputs returns them by name"),
        (app_returning({"a": "1"}, *two), "did not return b"),
        (
            app_returning({"a": "1", "b": [], "c": 1}, *two),
            "returned c, which its page does not show",
        ),
        (app_returning({"a": "1", "b": [1]}, *two), "its points are a list of records"),
        (app_returning({"x": 1}), "its value is a str or a number, not a dict"),
        (
            app_returning(3, {"name": "plot", "component": "Image"}),
            "its value is its address",
        ),
    ):
        host = host_of(application)
        session = await host.open()
        with pytest.raises(ValueError, match=sentence):
            await host.page(session, {})


async def test_a_table_of_pandas_is_its_rows() -> None:
    pandas = pytest.importorskip("pandas")
    app = Application(id="frame", kind="widget", agent="jupyter-data-analyst:0.0.1")
    app.output("rows", "Table", columns=["a"])

    @app.page
    def frame(n: int = 2) -> Any:
        return pandas.DataFrame({"a": list(range(n))})

    host = host_of(app)
    session = await host.open()
    assert await host.page(session, {"n": 2}) == {"rows": [{"a": 0}, {"a": 1}]}


async def test_the_terminal_says_the_outputs() -> None:
    console = Console(record=True, width=120)
    host = host_of(quote_app(), TerminalChannel(console=console, app_name="Quote"))
    session = await host.open()
    await host.page(session, {"seats": 1})
    said = console.export_text()
    assert "▤ total: 120 €" in said and "▤ lines: 1 rows" in said


def test_the_terminal_runs_the_page_with_slash_page() -> None:
    import asyncio

    from agent_runtimes.loop.apps.terminal import AppTux

    tux = AppTux(
        quote_app(),
        agent_url="http://runtime/api/v1/ag-ui/default/",
        server_url="http://runtime",
        agent_id="default",
    )
    tux.console = tux.channel.console = Console(record=True, width=400)

    async def go() -> None:
        async def prompt(self: Any) -> str:
            return ""

        original = AppTux.__mro__[1].show_prompt
        AppTux.__mro__[1].show_prompt = prompt
        try:
            await tux.show_prompt()
            assert await tux.handle_command('/page {"seats": 2}') is None
            assert await tux.handle_command('/page {"seats": 0}') is None
            assert await tux.handle_command("/page {") is None
        finally:
            AppTux.__mro__[1].show_prompt = original

    asyncio.run(go())
    said = tux.console.export_text()
    assert "▤ total: 240 €" in said
    assert "seats: 0 is less than the minimum of 1" in said
    assert "The inputs are not JSON" in said


# --- over the session API -------------------------------------------------------


def _events(chunks: List[str]) -> List[Dict[str, Any]]:
    return [
        json.loads(line[len("data:") :])
        for chunk in chunks
        for line in chunk.splitlines()
        if line.startswith("data:")
    ]


def live_of(application: Optional[Application], spec: Any = None) -> Any:
    app = spec if spec is not None else application.spec  # type: ignore[union-attr]
    live = sessions.LiveSession(
        uid="session-p05",
        agent_id="quote",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=_nothing),
    )
    if application is not None:
        live.host = AppHost(application, live, recorder=live.recorder)
    return live


async def test_over_the_session_api_the_page_action_answers_a_loop_page_event() -> None:
    live = live_of(quote_app())
    chunks = [
        chunk
        async for chunk in live.action(PAGE_ACTION, payload={"inputs": {"seats": 2}})
    ]
    events = _events(chunks)
    assert [event["type"] for event in events] == [
        "RUN_STARTED",
        "CUSTOM",
        "RUN_FINISHED",
    ]
    assert events[1]["name"] == LOOP_PAGE == "loop.page"
    assert events[1]["value"] == {
        "inputs": {"seats": 2, "plan": "Team", "term": "Annual"},
        "outputs": {
            "total": "240 €",
            "lines": [{"item": "Team, Annual", "amount": 240}],
        },
    }
    # Nothing is said in the conversation.
    assert live.messages == []
    with pytest.raises(sessions.SessionRefused) as refused:
        live.action(PAGE_ACTION, payload={"inputs": {"seats": 0}})
    assert refused.value.status == 422
    assert "seats: 0 is less than the minimum of 1" in refused.value.reason


async def test_a_page_without_its_code_is_refused() -> None:
    spec = quote_app().spec
    live = live_of(None, spec)
    with pytest.raises(sessions.SessionRefused) as refused:
        live.action(PAGE_ACTION, payload={"inputs": {}})
    assert refused.value.status == 422
    assert "has no page of its code (@app.page) here" in refused.value.reason


# --- validation runs it ---------------------------------------------------------

APP_PY = """
from typing import Literal
from agent_runtimes.loop.apps import Application

app = Application(id="quote", kind="widget", agent="jupyter-data-analyst:0.0.1")
app.output("total", title="Total")

@app.page
def quote(seats: int = 10, plan: Literal["Team", "Business"] = "Team") -> str:
    return f"{seats * (12 if plan == 'Team' else 30)} €"
"""


def test_validate_runs_the_page_on_its_defaults(tmp_path: Path) -> None:
    from agent_runtimes.commands.apps import (
        PAGE_TEST,
        PASSES,
        _code_tests_of,
        code_notes,
        validate_file,
    )

    path = tmp_path / "app.py"
    path.write_text(APP_PY)
    report = validate_file(path)
    assert report.verdict == PASSES, report
    assert _code_tests_of(path, report, local=False) is False
    assert report.tests[-1]["says"] == "Not run. --local runs it here."
    report = validate_file(path)
    assert _code_tests_of(path, report, local=True) is False
    assert report.tests == [
        {"name": "quote", "expect": PAGE_TEST, "ask": "", "state": "passed", "says": ""}
    ]
    path.write_text(APP_PY.replace("return f", "return 1 / 0 or f"))
    report = validate_file(path)
    _code_tests_of(path, report, local=True)
    assert report.tests[-1]["state"] == "failed"
    assert "ZeroDivisionError" in report.tests[-1]["says"]
    path.write_text(APP_PY.replace("seats: int = 10", "seats: int"))
    report = validate_file(path)
    _code_tests_of(path, report, local=True)
    assert report.tests[-1]["state"] == "failed"
    assert "seats has no default" in report.tests[-1]["says"]
    # A spec read without its file: nothing runs its page, and it is said.
    notes = code_notes(quote_app().spec)
    assert "Its page is run by its code (quote): run from this spec alone" in notes[-1]
