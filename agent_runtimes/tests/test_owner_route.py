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
    monkeypatch.setattr(enforcement, "_CODE_RUNNING", [_run_of("shopper")])
    monkeypatch.setattr(
        "agent_runtimes.models.models._APP_INSTANCES",
        {"shopper": {"deployment_uid": "dep-1"}},
    )
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


# --- review of 1.8.7: the address and the identity are never the caller's to choose ----


def _run_of(agent_id: str) -> Any:
    """A run whose code is running, as the enforcement keeps it: its rules name its agent."""
    from types import SimpleNamespace

    return SimpleNamespace(rules=SimpleNamespace(agent_id=agent_id))


@pytest.mark.parametrize(
    "bad", ["..", ".", "%2e%2e", "a/../b", "a/b", "a?x=1", "a#b", "..%2f", "a b"]
)
def test_an_id_that_is_no_path_segment_never_reaches_an_authenticated_address(
    bad: str, a_persons_runtime: list[dict[str, Any]]
) -> None:
    """`..` would turn the agent's events into the account's: refused before any call."""
    listed = client().get("/api/v1/owner/events", params={"agent_id": bad})
    created = client().post(
        "/api/v1/owner/events", json={"agent_id": bad, "title": "t"}
    )
    changed = client().patch(
        "/api/v1/owner/events/evt-1", json={"agent_id": bad, "status": "done"}
    )
    for answer in (listed, created, changed):
        assert answer.status_code == 422, (bad, answer.text)
        assert "is not an agent id" in answer.json()["detail"]
    # The event's id, in the path as the client's own encoding carries it.
    # (A client may resolve a dot segment itself, and then asks another route:
    # what matters is that no address of the events is built from it.)
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as refused:
        owner._events_url("a", bad)
    assert refused.value.status_code == 422
    # Nothing was asked of ai-agents with the runtime's token.
    assert [each for each in a_persons_runtime if "/events" in each["url"]] == []


def test_a_path_id_is_one_segment_of_a_known_shape() -> None:
    """The allow-list every caller-named id passes before it is put in an address."""
    from fastapi import HTTPException

    for good in (
        "evt-1",
        "01M89RDAM8XY88EKQYXAJC9745",
        "data-acquisition",
        "a.b_c:d@e",
    ):
        assert owner.path_id(good, "an id") == good.replace(":", "%3A").replace(
            "@", "%40"
        )
    for bad in ("..", ".", "a..b", "%2e%2e", "a/b", "", "-a", "a" * 201, "a\nb"):
        with pytest.raises(HTTPException) as refused:
            owner.path_id(bad, "an id")
        assert refused.value.status_code == 422


def test_the_library_publication_takes_no_dot_segment_either(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The same check where the owner's token publishes an item the sandbox names."""
    from agent_runtimes.routes import library

    sent: list[str] = []

    async def publish(url: str, token: str, payload: dict[str, Any]) -> httpx.Response:
        sent.append(url)
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(library, "_publish", publish)
    monkeypatch.setenv("DATALAYER_LIBRARY_URL", "https://library.example")
    app = FastAPI()
    app.include_router(library.router, prefix="/api/v1")
    sandbox = TestClient(app, client=("127.0.0.1", 40000))
    for bad in ("%2e%2e", "a%2f..%2fb", "x%3Fy"):
        refused = sandbox.post(
            f"/api/v1/library/items/{bad}/publish",
            json={"item_type": "document", "confirm": True},
        )
        assert refused.status_code in (404, 422), (bad, refused.text)
    assert sent == []
    good = sandbox.post(
        "/api/v1/library/items/doc-1/publish",
        json={"item_type": "document", "confirm": True},
    )
    assert good.status_code == 200 and sent == [
        "https://library.example/api/library/v1/items/doc-1/public"
    ]


@pytest.fixture
def two_deployments(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, str]]:
    """One runtime serving two deployments, each agent's principal held.

    Yields
    ------
    dict[str, str]
        Each agent's principal token, by agent id.
    """
    from agent_runtimes.apps import enforcement, principal

    tokens = {}
    for agent, deployment, account in (
        ("agent-a", "dep-a", "u-a"),
        ("agent-b", "dep-b", "u-b"),
    ):
        tokens[agent] = jwt.encode(
            {
                "agent_uid": f"p-{agent}",
                "account_uid": account,
                "exp": int(time.time()) + 600,
            },
            "k" * 32,
            algorithm="HS256",
        )
        principal.give_principal_token(
            deployment, tokens[agent], expires_in=600, principal_uid=f"p-{agent}"
        )
    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    monkeypatch.setattr(principal, "deployments_served", lambda: ["dep-a", "dep-b"])
    monkeypatch.setattr(
        "agent_runtimes.models.models._APP_INSTANCES",
        {
            "agent-a": {"deployment_uid": "dep-a"},
            "agent-b": {"deployment_uid": "dep-b"},
        },
    )
    monkeypatch.setattr(enforcement, "_CODE_RUNNING", [])
    yield tokens
    principal.forget_principal_token("dep-a")
    principal.forget_principal_token("dep-b")


