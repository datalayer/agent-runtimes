# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""The lock on a runtime's own routes, and what it says of its sandbox to whom.

Every route of the runtime that is not public, an application's own or
self-proving answers a caller that proved the runtime is theirs
(`callers.proves_the_runtime`): the runtime's own token or its owner's
Datalayer token, from the machine itself as from anywhere else, but for the
few routes a skill's script calls from the sandbox. `apps.visitors.OwnersOnly` holds them to it,
served and logged in ``log`` mode, refused in ``enforce`` mode; and the
sandbox's own credentials are said to such a caller alone.

The first tests hold every route of the application to its class: a route
added tomorrow is the owner's unless it is listed here as well as there, so
none ships open by accident.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import pytest
from starlette.testclient import TestClient, WebSocketDenialResponse

from agent_runtimes.apps import callers, visitors
from agent_runtimes.apps.callers import Caller, CallerRefused

OUTSIDE = ("203.0.113.9", 40000)
LOOPBACK = ("127.0.0.1", 40001)

SANDBOX_TOKEN = "the-sandbox-jupyter-token"
OWNER = "01OWNER"

#: Tokens and what the platform says of each (`CallerVerifier.verify`).
TOKENS: dict[str, Any] = {
    "owner-token": Caller(kind="person", uid=OWNER),
    "another-token": Caller(kind="person", uid="01SOMEBODYELSE"),
    "principal-token": Caller(kind="principal", uid="01AGENT", app_uid="app"),
    "embed-token": Caller(kind="embed", uid="01EMBED", app_uid="app"),
    "host-token": Caller(kind="host", uid="01LINKED", deployment_uid="dep"),
    "visitor-token": Caller(kind="visitor", uid="visitor-1", app_uid="example"),
    "expired-token": CallerRefused(401, "The token has expired."),
    "iam-is-down": CallerRefused(503, "The platform could not be reached."),
}

#: Answered with no credential: what `visitors.PUBLIC_ROUTES` lists, said again.
PUBLIC = {
    ("GET", "/health"),
    ("GET", "/health/live"),
    ("GET", "/health/ready"),
    ("GET", "/health/startup"),
    ("GET", "/agent"),
    ("GET", "/static/{path:path}"),
    ("GET", "/html/{path:path}"),
    ("GET", "/api/v1/apps/{app_id}/plugins/state"),
    ("GET", "/api/v1/apps/{app_id}/plugins/frontend-extensions"),
    ("GET", "/api/v1/apps/{app_id}/events/stream"),
    ("GET", "/api/v1/apps/{app_id}/reactor-extensions/{extension}/{asset_path:path}"),
}

#: Self-proving: what `visitors.OWN_PROOF_ROUTES` lists, said again.
OWN_PROOF = {
    ("POST", "/api/v1/agent/handoff/exchange"),
    ("GET", "/api/v1/mcp/auth/callback"),
    ("POST", "/api/v1/identity/oauth/token"),
    ("POST", "/api/v1/identity/oauth/userinfo"),
    ("GET", "/api/v1/agents/{agent_id}/webhook"),
    ("POST", "/api/v1/agents/{agent_id}/webhook"),
    ("GET", "/ate/wakeup"),
    ("GET", "/ate/identity"),
    ("GET", "/ping"),
    ("POST", "/invocations"),
    ("WS", "/ws"),
}

