# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""A runtime launched for a deployment runs what the deployment runs.

Whoever launches such a runtime holds a proof the platform minted for it, and
the principal's token follows from that proof. So what the runtime runs as the
principal is never the launcher's to say: the Appspec, its version and all that
makes the agent come from ai-agents, over the proof, whatever the launcher sent
with the launch, with the agent or to the companion's start hooks.

Launch the tests:

```
$ pytest agent_runtimes/tests/test_apps_deployment_spec_pinned.py -v
```
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any, Dict, Iterator, List

import httpx
import jwt
import pytest
from fastapi.testclient import TestClient

from agent_runtimes.app import create_app
from agent_runtimes.apps import principal
from agent_runtimes.apps.application import Application
from agent_runtimes.guardrails.declared_secrets import launched, note_launched
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes.agents import CreateAgentRequest, create_agent
from agent_runtimes.tests.test_agents_create_integration import (  # noqa: F401 - a fixture
    _DummyRequest,
    creation_spy,
)

AI_AGENTS = "https://ai-agents.test"
DEPLOYMENT = "dep-1"
PINNED = Application("the-deployed", agent="example-simple", version="0.0.3").document
CRAFTED = {**PINNED, "instructions": "Anything the visitor wrote."}


def _proof() -> str:
    return jwt.encode(
        {"sub": "runtime-1", "deployment_uid": DEPLOYMENT},
        "signed-by-the-platform-and-verified-by-ai-agents",
        algorithm="HS256",
    )


class _NoSandbox:
    """No sandbox is started here: what makes the agent is the point."""

    variant = "jupyter-server"

    def configure(self, *_: Any, **__: Any) -> None:
        pass

    def configure_from_url(self, _url: str) -> None:
        pass

    def get_sandbox(self) -> object:
        return object()

    def get_managed_sandbox(self) -> object:
        return object()


@pytest.fixture
def says() -> Dict[str, httpx.Response]:
    """What ai-agents answers in place of the deployment's version, when a test sets ``code``."""
    return {}


@pytest.fixture
def ai_agents(
    monkeypatch: pytest.MonkeyPatch, says: Dict[str, httpx.Response]
) -> Iterator[List[httpx.Request]]:
    """ai-agents on the wire: what it answers a runtime launched for the deployment."""
    asked: List[httpx.Request] = []

    def answer(request: httpx.Request) -> httpx.Response:
        asked.append(request)
        if "code" in says:
            return says["code"]
        if request.url.path.endswith("/principal-token"):
            return httpx.Response(
                200,
                json={
                    "access_token": "the-principals",
                    "expires_in": 3600,
                    "principal_uid": "principal-1",
                },
            )
        return httpx.Response(
            200,
            json={
                "success": True,
                "code": None,
                "spec": PINNED,
                "version": 3,
                "app_uid": "app-1",
                "organization_uid": "",
                "spend_limit": 0.0,
            },
        )

    real = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kwargs: real(transport=httpx.MockTransport(answer), **kwargs),
    )
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _NoSandbox(),
    )
    monkeypatch.setattr(agents_route, "create_shared_sandbox", lambda *_: object())
    monkeypatch.setenv("DATALAYER_AI_AGENTS_URL", AI_AGENTS)
    principal.use_code_reader(None)
    principal.forget_runtime_proof()
    principal.forget_principal_token(DEPLOYMENT)
    yield asked
    principal.forget_runtime_proof()
    principal.forget_principal_token(DEPLOYMENT)
    agents_route._agents.pop("the-deployed", None)
    agents_route._agentspecs.pop("the-deployed", None)


def _visitors_request(**fields: Any) -> CreateAgentRequest:
    return CreateAgentRequest(
        name="the-deployed",
        transport="ag-ui",
        app_spec=CRAFTED,
        app_instance={"app_uid": "app-1", "deployment_uid": DEPLOYMENT, "version": 3},
        **fields,
    )


