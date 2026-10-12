# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a session says to its page besides its messages, as ``reactor.ui``
ops (REACTOR_UI RU-3): a message's author (``meta``), a message removed
(``remove``), a step (a display, shown as it starts and ends, its output
patched in as it streams), an element in a side panel or on a page (a
display that says where it shows, a ``remove`` closing it), and a window
message (``window``). No ``loop.message``, ``loop.step``, ``loop.element``
or ``loop.window`` event is sent any more.

The stream is the fixture ``fixtures/app_session_ops.json``, its ids and
times made stable; the TypeScript test (``src/chat/base/__tests__/
appSessionOps.test.ts``) decodes the same fixture and draws it.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.loop.apps import AppHost, Application, sessions
from agent_runtimes.loop.apps.callers import Caller
from agent_runtimes.loop.apps.record import AppRecorder

pytest.importorskip("agentspecs.apps")

FIXTURE = Path(__file__).parent / "fixtures" / "app_session_ops.json"

_ID = re.compile(r"\b[0-9a-f]{32}\b")
_TIME = re.compile(r"^\d{4}-\d\d-\d\dT[\d:.]+\+00:00$")


async def _nothing(_body: Any = None) -> None:
    return None


def _stable(value: Any, ids: Dict[str, str]) -> Any:
    """The events with each id named by the order it first appears, and every time one time."""
    if isinstance(value, dict):
        return {key: _stable(item, ids) for key, item in value.items()}
    if isinstance(value, list):
        return [_stable(item, ids) for item in value]
    if isinstance(value, str):
        if _TIME.match(value):
            return "2026-10-12T00:00:00+00:00"
        return _ID.sub(
            lambda m: ids.setdefault(m.group(0), f"id-{len(ids) + 1}"), value
        )
    return value


async def _session_events() -> List[Dict[str, Any]]:
    application = Application(id="runs-desk", kind="chat", agent="example-simple")
    app = application.spec
    live = sessions.LiveSession(
        uid="session-ru3",
        agent_id="runs-desk",
        app=app,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=app, send=_nothing),
    )
    live.host = AppHost(application, live, recorder=live.recorder)
    live.session = await live.host.open(id=live.uid)
    session = live.session
    queue = live._open_stream()

    first = await session.send("Searching…")
    await session.send("Found 3.", author="Searcher")
    async with session.step("gen_query", kind="tool", input="q") as step:
        await step.stream(["SELECT", " 1"])
    panel = await session.show(
        session.ui.text("note", text="Three runs"), where="panel", title="Runs"
    )
    await session.send_window_message({"open": "cart"})
    await first.remove()
    await panel.close()

    events: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        events.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    return _stable(events, {})


async def test_the_session_says_steps_elements_authors_and_windows_as_ops() -> None:
    events = await _session_events()
    if os.environ.get("WRITE_FIXTURES"):
        FIXTURE.write_text(json.dumps(events, indent=2, ensure_ascii=False) + "\n")
    # The fixture the page's test reads is what the session sends.
    assert events == json.loads(FIXTURE.read_text())

    customs = [e for e in events if e["type"] == "CUSTOM"]
    # Nothing but reactor.ui: the loop.* events are gone.
    assert {e["name"] for e in customs} == {"reactor.ui"}
    assert [e["value"]["op"] for e in customs] == ["meta", "window", "remove", "remove"]
    activities = [e for e in events if e["type"].startswith("ACTIVITY_")]
    assert {e["activityType"] for e in activities} == {"reactor.ui"}
    shown = [e["content"]["display"] for e in activities if "content" in e]
    assert [d["type"] for d in shown] == [
        sessions.STEP_DISPLAY_TYPE,
        sessions.STEP_DISPLAY_TYPE,
        "application/vnd.datalayer.loop.answer+json",
    ]
    assert shown[0]["text"] == "tool step gen_query running"
    assert shown[1]["text"] == "tool step gen_query ended"
    assert shown[2]["data"]["where"] == "panel"


def test_no_loop_step_element_message_or_window_name_is_left() -> None:
    """The readers' and the producers' old names are gone (REACTOR_UI RU-3)."""
    for name in ("LOOP_MESSAGE", "LOOP_STEP", "LOOP_ELEMENT", "LOOP_WINDOW", "step_of"):
        assert not hasattr(sessions, name), name