#: The application routes, each of which verifies its caller itself
#: (`routes.apps._authorize`). A route added to the application is added here.
APPLICATION = {
    ("DELETE", "/api/v1/apps/a2a"),
    ("DELETE", "/api/v1/apps/memories/{app}"),
    ("DELETE", "/api/v1/apps/memories/{app}/{memory_id}"),
    ("DELETE", "/api/v1/apps/sessions/{uid}"),
    ("DELETE", "/api/v1/apps/sessions/{uid}/rules/{name}"),
    ("GET", "/api/v1/apps"),
    ("GET", "/api/v1/apps/agents/{agent}/computer"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/browser"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/browser/screenshot"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/file"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/files"),
    ("GET", "/api/v1/apps/agents/{agent}/computer/repository"),
    ("GET", "/api/v1/apps/agents/{agent}/deployment"),
    ("GET", "/api/v1/apps/agents/{agent}/equipment"),
    ("GET", "/api/v1/apps/current"),
    ("GET", "/api/v1/apps/files/{scope}/{ref}"),
    ("GET", "/api/v1/apps/memories/{app}"),
    ("GET", "/api/v1/apps/sessions"),
    ("GET", "/api/v1/apps/sessions/{uid}"),
    ("GET", "/api/v1/apps/sessions/{uid}/export"),
    ("GET", "/api/v1/apps/sessions/{uid}/messages"),
    ("GET", "/api/v1/apps/sessions/{uid}/rules"),
    ("GET", "/api/v1/apps/sessions/{uid}/switches"),
    ("PATCH", "/api/v1/apps/memories/{app}/{memory_id}"),
    ("POST", "/api/v1/apps/agents/{agent}/ag-ui/"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/click"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/key"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/open"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/scroll"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/browser/type"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/hand-back"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/run"),
    ("POST", "/api/v1/apps/agents/{agent}/computer/take-over"),
    ("POST", "/api/v1/apps/agents/{agent}/files"),
    ("POST", "/api/v1/apps/build"),
    ("POST", "/api/v1/apps/configure"),
    ("POST", "/api/v1/apps/decide"),
    ("POST", "/api/v1/apps/eject"),
    ("POST", "/api/v1/apps/feedback"),
    ("POST", "/api/v1/apps/owner-secrets"),
    ("POST", "/api/v1/apps/principal"),
    ("POST", "/api/v1/apps/sessions"),
    ("POST", "/api/v1/apps/sessions/import"),
    ("POST", "/api/v1/apps/sessions/logout"),
    ("POST", "/api/v1/apps/sessions/{uid}/agent"),
    ("POST", "/api/v1/apps/sessions/{uid}/audio"),
    ("POST", "/api/v1/apps/sessions/{uid}/clone"),
    ("POST", "/api/v1/apps/sessions/{uid}/end"),
    ("POST", "/api/v1/apps/sessions/{uid}/interrupt"),
    ("POST", "/api/v1/apps/sessions/{uid}/messages"),
    ("POST", "/api/v1/apps/sessions/{uid}/page"),
    ("POST", "/api/v1/apps/sessions/{uid}/press"),
    ("POST", "/api/v1/apps/sessions/{uid}/resume"),
    ("POST", "/api/v1/apps/sessions/{uid}/rules"),
    ("POST", "/api/v1/apps/sessions/{uid}/stop"),
    ("POST", "/api/v1/apps/sessions/{uid}/window"),
    ("POST", "/api/v1/apps/visitors/agent"),
    ("PUT", "/api/v1/apps/a2a"),
    ("PUT", "/api/v1/apps/pod-secret"),
    ("PUT", "/api/v1/apps/runtime-proof"),
    ("PUT", "/api/v1/apps/sessions/{uid}/archived"),
    ("PUT", "/api/v1/apps/sessions/{uid}/settings"),
    ("PUT", "/api/v1/apps/sessions/{uid}/switches"),
    ("PUT", "/api/v1/apps/sessions/{uid}/title"),
    ("WS", "/api/v1/apps/ui"),
}

#: Routes of the owner that this file names, so that the class is not empty by mistake.
SOME_OF_THE_OWNERS = {
    ("GET", "/api/v1/agents"),
    ("POST", "/api/v1/agents"),
    ("POST", "/api/v1/agents/configure-from-spec"),
    ("DELETE", "/api/v1/agents/{agent_id:path}"),
    ("GET", "/api/v1/configure"),
    ("GET", "/api/v1/configure/models"),
    ("PUT", "/api/v1/configure/inference/provider"),
    ("POST", "/api/v1/sandbox/execute"),
    ("GET", "/api/v1/mcp/servers"),
    ("POST", "/api/v1/mcp/servers/catalog/{server_name}/enable"),
    ("GET", "/api/v1/history"),
    ("DELETE", "/api/v1/history"),
    ("GET", "/api/v1/agents/{agent_id}/memory"),
    ("POST", "/api/v1/agents/{agent_id}/checkpoints/{checkpoint_id}/rewind"),
    ("POST", "/api/v1/vercel-ai/{agent_id:path}"),
    ("POST", "/api/v1/vercel-ai/terminate"),
    ("GET", "/api/v1/runtime/status"),
    ("GET", "/openapi.json"),
    ("GET", "/docs"),
    ("GET", "/"),
    ("WS", "/api/v1/configure/sandbox/ws"),
    ("WS", "/api/v1/tool-approvals/ws"),
    ("WS", "/api/v1/acp/ws/{agent_id:path}"),
}


def _path_of(template: str) -> str:
    """A path a route's template answers."""
    return re.sub(r"\{[^}:]+(:path)?\}", "x", template)


class _Verifier:
    """The platform, as these tests have it answer."""

    def __init__(self) -> None:
        self.asked: list[str] = []

    async def verify(self, token: str, app_uid: str = "") -> Caller:
        self.asked.append(token)
        said = TOKENS.get(
            token, CallerRefused(401, "The platform does not accept this token.")
        )
        if isinstance(said, Exception):
            raise said
        return said


class _Sandbox:
    """A sandbox manager whose status says a token, as a runtime's does."""

    def get_status(self) -> dict[str, Any]:
        return {
            "variant": "eval",
            "sandbox_running": True,
            "jupyter_url": f"http://127.0.0.1:2300/jupyter/server/pool/x?token={SANDBOX_TOKEN}",
            "jupyter_token": SANDBOX_TOKEN,
            "jupyter_token_set": True,
            "kernel_id": "kernel-1",
            "kernel_name": "python3",
            "agent_sandboxes": {},
        }

    def get_agent_sandbox(self, agent_id: str) -> None:
        return None

    def get_managed_sandbox(self) -> Any:
        raise RuntimeError("no managed sandbox in this test")


def _app(monkeypatch: pytest.MonkeyPatch, mode: str | None) -> Any:
    from agent_runtimes.app import create_app

    if mode is None:
        monkeypatch.delenv(visitors.ACCESS_MODE_ENV, raising=False)
    else:
        monkeypatch.setenv(visitors.ACCESS_MODE_ENV, mode)
    return create_app()


@pytest.fixture(scope="module")
def apps() -> dict[str, Any]:
    """The application in each mode, made once: the mode is read when it starts."""
    patch = pytest.MonkeyPatch()
    made = {"log": _app(patch, None), "enforce": _app(patch, "enforce")}
    patch.undo()
    return made


@pytest.fixture(autouse=True)
def a_runtime_of_the_owner(monkeypatch: pytest.MonkeyPatch) -> _Verifier:
    """A runtime assigned to OWNER, holding a sandbox token, with the platform faked."""
    from agent_runtimes.models import offered
    from agent_runtimes.services import code_sandbox_manager

    verifier = _Verifier()
    monkeypatch.setattr(callers, "VERIFIER", verifier)
    monkeypatch.setattr(
        code_sandbox_manager, "get_code_sandbox_manager", lambda: _Sandbox()
    )
    monkeypatch.setenv("DATALAYER_USER_UID", OWNER)
    monkeypatch.delenv("DATALAYER_USER_TOKEN", raising=False)
    monkeypatch.setitem(offered._given, "token", None)
    monkeypatch.delenv(visitors.VISITORS_ENV, raising=False)
    callers.forget_proofs()
    callers.forget_reservation_owner()
    visitors._ACCESS_LOGGED.clear()
    return verifier


def _client(app: Any, client: tuple[str, int] = OUTSIDE) -> TestClient:
    return TestClient(app, client=client, raise_server_exceptions=False)


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _classes(app: Any) -> dict[str, set[tuple[str, str]]]:
    found: dict[str, set[tuple[str, str]]] = {}
    for method, template in visitors.route_templates(app):
        if method in ("HEAD", "OPTIONS"):
            continue
        found.setdefault(visitors.route_class(method, _path_of(template)), set()).add(
            (method, template)
        )
    return found


# --- every route has its class, and the lists are what is declared --------------------


def test_the_declared_lists_are_these_and_no_others() -> None:
    assert set(visitors.PUBLIC_ROUTES) == PUBLIC
    assert set(visitors.OWN_PROOF_ROUTES) == OWN_PROOF


def test_every_route_of_the_application_is_the_owners_unless_it_is_listed(
    apps: dict[str, Any],
) -> None:
    classes = _classes(apps["log"])
    assert set(classes) == {"public", "own-proof", "application", "owner"}
    # The pages are routes of their own under the static mounts, which say
    # them all; they are routes only where the frontend was built.
    built = {
        ("GET", "/agent"),
        ("GET", "/static/{path:path}"),
        ("GET", "/html/{path:path}"),
    }
    pages = {
        (m, t)
        for m, t in classes["public"]
        if t.startswith(("/static/", "/html/")) and "{" not in t
    }
    public = classes["public"] - pages
    assert PUBLIC - built <= public <= PUBLIC
    assert public & built in (set(), built)
    # The platforms' contracts are routes only of a runtime started for them.
    assert classes["own-proof"] == {
        route for route in OWN_PROOF if route[1].startswith("/api/")
    }
    assert classes["application"] == APPLICATION
    assert SOME_OF_THE_OWNERS <= classes["owner"]
    assert len(classes["owner"]) > 150


def test_a_route_nobody_listed_is_the_owners() -> None:
    for method, path in (
        ("GET", "/api/v1/something/new"),
        ("POST", "/api/v1/agents/a/b/c"),
        ("GET", "/health/new"),
        ("POST", "/health"),
        ("GET", "/metrics"),
        ("WS", "/api/v1/something/ws"),
        ("GET", "/ate/wakeup"),
        ("POST", "/invocations"),
        ("WS", "/ws"),
    ):
        assert visitors.route_class(method, path) == "owner", (method, path)


def test_the_platforms_contracts_are_self_proving_only_where_the_runtime_was_started_for_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.agentcore import settings as agentcore
    from agent_runtimes.ate import settings as ate

    monkeypatch.setenv(ate.TARGET_VARIABLE, ate.TARGET)
    assert visitors.route_class("GET", "/ate/wakeup") == "own-proof"
    assert visitors.route_class("POST", "/invocations") == "owner"
    monkeypatch.setenv(agentcore.TARGET_VARIABLE, agentcore.TARGET)
    assert visitors.route_class("POST", "/invocations") == "own-proof"
    assert visitors.route_class("WS", "/ws") == "own-proof"
    assert visitors.route_class("GET", "/ate/wakeup") == "owner"


def test_an_agent_served_over_a2a_is_an_applications_and_any_other_the_owners(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.models import models

    card = "/api/v1/a2a/agents/{}/.well-known/agent-card.json"
    assert visitors.route_class("GET", card.format("shop")) == "owner"
    # The chat's reads of its models are the owner's on a runtime of their own.
    assert visitors.route_class("GET", "/api/v1/configure/models") == "owner"
    monkeypatch.setattr(
        models, "_APP_INSTANCES", {"shop": {"app_uid": "a", "deployment_uid": "d"}}
    )
    assert visitors.route_class("GET", card.format("shop")) == "application"
    assert visitors.route_class("POST", "/api/v1/a2a/agents/shop/") == "application"
    assert visitors.route_class("GET", card.format("default")) == "owner"
    # On a runtime that serves an application they are its page's (`path_answered`).
    assert visitors.held_to_own_routes()
    assert visitors.route_class("GET", "/api/v1/configure/models") == "application"
    assert visitors.route_class("GET", "/api/v1/configure") == "application"
    assert (
        visitors.route_class("PUT", "/api/v1/configure/inference/provider") == "owner"
    )


# --- the mode ---------------------------------------------------------------------------


def test_the_mode_is_log_unless_it_says_enforce() -> None:
    assert visitors.access_mode({}) == "log"
    assert visitors.access_mode({visitors.ACCESS_MODE_ENV: ""}) == "log"
    assert visitors.access_mode({visitors.ACCESS_MODE_ENV: " Log "}) == "log"
    assert visitors.access_mode({visitors.ACCESS_MODE_ENV: "enforce"}) == "enforce"


@pytest.mark.parametrize("said", ["open", "off", "true", "enforced", "0", "none"])
def test_a_mode_it_cannot_read_stops_the_runtime_from_starting(
    said: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    with pytest.raises(ValueError, match="'log'.*'enforce'"):
        visitors.access_mode({visitors.ACCESS_MODE_ENV: said})
    with pytest.raises(ValueError):
        _app(monkeypatch, said)
    with pytest.raises(ValueError):
        visitors.OwnersOnly(app=None, mode=said)


# --- enforce: refused unless proven -----------------------------------------------------


def test_enforce_refuses_every_route_of_the_owner_to_a_call_with_no_credential(
    apps: dict[str, Any],
) -> None:
    client = _client(apps["enforce"])
    owners = sorted(_classes(apps["enforce"])["owner"])
    http = [route for route in owners if route[0] != "WS"]
    assert len(http) > 140
    for method, template in http:
        answer = client.request(method, _path_of(template))
        assert answer.status_code == 401, (method, template, answer.status_code)
        assert answer.json() == {"detail": visitors.NOT_PROVEN}
        assert answer.headers["www-authenticate"] == "Bearer"


def test_enforce_denies_every_websocket_of_the_owner_at_its_handshake(
    apps: dict[str, Any],
) -> None:
    client = _client(apps["enforce"])
    sockets = sorted(t for m, t in _classes(apps["enforce"])["owner"] if m == "WS")
    assert len(sockets) >= 4
    for template in sockets:
        with pytest.raises(WebSocketDenialResponse) as denied:
            with client.websocket_connect(_path_of(template)):
                pass
        assert denied.value.status_code == 401, template
        assert denied.value.json() == {"detail": visitors.NOT_PROVEN}


def test_enforce_lets_the_public_and_the_applications_routes_answer_for_themselves(
    apps: dict[str, Any],
) -> None:
    client = _client(apps["enforce"])
    for path in ("/health", "/health/live", "/health/ready", "/health/startup"):
        assert client.get(path).status_code == 200, path
    # An application's route answers as it does: its own refusal, never the lock's.
    for token in (
        None,
        "visitor-token",
        "embed-token",
        "host-token",
        "principal-token",
    ):
        answer = client.get(
            "/api/v1/apps/sessions", headers=_bearer(token) if token else {}
        )
        assert answer.json() != {"detail": visitors.NOT_PROVEN}, token
    assert client.get("/api/v1/apps/sessions").json() == {
        "detail": "Who is calling is not said: send a token."
    }
    # A browser's preflight carries no credential, and is CORS's to answer.
    preflight = client.options(
        "/api/v1/agents",
        headers={
            "Origin": "https://datalayer.ai",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert preflight.status_code == 200


@pytest.mark.parametrize(
    ("headers", "let_through"),
    [
        (_bearer(SANDBOX_TOKEN), True),
        ({"Authorization": f"token {SANDBOX_TOKEN}"}, True),
        (_bearer("owner-token"), True),
        (_bearer("another-token"), False),
        (_bearer("principal-token"), False),
        (_bearer("embed-token"), False),
        (_bearer("host-token"), False),
        (_bearer("visitor-token"), False),
        (_bearer("expired-token"), False),
        (_bearer("iam-is-down"), False),
        (_bearer("a-token-nobody-issued"), False),
        (_bearer(SANDBOX_TOKEN[:-1]), False),
        ({"Authorization": f"Basic {SANDBOX_TOKEN}"}, False),
        ({"X-Api-Key": SANDBOX_TOKEN}, False),
        ({}, False),
    ],
)
def test_each_kind_of_token_is_taken_where_it_should_be_and_nowhere_else(
    headers: dict[str, str], let_through: bool, apps: dict[str, Any]
) -> None:
    client = _client(apps["enforce"])
    for method, path in (
        ("GET", "/api/v1/agents"),
        ("GET", "/api/v1/mcp/servers"),
        ("GET", "/api/v1/runtime/status"),
    ):
        answer = client.request(method, path, headers=headers)
        assert (answer.status_code != 401) is let_through, (path, answer.status_code)
        assert (answer.json() != {"detail": visitors.NOT_PROVEN}) is let_through


def test_the_machine_itself_sends_a_token_as_anybody_does(
    apps: dict[str, Any],
) -> None:
    # 1.8.9: on a person's machine a page in their browser reaches the
    # loopback too, so an address proves nothing.
    local = _client(apps["enforce"], LOOPBACK)
    assert local.get("/api/v1/agents/default/history").status_code == 401
    assert local.post("/api/v1/agents", json={}).status_code == 401
    for header in ("X-Forwarded-For", "X-Forwarded-Host", "X-Real-Ip", "Forwarded"):
        assert (
            local.get(
                "/api/v1/runtime/status", headers={header: "198.51.100.7"}
            ).status_code
            == 401
        ), header
    for token in ("owner-token", SANDBOX_TOKEN, callers.runtime_token()):
        assert (
            local.get("/api/v1/runtime/status", headers=_bearer(token)).status_code
            == 200
        ), token
    assert (
        local.get(
            "/api/v1/agents",
            headers={"X-Forwarded-For": "198.51.100.7", **_bearer("owner-token")},
        ).status_code
        == 200
    )


def test_log_mode_serves_the_machine_itself_without_a_token_and_says_it(
    apps: dict[str, Any], counter: _Counter, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="agent_runtimes.access")
    local = _client(apps["log"], LOOPBACK)
    assert local.get("/api/v1/runtime/status").status_code == 200
    assert _lines(caplog) == [
        "ACCESS unproven mode=log action=served method=GET route=/api/v1/runtime/status "
        "reason=loopback-no-credential agent=testclient origin=- referer=- source=loopback"
    ]
    assert counter.added[0][1]["reason"] == "loopback-no-credential"


SKILLS_CALLS = (
    ("GET", "/api/v1/agents"),
    ("GET", "/api/v1/agents/default/memory"),
    ("POST", "/api/v1/agents/default/memory/search"),
    ("GET", "/api/v1/owner"),
    ("GET", "/api/v1/owner/events"),
    ("POST", "/api/v1/configure/mail"),
    ("POST", "/api/v1/spaces/files"),
    ("POST", "/api/v1/library/items/01ITEM/publish"),
    ("POST", "/api/v1/mcp/proxy/tools/call"),
)


@pytest.mark.parametrize("method,path", SKILLS_CALLS)
def test_a_skills_script_in_the_sandbox_reaches_its_routes_without_a_token(
    method: str, path: str, apps: dict[str, Any], counter: _Counter
) -> None:
    answer = _client(apps["enforce"], LOOPBACK).request(method, path, json={})
    assert answer.json() != {"detail": visitors.NOT_PROVEN}, answer.text
    assert counter.added == []


@pytest.mark.parametrize("method,path", SKILLS_CALLS)
def test_a_skills_routes_answer_no_page_and_nobody_elsewhere_without_a_token(
    method: str, path: str, apps: dict[str, Any]
) -> None:
    page = {"Origin": "http://localhost:3000"}
    local = _client(apps["enforce"], LOOPBACK)
    assert local.request(method, path, headers=page, json={}).status_code == 401
    assert (
        local.request(
            method, path, headers={"X-Forwarded-For": "198.51.100.7"}, json={}
        ).status_code
        == 401
    )
    assert _client(apps["enforce"]).request(method, path, json={}).status_code == 401


def test_a_harness_reaches_its_handles_routes_whatever_its_client_says(
    apps: dict[str, Any], counter: _Counter
) -> None:
    local = _client(apps["enforce"], LOOPBACK)
    node = {"Sec-Fetch-Mode": "cors"}
    for path in (
        "/api/v1/mcp/lent/a-handle/mcp",
        "/api/v1/inference/relay/a-handle/v1/messages",
    ):
        answer = local.post(path, headers=node, json={})
        assert answer.json() != {"detail": visitors.NOT_PROVEN}, (path, answer.text)
        assert (
            local.post(
                path, headers={"X-Forwarded-For": "198.51.100.7"}, json={}
            ).status_code
            == 401
        )
        assert _client(apps["enforce"]).post(path, json={}).status_code == 401
    # Only the calls a proxy passed on, or from elsewhere, are unproven.
    assert {attributes["reason"] for _, attributes in counter.added} == {
        "no-credential"
    }


def test_a_page_on_the_loopback_is_refused_by_a_skills_route_in_log_mode(
    apps: dict[str, Any],
) -> None:
    local = _client(apps["log"], LOOPBACK)
    for headers in (
        {"Origin": "http://localhost:3000"},
        {"Sec-Fetch-Site": "same-site"},
    ):
        answer = local.post(
            "/api/v1/configure/mail",
            headers=headers,
            json={"subject": "A page's mail", "text": "Not a skill's."},
        )
        assert answer.status_code == 403, (headers, answer.text)
        assert "a browser's page is not one" in answer.json()["detail"]


@pytest.mark.parametrize("mode", ["log", "enforce"])
def test_another_sites_page_on_the_loopback_is_refused_whatever_it_says(
    mode: str, apps: dict[str, Any], counter: _Counter
) -> None:
    # A forwarding header is only a header: CORS lets a page send one, and
    # the loopback is still its peer. Refused in both modes, never served.
    local = _client(apps[mode], LOOPBACK)
    for headers in (
        {"Origin": "https://a-stranger.example"},
        {"Origin": "https://a-stranger.example", "X-Forwarded-For": "198.51.100.7"},
        {"Sec-Fetch-Site": "cross-site", "X-Forwarded-For": "198.51.100.7"},
    ):
        for method, path in (
            ("POST", "/api/v1/agents"),
            ("GET", "/api/v1/agents/default/memory"),
            ("GET", "/api/v1/runtime/status"),
        ):
            answer = local.request(method, path, headers=headers, json={})
            assert answer.status_code == 403, (mode, headers, path, answer.text)
            assert answer.json() == {"detail": callers.STRANGERS_PAGE}
    assert {attributes["reason"] for _, attributes in counter.added} == {
        "strangers-page"
    }
    assert {attributes["source"] for _, attributes in counter.added} == {"loopback"}
    # This machine's page and the platform's are no strangers: judged by their token.
    for origin in ("http://localhost:3000", "https://datalayer.ai"):
        assert (
            local.get(
                "/api/v1/runtime/status",
                headers={"Origin": origin, **_bearer("owner-token")},
            ).status_code
            == 200
        )


def test_a_call_a_proxy_really_passed_on_is_judged_by_its_token(
    apps: dict[str, Any],
) -> None:
    passed_on = _client(apps["enforce"])
    headers = {"X-Forwarded-For": "198.51.100.7", "Origin": "https://datalayer.ai"}
    assert passed_on.get("/api/v1/runtime/status", headers=headers).status_code == 401
    assert (
        passed_on.get(
            "/api/v1/runtime/status", headers={**headers, **_bearer("owner-token")}
        ).status_code
        == 200
    )


def test_the_companion_proves_itself_by_the_pods_secret_where_one_is_held(
    apps: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.apps import principal

    local = _client(apps["enforce"], LOOPBACK)
    said = {callers.POD_SECRET_HEADER: "the-pods-secret"}
    # A runtime that holds none takes no secret for one.
    assert local.get("/api/v1/runtime/status", headers=said).status_code == 401
    monkeypatch.setitem(principal._PROOF, "pod_secret", "the-pods-secret")
    assert local.get("/api/v1/runtime/status", headers=said).status_code == 200
    assert (
        local.get(
            "/api/v1/runtime/status", headers={callers.POD_SECRET_HEADER: "a-guess"}
        ).status_code
        == 401
    )
    assert (
        _client(apps["enforce"]).get("/api/v1/runtime/status", headers=said).status_code
        == 401
    )


def test_the_sandbox_the_pod_names_at_launch_gives_the_runtimes_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from agent_runtimes.services import code_sandbox_manager

    class _Unconfigured:
        def get_status(self) -> dict[str, Any]:
            return {"jupyter_token": None}

    monkeypatch.setattr(
        code_sandbox_manager, "get_code_sandbox_manager", lambda: _Unconfigured()
    )
    monkeypatch.setenv(
        "AGENT_RUNTIMES_JUPYTER_SANDBOX",
        "http://127.0.0.1:2300/jupyter/server/pool/x?token=from-the-pod",
    )
    assert callers.sandbox_token() == "from-the-pod"
    monkeypatch.delenv("AGENT_RUNTIMES_JUPYTER_SANDBOX")
    assert callers.sandbox_token() == ""


def test_the_runtimes_own_token_is_the_one_said_or_one_drawn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(callers, "_RUNTIME_TOKEN", {})
    monkeypatch.setenv(callers.RUNTIME_TOKEN_ENV, "chosen-by-whoever-started-it")
    assert callers.runtime_token() == "chosen-by-whoever-started-it"
    assert callers.runtime_auth_headers() == {
        "Authorization": "Bearer chosen-by-whoever-started-it"
    }
    monkeypatch.setattr(callers, "_RUNTIME_TOKEN", {})
    monkeypatch.delenv(callers.RUNTIME_TOKEN_ENV)
    drawn = callers.runtime_token()
    assert len(drawn) >= 32 and callers.runtime_token() == drawn
    # Held in the process, never written where what it starts inherits it.
    import os

    assert callers.RUNTIME_TOKEN_ENV not in os.environ


def test_a_runtime_that_is_nobodys_yet_takes_no_persons_token(
    apps: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("DATALAYER_USER_UID")
    client = _client(apps["enforce"])
    assert (
        client.get("/api/v1/agents", headers=_bearer("owner-token")).status_code == 401
    )
    # Its own token is its owner's from the start: the platform gives it with the record.
    assert (
        client.get("/api/v1/agents", headers=_bearer(SANDBOX_TOKEN)).status_code == 200
    )


def test_the_owner_is_whom_the_runtime_was_assigned_or_whose_token_it_holds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import jwt

    from agent_runtimes.models import offered

    def minted(**claims: Any) -> str:
        return jwt.encode(claims, "k" * 32, algorithm="HS256")

    monkeypatch.setitem(offered._given, "token", None)
    assert callers.runtime_owner_uid() == OWNER
    monkeypatch.delenv("DATALAYER_USER_UID")
    assert callers.runtime_owner_uid() == ""
    # A runtime assigned with no agent is given the token it calls ai-inference
    # with, its owner's: it is theirs by that.
    monkeypatch.setitem(offered._given, "token", minted(sub="01ASSIGNED"))
    assert callers.runtime_owner_uid() == "01ASSIGNED"
    monkeypatch.setenv("DATALAYER_USER_TOKEN", minted(sub="01HELD"))
    assert callers.runtime_owner_uid() == "01HELD"
    # A principal's own token is nobody's, wherever it is held.
    principal = minted(sub="01AGENT", agent_uid="01AGENT")
    monkeypatch.setenv("DATALAYER_USER_TOKEN", principal)
    assert callers.runtime_owner_uid() == "01ASSIGNED"
    monkeypatch.setitem(offered._given, "token", principal)
    assert callers.runtime_owner_uid() == ""
    monkeypatch.setitem(offered._given, "token", "not-a-token")
    assert callers.runtime_owner_uid() == ""


def test_a_runtime_assigned_with_no_agent_takes_its_owners_token(
    apps: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    import jwt

    from agent_runtimes.models import offered

    monkeypatch.delenv("DATALAYER_USER_UID")
    monkeypatch.setitem(
        offered._given, "token", jwt.encode({"sub": OWNER}, "k" * 32, algorithm="HS256")
    )
    client = _client(apps["enforce"])
    assert (
        client.get("/api/v1/agents", headers=_bearer("owner-token")).status_code == 200
    )
    assert (
        client.get("/api/v1/agents", headers=_bearer("another-token")).status_code
        == 401
    )


def test_a_websocket_takes_its_token_from_the_query(apps: dict[str, Any]) -> None:
    client = _client(apps["enforce"])
    for token in (SANDBOX_TOKEN, "owner-token"):
        with client.websocket_connect(
            f"/api/v1/configure/sandbox/ws?token={token}"
        ) as socket:
            assert socket.receive_json()["jupyter_token"] == SANDBOX_TOKEN
    for token in ("another-token", "visitor-token", ""):
        with pytest.raises(WebSocketDenialResponse):
            with client.websocket_connect(
                f"/api/v1/configure/sandbox/ws?token={token}"
            ):
                pass


def test_the_platform_is_asked_once_for_a_burst_of_calls_whatever_it_answers(
    apps: dict[str, Any], a_runtime_of_the_owner: _Verifier
) -> None:
    client = _client(apps["enforce"])
    for _ in range(5):
        assert (
            client.get("/api/v1/agents", headers=_bearer("owner-token")).status_code
            == 200
        )
        assert (
            client.get("/api/v1/agents", headers=_bearer("another-token")).status_code
            == 401
        )
    assert a_runtime_of_the_owner.asked == ["owner-token", "another-token"]
    # The runtime's own token is never sent to the platform.
    client.get("/api/v1/agents", headers=_bearer(SANDBOX_TOKEN))
    assert SANDBOX_TOKEN not in a_runtime_of_the_owner.asked


# --- log: served, and said --------------------------------------------------------------


class _Counter:
    def __init__(self) -> None:
        self.added: list[tuple[int, dict[str, str]]] = []

    def add(self, amount: int, attributes: dict[str, str]) -> None:
        self.added.append((amount, dict(attributes)))


@pytest.fixture
def counter(monkeypatch: pytest.MonkeyPatch) -> _Counter:
    counting = _Counter()
    monkeypatch.setitem(visitors._ACCESS_COUNTER, "counter", counting)
    return counting


def _lines(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.name == "agent_runtimes.access"]


def test_log_mode_serves_a_call_that_proves_nothing_and_says_it_once(
    apps: dict[str, Any], counter: _Counter, caplog: pytest.LogCaptureFixture
) -> None:
    client = _client(apps["log"])
    caplog.set_level(logging.WARNING, logger="agent_runtimes.access")
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/142",
        "Origin": "https://datalayer.ai",
        "Referer": "https://datalayer.ai/agents/01m89secretpath?token=in-the-referer",
        "X-Forwarded-For": "198.51.100.7",
    }
    for _ in range(3):
        answer = client.get(
            "/api/v1/agents/default/memory?token=&secret=in-the-query", headers=headers
        )
        assert answer.status_code != 401
    assert _lines(caplog) == [
        "ACCESS unproven mode=log action=served method=GET route=/api/v1/agents/{agent_id}/memory "
        "reason=no-credential agent=Mozilla/5.0 origin=datalayer.ai referer=datalayer.ai source=ingress"
    ]
    # Every call is counted, by what a few days of production are read by.
    assert [amount for amount, _ in counter.added] == [1, 1, 1]
    assert counter.added[0][1] == {
        "mode": "log",
        "method": "GET",
        "route": "/api/v1/agents/{agent_id}/memory",
        "reason": "no-credential",
        "agent": "Mozilla/5.0",
        "origin": "datalayer.ai",
        "referer": "datalayer.ai",
        "source": "ingress",
    }


def test_log_mode_says_why_a_token_was_not_enough_and_never_the_token(
    apps: dict[str, Any], counter: _Counter, caplog: pytest.LogCaptureFixture
) -> None:
    client = _client(apps["log"])
    caplog.set_level(logging.WARNING, logger="agent_runtimes.access")
    said = {
        "another-token": "another-account",
        "visitor-token": "application-token",
        "expired-token": "token-refused",
        "iam-is-down": "unverifiable",
    }
    for token in said:
        assert (
            client.post(
                "/api/v1/vercel-ai/terminate", headers=_bearer(token), json={}
            ).status_code
            != 401
        )
    lines = _lines(caplog)
    found = [re.search(r"reason=(\S+)", line) for line in lines]
    assert [match.group(1) for match in found if match] == list(said.values())
    assert all(
        "route=/api/v1/vercel-ai/terminate " in line and "source=cluster" in line
        for line in lines
    )
    everything = " ".join(lines) + repr(counter.added)
    assert not any(token in everything for token in said)


def test_log_mode_is_quiet_for_a_call_that_proved_itself(
    apps: dict[str, Any], counter: _Counter, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="agent_runtimes.access")
    client = _client(apps["log"])
    assert (
        client.get("/api/v1/agents", headers=_bearer("owner-token")).status_code == 200
    )
    assert (
        client.get("/api/v1/agents", headers=_bearer(SANDBOX_TOKEN)).status_code == 200
    )
    assert (
        _client(apps["log"], LOOPBACK)
        .get("/api/v1/agents", headers=_bearer(callers.runtime_token()))
        .status_code
        == 200
    )
    assert client.get("/health").status_code == 200
    client.get("/api/v1/apps/sessions")
    with client.websocket_connect(
        f"/api/v1/configure/sandbox/ws?token={SANDBOX_TOKEN}"
    ) as socket:
        socket.receive_json()
    assert _lines(caplog) == [] and counter.added == []


def test_log_mode_serves_a_websocket_that_proves_nothing_and_says_it(
    apps: dict[str, Any], counter: _Counter, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="agent_runtimes.access")
    with _client(apps["log"]).websocket_connect(
        "/api/v1/configure/sandbox/ws?agent_id=default"
    ) as socket:
        assert socket.receive_json()["variant"] == "eval"
    assert _lines(caplog) == [
        "ACCESS unproven mode=log action=served method=WS route=/api/v1/configure/sandbox/ws "
        "reason=no-credential agent=testclient origin=- referer=- source=cluster"
    ]
    assert counter.added[0][1]["method"] == "WS"


def test_enforce_says_what_it_refused(
    apps: dict[str, Any], counter: _Counter, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="agent_runtimes.access")
    assert _client(apps["enforce"]).get("/api/v1/history").status_code == 401
    assert _lines(caplog) == [
        "ACCESS unproven mode=enforce action=refused method=GET route=/api/v1/history "
        "reason=no-credential agent=testclient origin=- referer=- source=cluster"
    ]
    assert counter.added[0][1]["mode"] == "enforce"


def test_a_route_that_is_no_route_is_named_by_its_first_segments(
    apps: dict[str, Any],
) -> None:
    lock = visitors.OwnersOnly(
        app=None, mode="log", templates=lambda: visitors.route_templates(apps["log"])
    )
    assert (
        lock.template_of("GET", "/api/v1/agents/01m89/memory")
        == "/api/v1/agents/{agent_id}/memory"
    )
    assert lock.template_of("HEAD", "/api/v1/history") == "/api/v1/history"
    assert lock.template_of("POST", "/api/v1/ag-ui/01m89secret/") == "/api/v1/ag-ui/…"
    assert lock.template_of("GET", "/nowhere/01m89secret/x") == "/nowhere/…"
    assert lock.template_of("GET", "/api/v1/unknown") == "/api/v1/unknown"


# --- the sandbox's own credentials ------------------------------------------------------


def _keys(answer: Any) -> set[str]:
    """Every key of an answer, at any depth."""
    if isinstance(answer, dict):
        return set(answer) | {key for value in answer.values() for key in _keys(value)}
    if isinstance(answer, list):
        return {key for item in answer for key in _keys(item)}
    return set()


SANDBOX_READS = (
    "/health/startup",
    "/api/v1/runtime/status",
    "/api/v1/configure/codemode/status",
)


@pytest.mark.parametrize("mode", ["log", "enforce"])
def test_a_caller_that_proved_nothing_is_told_no_token_of_the_sandbox(
    mode: str, apps: dict[str, Any]
) -> None:
    client = _client(apps[mode])
    for path in SANDBOX_READS:
        answer = client.get(path)
        if mode == "enforce" and path != "/health/startup":
            assert answer.status_code == 401
            continue
        assert answer.status_code == 200, path
        assert "jupyter_token" not in _keys(answer.json()), path
        assert SANDBOX_TOKEN not in answer.text, path
    # Everything else of the health answer is there.
    startup = client.get("/health/startup").json()
    assert startup["status"] == "ok" and startup["sandbox"]["variant"] == "eval"
    assert (
        startup["sandbox"]["kernel_id"] == "kernel-1"
        and startup["sandbox"]["sandbox_running"] is True
    )
    assert (
        startup["sandbox"]["jupyter_url"]
        == "http://127.0.0.1:2300/jupyter/server/pool/x"
    )


@pytest.mark.parametrize(
    "other", ["another-token", "visitor-token", "principal-token", "expired-token"]
)
def test_somebody_elses_token_is_told_none_either(
    other: str, apps: dict[str, Any]
) -> None:
    client = _client(apps["log"])
    for path in SANDBOX_READS:
        answer = client.get(path, headers=_bearer(other))
        assert (
            "jupyter_token" not in _keys(answer.json())
            and SANDBOX_TOKEN not in answer.text
        ), path


@pytest.mark.parametrize("mode", ["log", "enforce"])
@pytest.mark.parametrize("proof", ["owner-token", SANDBOX_TOKEN])
def test_the_owner_still_reads_the_sandboxs_token(
    mode: str, proof: str, apps: dict[str, Any]
) -> None:
    client = _client(apps[mode])
    assert (
        client.get("/health/startup", headers=_bearer(proof)).json()["sandbox"][
            "jupyter_token"
        ]
        == SANDBOX_TOKEN
    )
    status = client.get("/api/v1/runtime/status", headers=_bearer(proof)).json()
    assert status["sandbox"]["jupyter_token"] == SANDBOX_TOKEN
    codemode = client.get(
        "/api/v1/configure/codemode/status", headers=_bearer(proof)
    ).json()
    assert codemode["sandbox"]["jupyter_token"] == SANDBOX_TOKEN


def test_the_machine_itself_reads_it_while_the_lock_logs_and_a_stranger_never(
    apps: dict[str, Any],
) -> None:
    local = _client(apps["log"], LOOPBACK)
    for headers in ({}, {"Origin": "http://localhost:3000"}):
        assert (
            local.get("/health/startup", headers=headers).json()["sandbox"][
                "jupyter_token"
            ]
            == SANDBOX_TOKEN
        ), headers
    for headers in (
        {"X-Forwarded-For": "198.51.100.7"},
        {"Origin": "https://a-stranger.example"},
        {"Sec-Fetch-Site": "cross-site"},
    ):
        told = local.get("/health/startup", headers=headers)
        assert (
            "jupyter_token" not in _keys(told.json()) and SANDBOX_TOKEN not in told.text
        ), headers
    # Enforced, the machine itself sends a token to read it, as anybody does.
    enforced = _client(apps["enforce"], LOOPBACK)
    assert SANDBOX_TOKEN not in enforced.get("/health/startup").text
    assert (
        enforced.get("/health/startup", headers=_bearer("owner-token")).json()[
            "sandbox"
        ]["jupyter_token"]
        == SANDBOX_TOKEN
    )


def test_the_sandbox_websockets_frames_carry_the_token_for_the_owner_alone(
    apps: dict[str, Any],
) -> None:
    client = _client(apps["log"])
    with client.websocket_connect("/api/v1/configure/sandbox/ws") as socket:
        frame = socket.receive_json()
    assert "jupyter_token" not in frame and SANDBOX_TOKEN not in repr(frame)
    assert (
        frame["variant"] == "eval"
        and frame["kernel_id"] == "kernel-1"
        and frame["sandbox_running"] is True
    )
    with client.websocket_connect(
        "/api/v1/configure/sandbox/ws?token=another-token"
    ) as socket:
        assert "jupyter_token" not in socket.receive_json()
    with client.websocket_connect(
        "/api/v1/configure/sandbox/ws?token=owner-token"
    ) as socket:
        assert socket.receive_json()["jupyter_token"] == SANDBOX_TOKEN
    with _client(apps["log"], LOOPBACK).websocket_connect(
        "/api/v1/configure/sandbox/ws"
    ) as socket:
        assert socket.receive_json()["jupyter_token"] == SANDBOX_TOKEN


def test_an_agents_spec_and_the_skills_say_the_sandbox_without_its_token(
    apps: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    from agent_runtimes.routes import agents

    monkeypatch.setattr(
        agents, "get_stored_agent_spec", lambda agent_id: {"name": agent_id}
    )
    monkeypatch.setattr(agents, "set_up_refused", lambda agent_id: None)
    client = _client(apps["log"])
    spec = client.get("/api/v1/configure/agents/default/spec")
    assert spec.status_code == 200 and spec.json()["sandbox"]["variant"] == "eval"
    assert "jupyter_token" not in _keys(spec.json()) and SANDBOX_TOKEN not in spec.text
    owned = client.get(
        "/api/v1/configure/agents/default/spec", headers=_bearer("owner-token")
    )
    assert owned.json()["sandbox"]["jupyter_token"] == SANDBOX_TOKEN
    # The skills' catalogue is not where the token is read: nobody is told it there.
    for headers in ({}, _bearer("owner-token")):
        skills = client.get("/api/v1/configure/skills", headers=headers)
        assert skills.status_code == 200
        assert (
            "jupyter_token" not in _keys(skills.json())
            and SANDBOX_TOKEN not in skills.text
        )


def test_a_monitoring_snapshot_never_carries_the_token() -> None:
    from agent_runtimes.streams.pubsub import build_codemode_status

    snapshot = build_codemode_status("default")
    assert snapshot is not None and snapshot["sandbox"]["variant"] == "eval"
    assert "jupyter_token" not in _keys(snapshot) and SANDBOX_TOKEN not in repr(
        snapshot
    )
    whole = build_codemode_status("default", with_credentials=True)
    assert whole is not None and whole["sandbox"]["jupyter_token"] == SANDBOX_TOKEN


def test_an_answer_without_the_sandboxs_credentials_keeps_everything_else() -> None:
    answer: dict[str, Any] = {
        "status": "ok",
        "sandbox": {
            "variant": "jupyter-server",
            "jupyter_url": "https://r.example/jupyter/server/p/x?token=abc&kernel=1",
            "jupyter_token": "abc",
            "jupyter_token_set": True,
            "agent_sandboxes": [{"jupyter_token": "def", "kernel_id": "k"}],
        },
        "note": "token=abc is how a query says it",
    }
    assert callers.without_sandbox_credentials(answer) == {
        "status": "ok",
        "sandbox": {
            "variant": "jupyter-server",
            "jupyter_url": "https://r.example/jupyter/server/p/x?kernel=1",
            "jupyter_token_set": True,
            "agent_sandboxes": [{"kernel_id": "k"}],
        },
        "note": "token=abc is how a query says it",
    }
    assert answer["sandbox"]["jupyter_token"] == "abc"
