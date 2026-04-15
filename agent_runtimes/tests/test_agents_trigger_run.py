# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for POST /agents/{agent_id}/trigger/run route behavior."""

from __future__ import annotations

import asyncio
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.adapters.base import BaseAgent
from agent_runtimes.context.identities import get_request_identities
from agent_runtimes.routes import acp as acp_route
from agent_runtimes.routes import agents as agents_route
from agent_runtimes.routes.acp import AgentInfo
from agent_runtimes.routes.agents import OAuthIdentity, TriggerRunRequest, trigger_run


class _DummyRequest:
    def __init__(self, token: str = "") -> None:
        auth = f"Bearer {token}" if token else ""
        self.headers = {"Authorization": auth}


@pytest.fixture(autouse=True)
def _clean_agents_registry() -> None:
    acp_route._agents.clear()
    agents_route._agent_specs.clear()


def test_trigger_run_rejects_malformed_identity_payload_with_422() -> None:
    app = FastAPI()
    app.include_router(agents_route.router, prefix="/api/v1")
    client = TestClient(app)

    response = client.post(
        "/api/v1/agents/some-agent/trigger/run",
        json={
            "source": "once",
            "identities": [
                {"provider": 123, "accessToken": "abc"},
            ],
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_trigger_run_applies_identity_context_for_invoke(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent_id = "trigger-agent"
    acp_route._agents[agent_id] = (
        cast(BaseAgent, object()),
        AgentInfo(id=agent_id, name="Trigger Agent"),
    )

    captured: dict[str, object] = {}

    class _FakeInvoker:
        async def invoke(self, _trigger_config: dict[str, object]) -> None:
            captured["identities"] = get_request_identities()

    fake_invoker = _FakeInvoker()
    monkeypatch.setattr(
        "agent_runtimes.invoker.get_invoker", lambda **_kwargs: fake_invoker
    )

    body = TriggerRunRequest(
        source="once",
        identities=[OAuthIdentity(provider="github", accessToken="gho_123")],
    )

    response = await trigger_run(agent_id, body, _DummyRequest("jwt-token"))
    assert response["success"] is True

    # Let the background task execute.
    await asyncio.sleep(0)

    assert captured["identities"] == [{"provider": "github", "accessToken": "gho_123"}]
    # Identity context should not leak to caller context.
    assert get_request_identities() is None


@pytest.mark.asyncio
async def test_trigger_run_logs_background_invoke_failures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent_id = "trigger-agent-fail"
    acp_route._agents[agent_id] = (
        cast(BaseAgent, object()),
        AgentInfo(id=agent_id, name="Trigger Agent Fail"),
    )

    class _FailingInvoker:
        async def invoke(self, _trigger_config: dict[str, object]) -> None:
            raise RuntimeError("boom")

    monkeypatch.setattr(
        "agent_runtimes.invoker.get_invoker", lambda **_kwargs: _FailingInvoker()
    )

    logger_calls: list[tuple[tuple[object, ...], dict[str, object]]] = []

    def _capture_exception(*args: object, **kwargs: object) -> None:
        logger_calls.append((args, kwargs))

    monkeypatch.setattr(agents_route.logger, "exception", _capture_exception)

    body = TriggerRunRequest(
        source="once",
        identities=[OAuthIdentity(provider="github", accessToken="gho_123")],
    )

    response = await trigger_run(agent_id, body, _DummyRequest())
    assert response["success"] is True

    # Allow task completion + done callback execution.
    await asyncio.sleep(0)
    await asyncio.sleep(0)

    assert len(logger_calls) == 1
    assert "invoker failed" in str(logger_calls[0][0][0]).lower()


@pytest.mark.asyncio
async def test_trigger_run_uses_trigger_from_stored_spec(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent_id = "saas-random-agent-id"
    acp_route._agents[agent_id] = (
        cast(BaseAgent, object()),
        AgentInfo(id=agent_id, name="SaaS Agent"),
    )
    agents_route._agent_specs[agent_id] = {
        "agent_spec_id": "demo-one-trigger",
        "trigger": {
            "type": "once",
            "prompt": "stored-prompt",
            "description": "stored-description",
        },
    }

    captured: dict[str, object] = {}

    class _FakeInvoker:
        async def invoke(self, trigger_config: dict[str, object]) -> None:
            captured["trigger_config"] = trigger_config

    monkeypatch.setattr(
        "agent_runtimes.invoker.get_invoker", lambda **_kwargs: _FakeInvoker()
    )

    response = await trigger_run(agent_id, TriggerRunRequest(), _DummyRequest())
    assert response["success"] is True

    await asyncio.sleep(0)
    assert captured["trigger_config"] == {
        "type": "once",
        "prompt": "stored-prompt",
        "description": "stored-description",
    }


@pytest.mark.asyncio
async def test_trigger_run_falls_back_to_library_spec_by_agent_spec_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent_id = "saas-random-agent-id-2"
    acp_route._agents[agent_id] = (
        cast(BaseAgent, object()),
        AgentInfo(id=agent_id, name="SaaS Agent 2"),
    )
    agents_route._agent_specs[agent_id] = {
        "agent_spec_id": "demo-one-trigger",
    }

    class _SpecObj:
        def __init__(self) -> None:
            self.trigger = {
                "type": "once",
                "prompt": "library-prompt",
                "description": "library-description",
            }

    monkeypatch.setattr(agents_route, "get_library_agent_spec", lambda _id: _SpecObj())

    captured: dict[str, object] = {}

    class _FakeInvoker:
        async def invoke(self, trigger_config: dict[str, object]) -> None:
            captured["trigger_config"] = trigger_config

    monkeypatch.setattr(
        "agent_runtimes.invoker.get_invoker", lambda **_kwargs: _FakeInvoker()
    )

    response = await trigger_run(agent_id, TriggerRunRequest(), _DummyRequest())
    assert response["success"] is True

    await asyncio.sleep(0)
    assert captured["trigger_config"] == {
        "type": "once",
        "prompt": "library-prompt",
        "description": "library-description",
    }
