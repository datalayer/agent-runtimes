# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A skill publishes through the runtime without receiving the owner's token."""

from __future__ import annotations

from typing import Any, Iterator

import httpx
import pytest
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
    sent: dict[str, object] = {}

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


# --- through the production middleware -------------------------------------------

POD = ("127.0.0.1", 50000)
OUTSIDE = ("203.0.113.9", 50000)
ROUTE = "/api/v1/library/items/doc-1/publish"
CONFIRMED = {"item_type": "document", "confirm": True}


def _proof() -> str:
    import jwt

    return jwt.encode(
        {"sub": "runtime-1", "deployment_uid": "dep-1"},
        "signed-by-the-platform-and-verified-by-ai-agents",
        algorithm="HS256",
    )


@pytest.fixture(scope="module")
def runtime_app() -> FastAPI:
    from agent_runtimes.app import create_app

    return create_app()


@pytest.fixture
def launched(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """A runtime launched for a deployment, held to its own routes, holding a pod secret.

    Yields
    ------
    None
        Control to the test, with the launched runtime's environment set.
    """
    from agent_runtimes.apps import principal

    async def nothing_read(*_: Any) -> None:
        return None

    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://ai-agents.test")
    monkeypatch.setattr(principal, "read_launched_app", nothing_read)
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "owner-token")
    monkeypatch.setenv("DATALAYER_LIBRARY_URL", "https://library.example")

    async def publish(url, token, payload):
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(library, "_publish", publish)
    principal.forget_runtime_proof()
    principal.give_runtime_proof(_proof(), "the-pods-secret")
    yield
    principal.forget_runtime_proof()


def test_a_skill_publishes_through_the_middleware_while_its_code_runs(
    runtime_app: FastAPI, launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The sandbox shares the loopback and holds no pod secret: its run is its proof."""
    from agent_runtimes.apps import enforcement, principal

    sandbox = TestClient(runtime_app, client=POD)
    # Its owner launched it, but no code of the agent's is running: refused.
    principal._LAUNCHED_BY_OWNER["said"] = True
    idle = sandbox.post(ROUTE, json=CONFIRMED)
    assert idle.status_code == 404, idle.text
    monkeypatch.setattr(enforcement, "code_is_running", lambda: True)
    answered = sandbox.post(ROUTE, json=CONFIRMED)
    assert answered.status_code == 200, answered.text
    assert answered.json()["published"] is True
    # From outside the pod, never.
    outside = TestClient(runtime_app, client=OUTSIDE).post(ROUTE, json=CONFIRMED)
    assert outside.status_code == 404
    # Only the publication: the Library's other routes stay closed.
    assert sandbox.get("/api/v1/agents").status_code == 404


def test_no_skill_publishes_the_owners_work_for_somebody_else(
    runtime_app: FastAPI, launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Launched by a visitor, or the visitors' runtime: the owner is not the one asking."""
    from agent_runtimes.apps import enforcement, principal

    monkeypatch.setattr(enforcement, "code_is_running", lambda: True)
    sandbox = TestClient(runtime_app, client=POD)
    principal._LAUNCHED_BY_OWNER["said"] = False
    assert sandbox.post(ROUTE, json=CONFIRMED).status_code == 404
    principal._LAUNCHED_BY_OWNER["said"] = True
    from agent_runtimes.apps.visitors import VISITORS_ENV

    monkeypatch.setenv(VISITORS_ENV, "example")
    assert sandbox.post(ROUTE, json=CONFIRMED).status_code == 404
