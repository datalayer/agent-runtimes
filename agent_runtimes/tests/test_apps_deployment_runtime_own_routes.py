# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime that serves a deployment answers only the application's own routes.

PAP_DATALAYER's release gates, decided 14 October 2026: a deployment's kept
runtime — and the one a hosted page launched for it — answers anybody but the
pod itself on the application's own routes only (its sessions, its chat, its
page's plugins and files, its computer, what it remembers, what ai-agents keeps
it with, an application's agent over A2A, the chat's reads of its models,
health). Every other route — configuring it, its inference token, codemode,
its sandbox and its websocket, making, changing, listing or deleting agents,
MCP servers, skills, history, the monitoring stream — answers 404 in a
sentence, whichever agent it names: one gate (`OwnRoutesOnly`), the one the
visitors' runtime is held by.

Every route the app mounts is walked, so a route added later is refused on
such a runtime until it is said to be the application's own here.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_apps_deployment_runtime_own_routes.py -v
```
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Iterator, List, Tuple

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.routing import Mount, WebSocketRoute
from starlette.testclient import WebSocketDenialResponse

from agent_runtimes.app import create_app
from agent_runtimes.loop.apps.principal import OWN_ROUTES_ONLY
from agent_runtimes.loop.apps.visitors import OwnRoutesOnly, path_answered
from agent_runtimes.models.models import remember_app_instance

SHIPPED = "shop-shipped"
BOOTSTRAP = "example-simple"
OUTSIDE = ("203.0.113.9", 50000)
POD = ("127.0.0.1", 50000)

#: The application's own routes, as the decision lists them: (method, path).
OWN = {
    ("GET", "/health"),
    ("GET", "/health/ready"),
    ("GET", "/health/live"),
    ("GET", "/health/startup"),
    # The chat's reads of its models (ChatView: useConfig, the model list).
    ("GET", "/api/v1/configure"),
    ("GET", "/api/v1/configure/models"),
    # Its page's plugins (AppRuntimePlugins).
    ("GET", "/api/v1/apps/{app_id}/plugins/state"),
    ("GET", "/api/v1/apps/{app_id}/plugins/frontend-extensions"),
    ("GET", "/api/v1/apps/{app_id}/reactor-extensions/{extension}/{asset_path:path}"),
    ("GET", "/api/v1/apps/{app_id}/events/stream"),
    # A visitor's page on the visitors' runtime (refused anywhere else, by itself).
    ("POST", "/api/v1/apps/visitors/agent"),
    # What ai-agents keeps a deployment with (STUDIO A-08).
    ("PUT", "/api/v1/apps/a2a"),
    ("DELETE", "/api/v1/apps/a2a"),
    ("POST", "/api/v1/apps/principal"),
    ("GET", "/api/v1/apps/agents/{agent}/deployment"),
    ("GET", "/api/v1/apps"),
    ("GET", "/api/v1/apps/current"),
    ("POST", "/api/v1/apps/decide"),
    ("POST", "/api/v1/apps/feedback"),
    # Each person's own sessions and chat (LOOP R-04).
    ("POST", "/api/v1/apps/sessions"),
    ("GET", "/api/v1/apps/sessions"),
    ("GET", "/api/v1/apps/sessions/{uid}"),
    ("GET", "/api/v1/apps/sessions/{uid}/messages"),
    ("POST", "/api/v1/apps/sessions/{uid}/messages"),
    ("POST", "/api/v1/apps/sessions/{uid}/press"),
    ("POST", "/api/v1/apps/sessions/{uid}/page"),
    ("PUT", "/api/v1/apps/sessions/{uid}/settings"),
    ("POST", "/api/v1/apps/sessions/{uid}/window"),
    ("POST", "/api/v1/apps/sessions/{uid}/stop"),
    ("POST", "/api/v1/apps/sessions/{uid}/end"),
    ("POST", "/api/v1/apps/sessions/logout"),
    ("POST", "/api/v1/apps/sessions/{uid}/resume"),
    ("POST", "/api/v1/apps/agents/{agent}/ag-ui/"),
    ("WS", "/api/v1/apps/ui"),
    ("POST", "/api/v1/apps/agents/{agent}/files"),
    ("GET", "/api/v1/apps/files/{scope}/{ref}"),
    # What it remembers of the caller (LOOP R-18, R-36).
    ("GET", "/api/v1/apps/memories/{app}"),
    ("DELETE", "/api/v1/apps/memories/{app}/{memory_id}"),
    ("PATCH", "/api/v1/apps/memories/{app}/{memory_id}"),
    ("DELETE", "/api/v1/apps/memories/{app}"),
    # Its computer, shown where the person is (LOOP R-23).
    ("GET", "/api/v1/apps/agents/{agent}/computer"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/files"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/file"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/take-over"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/run"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/hand-back"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/browser"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/browser/screenshot"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/click"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/type"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/key"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/scroll"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/open"),
}

#: Mounted as agents are made, not at start: the application's agent over A2A
#: is its own; any agent's AG-UI mount, and another agent's A2A, are not.
DYNAMIC = [
    ("POST", f"/api/v1/a2a/agents/{SHIPPED}/", True),
    ("GET", f"/api/v1/a2a/agents/{SHIPPED}/.well-known/agent-card.json", True),
    ("POST", f"/api/v1/a2a/agents/{BOOTSTRAP}/", False),
    ("POST", f"/api/v1/ag-ui/{SHIPPED}/", False),
    ("POST", f"/api/v1/ag-ui/{BOOTSTRAP}/", False),
]


def _routes(routes: List[Any], prefix: str = "") -> Iterator[Tuple[str, str]]:
    """Every (method, path) an app mounts, websockets ("WS") and mounts ("MOUNT") included."""
    for route in routes:
        original = getattr(route, "original_router", None)
        if original is not None:  # an included router, as FastAPI keeps it
            yield from _routes(original.routes, prefix + route.include_context.prefix)
        elif isinstance(route, Mount):
            yield "MOUNT", prefix + route.path
        elif isinstance(route, WebSocketRoute) or type(route).__name__.endswith(
            "WebSocketRoute"
        ):
            yield "WS", prefix + route.path
        else:
            for method in sorted((route.methods or set()) - {"HEAD"}):
                yield method, prefix + route.path


def _concrete(path: str) -> str:
    """A path with its parameters said: an agent's the deployment's agent."""

    def said(match: "re.Match[str]") -> str:
        name = match.group(1).split(":", 1)[0]
        return SHIPPED if name in ("agent", "agent_id", "app_id", "app") else "x"

    return re.sub(r"\{([^}]+)\}", said, path)


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
def mounted(app: FastAPI) -> List[Tuple[str, str]]:
    return sorted(set(_routes(app.router.routes)))


@pytest.fixture
def deployment() -> Iterator[None]:
    """The runtime serves a deployment: its agent beside the one it was allocated with."""
    remember_app_instance(
        SHIPPED, {"app_uid": "01APP", "deployment_uid": "dep-7", "version": 1}
    )
    try:
        yield
    finally:
        remember_app_instance(SHIPPED, None)


def _through_the_gate(method: str, path: str, client: Tuple[str, int]) -> Any:
    """What the gate does with a request: None when it lets it through, else its answer."""
    reached: List[str] = []
    sent: List[dict[str, Any]] = []

    async def inner(scope: Any, receive: Any, send: Any) -> None:
        reached.append(scope["path"])

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": b""}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    kind = "websocket" if method == "WS" else "http"
    scope = {
        "type": kind,
        "path": path,
        "method": "GET" if method == "WS" else method,
        "client": client,
        "headers": [],
        "query_string": b"",
        "extensions": {"websocket.http.response": {}},
    }
    asyncio.run(OwnRoutesOnly(inner)(scope, receive, send))
    if reached:
        return None
    return sent


def test_the_list_names_only_routes_the_app_mounts(
    mounted: List[Tuple[str, str]],
) -> None:
    missing = OWN - set(mounted)
    assert not missing, f"Said to be the application's own, and not mounted: {missing}"


def test_every_other_route_answers_404_for_a_runtime_that_serves_a_deployment(
    app: FastAPI, mounted: List[Tuple[str, str]], deployment: None
) -> None:
    refused = [(m, p) for m, p in mounted if (m, p) not in OWN]
    assert ("PUT", "/api/v1/configure/inference/token") in refused
    assert ("POST", "/api/v1/agents") in refused
    assert ("WS", "/api/v1/configure/sandbox/ws") in refused
    outside = TestClient(app, client=OUTSIDE)
    for method, path in refused:
        concrete = _concrete(path)
        answer: Any
        if method == "MOUNT":
            concrete, method = concrete.rstrip("/") + "/index.html", "GET"
        if method == "WS":
            with pytest.raises(WebSocketDenialResponse) as denied:
                with outside.websocket_connect(concrete):
                    pass
            answer = denied.value
        else:
            answer = outside.request(method, concrete, json={})
        assert answer.status_code == 404, (method, path, answer.status_code)
        assert answer.json()["detail"] == OWN_ROUTES_ONLY, (method, path)


def test_the_applications_own_routes_stay_reachable_for_a_deployment(
    mounted: List[Tuple[str, str]], deployment: None
) -> None:
    for method, path in OWN:
        assert _through_the_gate(method, _concrete(path), OUTSIDE) is None, (
            method,
            path,
        )
    for method, path, own in DYNAMIC:
        let_through = _through_the_gate(method, path, OUTSIDE) is None
        assert let_through is own, (method, path)


def test_a_runtime_serving_no_deployment_answers_every_route(
    mounted: List[Tuple[str, str]],
) -> None:
    # A Preview's agent (an application, no deployment) changes nothing.
    remember_app_instance(
        SHIPPED, {"app_uid": "01APP", "deployment_uid": "", "version": 1}
    )
    try:
        for method, path in mounted:
            assert (
                _through_the_gate(
                    "GET" if method == "MOUNT" else method, _concrete(path), OUTSIDE
                )
                is None
            ), (method, path)
        for method, path, _ in DYNAMIC:
            assert _through_the_gate(method, path, OUTSIDE) is None
    finally:
        remember_app_instance(SHIPPED, None)


def test_generic_routes_answer_a_runtime_serving_no_deployment(app: FastAPI) -> None:
    outside = TestClient(app, client=OUTSIDE)
    listed = outside.get("/api/v1/agents")
    assert listed.status_code == 200


def test_the_pod_itself_reaches_every_route_of_a_deployments_runtime(
    app: FastAPI, deployment: None
) -> None:
    """The companion (inference token, declared secrets) and the sandbox's MCP proxy calls."""
    assert TestClient(app, client=OUTSIDE).get("/api/v1/agents").status_code == 404
    assert TestClient(app, client=POD).get("/api/v1/agents").status_code == 200
    for method, path in (
        ("PUT", "/api/v1/configure/inference/token"),
        ("POST", "/api/v1/mcp/proxy/x/tools/y"),
        ("WS", "/api/v1/configure/sandbox/ws"),
    ):
        assert _through_the_gate(method, path, POD) is None
        assert _through_the_gate(method, path, OUTSIDE) is not None


def test_the_refusal_is_said_to_a_page_with_cors(
    app: FastAPI, deployment: None
) -> None:
    answer = TestClient(app, client=OUTSIDE).put(
        "/api/v1/configure/inference/token",
        json={"token": "t"},
        headers={"Origin": "https://example.com"},
    )
    assert answer.status_code == 404
    assert answer.json()["detail"] == OWN_ROUTES_ONLY
    assert answer.headers.get("access-control-allow-origin")


def test_the_studio_tools_and_configure_are_not_the_applications() -> None:
    for path in ("/api/v1/apps/configure", "/api/v1/apps/build", "/api/v1/apps/eject"):
        assert not path_answered("POST", path)
