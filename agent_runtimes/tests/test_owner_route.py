# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A skill asks the runtime who it runs for, and for its agent's events: no key in the sandbox."""

from __future__ import annotations

import time
from typing import Any, Iterator

import httpx
import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.routes import owner

POD = ("127.0.0.1", 50000)
OUTSIDE = ("203.0.113.9", 50000)

PROFILE = {
    "uid": "u-1",
    "handle_s": "ada",
    "email_s": "ada@example.org",
    "first_name_t": "Ada",
    "last_name_t": "Lovelace",
    "roles_ss": ["platform_member"],
    "avatar_url_s": "https://example.org/ada.png",
    "mfa_secret_s": "never-said",
}


def client(host: str = "127.0.0.1") -> TestClient:
    """A client of the routes alone, calling from a host."""
    app = FastAPI()
    app.include_router(owner.router, prefix="/api/v1")
    return TestClient(app, client=(host, 40000))


@pytest.fixture(autouse=True)
def a_persons_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[list[dict[str, Any]]]:
    """A runtime a person launched: their token held, IAM and ai-agents known and faked.

    Yields
    ------
    list[dict[str, Any]]
        What was asked of IAM and ai-agents, in order.
    """
    from agent_runtimes.apps import principal
    from agent_runtimes.apps.visitors import VISITORS_ENV

    principal.forget_runtime_proof()
    monkeypatch.delenv(VISITORS_ENV, raising=False)
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "the-persons-token")
    monkeypatch.setenv("DATALAYER_IAM_URL", "https://iam.example")
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "https://ai-agents.example")
    asked: list[dict[str, Any]] = []

    async def ask(method: str, url: str, token: str = "", **kwargs: Any):
        """IAM and ai-agents, faked: what was asked is kept."""
        asked.append({"method": method, "url": url, "token": token, **kwargs})
        if url.endswith("/api/iam/v1/whoami"):
            if token != "the-persons-token":
                return httpx.Response(401, json={"detail": "no"})
            return httpx.Response(200, json={"success": True, "profile": PROFILE})
        if "/users/public/by-uid/" in url:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "profile": {
                        "uid": "u-owner",
                        "handle": "grace",
                        "display_name": "Grace Brewster Hopper",
                        "avatar_url": "https://example.org/grace.png",
                    },
                },
            )
        if "/events" in url:
            return httpx.Response(
                200,
                json={
                    "success": True,
                    "total": 1,
                    "event": {"id": "evt-1", "title": "Done"},
                    "events": [{"id": "evt-1", "title": "Done"}],
                },
            )
        return httpx.Response(404, json={"detail": "nothing here"})

    monkeypatch.setattr(owner, "_ask", ask)
    yield asked
    principal.forget_runtime_proof()


def test_the_person_the_runtime_runs_for_is_said_as_the_skill_prints_it(
    a_persons_runtime: list[dict[str, Any]],
) -> None:
    """The profile IAM says, in the skill's seven fields, and no token."""
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 200, answer.text
    assert answer.json() == {
        "handle": "ada",
        "email": "ada@example.org",
        "first_name": "Ada",
        "last_name": "Lovelace",
        "uid": "u-1",
        "roles": ["platform_member"],
        "avatar_url": "https://example.org/ada.png",
    }
    # Asked of IAM with the token the runtime holds; the answer carries none.
    assert a_persons_runtime[0]["url"] == "https://iam.example/api/iam/v1/whoami"
    assert a_persons_runtime[0]["token"] == "the-persons-token"
    assert "the-persons-token" not in answer.text


def test_only_the_pods_loopback_asks() -> None:
    """Any caller off the loopback is refused."""
    assert client("10.1.2.3").get("/api/v1/owner").status_code == 403
    assert client("10.1.2.3").get("/api/v1/owner/events").status_code == 403
    assert (
        client("10.1.2.3").post("/api/v1/owner/events", json={"title": "x"}).status_code
        == 403
    )


def test_a_runtime_that_runs_for_nobody_says_so(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No identity held: a sentence, for the identity and the events alike."""
    monkeypatch.delenv("DATALAYER_USER_TOKEN")
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 409
    assert answer.json()["detail"] == owner.NOBODY
    assert "runs for nobody" in owner.NOBODY
    events = client().get("/api/v1/owner/events?agent_id=a")
    assert events.status_code == 409 and events.json()["detail"] == owner.NOBODY


def test_an_identity_iam_no_longer_accepts_is_said(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A token IAM refuses, or one that says it expired, is said as expired."""
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "a-stale-token")
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 409 and answer.json()["detail"] == owner.EXPIRED
    # A token that says it has expired is not even sent.
    expired = jwt.encode({"exp": int(time.time()) - 60}, "k" * 32, algorithm="HS256")
    monkeypatch.setenv("DATALAYER_USER_TOKEN", expired)
    assert owner.identity_refusal("datalayer-whoami") == owner.EXPIRED


