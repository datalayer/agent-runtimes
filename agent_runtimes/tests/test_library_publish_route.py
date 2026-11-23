# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A skill publishes through the runtime without receiving the owner's token."""

from __future__ import annotations

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.routes import library


def client(host: str = "127.0.0.1") -> TestClient:
    app = FastAPI()
    app.include_router(library.router, prefix="/api/v1")
    return TestClient(app, client=(host, 40000))


def test_an_explicitly_confirmed_owned_item_is_published(monkeypatch) -> None:
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "owner-token")
    monkeypatch.setenv("DATALAYER_LIBRARY_URL", "https://library.example")
    monkeypatch.setenv("DATALAYER_UI_URL", "https://datalayer.ai")
    sent = {}

    async def publish(url, token, payload):
        sent.update(url=url, token=token, payload=payload)
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(library, "_publish", publish)
    answer = client().post(
        "/api/v1/library/items/doc-1/publish",
        json={
            "item_type": "document",
            "confirm": True,
            "tags": ["analysis"],
            "description": "The final report",
        },
    )
    assert answer.status_code == 200, answer.text
    assert answer.json()["public_url"] == "https://datalayer.ai/public/documents/doc-1"
    assert sent == {
        "url": "https://library.example/api/library/v1/items/doc-1/public",
        "token": "owner-token",
        "payload": {
            "is_public": True,
            "video": False,
            "tags": ["analysis"],
            "description": "The final report",
        },
    }


def test_publication_needs_confirmation_a_known_type_and_the_pods_loopback(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "owner-token")
    monkeypatch.setenv("DATALAYER_LIBRARY_URL", "https://library.example")
    route = "/api/v1/library/items/item-1/publish"
    assert client().post(route, json={"item_type": "notebook"}).status_code == 409
    assert (
        client().post(route, json={"item_type": "mystery", "confirm": True}).status_code
        == 422
    )
    assert (
        client("10.1.2.3")
        .post(route, json={"item_type": "deck", "confirm": True})
        .status_code
        == 403
    )