def _made(request: CreateAgentRequest) -> Dict[str, Any]:
    http = _DummyRequest()
    http.headers = {"Authorization": "Bearer the-visitors"}
    asyncio.run(create_agent(request, http))
    return agents_route._agentspecs["the-deployed"]


def test_a_visitors_spec_does_not_run_as_the_principal(
    ai_agents: List[httpx.Request],
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """The exploit: launched for the deployment, an agent made with a spec of the visitor's."""
    principal.give_runtime_proof(_proof())
    made = _made(_visitors_request())
    assert principal.principal_token(DEPLOYMENT) == "the-principals"
    assert made["app_spec"] == PINNED


def test_nothing_else_the_visitor_sends_makes_the_agent(
    ai_agents: List[httpx.Request],
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """Its Appspec is one field among those that change what runs as the principal."""
    principal.give_runtime_proof(_proof())
    made = _made(
        _visitors_request(
            system_prompt="Anything the visitor wrote.",
            disable_tool_approvals=True,
            enable_codemode=True,
            agent_spec={"id": "visitors", "name": "visitors"},
            selected_mcp_servers=[{"id": "tavily", "origin": "catalog"}],
        )
    )
    assert made["app_spec"] == PINNED
    assert "Anything the visitor wrote." not in str(made)
    assert not made.get("disable_tool_approvals")
    assert made.get("enable_codemode") is False


def test_what_makes_its_record_is_the_deployments_too(
    ai_agents: List[httpx.Request],
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    principal.give_runtime_proof(_proof())
    request = _visitors_request()
    request.app_instance = {
        "app_uid": "another-app",
        "deployment_uid": DEPLOYMENT,
        "organization_uid": "another-organization",
        "woken_by": {"kind": "schedule"},
        "spend_limit": 0.0,
    }
    instance = _made(request)["app_instance"]
    assert instance == {
        "app_uid": "app-1",
        "deployment_uid": DEPLOYMENT,
        "version": 3,
        "woken_by": {"kind": "schedule"},
    }


def test_it_asks_for_the_version_it_is_sent_and_ai_agents_decides(
    ai_agents: List[httpx.Request],
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    principal.give_runtime_proof(_proof())
    _made(_visitors_request())
    read = next(r for r in ai_agents if r.url.path.endswith("/code"))
    assert read.url.params["version"] == "3"
    assert read.headers["authorization"] == "Bearer the-visitors"
    assert read.headers[principal.RUNTIME_PROOF_HEADER] == _proof()


@pytest.mark.parametrize(
    "said",
    [
        (403, {"detail": "Not its runtime."}),
        (200, {"success": True, "code": None}),
        (200, {"success": True, "code": None, "version": 3, "app_uid": "app-1"}),
    ],
    ids=["refused", "an-ai-agents-that-says-only-its-code", "no-spec"],
)
def test_ai_agents_not_saying_it_nothing_is_made_from_what_was_sent(
    says: Dict[str, httpx.Response],
    ai_agents: List[httpx.Request],
    said: Any,
) -> None:
    from fastapi import HTTPException

    says["code"] = httpx.Response(said[0], json=said[1])
    principal.give_runtime_proof(_proof())
    http = _DummyRequest()
    http.headers = {"Authorization": "Bearer the-visitors"}
    with pytest.raises(HTTPException) as refused:
        asyncio.run(create_agent(_visitors_request(), http))
    assert refused.value.status_code == 422
    assert "the-deployed" not in agents_route._agents


def test_launched_for_nothing_the_spec_it_is_sent_runs(
    monkeypatch: pytest.MonkeyPatch,
    ai_agents: List[httpx.Request],
    creation_spy: Dict[str, Any],  # noqa: F811 - the fixture
) -> None:
    """Its owner's own runtime: ai-agents refuses anybody else a principal there."""

    async def no_code(*_: Any) -> None:
        return None

    principal.use_code_reader(no_code)
    assert _made(_visitors_request())["app_spec"] == CRAFTED
    principal.use_code_reader(None)


def test_another_deployments_agent_is_refused_from_the_pod_too(
    ai_agents: List[httpx.Request],
) -> None:
    from fastapi import HTTPException

    principal.give_runtime_proof(_proof())
    http = _DummyRequest()
    http.client = SimpleNamespace(host="127.0.0.1")
    with pytest.raises(HTTPException) as refused:
        asyncio.run(
            create_agent(
                CreateAgentRequest(
                    name="another",
                    app_spec=CRAFTED,
                    app_instance={"deployment_uid": "another", "version": 1},
                ),
                http,
            )
        )
    assert refused.value.status_code == 403
    assert "no other" in str(refused.value.detail)


# --- the companion's start hooks ---------------------------------------------------

#: A spec of the visitor's that declares a secret and starts a server of its choice.
CRAFTED_HOOKS = {
    "schema": "loop.app/v1",
    "id": "web-research",
    "name": "Web Research",
    "kind": "chat",
    "agent": "cog-crawler:0.0.1",
    "connections": [{"server": "tavily:0.0.1"}],
}


@pytest.fixture
def pod(ai_agents: List[httpx.Request]) -> Iterator[TestClient]:
    note_launched(None)
    with TestClient(create_app(), client=("127.0.0.1", 50000)) as client:
        yield client
    note_launched(None)


def _given(pod: TestClient, **fields: Any) -> Dict[str, Any]:
    answered = pod.put(
        "/api/v1/apps/runtime-proof",
        json={"proof": _proof(), "user_token": "the-launchers", **fields},
    )
    assert answered.status_code == 200, answered.text
    return answered.json()


def test_given_its_proof_it_reads_what_it_runs_as_the_launcher(
    pod: TestClient, ai_agents: List[httpx.Request]
) -> None:
    assert _given(pod) == {"success": True, "deployment": DEPLOYMENT}
    read = next(r for r in ai_agents if r.url.path.endswith("/code"))
    assert "version" not in read.url.params
    assert read.headers["authorization"] == "Bearer the-launchers"
    assert principal.launched_app() == (
        PINNED,
        {"app_uid": "app-1", "deployment_uid": DEPLOYMENT, "version": 3},
    )


def test_a_version_its_launch_names_is_asked_for(
    pod: TestClient, ai_agents: List[httpx.Request]
) -> None:
    _given(pod, version=4)
    read = next(r for r in ai_agents if r.url.path.endswith("/code"))
    assert read.url.params["version"] == "4"


def test_a_spec_sent_to_the_hooks_declares_nothing(pod: TestClient) -> None:
    _given(pod)
    names = pod.post(
        "/api/v1/agents/declared-secrets",
        json={"app_spec": CRAFTED_HOOKS, "agent_spec": {"id": "visitors"}},
    ).json()
    assert "TAVILY_API_KEY" not in names["runtime"]


def test_a_spec_sent_to_the_servers_start_is_not_read(pod: TestClient) -> None:
    _given(pod)
    pod.post(
        "/api/v1/agents/mcp-servers/start",
        json={"env_vars": [], "launch_app_spec": CRAFTED_HOOKS},
    )
    declared = launched()
    assert declared is not None and "TAVILY_API_KEY" not in declared.runtime


def test_it_is_configured_from_no_spec(pod: TestClient) -> None:
    _given(pod)
    answered = pod.post(
        "/api/v1/agents/configure-from-spec",
        json={"agent_spec_id": "example-simple", "app_spec": CRAFTED_HOOKS},
    )
    assert answered.status_code == 403
    assert answered.json()["detail"] == principal.DEPLOYMENT_RUNS_ITS_OWN


def test_what_it_runs_not_read_the_hooks_declare_nothing_and_it_says_why(
    says: Dict[str, httpx.Response], pod: TestClient
) -> None:
    says["code"] = httpx.Response(404, json={"detail": "Not found"})
    assert "no code" in _given(pod)["unread"]
    assert principal.launched_app() == (None, None)
    names = pod.post(
        "/api/v1/agents/declared-secrets", json={"app_spec": CRAFTED_HOOKS}
    ).json()
    assert "TAVILY_API_KEY" not in names["runtime"]
