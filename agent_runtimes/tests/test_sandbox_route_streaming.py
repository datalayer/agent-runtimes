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


def _sse_payloads(body: str) -> list[dict]:
    """The JSON objects carried by an SSE body, in order."""
    import json

    return [
        json.loads(line[len("data: ") :])
        for chunk in body.split("\n\n")
        for line in chunk.splitlines()
        if line.startswith("data: ")
    ]


def test_a2ui_surface_streams_as_the_code_runs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The surface arrives in pieces, not once at the end.

    A2UI is a streaming protocol — the renderer builds the UI incrementally
    from a sequence of messages — and a single POST is the one transport its
    specification calls out as unable to carry that. The demonstration that
    prints a line at a time was therefore invisible until it finished.
    """
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _FakeManager(),
    )
    monkeypatch.setitem(
        sys.modules,
        "code_sandboxes",
        SimpleNamespace(CodeSandboxClient=_FakeStreamingClient),
    )

    response = _build_client().post(
        "/api/v1/sandbox/execute/a2ui",
        json={"code": "print('hello')", "surface_id": "s", "stream": True},
    )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]

    payloads = _sse_payloads(response.text)

    # The surface is created once, before anything has run: the reader sees
    # their code immediately rather than after the last sleep.
    creates = [p for p in payloads if "createSurface" in p]
    assert len(creates) == 1

    # And then updated repeatedly. One update would mean it still arrived in
    # a single lump, which is the bug.
    updates = [p for p in payloads if "updateComponents" in p]
    assert len(updates) > 2

    # The last event says the run is over, so a client is not left inferring
    # it from a closed socket.
    assert payloads[-1].get("done") is True
    assert payloads[-1]["execution"]["stdout"].endswith("hello")

    # Execution snapshots arrive as the run goes, not only at the end.
    #
    # The A2UI surface and the kernel's own outputs are two renderings of one
    # execution, and they read from different parts of this stream. Sending
    # `updateComponents` live and the execution only once left the surface
    # streaming while the Jupyter output sat frozen until the run finished.
    snapshots = [p for p in payloads if "execution" in p and not p.get("done")]
    assert len(snapshots) > 1, "the execution was only sent at the end"
    assert [len(s["execution"]["stdout"]) for s in snapshots] == sorted(
        len(s["execution"]["stdout"]) for s in snapshots
    ), "the snapshots should grow"


def test_the_surface_still_arrives_whole_when_streaming_is_not_asked_for(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The existing callers are untouched."""
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _FakeManager(),
    )
    monkeypatch.setitem(
        sys.modules,
        "code_sandboxes",
        SimpleNamespace(CodeSandboxClient=_FakeSyncClient),
    )

    response = _build_client().post(
        "/api/v1/sandbox/execute/a2ui",
        json={"code": "print('hello')", "surface_id": "s"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    body = response.json()
    assert body["execution"]["stdout"] == "hello"
    assert any("createSurface" in message for message in body["messages"])


def test_a_run_without_an_action_clears_the_previous_one() -> None:
    """The kernel outlives the request, so the name has to be reset.

    Leaving `a2ui_action` alone meant a plain run read whatever button had been
    pressed before it. The interactive demonstration answered "errors: 3" to a
    reader who had pressed nothing — worse than answering nothing, because it
    looks like a considered reply.
    """
    namespace: dict[str, object] = {"a2ui_action": {"name": "errors"}}
    exec(sandbox_route._bind_action("value = a2ui_action", None), namespace)
    assert namespace["value"] is None


def test_an_action_still_arrives_as_data() -> None:
    namespace: dict[str, object] = {}
    exec(
        sandbox_route._bind_action("value = a2ui_action", {"name": "warnings"}),
        namespace,
    )
    assert namespace["value"] == {"name": "warnings"}


class _DottingClient(_FakeStreamingClient):
    """A kernel printing dots side by side, then ending the line."""

    async def execute_code_streaming_async(
        self, code: str, language: str = "python", timeout: int | None = None
    ):
        _ = (code, language, timeout)
        yield SimpleNamespace(line="Mars", error=False, terminated=True)
        for _ in range(6):
            yield SimpleNamespace(line=".", error=False, terminated=False)
        yield SimpleNamespace(line="", error=False, terminated=True)
        yield SimpleNamespace(line="Jupiter", error=False, terminated=True)


def test_dots_printed_side_by_side_stay_on_one_line(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`print(".", end="")` is not a line, and must not become one.

    Output was collected as "lines" and rejoined with newlines, which throws
    away the one fact that distinguishes a finished line from a chunk written
    with `end=""` — and then invents it back. Six dots printed beside each
    other came out as six lines of one dot, which is output no kernel produced.
    """
    monkeypatch.setattr(
        "agent_runtimes.services.code_sandbox_manager.get_code_sandbox_manager",
        lambda: _FakeManager(),
    )
    monkeypatch.setitem(
        sys.modules,
        "code_sandboxes",
        SimpleNamespace(CodeSandboxClient=_DottingClient),
    )

    response = _build_client().post(
        "/api/v1/sandbox/execute/a2ui",
        json={"code": "irrelevant", "surface_id": "s", "stream": True},
    )

    stdout = _sse_payloads(response.text)[-1]["execution"]["stdout"]
    assert stdout == "Mars\n......\nJupiter"
