# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A session's ui channel over one WebSocket, on the runtime's server
(RU-W): ``/api/v1/apps/ui``.

The page says hello with its token — the one it gives the session's other
routes, in the first frame, never in the URL — and the session's uid;
receives the session's ops numbered, those it missed replayed; and sends up
the presses of what they offered, each checked by the session's registry and
kept for the run that names it. A token refused is closed 4401; a session
not held here, or somebody else's, 4403; a frame not the schema's, 4400.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Tuple

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel
from starlette.websockets import WebSocketDisconnect

from agent_runtimes.apps import AppHost, Application, sessions
from agent_runtimes.apps.callers import Caller
from agent_runtimes.apps.record import AppRecorder
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    Runtime,
    remote,
    runtime,
)


class Row(BaseModel):
    """What the button presses with: the row it was on (RU-5)."""

    row: int = 0


SOCKET = "/api/v1/apps/ui"
PROTOCOL = "reactor.ui.v1"


async def _ignore(body: Dict[str, Any]) -> None:
    return None


def held(uid: str) -> Tuple[sessions.LiveSession, List[Any]]:
    """A session of ada's held here, whose answer shows a button."""
    application = Application(id="notes-assistant", agent="example-simple")
    pressed: List[Any] = []

    @application.action("again", payload=Row)
    async def again(session: Any, payload: Row) -> None:
        pressed.append(payload.model_dump())
        await session.send("Again.")

    live = sessions.LiveSession(
        uid=uid,
        agent_id="notes-assistant",
        app=application.spec,
        instance={},
        opened_by=Caller(kind="person", uid="ada"),
        acts_as={"kind": "person", "uid": "ada"},
        recorder=AppRecorder(app=application.spec, send=_ignore),
    )
    live.host = AppHost(application, live, recorder=live.recorder)

    async def opened() -> None:
        live.session = await live.host.open(uid=live.uid)
        live._open_stream()
        await live.session.send(
            "Done.",
            show=[
                live.session.ui.button(
                    "go", child="go-label", action={"event": {"name": "again"}}
                ),
                live.session.ui.text("go-label", text="Again"),
            ],
        )
        live._end_stream()

    asyncio.run(opened())
    sessions._SESSIONS[uid] = live
    return live, pressed


def hello(ws: Any, token: str, scope: str, since: Any = None) -> None:
    ws.send_text(
        json.dumps({"t": "hello", "token": token, "scope": scope, "since": since})
    )


def closed_with(ws: Any) -> int:
    with pytest.raises(WebSocketDisconnect) as closed:
        while True:
            ws.receive_json()
    return closed.value.code


def test_the_page_receives_the_sessions_ops_and_presses_up_the_socket(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixtures
) -> None:
    live, pressed = held("session-ws-001")
    with remote.websocket_connect(SOCKET, subprotocols=[PROTOCOL]) as ws:
        assert ws.accepted_subprotocol == PROTOCOL
        hello(ws, "ada", live.uid)
        assert ws.receive_json() == {
            "t": "welcome",
            "v": 1,
            "scope": live.uid,
            "seq": 1,
        }
        shown = ws.receive_json()
        assert (shown["t"], shown["seq"], shown["op"]["op"]) == ("op", 1, "show")
        display = shown["op"]["body"]
        (offer,) = display["actions"]
        press = {
            "action": "again",
            "display_id": display["id"],
            "token": offer["token"],
            "payload": {"row": 2},
            "idempotency_id": "p-1",
        }
        ws.send_text(json.dumps({"t": "action", "ref": "r1", "action": press}))
        assert ws.receive_json() == {
            "t": "result",
            "ref": "r1",
            "ok": True,
            "status": 200,
            "detail": None,
            "value": {"press": "p-1"},
        }
        # Checked, not run: the run that names it runs it.
        assert pressed == []
        forged = {**press, "token": "forged", "idempotency_id": "p-2"}
        ws.send_text(json.dumps({"t": "action", "ref": "r2", "action": forged}))
        refused = ws.receive_json()
        assert (refused["ref"], refused["ok"], refused["status"]) == ("r2", False, 403)
        unknown = {**press, "action": "nobody", "idempotency_id": "p-3"}
        ws.send_text(json.dumps({"t": "action", "ref": "r3", "action": unknown}))
        assert ws.receive_json()["status"] == 422

    async def run() -> str:
        live._end_stream()
        return "".join(
            [
                chunk
                async for chunk in live.run_agui(
                    {"runId": "r1", "messages": []}, loop={"press": "p-1"}, bearer=""
                )
            ]
        )

    said = asyncio.run(run())
    assert pressed == [{"row": 2}]
    assert "Again." in said
    assert "reactor.ui" not in said


def test_two_tabs_on_one_session_each_receive_every_op(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixtures
) -> None:
    live, _ = held("session-ws-002")
    with (
        remote.websocket_connect(SOCKET) as first,
        remote.websocket_connect(SOCKET) as second,
    ):
        for tab in (first, second):
            hello(tab, "ada", live.uid)
            assert tab.receive_json()["t"] == "welcome"
            assert tab.receive_json()["op"]["op"] == "show"
        # A resume after the op it applied gets nothing again.
    with remote.websocket_connect(SOCKET) as again:
        hello(again, "ada", live.uid, since=1)
        assert again.receive_json() == {
            "t": "welcome",
            "v": 1,
            "scope": live.uid,
            "seq": 1,
        }
        again.send_text(json.dumps({"t": "ping"}))
        assert again.receive_json() == {"t": "pong"}


@pytest.mark.parametrize(
    ("token", "scope", "code"),
    [
        ("expired", "session-ws-003", 4401),
        ("bob", "session-ws-003", 4403),
        ("ada", "session-not-here", 4403),
    ],
)
def test_a_hello_that_is_not_the_sessions_is_refused(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixture
    token: str,
    scope: str,
    code: int,
) -> None:
    held("session-ws-003")
    with remote.websocket_connect(SOCKET) as ws:
        hello(ws, token, scope)
        assert closed_with(ws) == code


def test_a_frame_that_is_not_the_schemas_closes_the_socket(
    runtime: Runtime,  # noqa: F811 - the fixture
    remote: TestClient,  # noqa: F811 - the fixtures
) -> None:
    live, pressed = held("session-ws-004")
    with remote.websocket_connect(SOCKET) as ws:
        hello(ws, "ada", live.uid)
        ws.receive_json()
        ws.receive_json()
        # A press without its token is not a press.
        ws.send_text(
            json.dumps(
                {
                    "t": "action",
                    "ref": "r",
                    "action": {"action": "again", "display_id": "x"},
                }
            )
        )
        assert closed_with(ws) == 4400
    assert pressed == [] and live._presses == {}
