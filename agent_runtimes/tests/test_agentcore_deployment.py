# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""An AgentCore runtime that runs a deployment: its application, its sessions recorded.

The server in process, started as AgentCore starts it for a deployment
(``AGENT_RUNTIMES_TARGET=agentcore``, ``AGENTCORE_DEPLOYMENT_UID``): the
deployment's agent made at the first invocation from what ai-agents answers
(`kept_payload`), each invocation run through the application's session
routes, the session recorded under the deployment where it runs
(``{kind: agentcore, arn}``), and resumed from its record on a new microVM —
the person's earlier turns in context, whether they talk in AG-UI runs or in
``{"prompt"}``s.
"""

from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

import pytest
from fastapi.testclient import TestClient

from agent_runtimes.agentcore import contract
from agent_runtimes.agentcore.contract import SESSION_HEADER
from agent_runtimes.agentcore.exchange import PlatformTokens
from agent_runtimes.agentcore.session_ids import session_uid_to_agentcore
from agent_runtimes.apps import opening, plugins, principal, sessions
from agent_runtimes.routes import apps as routes
from agent_runtimes.tests.test_app_sessions import (
    ASSISTANT,
    Runtime,
    Verifier,
    _lets_everybody_in,
    answer_of,
    events_of,
)

ARN = "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/chat_check-Ab12Cd34Ef"
DEPLOYMENT = "dep-ac-1"
UID = "0123456789abcdef0123456789abcdef"
SID = session_uid_to_agentcore(UID)


class Exchange:
    """IAM's exchange: each inbound token is the person it names."""

    async def tokens_for(self, bearer: str) -> PlatformTokens:
        return PlatformTokens(platform=bearer, inference="inf", expires_at=1e12)