def test_the_sandbox_of_one_agent_never_acts_as_another(
    two_deployments: dict[str, str],
    a_persons_runtime: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The principal is the running agent's: what the caller names selects none."""
    from agent_runtimes.apps import enforcement

    def upstream() -> list[dict[str, Any]]:
        return [each for each in a_persons_runtime if "/events" in each["url"]]

    # No code running: nothing is done in an application's name, whoever is named.
    for named in ("agent-a", "agent-b", "", "notes"):
        idle = client().get("/api/v1/owner/events", params={"agent_id": named})
        assert idle.status_code in (409, 422), (named, idle.text)
    assert upstream() == []
    # And who it runs for is not said among two applications.
    assert client().get("/api/v1/owner").status_code == 409

    # A's code runs: A's sandbox asking for B's events is refused, nothing sent.
    monkeypatch.setattr(enforcement, "_CODE_RUNNING", [_run_of("agent-a")])
    crossed = client().get("/api/v1/owner/events", params={"agent_id": "agent-b"})
    assert crossed.status_code == 403, crossed.text
    assert crossed.json()["detail"] == (
        "The code running is agent-a's: it does not act as agent-b."
    )
    assert client().get("/api/v1/owner?agent=agent-b").status_code == 403
    written = client().post(
        "/api/v1/owner/events", json={"agent_id": "agent-b", "title": "t"}
    )
    assert written.status_code == 403 and upstream() == []
    # Its own, named or not, or filed under a name that is no agent of the runtime:
    # always with A's principal.
    for named in ("agent-a", "", "data-acquisition"):
        own = client().get("/api/v1/owner/events", params={"agent_id": named})
        assert own.status_code == 200, (named, own.text)
        assert upstream()[-1]["token"] == two_deployments["agent-a"]
    assert upstream()[0]["url"].endswith("/agents/agent-a/events")
    assert upstream()[1]["url"].endswith("/agents/agent-a/events")
    who = client().get("/api/v1/owner")
    assert who.status_code == 200
    assert a_persons_runtime[-1]["url"].endswith("/users/public/by-uid/u-a")

    # The code of both runs at once: which one asks cannot be told.
    monkeypatch.setattr(
        enforcement, "_CODE_RUNNING", [_run_of("agent-a"), _run_of("agent-b")]
    )
    before = len(a_persons_runtime)
    for route in ("/api/v1/owner", "/api/v1/owner/events?agent_id=agent-a"):
        ambiguous = client().get(route)
        assert ambiguous.status_code == 409 and "several agents" in ambiguous.text
    assert len(a_persons_runtime) == before


def test_an_events_request_keeps_its_read_flag_and_takes_no_unknown_field(
    a_persons_runtime: list[dict[str, Any]],
) -> None:
    """`read` is part of the events' update contract; a field nobody knows is an error."""
    marked = client().patch(
        "/api/v1/owner/events/evt-1", json={"agent_id": "a", "read": True}
    )
    assert marked.status_code == 200, marked.text
    assert a_persons_runtime[-1]["json"] == {"read": True}
    both = client().patch(
        "/api/v1/owner/events/evt-1",
        json={"agent_id": "a", "status": "completed", "read": False},
    )
    assert both.status_code == 200
    assert a_persons_runtime[-1]["json"] == {"status": "completed", "read": False}
    before = len(a_persons_runtime)
    unknown = client().patch(
        "/api/v1/owner/events/evt-1", json={"agent_id": "a", "unread": True}
    )
    assert unknown.status_code == 422
    assert (
        client()
        .post("/api/v1/owner/events", json={"title": "t", "reed": True})
        .status_code
        == 422
    )
    assert len(a_persons_runtime) == before


# --- readiness is what the routes and the gate enforce ---------------------------------


RUNTIME_KINDS = (
    "person",
    "nobody",
    "visitors",
    "served",
    "launched-by-owner",
    "launched",
)


@pytest.fixture
def runtime_kind(
    request: pytest.FixtureRequest, monkeypatch: pytest.MonkeyPatch
) -> Iterator[str]:
    """A runtime of each kind, each holding every token it could.

    Yields
    ------
    str
        The kind set up.
    """
    from agent_runtimes.apps import enforcement, principal
    from agent_runtimes.apps.visitors import VISITORS_ENV
    from agent_runtimes.tools import social

    kind = request.param
    social.give_social_token("a-social-token")
    monkeypatch.setattr(principal, "deployments_served", lambda: [])
    monkeypatch.setattr(enforcement, "_CODE_RUNNING", [])
    if kind == "nobody":
        monkeypatch.delenv("DATALAYER_USER_TOKEN")
        social.give_social_token(None)
    if kind == "visitors":
        monkeypatch.setenv(VISITORS_ENV, "example")
    if kind in ("served", "launched-by-owner", "launched"):
        monkeypatch.setattr(principal, "deployments_served", lambda: ["dep-1"])
        monkeypatch.setattr(
            "agent_runtimes.models.models._APP_INSTANCES",
            {"shopper": {"deployment_uid": "dep-1"}},
        )
        principal.give_principal_token(
            "dep-1", _principal_token(), expires_in=600, principal_uid="p-1"
        )
    if kind == "served":
        monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    if kind in ("launched-by-owner", "launched"):

        async def nothing_read(*_: Any) -> None:
            return None

        monkeypatch.setattr(principal, "read_launched_app", nothing_read)
        principal.give_runtime_proof(_proof(), "the-pods-secret")
        principal._LAUNCHED_BY_OWNER["said"] = kind == "launched-by-owner"
    yield kind
    social.give_social_token(None)
    principal.forget_principal_token("dep-1")
    principal.forget_runtime_proof()


@pytest.mark.parametrize("runtime_kind", RUNTIME_KINDS, indirect=True)
def test_a_skill_is_ready_exactly_where_its_route_answers_its_sandbox(
    runtime_kind: str, runtime_app: FastAPI, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Readiness and enforcement never disagree: each skill, on each kind of runtime.

    The skill runs as code of the agent, so its call is made while that code
    runs: what is asked is whether the sandbox's call is answered then, by
    the production middleware and the route, with the services faked.
    """
    from agent_runtimes.apps import enforcement
    from agent_runtimes.routes import library
    from agent_runtimes.tools import social

    async def publish(url: str, token: str, payload: dict[str, Any]) -> httpx.Response:
        return httpx.Response(200, json={"success": True})

    async def mailed(to: str, subject: str, text: str) -> Any:
        refusal = social.social_token_refusal()
        return refusal if refusal else {"sent": True, "to": "me"}

    monkeypatch.setattr(library, "_publish", publish)
    monkeypatch.setattr(social, "send_mail", mailed)
    monkeypatch.setenv("DATALAYER_LIBRARY_URL", "https://library.example")
    monkeypatch.setattr(enforcement, "_CODE_RUNNING", [_run_of("shopper")])
    sandbox = TestClient(runtime_app, client=POD)
    calls = {
        "datalayer-whoami": lambda: sandbox.get("/api/v1/owner"),
        "events": lambda: sandbox.get("/api/v1/owner/events?agent_id=shopper"),
        "datalayer-email": lambda: sandbox.post(
            "/api/v1/configure/mail", json={"subject": "s", "text": "t"}
        ),
        "datalayer-library-publish": lambda: sandbox.post(
            "/api/v1/library/items/doc-1/publish",
            json={"item_type": "document", "confirm": True},
        ),
    }
    assert set(calls) == set(owner.IDENTITY_SKILLS)
    for skill, call in calls.items():
        ready = owner.identity_refusal(skill, "shopper") is None
        answered = call().status_code == 200
        assert ready == answered, (runtime_kind, skill, ready, answered)


def test_mail_is_said_unavailable_where_an_application_is_served(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A social token held there is no way to mail: the route is not the sandbox's."""
    from agent_runtimes.apps import principal
    from agent_runtimes.tools import social

    social.give_social_token("a-social-token")
    assert owner.identity_refusal("datalayer-email") is None
    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    assert owner.identity_refusal("datalayer-email") == owner.NO_MAIL_HERE
    social.give_social_token(None)


def test_a_publication_is_not_ready_without_the_owners_launch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Served with no launch proof: the gate answers no publication, readiness says so."""
    from agent_runtimes.apps import principal
    from agent_runtimes.apps.visitors import sandbox_may_publish

    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    assert principal.kernel_holds_owner_secrets() is True
    assert (
        owner.identity_refusal("datalayer-library-publish")
        == owner.NOT_THE_OWNERS_ASKING
    )
    monkeypatch.setattr("agent_runtimes.apps.enforcement.code_is_running", lambda: True)
    assert sandbox_may_publish("POST", "/api/v1/library/items/x/publish") is False


# --- second review of 1.8.7 ----------------------------------------------------------


@pytest.mark.parametrize(
    "headers",
    [
        {"Origin": "https://evil.example"},
        {"Origin": "null"},
        {"Origin": "http://127.0.0.1:8765"},
        {"Sec-Fetch-Site": "cross-site"},
        {"Sec-Fetch-Mode": "cors"},
    ],
)
def test_a_browsers_page_is_no_skill_even_on_the_loopback(
    headers: dict[str, str], a_persons_runtime: list[dict[str, Any]]
) -> None:
    """A page a person opened on the runtime's own machine reaches the loopback too.

    A skill's script sends no Origin and no fetch metadata; a browser's
    request does. It is refused before any identity is read.
    """
    for method, route, body in (
        ("GET", "/api/v1/owner", None),
        ("GET", "/api/v1/owner/events?agent_id=a", None),
        ("POST", "/api/v1/owner/events", {"agent_id": "a", "title": "t"}),
        ("PATCH", "/api/v1/owner/events/evt-1", {"agent_id": "a", "read": True}),
    ):
        answer = client().request(method, route, json=body, headers=headers)
        assert answer.status_code == 403, (method, route, answer.text)
        assert "browser" in answer.json()["detail"]
        assert "ada@example.org" not in answer.text
    assert a_persons_runtime == []


def test_a_named_agent_that_serves_no_deployment_is_not_ready_on_anothers_principal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A Preview beside a deployment: its readiness never borrows the deployment's identity."""
    from agent_runtimes.apps import enforcement, principal

    monkeypatch.setattr(principal, "a_deployment_is_served", lambda: True)
    monkeypatch.setattr(principal, "deployments_served", lambda: ["dep-1"])
    monkeypatch.setattr(
        "agent_runtimes.models.models._APP_INSTANCES",
        {"shopper": {"deployment_uid": "dep-1"}, "preview": {"app_uid": "app-2"}},
    )
    principal.give_principal_token(
        "dep-1", _principal_token(), expires_in=600, principal_uid="p-1"
    )
    try:
        assert owner.identity_refusal("datalayer-whoami", "shopper") is None
        assert owner.identity_refusal("events", "shopper") is None
        # Named, and serving no deployment: nobody's, whatever else runs here.
        assert owner.identity_refusal("datalayer-whoami", "preview") == owner.NOBODY
        assert owner.identity_refusal("events", "preview") == owner.NOBODY
        # As its route answers while its code runs.
        monkeypatch.setattr(enforcement, "_CODE_RUNNING", [_run_of("preview")])
        refused = client().get("/api/v1/owner")
        assert refused.status_code == 409 and refused.json()["detail"] == owner.NOBODY
        # No agent named: the runtime's only deployment, as before.
        assert owner.identity_refusal("datalayer-whoami") is None
    finally:
        principal.forget_principal_token("dep-1")


def test_a_browsers_page_publishes_nothing_either(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The publication is a write with the owner's token: no page makes it."""
    from agent_runtimes.routes import library

    sent: list[str] = []

    async def publish(url: str, token: str, payload: dict[str, Any]) -> httpx.Response:
        sent.append(url)
        return httpx.Response(200, json={"success": True})

    monkeypatch.setattr(library, "_publish", publish)
    monkeypatch.setenv("DATALAYER_LIBRARY_URL", "https://library.example")
    app = FastAPI()
    app.include_router(library.router, prefix="/api/v1")
    page = TestClient(app, client=("127.0.0.1", 40000))
    refused = page.post(
        "/api/v1/library/items/doc-1/publish",
        json={"item_type": "document", "confirm": True},
        headers={"Origin": "https://evil.example"},
    )
    assert refused.status_code == 403 and "browser" in refused.json()["detail"]
    assert sent == []
