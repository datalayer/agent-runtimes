# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Embedding from Python (LOOP P-25): an application mounted into a FastAPI of
one's own — its page, its session API and its code under one path — and
window messages between the application and the page it sits in.
"""

import json
import re
from typing import Any, Dict, Iterator, List

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from agent_runtimes.loop.apps import Application, Session, WindowMessage, mounting
from agent_runtimes.loop.apps.session import MemoryChannel
from agent_runtimes.tests.test_app_sessions import (  # noqa: F401 - fixtures
    ASSISTANT,
    Runtime,
    answer_of,
    events_of,
    local,
    runtime,
    types_of,
)

pytest.importorskip("agentspecs.apps")


def helpdesk() -> Application:
    """A Python application that answers in words and talks to its page."""
    application = Application.from_spec(
        {
            "schema": "loop.app/v1",
            "id": "help-desk",
            "name": "Help Desk",
            "kind": "chat",
            "agent": "cog-crawler:0.0.1",
            "deployment": {"embedded": {"origins": ["https://shop.example"]}},
        }
    )

    @application.message
    async def reply(session: Session, text: str) -> None:
        await session.send(f"You said {text}.")
        await session.send_window_message({"open": "cart"})

    @application.window
    async def from_page(session: Session, data: Dict[str, Any]) -> None:
        session.state["page"] = data
        await session.send_window_message({"seen": data["page"]})

    return application


@pytest.fixture()
def mounted(
    runtime: Runtime,  # noqa: F811 - the fixture
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[Dict[str, Any]]:
    """The developer's FastAPI, the application mounted at /assistant; its
    agent made as the runtime makes it, on the tests' model."""
    made: List[Dict[str, Any]] = []

    async def create(app: Any, payload: Dict[str, Any], api_prefix: str) -> None:
        made.append({"payload": payload, "prefix": api_prefix})
        runtime.make(
            payload["name"], payload["app_spec"], payload.get("app_instance") or {}
        )

    monkeypatch.setattr(mounting, "create_agent", create)
    api = FastAPI()

    @api.get("/hello")
    def hello() -> Dict[str, str]:
        return {"hello": "world"}

    def visit_token(request: Request) -> str:
        return "visit-token"

    application = helpdesk()
    application.mount(api, path="/assistant", app_uid="app-42", token=visit_token)
    with TestClient(api, client=("127.0.0.1", 50000)) as client:
        yield {"client": client, "made": made, "application": application}


def test_the_mount_serves_the_page_the_session_api_and_the_developers_own_routes(
    mounted: Dict[str, Any],
) -> None:
    client: TestClient = mounted["client"]
    # Its agent was made once, as the page makes it on a runtime.
    [made] = mounted["made"]
    assert made["prefix"] == "/api/v1"
    assert {k: v for k, v in made["payload"].items() if k != "app_spec"} == {
        "name": "help-desk",
        "transport": "ag-ui",
        "agent_spec_id": "cog-crawler",
        "enable_codemode": False,
        "app_instance": {"app_uid": "app-42"},
    }
    assert made["payload"]["app_spec"]["id"] == "help-desk"
    # The developer's own routes are theirs still.
    assert client.get("/hello").json() == {"hello": "world"}
    # The page: the embed, its agent on this server, its Appspec in the element.
    for address in ("/assistant", "/assistant/"):
        page = client.get(address)
        assert page.status_code == 200
        assert page.headers["content-type"].startswith("text/html")
    text = client.get("/assistant").text
    assert (
        '<script src="https://datalayer.ai/embed/datalayer-app.js" async></script>'
        in text
    )
    assert (
        '<datalayer-app server="http://testserver/assistant" token="visit-token">'
        in text
    )
    [spec] = re.findall(r'<script type="application/json">(.*?)</script>', text, re.S)
    assert json.loads(spec)["name"] == "Help Desk"
    # The session API under the same path, its code reacting.
    started = events_of(
        client.post(
            "/assistant/api/v1/apps/sessions",
            json={"agent": "help-desk", "session": "session-m-001", "opener": "Hi"},
        )
    )
    assert answer_of(started) == "You said Hi."
    # What its code tells the page: a loop.window event, not a message.
    [window] = [e for e in started if e.get("name") == "loop.window"]
    assert window["value"] == {"data": {"open": "cart"}}
    # And the runtime's own routes, its status among them.
    assert (
        client.get("/assistant/api/v1/apps/sessions/session-m-001").json()["python"]
        is True
    )


