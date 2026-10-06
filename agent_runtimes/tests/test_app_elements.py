# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Where an element shows: inline, in a side panel, or on a page of its own,
opened and closed from Python (LOOP P-18).
"""

import json
from typing import Any, Dict, List

import pytest
from rich.console import Console

from agent_runtimes.loop.apps import (
    AppHost,
    Application,
    Closed,
    MemoryChannel,
    Message,
    Removed,
    Shown,
    sessions,
)
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.record import AppRecorder
from agent_runtimes.loop.apps.terminal import TerminalChannel

pytest.importorskip("agentspecs.apps")


async def _nothing(_body: Any = None) -> None:
    return None


def runs_app() -> Application:
    return Application(id="runs-desk", kind="chat", agent="example-simple")


async def opened(channel: Any) -> Any:
    application = runs_app()
    host = AppHost(
        application,
        channel,
        recorder=AppRecorder(app=application.spec, send=_nothing),
    )
    return await host.open()


async def test_a_panel_is_opened_changed_and_closed() -> None:
    channel = MemoryChannel()
    session = await opened(channel)
    table = session.ui.table("runs", columns=["model"], rows={"path": "/runs"})
    panel = await session.show(
        table, where="panel", title="Runs", data={"runs": [{"model": "a"}]}
    )
    assert (panel.where, panel.title) == ("panel", "Runs")
    assert channel.shown == [
        Shown(
            panel.id,
            session.id,
            "panel",
            "Runs",
            panel.components,
            {"runs": [{"model": "a"}]},
        )
    ]
    assert session.elements == {panel.id: panel}
    changed = await panel.update(data={"runs": [{"model": "a"}, {"model": "b"}]})
    assert changed.id == panel.id and changed.title == "Runs"
    assert channel.shown[0].data == {"runs": [{"model": "a"}, {"model": "b"}]}
    assert len([e for e in channel.events if isinstance(e, Shown)]) == 2
    await panel.close()
    assert channel.shown == [] and session.elements == {}
    assert channel.events[-1] == Closed(panel.id, session.id)
    with pytest.raises(ValueError, match=f"No element {panel.id} is open"):
        await session.close(panel.id)


async def test_a_page_is_named_by_the_code_and_closed_by_its_id() -> None:
    channel = MemoryChannel()
    session = await opened(channel)
    page = await session.show(
        [
            session.ui.text("intro", text="The report"),
            session.ui.table("rows", columns=["a"]),
        ],
        where="page",
        id="report",
    )
    assert page.id == "report" and page.title == "Runs desk"
    assert [node["id"] for node in channel.shown[0].components] == ["intro", "rows"]
    again = await session.show(
        session.ui.text("intro", text="Done"), where="page", id="report"
    )
    assert again.id == "report" and len(channel.shown) == 1
    with pytest.raises(ValueError, match="Element report is open on a page of its own"):
        await session.show(session.ui.text("x", text="y"), where="panel", id="report")
    await session.close("report")
    assert channel.shown == []


async def test_inline_is_a_message_of_the_conversation() -> None:
    channel = MemoryChannel()
    session = await opened(channel)
    inline = await session.show(session.ui.text("note", text="Hello"), title="A note")
    assert inline.where == "inline" and isinstance(inline.message, Message)
    assert channel.messages[-1].text == "A note"
    assert [node["id"] for node in channel.messages[-1].components] == ["note"]
    await inline.update(session.ui.text("note", text="Bye"))
    assert channel.messages[-1].components[0]["text"] == "Bye"
    await session.close(inline)
    assert isinstance(channel.events[-1], Removed)
    assert channel.shown == []


async def test_what_cannot_be_shown_is_refused() -> None:
    session = await opened(MemoryChannel())
    with pytest.raises(
        ValueError, match="An element shows inline, panel or page, not 'dock'"
    ):
        await session.show(session.ui.text("a", text="b"), where="dock")
    with pytest.raises(ValueError, match="a component at least"):
        await session.show([], where="panel")
    with pytest.raises(ValueError):
        await session.show({"id": "x", "component": "Nothing"}, where="panel")


async def test_the_terminal_says_what_it_cannot_open() -> None:
    console = Console(record=True, width=120)
    session = await opened(TerminalChannel(console=console, app_name="Runs desk"))
    panel = await session.show(
        session.ui.table("runs", columns=["model"], title="Last runs"),
        where="panel",
        title="Runs",
    )
    await panel.update(title="Runs")
    await panel.close()
    said = console.export_text()
    assert "▸ Runs, shown in the side panel:" in said
    assert "▣ Table runs: Last runs" in said
    assert "▸ Runs, changed in the side panel:" in said
    assert "▹ Runs, closed." in said


def _drain(queue: Any) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        if chunk is None:
            continue
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    return events


async def test_over_the_session_api_an_element_is_a_loop_element_event() -> None:
    application = runs_app()
    app = application.spec
    live = sessions.LiveSession(
        uid="session-0018",
        agent_id="runs-desk",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=_nothing),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    live.session = await live.host.open(id=live.uid)
    queue = live._open_stream()
    session = live.session
    panel = await session.show(
        session.ui.table("runs", columns=["model"], rows={"path": "/runs"}),
        where="panel",
        title="Runs",
        data={"runs": [{"model": "a"}]},
    )
    page = await session.show(session.ui.text("t", text="Hi"), where="page", id="hello")
    await page.close()
    events = _drain(queue)
    assert [(e["type"], e["name"]) for e in events] == [
        ("CUSTOM", sessions.LOOP_ELEMENT)
    ] * 3
    shown = events[0]["value"]
    assert (shown["id"], shown["where"], shown["title"]) == (panel.id, "panel", "Runs")
    assert shown["shows"]["surfaceId"] == f"answer-{panel.id}"
    assert shown["shows"]["messages"][2]["updateDataModel"]["value"] == {
        "runs": [{"model": "a"}]
    }
    assert events[1]["value"]["where"] == "page"
    assert events[2]["value"] == {"id": "hello", "closed": True}
    # A resume draws again what was open beside the conversation, and its
    # code can still close it.
    live.state = "stopped"
    resumed: List[Dict[str, Any]] = []
    async for chunk in live.resume():
        resumed.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    again = [e["value"] for e in resumed if e.get("name") == sessions.LOOP_ELEMENT]
    assert [(value["id"], value["where"]) for value in again] == [(panel.id, "panel")]
    queue = live._open_stream()
    await live.session.close(panel.id)
    assert _drain(queue)[-1]["value"] == {"id": panel.id, "closed": True}
