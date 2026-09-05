# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The decks backend tools, against a fake decks server."""

from __future__ import annotations

import json

import httpx
import pytest

from agent_runtimes.services.runtime_tools import _resolve_python_tool
from agent_runtimes.specs.tools import get_tool_spec
from agent_runtimes.tools import decks

SPEC = {
    "deck": {"title": "Q2 review"},
    "slides": [
        {"type": "title", "title": "Q2 review"},
        {"type": "metrics", "title": "Four numbers", "metrics": []},
        {"type": "bullets", "title": "Next", "items": ["a"]},
    ],
}


class FakeServer:
    def __init__(self) -> None:
        self.decks: dict[str, dict] = {"talks/q2": {"id": "talks/q2", "collection": "talks", "slug": "q2", "spec": SPEC}}
        self.calls: list[tuple[str, str]] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.calls.append((request.method, request.url.path))
        path = request.url.path
        if path == "/decks" and request.method == "GET":
            return httpx.Response(200, json=list(self.decks.values()))
        if path == "/decks" and request.method == "POST":
            body = json.loads(request.content)
            deck_id = f"{body['collection']}/{body['slug']}" if body.get("collection") else body["slug"]
            record = {"id": deck_id, **body}
            self.decks[deck_id] = record
            return httpx.Response(201, json=record)
        deck_id = path[len("/decks/"):]
        if deck_id not in self.decks:
            return httpx.Response(404, text="no such deck")
        if request.method == "GET":
            return httpx.Response(200, json=self.decks[deck_id])
        if request.method == "PUT":
            body = json.loads(request.content)
            record = {"id": deck_id, **body}
            self.decks[deck_id] = record
            return httpx.Response(200, json=record)
        if request.method == "DELETE":
            del self.decks[deck_id]
            return httpx.Response(204)
        return httpx.Response(405)


@pytest.fixture
def server(monkeypatch: pytest.MonkeyPatch) -> FakeServer:
    fake = FakeServer()
    monkeypatch.setattr(decks, "_TRANSPORT", httpx.MockTransport(fake.handle))
    monkeypatch.setenv(decks.DECKS_URL_ENVVAR, "http://decks.test")
    return fake


def test_every_decks_tool_spec_binds_to_a_callable_of_the_same_name() -> None:
    for tool_id in (
        "decks-list-decks", "decks-get-deck", "decks-create-deck", "decks-update-deck",
        "decks-update-slide", "decks-insert-slide", "decks-delete-slide", "decks-delete-deck",
    ):
        spec = get_tool_spec(tool_id)
        assert spec is not None, tool_id
        impl = _resolve_python_tool(spec)
        assert impl is not None and impl.__name__ == spec.runtime.method == tool_id.replace("-", "_")
    assert get_tool_spec("decks-delete-deck").approval == "manual"


@pytest.mark.asyncio
async def test_list_and_get_with_an_outline(server: FakeServer) -> None:
    listed = await decks.decks_list_decks()
    assert listed == [{"id": "talks/q2", "collection": "talks", "slug": "q2", "title": "Q2 review", "subtitle": None, "slides": 3}]
    got = await decks.decks_get_deck("talks/q2")
    assert got["outline"] == [
        {"slide": 1, "type": "title", "title": "Q2 review"},
        {"slide": 2, "type": "metrics", "title": "Four numbers"},
        {"slide": 3, "type": "bullets", "title": "Next"},
    ]
    assert got["spec"] == SPEC
    assert "error" in await decks.decks_get_deck("nope")


@pytest.mark.asyncio
async def test_create_and_slide_edits(server: FakeServer) -> None:
    made = await decks.decks_create_deck("hello", {"deck": {"title": "Hello"}, "slides": [{"type": "title", "title": "Hi"}]})
    assert made["id"] == "hello" and made["slides"] == 1
    after = await decks.decks_update_slide("talks/q2", 3, {"type": "two-columns", "title": "Compared"})
    assert after["outline"][2] == {"slide": 3, "type": "two-columns", "title": "Compared"}
    after = await decks.decks_insert_slide("talks/q2", 2, {"type": "section", "title": "Numbers"})
    assert [s["type"] for s in after["outline"]] == ["title", "section", "metrics", "two-columns"]
    after = await decks.decks_delete_slide("talks/q2", 2)
    assert [s["type"] for s in after["outline"]] == ["title", "metrics", "two-columns"]
    assert "error" in await decks.decks_update_slide("talks/q2", 9, {"type": "section", "title": "x"})
    assert server.calls[-1] == ("GET", "/decks/talks/q2")  # the failed edit wrote nothing


@pytest.mark.asyncio
async def test_delete_and_an_unreachable_server(server: FakeServer, monkeypatch: pytest.MonkeyPatch) -> None:
    assert await decks.decks_delete_deck("talks/q2") == {"ok": True}
    assert await decks.decks_list_decks() == []
    monkeypatch.setattr(decks, "_TRANSPORT", httpx.MockTransport(lambda request: (_ for _ in ()).throw(httpx.ConnectError("refused"))))
    result = await decks.decks_list_decks()
    assert "could not be reached" in result["error"]
