# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Typed actions (RU-5).

Each action of an application's code is declared with the pydantic model of
its payload (``@app.action(name, payload=Model)``), its JSON Schema in the
Appspec. The session offers what its code declares on the application's own
display (``app``), each with a token it minted — ``loop.session`` says them —
and a press is checked before anything runs: offered (403), an action its
code declares (422), with what it takes (422, each field and why). The
handler is given the model; nothing pressed is said to the model. A run
carries no action of its own: a page's block sends a message.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from agent_runtimes.loop.apps import sessions
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    events_of,
    local,
    runtime,
    types_of,
)

SESSIONS = "/api/v1/apps/sessions"


def _opened(local: Any, uid: str) -> Dict[str, Any]:  # noqa: F811
    """Open customer-interview, consent and tell its goal: what it is now."""
    from agentspecs.apps import dump_app, get_app

    events = events_of(
        local.post(SESSIONS, json={"agent": "customer-interview", "session": uid})
    )
    events_of(local.post(f"{SESSIONS}/{uid}/messages", json={"text": "Yes"}))
    events_of(
        local.post(
            f"{SESSIONS}/{uid}/messages", json={"text": "Why people leave the trial."}
        )
    )
    assert dump_app(get_app("customer-interview"))["interface"]["actions"]
    return events[0]["value"]


def _press(
    offer: Dict[str, Any], payload: Dict[str, Any], **change: Any
) -> Dict[str, Any]:
    return {
        "action": offer["name"],
        "display_id": offer["display_id"],
        "token": offer["token"],
        "payload": payload,
        **change,
    }


def test_the_session_offers_what_its_code_declares_and_runs_it_typed(
    runtime: Runtime,
    local: Any,  # noqa: F811 - the fixture
) -> None:
    from agentspecs.apps import dump_app, get_app

    model = runtime.make(
        "customer-interview",
        dump_app(get_app("customer-interview")),
        {"app_uid": "app-ci"},
    )
    said = _opened(local, "typed-0001")
    offered = {offer["name"]: offer for offer in said["actions"]}
    assert sorted(offered) == ["finish", "save"]
    assert {offer["display_id"] for offer in offered.values()} == {"app"}
    url = f"{SESSIONS}/typed-0001/press"
    insight = {"insight": "Setup held them back.", "quote": "It took a week."}

    events = events_of(local.post(url, json=_press(offered["save"], insight)))
    assert types_of(events)[:2] == ["CUSTOM:loop.session", "RUN_STARTED"]
    assert types_of(events)[-1] == "RUN_FINISHED"
    [kept] = [
        entry["payload"]
        for entry in runtime.entries("feedback")
        if entry["session_uid"] == "typed-0001"
    ]
    assert kept == insight
    # Nothing pressed is said to the model.
    assert all("It took a week." not in prompt for prompt in model.prompts)

    def refused(body: Dict[str, Any]) -> tuple:
        answer = local.post(url, json=body)
        return answer.status_code, answer.json()["detail"]

    status, detail = refused(_press(offered["save"], {"insight": "x"}))
    assert status == 422 and "quote: Field required" in detail
    # A field its model does not name is refused, never dropped.
    assert refused(_press(offered["save"], {**insight, "secret": "s"})) == (
        422,
        "'save' was pressed with what it does not take — secret: not one of its fields.",
    )
    assert refused(_press(offered["finish"], {"why": "done"})) == (
        422,
        "'finish' was pressed with what it does not take — why: not one of its fields.",
    )
    assert refused(_press(offered["save"], insight, token="forged"))[0] == 403
    assert refused(_press(offered["save"], insight, action="delete"))[0] == 422
    assert refused(_press(offered["save"], insight, display_id="elsewhere"))[0] == 403
    assert refused({"action": "save"})[0] == 422


def test_a_run_carries_no_action_and_an_application_without_code_offers_none(
    runtime: Runtime,
    local: Any,  # noqa: F811 - the fixture
) -> None:
    model = runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    events = events_of(
        local.post(SESSIONS, json={"agent": "notes-assistant", "session": "typed-0002"})
    )
    assert events[0]["value"]["actions"] == []
    pressed = local.post(
        f"{SESSIONS}/typed-0002/press",
        json={"action": "select", "display_id": "app", "token": "t", "payload": {}},
    )
    assert pressed.status_code == 422
    assert "offers nothing to press" in pressed.json()["detail"]
    run = local.post(
        "/api/v1/apps/agents/notes-assistant/ag-ui/",
        json={
            "threadId": "typed-0002",
            "runId": "run-1",
            "messages": [{"id": "m1", "role": "user", "content": "Chosen."}],
            "forwardedProps": {
                "loop": {"action": {"name": "select", "payload": {"secret": "s"}}}
            },
        },
    )
    assert run.status_code == 422
    assert run.json()["detail"].startswith("A run carries no action")
    assert model.prompts == []
    assert local.post(f"{SESSIONS}/typed-0002/actions", json={}).status_code in (
        404,
        405,
    )


def test_what_the_session_offers_is_pressed_up_the_ui_socket(
    runtime: Runtime,
    local: Any,  # noqa: F811 - the fixture
) -> None:
    from agentspecs.apps import dump_app, get_app
    from reactor.ui import UiAction, UiActionError

    from agent_runtimes.loop.apps.callers import Caller

    runtime.make(
        "customer-interview",
        dump_app(get_app("customer-interview")),
        {"app_uid": "app-ci"},
    )
    said = _opened(local, "typed-0003")
    offered = {offer["name"]: offer for offer in said["actions"]}
    live = sessions.session_of("typed-0003")
    assert live is not None
    caller = Caller(kind="local", uid="")
    key = live.press_up(
        caller,
        UiAction.model_validate(_press(offered["finish"], {}, idempotency_id="f-1")),
    )
    assert key == {"press": "f-1"}
    with pytest.raises(UiActionError) as wrong:
        live.press_up(
            caller, UiAction.model_validate(_press(offered["save"], {"insight": "x"}))
        )
    assert wrong.value.status_code == 422
    chunks: List[str] = []

    async def run() -> None:
        async for chunk in live.run_agui(
            {"runId": "run-f", "messages": []}, loop={"press": "f-1"}, bearer=""
        ):
            chunks.append(chunk)

    import asyncio

    asyncio.run(run())
    assert "RUN_FINISHED" in "".join(chunks)
    [result] = [
        entry["payload"]
        for entry in runtime.entries("output")
        if entry["session_uid"] == "typed-0003" and "goal" in entry["payload"]
    ]
    assert result["goal"] == "Why people leave the trial."
