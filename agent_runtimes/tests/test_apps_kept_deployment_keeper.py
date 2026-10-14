# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""What keeps a deployment on its runtime answers its owner alone, and asks again safely.

PAP_DATALAYER's release gates, round 19 (decided 14 October 2026):

- ai-agents' keeper makes a kept runtime's agent with ``POST /api/v1/agents``
  (`deployments.create_agent`). When the answer is lost and it asks again, the
  runtime already serves the deployment and answers that route 404 to anybody
  from outside (`OwnRoutesOnly`): the agent made is read back on the
  application's own route (``GET /api/v1/apps/agents/{agent}/deployment``)
  and kept — never given up on after twelve tries — while a runtime serving
  another deployment, or another version, is a failure at once.
- ``PUT``/``DELETE /api/v1/apps/a2a``, ``POST /api/v1/apps/principal`` and
  that read answer the deployment's owner — the account its principal's
  token held here names — and the pod itself; another signed-in person 403,
  nobody 401.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_apps_kept_deployment_keeper.py -v
```
"""

from __future__ import annotations

from typing import Any, Iterator, List

import httpx
import jwt
import pytest
from agentspecs.apps import APP_CATALOGUE
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.app import create_app
from agent_runtimes.loop.apps import a2a as apps_a2a
from agent_runtimes.loop.apps import callers, plugins, principal
from agent_runtimes.loop.apps.callers import Caller, CallerRefused
from agent_runtimes.loop.apps.deployments import SessionNotStarted, create_agent
from agent_runtimes.loop.apps.principal import (
    OWN_ROUTES_ONLY,
    forget_principal_token,
    give_principal_token,
)
from agent_runtimes.models.models import remember_app_instance
from agent_runtimes.routes import a2a as a2a_routes
from agent_runtimes.routes import acp
from agent_runtimes.routes.apps import NOT_ITS_OWNER
from agent_runtimes.tests.test_apps_a2a import Accounting

AGENT = "accounting"
DEPLOYMENT = "dep-7"
OWNER = "owner-1"
OUTSIDE = ("203.0.113.9", 50000)
STABLE = "https://r1.example/api/ai-agents/v1/apps/deployments/at/demo-accounting/a2a"

#: Tokens as IAM would verify them: the owner's own, the key IAM mints of the
#: owner for its kept runtime (a person's, the owner's uid), another person's,
#: and the deployment's principal's own token.
PEOPLE = {
    "owner-token": Caller(kind="person", uid=OWNER),
    "owner-minted-key": Caller(kind="person", uid=OWNER),
    "another-person": Caller(kind="person", uid="someone-else"),
    "the-principal": Caller(kind="principal", uid="principal-1", app_uid="01APP"),
}


def _principal_token(account_uid: str) -> str:
    """A principal's token as ai-agents hands it: IAM signs it, the runtime reads it."""
    return jwt.encode(
        {"sub": "principal-1", "agent_uid": "principal-1", "account_uid": account_uid},
        "not-the-platforms-secret",
        algorithm="HS256",
    )


@pytest.fixture
def app() -> FastAPI:
    return create_app()


@pytest.fixture
def kept(monkeypatch: Any) -> Iterator[Accounting]:
    """A kept runtime: the deployment's agent made, its principal's token held."""

    async def verify(token: str, app_uid: str = "") -> Caller:
        if token not in PEOPLE:
            raise CallerRefused(401, "The platform does not accept this token.")
        return PEOPLE[token]

    async def ask(deployment_uid: str, bearer: str) -> dict:
        return {
            "access_token": _principal_token(OWNER),
            "expires_in": 3600,
            "principal_uid": "principal-1",
        }

    monkeypatch.setattr(callers.VERIFIER, "verify", verify)
    principal.use_asker(ask)
    agent = Accounting()
    monkeypatch.setitem(acp._agents, AGENT, (agent, None))
    monkeypatch.setattr(plugins, "find_app", lambda app_id: APP_CATALOGUE.get(app_id))
    a2a_routes._a2a_mounts.clear()
    held = (a2a_routes._app, a2a_routes._api_prefix)
    a2a_routes.set_a2a_app(None)
    remember_app_instance(
        AGENT, {"app_uid": "01APP", "deployment_uid": DEPLOYMENT, "version": 3}
    )
    give_principal_token(
        DEPLOYMENT,
        _principal_token(OWNER),
        expires_in=3600,
        principal_uid="principal-1",
    )
    try:
        yield agent
    finally:
        apps_a2a.stop_serving_apps()
        a2a_routes.set_a2a_app(*held)
        remember_app_instance(AGENT, None)
        forget_principal_token(DEPLOYMENT)
        principal.use_asker(None)


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"} if token else {}


# --- the keeper's routes answer the owner alone ----------------------------------


def _keepers_routes(outside: TestClient, token: str) -> List[int]:
    """What each route ai-agents keeps the deployment with answers ``token``."""
    return [
        outside.put(
            "/api/v1/apps/a2a",
            json={"agent": AGENT, "url": STABLE},
            headers=_bearer(token),
        ).status_code,
        outside.post(
            "/api/v1/apps/principal",
            json={"deployment": DEPLOYMENT},
            headers=_bearer(token),
        ).status_code,
        outside.get(
            f"/api/v1/apps/agents/{AGENT}/deployment", headers=_bearer(token)
        ).status_code,
        outside.delete("/api/v1/apps/a2a", headers=_bearer(token)).status_code,
    ]


def test_the_owners_token_and_the_key_minted_of_them_are_answered(
    app: FastAPI, kept: Accounting
) -> None:
    outside = TestClient(app, client=OUTSIDE)
    assert _keepers_routes(outside, "owner-token") == [200, 200, 200, 200]
    assert _keepers_routes(outside, "owner-minted-key") == [200, 200, 200, 200]
    said = outside.get(
        f"/api/v1/apps/agents/{AGENT}/deployment", headers=_bearer("owner-token")
    ).json()
    assert said == {
        "agent": AGENT,
        "app_uid": "01APP",
        "deployment_uid": DEPLOYMENT,
        "version": 3,
    }


def test_another_person_or_the_principal_is_refused_and_nothing_changes(
    app: FastAPI, kept: Accounting
) -> None:
    outside = TestClient(app, client=OUTSIDE)
    outside.put(
        "/api/v1/apps/a2a",
        json={"agent": AGENT, "url": STABLE},
        headers=_bearer("owner-token"),
    )
    assert apps_a2a.served_apps() == [AGENT]
    refused = outside.delete("/api/v1/apps/a2a", headers=_bearer("another-person"))
    assert refused.status_code == 403 and refused.json()["detail"] == NOT_ITS_OWNER
    assert _keepers_routes(outside, "another-person") == [403, 403, 403, 403]
    assert _keepers_routes(outside, "the-principal") == [403, 403, 403, 403]
    assert apps_a2a.served_apps() == [AGENT]


def test_nobody_is_asked_to_say_who_they_are(app: FastAPI, kept: Accounting) -> None:
    outside = TestClient(app, client=OUTSIDE)
    assert _keepers_routes(outside, "") == [401, 401, 401, 401]
    assert _keepers_routes(outside, "a-forged-token") == [401, 401, 401, 401]


def test_a_deployment_no_principal_is_held_for_is_nobodys(
    app: FastAPI, kept: Accounting
) -> None:
    """Its owner is read from its principal's token, never from the caller: none held, none answered."""
    forget_principal_token(DEPLOYMENT)
    outside = TestClient(app, client=OUTSIDE)
    assert _keepers_routes(outside, "owner-token") == [403, 403, 403, 403]


def test_a_deployment_of_another_account_is_not_the_callers(
    app: FastAPI, kept: Accounting
) -> None:
    give_principal_token(
        DEPLOYMENT,
        _principal_token("someone-else"),
        expires_in=3600,
        principal_uid="principal-1",
    )
    outside = TestClient(app, client=OUTSIDE)
    assert _keepers_routes(outside, "owner-token") == [403, 403, 403, 403]
    read = f"/api/v1/apps/agents/{AGENT}/deployment"
    assert outside.get(read, headers=_bearer("another-person")).status_code == 200


# --- asking again after a lost answer --------------------------------------------


class _LostFirstAnswer(httpx.BaseTransport):
    """The runtime, whose first answer to ``POST /api/v1/agents`` is lost on the way.

    The agent is made — its deployment remembered, its principal held — and
    then the connection breaks, as an ingress dropping the answer would.
    """

    def __init__(self, runtime: httpx.BaseTransport, made: dict[str, Any]) -> None:
        self.runtime = runtime
        self.made = made
        self.seen: List[str] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.seen.append(f"{request.method} {request.url.path}")
        if request.url.path == "/api/v1/agents" and len(self.seen) == 1:
            remember_app_instance(AGENT, self.made)
            raise httpx.ReadError("the answer was lost", request=request)
        answered = self.runtime.handle_request(request)
        answered.read()
        return httpx.Response(
            answered.status_code, headers=answered.headers, content=answered.content
        )


def _payload(version: int = 3) -> dict[str, Any]:
    return {
        "name": AGENT,
        "transport": "ag-ui",
        "app_instance": {
            "app_uid": "01APP",
            "deployment_uid": DEPLOYMENT,
            "version": version,
        },
    }


def _create(
    app: FastAPI, made: dict[str, Any], *, token: str = "owner-token", version: int = 3
) -> tuple[str, List[str]]:
    lost = _LostFirstAnswer(TestClient(app, client=OUTSIDE)._transport, made)
    with httpx.Client(transport=lost) as client:
        agent = create_agent(
            ingress="http://testserver",
            token=token,
            payload=_payload(version),
            attempts=12,
            wait_seconds=0,
            client=client,
        )
    return agent, lost.seen


def test_a_lost_answer_asked_again_finds_the_agent_it_made(
    app: FastAPI, kept: Accounting
) -> None:
    remember_app_instance(AGENT, None)
    made = {"app_uid": "01APP", "deployment_uid": DEPLOYMENT, "version": 3}
    agent, seen = _create(app, made)
    assert agent == AGENT
    assert seen == [
        "POST /api/v1/agents",
        "POST /api/v1/agents",
        f"GET /api/v1/apps/agents/{AGENT}/deployment",
    ]


def test_a_runtime_serving_another_version_or_deployment_is_a_failure_at_once(
    app: FastAPI, kept: Accounting
) -> None:
    made = {"app_uid": "01APP", "deployment_uid": DEPLOYMENT, "version": 3}
    with pytest.raises(SessionNotStarted, match="not dep-7 at version 4") as other:
        _create(app, made, version=4)
    assert "serves deployment dep-7 at version 3" in str(other.value)
    give_principal_token(
        "dep-other", _principal_token(OWNER), expires_in=3600, principal_uid="p-2"
    )
    try:
        another = {"app_uid": "01APP", "deployment_uid": "dep-other", "version": 3}
        with pytest.raises(SessionNotStarted, match="dep-other at version 3"):
            _create(app, another)
    finally:
        forget_principal_token("dep-other")


def test_a_lost_answer_asked_again_by_somebody_else_is_not_theirs(
    app: FastAPI, kept: Accounting
) -> None:
    """Refused the read, it is not asked a third time: that refusal does not wait."""
    made = {"app_uid": "01APP", "deployment_uid": DEPLOYMENT, "version": 3}
    lost = _LostFirstAnswer(TestClient(app, client=OUTSIDE)._transport, made)
    with httpx.Client(transport=lost) as client:
        with pytest.raises(SessionNotStarted, match="403") as refused:
            create_agent(
                ingress="http://testserver",
                token="another-person",
                payload=_payload(),
                attempts=12,
                wait_seconds=0,
                client=client,
            )
    assert NOT_ITS_OWNER in str(refused.value)
    assert len(lost.seen) == 3


def test_an_ingress_404_is_still_waited_for_and_given_up_on() -> None:
    """A 404 that is not the runtime's sentence — an ingress not routed yet — is asked again."""
    seen: List[httpx.Request] = []

    def ingress(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(404, json={"detail": "Not Found"})

    with httpx.Client(transport=httpx.MockTransport(ingress)) as client:
        with pytest.raises(SessionNotStarted, match="answered 404"):
            create_agent(
                ingress="http://rt",
                token="owner-token",
                payload=_payload(),
                attempts=3,
                wait_seconds=0,
                client=client,
            )
    assert len(seen) == 3
    assert all(request.method == "POST" for request in seen)


def test_the_runtimes_own_routes_sentence_is_what_is_recognised() -> None:
    """Said by the gate, the agent is looked up; the same 404 without its sentence is not."""
    seen: List[str] = []

    def runtime(request: httpx.Request) -> httpx.Response:
        seen.append(f"{request.method} {request.url.path}")
        if request.method == "POST":
            return httpx.Response(404, json={"detail": OWN_ROUTES_ONLY})
        return httpx.Response(
            200,
            json={"agent": AGENT, "deployment_uid": DEPLOYMENT, "version": 3},
        )

    with httpx.Client(transport=httpx.MockTransport(runtime)) as client:
        assert (
            create_agent(
                ingress="http://rt",
                token="owner-token",
                payload=_payload(),
                wait_seconds=0,
                client=client,
            )
            == AGENT
        )
    assert seen == [
        "POST /api/v1/agents",
        f"GET /api/v1/apps/agents/{AGENT}/deployment",
    ]
    with httpx.Client(transport=httpx.MockTransport(runtime)) as client:
        with pytest.raises(SessionNotStarted, match="this agent serves none"):
            create_agent(
                ingress="http://rt",
                token="owner-token",
                payload={"name": AGENT},
                wait_seconds=0,
                client=client,
            )