def test_the_page_posts_a_window_message_that_its_code_answers(
    mounted: Dict[str, Any],
) -> None:
    client: TestClient = mounted["client"]
    events_of(
        client.post(
            "/assistant/api/v1/apps/sessions",
            json={"agent": "help-desk", "session": "session-m-002"},
        )
    )
    answered = events_of(
        client.post(
            "/assistant/api/v1/apps/sessions/session-m-002/window",
            json={"data": {"page": "/checkout"}},
        )
    )
    assert types_of(answered) == [
        "CUSTOM:loop.session",
        "RUN_STARTED",
        "CUSTOM:loop.window",
        "RUN_FINISHED",
    ]
    assert answered[2]["value"] == {"data": {"seen": "/checkout"}}
    # A message the page posts is not one of the conversation's.
    turns = client.get("/assistant/api/v1/apps/sessions/session-m-002").json()["turns"]
    assert turns == 0


def test_a_window_message_to_an_application_whose_code_reads_none_is_refused(
    runtime: Runtime,  # noqa: F811 - the fixture
    local: TestClient,  # noqa: F811 - the fixture
) -> None:
    runtime.make("notes-assistant", ASSISTANT, {"app_uid": "app-1"})
    events_of(
        local.post(
            "/api/v1/apps/sessions",
            json={"agent": "notes-assistant", "session": "session-m-003"},
        )
    )
    refused = local.post(
        "/api/v1/apps/sessions/session-m-003/window", json={"data": {"page": "/"}}
    )
    assert (refused.status_code, refused.json()["detail"]) == (
        422,
        "Notes Assistant reads no window message: its code has no @app.window.",
    )


async def test_a_window_message_is_what_json_writes() -> None:
    from agent_runtimes.loop.apps import AppHost
    from agent_runtimes.loop.apps.record import AppRecorder

    async def nothing(_body: Any = None) -> None:
        return None

    application = helpdesk()
    channel = MemoryChannel()
    host = AppHost(
        application, channel, recorder=AppRecorder(app=application.spec, send=nothing)
    )
    session = await host.open()
    await host.window(session, {"page": "/cart"})
    assert channel.events == [WindowMessage(session.id, {"seen": "/cart"})]
    with pytest.raises(ValueError, match="what JSON writes"):
        await session.send_window_message({"when": object()})
    plain = Application(id="plain", kind="chat", agent="example-simple")
    plain_host = AppHost(
        plain, MemoryChannel(), recorder=AppRecorder(app=plain.spec, send=nothing)
    )
    with pytest.raises(KeyError, match="no @app.window"):
        await plain_host.window(await plain_host.open(), {})


def test_an_application_is_mounted_under_a_path_of_its_own() -> None:
    for wrong in ("", "/", "assistant", "/assistant/"):
        with pytest.raises(ValueError, match="a path of its own"):
            helpdesk().mount(FastAPI(), path=wrong)
    assert mounting.agent_spec_id("cog-crawler:0.0.1") == "cog-crawler"
    assert mounting.agent_spec_id("example-simple") == "example-simple"
    page = mounting.page_of(helpdesk(), "https://shop.example/assistant")
    assert "token=" not in page
    # What the spec says cannot end the element it is written in.
    tricky = Application(
        id="tricky", kind="chat", agent="example-simple", description="</script><b>"
    )
    assert "</script><b>" not in mounting.page_of(tricky, "https://x")


async def test_its_agent_is_made_through_the_runtime_s_own_route() -> None:
    """In process, as the page makes it: one already made is kept, a refusal said."""
    from fastapi import HTTPException

    asked: List[Dict[str, Any]] = []
    answers = [200, 409, 500]
    stub = FastAPI()

    @stub.post("/api/v1/agents")
    async def create(body: Dict[str, Any]) -> Dict[str, str]:
        asked.append(body)
        status = answers.pop(0)
        if status != 200:
            raise HTTPException(status_code=status, detail="no")
        return {"id": body["name"]}

    payload = mounting.create_payload(helpdesk())
    await mounting.create_agent(stub, payload, "/api/v1")
    await mounting.create_agent(stub, payload, "/api/v1")
    with pytest.raises(RuntimeError, match=r"was not made \(500\)"):
        await mounting.create_agent(stub, payload, "/api/v1")
    assert [body["name"] for body in asked] == ["help-desk"] * 3
    assert "app_instance" not in payload
