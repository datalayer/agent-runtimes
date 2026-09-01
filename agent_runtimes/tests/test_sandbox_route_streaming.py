# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Tests for sandbox execute route streaming behavior."""

from __future__ import annotations

import sys
from types import SimpleNamespace
from typing import AsyncGenerator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.routes import sandbox as sandbox_route


class _FakeManager:
    def get_agent_sandbox(self, _agent_id: str) -> None:
        return None

    def get_managed_sandbox(self) -> object:
        return object()


class _FakeStreamingClient:
    def __init__(self, _sandbox: object) -> None:
        self.variant = "kaggle"

    async def execute_code_streaming_async(
        self, code: str, language: str = "python", timeout: int | None = None
    ) -> AsyncGenerator[SimpleNamespace, None]:
        _ = (code, language, timeout)
        yield SimpleNamespace(line="[kaggle] status: RUNNING", error=False)
        yield SimpleNamespace(line="hello", error=False)
        yield SimpleNamespace(data={"text/plain": "42"}, is_main_result=True, extra={})


class _FakeSyncClient(_FakeStreamingClient):
    async def execute_code_async(
        self, code: str, language: str = "python", timeout: int | None = None
    ) -> SimpleNamespace:
        _ = (code, language, timeout)
        return SimpleNamespace(
            success=True,
            execution_ok=True,
            stdout="hello",
            stderr="",
            results=["42"],
            # The mime bundles behind `results`, which is what the A2UI
            # converter draws from. A stub without them is not a
            # `CodeExecutionOutcome`.
            outputs=[
                {
                    "output_type": "execute_result",
                    "data": {"text/plain": "42"},
                    "metadata": {},
                }
            ],
            error=None,
        )


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(sandbox_route.router, prefix="/api/v1")
    return TestClient(app)


def test_execute_route_streaming_aggregates_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _FakeManager(),
    )
    monkeypatch.setitem(
        sys.modules,
        "code_sandboxes",
        SimpleNamespace(CodeSandboxClient=_FakeSyncClient),
    )

    client = _build_client()
    response = client.post(
        "/api/v1/sandbox/execute",
        json={"code": "print('hi')", "stream": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert "status: RUNNING" in payload["stdout"]
    assert "hello" in payload["stdout"]
    assert payload["results"] == ["42"]
    assert payload["variant"] == "kaggle"


def test_execute_route_non_streaming_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _FakeManager(),
    )
    monkeypatch.setitem(
        sys.modules,
        "code_sandboxes",
        SimpleNamespace(CodeSandboxClient=_FakeSyncClient),
    )

    client = _build_client()
    response = client.post(
        "/api/v1/sandbox/execute",
        json={"code": "print('hi')"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["stdout"] == "hello"
    assert payload["results"] == ["42"]


def test_a2ui_execution_uses_the_agents_sandbox(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The surface and Output must come from the agent's Jupyter kernel."""

    class SelectingManager(_FakeManager):
        requested_agent_id: str | None = None

        def get_agent_sandbox(self, agent_id: str) -> object:
            self.requested_agent_id = agent_id
            return object()

    manager = SelectingManager()
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: manager,
    )
    monkeypatch.setitem(
        sys.modules,
        "code_sandboxes",
        SimpleNamespace(CodeSandboxClient=_FakeSyncClient),
    )

    response = _build_client().post(
        "/api/v1/sandbox/execute/a2ui",
        json={
            "code": "display(image)",
            "agent_id": "figure-agent",
            "actions": [{"name": "inspect", "label": "Inspect"}],
        },
    )

    assert response.status_code == 200
    assert manager.requested_agent_id == "figure-agent"
    components = response.json()["messages"][1]["updateComponents"]["components"]
    assert any(component.get("component") == "Button" for component in components)


def test_a2ui_action_binding_exposes_the_event_name() -> None:
    namespace: dict[str, object] = {}

    exec(
        sandbox_route._bind_action(
            "selected = a2ui_action['name']", {"name": "warnings"}
        ),
        namespace,
    )

    assert namespace["selected"] == "warnings"
