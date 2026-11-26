# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A browser's page on the runtime's own machine is no skill, and no proof.

On a person's own machine a page they opened in a browser reaches the
runtime's loopback, where the address alone stood for a skill. What these
tests hold, with one check for every route (`apps.callers`):

- a route only a skill calls (who the runtime runs for and its events, the
  Library publication, a file kept in a Space, the mail to its person)
  refuses a request a browser made, whatever its origin, and serves a script;
- a route the runtime's own pages call too (what an agent or an application
  remembers) refuses, on the loopback, a page that is neither this machine's
  nor the platform's, and serves every caller it served before;
- the server's CORS answers no credentialed request.
"""

from __future__ import annotations

from typing import Any, cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from agent_runtimes.apps import callers

LOOPBACK = ("127.0.0.1", 40000)
OUTSIDE = ("203.0.113.9", 50000)

#: What a browser puts on a request, each alone.
A_BROWSERS = [
    {"Origin": "https://evil.example"},
    {"Origin": "null"},
    {"Origin": "http://127.0.0.1:8765"},
    {"Sec-Fetch-Site": "cross-site"},
    {"Sec-Fetch-Mode": "cors"},
    {"Sec-Fetch-Dest": "empty"},
]

#: A page that is neither this machine's nor the platform's.
A_STRANGERS = [
    {"Origin": "https://evil.example"},
    {"Origin": "null"},
    {"Sec-Fetch-Site": "cross-site"},
]

#: A page of this machine, or of the platform (`DATALAYER_UI_URL`).
OUR_OWN = [
    {"Origin": "http://localhost:3063"},
    {"Origin": "http://127.0.0.1:8765", "Sec-Fetch-Site": "same-site"},
    {"Origin": "https://datalayer.example", "Sec-Fetch-Site": "cross-site"},
    {"Sec-Fetch-Site": "same-origin"},
]


def _request(headers: dict[str, str], client: tuple[str, int] = LOOPBACK) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "client": client,
            "headers": [
                (name.lower().encode(), value.encode())
                for name, value in headers.items()
            ],
        }
    )


def _served(router: Any, client: tuple[str, int] = LOOPBACK) -> TestClient:
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    return TestClient(app, client=client)


@pytest.fixture(autouse=True)
def the_platforms_page(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AGENT_RUNTIMES_APP_ORIGINS", raising=False)
    monkeypatch.delenv("DATALAYER_RUN_URL", raising=False)
    monkeypatch.setenv("DATALAYER_UI_URL", "https://datalayer.example")


# --- the one check ---------------------------------------------------------------


def test_a_request_says_a_browser_made_it_and_a_scripts_does_not() -> None:
    assert not callers.from_a_browser(_request({}).headers)
    assert not callers.from_a_browser(_request({"User-Agent": "python-httpx"}).headers)
    for headers in A_BROWSERS:
        assert callers.from_a_browser(_request(headers).headers), headers


def test_a_skill_is_a_script_on_the_loopback_and_nothing_else() -> None:
    from fastapi import HTTPException

    callers.refuse_unless_a_skill(_request({}), "Only a skill asks.")
    with pytest.raises(HTTPException) as outside:
        callers.refuse_unless_a_skill(_request({}, OUTSIDE), "Only a skill asks.")
    assert outside.value.status_code == 403
    assert outside.value.detail == "Only a skill asks."
    for headers in A_BROWSERS:
        with pytest.raises(HTTPException) as page:
            callers.refuse_unless_a_skill(_request(headers), "Only a skill asks.")
        assert page.value.status_code == 403
        assert page.value.detail == "Only a skill asks: a browser's page is not one."


def test_a_strangers_page_is_told_from_this_machines_and_the_platforms() -> None:
    for headers in A_STRANGERS:
        assert callers.from_a_strangers_page(_request(headers).headers), headers
    for headers in [{}, *OUR_OWN]:
        assert not callers.from_a_strangers_page(_request(headers).headers), headers


def test_a_strangers_page_is_refused_only_where_the_loopback_stands_for_proof() -> None:
    from fastapi import HTTPException

    for headers in A_STRANGERS:
        with pytest.raises(HTTPException) as refused:
            callers.refuse_a_strangers_page(_request(headers))
        assert refused.value.status_code == 403 and "page" in refused.value.detail
        # From anywhere else a call proves itself with a token, as before.
        callers.refuse_a_strangers_page(_request(headers, OUTSIDE))
        # A forwarding header a page sends itself proves nothing.
        with pytest.raises(HTTPException):
            callers.refuse_a_strangers_page(
                _request({**headers, "X-Forwarded-For": "203.0.113.9"})
            )
    for headers in [{}, *OUR_OWN]:
        callers.refuse_a_strangers_page(_request(headers))


# --- the routes only a skill calls -----------------------------------------------


@pytest.mark.parametrize("headers", A_BROWSERS)
def test_a_browsers_page_keeps_no_file_in_the_owners_space(
    headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.routes import spaces

    read: list[str] = []

    def owner_token() -> str:
        read.append("token")
        return ""

    monkeypatch.setattr(spaces, "owner_token", owner_token)
    refused = _served(spaces.router).post(
        "/api/v1/spaces/files?name=a.txt", content=b"hello", headers=headers
    )
    assert refused.status_code == 403, refused.text
    assert "browser" in refused.json()["detail"]
    assert read == [], "refused before the owner's token is read"


def test_a_skills_script_still_reaches_the_space_and_only_from_the_pod(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.routes import spaces

    read: list[str] = []

    def owner_token() -> str:
        read.append("token")
        return ""

    monkeypatch.setattr(spaces, "owner_token", owner_token)
    passed = _served(spaces.router).post(
        "/api/v1/spaces/files?name=a.txt", content=b"hello"
    )
    assert read == ["token"], passed.text
    assert "browser" not in passed.text and "own pod" not in passed.text
    outside = _served(spaces.router, OUTSIDE).post(
        "/api/v1/spaces/files?name=a.txt", content=b"hello"
    )
    assert outside.status_code == 403 and "browser" not in outside.text
    assert read == ["token"]


@pytest.mark.parametrize("headers", A_BROWSERS)
def test_a_browsers_page_mails_nobody(
    headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.routes import configure
    from agent_runtimes.tools import social

    sent: list[Any] = []

    async def send(*said: Any) -> dict[str, Any]:
        sent.append(said)
        return {"sent": True, "to": "me"}

    monkeypatch.setattr(social, "send_mail", send)
    refused = _served(configure.router).post(
        "/api/v1/configure/mail", json={"subject": "s", "text": "t"}, headers=headers
    )
    assert refused.status_code == 403, refused.text
    assert "browser" in refused.json()["detail"]
    assert sent == []


def test_a_skills_script_still_mails_its_person(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.routes import configure, owner
    from agent_runtimes.tools import social

    sent: list[Any] = []

    async def send(*said: Any) -> dict[str, Any]:
        sent.append(said)
        return {"sent": True, "to": "me"}

    monkeypatch.setattr(social, "send_mail", send)
    monkeypatch.setattr(owner, "mail_place_refusal", lambda: None)
    answered = _served(configure.router).post(
        "/api/v1/configure/mail", json={"subject": "s", "text": "t"}
    )
    assert answered.status_code == 200, answered.text
    assert answered.json() == {"sent": True, "to": "me"} and sent == [("me", "s", "t")]


# --- the routes the runtime's own pages call too ----------------------------------

AGENT_MEMORY = (
    ("GET", "/api/v1/agents/crawler/memory", None),
    ("POST", "/api/v1/agents/crawler/memory/search", {"query": "tea"}),
    ("POST", "/api/v1/agents/crawler/memory", {"content": "Likes tea."}),
    ("DELETE", "/api/v1/agents/crawler/memory/m-1", None),
    ("DELETE", "/api/v1/agents/crawler/memory?count=0", None),
)


class _Memory:
    """A durable memory that counts what reaches it."""

    def __init__(self) -> None:
        self.reached: list[str] = []

    async def list_all(self, **_: Any) -> list[dict[str, Any]]:
        self.reached.append("list")
        return []

    async def search(self, query: str, **_: Any) -> list[dict[str, Any]]:
        self.reached.append("search")
        return []

    async def add(self, messages: Any, **_: Any) -> None:
        self.reached.append("add")

    async def forget(self, memory_id: str) -> bool:
        self.reached.append("forget")
        return True

    async def forget_all(self) -> int:
        self.reached.append("forget_all")
        return 0


@pytest.fixture
def remembers() -> Any:
    from agent_runtimes.memory import (
        register_memory_backend,
        unregister_memory_backend,
    )

    backend = _Memory()
    # A stand-in with only the methods the routes call.
    register_memory_backend("crawler", cast(Any, backend))
    yield backend
    unregister_memory_backend("crawler")


@pytest.mark.parametrize("headers", A_STRANGERS)
def test_a_strangers_page_reaches_nothing_an_agent_remembers(
    headers: dict[str, str], remembers: _Memory
) -> None:
    from agent_runtimes.routes import agents

    page = _served(agents.router)
    for method, route, body in AGENT_MEMORY:
        refused = page.request(method, route, json=body, headers=headers)
        assert refused.status_code == 403, (method, route, refused.text)
        assert "page" in refused.json()["detail"]
    assert remembers.reached == []


@pytest.mark.parametrize("headers", [{}, *OUR_OWN])
def test_a_script_and_our_own_pages_reach_what_an_agent_remembers(
    headers: dict[str, str], remembers: _Memory
) -> None:
    from agent_runtimes.routes import agents

    page = _served(agents.router)
    for method, route, body in AGENT_MEMORY:
        answered = page.request(method, route, json=body, headers=headers)
        assert answered.status_code == 200, (method, route, answered.text)
    assert {"list", "search", "add", "forget", "forget_all"} == set(remembers.reached)


def test_a_call_from_elsewhere_is_judged_by_its_token_as_before(
    remembers: _Memory,
) -> None:
    """Off the loopback the address proves nothing and a page presents its token
    to the gate: no origin is refused here. On the loopback a forwarding header
    the page sends itself does not make it one from elsewhere."""
    from agent_runtimes.routes import agents

    stranger = {"Origin": "https://evil.example"}
    assert (
        _served(agents.router, OUTSIDE)
        .get("/api/v1/agents/crawler/memory", headers=stranger)
        .status_code
        == 200
    )
    assert (
        _served(agents.router)
        .get(
            "/api/v1/agents/crawler/memory",
            headers={**stranger, "X-Forwarded-For": "203.0.113.9"},
        )
        .status_code
        == 403
    )


@pytest.mark.parametrize("headers", A_STRANGERS)
def test_a_strangers_page_reaches_nothing_an_application_remembers(
    headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.routes import apps

    asked: list[str] = []

    async def whose(request: Any) -> str:
        asked.append("whose")
        return "u-owner"

    monkeypatch.setattr(apps, "_whose", whose)
    page = _served(apps.router)
    for method, route, body in (
        ("GET", "/api/v1/apps/memories/app-1", None),
        ("DELETE", "/api/v1/apps/memories/app-1/m-1", None),
        ("PATCH", "/api/v1/apps/memories/app-1/m-1", {"memory": "Likes tea."}),
        ("DELETE", "/api/v1/apps/memories/app-1?count=0", None),
    ):
        refused = page.request(method, route, json=body, headers=headers)
        assert refused.status_code == 403, (method, route, refused.text)
        assert "page" in refused.json()["detail"]
    assert asked == [], "refused before anybody's memories are named"


def test_a_script_still_reaches_what_an_application_remembers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.routes import apps

    class Remembered:
        async def list_all(self, **_: Any) -> list[dict[str, Any]]:
            return []

    async def whose(request: Any) -> str:
        return "u-owner"

    monkeypatch.setattr(apps, "_whose", whose)
    monkeypatch.setattr(apps, "_memory_of", lambda app, user: Remembered())
    for headers in [{}, *OUR_OWN]:
        answered = _served(apps.router).get(
            "/api/v1/apps/memories/app-1", headers=headers
        )
        assert answered.status_code == 200 and answered.json()["count"] == 0


# --- CORS --------------------------------------------------------------------------


def test_the_servers_cors_answers_no_credentialed_request() -> None:
    """Any origin is answered, and none with credentials: the runtime's clients send
    a bearer token (a ``token`` query on a websocket), never a cookie, and with
    credentials allowed a request carrying a cookie had its origin echoed back."""
    from fastapi.middleware.cors import CORSMiddleware

    from agent_runtimes.app import create_app

    app = create_app()
    (cors,) = [m for m in app.user_middleware if m.cls is CORSMiddleware]
    assert cors.kwargs["allow_origins"] == ["*"]
    assert cors.kwargs["allow_credentials"] is False
    client = TestClient(app, client=LOOPBACK)
    plain = client.get("/health", headers={"Origin": "https://evil.example"})
    assert plain.headers.get("access-control-allow-origin") == "*"
    assert "access-control-allow-credentials" not in plain.headers
    # With a cookie, Starlette may echo the origin back (some versions do, with
    # "*" allowed and credentials off); credentials are never allowed.
    with_cookie = client.get(
        "/health",
        headers={"Origin": "https://evil.example", "Cookie": "a=b"},
    )
    assert with_cookie.headers.get("access-control-allow-origin") in (
        "*",
        "https://evil.example",
    )
    assert "access-control-allow-credentials" not in with_cookie.headers
