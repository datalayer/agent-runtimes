# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) 2025-2026 Datalayer, Inc.
#
# BSD 3-Clause License

"""Tests for sandbox execute route streaming behavior."""

from __future__ import annotations

import sys
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from agent_runtimes.routes import sandbox as sandbox_route


class _FakeManager:
    def get_agent_sandbox(self, _agent_id):
        return None

    def get_managed_sandbox(self):
        return object()


class _FakeStreamingClient:
    def __init__(self, _sandbox):
        self.variant = "kaggle"

    async def execute_code_streaming_async(
        self, code: str, language: str = "python", timeout=None
    ):
        _ = (code, language, timeout)
        yield SimpleNamespace(line="[kaggle] status: RUNNING", error=False)
        yield SimpleNamespace(line="hello", error=False)
        yield SimpleNamespace(data={"text/plain": "42"}, is_main_result=True, extra={})


class _FakeSyncClient(_FakeStreamingClient):
    async def execute_code_async(
        self, code: str, language: str = "python", timeout=None
    ):
        _ = (code, language, timeout)
        return SimpleNamespace(
            success=True,
            execution_ok=True,
            stdout="hello",
            stderr="",
            results=["42"],
            error=None,
        )


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(sandbox_route.router, prefix="/api/v1")
    return TestClient(app)


def test_execute_route_streaming_aggregates_events(monkeypatch):
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


def test_execute_route_non_streaming_path(monkeypatch):
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
