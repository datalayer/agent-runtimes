# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What a session says to its page besides its messages, as ``reactor.ui``
ops on its ui socket (RU-3, RU-W): a message's author (``meta``),
a message removed (``remove``), a step (a display, shown as it starts and
ends, its output patched in as it streams), an element in a side panel or on
a page (a display that says where it shows, a ``remove`` closing it), and a
window message (``window``). The run stream carries the text and AG-UI's
steps by name, and nothing of ``reactor.ui``; no ``loop.message``,
``loop.step``, ``loop.element`` or ``loop.window`` event is sent any more.

Both are the fixture ``fixtures/app_session_ops.json`` — ``run``, the run
stream's events, and ``ui``, the socket's op frames — its ids and times made
stable; the TypeScript test (``src/chat/base/__tests__/appSessionOps.test.ts``)
draws the same fixture, the socket's ops arriving before the run's text.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent_runtimes.apps import AppHost, Application, sessions
from agent_runtimes.apps.callers import Caller
from agent_runtimes.apps.record import AppRecorder

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


async def _session_events() -> Dict[str, Any]:
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
    live.session = await live.host.open(uid=live.uid)
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

    run: List[Dict[str, Any]] = []
    while not queue.empty():
        chunk = queue.get_nowait()
        assert chunk is not None
        run.extend(
            json.loads(line[len("data:") :])
            for line in chunk.splitlines()
            if line.startswith("data:")
        )
    ui = [frame.model_dump(mode="json") for frame in sessions.UI_HUB.ops(live.uid)]
    return _stable({"run": run, "ui": ui}, {})


async def test_the_session_says_steps_elements_authors_and_windows_as_ops() -> None:
    events = await _session_events()
    if os.environ.get("WRITE_FIXTURES"):
        FIXTURE.write_text(json.dumps(events, indent=2, ensure_ascii=False) + "\n")
    # The fixture the page's test reads is what the session sends.
    assert events == json.loads(FIXTURE.read_text())

    run, ui = events["run"], events["ui"]
    # Nothing of reactor.ui on the run: its text, and AG-UI's steps by name.
    assert {e["type"] for e in run} == {
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_END",
        "STEP_STARTED",
        "STEP_FINISHED",
    }
    # On the socket, numbered from 1 with no gap.
    assert [frame["seq"] for frame in ui] == list(range(1, len(ui) + 1))
    ops = [frame["op"] for frame in ui]
    assert [op["op"] for op in ops] == [
        "meta",
        "show",
        "patch",
        "patch",
        "show",
        "show",
        "window",
        "remove",
        "remove",
    ]
    shown = [op["body"] for op in ops if op["op"] == "show"]
    assert [d["type"] for d in shown] == [
        sessions.STEP_DISPLAY_TYPE,
        sessions.STEP_DISPLAY_TYPE,
        "application/vnd.datalayer.loop.answer+json",
    ]
    assert shown[0]["text"] == "tool step gen_query running"
    assert shown[1]["text"] == "tool step gen_query ended"
    assert shown[2]["data"]["where"] == "panel"


def test_no_loop_step_element_message_or_window_name_is_left() -> None:
    """The readers' and the producers' old names are gone (RU-3)."""
    for name in ("LOOP_MESSAGE", "LOOP_STEP", "LOOP_ELEMENT", "LOOP_WINDOW", "step_of"):
        assert not hasattr(sessions, name), name