@pytest.fixture()
def deployed(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[Tuple[Runtime, List[Dict[str, Any]]]]:
    from reactor import PluginPlatform

    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("AGENT_RUNTIMES_TARGET", "agentcore")
    monkeypatch.setenv("AGENT_SPEC_ID", "cog-crawler")
    monkeypatch.setenv("AGENTCORE_DEPLOYMENT_UID", DEPLOYMENT)
    monkeypatch.setenv("AGENTCORE_RUNTIME_ARN", ARN)
    monkeypatch.setenv("AGENT_RUNTIMES_SESSION_STORE", "record")
    monkeypatch.setattr(plugins, "PLATFORM", PluginPlatform())
    monkeypatch.setattr(routes, "VERIFIER", Verifier())
    monkeypatch.setattr(contract, "runtime_exchange", lambda: Exchange())
    opening.use_opener(_lets_everybody_in)
    read: List[Optional[str]] = []

    async def from_ai_agents(
        deployment: str, version: Optional[int], bearer: Optional[str]
    ) -> Dict[str, Any]:
        read.append(bearer)
        assert (deployment, version) == (DEPLOYMENT, None)
        return {
            "spec": ASSISTANT,
            "code": None,
            "version": 4,
            "app_uid": "app-1",
            "organization_uid": "org-1",
        }

    async def principal_of(deployment: str, bearer: str) -> Dict[str, Any]:
        return {
            "access_token": "p-token",
            "expires_in": 3600,
            "principal_uid": "principal-7",
        }

    monkeypatch.setattr(principal, "_read_from_ai_agents", from_ai_agents)
    principal.use_asker(principal_of)
    principal.forget_principal_token(DEPLOYMENT)
    runtime = Runtime()
    made: List[Dict[str, Any]] = []

    async def make(server: Any, payload: Dict[str, Any], bearer: str) -> None:
        made.append({**payload, "bearer": bearer})
        runtime.make(payload["name"], payload["app_spec"], payload["app_instance"])

    contract.use_deployment_maker(make)
    contract.forget_deployment_agent()
    contract.forget_held()

    async def reader(uid: str, bearer: str) -> List[Dict[str, Any]]:
        return [
            {
                **entry,
                "app_uid": body["app_uid"],
                "session_uid": body["session_uid"],
                "opened_by": body.get("opened_by"),
            }
            for body in runtime.records
            for entry in body["entries"]
            if body["session_uid"] == uid
        ]

    sessions.use_record_reader(reader)
    yield runtime, made
    from agent_runtimes.apps.record import keep_agent_recorder
    from agent_runtimes.routes import agents
    from agent_runtimes.routes.agui import unregister_agui_agent

    for agent_id in list(runtime.models):
        unregister_agui_agent(agent_id)
        agents._agentspecs.pop(agent_id, None)
        keep_agent_recorder(agent_id, None)
    sessions.forget_sessions()
    sessions.use_record_reader(None)
    principal.use_asker(None)
    principal.forget_principal_token(DEPLOYMENT)
    opening.use_opener(None)
    contract.use_deployment_maker(None)
    contract.forget_deployment_agent()
    contract.forget_held()


@pytest.fixture()
def agentcore(deployed: Any) -> Iterator[TestClient]:
    from agent_runtimes.app import create_app

    # AgentCore's data plane, not the pod.
    with TestClient(create_app(), client=("169.254.0.9", 40000)) as client:
        yield client


def as_(person: str) -> Dict[str, str]:
    return {SESSION_HEADER: SID, "Authorization": f"Bearer {person}"}


def run_of(*said: Tuple[str, str]) -> Dict[str, Any]:
    """An AG-UI run as the Studio sends it through ai-agents: the whole conversation."""
    return {
        "threadId": UID,
        "runId": f"run-{len(said)}",
        "state": {},
        "messages": [
            {"id": f"m-{i}", "role": role, "content": text}
            for i, (role, text) in enumerate(said)
        ],
        "tools": [],
        "context": [],
        "forwardedProps": {},
    }


def test_the_deployments_agent_is_made_at_the_first_invocation_and_its_session_recorded(
    deployed: Any, agentcore: TestClient
) -> None:
    runtime, made = deployed
    # Health and the contract answer while a deployment is served.
    assert agentcore.get("/ping").json()["status"] == "Healthy"
    first = events_of(
        agentcore.post("/invocations", headers=as_("ada"), json=run_of(("user", "One")))
    )
    assert answer_of(first).startswith("Heard 1: One")
    # Made once, as the keeper makes a kept deployment's, with the caller's token.
    [payload] = made
    assert payload["bearer"] == "ada"
    assert payload["name"] == "notes-assistant"
    assert payload["app_instance"] == {
        "app_uid": "app-1",
        "deployment_uid": DEPLOYMENT,
        "version": 4,
        "organization_uid": "org-1",
    }
    assert "on AWS AgentCore" in payload["description"]
    second = events_of(
        agentcore.post(
            "/invocations",
            headers=as_("ada"),
            json=run_of(
                ("user", "One"), ("assistant", answer_of(first)), ("user", "Two")
            ),
        )
    )
    assert answer_of(second) == "Heard 2: Two"
    # A loop turn on the same session: a prompt, after the AG-UI runs.
    third = agentcore.post("/invocations", headers=as_("ada"), json={"prompt": "Three"})
    assert third.json() == {"response": "Heard 3: Three", "status": "success"}
    assert len(made) == 1
    # Recorded under the deployment, opened by the person, where it runs.
    bodies = [b for b in runtime.records if b["session_uid"] == UID]
    assert {b["deployment_uid"] for b in bodies} == {DEPLOYMENT}
    assert {b["opened_by"] for b in bodies} == {"ada"}
    [opened] = runtime.entries("session")
    assert opened["payload"]["runs_on"] == {"kind": "agentcore", "arn": ARN}
    assert [e["payload"]["asked"] for e in runtime.entries("turn")][-1] == "Three"
    ends = [e["payload"] for e in runtime.entries("output")]
    assert ends and all(e["invocation"]["target"] == "agentcore" for e in ends)


def test_a_session_is_resumed_from_its_record_on_a_new_microvm(
    deployed: Any, agentcore: TestClient
) -> None:
    runtime, made = deployed
    for text in ("Remember PELICAN", "And this"):
        said = agentcore.post("/invocations", headers=as_("ada"), json={"prompt": text})
        assert said.json()["status"] == "success"
    # A new microVM: nothing of the session or the agent held in this process.
    sessions.forget_sessions()
    contract.forget_held()
    contract.forget_deployment_agent()
    fourth = agentcore.post("/invocations", headers=as_("ada"), json={"prompt": "Four"})
    assert fourth.json() == {"response": "Heard 3: Four", "status": "success"}
    model = runtime.models["notes-assistant"]
    assert model.prompts[-1] == "Four"
    # The record says it resumed, where it runs now.
    resumed = [e for e in runtime.entries("session") if e["payload"].get("resumed")]
    assert len(resumed) == 1
    assert resumed[0]["payload"]["runs_on"] == {"kind": "agentcore", "arn": ARN}
    assert resumed[0]["payload"]["state"] == "open"


def test_another_person_is_not_given_a_recorded_session(
    deployed: Any, agentcore: TestClient
) -> None:
    said = agentcore.post("/invocations", headers=as_("ada"), json={"prompt": "Mine"})
    assert said.json()["status"] == "success"
    sessions.forget_sessions()
    contract.forget_held()
    # Not told the session exists: run as a session of their own, nothing of ada's in it.
    other = agentcore.post("/invocations", headers=as_("bob"), json={"prompt": "Mine?"})
    assert other.json() == {"response": "Heard 1: Mine?", "status": "success"}


def test_a_deployments_runtime_is_invoked_with_a_token(
    deployed: Any, agentcore: TestClient
) -> None:
    refused = agentcore.post(
        "/invocations", headers={SESSION_HEADER: SID}, json={"prompt": "Hi"}
    )
    assert refused.status_code == 401
    assert f"runs deployment {DEPLOYMENT}" in refused.json()["detail"]


def test_a_deployments_runtime_refuses_to_keep_sessions_in_its_files(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A microVM's files go with it: the record store, or the runtime does not start."""
    import asyncio

    from fastapi import FastAPI

    monkeypatch.setenv("AGENT_SPEC_ID", "cog-crawler")
    monkeypatch.setenv("AGENTCORE_DEPLOYMENT_UID", DEPLOYMENT)
    monkeypatch.setenv("AGENT_RUNTIMES_SESSION_STORE", "file")
    with pytest.raises(RuntimeError) as refused:
        asyncio.run(contract.configure_at_start(FastAPI(), "/api/v1"))
    assert "DATALAYER_AI_AGENTS_URL" in str(refused.value)
