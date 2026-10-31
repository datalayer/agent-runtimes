# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime launched for a deployment proves it to ai-agents, and holds its proof.

The platform mints a proof at the launch and the companion gives it, over the
pod's loopback. It is what ai-agents answers a deployment's principal and code
to, for anybody but its owner; it stays in this process's memory, goes to
ai-agents alone, and puts the runtime behind the application's own routes from
its launch.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_apps_runtime_proof.py -v
```
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Iterator

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.app import create_app
from agent_runtimes.apps import principal
from agent_runtimes.apps.principal import (
    NO_SANDBOX_IN_THIS_PROCESS,
    OWN_ROUTES_ONLY,
    RUNTIME_PROOF_HEADER,
    agent_refused_here,
    forget_runtime_proof,
    give_runtime_proof,
    launched_for,
)

OUTSIDE = ("203.0.113.9", 50000)
POD = ("127.0.0.1", 50000)
AI_AGENTS = "https://ai-agents.test"
DEPLOYMENT = "dep-1"


def _proof(deployment: str = DEPLOYMENT) -> str:
    return jwt.encode(
        {"sub": "runtime-1", "deployment_uid": deployment},
        "signed-by-the-platform-and-verified-by-ai-agents",
        algorithm="HS256",
    )


@pytest.fixture(autouse=True)
def clean(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", AI_AGENTS)
    forget_runtime_proof()
    yield
    forget_runtime_proof()


@pytest.fixture(scope="module")
def app() -> FastAPI:
    return create_app()


def test_only_the_pod_gives_it(app: FastAPI) -> None:
    outside = TestClient(app, client=OUTSIDE).put(
        "/api/v1/apps/runtime-proof", json={"proof": _proof()}
    )
    assert outside.status_code == 403
    assert launched_for() == ""
    pod = TestClient(app, client=POD).put(
        "/api/v1/apps/runtime-proof", json={"proof": _proof()}
    )
    assert pod.status_code == 200, pod.text
    assert pod.json() == {"success": True, "deployment": DEPLOYMENT}
    assert launched_for() == DEPLOYMENT


def test_a_proof_that_names_no_deployment_is_refused(app: FastAPI) -> None:
    pod = TestClient(app, client=POD)
    for proof in ("not-a-token", ""):
        answered = pod.put("/api/v1/apps/runtime-proof", json={"proof": proof})
        assert answered.status_code == 422
    assert launched_for() == ""


def test_it_is_in_no_environment_and_no_answer(app: FastAPI) -> None:
    proof = _proof()
    answered = TestClient(app, client=POD).put(
        "/api/v1/apps/runtime-proof", json={"proof": proof}
    )
    assert proof not in answered.text
    assert proof not in json.dumps(dict(os.environ))
    # The pod itself reads its configuration: its proof is not in it.
    pod = TestClient(app, client=POD)
    for path in ("/api/v1/configure", "/api/v1/configure/models", "/health"):
        assert proof not in pod.get(path).text


def test_it_is_sent_for_its_deployment_to_the_ai_agents_it_knew() -> None:
    proof = _proof()
    give_runtime_proof(proof)
    assert principal._proved(DEPLOYMENT, AI_AGENTS + "/") == {
        RUNTIME_PROOF_HEADER: proof
    }
    assert principal._proved("another", AI_AGENTS) == {}
    assert principal._proved(DEPLOYMENT, "http://127.0.0.1:9999") == {}


def test_a_changed_environment_does_not_change_where_it_goes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    give_runtime_proof(_proof())
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", "http://127.0.0.1:9999")
    assert principal._proved(DEPLOYMENT, "http://127.0.0.1:9999") == {}


class _Answer:
    def __init__(self, status_code: int) -> None:
        self.status_code = status_code


def test_a_refusal_with_no_proof_is_asked_again_once_it_arrives(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(principal, "RUNTIME_PROOF_WAIT", 5.0)
    asked: list[dict[str, str]] = []

    async def ask(headers: dict[str, str]) -> _Answer:
        asked.append(headers)
        return _Answer(200 if headers else 403)

    async def scenario() -> Any:
        async def late() -> None:
            await asyncio.sleep(0.05)
            give_runtime_proof(_proof())

        giving = asyncio.ensure_future(late())
        answer = await principal._asked_with_proof(DEPLOYMENT, AI_AGENTS, ask)
        await giving
        return answer

    assert asyncio.run(scenario()).status_code == 200
    assert len(asked) == 2 and RUNTIME_PROOF_HEADER in asked[1]


def test_a_refusal_with_its_proof_is_not_asked_again() -> None:
    give_runtime_proof(_proof())
    asked: list[dict[str, str]] = []

    async def ask(headers: dict[str, str]) -> _Answer:
        asked.append(headers)
        return _Answer(403)

    answer = asyncio.run(principal._asked_with_proof(DEPLOYMENT, AI_AGENTS, ask))
    assert answer.status_code == 403 and len(asked) == 1


def test_an_owners_answer_waits_for_no_proof(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(principal, "RUNTIME_PROOF_WAIT", 60.0)

    async def ask(headers: dict[str, str]) -> _Answer:
        return _Answer(200)

    answer = asyncio.run(principal._asked_with_proof(DEPLOYMENT, AI_AGENTS, ask))
    assert answer.status_code == 200


def test_launched_for_a_deployment_it_is_behind_the_applications_routes_at_once(
    app: FastAPI,
) -> None:
    """No agent yet: whoever launched it does not get a runtime of their own to configure."""
    outside = TestClient(app, client=OUTSIDE)
    # A runtime launched for nothing is a person's: it answers them.
    assert outside.get("/api/v1/agents").status_code == 200
    give_runtime_proof(_proof())
    for method, path in (
        ("POST", "/api/v1/agents/sandbox/configure"),
        ("PUT", "/api/v1/configure/inference/token"),
        ("GET", "/api/v1/agents"),
        ("POST", "/api/v1/agents/mcp-servers/start"),
        ("POST", "/api/v1/agents/configure-from-spec"),
    ):
        answered = outside.request(method, path, json={})
        assert answered.status_code == 404, (method, path)
        assert answered.json()["detail"] == OWN_ROUTES_ONLY


def test_from_outside_it_makes_its_deployments_agent_and_no_other() -> None:
    give_runtime_proof(_proof())
    assert agent_refused_here(DEPLOYMENT, None) is None
    assert agent_refused_here(DEPLOYMENT, "jupyter-server") is None
    assert "no other" in str(agent_refused_here("another", None))
    assert "no other" in str(agent_refused_here("", None))
    assert agent_refused_here(DEPLOYMENT, "eval") == NO_SANDBOX_IN_THIS_PROCESS


def test_launched_for_nothing_it_refuses_no_agent() -> None:
    assert agent_refused_here("", "eval") is None


def test_the_route_refuses_another_agent_from_outside(app: FastAPI) -> None:
    give_runtime_proof(_proof())
    answered = TestClient(app, client=OUTSIDE).post(
        "/api/v1/agents",
        json={"name": "somebody-elses", "app_instance": {"deployment_uid": "another"}},
    )
    assert answered.status_code == 403
    assert "no other" in answered.json()["detail"]


def test_no_sandbox_runs_in_this_process_asked_from_the_pod_either(
    app: FastAPI,
) -> None:
    """The sandbox shares the pod's loopback: this is what its code would ask."""
    give_runtime_proof(_proof())
    pod = TestClient(app, client=POD)
    for body in (
        {"variant": "eval"},
        {"variant": "jupyter-server", "jupyter_url": "http://127.0.0.1:9999"},
    ):
        answered = pod.post("/api/v1/agents/sandbox/configure", json=body)
        assert answered.status_code == 403, body
        assert answered.json()["detail"] == NO_SANDBOX_IN_THIS_PROCESS