def test_the_visitors_runtime_runs_for_nobody(monkeypatch: pytest.MonkeyPatch) -> None:
    """The visitors' runtime answers no account."""
    from agent_runtimes.apps.visitors import VISITORS_ENV

    monkeypatch.setenv(VISITORS_ENV, "example")
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 409 and answer.json()["detail"] == owner.VISITORS


def _principal_token() -> str:
    """A token as a principal's reads: its uid, its owner's account, an expiry."""
    return jwt.encode(
        {"agent_uid": "p-1", "account_uid": "u-owner", "exp": int(time.time()) + 600},
        "k" * 32,
        algorithm="HS256",
    )


@pytest.fixture
def serving(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A runtime whose agent serves a deployment, its principal's token held.

    Yields
    ------
    str
        The principal's token.
    """
    from agent_runtimes.apps import principal

    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    monkeypatch.setattr(principal, "deployments_served", lambda: ["dep-1"])
    token = _principal_token()
    principal.give_principal_token("dep-1", token, expires_in=600, principal_uid="p-1")
    yield token
    principal.forget_principal_token("dep-1")


def test_a_deployments_runtime_answers_its_owners_public_face_alone(
    serving: str, a_persons_runtime: list[dict[str, Any]]
) -> None:
    """Never whoever launched it: the launcher's token is held too, and is not read."""
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 200, answer.text
    assert answer.json() == {
        "handle": "grace",
        "email": None,
        "first_name": "Grace",
        "last_name": "Brewster Hopper",
        "uid": "u-owner",
        "roles": [],
        "avatar_url": "https://example.org/grace.png",
    }
    assert [each["url"] for each in a_persons_runtime] == [
        "https://iam.example/api/iam/v1/users/public/by-uid/u-owner"
    ]
    # The public face is asked with no token at all.
    assert a_persons_runtime[0]["token"] == ""


def test_a_deployments_runtime_without_its_principal_runs_for_nobody(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A served deployment with no principal token held acts in nobody's name."""
    from agent_runtimes.apps import principal

    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    monkeypatch.setattr(principal, "deployments_served", lambda: ["dep-9"])
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 409
    assert "dep-9" in answer.json()["detail"]
    assert owner.identity_refusal("events") == answer.json()["detail"]


def test_the_agents_events_are_asked_with_the_runtimes_identity(
    a_persons_runtime: list[dict[str, Any]],
) -> None:
    """Create, list, read and change: each asked of ai-agents with the held token."""
    created = client().post(
        "/api/v1/owner/events",
        json={"agent_id": "data-acquisition", "title": "New dataset", "kind": "x"},
    )
    assert created.status_code == 200, created.text
    assert created.json() == {"event": {"id": "evt-1", "title": "Done"}}
    sent = a_persons_runtime[-1]
    assert sent["method"] == "POST"
    assert (
        sent["url"]
        == "https://ai-agents.example/api/ai-agents/v1/agents/data-acquisition/events"
    )
    assert sent["token"] == "the-persons-token"
    assert sent["json"]["title"] == "New dataset"
    assert sent["json"]["metadata"] == {"origin": "agent-runtime"}

    listed = client().get(
        "/api/v1/owner/events?agent_id=data-acquisition&status=pending&limit=5"
    )
    assert listed.json() == {"total": 1, "events": [{"id": "evt-1", "title": "Done"}]}
    assert a_persons_runtime[-1]["params"] == {
        "limit": 5,
        "offset": 0,
        "status": "pending",
    }

    one = client().get("/api/v1/owner/events/evt-1?agent_id=data-acquisition")
    assert one.json() == {"event": {"id": "evt-1", "title": "Done"}}
    assert a_persons_runtime[-1]["url"].endswith(
        "/agents/data-acquisition/events/evt-1"
    )

    changed = client().patch(
        "/api/v1/owner/events/evt-1",
        json={"agent_id": "data-acquisition", "status": "completed"},
    )
    assert changed.status_code == 200
    assert a_persons_runtime[-1]["method"] == "PATCH"
    assert a_persons_runtime[-1]["json"] == {"status": "completed"}
    assert (
        client()
        .patch("/api/v1/owner/events/evt-1", json={"agent_id": "data-acquisition"})
        .status_code
        == 422
    )


def test_events_without_an_agent_are_the_runtimes_only_agents(
    monkeypatch: pytest.MonkeyPatch, a_persons_runtime: list[dict[str, Any]]
) -> None:
    """No agent named: the runtime's only one, or a sentence."""
    from agent_runtimes.routes import agents

    monkeypatch.setattr(agents, "_agents", {})
    nobody = client().get("/api/v1/owner/events")
    assert nobody.status_code == 409
    monkeypatch.setattr(agents, "_agents", {"shopper": object()})
    assert client().get("/api/v1/owner/events").status_code == 200
    assert a_persons_runtime[-1]["url"].endswith("/agents/shopper/events")
    monkeypatch.setattr(agents, "_agents", {"a": object(), "b": object()})
    several = client().get("/api/v1/owner/events")
    assert several.status_code == 422 and "a, b" in several.json()["detail"]


def test_what_ai_agents_refuses_is_said_in_its_sentence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A service's refusal keeps its status and words; an unreachable one is a 502."""

    async def refused(method: str, url: str, token: str = "", **kwargs: Any):
        """ai-agents saying no."""
        return httpx.Response(404, json={"detail": "Event not found"})

    monkeypatch.setattr(owner, "_ask", refused)
    answer = client().get("/api/v1/owner/events/evt-9?agent_id=a")
    assert answer.status_code == 404 and answer.json()["detail"] == "Event not found"

    async def unreachable(method: str, url: str, token: str = "", **kwargs: Any):
        """A service that cannot be reached."""
        raise httpx.ConnectError("down")

    monkeypatch.setattr(owner, "_ask", unreachable)
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 502 and "IAM could not be reached" in answer.text


def test_a_redirect_is_never_followed_with_the_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A service answering a redirect: the token it was sent reaches no other origin."""
    reached: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        reached.append(str(request.url))
        if request.url.host == "iam.example":
            return httpx.Response(
                307, headers={"Location": "https://elsewhere.example/whoami"}
            )
        return httpx.Response(200, json={"profile": PROFILE})

    real_client = httpx.AsyncClient

    def client_on_a_mock(**kwargs: Any) -> httpx.AsyncClient:
        # What the route asks for is kept: it must say no redirect is followed.
        assert kwargs.get("follow_redirects") is False
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.undo()
    monkeypatch.setenv("DATALAYER_USER_TOKEN", "the-persons-token")
    monkeypatch.setenv("DATALAYER_IAM_URL", "https://iam.example")
    monkeypatch.delenv("DATALAYER_API_KEY", raising=False)
    monkeypatch.setattr(owner.httpx, "AsyncClient", client_on_a_mock)
    answer = client().get("/api/v1/owner")
    assert answer.status_code == 502, answer.text
    assert "redirect (307), which is not followed" in answer.json()["detail"]
    assert reached == ["https://iam.example/api/iam/v1/whoami"]


# --- readiness ------------------------------------------------------------------


def test_a_skill_that_needs_the_identity_is_ready_only_when_the_runtime_holds_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Readiness follows the identity held, per skill."""
    from agent_runtimes.tools import social

    # A person's runtime: who it runs for and its events are ready; the mail
    # waits for its social token; a skill that needs no identity says nothing.
    assert owner.identity_refusal("datalayer-whoami") is None
    assert owner.identity_refusal("events:1.0.0") is None
    assert owner.identity_refusal("datalayer-library-publish") is None
    assert owner.identity_refusal("crawl") is None
    social.give_social_token(None)
    assert owner.identity_refusal("datalayer-email") == social.NO_TOKEN
    social.give_social_token("a-social-token")
    assert owner.identity_refusal("datalayer-email") is None
    social.give_social_token(None)
    # No identity at all: none of the four is ready, each in a sentence.
    monkeypatch.delenv("DATALAYER_USER_TOKEN")
    for skill in owner.IDENTITY_SKILLS:
        assert owner.identity_refusal(skill), skill


def test_the_skill_catalogue_says_ready_truthfully(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """GET /configure/skills: ready only with the identity, the reason said."""
    import asyncio

    from agent_runtimes.routes import configure

    async def no_sandbox(agent_id: Any = None) -> dict[str, Any]:
        """No sandbox is up."""
        return {}

    monkeypatch.setattr(configure, "get_codemode_status", no_sandbox)

    def rows() -> dict[str, dict[str, Any]]:
        """The catalogue's rows by skill id."""
        said = asyncio.run(configure.list_catalog_skills())
        return {row["id"]: row for row in said["skills"]}

    held = rows()
    assert held["datalayer-whoami"]["ready"] is True
    assert held["datalayer-whoami"]["needs_identity"] is True
    assert held["datalayer-whoami"]["not_ready_reason"] is None
    assert held["events"]["ready"] is True
    monkeypatch.delenv("DATALAYER_USER_TOKEN")
    nobody = rows()
    for skill in owner.IDENTITY_SKILLS:
        assert nobody[skill]["ready"] is False, skill
        assert nobody[skill]["not_ready_reason"], skill
        # No variable is asked of the person: the reason is the identity.
        assert nobody[skill]["missing_env_vars"] == []
    assert nobody["datalayer-whoami"]["not_ready_reason"] == owner.NOBODY
    others = [
        row for skill, row in nobody.items() if skill not in owner.IDENTITY_SKILLS
    ]
    assert others and all(row["needs_identity"] is False for row in others)
    assert all(row["not_ready_reason"] is None for row in others)


def test_an_applications_equipment_says_an_identity_skill_not_ready_and_why() -> None:
    """An active skill without its identity is not ready, with the sentence."""
    from agent_runtimes.apps.equipment import equipment

    spec = {"skills": ["datalayer-whoami:1.0.0", "crawl:0.0.1"]}
    said = equipment(
        spec,
        identity_refusal=lambda skill: (
            owner.NOBODY if skill == "datalayer-whoami" else None
        ),
    )
    by_id = {row["id"]: row for row in said["skills"]}
    assert by_id["datalayer-whoami"]["state"] == "active"
    assert by_id["datalayer-whoami"]["ready"] is False
    assert by_id["datalayer-whoami"]["reason"] == owner.NOBODY
    assert by_id["crawl"]["ready"] is True and by_id["crawl"]["reason"] is None


# --- through the production middleware -------------------------------------------


def _proof() -> str:
    """A runtime's proof of the deployment it was launched for."""
    return jwt.encode(
        {"sub": "runtime-1", "deployment_uid": "dep-1"},
        "signed-by-the-platform-and-verified-by-ai-agents",
        algorithm="HS256",
    )


@pytest.fixture(scope="module")
def runtime_app() -> FastAPI:
    """The runtime's application, with its production middleware."""
    from agent_runtimes.app import create_app

    return create_app()


@pytest.fixture
def launched(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """A runtime launched for a deployment: held to its own routes, its principal held.

    Yields
    ------
    None
        Control to the test, with the launched runtime set up.
    """
    from agent_runtimes.apps import principal

    async def nothing_read(*_: Any) -> None:
        """Nothing is read of the launched application."""
        return None

    monkeypatch.setattr(principal, "read_launched_app", nothing_read)
    monkeypatch.setattr(principal, "deployments_served", lambda: ["dep-1"])
    principal.give_runtime_proof(_proof(), "the-pods-secret")
    principal.give_principal_token(
        "dep-1", _principal_token(), expires_in=600, principal_uid="p-1"
    )
    yield
    principal.forget_principal_token("dep-1")
    principal.forget_runtime_proof()


def test_the_sandbox_reaches_the_identity_and_the_events_only_while_code_runs(
    runtime_app: FastAPI, launched: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Through OwnRoutesOnly: the identity at any time, the events while code runs."""
    from agent_runtimes.apps import enforcement
    from agent_runtimes.apps.visitors import VISITORS_ENV

    sandbox = TestClient(runtime_app, client=POD)
    # Who it runs for is its owner's public face there: answered at any time.
    who = sandbox.get("/api/v1/owner")
    assert who.status_code == 200, who.text
    assert who.json()["handle"] == "grace" and who.json()["email"] is None
    # Its events only while code the agent was let run is running.
    assert sandbox.get("/api/v1/owner/events?agent_id=a").status_code == 404
    monkeypatch.setattr(enforcement, "code_is_running", lambda: True)
    assert sandbox.get("/api/v1/owner/events?agent_id=a").status_code == 200
    # From outside the pod, never; and nothing else opens with it.
    outside = TestClient(runtime_app, client=OUTSIDE)
    assert outside.get("/api/v1/owner").status_code == 404
    assert outside.get("/api/v1/owner/events?agent_id=a").status_code == 404
    assert sandbox.get("/api/v1/agents").status_code == 404
    assert sandbox.delete("/api/v1/owner/events/evt-1").status_code == 404
    # The visitors' runtime answers neither.
    monkeypatch.setenv(VISITORS_ENV, "example")
    assert sandbox.get("/api/v1/owner").status_code == 404
    assert sandbox.get("/api/v1/owner/events?agent_id=a").status_code == 404
